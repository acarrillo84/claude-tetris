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
  recordsOnClear(cleared);
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
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = themeColors.highlight;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
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
  recordsOnGameOver();
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
  recordsOnInit();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// ---- Records ----
const MAX_RECORDS = 5;
const MAX_NAME = 12;
const recordsPanel = document.getElementById('records-panel');
let recordsData = recordsLoad();
let combo = 0;
let sessionBestCombo = 0;
let pendingScore = null;   // puntuación esperando nombre
let highlightIdx = -1;

function recordsLoad() {
  const empty = { top: [], bestCombo: 0, maxLines: 0 };
  try {
    const raw = JSON.parse(localStorage.getItem('records'));
    if (!raw || !Array.isArray(raw.top)) return empty;
    return {
      top: raw.top
        .filter(e => e && typeof e.score === 'number' && isFinite(e.score))
        .map(e => ({ name: String(e.name ?? 'Anónimo').slice(0, MAX_NAME), score: e.score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_RECORDS),
      bestCombo: Math.max(0, Number(raw.bestCombo) || 0),
      maxLines: Math.max(0, Number(raw.maxLines) || 0),
    };
  } catch (e) { return empty; }
}

function recordsSave() {
  try { localStorage.setItem('records', JSON.stringify(recordsData)); } catch (e) { /* ignorar */ }
}

function recordsQualifies(s) {
  return s > 0 && (recordsData.top.length < MAX_RECORDS || s > recordsData.top[recordsData.top.length - 1].score);
}

function recordsOnInit() {
  combo = 0;
  sessionBestCombo = 0;
  pendingScore = null;
  highlightIdx = -1;
  recordsPanel.hidden = true;
  restartBtn.textContent = 'Reiniciar';
}

function recordsOnClear(cleared) {
  combo = cleared ? combo + 1 : 0;
  if (combo > sessionBestCombo) sessionBestCombo = combo;
}

function recordsOnGameOver() {
  recordsData.bestCombo = Math.max(recordsData.bestCombo, sessionBestCombo);
  recordsData.maxLines = Math.max(recordsData.maxLines, lines);
  recordsSave();
  pendingScore = recordsQualifies(score) ? score : null;
  highlightIdx = -1;
  restartBtn.textContent = 'Reiniciar';
  recordsRender();
}

function recordsAdd(name) {
  const entry = { name: (name || '').trim().slice(0, MAX_NAME) || 'Anónimo', score: pendingScore };
  pendingScore = null;
  const top = recordsData.top;
  let i = top.findIndex(e => e.score < entry.score);
  if (i === -1) i = top.length;
  top.splice(i, 0, entry);
  top.length = Math.min(top.length, MAX_RECORDS);
  highlightIdx = i;
  recordsSave();
}

function recordsCommitPending() {
  if (pendingScore !== null) recordsAdd('');
}

function recordsEl(tag, text, cls) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (cls) el.className = cls;
  return el;
}

function recordsRender() {
  recordsPanel.hidden = false;
  recordsPanel.replaceChildren();
  recordsPanel.appendChild(recordsEl('h2', 'MEJORES PUNTUACIONES'));

  if (pendingScore !== null) {
    const form = recordsEl('form', undefined, 'records-form');
    const input = recordsEl('input');
    input.type = 'text';
    input.maxLength = MAX_NAME;
    input.placeholder = 'Tu nombre';
    input.setAttribute('aria-label', 'Tu nombre');
    input.autocomplete = 'off';
    const ok = recordsEl('button', 'Guardar');
    ok.type = 'submit';
    form.append(recordsEl('span', '¡Nuevo récord!', 'records-new'), input, ok);
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      recordsAdd(input.value);
      recordsRender();
      restartBtn.focus();
    });
    recordsPanel.appendChild(form);
    input.focus();
  }

  const list = recordsEl('ol', undefined, 'records-list');
  if (!recordsData.top.length) list.appendChild(recordsEl('li', 'Sin récords todavía', 'records-empty'));
  recordsData.top.forEach((e, i) => {
    const li = recordsEl('li', undefined, i === highlightIdx ? 'records-hl' : '');
    li.append(recordsEl('span', e.name, 'records-name'), recordsEl('span', e.score.toLocaleString(), 'records-score'));
    list.appendChild(li);
  });
  recordsPanel.appendChild(list);

  recordsPanel.appendChild(recordsEl('p',
    `Mejor combo: ${recordsData.bestCombo} · Líneas máx.: ${recordsData.maxLines}`, 'records-stats'));

  const clr = recordsEl('button', 'Borrar records', 'records-clear');
  clr.type = 'button';
  clr.addEventListener('click', () => {
    recordsData = { top: [], bestCombo: 0, maxLines: 0 };
    pendingScore = null;
    highlightIdx = -1;
    recordsSave();
    recordsRender();
  });
  recordsPanel.appendChild(clr);
}

function showStartScreen() {
  gameOver = true; // bloquea teclas hasta pulsar Jugar
  overlayTitle.textContent = 'TETRIS';
  overlayScore.textContent = '';
  restartBtn.textContent = 'Jugar';
  overlay.classList.remove('hidden');
  recordsRender();
}
// ---- Fin Records ----

document.addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return; // escribiendo el nombre
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

restartBtn.addEventListener('click', () => { recordsCommitPending(); init(); });

themeToggle.addEventListener('click', () => {
  const isLight = document.documentElement.dataset.theme === 'light';
  applyTheme(isLight ? 'dark' : 'light', true);
  themeToggle.blur(); // evita que Space/Enter vuelvan a activar el switch
});

let savedTheme = null;
try { savedTheme = localStorage.getItem('theme'); } catch (e) { /* ignorar */ }
applyTheme(savedTheme === 'light' ? 'light' : 'dark', false);

showStartScreen();
