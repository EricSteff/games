/**
 * UI shell — Game Boy Tetris (1989) recreation
 */

import { GameBoyTetris } from "./game.js";
import { drawBoard, drawNext } from "./render.js";
import * as audio from "./audio.js";

const $ = (id) => document.getElementById(id);

const screens = {
  menu: $("screen-menu"),
  play: $("screen-play"),
  over: $("screen-over"),
};

const els = {
  board: $("board"),
  next: $("next"),
  score: $("hud-score"),
  level: $("hud-level"),
  lines: $("hud-lines"),
  menuLevel: $("menu-level"),
  menuMusic: $("menu-music"),
  pause: $("pause-overlay"),
  overScore: $("over-score"),
  overLevel: $("over-level"),
  overLines: $("over-lines"),
};

const MUSIC_OPTS = ["A-TYPE", "OFF"];
let menuLevel = 0;
let musicIdx = 0;
let mode = "menu"; // menu | play | over
const game = new GameBoyTetris();

let raf = 0;
let lastTs = 0;
let dropAcc = 0;
let dasDir = 0;
let dasTimer = 0;
const held = { left: false, right: false, down: false };

function show(name) {
  mode = name;
  for (const [k, el] of Object.entries(screens)) {
    const on = k === name;
    el.classList.toggle("active", on);
    if (on) el.removeAttribute("hidden");
    else el.setAttribute("hidden", "");
  }
}

function updateMenuUI() {
  els.menuLevel.textContent = String(menuLevel);
  els.menuMusic.textContent = MUSIC_OPTS[musicIdx];
  audio.setMusicEnabled(MUSIC_OPTS[musicIdx] !== "OFF");
}

function render() {
  drawBoard(els.board, game.renderGrid());
  drawNext(els.next, game.nextType);
  els.score.textContent = String(game.score);
  els.level.textContent = String(game.level);
  els.lines.textContent = String(game.lines);
  els.pause.hidden = !game.paused;
}

function startGame() {
  audio.unlock();
  audio.sfxStart();
  game.reset(menuLevel);
  dropAcc = 0;
  lastTs = 0;
  dasDir = 0;
  dasTimer = 0;
  held.left = held.right = held.down = false;
  show("play");
  render();

  if (MUSIC_OPTS[musicIdx] === "A-TYPE") {
    audio.setMusicEnabled(true);
    audio.startMusic();
  } else {
    audio.setMusicEnabled(false);
  }

  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);
}

function gameOver() {
  audio.sfxGameOver();
  audio.stopMusic();
  cancelAnimationFrame(raf);
  els.overScore.textContent = String(game.score);
  els.overLevel.textContent = String(game.level);
  els.overLines.textContent = String(game.lines);
  show("over");
}

function loop(ts) {
  if (mode !== "play") return;
  if (!lastTs) lastTs = ts;
  const dt = Math.min(50, ts - lastTs);
  lastTs = ts;

  if (!game.paused && !game.gameOver) {
    // Line clear animation
    if (game.clearing) {
      const frameMs = 1000 / 59.73;
      dropAcc += dt;
      while (dropAcc >= frameMs && game.clearing) {
        dropAcc -= frameMs;
        const res = game.tickClear();
        if (res && res.cleared) {
          if (res.cleared >= 4) audio.sfxTetris();
          else audio.sfxLine();
        }
        if (res && res.gameOver) {
          render();
          gameOver();
          return;
        }
      }
      render();
      raf = requestAnimationFrame(loop);
      return;
    }

    // DAS
    if (dasDir !== 0) {
      dasTimer -= dt;
      if (dasTimer <= 0) {
        if (game.tryMove(0, dasDir)) {
          audio.sfxMove();
          render();
        }
        dasTimer = game.dasRepeatMs();
      }
    }

    // Gravity / soft drop
    const interval = held.down ? game.softDropMs() : game.dropMs();
    dropAcc += dt;
    while (dropAcc >= interval) {
      dropAcc -= interval;
      const res = held.down ? game.softDropStep() : game.gravityStep();
      if (res.locked) {
        audio.sfxLock();
        dropAcc = 0;
        if (game.gameOver) {
          render();
          gameOver();
          return;
        }
      }
      render();
      if (game.clearing) break;
    }
  }

  raf = requestAnimationFrame(loop);
}

