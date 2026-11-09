/**
 * Game Boy Tetris (1989) — A-Type rules
 *
 * Scoring: Original Nintendo system
 *   lines: [0, 40, 100, 300, 1200] * (level + 1)
 *   soft drop: +1 per cell on continuous soft drop into lock
 *
 * Level: start 0–9; first rise at startLevel*10+10, then every 10 lines
 * Gravity: frames-per-row table from GB ROM (~59.73 fps)
 * No hard drop, no wall kicks, no lock delay, left-handed NRS
 */

import { COLS, ROWS, SHAPES, getCells, spawnPos, nextRandom } from "./pieces.js";

/** Frames per row by level (Game Boy table) */
export const FRAMES_PER_ROW = [
  53, 49, 45, 41, 37, 33, 28, 22, 17, 11, 10, 9, 8, 7, 6, 6, 5, 5, 4, 4, 3,
];

export const FPS = 59.73;
export const LINE_CLEAR_FRAMES = 20; // simplified (real ~93 with ARE); still readable
export const DAS_DELAY_FRAMES = 24;
export const DAS_REPEAT_FRAMES = 9; // ~1/9G
export const SOFT_DROP_FRAMES = 3; // 1/3G

const LINE_BASE = [0, 40, 100, 300, 1200];

export class GameBoyTetris {
  constructor() {
    this.reset(0);
  }

  reset(startLevel = 0) {
    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    this.startLevel = Math.max(0, Math.min(9, startLevel | 0));
    this.level = this.startLevel;
    this.lines = 0;
    this.score = 0;
    this.gameOver = false;
    this.paused = false;
    this.clearing = null; // { rows: number[], timer }
    this.softDropCells = 0;
    this.prevType = null;
    this.nextType = nextRandom(null);
    this.piece = null;
    this.spawn();
  }

  framesPerRow() {
    const lv = Math.min(20, Math.max(0, this.level));
    return FRAMES_PER_ROW[lv] ?? 3;
  }

  dropMs() {
    return (this.framesPerRow() / FPS) * 1000;
  }

  softDropMs() {
    return (SOFT_DROP_FRAMES / FPS) * 1000;
  }

  dasDelayMs() {
    return (DAS_DELAY_FRAMES / FPS) * 1000;
  }

  dasRepeatMs() {
    return (DAS_REPEAT_FRAMES / FPS) * 1000;
  }

  spawn() {
    const type = this.nextType;
    this.prevType = type;
    this.nextType = nextRandom(type);
    const pos = spawnPos(type);
    this.piece = { type, rot: 0, row: pos.row, col: pos.col };
    this.softDropCells = 0;

    if (!this.valid(this.piece)) {
      this.gameOver = true;
      this.piece = null;
      return false;
    }
    return true;
  }

  cellsOf(p = this.piece) {
    if (!p) return [];
    return getCells(p.type, p.rot, p.row, p.col);
  }

  valid(p) {
    for (const { row, col } of this.cellsOf(p)) {
      if (col < 0 || col >= COLS || row >= ROWS) return false;
      if (row < 0) continue;
      if (this.board[row][col]) return false;
    }
    return true;
  }

  tryMove(dr, dc) {
    if (!this.piece || this.gameOver || this.paused || this.clearing) return false;
    const n = { ...this.piece, row: this.piece.row + dr, col: this.piece.col + dc };
    if (!this.valid(n)) return false;
    this.piece = n;
    return true;
  }

  /** Counter-clockwise (Game Boy A/B rotate) */
  tryRotate() {
    if (!this.piece || this.gameOver || this.paused || this.clearing) return false;
    const nStates = SHAPES[this.piece.type].length;
    if (nStates <= 1) return false;
    const n = { ...this.piece, rot: (this.piece.rot + 1) % nStates };
    if (!this.valid(n)) return false;
    this.piece = n;
    return true;
  }

  gravityStep() {
    if (!this.piece || this.gameOver || this.paused || this.clearing) {
      return { locked: false };
    }
    if (this.tryMove(1, 0)) return { locked: false, moved: true };
    return this.lock();
  }

  softDropStep() {
    if (!this.piece || this.gameOver || this.paused || this.clearing) {
      return { locked: false };
    }
    if (this.tryMove(1, 0)) {
      this.softDropCells += 1;
      return { locked: false, moved: true };
    }
    return this.lock();
  }

  lock() {
    if (!this.piece) return { locked: false };

    // Soft drop points (GB: continuous soft into lock)
    this.score += this.softDropCells;
    this.softDropCells = 0;

    for (const { row, col } of this.cellsOf()) {
      if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
        this.board[row][col] = this.piece.type;
      }
    }
    this.piece = null;

    const full = [];
    for (let r = 0; r < ROWS; r++) {
      if (this.board[r].every((c) => c)) full.push(r);
    }

    if (full.length) {
      this.clearing = { rows: full, timer: LINE_CLEAR_FRAMES };
      return { locked: true, pendingClear: full.length };
    }

    if (!this.spawn()) {
      return { locked: true, cleared: 0, gameOver: true };
    }
    return { locked: true, cleared: 0 };
  }

  /** Call each frame while clearing */
  tickClear() {
    if (!this.clearing) return null;
    this.clearing.timer -= 1;
    if (this.clearing.timer > 0) return { animating: true };

    const n = this.clearing.rows.length;
    // remove bottom-up
    const remove = new Set(this.clearing.rows);
    this.board = this.board.filter((_, r) => !remove.has(r));
    while (this.board.length < ROWS) {
      this.board.unshift(Array(COLS).fill(0));
    }
    this.clearing = null;

    this.addLineScore(n);
    this.lines += n;
    this.updateLevel();

    if (!this.spawn()) {
      return { cleared: n, gameOver: true };
    }
    return { cleared: n };
  }

  addLineScore(n) {
    const base = LINE_BASE[n] ?? 0;
    this.score += base * (this.level + 1);
    if (this.score > 999999) this.score = 999999;
  }

  /**
   * A-Type level progression:
   * first transition at startLevel*10+10, then every 10 lines
   */
  updateLevel() {
    const first = this.startLevel * 10 + 10;
    let target = this.startLevel;
    if (this.lines >= first) {
      target = this.startLevel + 1 + Math.floor((this.lines - first) / 10);
    }
    this.level = Math.min(20, target);
  }

  /** Board with active piece overlaid for rendering */
  renderGrid() {
    const g = this.board.map((row) => row.slice());
    if (this.piece) {
      for (const { row, col } of this.cellsOf()) {
        if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
          g[row][col] = this.piece.type;
        }
      }
    }
    // Flash clearing rows
    if (this.clearing && this.clearing.timer % 4 < 2) {
      for (const r of this.clearing.rows) {
        for (let c = 0; c < COLS; c++) g[r][c] = "flash";
      }
    }
    return g;
  }
}
