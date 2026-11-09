/* Input, scoreboard, and the frame loop. */
(function () {
  "use strict";

  const T = window.ModernTetris;
  const view = window.ModernTetrisRender;
  const audio = window.ModernTetrisAudio;
  const DAS = 130;
  const ARR = 20;
  const BEST_KEY = "timingslip.nestetris.best";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const eng = T.create();
  const well = document.getElementById("well");
  const holdCanvas = document.getElementById("hold");
  const nextCanvas = document.getElementById("next");
  const wrap = document.getElementById("wellWrap");
  const overlay = document.getElementById("overlay");
  const ovTitle = document.getElementById("ovTitle");
  const ovText = document.getElementById("ovText");
  const ovStats = document.getElementById("ovStats");
  const how = document.getElementById("how");
  const playBtn = document.getElementById("playBtn");
  const resumeBtn = document.getElementById("resumeBtn");
  const againBtn = document.getElementById("againBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const muteBtn = document.getElementById("muteBtn");
  const banner = document.getElementById("banner");
  const scoreEl = document.getElementById("score");
  const linesEl = document.getElementById("lines");
  const levelEl = document.getElementById("level");
  const bestEl = document.getElementById("best");
  const barEl = document.getElementById("bar");

  const keys = { left: false, right: false, soft: false };
  let dasDir = 0;
  let dasT = 0;
  let arrT = 0;
  let best = readBest();
  let finished = false;
  let lastBanner = "";
  let padPrev = { rot: false, rotC: false, hard: false, hold: false, pause: false };

  function readBest() {
    try { return Number(localStorage.getItem(BEST_KEY)) || 0; }
    catch (err) { return 0; }
  }

  function saveBest(score) {
    if (score <= best) return false;
    best = score;
    try { localStorage.setItem(BEST_KEY, String(best)); } catch (err) { /* private mode */ }
    return true;
  }

  function fmt(n) {
    return Math.max(0, Math.floor(n)).toLocaleString("en-US");
  }

  function syncMute() {
    const off = audio.isMuted();
    muteBtn.setAttribute("aria-pressed", off ? "true" : "false");
    muteBtn.textContent = off ? "Sound off" : "Sound";
  }

  function setOverlay(mode, isNewBest) {
    overlay.classList.toggle("is-open", mode !== "none");
    resumeBtn.hidden = mode !== "pause";
    playBtn.hidden = mode !== "title";
    againBtn.hidden = mode !== "pause" && mode !== "over";
    ovStats.hidden = mode !== "over";
    how.hidden = mode !== "title";
    if (mode === "title") {
      ovTitle.textContent = "TETRIS";
      ovText.textContent = "Clear lines. The stack speeds up as you level."
        + (best > 0 ? "\nBest " + fmt(best) + "." : "");
    } else if (mode === "pause") {
      ovTitle.textContent = "Paused";
      ovText.textContent = "Take a breath. Resume when you are ready.";
    } else if (mode === "over") {
      ovTitle.textContent = "Game over";
      ovText.textContent = isNewBest ? "New best." : "The stack reached the top.";
      ovStats.textContent = "Score " + fmt(eng.score) + "    Lines " + eng.lines + "    Level " + eng.level;
    }
  }

  function shake() {
    if (reduceMotion) return;
    wrap.classList.remove("shake");
    void wrap.offsetWidth;
    wrap.classList.add("shake");
  }

  function begin() {
    audio.unlock();
    eng.start();
    audio.startMusic(true);
    finished = false;
    dasDir = 0;
    pauseBtn.disabled = false;
    pauseBtn.textContent = "Pause";
    setOverlay("none");
  }

  function onOver() {
    finished = true;
    audio.stopMusic();
    const fresh = saveBest(eng.score);
    pauseBtn.disabled = true;
    pauseBtn.textContent = "Pause";
    setOverlay("over", fresh);
    bestEl.textContent = fmt(best);
  }

  function togglePause() {
    if (eng.phase !== "playing" && eng.phase !== "clearing" && eng.phase !== "paused") return;
    const paused = eng.togglePause();
    if (paused) {
      audio.stopMusic();
      keys.left = keys.right = keys.soft = false;
      dasDir = 0;
      eng.setSoft(false);
      pauseBtn.textContent = "Resume";
      setOverlay("pause");
    } else {
      audio.unlock();
      audio.startMusic();
      pauseBtn.textContent = "Pause";
      setOverlay("none");
    }
  }

  function checkOver() {
    if (!finished && eng.phase === "over") onOver();
  }

  function readPad() {
    const out = { left: false, right: false, soft: false, rot: false, rotC: false, hard: false, hold: false, pause: false };
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad) continue;
      const x = pad.axes[0] || 0;
      const y = pad.axes[1] || 0;
      out.left = out.left || x < -0.45 || !!(pad.buttons[14] && pad.buttons[14].pressed);
      out.right = out.right || x > 0.45 || !!(pad.buttons[15] && pad.buttons[15].pressed);
      out.soft = out.soft || y > 0.45 || !!(pad.buttons[13] && pad.buttons[13].pressed);
      out.hard = out.hard || !!(pad.buttons[12] && pad.buttons[12].pressed);
      out.rot = out.rot || !!(pad.buttons[0] && pad.buttons[0].pressed);
      out.rotC = out.rotC || !!(pad.buttons[1] && pad.buttons[1].pressed);
      out.hold = out.hold || !!(pad.buttons[2] && pad.buttons[2].pressed);
      out.pause = out.pause || !!(pad.buttons[9] && pad.buttons[9].pressed);
    }
    return out;
  }

  function edgePad(pad) {
    if (pad.pause && !padPrev.pause) {
      if (eng.phase === "ready" || eng.phase === "over") begin();
      else togglePause();
    }
    if (eng.phase === "playing") {
      if (pad.rot && !padPrev.rot) eng.rotate(1);
      if (pad.rotC && !padPrev.rotC) eng.rotate(-1);
      if (pad.hard && !padPrev.hard) eng.hardDrop();
      if (pad.hold && !padPrev.hold) eng.holdPiece();
    }
    padPrev = pad;
  }

  function stepDas(dt, pad) {
    const left = keys.left || pad.left;
    const right = keys.right || pad.right;
    const soft = keys.soft || pad.soft;
    eng.setSoft(soft);
    let dir = 0;
    if (left && !right) dir = -1;
    else if (right && !left) dir = 1;
    if (dir === 0) {
      dasDir = 0;
      return;
    }
    if (dir !== dasDir) {
      dasDir = dir;
      dasT = 0;
      arrT = 0;
      eng.shift(dir);
      return;
    }
    dasT += dt;
    if (dasT < DAS) return;
    arrT += dt;
    while (arrT >= ARR) {
      arrT -= ARR;
      if (!eng.shift(dir)) break;
    }
  }

  const gesture = { id: null, x: 0, y: 0, lastX: 0, accum: 0, moved: false };

  well.addEventListener("pointerdown", function (e) {
    if (eng.phase !== "playing" || e.button !== 0) return;
    gesture.id = e.pointerId;
    gesture.x = gesture.lastX = e.clientX;
    gesture.y = e.clientY;
    gesture.accum = 0;
    gesture.moved = false;
    well.setPointerCapture(e.pointerId);
  });

  well.addEventListener("pointermove", function (e) {
    if (e.pointerId !== gesture.id || eng.phase !== "playing") return;
    const totalX = e.clientX - gesture.x;
    const totalY = e.clientY - gesture.y;
    if (Math.hypot(totalX, totalY) > 14) gesture.moved = true;
    if (Math.abs(totalX) > Math.abs(totalY)) {
      gesture.accum += e.clientX - gesture.lastX;
      while (gesture.accum >= 26) {
        eng.shift(1);
        gesture.accum -= 26;
      }
      while (gesture.accum <= -26) {
        eng.shift(-1);
        gesture.accum += 26;
      }
    }
    gesture.lastX = e.clientX;
  });

  function endGesture(e) {
    if (e.pointerId !== gesture.id) return;
    const totalX = e.clientX - gesture.x;
    const totalY = e.clientY - gesture.y;
    if (eng.phase === "playing") {
      if (!gesture.moved) eng.rotate(1);
      else if (totalY > 48 && Math.abs(totalY) > Math.abs(totalX) * 1.2) eng.hardDrop();
      else if (totalY < -48 && Math.abs(totalY) > Math.abs(totalX) * 1.2) eng.holdPiece();
    }
    gesture.id = null;
  }

  well.addEventListener("pointerup", endGesture);
  well.addEventListener("pointercancel", function (e) { gesture.id = e.pointerId === gesture.id ? null : gesture.id; });
  well.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  function bindPress(button, key) {
    function down(e) {
      e.preventDefault();
      button.classList.add("is-down");
      keys[key] = true;
      try { button.setPointerCapture(e.pointerId); } catch (err) { /* pointer already released */ }
    }
    function up(e) {
      button.classList.remove("is-down");
      keys[key] = false;
      try {
        if (button.hasPointerCapture(e.pointerId)) button.releasePointerCapture(e.pointerId);
      } catch (err) { /* pointer already released */ }
    }
    button.addEventListener("pointerdown", down);
    button.addEventListener("pointerup", up);
    button.addEventListener("pointercancel", up);
    button.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  }

  function bindTap(button, act) {
    button.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      button.classList.add("is-down");
      if (eng.phase !== "playing") return;
      if (act === "rotate") eng.rotate(1);
      else if (act === "hard") eng.hardDrop();
      else if (act === "hold") eng.holdPiece();
      checkOver();
    });
    function up() { button.classList.remove("is-down"); }
    button.addEventListener("pointerup", up);
    button.addEventListener("pointercancel", up);
    button.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  }

  document.querySelectorAll("[data-hold]").forEach(function (button) {
    bindPress(button, button.getAttribute("data-hold"));
  });
  document.querySelectorAll("[data-tap]").forEach(function (button) {
    bindTap(button, button.getAttribute("data-tap"));
  });

  window.addEventListener("keydown", function (e) {
    const code = e.code;
    const scroll = code === "ArrowLeft" || code === "ArrowRight" || code === "ArrowDown" || code === "ArrowUp" || code === "Space";
    if (scroll) e.preventDefault();
    if (e.repeat) return;
    if (code === "ArrowLeft" || code === "KeyA") keys.left = true;
    else if (code === "ArrowRight" || code === "KeyD") keys.right = true;
    else if (code === "ArrowDown" || code === "KeyS") keys.soft = true;
    else if (code === "ArrowUp" || code === "KeyX" || code === "KeyW") {
      if (eng.phase === "playing") eng.rotate(1);
    } else if (code === "KeyZ" || code === "KeyQ") {
      if (eng.phase === "playing") eng.rotate(-1);
    } else if (code === "Space") {
      if (eng.phase === "ready" || eng.phase === "over") begin();
      else if (eng.phase === "paused") togglePause();
      else eng.hardDrop();
    } else if (code === "Enter") {
      if (eng.phase === "ready" || eng.phase === "over") begin();
      else if (eng.phase === "paused") togglePause();
    } else if (code === "KeyC" || code === "ShiftLeft" || code === "ShiftRight") {
      if (eng.phase === "playing") eng.holdPiece();
    } else if (code === "KeyP" || code === "Escape") {
      if (eng.phase === "ready") begin();
      else togglePause();
    } else if (code === "KeyM") {
      audio.unlock();
      audio.setMuted(!audio.isMuted());
      syncMute();
    }
    checkOver();
  });

  window.addEventListener("keyup", function (e) {
    const code = e.code;
    if (code === "ArrowLeft" || code === "KeyA") keys.left = false;
    else if (code === "ArrowRight" || code === "KeyD") keys.right = false;
    else if (code === "ArrowDown" || code === "KeyS") keys.soft = false;
  });

  window.addEventListener("blur", function () {
    keys.left = keys.right = keys.soft = false;
    dasDir = 0;
    eng.setSoft(false);
  });

  playBtn.addEventListener("click", begin);
  againBtn.addEventListener("click", begin);
  resumeBtn.addEventListener("click", togglePause);
  pauseBtn.addEventListener("click", function () {
    if (eng.phase === "ready") return;
    if (eng.phase === "over") return;
    togglePause();
  });
  muteBtn.addEventListener("click", function () {
    audio.unlock();
    audio.setMuted(!audio.isMuted());
    syncMute();
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden && (eng.phase === "playing" || eng.phase === "clearing")) togglePause();
  });

  function fitWell() {
    const stage = wrap.parentElement;
    const rect = stage.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return;
    const gap = parseFloat(getComputedStyle(stage).columnGap) || 0;
    const left = wrap.previousElementSibling.getBoundingClientRect().width;
    const right = wrap.nextElementSibling.getBoundingClientRect().width;
    const availW = rect.width - left - right - gap * 2;
    const cell = Math.max(8, Math.min(46, Math.floor(Math.min(availW / 10, rect.height / 20))));
    const height = cell * 20;
    wrap.style.width = (cell * 10) + "px";
    wrap.style.height = height + "px";
    stage.style.setProperty("--well-h", height + "px");
  }

  function paint(dt) {
    fitWell();
    scoreEl.textContent = fmt(eng.score);
    linesEl.textContent = String(eng.lines);
    levelEl.textContent = String(eng.level);
    bestEl.textContent = fmt(Math.max(best, eng.score));
    barEl.style.width = ((eng.lines % 10) / 10 * 100) + "%";
    if (banner.textContent !== eng.banner) {
      banner.textContent = eng.banner;
      if (eng.banner) {
        banner.classList.remove("pop");
        void banner.offsetWidth;
        banner.classList.add("pop");
      }
    }
    lastBanner = eng.banner;
    view.frame(eng, well, holdCanvas, nextCanvas, dt);
  }

  let last = 0;
  function loop(now) {
    const dt = last ? Math.min(50, now - last) : 16;
    last = now;
    const pad = readPad();
    edgePad(pad);
    if (eng.phase === "playing") stepDas(dt, pad);
    else {
      eng.setSoft(false);
      dasDir = 0;
    }
    eng.tick(dt);
    const events = eng.pullEvents();
    audio.playAll(events);
    if (events.indexOf("clear1") >= 0 || events.indexOf("clear2") >= 0 || events.indexOf("clear3") >= 0 || events.indexOf("tetris") >= 0) {
      view.burst(eng.clearRows.slice());
    }
    if (events.indexOf("tetris") >= 0 || events.indexOf("perfect") >= 0 || events.indexOf("tspin") >= 0) shake();
    checkOver();
    paint(dt);
    window.requestAnimationFrame(loop);
  }

  if (window.ResizeObserver) {
    const observer = new ResizeObserver(function () { paint(0); });
    observer.observe(document.querySelector(".app"));
  } else {
    window.addEventListener("resize", function () { paint(0); });
  }

  syncMute();
  bestEl.textContent = fmt(best);
  pauseBtn.disabled = true;
  setOverlay("title");
  paint(0);
  window.requestAnimationFrame(loop);
})();