/* ---------- Input mapping ---------- */
function press(action, isRepeat = false) {
  audio.unlock();

  if (mode === "menu") {
    if (action === "left") {
      menuLevel = (menuLevel + 9) % 10;
      audio.sfxSelect();
      updateMenuUI();
    } else if (action === "right") {
      menuLevel = (menuLevel + 1) % 10;
      audio.sfxSelect();
      updateMenuUI();
    } else if (action === "up" || action === "down") {
      musicIdx = (musicIdx + 1) % MUSIC_OPTS.length;
      audio.sfxSelect();
      updateMenuUI();
      if (MUSIC_OPTS[musicIdx] === "A-TYPE") {
        audio.setMusicEnabled(true);
        audio.startMusic();
      } else {
        audio.stopMusic();
      }
    } else if (action === "start" || action === "a") {
      startGame();
    }
    return;
  }

  if (mode === "over") {
    if (action === "start" || action === "a") {
      startGame();
    } else if (action === "select" || action === "b") {
      audio.stopMusic();
      show("menu");
      updateMenuUI();
    }
    return;
  }

  if (mode !== "play") return;

  if (action === "start") {
    game.paused = !game.paused;
    if (game.paused) audio.stopMusic();
    else if (MUSIC_OPTS[musicIdx] === "A-TYPE") audio.startMusic();
    render();
    return;
  }

  if (action === "select") {
    game.paused = true;
    audio.stopMusic();
    show("menu");
    updateMenuUI();
    cancelAnimationFrame(raf);
    return;
  }

  if (game.paused || game.gameOver || game.clearing) return;

  if (action === "left") {
    if (!held.left) {
      held.left = true;
      dasDir = -1;
      dasTimer = game.dasDelayMs();
      if (game.tryMove(0, -1)) {
        audio.sfxMove();
        render();
      }
    }
  } else if (action === "right") {
    if (!held.right) {
      held.right = true;
      dasDir = 1;
      dasTimer = game.dasDelayMs();
      if (game.tryMove(0, 1)) {
        audio.sfxMove();
        render();
      }
    }
  } else if (action === "down") {
    held.down = true;
    if (!isRepeat) {
      const res = game.softDropStep();
      if (res.moved) render();
      else if (res.locked) {
        audio.sfxLock();
        render();
        if (game.gameOver) gameOver();
      }
    }
  } else if (action === "a" || action === "b" || action === "up") {
    if (isRepeat) return;
    if (game.tryRotate()) {
      audio.sfxRotate();
      render();
    }
  }
}

function release(action) {
  if (action === "left") {
    held.left = false;
    if (dasDir === -1) dasDir = held.right ? 1 : 0;
  } else if (action === "right") {
    held.right = false;
    if (dasDir === 1) dasDir = held.left ? -1 : 0;
  } else if (action === "down") {
    held.down = false;
    // GB: only continuous soft drop into lock scores
    if (mode === "play" && game.piece) game.softDropCells = 0;
  }
}

const KEY_MAP = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowDown: "down",
  ArrowUp: "up",
  a: "left",
  A: "left",
  d: "right",
  D: "right",
  s: "down",
  S: "down",
  w: "up",
  W: "up",
  z: "b",
  Z: "b",
  x: "a",
  X: "a",
  Enter: "start",
  " ": "start",
  Shift: "select",
  Escape: "select",
};

window.addEventListener("keydown", (e) => {
  if (e.key === "m" || e.key === "M") {
    e.preventDefault();
    const on = audio.toggleMusic();
    musicIdx = on ? 0 : 1;
    updateMenuUI();
    if (on && mode === "play" && !game.paused) audio.startMusic();
    return;
  }
  const action = KEY_MAP[e.key];
  if (!action) return;
  e.preventDefault();
  press(action, e.repeat);
  highlightBtn(action, true);
});

window.addEventListener("keyup", (e) => {
  const action = KEY_MAP[e.key];
  if (!action) return;
  release(action);
  highlightBtn(action, false);
});

function highlightBtn(action, on) {
  document.querySelectorAll(`[data-btn="${action}"]`).forEach((el) => {
    el.classList.toggle("pressed", on);
  });
}

// On-screen Game Boy buttons
document.querySelectorAll("[data-btn]").forEach((btn) => {
  const action = btn.getAttribute("data-btn");
  const down = (e) => {
    e.preventDefault();
    btn.classList.add("pressed");
    press(action, false);
  };
  const up = (e) => {
    e.preventDefault();
    btn.classList.remove("pressed");
    release(action);
  };
  btn.addEventListener("pointerdown", down);
  btn.addEventListener("pointerup", up);
  btn.addEventListener("pointerleave", up);
  btn.addEventListener("pointercancel", up);
});

// Boot
show("menu");
updateMenuUI();
document.body.addEventListener(
  "pointerdown",
  () => {
    audio.unlock();
  },
  { once: true }
);
