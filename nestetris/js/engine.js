/* Modern marathon Tetris.
   7-bag, SRS wall kicks, hold, ghost, hard drop, lock delay.
   Positive x is right and positive y is down. Kick tables are the
   Tetris Wiki SRS data with y flipped into this coordinate system. */

(function (global) {
  "use strict";

  const COLS = 10;
  const VISIBLE = 20;
  const HIDDEN = 4;
  const ROWS = VISIBLE + HIDDEN;
  const SPAWN_X = 3;
  const SPAWN_Y = 4;
  const PREVIEWS = 5;
  const LOCK_MS = 500;
  const MAX_LOCK_RESETS = 15;
  const CLEAR_MS = 220;
  const SOFT_MS = 40;
  const GRAVITY_FLOOR = 80;

  const COLOR = {
    I: "#3ad7ff",
    O: "#ffd23a",
    T: "#c86bff",
    S: "#3ee07a",
    Z: "#ff4d6a",
    J: "#4c7dff",
    L: "#ff932f"
  };

  const SCORE = {
    normal: [0, 100, 300, 500, 800],
    mini: [100, 200, 400, 800],
    full: [400, 800, 1200, 1600]
  };

  function rotateCW(cells) {
    return cells.map(function (cell) {
      const x = cell[0];
      const y = cell[1];
      return [1 - (y - 1), 1 + (x - 1)];
    });
  }

  function cycle(spawn) {
    const states = [spawn.map(function (c) { return c.slice(); })];
    for (let i = 0; i < 3; i++) states.push(rotateCW(states[i]));
    return states;
  }

  const SHAPES = {
    I: [
      [[0, 1], [1, 1], [2, 1], [3, 1]],
      [[2, 0], [2, 1], [2, 2], [2, 3]],
      [[0, 2], [1, 2], [2, 2], [3, 2]],
      [[1, 0], [1, 1], [1, 2], [1, 3]]
    ],
    O: [
      [[1, 0], [2, 0], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [2, 1]]
    ],
    T: cycle([[1, 0], [0, 1], [1, 1], [2, 1]]),
    J: cycle([[0, 0], [0, 1], [1, 1], [2, 1]]),
    L: cycle([[2, 0], [0, 1], [1, 1], [2, 1]]),
    S: cycle([[1, 0], [2, 0], [0, 1], [1, 1]]),
    Z: cycle([[0, 0], [1, 0], [1, 1], [2, 1]])
  };

  /* Wiki y is up. Store y-down by negating y. */
  function flipY(rows) {
    const out = {};
    Object.keys(rows).forEach(function (key) {
      out[key] = rows[key].map(function (kick) { return [kick[0], -kick[1]]; });
    });
    return out;
  }

  const KICKS = {
    N: flipY({
      "0>1": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
      "1>0": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
      "1>2": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
      "2>1": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
      "2>3": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
      "3>2": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
      "3>0": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
      "0>3": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]
    }),
    I: flipY({
      "0>1": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
      "1>0": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
      "1>2": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
      "2>1": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
      "2>3": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
      "3>2": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
      "3>0": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
      "0>3": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]
    }),
    O: { "0>1": [[0, 0]], "1>2": [[0, 0]], "2>3": [[0, 0]], "3>0": [[0, 0]],
      "1>0": [[0, 0]], "2>1": [[0, 0]], "3>2": [[0, 0]], "0>3": [[0, 0]] }
  };

  function gravityMs(level) {
    const steps = Math.max(0, level - 1);
    const base = 0.8 - steps * 0.007;
    if (base <= 0.05) return GRAVITY_FLOOR;
    const ms = Math.pow(base, steps) * 1000;
    if (!Number.isFinite(ms)) return GRAVITY_FLOOR;
    return Math.max(GRAVITY_FLOOR, ms);
  }

  function emptyRow() {
    return Array(COLS).fill(null);
  }

  function emptyBoard() {
    const board = [];
    for (let y = 0; y < ROWS; y++) board.push(emptyRow());
    return board;
  }

  function Game(rng) {
    this.rng = rng || Math.random;
    this.phase = "ready";
    this.board = emptyBoard();
    this.piece = null;
    this.queue = [];
    this.bag = [];
    this.hold = null;
    this.holdUsed = false;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.combo = 0;
    this.b2b = false;
    this.soft = false;
    this.locking = false;
    this.lockMs = 0;
    this.lockResets = 0;
    this.fallMs = 0;
    this.lastAction = "spawn";
    this.landSound = null;
    this.clearRows = [];
    this.clearMs = 0;
    this.banner = "";
    this.bannerMs = 0;
    this.pausedFrom = "playing";
    this.events = [];
  }

  Game.prototype.cells = function (piece) {
    return SHAPES[piece.id][piece.rot].map(function (cell) {
      return [cell[0] + piece.x, cell[1] + piece.y];
    });
  };

  Game.prototype.collides = function (piece) {
    const cells = this.cells(piece);
    for (let i = 0; i < cells.length; i++) {
      const x = cells[i][0];
      const y = cells[i][1];
      if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return true;
      if (this.board[y][x]) return true;
    }
    return false;
  };

  Game.prototype.onGround = function () {
    if (!this.piece) return false;
    return this.collides({ id: this.piece.id, rot: this.piece.rot, x: this.piece.x, y: this.piece.y + 1 });
  };

  Game.prototype.drawBag = function () {
    if (this.bag.length === 0) {
      this.bag = ["I", "O", "T", "S", "Z", "J", "L"];
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        const swap = this.bag[i];
        this.bag[i] = this.bag[j];
        this.bag[j] = swap;
      }
    }
    return this.bag.pop();
  };

  Game.prototype.placeNew = function (id) {
    const piece = { id: id, rot: 0, x: SPAWN_X, y: SPAWN_Y };
    this.locking = false;
    this.lockMs = 0;
    this.lockResets = 0;
    this.fallMs = 0;
    this.lastAction = "spawn";
    this.landSound = null;
    if (this.collides(piece)) {
      this.piece = null;
      this.phase = "over";
      this.events.push("over");
      return;
    }
    this.piece = piece;
  };

  Game.prototype.spawnNext = function () {
    const id = this.queue.shift();
    this.queue.push(this.drawBag());
    this.placeNew(id);
  };

  Game.prototype.start = function () {
    this.board = emptyBoard();
    this.piece = null;
    this.queue = [];
    this.bag = [];
    this.hold = null;
    this.holdUsed = false;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.combo = 0;
    this.b2b = false;
    this.soft = false;
    this.locking = false;
    this.lockMs = 0;
    this.lockResets = 0;
    this.fallMs = 0;
    this.clearRows = [];
    this.clearMs = 0;
    this.banner = "";
    this.bannerMs = 0;
    this.events = [];
    this.phase = "playing";
    while (this.queue.length < PREVIEWS) this.queue.push(this.drawBag());
    this.spawnNext();
  };

  Game.prototype.setSoft = function (on) {
    this.soft = !!on;
  };

  Game.prototype.shift = function (dir) {
    if (this.phase !== "playing" || !this.piece) return false;
    const next = { id: this.piece.id, rot: this.piece.rot, x: this.piece.x + dir, y: this.piece.y };
    if (this.collides(next)) return false;
    const wasLocking = this.locking;
    this.piece = next;
    this.lastAction = "move";
    this.afterPlayerMove(wasLocking);
    return true;
  };

  Game.prototype.rotate = function (dir) {
    if (this.phase !== "playing" || !this.piece) return false;
    const from = this.piece.rot;
    const to = (from + (dir > 0 ? 1 : 3)) % 4;
    const family = this.piece.id === "I" ? "I" : (this.piece.id === "O" ? "O" : "N");
    const kicks = KICKS[family][from + ">" + to];
    for (let i = 0; i < kicks.length; i++) {
      const next = {
        id: this.piece.id,
        rot: to,
        x: this.piece.x + kicks[i][0],
        y: this.piece.y + kicks[i][1]
      };
      if (!this.collides(next)) {
        const wasLocking = this.locking;
        this.piece = next;
        this.lastAction = "rotate";
        this.afterPlayerMove(wasLocking);
        this.events.push("rotate");
        return true;
      }
    }
    this.events.push("deny");
    return false;
  };

  Game.prototype.afterPlayerMove = function (wasLocking) {
    if (!this.onGround()) {
      this.locking = false;
      this.lockMs = 0;
      return;
    }
    if (!wasLocking) {
      this.locking = true;
      this.lockMs = 0;
      this.lockResets = 0;
      return;
    }
    if (this.lockResets < MAX_LOCK_RESETS) {
      this.lockMs = 0;
      this.lockResets += 1;
    }
  };

  Game.prototype.holdPiece = function () {
    if (this.phase !== "playing" || !this.piece || this.holdUsed) {
      if (this.phase === "playing" && this.holdUsed) this.events.push("deny");
      return false;
    }
    const incoming = this.hold;
    this.hold = this.piece.id;
    this.holdUsed = true;
    if (incoming) this.placeNew(incoming);
    else this.spawnNext();
    this.events.push("hold");
    return true;
  };

  Game.prototype.hardDrop = function () {
    if (this.phase !== "playing" || !this.piece) return false;
    let distance = 0;
    while (!this.onGround()) {
      this.piece.y += 1;
      distance += 1;
    }
    this.score += distance * 2;
    this.landSound = distance > 0 ? "hard" : "lock";
    this.lockPiece();
    return true;
  };

  Game.prototype.ghost = function () {
    if (!this.piece || this.phase === "over" || this.phase === "clearing") return null;
    const ghost = { id: this.piece.id, rot: this.piece.rot, x: this.piece.x, y: this.piece.y };
    while (!this.collides({ id: ghost.id, rot: ghost.rot, x: ghost.x, y: ghost.y + 1 })) ghost.y += 1;
    if (ghost.y === this.piece.y) return null;
    return ghost;
  };

  function cornerFilled(board, x, y) {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return true;
    return !!board[y][x];
  }

  function tspinKind(piece, board) {
    if (!piece || piece.id !== "T") return null;
    const fronts = {
      0: [[0, 0], [2, 0]],
      1: [[2, 0], [2, 2]],
      2: [[0, 2], [2, 2]],
      3: [[0, 0], [0, 2]]
    }[piece.rot];
    const corners = [[0, 0], [2, 0], [0, 2], [2, 2]];
    let filled = 0;
    let front = 0;
    for (let i = 0; i < corners.length; i++) {
      const lx = corners[i][0];
      const ly = corners[i][1];
      if (!cornerFilled(board, piece.x + lx, piece.y + ly)) continue;
      filled += 1;
      for (let f = 0; f < fronts.length; f++) {
        if (fronts[f][0] === lx && fronts[f][1] === ly) front += 1;
      }
    }
    if (filled < 3) return null;
    return front === 2 ? "full" : "mini";
  }

  Game.prototype.say = function (text) {
    if (!text) return;
    this.banner = text;
    this.bannerMs = 1100;
  };

  Game.prototype.lockPiece = function () {
    const piece = this.piece;
    if (!piece) return;
    const spin = this.lastAction === "rotate" ? tspinKind(piece, this.board) : null;
    const cells = this.cells(piece);
    let visible = false;
    for (let i = 0; i < cells.length; i++) {
      const x = cells[i][0];
      const y = cells[i][1];
      if (y >= HIDDEN) visible = true;
      if (y >= 0 && y < ROWS && x >= 0 && x < COLS) this.board[y][x] = piece.id;
    }
    this.piece = null;
    this.locking = false;
    this.holdUsed = false;

    if (!visible) {
      this.phase = "over";
      this.events.push("over");
      return;
    }

    const cleared = [];
    for (let y = 0; y < ROWS; y++) {
      let full = true;
      for (let x = 0; x < COLS; x++) {
        if (!this.board[y][x]) { full = false; break; }
      }
      if (full) cleared.push(y);
    }

    const lines = cleared.length;
    const table = spin ? SCORE[spin] : SCORE.normal;
    const base = (table[lines] || 0) * this.level;
    let points = base;
    const difficult = lines === 4 || (!!spin && lines > 0);
    const backToBack = difficult && this.b2b;
    if (backToBack) points += Math.floor(base / 2);
    if (lines > 0) {
      points += this.combo * 50 * this.level;
      this.combo += 1;
      this.b2b = difficult;
      const beforeLevel = Math.floor((this.lines) / 10);
      this.lines += lines;
      const afterLevel = Math.floor(this.lines / 10);
      if (afterLevel > beforeLevel) {
        this.level += afterLevel - beforeLevel;
        this.events.push("level");
      }
    } else {
      this.combo = 0;
    }
    this.score += points;

    let msg = "";
    if (spin === "full") msg = ["T-SPIN", "T-SPIN SINGLE", "T-SPIN DOUBLE", "T-SPIN TRIPLE"][lines] || "T-SPIN";
    else if (spin === "mini") msg = lines > 0 ? "MINI T-SPIN" : "T-SPIN MINI";
    else if (lines > 0) msg = ["", "SINGLE", "DOUBLE", "TRIPLE", "TETRIS"][lines];
    if (backToBack && msg) msg = "B2B " + msg;
    if (this.combo >= 2 && msg) msg += " · " + this.combo + " COMBO";
    this.say(msg);

    if (lines === 4) this.events.push("tetris");
    else if (spin) this.events.push("tspin");
    else if (lines === 3) this.events.push("clear3");
    else if (lines === 2) this.events.push("clear2");
    else if (lines === 1) this.events.push("clear1");
    else this.events.push(this.landSound || "lock");
    this.landSound = null;

    if (lines > 0) {
      this.clearRows = cleared;
      this.clearMs = 0;
      this.phase = "clearing";
      return;
    }
    this.spawnNext();
  };

  Game.prototype.finishClear = function () {
    const rows = this.clearRows.slice().sort(function (a, b) { return b - a; });
    for (let i = 0; i < rows.length; i++) {
      this.board.splice(rows[i], 1);
      this.board.unshift(emptyRow());
    }
    this.clearRows = [];
    let empty = true;
    for (let y = 0; y < ROWS && empty; y++) {
      for (let x = 0; x < COLS; x++) {
        if (this.board[y][x]) { empty = false; break; }
      }
    }
    if (empty) {
      this.score += 2000 * this.level;
      this.say("PERFECT");
      this.events.push("perfect");
    }
    this.phase = "playing";
    this.spawnNext();
  };

  Game.prototype.tick = function (dt) {
    dt = Math.max(0, Math.min(dt, 50));
    if (this.bannerMs > 0) {
      this.bannerMs -= dt;
      if (this.bannerMs <= 0) this.banner = "";
    }
    if (this.phase === "clearing") {
      this.clearMs += dt;
      if (this.clearMs >= CLEAR_MS) this.finishClear();
      return;
    }
    if (this.phase !== "playing" || !this.piece) return;

    if (this.onGround()) {
      this.fallMs = 0;
      if (!this.locking) {
        this.locking = true;
        this.lockMs = 0;
        this.lockResets = 0;
      }
      this.lockMs += dt;
      if (this.lockMs >= LOCK_MS) this.lockPiece();
      return;
    }

    this.locking = false;
    this.fallMs += dt;
    const grav = gravityMs(this.level);
    const softing = this.soft && grav > SOFT_MS;
    const interval = softing ? SOFT_MS : grav;
    while (this.piece && this.fallMs >= interval && !this.onGround()) {
      this.fallMs -= interval;
      this.piece.y += 1;
      if (softing) this.score += 1;
      this.lastAction = softing ? "soft" : "grav";
    }
    if (this.onGround()) {
      this.fallMs = 0;
      this.locking = true;
      this.lockMs = 0;
      this.lockResets = 0;
    }
  };

  Game.prototype.togglePause = function () {
    if (this.phase === "playing" || this.phase === "clearing") {
      this.pausedFrom = this.phase;
      this.phase = "paused";
      return true;
    }
    if (this.phase === "paused") {
      this.phase = this.pausedFrom || "playing";
      return false;
    }
    return false;
  };

  Game.prototype.pullEvents = function () {
    const events = this.events;
    this.events = [];
    return events;
  };

  function create(opts) {
    return new Game(opts && opts.rng);
  }

  const api = {
    create: create,
    gravityMs: gravityMs,
    rotateCW: rotateCW,
    SHAPES: SHAPES,
    COLOR: COLOR,
    COLS: COLS,
    ROWS: ROWS,
    HIDDEN: HIDDEN,
    VISIBLE: VISIBLE,
    LOCK_MS: LOCK_MS,
    CLEAR_MS: CLEAR_MS,
    SOFT_MS: SOFT_MS,
    GRAVITY_FLOOR: GRAVITY_FLOOR,
    SPAWN_X: SPAWN_X,
    SPAWN_Y: SPAWN_Y
  };

  global.ModernTetris = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
