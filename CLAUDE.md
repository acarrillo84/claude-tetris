# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Classic Tetris in vanilla JavaScript + HTML5 Canvas. No dependencies, no `package.json`, no build step, no linter, no test suite. User-facing text (UI labels, overlay messages, README) is in Spanish — keep new strings consistent with that.

## Running

Open `index.html` directly, or serve the directory statically (recommended):

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

There are no automated tests; verify changes by playing in the browser.

## Architecture

Three files: `index.html` (DOM: `#board` canvas, side panel with HUD + `#next-canvas`, `#overlay` for pause/game over), `style.css` (dark retro theme), and `game.js` (all logic, a single non-module script with global state).

Key points in `game.js` that span multiple functions:

- **Cell values double as color indices.** `PIECES[type]` matrices store the piece's type number (1–7) in filled cells, and `board[r][c]` stores the same value after `merge()`. `drawBlock` looks up `COLORS[value]`. Index 0 / `null` means empty. Adding a piece type means adding to both `PIECES` and `COLORS` with matching indices, and updating the `* 7` in `randomPiece()`.
- **Collision is the single source of truth** for movement: `collide(shape, x, y)` is used by left/right moves, gravity, soft/hard drop, rotation wall kicks (`tryRotate` tries x offsets `0, -1, 1, -2, 2`), the ghost piece (`ghostY`), and game-over detection in `spawn()`. Cells with `y < 0` are allowed (above the board).
- **Piece lifecycle:** `lockPiece()` → `merge()` → `clearLines()` (updates score/lines/level/`dropInterval`) → `spawn()` (promotes `next` to `current`, rolls a new `next`, calls `endGame()` if the new piece collides immediately).
- **Game loop:** `loop()` runs on `requestAnimationFrame`, accumulating `dt` into `dropAccum` and applying gravity when it exceeds `dropInterval`. Pause and game over stop the loop via `cancelAnimationFrame(animId)`; resuming resets `lastTime` before restarting. `init()` fully resets state and is also the restart button handler.
- **Rendering** redraws everything each frame: grid → locked board → ghost (`alpha 0.2`) → current piece. The next-piece preview (`drawNext`) is drawn only on `spawn()` and assumes a 4×4 grid of 30px cells (matching the 120×120 `#next-canvas`).

- **Theming:** colors live in CSS variables (`:root` = dark, `[data-theme="light"]` = light) in `style.css`. `applyTheme()` in `game.js` sets `data-theme` on `<html>`, persists to `localStorage('theme')`, and caches `--grid`/`--highlight` into `themeColors` for canvas drawing (canvas doesn't inherit CSS). Default is dark. The header toggle (`#theme-toggle`) blurs after click so Space doesn't re-trigger it.

## Gotchas

- `COLS × BLOCK` and `ROWS × BLOCK` must match the `width`/`height` attributes of `<canvas id="board">` in `index.html` (currently 300×600). Changing board constants requires editing both.
- Scoring: `LINE_SCORES[cleared] * level`; soft drop +1 per row, hard drop +2 per row. Level = `floor(lines / 10) + 1`; `dropInterval = max(100, 1000 - (level - 1) * 90)`.
