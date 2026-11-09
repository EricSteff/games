/**
 * Canvas rendering — Game Boy DMG 4-shade green
 */

import { COLS, ROWS, SHAPES } from "./pieces.js";

export const PALETTE = {
  lightest: "#9bbc0f",
  light: "#8bac0f",
  dark: "#306230",
  darkest: "#0f380f",
};

/** Filled blocks use darkest; flash uses light */
const FILL = {
  I: PALETTE.darkest,
  O: PALETTE.darkest,
  T: PALETTE.darkest,
  S: PALETTE.darkest,
  Z: PALETTE.darkest,
  J: PALETTE.darkest,
  L: PALETTE.darkest,
  flash: PALETTE.light,
};

const CELL = 10; // logical pixels

export function drawBoard(canvas, grid) {
  const ctx = canvas.getContext("2d");
  const w = COLS * CELL;
  const h = ROWS * CELL;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;

  ctx.fillStyle = PALETTE.lightest;
  ctx.fillRect(0, 0, w, h);

  // subtle grid
  ctx.strokeStyle = "rgba(15,56,15,0.12)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL + 0.5, 0);
    ctx.lineTo(x * CELL + 0.5, h);
    ctx.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL + 0.5);
    ctx.lineTo(w, y * CELL + 0.5);
    ctx.stroke();
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = grid[r][c];
      if (!v) continue;
      drawBlock(ctx, c * CELL, r * CELL, CELL, FILL[v] || PALETTE.darkest, v === "flash");
    }
  }
}

function drawBlock(ctx, x, y, s, color, flash) {
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, s - 2, s - 2);

  if (!flash) {
    // bevel highlight (GB bricks)
    ctx.fillStyle = PALETTE.dark;
    ctx.fillRect(x + 1, y + 1, s - 2, 1);
    ctx.fillRect(x + 1, y + 1, 1, s - 2);
    ctx.fillStyle = PALETTE.lightest;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(x + 2, y + 2, s - 5, s - 5);
    ctx.globalAlpha = 1;
  }
}

export function drawNext(canvas, type) {
  const ctx = canvas.getContext("2d");
  const cw = 48;
  const ch = 40;
  canvas.width = cw;
  canvas.height = ch;
  ctx.fillStyle = PALETTE.lightest;
  ctx.fillRect(0, 0, cw, ch);
  if (!type) return;

  const shape = SHAPES[type][0];
  let minR = Infinity,
    maxR = -Infinity,
    minC = Infinity,
    maxC = -Infinity;
  for (const [r, c] of shape) {
    minR = Math.min(minR, r);
    maxR = Math.max(maxR, r);
    minC = Math.min(minC, c);
    maxC = Math.max(maxC, c);
  }
  const bw = maxC - minC + 1;
  const bh = maxR - minR + 1;
  const s = 8;
  const ox = Math.floor((cw - bw * s) / 2);
  const oy = Math.floor((ch - bh * s) / 2);
  for (const [r, c] of shape) {
    drawBlock(ctx, ox + (c - minC) * s, oy + (r - minR) * s, s, PALETTE.darkest, false);
  }
}
