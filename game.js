'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - azul pálido
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');

const themeToggle = document.getElementById('theme-toggle');
const themeLabel = document.getElementById('theme-label');
const skinSelect = document.getElementById('skin-select');
const themeColors = { grid: '#22222e', highlight: 'rgba(255,255,255,0.12)' };

function applyTheme(theme, persist) {
  document.documentElement.dataset.theme = theme;
  const isLight = theme === 'light';
  themeToggle.setAttribute('aria-checked', String(isLight));
  themeLabel.textContent = isLight ? 'Modo oscuro' : 'Modo claro';
  themeToggle.setAttribute('aria-label', themeLabel.textContent);
  const styles = getComputedStyle(document.documentElement);
  themeColors.grid = styles.getPropertyValue('--grid').trim();
  themeColors.highlight = styles.getPropertyValue('--highlight').trim();
  if (persist) {
    try { localStorage.setItem('theme', theme); } catch (e) { /* ignorar */ }
  }
  if (typeof current !== 'undefined' && current) {
    draw();
    if (next) drawNext();
  }
}

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.save();
  context.globalAlpha = alpha ?? 1;
  SKINS[currentSkin].draw(context, x * size, y * size, size, SKINS[currentSkin].palette[colorIndex]);
  context.restore(); // restablece globalAlpha, shadowBlur, etc.
}

function drawGrid() {
  ctx.strokeStyle = themeColors.grid;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return; // endGame() ocurrió en este frame: no reprogramar el bucle
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target === skinSelect) { // las teclas del juego no deben operar el selector
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    skinSelect.blur();
  }
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

themeToggle.addEventListener('click', () => {
  const isLight = document.documentElement.dataset.theme === 'light';
  applyTheme(isLight ? 'dark' : 'light', true);
  themeToggle.blur(); // evita que Space/Enter vuelvan a activar el switch
});

let savedTheme = null;
try { savedTheme = localStorage.getItem('theme'); } catch (e) { /* ignorar */ }
applyTheme(savedTheme === 'light' ? 'light' : 'dark', false);

// ---- Skins ----
const SKINS = {
  retro: {
    palette: COLORS,
    draw(ctx, px, py, s, color) {
      ctx.fillStyle = color;
      ctx.fillRect(px + 1, py + 1, s - 2, s - 2);
      ctx.fillStyle = themeColors.highlight;
      ctx.fillRect(px + 1, py + 1, s - 2, 4);
    },
  },
  neon: {
    palette: [null, '#00f0ff', '#fff700', '#d400ff', '#39ff14', '#ff1744', '#4d7cff', '#ff9100'],
    draw(ctx, px, py, s, color) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 3, py + 3, s - 6, s - 6);
      ctx.shadowBlur = 0;
      ctx.globalAlpha *= 0.35;
      ctx.fillStyle = color;
      ctx.fillRect(px + 3, py + 3, s - 6, s - 6);
    },
  },
  pastel: {
    palette: [null, '#a8e6ef', '#fff1a8', '#d8b4f0', '#b7e4c7', '#f7b2b2', '#b5d0f5', '#ffd3a5'],
    draw(ctx, px, py, s, color) {
      const r = s * 0.28;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(px + 1 + r, py + 1);
      ctx.arcTo(px + s - 1, py + 1, px + s - 1, py + s - 1, r);
      ctx.arcTo(px + s - 1, py + s - 1, px + 1, py + s - 1, r);
      ctx.arcTo(px + 1, py + s - 1, px + 1, py + 1, r);
      ctx.arcTo(px + 1, py + 1, px + s - 1, py + 1, r);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; // contorno: contraste sobre fondo claro
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.arc(px + s * 0.32, py + s * 0.32, s * 0.1, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  pixel: {
    palette: [null, '#29b6f6', '#fbc02d', '#8e44ad', '#43a047', '#e53935', '#3f6fd8', '#fb8c00'],
    draw(ctx, px, py, s, color) {
      const u = Math.max(2, Math.floor(s / 10));
      ctx.fillStyle = color;
      ctx.fillRect(px, py, s, s);
      // bisel claro arriba/izquierda, oscuro abajo/derecha
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(px, py, s, u);
      ctx.fillRect(px, py, u, s);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(px, py + s - u, s, u);
      ctx.fillRect(px + s - u, py, u, s);
      // textura de damero
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      for (let i = 1; i < s / u - 1; i++)
        for (let j = 1; j < s / u - 1; j++)
          if ((i + j) % 2 === 0) ctx.fillRect(px + i * u, py + j * u, u, u);
    },
  },
};
let currentSkin = 'retro';

function applySkin(name, persist) {
  if (!SKINS[name]) name = 'retro';
  currentSkin = name;
  document.documentElement.dataset.skin = name;
  skinSelect.value = name;
  const styles = getComputedStyle(document.documentElement);
  themeColors.grid = styles.getPropertyValue('--grid').trim();
  themeColors.highlight = styles.getPropertyValue('--highlight').trim();
  if (persist) {
    try { localStorage.setItem('skin', name); } catch (e) { /* ignorar */ }
  }
  if (typeof current !== 'undefined' && current) {
    draw();
    if (next) drawNext();
  }
}

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value, true);
  skinSelect.blur(); // evita que Space cambie la selección
});

let savedSkin = null;
try { savedSkin = localStorage.getItem('skin'); } catch (e) { /* ignorar */ }
applySkin(savedSkin, false);
// ---- Fin Skins ----

init();
