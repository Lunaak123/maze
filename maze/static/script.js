const canvasTop = document.getElementById('canvas-top');
const ctxTop = canvasTop.getContext('2d');
const canvasBottom = document.getElementById('canvas-bottom');
const ctxBottom = document.getElementById('canvas-bottom').getContext('2d');

const statusTop = document.getElementById('status-top');
const statusBottom = document.getElementById('status-bottom');

const modal = document.getElementById('game-over-modal');
const winnerText = document.getElementById('winner-text');
const restartBtn = document.getElementById('restart-btn');

let mazeData = null;
let cellSize = 10;
let gameOver = false;

// Player 1 is Bottom (Black Dot)
// Player 2 is Top (White Dot with Black Border)
let p1 = { x: 1, y: 1, color: "#222", type: "fill" };
let p2 = { x: 1, y: 1, color: "#fff", borderColor: "#222", type: "stroke" };

// JS Fallback maze generator
function generateMazeJS(width, height) {
    if (width % 2 === 0) width++;
    if (height % 2 === 0) height++;
    width = Math.max(5, width);
    height = Math.max(5, height);

    let maze = Array.from({ length: height }, () => Array(width).fill(1));
    let start_x = 1, start_y = 1;
    let stack = [{ x: start_x, y: start_y }];
    maze[start_y][start_x] = 0;

    let directions = [
        { dx: 2, dy: 0 },
        { dx: -2, dy: 0 },
        { dx: 0, dy: 2 },
        { dx: 0, dy: -2 }
    ];

    while (stack.length > 0) {
        let current = stack[stack.length - 1];
        let x = current.x, y = current.y;

        directions.sort(() => Math.random() - 0.5);

        let carved = false;
        for (let dir of directions) {
            let nx = x + dir.dx;
            let ny = y + dir.dy;
            if (nx >= 1 && nx < width - 1 && ny >= 1 && ny < height - 1 && maze[ny][nx] === 1) {
                maze[y + dir.dy / 2][x + dir.dx / 2] = 0;
                maze[ny][nx] = 0;
                stack.push({ x: nx, y: ny });
                carved = true;
                break;
            }
        }

        if (!carved) {
            stack.pop();
        }
    }

    let end_x = width - 2, end_y = height - 2;

    return {
        maze: maze,
        width: width,
        height: height,
        start: { x: start_x, y: start_y },
        end: { x: end_x, y: end_y }
    };
}

async function fetchMaze() {
    try {
        const response = await fetch('/api/maze?width=25&height=35');
        if (!response.ok) throw new Error("Network response was not ok");
        mazeData = await response.json();
    } catch (e) {
        console.warn("Failed to fetch maze from API, falling back to local JS generation:", e);
        mazeData = generateMazeJS(25, 35);
    }
    initGame();
}

function initGame() {
    gameOver = false;
    modal.classList.add("hidden");
    
    // Player 1 starts at Top-Left, needs to go to Bottom-Right
    p1.x = mazeData.start.x;
    p1.y = mazeData.start.y;
    
    // Player 2 starts at Bottom-Right, needs to go to Top-Left
    p2.x = mazeData.end.x;
    p2.y = mazeData.end.y;
    
    statusTop.innerText = "Player 2: Go!";
    statusBottom.innerText = "Player 1: Go!";

    draw();
}

function resizeCanvases() {
    if (!mazeData) return;

    // Use available screen space efficiently
    const containerWidth = window.innerWidth * 0.95;
    // We want the canvases to only take up about 35-40% of the screen height max, so controls fit
    const containerHeight = window.innerHeight * 0.35; 
    
    const sizeByWidth = containerWidth / mazeData.width;
    const sizeByHeight = containerHeight / mazeData.height;
    
    cellSize = Math.floor(Math.min(sizeByWidth, sizeByHeight));
    
    const cw = cellSize * mazeData.width;
    const ch = cellSize * mazeData.height;
    
    canvasTop.width = cw;
    canvasTop.height = ch;
    canvasBottom.width = cw;
    canvasBottom.height = ch;
    
    drawMazeWithPlayers();
}

window.addEventListener('resize', resizeCanvases);

function drawMaze(ctx) {
    if (!mazeData) return;
    
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    for (let y = 0; y < mazeData.height; y++) {
        for (let x = 0; x < mazeData.width; x++) {
            if (mazeData.maze[y][x] === 1) {
                ctx.fillStyle = "#ffadc2"; // Soft pink walls
                ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
            }
        }
    }
    
    // Draw Start (Player 1's starting point, Player 2's goal)
    ctx.fillStyle = "#ffeb99"; // Yellowish start
    ctx.fillRect(mazeData.start.x * cellSize, mazeData.start.y * cellSize, cellSize, cellSize);
    
    // Draw End (Player 2's starting point, Player 1's goal)
    ctx.fillStyle = "#99ffb3"; // Greenish end
    ctx.fillRect(mazeData.end.x * cellSize, mazeData.end.y * cellSize, cellSize, cellSize);
}

function drawPlayer(ctx, player) {
    const px = player.x * cellSize + cellSize / 2;
    const py = player.y * cellSize + cellSize / 2;
    const radius = cellSize * 0.4;
    
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    
    if (player.type === "fill") {
        ctx.fillStyle = player.color;
        ctx.fill();
    } else {
        ctx.fillStyle = player.color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = player.borderColor;
        ctx.stroke();
    }
}

function drawMazeWithPlayers() {
    if (!mazeData) return;
    
    // Top canvas is for Player 2 only
    drawMaze(ctxTop);
    drawPlayer(ctxTop, p2); 
    
    // Bottom canvas is for Player 1 only
    drawMaze(ctxBottom);
    drawPlayer(ctxBottom, p1);
}

