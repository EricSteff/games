/**
 * ASTEROIDS — Faithful recreation of Atari's 1979 vector arcade game
 * Designed by Lyle Rains & Ed Logg
 *
 * Features modeled after the original:
 * - XY vector graphics on black field with phosphor-style glow
 * - Ship inertia / thrust with mild friction
 * - Screen wrap-around on both axes
 * - 4 asteroid silhouette shapes, 3 sizes (split large→2 med→2 small)
 * - Max 4 simultaneous player bullets
 * - Hyperspace with ~1/6 destruction chance
 * - Large (random fire) & small (aimed) saucers
 * - After 40,000 pts only small saucers appear
 * - Scoring: 20 / 50 / 100 rocks, 200 / 1000 saucers
 * - Extra life every 10,000 points
 * - Heartbeat thump that accelerates as danger rises
 * - Discrete-circuit style Web Audio SFX (no BGM — original had none)
 * - High-score initials entry (session memory only; host can persist via AsteroidsGame API)
 * - Attract / coin-up flow
 */

(() => {
  "use strict";

  // ─── Canvas / coordinate system ───────────────────────────────────────────
  // Original DVG effective resolution ≈ 1024×768
  const W = 1024;
  const H = 768;
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const overlayMsg = document.getElementById("overlay-msg");

  // ─── Tuning (relative to ship length ≈ 22 units) ──────────────────────────
  const SHIP_SIZE = 11;
  const ROT_SPEED = 4.2; // rad/s
  // Original DVG rendered ship at ~5° intervals
  const ANGLE_STEP = (5 * Math.PI) / 180;
  const THRUST_ACC = 220; // px/s²
  const MAX_SPEED = 340; // ~17 ship-lengths/s when ship≈20px
  const FRICTION = 0.45; // mild drag (Logg settled on some friction)
  const BULLET_SPEED = 480;
  const BULLET_LIFE = 1.15; // seconds
  const MAX_BULLETS = 4;
  const FIRE_COOLDOWN = 0.14;
  const HYPER_COOLDOWN = 0.8;
  const HYPER_DEATH_CHANCE = 1 / 6;
  const INVULN_TIME = 2.5;
  const MAX_ASTEROIDS = 26;
  const START_LIVES = 3;
  const EXTRA_LIFE_EVERY = 10000;
  const SAUCER_SCORE_SMALL_ONLY = 40000;

  // Asteroid radii (px) — ratios ≈ 2.4 : 1.2 : 0.6 ship lengths
  const ROCK_R = { large: 42, medium: 22, small: 11 };
  const ROCK_SPEED = {
    large: [55, 85],
    medium: [70, 110],
    small: [90, 140],
  };
  const ROCK_SCORE = { large: 20, medium: 50, small: 100 };
  const ROCK_NEXT = { large: "medium", medium: "small", small: null };

  // ─── Vector shapes (unit space; +X = forward / nose) ──────────────────────
  // Angles use standard math: 0 = right, -π/2 = up. Cos/sin match draw + fire.
  // Silhouette inspired by Ed Logg's design (triangle + rear notch).
  const SHIP_PTS = [
    [1.1, 0], // tip (nose)
    [-0.95, 0.75], // upper wing
    [-0.55, 0.28], // upper notch
    [-0.55, -0.28], // lower notch
    [-0.95, -0.75], // lower wing
  ];
  // Flame when thrusting (aft of ship, −X)
  const FLAME_PTS = [
    [-0.55, 0.22],
    [-1.15, 0],
    [-0.55, -0.22],
  ];

  // Four classic irregular rock silhouettes (closed polygons)
  const ROCK_SHAPES = [
    [
      [0.0, -1.0],
      [0.55, -0.85],
      [1.0, -0.3],
      [0.85, 0.45],
      [0.25, 1.0],
      [-0.5, 0.9],
      [-1.0, 0.2],
      [-0.7, -0.55],
      [-0.25, -0.95],
    ],
    [
      [0.1, -1.0],
      [0.7, -0.7],
      [0.95, -0.1],
      [0.6, 0.55],
      [0.15, 0.95],
      [-0.55, 0.8],
      [-0.95, 0.25],
      [-0.85, -0.45],
      [-0.35, -0.9],
    ],
    [
      [-0.15, -0.95],
      [0.4, -1.0],
      [0.95, -0.45],
      [1.0, 0.2],
      [0.5, 0.85],
      [-0.2, 1.0],
      [-0.8, 0.55],
      [-1.0, -0.15],
      [-0.55, -0.75],
    ],
    [
      [0.0, -0.9],
      [0.65, -0.8],
      [0.9, -0.15],
      [0.75, 0.5],
      [0.2, 0.95],
      [-0.4, 0.85],
      [-0.9, 0.35],
      [-0.95, -0.35],
      [-0.4, -0.85],
    ],
  ];

  // Saucer: elongated body with cockpit ridge (classic Atari outline)
  const SAUCER_BODY = [
    [-1.0, 0.0],
    [-0.55, -0.35],
    [-0.2, -0.35],
    [0.0, -0.55],
    [0.2, -0.35],
    [0.55, -0.35],
    [1.0, 0.0],
    [0.55, 0.35],
    [-0.55, 0.35],
  ];
  const SAUCER_LINE = [
    [-0.7, 0.0],
    [0.7, 0.0],
  ];

  // ─── Input ────────────────────────────────────────────────────────────────
  const keys = Object.create(null);
  const justPressed = Object.create(null);

  window.addEventListener("keydown", (e) => {
    const k = e.code;
    if (
      [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Space",
        "KeyA",
        "KeyD",
        "KeyW",
        "KeyS",
        "ShiftLeft",
        "ShiftRight",
        "KeyH",
        "Digit1",
        "Enter",
        "KeyM",
      ].includes(k)
    ) {
      e.preventDefault();
    }
    if (!keys[k]) justPressed[k] = true;
    keys[k] = true;
    // Unlock audio on first interaction
    AudioFX.resume();
  });
  window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
  });
  // Touch / click to start
  canvas.addEventListener("pointerdown", () => {
    AudioFX.resume();
    if (state.mode === "attract" || state.mode === "gameover") {
      startGame();
    }
  });

  // ─── Math helpers ─────────────────────────────────────────────────────────
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => (a + Math.floor(Math.random() * (b - a + 1))) | 0;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrap = (v, max) => ((v % max) + max) % max;
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const angDiff = (a, b) => {
    let d = ((b - a + Math.PI) % TAU) - Math.PI;
    if (d < -Math.PI) d += TAU;
    return d;
  };

  // Shortest distance accounting for wrap-around (for saucer aim / collisions)
  function wrapDelta(ax, ay, bx, by) {
    let dx = bx - ax;
    let dy = by - ay;
    if (dx > W / 2) dx -= W;
    if (dx < -W / 2) dx += W;
    if (dy > H / 2) dy -= H;
    if (dy < -H / 2) dy += H;
    return { dx, dy };
  }

  // ─── Audio (Web Audio — discrete-circuit character) ───────────────────────
  const AudioFX = (() => {
    let ac = null;
    let muted = false;
    let master = null;
    let thrustOsc = null;
    let thrustGain = null;
    let thrustNoise = null;
    let saucerOsc = null;
    let saucerGain = null;
    let saucerLfo = null;
    let saucerActive = false;

    function ensure() {
      if (ac) return;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      ac = new Ctx();
      master = ac.createGain();
      master.gain.value = 0.35;
      master.connect(ac.destination);
    }

    function resume() {
      ensure();
      if (ac && ac.state === "suspended") ac.resume();
    }

    function setMuted(m) {
      muted = m;
      if (master) master.gain.value = muted ? 0 : 0.35;
    }

    function beep(freq, dur, type = "square", vol = 0.2, slide = 0) {
      if (!ac || muted) return;
      const t = ac.currentTime;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + dur + 0.02);
    }

    function noiseBurst(dur, vol = 0.25, filterFreq = 800) {
      if (!ac || muted) return;
      const t = ac.currentTime;
      const len = Math.floor(ac.sampleRate * dur);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      }
      const src = ac.createBufferSource();
      src.buffer = buf;
      const filter = ac.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = filterFreq;
      filter.Q.value = 0.6;
      const g = ac.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(filter);
      filter.connect(g);
      g.connect(master);
      src.start(t);
      src.stop(t + dur + 0.02);
    }

    function fire() {
      // Sharp descending square "pew"
      beep(880, 0.08, "square", 0.18, -500);
      beep(440, 0.06, "square", 0.08, -200);
    }

    function bang(size) {
      // Harsh noise bangs — small / medium / large
      if (size === "small") {
        noiseBurst(0.18, 0.28, 1200);
        beep(120, 0.12, "sawtooth", 0.12, -80);
      } else if (size === "medium") {
        noiseBurst(0.28, 0.35, 700);
        beep(90, 0.2, "sawtooth", 0.15, -60);
      } else {
        noiseBurst(0.42, 0.42, 400);
        beep(55, 0.35, "sawtooth", 0.2, -40);
      }
    }

    function extraLife() {
      // Rising chirp sequence
      if (!ac || muted) return;
      const t = ac.currentTime;
      [523, 659, 784, 1047].forEach((f, i) => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = "square";
        o.frequency.value = f;
        const start = t + i * 0.09;
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(0.15, start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, start + 0.12);
        o.connect(g);
        g.connect(master);
        o.start(start);
        o.stop(start + 0.14);
      });
    }

    function beat(which) {
      // Alternating low thumps (beat1 / beat2)
      const f = which === 1 ? 55 : 48;
      beep(f, 0.08, "square", 0.22);
      noiseBurst(0.06, 0.08, 200);
    }

    function startThrust() {
      if (!ac || muted || thrustOsc) return;
      const t = ac.currentTime;
      // Low saw + filtered noise rumble
      thrustOsc = ac.createOscillator();
      thrustOsc.type = "sawtooth";
      thrustOsc.frequency.value = 55;
      thrustGain = ac.createGain();
      thrustGain.gain.setValueAtTime(0, t);
      thrustGain.gain.linearRampToValueAtTime(0.08, t + 0.05);

      const len = ac.sampleRate;
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      thrustNoise = ac.createBufferSource();
      thrustNoise.buffer = buf;
      thrustNoise.loop = true;
      const nf = ac.createBiquadFilter();
      nf.type = "lowpass";
      nf.frequency.value = 350;
      const ng = ac.createGain();
      ng.gain.value = 0.12;

      thrustOsc.connect(thrustGain);
      thrustGain.connect(master);
      thrustNoise.connect(nf);
      nf.connect(ng);
      ng.connect(master);
      thrustOsc.start();
      thrustNoise.start();
      // Keep ref for noise gain stop
      thrustGain._noiseGain = ng;
    }

    function stopThrust() {
      if (!thrustOsc) return;
      const t = ac.currentTime;
      try {
        thrustGain.gain.cancelScheduledValues(t);
        thrustGain.gain.setValueAtTime(thrustGain.gain.value, t);
        thrustGain.gain.linearRampToValueAtTime(0, t + 0.05);
        thrustOsc.stop(t + 0.06);
        thrustNoise.stop(t + 0.06);
      } catch (_) {}
      thrustOsc = null;
      thrustGain = null;
      thrustNoise = null;
    }

    function startSaucer(small) {
      stopSaucer();
      if (!ac || muted) return;
      const t = ac.currentTime;
      saucerOsc = ac.createOscillator();
      saucerOsc.type = "square";
      // Small saucer higher pitch / faster warble
      const base = small ? 520 : 280;
      const depth = small ? 80 : 50;
      const rate = small ? 8 : 4.5;
      saucerOsc.frequency.value = base;
      saucerLfo = ac.createOscillator();
      saucerLfo.type = "sine";
      saucerLfo.frequency.value = rate;
      const lfoGain = ac.createGain();
      lfoGain.gain.value = depth;
      saucerLfo.connect(lfoGain);
      lfoGain.connect(saucerOsc.frequency);
      saucerGain = ac.createGain();
      saucerGain.gain.value = 0.07;
      saucerOsc.connect(saucerGain);
      saucerGain.connect(master);
      saucerOsc.start(t);
      saucerLfo.start(t);
      saucerActive = true;
    }

    function stopSaucer() {
      if (!saucerOsc) return;
      const t = ac ? ac.currentTime : 0;
      try {
        saucerOsc.stop(t + 0.02);
        saucerLfo.stop(t + 0.02);
      } catch (_) {}
      saucerOsc = null;
      saucerLfo = null;
      saucerGain = null;
      saucerActive = false;
    }

    function saucerShot() {
      beep(660, 0.1, "square", 0.12, -300);
    }

    function hyperspace() {
      noiseBurst(0.15, 0.2, 2000);
      beep(200, 0.15, "sawtooth", 0.1, 400);
    }

    return {
      resume,
      setMuted,
      isMuted: () => muted,
      fire,
      bang,
      extraLife,
      beat,
      startThrust,
      stopThrust,
      startSaucer,
      stopSaucer,
      saucerShot,
      hyperspace,
      isSaucerActive: () => saucerActive,
    };
  })();

  // ─── Drawing (vector with phosphor glow) ──────────────────────────────────
  function setGlow(intensity = 1) {
    ctx.strokeStyle = "#e8ffe8";
    ctx.fillStyle = "#e8ffe8";
    ctx.shadowColor = "rgba(160, 255, 160, 0.85)";
    ctx.shadowBlur = 6 * intensity;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
  }

  function drawPoly(points, x, y, scale, angle, closed = true) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const px = points[i][0] * scale;
      const py = points[i][1] * scale;
      const rx = px * c - py * s + x;
      const ry = px * s + py * c + y;
      if (i === 0) ctx.moveTo(rx, ry);
      else ctx.lineTo(rx, ry);
    }
    if (closed) ctx.closePath();
    ctx.stroke();
  }

  function drawLine(a, b, x, y, scale, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const ax = a[0] * scale;
    const ay = a[1] * scale;
    const bx = b[0] * scale;
    const by = b[1] * scale;
    ctx.beginPath();
    ctx.moveTo(ax * c - ay * s + x, ax * s + ay * c + y);
    ctx.lineTo(bx * c - by * s + x, bx * s + by * c + y);
    ctx.stroke();
  }

  // Minimal 5×7 style vector font for score / titles
  const FONT = {
    "0": "111101101101111",
    "1": "010010010010010",
    "2": "111001111100111",
    "3": "111001111001111",
    "4": "101101111001001",
    "5": "111100111001111",
    "6": "111100111101111",
    "7": "111001001001001",
    "8": "111101111101111",
    "9": "111101111001111",
    A: "010101111101101",
    B: "110101110101110",
    C: "111100100100111",
    D: "110101101101110",
    E: "111100110100111",
    F: "111100110100100",
    G: "111100101101111",
    H: "101101111101101",
    I: "111010010010111",
    J: "001001001101111",
    K: "101101110101101",
    L: "100100100100111",
    M: "101111111101101",
    N: "101111111111101",
    O: "111101101101111",
    P: "111101111100100",
    Q: "111101101111001",
    R: "111101110101101",
    S: "111100111001111",
    T: "111010010010010",
    U: "101101101101111",
    V: "101101101101010",
    W: "101101111111101",
    X: "101101010101101",
    Y: "101101010010010",
    Z: "111001010100111",
    " ": "000000000000000",
    "-": "000000111000000",
    ".": "000000000000010",
    "!": "010010010000010",
    ":": "000010000010000",
  };

  function drawChar(ch, x, y, size) {
    const g = FONT[ch] || FONT[" "];
    const s = size / 5;
    ctx.beginPath();
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        if (g[row * 3 + col] === "1") {
          const px = x + col * s;
          const py = y + row * s;
          ctx.rect(px, py, s * 0.85, s * 0.85);
        }
      }
    }
    ctx.fill();
  }

  function drawText(str, x, y, size, align = "left") {
    const spacing = size * 0.75;
    let startX = x;
    if (align === "center") startX = x - (str.length * spacing) / 2;
    if (align === "right") startX = x - str.length * spacing;
    for (let i = 0; i < str.length; i++) {
      drawChar(str[i].toUpperCase(), startX + i * spacing, y, size);
    }
  }

  // ─── Entities ─────────────────────────────────────────────────────────────
  function makeShip() {
    const angle = -Math.PI / 2; // nose up
    return {
      x: W / 2,
      y: H / 2,
      vx: 0,
      vy: 0,
      angle,
      drawAngle: angle,
      alive: true,
      invuln: INVULN_TIME,
      thrusting: false,
      fireTimer: 0,
      hyperTimer: 0,
    };
  }

  function makeRock(size, x, y, parentVx = 0, parentVy = 0) {
    const [smin, smax] = ROCK_SPEED[size];
    const speed = rand(smin, smax);
    const ang = rand(0, TAU);
    // Kick perpendicular / random from parent velocity so splits scatter
    const kick = size === "large" ? 0 : rand(20, 60);
    return {
      size,
      x: x ?? rand(0, W),
      y: y ?? rand(0, H),
      vx: Math.cos(ang) * speed + parentVx * 0.3 + rand(-kick, kick),
      vy: Math.sin(ang) * speed + parentVy * 0.3 + rand(-kick, kick),
      // Original Asteroids rocks do not rotate (Deluxe added spin)
      angle: rand(0, TAU),
      spin: 0,
      shape: randInt(0, ROCK_SHAPES.length - 1),
      r: ROCK_R[size],
    };
  }

  function makeBullet(x, y, angle, owner) {
    return {
      x,
      y,
      vx: Math.cos(angle) * BULLET_SPEED,
      vy: Math.sin(angle) * BULLET_SPEED,
      life: BULLET_LIFE,
      owner, // "player" | "saucer"
    };
  }

  function makeSaucer(small) {
    const fromLeft = Math.random() < 0.5;
    const y = rand(H * 0.15, H * 0.85);
    const speed = small ? rand(90, 130) : rand(70, 100);
    return {
      small,
      x: fromLeft ? -20 : W + 20,
      y,
      vx: fromLeft ? speed : -speed,
      vy: rand(-25, 25),
      r: small ? 14 : 28,
      fireTimer: small ? 0.6 : 1.0,
      dirTimer: rand(0.8, 1.8),
      alive: true,
    };
  }

  function makeDebris(x, y, n, speed) {
    const bits = [];
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const sp = rand(speed * 0.4, speed);
      bits.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.4, 1.0),
        maxLife: 1,
        len: rand(4, 14),
        angle: a,
      });
    }
    return bits;
  }

  // ─── Game state ───────────────────────────────────────────────────────────
  const state = {
    mode: "attract", // attract | play | dying | gameover | enterscore
    score: 0,
    // Session-only high score (no localStorage — host site can wire persistence later)
    highScore: 0,
    lives: START_LIVES,
    wave: 0,
    ship: makeShip(),
    rocks: [],
    bullets: [],
    saucer: null,
    debris: [],
    saucerTimer: 8,
    beatTimer: 0,
    beatInterval: 1.0,
    beatWhich: 1,
    deathTimer: 0,
    respawnTimer: 0,
    flash: 0,
    initials: ["A", "A", "A"],
    initialIndex: 0,
    attractRocks: [],
    attractTimer: 0,
    coins: 0,
    lastExtraLifeAt: 0,
  };

  function resetWave(first) {
    state.wave = first ? 1 : state.wave + 1;
    // Start with 4 large, +2 per wave, cap around 11
    const count = Math.min(4 + (state.wave - 1) * 2, 11);
    state.rocks = [];
    const ship = state.ship;
    for (let i = 0; i < count; i++) {
      let x, y;
      // Spawn away from ship
      do {
        x = rand(0, W);
        y = rand(0, H);
      } while (dist(x, y, ship.x, ship.y) < 180);
      state.rocks.push(makeRock("large", x, y));
    }
    // Beat speeds up with wave / remaining danger
    updateBeatRate();
  }

  function updateBeatRate() {
    // Heartbeat accelerates as fewer rocks remain and wave climbs
    const n = state.rocks.length;
    const base = clamp(1.05 - state.wave * 0.04 - (26 - n) * 0.015, 0.22, 1.1);
    state.beatInterval = base;
  }

  function addScore(pts) {
    const prev = state.score;
    state.score += pts;
    // Extra life every 10k
    const prevBucket = Math.floor(prev / EXTRA_LIFE_EVERY);
    const newBucket = Math.floor(state.score / EXTRA_LIFE_EVERY);
    if (newBucket > prevBucket) {
      state.lives++;
      AudioFX.extraLife();
    }
    if (state.score > state.highScore) {
      state.highScore = state.score;
    }
  }

  function startGame() {
    AudioFX.resume();
    AudioFX.stopSaucer();
    AudioFX.stopThrust();
    state.mode = "play";
    state.score = 0;
    state.lives = START_LIVES;
    state.wave = 0;
    state.bullets = [];
    state.debris = [];
    state.saucer = null;
    state.saucerTimer = 12;
    state.ship = makeShip();
    state.ship.invuln = INVULN_TIME;
    state.lastExtraLifeAt = 0;
    hideOverlay();
    resetWave(true);
  }

  function killShip() {
    if (!state.ship.alive || state.ship.invuln > 0) return;
    state.ship.alive = false;
    AudioFX.stopThrust();
    AudioFX.bang("large");
    state.debris.push(...makeDebris(state.ship.x, state.ship.y, 12, 160));
    // Ship line pieces
    for (let i = 0; i < 5; i++) {
      const a = rand(0, TAU);
      state.debris.push({
        x: state.ship.x,
        y: state.ship.y,
        vx: Math.cos(a) * rand(40, 120),
        vy: Math.sin(a) * rand(40, 120),
        life: rand(0.8, 1.6),
        maxLife: 1.6,
        len: rand(8, 18),
        angle: a,
      });
    }
    state.lives--;
    state.mode = "dying";
    state.deathTimer = 1.6;
    state.flash = 0.15;
  }

  function tryRespawn() {
    if (state.lives <= 0) {
      state.mode = "gameover";
      AudioFX.stopSaucer();
      AudioFX.stopThrust();
      if (state.score > 0 && state.score >= state.highScore) {
        // already updated hi; still allow initials for atmosphere
      }
      state.initials = ["A", "A", "A"];
      state.initialIndex = 0;
      // Enter score if among top or any score > 0 for arcade feel
      if (state.score > 0) {
        state.mode = "enterscore";
      }
      return;
    }
    // Safe spawn: clear of rocks
    let safe = false;
    let sx = W / 2;
    let sy = H / 2;
    for (let attempt = 0; attempt < 40 && !safe; attempt++) {
      sx = attempt === 0 ? W / 2 : rand(W * 0.2, W * 0.8);
      sy = attempt === 0 ? H / 2 : rand(H * 0.2, H * 0.8);
      safe = true;
      for (const r of state.rocks) {
        if (dist(sx, sy, r.x, r.y) < r.r + 60) {
          safe = false;
          break;
        }
      }
      if (state.saucer && dist(sx, sy, state.saucer.x, state.saucer.y) < 100) {
        safe = false;
      }
    }
    state.ship = makeShip();
    state.ship.x = sx;
    state.ship.y = sy;
    state.ship.invuln = INVULN_TIME;
    state.mode = "play";
  }

  function splitRock(rock, bulletVx = 0, bulletVy = 0) {
    const next = ROCK_NEXT[rock.size];
    AudioFX.bang(rock.size === "large" ? "large" : rock.size === "medium" ? "medium" : "small");
    addScore(ROCK_SCORE[rock.size]);
    state.debris.push(...makeDebris(rock.x, rock.y, rock.size === "large" ? 8 : 5, 100));

    if (!next) return;
    // Cap at MAX_ASTEROIDS (original quirk)
    const room = MAX_ASTEROIDS - state.rocks.length;
    const make = room >= 2 ? 2 : room >= 1 ? 1 : 0;
    for (let i = 0; i < make; i++) {
      state.rocks.push(makeRock(next, rock.x, rock.y, rock.vx * 0.5 + bulletVx * 0.05, rock.vy * 0.5 + bulletVy * 0.05));
    }
  }

  function destroySaucer() {
    if (!state.saucer) return;
    const s = state.saucer;
    addScore(s.small ? 1000 : 200);
    AudioFX.bang(s.small ? "medium" : "large");
    AudioFX.stopSaucer();
    state.debris.push(...makeDebris(s.x, s.y, 10, 140));
    state.saucer = null;
    state.saucerTimer = rand(8, 16);
  }

  // ─── Collision ────────────────────────────────────────────────────────────
  function circleHit(ax, ay, ar, bx, by, br) {
    // Wrap-aware
    const { dx, dy } = wrapDelta(ax, ay, bx, by);
    return dx * dx + dy * dy < (ar + br) * (ar + br);
  }

  // ─── Update ───────────────────────────────────────────────────────────────
  function update(dt) {
    // Mute toggle
    if (justPressed.KeyM) {
      AudioFX.setMuted(!AudioFX.isMuted());
    }

    if (state.mode === "attract") {
      updateAttract(dt);
      // Start
      if (justPressed.Digit1 || justPressed.Enter || justPressed.Space) {
        startGame();
      }
      clearJust();
      return;
    }

    if (state.mode === "enterscore") {
      updateInitials();
      clearJust();
      return;
    }

    if (state.mode === "gameover") {
      if (justPressed.Digit1 || justPressed.Enter || justPressed.Space) {
        startGame();
      }
      // Still animate rocks slowly
      updateWorld(dt, false);
      clearJust();
      return;
    }

    if (state.mode === "dying") {
      state.deathTimer -= dt;
      updateWorld(dt, false);
      updateDebris(dt);
      if (state.deathTimer <= 0) {
        tryRespawn();
      }
      clearJust();
      return;
    }

    // PLAY
    updateShip(dt);
    updateWorld(dt, true);
    updateDebris(dt);
    updateBeat(dt);
    if (state.flash > 0) state.flash -= dt;

    // Wave clear
    if (state.rocks.length === 0 && !state.saucer && state.mode === "play") {
      // Brief pause then next wave
      state.saucerTimer = Math.max(state.saucerTimer, 2);
      resetWave(false);
    }

    clearJust();
  }

  function clearJust() {
    for (const k of Object.keys(justPressed)) delete justPressed[k];
  }

  function updateShip(dt) {
    const ship = state.ship;
    if (!ship.alive) return;

    if (ship.invuln > 0) ship.invuln -= dt;
    if (ship.fireTimer > 0) ship.fireTimer -= dt;
    if (ship.hyperTimer > 0) ship.hyperTimer -= dt;

    // Rotate (quantize to ~5° like the original vector ROM tables)
    if (keys.ArrowLeft || keys.KeyA) ship.angle -= ROT_SPEED * dt;
    if (keys.ArrowRight || keys.KeyD) ship.angle += ROT_SPEED * dt;
    ship.drawAngle = Math.round(ship.angle / ANGLE_STEP) * ANGLE_STEP;

    // Thrust
    const thrusting = !!(keys.ArrowUp || keys.KeyW);
    ship.thrusting = thrusting;
    if (thrusting) {
      const thrustAng = ship.drawAngle ?? ship.angle;
      ship.vx += Math.cos(thrustAng) * THRUST_ACC * dt;
      ship.vy += Math.sin(thrustAng) * THRUST_ACC * dt;
      // Cap speed
      const sp = Math.hypot(ship.vx, ship.vy);
      if (sp > MAX_SPEED) {
        ship.vx = (ship.vx / sp) * MAX_SPEED;
        ship.vy = (ship.vy / sp) * MAX_SPEED;
      }
      AudioFX.startThrust();
    } else {
      AudioFX.stopThrust();
    }

    // Mild friction (original had gentle drag so ship eventually stops)
    const damp = Math.pow(1 - FRICTION * 0.02, dt * 60);
    ship.vx *= damp;
    ship.vy *= damp;

    ship.x = wrap(ship.x + ship.vx * dt, W);
    ship.y = wrap(ship.y + ship.vy * dt, H);

    // Fire — max 4 bullets (hold or tap Space)
    if (keys.Space && ship.fireTimer <= 0) {
      const playerBullets = state.bullets.filter((b) => b.owner === "player");
      if (playerBullets.length < MAX_BULLETS) {
        const fireAng = ship.drawAngle ?? ship.angle;
        const nose = SHIP_SIZE * 1.15;
        const bx = ship.x + Math.cos(fireAng) * nose;
        const by = ship.y + Math.sin(fireAng) * nose;
        // Bullets inherit ship velocity (allows stationary "mine" placement when retreating)
        const b = makeBullet(bx, by, fireAng, "player");
        b.vx += ship.vx;
        b.vy += ship.vy;
        state.bullets.push(b);
        ship.fireTimer = FIRE_COOLDOWN;
        AudioFX.fire();
      }
    }

    // Hyperspace
    if ((justPressed.ShiftLeft || justPressed.ShiftRight || justPressed.KeyH) && ship.hyperTimer <= 0) {
      ship.hyperTimer = HYPER_COOLDOWN;
      AudioFX.hyperspace();
      state.debris.push(...makeDebris(ship.x, ship.y, 6, 80));
      ship.x = rand(40, W - 40);
      ship.y = rand(40, H - 40);
      ship.vx = 0;
      ship.vy = 0;
      // ~1/6 chance of destruction
      if (Math.random() < HYPER_DEATH_CHANCE) {
        ship.invuln = 0;
        killShip();
        return;
      }
      // Also die if reappear on rock
      for (const r of state.rocks) {
        if (circleHit(ship.x, ship.y, SHIP_SIZE * 0.6, r.x, r.y, r.r * 0.85)) {
          ship.invuln = 0;
          killShip();
          return;
        }
      }
      ship.invuln = Math.max(ship.invuln, 0.6);
    }

    // Ship vs rocks
    if (ship.invuln <= 0) {
      for (const r of state.rocks) {
        if (circleHit(ship.x, ship.y, SHIP_SIZE * 0.55, r.x, r.y, r.r * 0.9)) {
          killShip();
          return;
        }
      }
      if (state.saucer) {
        const s = state.saucer;
        if (circleHit(ship.x, ship.y, SHIP_SIZE * 0.55, s.x, s.y, s.r * 0.85)) {
          destroySaucer();
          killShip();
          return;
        }
      }
    }
  }

  function updateWorld(dt, collisions) {
    // Rocks
    for (const r of state.rocks) {
      r.x = wrap(r.x + r.vx * dt, W);
      r.y = wrap(r.y + r.vy * dt, H);
      r.angle += r.spin * dt;
    }

    // Bullets
    for (let i = state.bullets.length - 1; i >= 0; i--) {
      const b = state.bullets[i];
      b.x = wrap(b.x + b.vx * dt, W);
      b.y = wrap(b.y + b.vy * dt, H);
      b.life -= dt;
      if (b.life <= 0) {
        state.bullets.splice(i, 1);
        continue;
      }

      if (!collisions) continue;

      // Bullet vs rocks
      let hit = false;
      for (let j = state.rocks.length - 1; j >= 0; j--) {
        const r = state.rocks[j];
        if (circleHit(b.x, b.y, 2, r.x, r.y, r.r * 0.95)) {
          state.bullets.splice(i, 1);
          state.rocks.splice(j, 1);
          if (b.owner === "player") splitRock(r, b.vx, b.vy);
          else {
            // Saucer bullets still split rocks but no score for player
            const next = ROCK_NEXT[r.size];
            AudioFX.bang(r.size === "small" ? "small" : "medium");
            state.debris.push(...makeDebris(r.x, r.y, 5, 90));
            if (next) {
              const room = MAX_ASTEROIDS - state.rocks.length;
              const make = room >= 2 ? 2 : room >= 1 ? 1 : 0;
              for (let k = 0; k < make; k++) {
                state.rocks.push(makeRock(next, r.x, r.y, r.vx * 0.5, r.vy * 0.5));
              }
            }
          }
          hit = true;
          updateBeatRate();
          break;
        }
      }
      if (hit) continue;

      // Player bullet vs saucer
      if (b.owner === "player" && state.saucer) {
        const s = state.saucer;
        if (circleHit(b.x, b.y, 2, s.x, s.y, s.r * 0.9)) {
          state.bullets.splice(i, 1);
          destroySaucer();
          continue;
        }
      }

      // Saucer bullet vs ship
      if (b.owner === "saucer" && state.ship.alive && state.ship.invuln <= 0) {
        if (circleHit(b.x, b.y, 2, state.ship.x, state.ship.y, SHIP_SIZE * 0.55)) {
          state.bullets.splice(i, 1);
          killShip();
        }
      }
    }

    // Saucer
    if (state.mode === "play" || state.mode === "dying") {
      updateSaucer(dt, collisions);
    }

    updateBeatRate();
  }

  function updateSaucer(dt, collisions) {
    if (!state.saucer) {
      state.saucerTimer -= dt;
      if (state.saucerTimer <= 0 && state.mode === "play" && state.rocks.length > 0) {
        // After 40k only small saucers
        const small =
          state.score >= SAUCER_SCORE_SMALL_ONLY ? true : Math.random() < 0.35 + Math.min(state.score / 80000, 0.4);
        state.saucer = makeSaucer(small);
        AudioFX.startSaucer(small);
      }
      return;
    }

    const s = state.saucer;
    s.dirTimer -= dt;
    if (s.dirTimer <= 0) {
      s.vy = rand(-40, 40);
      s.dirTimer = rand(0.6, 1.8);
    }
    s.x += s.vx * dt;
    s.y = wrap(s.y + s.vy * dt, H);

    // Leave screen
    if (s.x < -40 || s.x > W + 40) {
      AudioFX.stopSaucer();
      state.saucer = null;
      state.saucerTimer = rand(6, 14);
      return;
    }

    // Fire
    s.fireTimer -= dt;
    if (s.fireTimer <= 0 && state.ship.alive) {
      s.fireTimer = s.small ? rand(0.55, 0.95) : rand(0.9, 1.5);
      let angle;
      if (s.small) {
        // Aim at ship — accuracy improves with score
        // Original: saucers cannot aim across screen boundary (lurking exploit)
        const dx = state.ship.x - s.x;
        const dy = state.ship.y - s.y;
        // No wrap for aiming (faithful to original exploit)
        angle = Math.atan2(dy, dx);
        // Inaccuracy decreases with score
        const spread = clamp(0.7 - state.score / 80000, 0.04, 0.7);
        angle += rand(-spread, spread);
      } else {
        // Large saucer: mostly random
        angle = rand(0, TAU);
      }
      state.bullets.push(makeBullet(s.x, s.y, angle, "saucer"));
      AudioFX.saucerShot();
    }

    // Saucer vs rocks
    if (collisions) {
      for (let j = state.rocks.length - 1; j >= 0; j--) {
        const r = state.rocks[j];
        if (circleHit(s.x, s.y, s.r * 0.8, r.x, r.y, r.r * 0.9)) {
          // Both destroyed / rock splits without score
          AudioFX.bang(r.size === "small" ? "small" : "medium");
          state.rocks.splice(j, 1);
          const next = ROCK_NEXT[r.size];
          if (next) {
            const room = MAX_ASTEROIDS - state.rocks.length;
            const make = room >= 2 ? 2 : room >= 1 ? 1 : 0;
            for (let k = 0; k < make; k++) {
              state.rocks.push(makeRock(next, r.x, r.y, r.vx * 0.5, r.vy * 0.5));
            }
          }
          destroySaucer();
          break;
        }
      }
    }
  }

  function updateDebris(dt) {
    for (let i = state.debris.length - 1; i >= 0; i--) {
      const d = state.debris[i];
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.life -= dt;
      if (d.life <= 0) state.debris.splice(i, 1);
    }
  }

  function updateBeat(dt) {
    if (state.mode !== "play") return;
    state.beatTimer -= dt;
    if (state.beatTimer <= 0) {
      AudioFX.beat(state.beatWhich);
      state.beatWhich = state.beatWhich === 1 ? 2 : 1;
      state.beatTimer = state.beatInterval;
    }
  }

  function updateAttract(dt) {
    state.attractTimer += dt;
    if (state.attractRocks.length === 0) {
      for (let i = 0; i < 6; i++) {
        state.attractRocks.push(makeRock(i % 3 === 0 ? "large" : i % 3 === 1 ? "medium" : "small"));
      }
    }
    for (const r of state.attractRocks) {
      r.x = wrap(r.x + r.vx * dt * 0.6, W);
      r.y = wrap(r.y + r.vy * dt * 0.6, H);
      r.angle += r.spin * dt;
    }
  }

  function updateInitials() {
    // Left/right change letter, fire/enter advances, up/down also change
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ ";
    const idx = state.initialIndex;
    if (justPressed.ArrowLeft || justPressed.KeyA) {
      const cur = letters.indexOf(state.initials[idx]);
      state.initials[idx] = letters[(cur - 1 + letters.length) % letters.length];
    }
    if (justPressed.ArrowRight || justPressed.KeyD) {
      const cur = letters.indexOf(state.initials[idx]);
      state.initials[idx] = letters[(cur + 1) % letters.length];
    }
    if (justPressed.ArrowUp || justPressed.KeyW) {
      const cur = letters.indexOf(state.initials[idx]);
      state.initials[idx] = letters[(cur + 1) % letters.length];
    }
    if (justPressed.ArrowDown || justPressed.KeyS) {
      const cur = letters.indexOf(state.initials[idx]);
      state.initials[idx] = letters[(cur - 1 + letters.length) % letters.length];
    }
    if (justPressed.Space || justPressed.Enter) {
      if (idx < 2) {
        state.initialIndex++;
      } else {
        const initials = state.initials.join("");
        if (typeof window.AsteroidsGame?.onHighScore === "function") {
          try {
            window.AsteroidsGame.onHighScore(state.score, initials);
          } catch (_) {}
        }
        state.mode = "gameover";
      }
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  function render() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Near-black field with tiny vignette
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    setGlow(1);

    if (state.mode === "attract") {
      renderAttract();
    } else {
      renderHUD();
      renderRocks(state.rocks);
      renderBullets();
      renderSaucer();
      renderDebris();
      if (state.ship.alive && state.mode !== "enterscore") {
        renderShip(state.ship);
      }
      if (state.mode === "gameover" || state.mode === "enterscore") {
        renderGameOver();
      }
    }

    // Flash on death
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(200,255,200,${state.flash * 0.35})`;
      ctx.shadowBlur = 0;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();
  }

  function renderHUD() {
    setGlow(0.9);
    // Score top-left-ish (original is top center-left)
    const scoreStr = String(state.score).padStart(2, "0");
    drawText(scoreStr, 48, 28, 22);

    // High score top center
    drawText(String(state.highScore), W / 2, 18, 14, "center");

    // Lives as mini ships top-left under score
    for (let i = 0; i < Math.min(state.lives, 8); i++) {
      drawPoly(SHIP_PTS, 56 + i * 22, 72, 8, -Math.PI / 2, true);
    }
  }

  function renderShip(ship) {
    // Blink when invulnerable
    if (ship.invuln > 0 && Math.floor(ship.invuln * 10) % 2 === 0) return;
    setGlow(1.2);
    const a = ship.drawAngle ?? ship.angle;
    drawPoly(SHIP_PTS, ship.x, ship.y, SHIP_SIZE, a, true);
    if (ship.thrusting && Math.random() > 0.25) {
      // Flickering exhaust (phosphor trail was an accidental CRT effect on the real cabinet)
      const flicker = 0.85 + Math.random() * 0.35;
      drawPoly(
        FLAME_PTS.map((p) => [p[0] * flicker, p[1]]),
        ship.x,
        ship.y,
        SHIP_SIZE,
        a,
        false
      );
    }
  }

  function renderRocks(rocks) {
    setGlow(0.85);
    for (const r of rocks) {
      const shape = ROCK_SHAPES[r.shape];
      drawPoly(shape, r.x, r.y, r.r, r.angle, true);
    }
  }

  function renderBullets() {
    setGlow(1.4);
    ctx.fillStyle = "#fff";
    for (const b of state.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.owner === "saucer" ? 2.2 : 1.8, 0, TAU);
      ctx.fill();
    }
  }

  function renderSaucer() {
    if (!state.saucer) return;
    const s = state.saucer;
    setGlow(1.1);
    const sc = s.r;
    drawPoly(SAUCER_BODY, s.x, s.y, sc, 0, true);
    drawLine(SAUCER_LINE[0], SAUCER_LINE[1], s.x, s.y, sc, 0);
  }

  function renderDebris() {
    setGlow(0.7);
    for (const d of state.debris) {
      const alpha = clamp(d.life / (d.maxLife || 1), 0, 1);
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      const c = Math.cos(d.angle);
      const s = Math.sin(d.angle);
      ctx.moveTo(d.x - c * d.len * 0.5, d.y - s * d.len * 0.5);
      ctx.lineTo(d.x + c * d.len * 0.5, d.y + s * d.len * 0.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function renderAttract() {
    setGlow(0.85);
    renderRocks(state.attractRocks);

    setGlow(1.2);
    drawText("ASTEROIDS", W / 2, H * 0.32, 48, "center");

    setGlow(0.9);
    // Blinking push start
    if (Math.floor(state.attractTimer * 2) % 2 === 0) {
      drawText("PRESS 1 OR ENTER", W / 2, H * 0.52, 18, "center");
    }
    drawText("1 COIN 1 PLAY", W / 2, H * 0.6, 14, "center");

    drawText("HIGH SCORE  " + state.highScore, W / 2, H * 0.72, 14, "center");

    // Mini credit
    drawText("ATARI 1979", W / 2, H * 0.88, 12, "center");
  }

  function renderGameOver() {
    setGlow(1.1);
    if (state.mode === "gameover") {
      drawText("GAME OVER", W / 2, H * 0.42, 28, "center");
      if (Math.floor(performance.now() / 500) % 2 === 0) {
        drawText("PRESS 1 TO PLAY", W / 2, H * 0.52, 16, "center");
      }
    } else if (state.mode === "enterscore") {
      drawText("YOUR SCORE IS ONE OF THE TEN BEST", W / 2, H * 0.36, 14, "center");
      drawText("PLEASE ENTER YOUR INITIALS", W / 2, H * 0.44, 14, "center");
      const ini = state.initials.join("");
      drawText(ini, W / 2, H * 0.56, 32, "center");
      // Cursor under current letter
      const spacing = 32 * 0.75;
      const startX = W / 2 - (3 * spacing) / 2;
      const cx = startX + state.initialIndex * spacing + spacing * 0.15;
      ctx.beginPath();
      ctx.moveTo(cx, H * 0.56 + 40);
      ctx.lineTo(cx + 18, H * 0.56 + 40);
      ctx.stroke();
      drawText("ROTATE TO SELECT  FIRE TO ENTER", W / 2, H * 0.72, 12, "center");
    }
  }

  // ─── Main loop ────────────────────────────────────────────────────────────
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    // Clamp large pauses (tab switch)
    dt = Math.min(dt, 0.05);

    // Fixed-ish substeps for stability
    const steps = dt > 0.02 ? 2 : 1;
    const h = dt / steps;
    for (let i = 0; i < steps; i++) update(h);
    render();
    requestAnimationFrame(frame);
  }

  // Resize: keep internal 1024×768; CSS scales
  function fitCanvas() {
    // canvas internal resolution stays 1024x768 for authentic proportions
  }
  window.addEventListener("resize", fitCanvas);
  fitCanvas();

  // Boot attract
  hideOverlay();
  requestAnimationFrame(frame);

  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  // Host-site hooks (optional). No browser storage is used by default.
  // Example when embedding on your site:
  //   AsteroidsGame.setHighScore(savedFromServer);
  //   AsteroidsGame.onHighScore = (score, initials) => { /* save to your backend */ };
  window.AsteroidsGame = {
    getHighScore: () => state.highScore,
    setHighScore: (n) => {
      state.highScore = Math.max(0, Number(n) || 0);
    },
    getScore: () => state.score,
    onHighScore: null, // (score, initials) => void — after initials entry
    start: startGame,
  };
})();
