/**
 * Browser shell for the WASM DOOM port.
 * The shareware IWAD is preloaded (doom.data). Saves stay in IndexedDB.
 */

(function () {
  'use strict';

  const BUNDLED_IWAD = 'doom1.wad';
  const SENS_KEY = 'doom-mouse-sens';
  const RUN_KEY = 'doom-always-run';
  const DEFAULT_SENS = 100;

  const KEY = {
    ArrowUp: 0xad,
    ArrowDown: 0xaf,
    ArrowLeft: 0xac,
    ArrowRight: 0xae,
    ControlLeft: 0xa3,
    Space: 0xa2,
    ShiftLeft: 0x80 + 0x36,
    Escape: 27,
    Enter: 13,
    Tab: 9,
    BracketLeft: 0x5b,
    BracketRight: 0x5d,
    Digit1: 0x31,
    Digit2: 0x32,
    Digit3: 0x33,
    Digit4: 0x34,
    Digit5: 0x35,
    Digit6: 0x36,
    Digit7: 0x37
  };
  const STRAFE_L = 0xa0;
  const STRAFE_R = 0xa1;

  const $ = (sel) => document.querySelector(sel);
  const statusEl = $('#load-status');
  const loaderEl = $('#loader');
  const gameWrap = $('#game-wrap');
  const canvas = $('#doom-canvas');
  const frame = $('#frame');
  const touchRoot = $('#touch-controls');

  let resolveRuntime = null;
  let gameStarted = false;
  let Module = null;
  let mouseSensPct = DEFAULT_SENS;
  let alwaysRun = true;
  const coarse = window.matchMedia('(pointer: coarse)');

  function setStatus(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.classList.remove('error', 'ok');
    if (kind) statusEl.classList.add(kind);
  }

  function unlockAudio() {
    try {
      const ctx = (Module && Module.audioCtx) || (window.Module && window.Module.audioCtx);
      if (ctx && ctx.state === 'suspended') ctx.resume();
    } catch (_) {}
  }

  /* ---------- Picture size: 320×200 shown as a 4:3 monitor ---------- */

  function fitFrame() {
    const stage = $('#stage');
    if (!stage || !frame || gameWrap.classList.contains('hidden')) return;
    let sw = stage.clientWidth;
    let sh = stage.clientHeight;
    if (document.body.classList.contains('touch') && touchRoot) {
      const td = getComputedStyle(touchRoot).display;
      const ss = getComputedStyle(stage);
      if (td === 'contents') {
        const stick = touchRoot.querySelector('.stick-zone');
        const actions = touchRoot.querySelector('.touch-actions');
        const bar = touchRoot.querySelector('.touch-bar');
        const col = parseFloat(ss.columnGap) || 0;
        const row = parseFloat(ss.rowGap) || 0;
        const stickW = stick && stick.offsetWidth ? stick.offsetWidth : 108;
        const actW = actions && actions.offsetWidth ? actions.offsetWidth : 140;
        const barH = bar && bar.offsetHeight ? bar.offsetHeight : 42;
        sw -= stickW + actW + col * 2;
        sh -= barH + row;
      } else {
        sh -= touchRoot.offsetHeight + (parseFloat(ss.rowGap) || 0);
      }
    }
    if (sw < 8 || sh < 8) return;
    let w = sw;
    let h = Math.floor(w * 3 / 4);
    if (h > sh) {
      h = sh;
      w = Math.floor(h * 4 / 3);
    }
    frame.style.width = w + 'px';
    frame.style.height = h + 'px';
  }

  window.addEventListener('resize', fitFrame);
  if (window.ResizeObserver && $('#stage')) {
    new ResizeObserver(fitFrame).observe($('#stage'));
  }

  /* ---------- Module bootstrap ---------- */

  window.Module = {
    canvas: canvas,
    preRun: [],
    postRun: [],
    print: function (text) {
      if (arguments.length > 1) text = Array.prototype.slice.call(arguments).join(' ');
      console.log(text);
    },
    printErr: function (text) {
      if (arguments.length > 1) text = Array.prototype.slice.call(arguments).join(' ');
      console.error(text);
    },
    onRuntimeInitialized: function () {
      Module = window.Module;
      if (resolveRuntime) resolveRuntime(Module);
    },
    onDoomReady: function () {
      console.log('[doom] platform ready');
    },
    noInitialRun: true
  };

  function waitForRuntime() {
    return new Promise((resolve) => {
      if (window.Module && window.Module.calledRun !== undefined &&
          typeof window.Module.callMain === 'function' &&
          window.Module.asm) {
        Module = window.Module;
        resolve(Module);
        return;
      }

      resolveRuntime = (mod) => {
        Module = mod || window.Module;
        resolve(Module);
      };

      const t = setInterval(() => {
        const mod = window.Module;
        if (mod && typeof mod.callMain === 'function' &&
            (mod.HEAPU8 || (typeof HEAPU8 !== 'undefined') || mod.asm)) {
          clearInterval(t);
          Module = mod;
          resolve(mod);
        }
      }, 50);
    });
  }

  async function ensureIwad(mod) {
    const path = BUNDLED_IWAD;
    const abs = '/' + BUNDLED_IWAD;

    function exists(p) {
      try {
        if (mod.FS && typeof mod.FS.analyzePath === 'function') {
          return mod.FS.analyzePath(p).exists;
        }
        if (mod.FS && typeof mod.FS.stat === 'function') {
          mod.FS.stat(p);
          return true;
        }
      } catch (_) {}
      return false;
    }

    if (exists(path) || exists(abs)) {
      return exists(abs) ? abs : path;
    }

    setStatus('Downloading game data…');
    const res = await fetch(BUNDLED_IWAD);
    if (!res.ok) throw new Error('Could not fetch ' + BUNDLED_IWAD + ' (HTTP ' + res.status + ')');
    const buf = await res.arrayBuffer();
    mountBytes(mod, abs, new Uint8Array(buf));
    return abs;
  }

  function mountBytes(mod, virtualPath, bytes) {
    const data = bytes instanceof Int8Array ? bytes : new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const parts = virtualPath.split('/').filter(Boolean);
    const name = parts.pop();
    const parent = '/' + parts.join('/');
    const parentDir = parent === '/' ? '/' : parent;

    try {
      if (typeof mod.FS.createPath === 'function' && parentDir !== '/') {
        mod.FS.createPath('/', parts.join('/'), true, true);
      }
    } catch (_) {}

    try {
      try { mod.FS.unlink(virtualPath); } catch (_) {}
      if (typeof mod.FS.createDataFile === 'function') {
        mod.FS.createDataFile(parentDir === '' ? '/' : parentDir, name, data, true, true, true);
        return;
      }
    } catch (e) {
      console.warn('createDataFile failed, trying writeFile', e);
    }

    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    mod.FS.writeFile(virtualPath, copy);
  }

  function syncfs(mod, populate) {
    return new Promise((resolve) => {
      if (!mod.FS || typeof mod.FS.syncfs !== 'function') {
        resolve();
        return;
      }
      mod.FS.syncfs(!!populate, (err) => {
        if (err) console.warn('[doom] IDBFS syncfs failed', err);
        resolve();
      });
    });
  }

  async function setupPersistentStorage(mod) {
    if (!mod.FS) return;

    const root = '/persistent';
    try {
      try { mod.FS.mkdir(root); } catch (_) {}

      const IDBFS = mod.FS.filesystems && mod.FS.filesystems.IDBFS;
      if (!IDBFS) {
        console.warn('[doom] IDBFS unavailable — saves will not survive refresh');
        return;
      }

      let already = false;
      try {
        const st = mod.FS.analyzePath(root);
        if (st && st.object && st.object.mount && st.object.mount.type === IDBFS) {
          already = true;
        }
      } catch (_) {}

      if (!already) {
        try {
          mod.FS.mount(IDBFS, {}, root);
        } catch (e) {
          console.warn('[doom] IDBFS mount', e);
        }
      }

      setStatus('Restoring saves…');
      await syncfs(mod, true);
      try { mod.FS.mkdir(root + '/.savegame'); } catch (_) {}

      if (!mod.__saveSyncTimer) {
        mod.__saveSyncTimer = setInterval(() => { syncfs(mod, false); }, 4000);
      }
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') syncfs(mod, false);
      });
      window.addEventListener('pagehide', () => { syncfs(mod, false); });
      console.log('[doom] Persistent storage ready at', root);
    } catch (e) {
      console.warn('[doom] Persistent storage setup failed', e);
    }
  }

  function waitForPackage(mod) {
    return new Promise((resolve) => {
      let tries = 0;
      const tick = () => {
        tries++;
        try {
          if (mod.FS &&
              (mod.FS.analyzePath('/' + BUNDLED_IWAD).exists ||
               mod.FS.analyzePath(BUNDLED_IWAD).exists)) {
            resolve();
            return;
          }
        } catch (_) {}
        if (tries >= 6) {
          resolve();
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  function engine() {
    return Module || window.Module;
  }

  function applyMouseSens(pct) {
    mouseSensPct = pct;
    const slider = $('#mouse-sens');
    const label = $('#mouse-sens-value');
    if (slider) {
      slider.value = String(pct);
      slider.setAttribute('aria-valuenow', String(pct));
    }
    if (label) label.textContent = pct + '%';
    try { localStorage.setItem(SENS_KEY, String(pct)); } catch (_) {}
    const mod = engine();
    if (mod && typeof mod._DG_SetMouseSensitivity === 'function') {
      mod._DG_SetMouseSensitivity(pct);
    }
  }

  function applyAlwaysRun(on) {
    alwaysRun = !!on;
    const box = $('#always-run');
    if (box) box.checked = alwaysRun;
    const help = $('#shift-help');
    const walk = $('#walk-btn');
    if (help) help.textContent = alwaysRun ? 'Walk (Run is on)' : 'Run (Run is off)';
    if (walk) walk.textContent = alwaysRun ? 'WALK' : 'RUN';
    try { localStorage.setItem(RUN_KEY, alwaysRun ? '1' : '0'); } catch (_) {}
    const mod = engine();
    if (mod && typeof mod._DG_SetAlwaysRun === 'function') {
      mod._DG_SetAlwaysRun(alwaysRun ? 1 : 0);
    }
  }

  function loadSavedSens() {
    try {
      const v = parseInt(localStorage.getItem(SENS_KEY), 10);
      if (!isNaN(v) && v >= 25 && v <= 250) return v;
    } catch (_) {}
    return DEFAULT_SENS;
  }

  function loadSavedRun() {
    try {
      const v = localStorage.getItem(RUN_KEY);
      if (v === '0') return false;
      if (v === '1') return true;
    } catch (_) {}
    return true;
  }

  function initSettingsUi() {
    mouseSensPct = loadSavedSens();
    alwaysRun = loadSavedRun();
    const slider = $('#mouse-sens');
    if (slider) {
      slider.value = String(mouseSensPct);
      slider.addEventListener('input', () => {
        applyMouseSens(parseInt(slider.value, 10) || DEFAULT_SENS);
      });
    }
    const box = $('#always-run');
    if (box) {
      box.checked = alwaysRun;
      box.addEventListener('change', () => applyAlwaysRun(box.checked));
    }
    applyMouseSens(mouseSensPct);
    applyAlwaysRun(alwaysRun);

    const toggle = $('#controls-toggle');
    const panel = $('#controls-panel');
    if (toggle && panel) {
      toggle.addEventListener('click', () => {
        const open = panel.hasAttribute('hidden');
        if (open) panel.removeAttribute('hidden');
        else panel.setAttribute('hidden', '');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        requestAnimationFrame(fitFrame);
      });
    }

    const full = $('#full-btn');
    if (full) {
      full.addEventListener('click', () => {
        const root = $('#app');
        if (!document.fullscreenElement) {
          const req = root.requestFullscreen || root.webkitRequestFullscreen;
          if (req) req.call(root);
        } else if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      });
      document.addEventListener('fullscreenchange', () => {
        full.setAttribute('aria-pressed', document.fullscreenElement ? 'true' : 'false');
        full.textContent = document.fullscreenElement ? 'Window' : 'Full screen';
        requestAnimationFrame(fitFrame);
      });
    }
  }

  initSettingsUi();

  async function autoStart() {
    if (gameStarted) return;
    setStatus('Loading engine…');

    try {
      const mod = await waitForRuntime();
      setStatus('Preparing game data…');
      await waitForPackage(mod);
      await setupPersistentStorage(mod);
      const iwadPath = await ensureIwad(mod);
      unlockAudio();

      setStatus('Ready', 'ok');
      if (loaderEl) loaderEl.classList.add('hidden');
      gameWrap.classList.remove('hidden');
      document.body.classList.add('playing');
      if (coarse.matches) document.body.classList.add('touch');
      fitFrame();
      canvas.focus();

      gameStarted = true;
      applyMouseSens(mouseSensPct);
      applyAlwaysRun(alwaysRun);

      const args = ['doom', '-iwad', iwadPath];
      try {
        mod.callMain(args);
      } catch (e) {
        if (!(e && e.name === 'ExitStatus')) throw e;
      }
      applyMouseSens(mouseSensPct);
      applyAlwaysRun(alwaysRun);
      requestAnimationFrame(fitFrame);
    } catch (e) {
      console.error(e);
      setStatus('Failed to start: ' + (e && e.message ? e.message : e), 'error');
      gameStarted = false;
      if (loaderEl) loaderEl.classList.remove('hidden');
      gameWrap.classList.add('hidden');
      document.body.classList.remove('playing');
    }
  }

  /* ---------- Pointer lock ---------- */

  canvas.addEventListener('click', () => {
    if (!gameStarted || coarse.matches) return;
    unlockAudio();
    if (document.pointerLockElement !== canvas) {
      const req = canvas.requestPointerLock || canvas.mozRequestPointerLock;
      try { if (req) req.call(canvas); } catch (_) {}
    }
  });

  document.addEventListener('pointerdown', unlockAudio);
  document.addEventListener('keydown', unlockAudio);

  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    const hint = $('#hud-hint');
    if (!hint) return;
    hint.textContent = locked
      ? 'Mouse captured · Esc opens the menu and releases the mouse'
      : 'Click the picture for the mouse and for sound · Esc opens the menu';
  });

  /* ---------- Keys pushed from the pad, the stick, and buttons ---------- */

  const virtual = new Map();

  function pushKey(doomKey, pressed) {
    const mod = engine();
    if (!mod || typeof mod._DG_PushKey !== 'function') return;
    mod._DG_PushKey(pressed ? 1 : 0, doomKey);
  }

  function pushMouse(dx) {
    const mod = engine();
    if (!mod || typeof mod._DG_PushMouse !== 'function' || !dx) return;
    mod._DG_PushMouse(-1, dx | 0, 0);
  }

  function setVirtual(doomKey, down) {
    const prev = !!virtual.get(doomKey);
    if (prev === down) return;
    virtual.set(doomKey, down);
    pushKey(doomKey, down);
  }

  function releaseVirtual() {
    virtual.forEach((down, key) => {
      if (down) pushKey(key, false);
    });
    virtual.clear();
  }

  window.addEventListener('blur', releaseVirtual);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') releaseVirtual();
  });

  function bindTouchButton(btn) {
    const code = btn.getAttribute('data-key');
    const doomKey = KEY[code];
    if (doomKey === undefined) return;
    const down = (e) => {
      e.preventDefault();
      e.stopPropagation();
      unlockAudio();
      btn.classList.add('active');
      setVirtual(doomKey, true);
    };
    const up = (e) => {
      e.preventDefault();
      btn.classList.remove('active');
      setVirtual(doomKey, false);
    };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
  }

  if (touchRoot) {
    touchRoot.querySelectorAll('.tbtn').forEach(bindTouchButton);
  }

  /* Left stick: forward/back and sidestep. Drag on the picture turns. */

  const stickZone = $('#move-stick');
  const knob = stickZone ? stickZone.querySelector('.stick-knob') : null;
  const stickPointers = new Map();

  function applyStick(dx, dy) {
    const base = stickZone ? stickZone.querySelector('.stick-base') : null;
    const limit = base ? Math.max(24, base.clientWidth / 2 - 16) : 46;
    const nx = Math.max(-1, Math.min(1, dx / limit));
    const ny = Math.max(-1, Math.min(1, dy / limit));
    const dead = 0.28;
    setVirtual(KEY.ArrowUp, ny < -dead);
    setVirtual(KEY.ArrowDown, ny > dead);
    setVirtual(STRAFE_L, nx < -dead);
    setVirtual(STRAFE_R, nx > dead);
    if (knob) knob.style.transform = 'translate(' + (nx * limit) + 'px,' + (ny * limit) + 'px)';
  }

  function clearStick() {
    setVirtual(KEY.ArrowUp, false);
    setVirtual(KEY.ArrowDown, false);
    setVirtual(STRAFE_L, false);
    setVirtual(STRAFE_R, false);
    if (knob) knob.style.transform = '';
  }

  if (stickZone) {
    stickZone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      unlockAudio();
      stickZone.setPointerCapture(e.pointerId);
      const rect = stickZone.querySelector('.stick-base').getBoundingClientRect();
      stickPointers.set(e.pointerId, {
        ox: rect.left + rect.width / 2,
        oy: rect.top + rect.height / 2
      });
      const origin = stickPointers.get(e.pointerId);
      applyStick(e.clientX - origin.ox, e.clientY - origin.oy);
    });
    stickZone.addEventListener('pointermove', (e) => {
      const origin = stickPointers.get(e.pointerId);
      if (!origin) return;
      e.preventDefault();
      applyStick(e.clientX - origin.ox, e.clientY - origin.oy);
    });
    const endStick = (e) => {
      if (!stickPointers.has(e.pointerId)) return;
      stickPointers.delete(e.pointerId);
      if (stickPointers.size === 0) clearStick();
    };
    stickZone.addEventListener('pointerup', endStick);
    stickZone.addEventListener('pointercancel', endStick);
  }

  /* Touch only. preventDefault keeps the browser from also sending a mouse drag. */
  let lookX = null;
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    unlockAudio();
    lookX = e.touches[0].clientX;
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (lookX == null || e.touches.length !== 1) return;
    e.preventDefault();
    const x = e.touches[0].clientX;
    pushMouse(Math.round((x - lookX) * 0.75));
    lookX = x;
  }, { passive: false });
  const endLook = () => { lookX = null; };
  canvas.addEventListener('touchend', endLook);
  canvas.addEventListener('touchcancel', endLook);

  if (typeof coarse.addEventListener === 'function') {
    coarse.addEventListener('change', () => {
      document.body.classList.toggle('touch', coarse.matches && gameStarted);
    });
  }

  /* ---------- Gamepad ---------- */

  const padState = {};
  function setPad(name, doomKey, down) {
    if (padState[name] === down) return;
    padState[name] = down;
    setVirtual(doomKey, down);
  }

  function pollGamepad() {
    const mod = engine();
    if (gameStarted && mod && typeof mod._DG_PushKey === 'function' && navigator.getGamepads) {
      const pads = navigator.getGamepads();
      let gp = null;
      for (let i = 0; i < pads.length; i++) {
        if (pads[i]) { gp = pads[i]; break; }
      }
      if (gp) {
        const dead = 0.28;
        const lx = gp.axes[0] || 0;
        const ly = gp.axes[1] || 0;
        const rx = gp.axes[2] || 0;
        const b = (n) => !!(gp.buttons[n] && (gp.buttons[n].pressed || gp.buttons[n].value > 0.45));
        setPad('up', KEY.ArrowUp, b(12) || ly < -dead);
        setPad('down', KEY.ArrowDown, b(13) || ly > dead);
        setPad('left', KEY.ArrowLeft, b(14));
        setPad('right', KEY.ArrowRight, b(15));
        setPad('sleft', STRAFE_L, lx < -dead);
        setPad('sright', STRAFE_R, lx > dead);
        setPad('fire', KEY.ControlLeft, b(7));
        setPad('use', KEY.Space, b(0));
        setPad('enter', KEY.Enter, b(0));
        setPad('esc', KEY.Escape, b(1) || b(9));
        setPad('prev', KEY.BracketLeft, b(4));
        setPad('next', KEY.BracketRight, b(5));
        setPad('map', KEY.Tab, b(8));
        setPad('walk', KEY.ShiftLeft, b(10));
        if (Math.abs(rx) > 0.18) {
          pushMouse(Math.round(rx * 18));
        }
      } else if (Object.keys(padState).some((name) => padState[name])) {
        setPad('up', KEY.ArrowUp, false);
        setPad('down', KEY.ArrowDown, false);
        setPad('left', KEY.ArrowLeft, false);
        setPad('right', KEY.ArrowRight, false);
        setPad('sleft', STRAFE_L, false);
        setPad('sright', STRAFE_R, false);
        setPad('fire', KEY.ControlLeft, false);
        setPad('use', KEY.Space, false);
        setPad('enter', KEY.Enter, false);
        setPad('esc', KEY.Escape, false);
        setPad('prev', KEY.BracketLeft, false);
        setPad('next', KEY.BracketRight, false);
        setPad('map', KEY.Tab, false);
        setPad('walk', KEY.ShiftLeft, false);
      }
    }
    requestAnimationFrame(pollGamepad);
  }
  requestAnimationFrame(pollGamepad);

  /* ---------- Service worker ---------- */

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => {
        console.warn('SW register failed', err);
      });
    });
  }

  setStatus('Loading…');
  autoStart();
})();
