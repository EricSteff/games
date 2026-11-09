/* Canvas drawing for the well, hold box, and next queue. */
(function (global) {
  "use strict";

  const T = global.ModernTetris;
  const sparks = [];

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function fit(canvas) {
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (cssW < 2 || cssH < 2) return null;
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    const pxW = Math.round(cssW * dpr);
    const pxH = Math.round(cssH * dpr);
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: cssW, h: cssH };
  }

  function block(ctx, px, py, size, color, mode) {
    const inset = Math.max(1, size * 0.08);
    const radius = size * 0.22;
    ctx.save();
    if (mode === "ghost") {
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.25, size * 0.07);
      roundRect(ctx, px + inset, py + inset, size - inset * 2, size - inset * 2, radius);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (mode === "dim") ctx.globalAlpha = 0.35;
    roundRect(ctx, px + inset * 0.35, py + inset * 0.35, size - inset, size - inset, radius);
    ctx.fillStyle = mode === "flash" ? "#f4fbff" : color;
    ctx.fill();
    roundRect(ctx, px + inset, py + inset, size - inset * 2, (size - inset * 2) * 0.42, radius * 0.7);
    ctx.fillStyle = "rgba(255,255,255,.4)";
    ctx.fill();
    ctx.restore();
  }

  function paintCells(ctx, cells, originX, originY, size, color, mode) {
    for (let i = 0; i < cells.length; i++) {
      block(ctx, originX + cells[i][0] * size, originY + cells[i][1] * size, size, color, mode);
    }
  }

  function drawPieceBox(ctx, id, x, y, w, h, mode) {
    const cells = T.SHAPES[id][0];
    let minX = 4;
    let minY = 4;
    let maxX = 0;
    let maxY = 0;
    for (let i = 0; i < cells.length; i++) {
      minX = Math.min(minX, cells[i][0]);
      minY = Math.min(minY, cells[i][1]);
      maxX = Math.max(maxX, cells[i][0]);
      maxY = Math.max(maxY, cells[i][1]);
    }
    const cols = maxX - minX + 1;
    const rows = maxY - minY + 1;
    const size = Math.min(w / cols, h / rows) * 0.78;
    const ox = x + (w - cols * size) / 2 - minX * size;
    const oy = y + (h - rows * size) / 2 - minY * size;
    paintCells(ctx, cells, ox, oy, size, T.COLOR[id], mode);
  }

  function burst(rows) {
    const palette = ["#ffffff", "#3ad7ff", "#ffd23a", "#c86bff", "#3ee07a", "#ff4d6a"];
    for (let r = 0; r < rows.length; r++) {
      const sy = rows[r] - T.HIDDEN + 0.5;
      if (sy < 0 || sy > T.VISIBLE) continue;
      for (let i = 0; i < 12; i++) {
        sparks.push({
          x: Math.random() * T.COLS,
          y: sy,
          vx: (Math.random() - 0.5) * 9,
          vy: -Math.random() * 6 - 0.5,
          life: 0.45 + Math.random() * 0.2,
          max: 0.65,
          color: palette[i % palette.length]
        });
      }
    }
  }

  function frame(eng, well, holdCanvas, nextCanvas, dt) {
    const view = fit(well);
    if (view) drawWell(view.ctx, view.w, view.h, eng, dt);
    const holdView = fit(holdCanvas);
    if (holdView) {
      holdView.ctx.clearRect(0, 0, holdView.w, holdView.h);
      if (eng.hold) {
        drawPieceBox(holdView.ctx, eng.hold, 0, 0, holdView.w, holdView.h, eng.holdUsed ? "dim" : null);
      }
    }
    const nextView = fit(nextCanvas);
    if (nextView) {
      nextView.ctx.clearRect(0, 0, nextView.w, nextView.h);
      const count = nextView.h < 220 ? 3 : 5;
      const shown = Math.min(eng.queue.length, count || 5);
      const slot = nextView.h / Math.max(1, shown);
      for (let i = 0; i < shown; i++) {
        drawPieceBox(nextView.ctx, eng.queue[i], 0, i * slot, nextView.w, slot, null);
      }
    }
  }

  function drawWell(ctx, w, h, eng, dt) {
    const cell = Math.min(w / T.COLS, h / T.VISIBLE);
    const gridW = cell * T.COLS;
    const gridH = cell * T.VISIBLE;
    const ox = (w - gridW) / 2;
    const oy = (h - gridH) / 2;
    const seconds = Math.max(0, dt) / 1000;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#090d1c";
    ctx.fillRect(ox, oy, gridW, gridH);

    for (let y = 0; y < T.VISIBLE; y++) {
      for (let x = 0; x < T.COLS; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? "rgba(255,255,255,.035)" : "rgba(255,255,255,.015)";
        ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
      }
    }

    const flashing = {};
    for (let i = 0; i < eng.clearRows.length; i++) flashing[eng.clearRows[i]] = true;

    for (let y = T.HIDDEN; y < T.ROWS; y++) {
      for (let x = 0; x < T.COLS; x++) {
        const id = eng.board[y][x];
        if (!id) continue;
        block(
          ctx,
          ox + x * cell,
          oy + (y - T.HIDDEN) * cell,
          cell,
          T.COLOR[id] || "#fff",
          flashing[y] ? "flash" : null
        );
      }
    }

    const ghost = eng.ghost();
    if (ghost) {
      paintCells(ctx, eng.cells(ghost), ox, oy - T.HIDDEN * cell, cell, T.COLOR[ghost.id], "ghost");
    }
    if (eng.piece && eng.phase !== "clearing") {
      const cells = eng.cells(eng.piece);
      for (let i = 0; i < cells.length; i++) {
        if (cells[i][1] < T.HIDDEN) continue;
        block(ctx, ox + cells[i][0] * cell, oy + (cells[i][1] - T.HIDDEN) * cell, cell, T.COLOR[eng.piece.id], null);
      }
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const spark = sparks[i];
      spark.life -= seconds;
      spark.x += spark.vx * seconds;
      spark.y += spark.vy * seconds;
      spark.vy += 12 * seconds;
      if (spark.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.max(0, spark.life / spark.max);
      ctx.fillStyle = spark.color;
      ctx.fillRect(ox + spark.x * cell, oy + spark.y * cell, Math.max(2, cell * 0.18), Math.max(2, cell * 0.18));
      ctx.globalAlpha = 1;
    }
  }

  global.ModernTetrisRender = { frame: frame, burst: burst };
})(typeof globalThis !== "undefined" ? globalThis : window);