function draw() {
    resizeCanvases();
}

function movePlayer(playerNum, dir) {
    if (gameOver || !mazeData) return;
    
    let p = playerNum === 1 ? p1 : p2;
    
    let newX = p.x;
    let newY = p.y;
    
    if (dir === 'up') newY--;
    if (dir === 'down') newY++;
    if (dir === 'left') newX--;
    if (dir === 'right') newX++;
    
    if (mazeData.maze[newY][newX] === 0) {
        p.x = newX;
        p.y = newY;
        drawMazeWithPlayers();
        checkWin(playerNum);
    }
}

function checkWin(playerNum) {
    let p = playerNum === 1 ? p1 : p2;
    
    let won = false;
    if (playerNum === 1 && p.x === mazeData.end.x && p.y === mazeData.end.y) {
        won = true;
    } else if (playerNum === 2 && p.x === mazeData.start.x && p.y === mazeData.start.y) {
        won = true;
    }
    
    if (won) {
        gameOver = true;
        stopMoving(1);
        stopMoving(2);
        
        let winnerName = playerNum === 1 ? "Player 1 (Black Dot)" : "Player 2 (White Dot)";
        winnerText.innerText = `${winnerName} Wins! 🎉`;
        modal.classList.remove("hidden");
    }
}

// Tracking movement state to allow simultaneous continuous inputs
let player1MoveInterval = null;
let player2MoveInterval = null;
let player1MoveDir = null;
let player2MoveDir = null;
const MOVE_SPEED_MS = 120; // Time between continuous moves in ms

function startMoving(playerNum, dir) {
    if (gameOver || !mazeData) return;
    
    // Move once immediately
    movePlayer(playerNum, dir);
    
    // Clear any existing movement for this player
    stopMoving(playerNum);
    
    // Set up continuous loop
    let intervalId = setInterval(() => {
        movePlayer(playerNum, dir);
    }, MOVE_SPEED_MS);
    
    if (playerNum === 1) {
        player1MoveInterval = intervalId;
        player1MoveDir = dir;
    } else {
        player2MoveInterval = intervalId;
        player2MoveDir = dir;
    }
}

function stopMoving(playerNum, dir = null) {
    if (playerNum === 1) {
        if (dir === null || player1MoveDir === dir) {
            clearInterval(player1MoveInterval);
            player1MoveInterval = null;
            player1MoveDir = null;
        }
    } else {
        if (dir === null || player2MoveDir === dir) {
            clearInterval(player2MoveInterval);
            player2MoveInterval = null;
            player2MoveDir = null;
        }
    }
}

// Controls Setup
function setupControls(playerNum, isTop) {
    const containerName = isTop ? '.top-player' : '.bottom-player';
    const container = document.querySelector(containerName);
    const buttons = container.querySelectorAll('.d-pad');
    
    buttons.forEach(btn => {
        // Handle touch holding
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Prevents mouse emulation and double tapping
            startMoving(playerNum, btn.dataset.dir);
        }, {passive: false});
        
        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            stopMoving(playerNum, btn.dataset.dir);
        }, {passive: false});
        
        btn.addEventListener('touchcancel', (e) => {
            stopMoving(playerNum, btn.dataset.dir);
        }, {passive: false});
        
        // Mouse fallback for desktop testing
        btn.addEventListener('pointerdown', (e) => {
            if(e.pointerType === 'mouse') {
                startMoving(playerNum, btn.dataset.dir);
                
                // Allow releasing outside the button to stop
                const stopFunc = () => {
                    stopMoving(playerNum, btn.dataset.dir);
                    document.removeEventListener('pointerup', stopFunc);
                };
                document.addEventListener('pointerup', stopFunc);
            }
        });
    });
}

setupControls(2, true);  // Top player (Player 2)
setupControls(1, false); // Bottom player (Player 1)

restartBtn.addEventListener('click', () => {
    fetchMaze();
});

// Track which keys are currently held to avoid OS pause
let keysPressed = {};

window.addEventListener('keydown', (e) => {
    if (keysPressed[e.key]) return; // Stop OS repeat events 
    keysPressed[e.key] = true;
    
    // Player 1 - Arrow keys
    if (e.key === 'ArrowUp') startMoving(1, 'up');
    if (e.key === 'ArrowDown') startMoving(1, 'down');
    if (e.key === 'ArrowLeft') startMoving(1, 'left');
    if (e.key === 'ArrowRight') startMoving(1, 'right');
    
    // Player 2 - WASD (W is internal 'up', moving away from P2 on canvas)
    if (e.key === 'w' || e.key === 'W') startMoving(2, 'up');
    if (e.key === 's' || e.key === 'S') startMoving(2, 'down');
    if (e.key === 'a' || e.key === 'A') startMoving(2, 'left');
    if (e.key === 'd' || e.key === 'D') startMoving(2, 'right');
});

window.addEventListener('keyup', (e) => {
    keysPressed[e.key] = false;
    
    // Player 1
    if (e.key === 'ArrowUp') stopMoving(1, 'up');
    if (e.key === 'ArrowDown') stopMoving(1, 'down');
    if (e.key === 'ArrowLeft') stopMoving(1, 'left');
    if (e.key === 'ArrowRight') stopMoving(1, 'right');
    
    // Player 2
    if (e.key === 'w' || e.key === 'W') stopMoving(2, 'up');
    if (e.key === 's' || e.key === 'S') stopMoving(2, 'down');
    if (e.key === 'a' || e.key === 'A') stopMoving(2, 'left');
    if (e.key === 'd' || e.key === 'D') stopMoving(2, 'right');
});

// Initialize
fetchMaze();
