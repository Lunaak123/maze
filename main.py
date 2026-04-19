from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import random
import os
import string
import json

app = FastAPI()

# Create static dir if it doesn't exist
static_dir = os.path.join(os.path.dirname(__file__), "static")
if not os.path.exists(static_dir):
    os.makedirs(static_dir)

app.mount("/static", StaticFiles(directory=static_dir), name="static")

class MazeResponse(BaseModel):
    maze: list[list[int]]
    width: int
    height: int
    start: dict
    end: dict

class CreateRoomRequest(BaseModel):
    password: str
    difficulty: str

class CreateRoomResponse(BaseModel):
    room_id: str

rooms = {}

def generate_maze_logic(width: int, height: int):
    if width % 2 == 0: width += 1
    if height % 2 == 0: height += 1
        
    width = max(5, width)
    height = max(5, height)

    maze = [[1] * width for _ in range(height)]
    
    start_x, start_y = 1, 1
    stack = [(start_x, start_y)]
    maze[start_y][start_x] = 0

    while stack:
        x, y = stack[-1]

        directions = [(2, 0), (-2, 0), (0, 2), (0, -2)]
        random.shuffle(directions)
        
        carved = False
        for dx, dy in directions:
            nx, ny = x + dx, y + dy
            if 1 <= nx < width - 1 and 1 <= ny < height - 1 and maze[ny][nx] == 1:
                maze[y + dy // 2][x + dx // 2] = 0
                maze[ny][nx] = 0
                stack.append((nx, ny))
                carved = True
                break
        
        if not carved:
            stack.pop()
            
    end_x, end_y = width - 2, height - 2
    
    return {
        "maze": maze,
        "width": width,
        "height": height,
        "start": {"x": start_x, "y": start_y},
        "end": {"x": end_x, "y": end_y}
    }

@app.get("/", response_class=HTMLResponse)
async def get_index():
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            return f.read()
    return "<h1>Frontend not found</h1>"

@app.get("/api/maze", response_model=MazeResponse)
async def generate_maze(width: int = 15, height: int = 21):
    return generate_maze_logic(width, height)

@app.post("/api/create_room", response_model=CreateRoomResponse)
async def create_room(req: CreateRoomRequest):
    room_id = ''.join(random.choices(string.ascii_uppercase + string.digits, k=5))
    while room_id in rooms:
        room_id = ''.join(random.choices(string.ascii_uppercase + string.digits, k=5))
        
    rooms[room_id] = {
        "password": req.password,
        "difficulty": req.difficulty,
        "sockets": [],
        "roles": {},
        "maze_data": None
    }
    return CreateRoomResponse(room_id=room_id)

@app.websocket("/ws/play/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    await websocket.accept()
    
    if room_id not in rooms:
        await websocket.send_json({"type": "error", "message": "Room not found"})
        await websocket.close()
        return

    room = rooms[room_id]
    
    if len(room["sockets"]) >= 2:
        await websocket.send_json({"type": "error", "message": "Room is full"})
        await websocket.close()
        return

    try:
        data = await websocket.receive_text()
        auth_data = json.loads(data)
        if auth_data.get("type") != "auth" or auth_data.get("password") != room["password"]:
            await websocket.send_json({"type": "error", "message": "Incorrect password"})
            await websocket.close()
            return
            
        room["sockets"].append(websocket)
        player_num = len(room["sockets"])
        room["roles"][websocket] = player_num
        
        await websocket.send_json({"type": "connected", "player_num": player_num})

        if player_num == 2:
            diff = room["difficulty"]
            w, h = 15, 21
            if diff == "medium":
                w, h = 25, 35
            elif diff == "hard":
                w, h = 35, 51

            room["maze_data"] = generate_maze_logic(w, h)
            for ws in room["sockets"]:
                await ws.send_json({"type": "start", "maze_data": room["maze_data"]})
        
        while True:
            data = await websocket.receive_text()
            move_data = json.loads(data)
            
            if move_data.get("type") == "move":
                for ws in room["sockets"]:
                    if ws != websocket:
                        await ws.send_json({
                            "type": "move", 
                            "player_num": player_num, 
                            "x": move_data["x"], 
                            "y": move_data["y"]
                        })

    except WebSocketDisconnect:
        if websocket in room["sockets"]:
            room["sockets"].remove(websocket)
            if websocket in room["roles"]:
                del room["roles"][websocket]
        
        for ws in room["sockets"]:
            try:
                await ws.send_json({"type": "error", "message": "Partner disconnected 💔"})
            except:
                pass
        
        if len(room["sockets"]) == 0 and room_id in rooms:
            del rooms[room_id]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
