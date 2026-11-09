/**
 * PAC-MAN — 1980 Arcade Recreation
 * Faithful browser recreation of the original Namco/Midway game:
 * classic maze, tile movement, ghost personalities (Blinky/Pinky/Inky/Clyde),
 * scatter/chase waves, cruise Elroy, fruit, scoring, and Web Audio SFX.
 */

(() => {
  "use strict";

  // ═══════════════════════════════════════════════════════════════
  // CONSTANTS
  // ═══════════════════════════════════════════════════════════════

  const TILE = 16; // pixels per tile (2× original 8px for crisp modern display)
  const COLS = 28;
  const ROWS = 31;
  const W = COLS * TILE; // 448
  const H = ROWS * TILE; // 496

  // Directions
  const UP = { x: 0, y: -1, name: "up" };
  const DOWN = { x: 0, y: 1, name: "down" };
  const LEFT = { x: -1, y: 0, name: "left" };
  const RIGHT = { x: 1, y: 0, name: "right" };
  const DIRS = [UP, LEFT, DOWN, RIGHT]; // reverse-priority order for ties
  const OPP = new Map([
    [UP, DOWN],
    [DOWN, UP],
    [LEFT, RIGHT],
    [RIGHT, LEFT],
  ]);

  // Colors (arcade palette)
  const COLORS = {
    maze: "#2121DE",
    mazeFlash: "#DEDEFF",
    dot: "#FFB897",
    wall: "#2121DE",
    black: "#000000",
    white: "#FFFFFF",
    pac: "#FFFF00",
    text: "#DEDEFF",
    ready: "#FFFF00",
    score: "#DEDEDE",
    fright: "#2121DE",
    frightFlash: "#DEDEFF",
    eyeWhite: "#FFFFFF",
    eyeBlue: "#2121FF",
  };

  const GHOST_COLORS = {
    blinky: "#FF0000",
    pinky: "#FFB8FF",
    inky: "#00FFFF",
    clyde: "#FFB852",
  };

  // Fruit definitions by level (index 0 = level 1)
  const FRUITS = [
    { name: "Cherry", points: 100, color: "#FF0000", stem: "#00FF00" },
    { name: "Strawberry", points: 300, color: "#FF0000", stem: "#00FF00" },
    { name: "Peach", points: 500, color: "#FFB852", stem: "#00FF00" },
    { name: "Peach", points: 500, color: "#FFB852", stem: "#00FF00" },
    { name: "Apple", points: 700, color: "#FF0000", stem: "#00FF00" },
    { name: "Apple", points: 700, color: "#FF0000", stem: "#00FF00" },
    { name: "Grapes", points: 1000, color: "#2121FF", stem: "#00FF00" },
    { name: "Grapes", points: 1000, color: "#2121FF", stem: "#00FF00" },
    { name: "Galaxian", points: 2000, color: "#FFB8FF", stem: null },
    { name: "Galaxian", points: 2000, color: "#FFB8FF", stem: null },
    { name: "Bell", points: 3000, color: "#FFFF00", stem: null },
    { name: "Bell", points: 3000, color: "#FFFF00", stem: null },
    { name: "Key", points: 5000, color: "#00FFFF", stem: null },
  ];

  // Level specs (from Pac-Man Dossier). Speeds as fraction of full speed.
  // frightTime in seconds; flashes = white/blue blinks at end of fright.
  function levelSpec(level) {
    const L = Math.max(1, level);
    // Defaults for high levels
    let pac = 0.9,
      pacDots = 0.79,
      ghost = 0.95,
      tunnel = 0.5,
      elroy1Dots = 60,
      elroy1 = 1.0,
      elroy2Dots = 50,
      elroy2 = 1.05,
      frightPac = 1.0,
      frightPacDots = 0.87,
      frightGhost = 0.6,
      frightTime = 1,
      flashes = 3;

    if (L === 1) {
      pac = 0.8;
      pacDots = 0.71;
      ghost = 0.75;
      tunnel = 0.4;
      elroy1Dots = 20;
      elroy1 = 0.8;
      elroy2Dots = 10;
      elroy2 = 0.85;
      frightPac = 0.9;
      frightPacDots = 0.79;
      frightGhost = 0.5;
      frightTime = 6;
      flashes = 5;
    } else if (L === 2) {
      pac = 0.9;
      pacDots = 0.79;
      ghost = 0.85;
      tunnel = 0.45;
      elroy1Dots = 30;
      elroy1 = 0.9;
      elroy2Dots = 15;
      elroy2 = 0.95;
      frightPac = 0.95;
      frightPacDots = 0.83;
      frightGhost = 0.55;
      frightTime = 5;
      flashes = 5;
    } else if (L <= 4) {
      pac = 0.9;
      pacDots = 0.79;
      ghost = 0.85;
      tunnel = 0.45;
      elroy1Dots = 40;
      elroy1 = 0.9;
      elroy2Dots = 20;
      elroy2 = 0.95;
      frightPac = 0.95;
      frightPacDots = 0.83;
      frightGhost = 0.55;
      frightTime = L === 3 ? 4 : 3;
      flashes = 5;
    } else if (L <= 20) {
      pac = 1.0;
      pacDots = 0.87;
      ghost = 0.95;
      tunnel = 0.5;
      elroy1Dots = L <= 8 ? 50 : L <= 11 ? 60 : L <= 14 ? 80 : 100;
      elroy1 = 1.0;
      elroy2Dots = L <= 8 ? 25 : L <= 11 ? 40 : L <= 14 ? 50 : 60;
      elroy2 = 1.05;
      frightPac = 1.0;
      frightPacDots = 0.87;
      frightGhost = 0.6;
      if (L === 5 || L === 6) frightTime = 2;
      else if (L === 7 || L === 8) frightTime = 2;
      else if (L <= 11) frightTime = 1;
      else if (L === 12 || L === 13) frightTime = 1;
      else if (L === 14) frightTime = 3;
      else if (L === 15 || L === 16) frightTime = 1;
      else if (L === 17) frightTime = 0;
      else if (L === 18) frightTime = 1;
      else frightTime = 0;
      flashes = frightTime > 0 ? 5 : 0;
      if (L >= 5 && L <= 6) {
        frightTime = 5;
        flashes = 5;
      }
      if (L === 5) frightTime = 2;
      if (L === 6) frightTime = 5;
      if (L === 7) frightTime = 2;
      if (L === 8) frightTime = 2;
      if (L === 9) frightTime = 1;
      if (L === 10) frightTime = 5;
      if (L === 11) frightTime = 2;
      if (L === 12) frightTime = 1;
      if (L === 13) frightTime = 1;
      if (L === 14) frightTime = 3;
      if (L === 15) frightTime = 1;
      if (L === 16) frightTime = 1;
      if (L === 17) frightTime = 0;
      if (L === 18) frightTime = 1;
      if (L === 19) frightTime = 0;
      if (L === 20) frightTime = 0;
    } else {
      // Level 21+
      pac = 0.9;
      pacDots = 0.79;
      ghost = 0.95;
      tunnel = 0.5;
      elroy1Dots = 100;
      elroy1 = 1.0;
      elroy2Dots = 60;
      elroy2 = 1.05;
      frightPac = 0.9;
      frightPacDots = 0.79;
      frightGhost = 0.95;
      frightTime = 0;
      flashes = 0;
    }

    const fruit = FRUITS[Math.min(L - 1, FRUITS.length - 1)];
    return {
      pac,
      pacDots,
      ghost,
      tunnel,
      elroy1Dots,
      elroy1,
      elroy2Dots,
      elroy2,
      frightPac,
      frightPacDots,
      frightGhost,
      frightTime,
      flashes,
      fruit,
    };
  }

  // Scatter / chase wave timings (seconds) by level band
  function modeWaves(level) {
    if (level === 1) {
      return [
        { mode: "scatter", time: 7 },
        { mode: "chase", time: 20 },
        { mode: "scatter", time: 7 },
        { mode: "chase", time: 20 },
        { mode: "scatter", time: 5 },
        { mode: "chase", time: 20 },
        { mode: "scatter", time: 5 },
        { mode: "chase", time: Infinity },
      ];
    }
    if (level >= 2 && level <= 4) {
      return [
        { mode: "scatter", time: 7 },
        { mode: "chase", time: 20 },
        { mode: "scatter", time: 7 },
        { mode: "chase", time: 20 },
        { mode: "scatter", time: 5 },
        { mode: "chase", time: 1033 },
        { mode: "scatter", time: 1 / 60 },
        { mode: "chase", time: Infinity },
      ];
    }
    // level 5+
    return [
      { mode: "scatter", time: 5 },
      { mode: "chase", time: 20 },
      { mode: "scatter", time: 5 },
      { mode: "chase", time: 20 },
      { mode: "scatter", time: 5 },
      { mode: "chase", time: 1037 },
      { mode: "scatter", time: 1 / 60 },
      { mode: "chase", time: Infinity },
    ];
  }

  // Full-speed tiles per second (arcade ~75.75 px/s at 8px tiles ≈ 9.47 tiles/s)
  const FULL_SPEED = 9.5; // tiles per second

  // ═══════════════════════════════════════════════════════════════
  // MAZE DATA
  // Legend:
  //   # wall   . dot   o energizer   - ghost door
  //   space empty path   = tunnel (same as empty, flagged)
  // Classic 28×31 playfield (rows 0–30 of the 36-tile arcade screen)
  // ═══════════════════════════════════════════════════════════════

  const MAZE_STR = [
    "############################",
    "#............##............#",
    "#.####.#####.##.#####.####.#",
    "#o####.#####.##.#####.####o#",
    "#.####.#####.##.#####.####.#",
    "#..........................#",
    "#.####.##.########.##.####.#",
    "#.####.##.########.##.####.#",
    "#......##....##....##......#",
    "######.##### ## #####.######",
    "     #.##### ## #####.#     ",
    "     #.##          ##.#     ",
    "     #.## ###--### ##.#     ",
    "######.## #      # ##.######",
    "      .   #      #   .      ",
    "######.## #      # ##.######",
    "     #.## ######## ##.#     ",
    "     #.##          ##.#     ",
    "     #.## ######## ##.#     ",
    "######.## ######## ##.######",
    "#............##............#",
    "#.####.#####.##.#####.####.#",
    "#.####.#####.##.#####.####.#",
    "#o..##.......  .......##..o#",
    "###.##.##.########.##.##.###",
    "###.##.##.########.##.##.###",
    "#......##....##....##......#",
    "#.##########.##.##########.#",
    "#.##########.##.##########.#",
    "#..........................#",
    "############################",
  ];

  // Build maze grid
  const maze = [];
  let totalDots = 0;

  for (let y = 0; y < ROWS; y++) {
    maze[y] = [];
    for (let x = 0; x < COLS; x++) {
      const ch = MAZE_STR[y][x];
      let type = "empty";
      if (ch === "#") type = "wall";
      else if (ch === ".") {
        type = "dot";
        totalDots++;
      } else if (ch === "o") {
        type = "energizer";
        totalDots++;
      } else if (ch === "-") type = "door";
      // tunnel rows (side exits)
      const isTunnel =
        type !== "wall" &&
        type !== "door" &&
        y === 14 &&
        (x <= 5 || x >= 22);
      maze[y][x] = { type, ch, isTunnel, original: type };
    }
  }

  // Ghost house interior tiles (for leaving / entering)
  // Door tiles are at (13,12) and (14,12); exit rendezvous is tile center above door.
  const GHOST_HOUSE = {
    doorX: 13.5, // center of the two door tiles
    doorY: 12,
    exitX: 13.5,
    exitY: 11.5, // tile center just outside / above the door
    penY: 14, // vertical rest line inside pen
    penMinY: 13.5,
    penMaxY: 14.5,
    penMinX: 11.5,
    penMaxX: 15.5,
    // Spawn slots
    blinkyHome: { x: 13.5, y: 11.5 }, // starts outside above door
    pinkyHome: { x: 13.5, y: 14 },
    inkyHome: { x: 11.5, y: 14 },
    clydeHome: { x: 15.5, y: 14 },
  };

  function isInsidePen(g) {
    // Interior + door row only (NOT the outside exit tile at y≈11.5)
    return g.x >= 10.5 && g.x <= 17.5 && g.y >= 12.0 && g.y <= 15.6;
  }

  // Tiles where ghosts cannot turn UP (except eyes). Coords match this 28×31 map.
  const NO_UP_TILES = new Set([
    "12,11",
    "15,11",
    "12,23",
    "15,23",
  ]);

  // Scatter targets (outside corners, often outside map)
  const SCATTER = {
    blinky: { x: 25, y: -3 },
    pinky: { x: 2, y: -3 },
    inky: { x: 27, y: 32 },
    clyde: { x: 0, y: 32 },
  };

  // ═══════════════════════════════════════════════════════════════
  // AUDIO — Namco-style WSG synthesis (3-voice character via Web Audio)
  // Approximates the 1980 arcade: custom waveforms, intro jingle,
  // waka-waka chomp, multi-stage siren, fright siren, eyes, death, etc.
  // ═══════════════════════════════════════════════════════════════

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.enabled = true;
      this.wave = null; // Namco-ish periodic wave
      this.waveSoft = null;

      // Continuous voices
      this.sirenNodes = null; // { osc, lfo, lfoGain, gain, type, stage }
      this.eyesNodes = null;
      this.wakaFlip = false;
      this.wakaLast = 0;
      this.mutedLoops = false; // true during jingles/death
    }

    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.4;
      this.master.connect(this.ctx.destination);

      // Approximate Namco WSG ROM waveforms with additive tables.
      // Bright pulse-like wave (music / waka / most SFX)
      const n = 32;
      const real = new Float32Array(n);
      const imag = new Float32Array(n);
      // Odd harmonics, decaying — closer to arcade pulse than pure square
      for (let i = 1; i < n; i += 2) {
        imag[i] = (1 / i) * (i % 4 === 1 ? 1 : 0.7);
      }
      this.wave = this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });

      // Softer triangle-ish wave (siren body)
      const real2 = new Float32Array(n);
      const imag2 = new Float32Array(n);
      for (let i = 1; i < n; i++) {
        imag2[i] = (i % 2 === 1 ? 1 : 0) / (i * i);
      }
      this.waveSoft = this.ctx.createPeriodicWave(real2, imag2, {
        disableNormalization: false,
      });
    }

    resume() {
      this.init();
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    }

    now() {
      return this.ctx ? this.ctx.currentTime : 0;
    }

    /** One-shot voice using the Namco-style wave. */
    playNote(freq, start, duration, vol = 0.22, opts = {}) {
      if (!this.enabled || !this.ctx) return;
      const {
        slideTo = null,
        wave = "bright",
        attack = 0.004,
        type = null, // override with standard osc type if set
      } = opts;
      const t0 = start;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();

      if (type) {
        osc.type = type;
      } else if (wave === "soft" && this.waveSoft) {
        osc.setPeriodicWave(this.waveSoft);
      } else if (this.wave) {
        osc.setPeriodicWave(this.wave);
      } else {
        osc.type = "square";
      }

      osc.frequency.setValueAtTime(Math.max(20, freq), t0);
      if (slideTo != null) {
        osc.frequency.linearRampToValueAtTime(Math.max(20, slideTo), t0 + duration);
      }

      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + attack);
      g.gain.setValueAtTime(vol, t0 + Math.max(attack, duration - 0.02));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

      osc.connect(g);
      g.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + duration + 0.03);
    }

    /** Schedule a sequence of {f, d, gap?, vol?, slide?} from t0. */
    playSequence(notes, t0 = null, defaultVol = 0.2) {
      if (!this.enabled || !this.ctx) return 0;
      let t = t0 == null ? this.now() : t0;
      for (const n of notes) {
        const d = n.d != null ? n.d : 0.08;
        const vol = n.vol != null ? n.vol : defaultVol;
        this.playNote(n.f, t, d, vol, {
          slideTo: n.slide != null ? n.slide : null,
          wave: n.wave || "bright",
          type: n.type || null,
        });
        t += d + (n.gap != null ? n.gap : 0);
      }
      return t;
    }

    // ─── Waka-waka (pellet chomp) ─────────────────────────────
    // Arcade: two alternating short chirps on the WSG, ~12–15 Hz cycle.
    // Each “wa” is a quick downward pitch bend, not a static beep.
    waka() {
      if (!this.enabled || !this.ctx || this.mutedLoops) return;
      const nowMs = performance.now();
      // Full wa-ka period ~140ms; each half ~70ms
      if (nowMs - this.wakaLast < 68) return;
      this.wakaLast = nowMs;
      this.wakaFlip = !this.wakaFlip;

      const t0 = this.now();
      if (this.wakaFlip) {
        // “Wa” — higher chirp
        this.playNote(494, t0, 0.055, 0.16, { slideTo: 392, wave: "bright" });
      } else {
        // “Ka” — lower chirp
        this.playNote(392, t0, 0.055, 0.15, { slideTo: 294, wave: "bright" });
      }
    }

    // ─── Eat ghost ────────────────────────────────────────────
    // Rising stepped arpeggio (~5 hits), bright and short.
    eatGhost() {
      if (!this.enabled || !this.ctx) return;
      const t0 = this.now();
      // Classic ascending fifths-ish pops
      const seq = [
        { f: 277, d: 0.05 }, // C#4
        { f: 370, d: 0.05 }, // F#4
        { f: 466, d: 0.05 }, // A#4
        { f: 587, d: 0.05 }, // D5
        { f: 740, d: 0.09 }, // F#5
      ];
      let t = t0;
      for (const n of seq) {
        this.playNote(n.f, t, n.d, 0.24, { wave: "bright" });
        t += 0.055;
      }
    }

    // ─── Eat fruit ────────────────────────────────────────────
    eatFruit() {
      if (!this.enabled || !this.ctx) return;
      const t0 = this.now();
      // Quick two-step + flourish (matches arcade “bling”)
      this.playNote(587, t0, 0.05, 0.2, { slideTo: 784 });
      this.playNote(784, t0 + 0.055, 0.05, 0.2, { slideTo: 1047 });
      this.playNote(1175, t0 + 0.11, 0.1, 0.18);
    }

    // ─── Extra life ───────────────────────────────────────────
    extraLife() {
      if (!this.enabled || !this.ctx) return;
      const t0 = this.now();
      // Short major arpeggio fanfare
      const notes = [
        { f: 523.25, d: 0.09 }, // C5
        { f: 659.25, d: 0.09 }, // E5
        { f: 783.99, d: 0.09 }, // G5
        { f: 1046.5, d: 0.18 }, // C6
      ];
      let t = t0;
      for (const n of notes) {
        this.playNote(n.f, t, n.d, 0.22);
        t += n.d * 0.85;
      }
    }

    // ─── Start / READY jingle (arcade intro) ──────────────────
    // Faithful note map of the 1980 opening fanfare (WSG melody).
    startJingle() {
      if (!this.enabled || !this.ctx) return;
      this.stopSiren();
      this.stopEyes();
      this.mutedLoops = true;

      // Tempo ≈ 16th @ ~150 BPM → ~0.1s per step; opening uses ~0.075–0.09
      const s = 0.078;
      // Phrase 1: B arpeggio figure (the iconic “da-da-da-da”)
      const phrase1 = [
        246.94, 493.88, 369.99, 311.13, // B3 B4 F#4 D#4
        493.88, 369.99, 311.13, 246.94,
        493.88, 369.99, 311.13, 493.88,
        369.99, 311.13, 246.94,
      ];
      // Phrase 2: climbs to B5
      const phrase2 = [
        329.63, 415.3, 493.88, // E4 G#4 B4
        329.63, 415.3, 493.88,
        554.37, 415.3, 554.37, // C#5
        622.25, 739.99, 554.37, // D#5 F#5
        739.99, 830.61, 987.77, // F#5 G#5 B5
      ];

      const t0 = this.now() + 0.02;
      let t = t0;
      for (let i = 0; i < phrase1.length; i++) {
        const last = i === phrase1.length - 1;
        const d = last ? s * 2 : s;
        this.playNote(phrase1[i], t, d * 0.92, 0.2);
        t += d;
      }
      t += s * 0.3;
      for (let i = 0; i < phrase2.length; i++) {
        const last = i === phrase2.length - 1;
        const d = last ? s * 3.2 : s;
        this.playNote(phrase2[i], t, d * 0.92, last ? 0.24 : 0.2);
        t += d;
      }

      const totalMs = (t - t0) * 1000 + 50;
      setTimeout(() => {
        this.mutedLoops = false;
      }, totalMs);
    }

    // ─── Death ────────────────────────────────────────────────
    // Arcade death: oscillating pairs while the center pitch falls,
    // then a low decay — the familiar “descending warble”.
    death() {
      if (!this.enabled || !this.ctx) return;
      this.stopSiren();
      this.stopEyes();
      this.mutedLoops = true;

      const t0 = this.now();
      // Center pitches step down; each step plays high/low pair (vibrato feel)
      const centers = [
        740, 698, 659, 622, 587, 554, 523, 494, 466, 440, 415, 392, 370, 349,
        330, 311, 294, 277, 262, 247, 233, 220, 208, 196,
      ];
      let t = t0;
      for (let i = 0; i < centers.length; i++) {
        const c = centers[i];
        const step = i < 16 ? 0.055 : 0.065;
        // Alternate above/below center for the warble
        const a = c * (i % 2 === 0 ? 1.06 : 0.94);
        const b = c * (i % 2 === 0 ? 0.94 : 1.06);
        this.playNote(a, t, step * 0.48, 0.2, { wave: "bright" });
        this.playNote(b, t + step * 0.48, step * 0.48, 0.18, { wave: "bright" });
        t += step;
      }
      // Final low “thud”
      this.playNote(160, t, 0.12, 0.22, { slideTo: 60, type: "square" });
      this.playNote(90, t + 0.08, 0.18, 0.16, { slideTo: 40, type: "triangle" });

      setTimeout(() => {
        this.mutedLoops = false;
      }, (t - t0 + 0.35) * 1000);
    }

    // ─── Siren stages (chase) ─────────────────────────────────
    // Arcade raises siren pitch as dots clear (roughly 5 banks).
    sirenStage(dotsLeft) {
      if (dotsLeft > 172) return 0;
      if (dotsLeft > 112) return 1;
      if (dotsLeft > 52) return 2;
      if (dotsLeft > 20) return 3;
      return 4;
    }

    // Base Hz and LFO depth/rate per stage (chase siren)
    sirenParams(stage) {
      const table = [
        { base: 196, depth: 22, rate: 6.5 }, // low
        { base: 233, depth: 24, rate: 7.0 },
        { base: 277, depth: 26, rate: 7.5 },
        { base: 330, depth: 28, rate: 8.0 },
        { base: 392, depth: 30, rate: 8.5 }, // urgent
      ];
      return table[Math.max(0, Math.min(4, stage))];
    }

    startSiren(dotsLeft, total) {
      if (!this.enabled || !this.ctx || this.mutedLoops) return;
      const stage = this.sirenStage(dotsLeft);
      // Already running same chase stage — just retune
      if (this.sirenNodes && this.sirenNodes.type === "chase") {
        if (this.sirenNodes.stage === stage) return;
        this._retuneSiren(stage);
        return;
      }
      this.stopSiren();
      this._startWarbleSiren("chase", this.sirenParams(stage), stage);
    }

    startFrightSiren() {
      if (!this.enabled || !this.ctx || this.mutedLoops) return;
      if (this.sirenNodes && this.sirenNodes.type === "fright") return;
      this.stopSiren();
      // Frightened: lower, slower, wider warble (blue-ghost alarm)
      this._startWarbleSiren(
        "fright",
        { base: 130, depth: 45, rate: 4.2, pulse: true },
        -1
      );
    }

    _startWarbleSiren(type, params, stage) {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();

      if (type === "fright") {
        if (this.wave) osc.setPeriodicWave(this.wave);
        else osc.type = "square";
        gain.gain.value = 0.055;
      } else {
        if (this.waveSoft) osc.setPeriodicWave(this.waveSoft);
        else osc.type = "triangle";
        gain.gain.value = 0.07;
      }

      osc.frequency.value = params.base;
      lfo.type = "triangle";
      lfo.frequency.value = params.rate;
      lfoGain.gain.value = params.depth;

      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.connect(gain);
      gain.connect(this.master);

      // Fright: gentle amplitude pulse (arcade “throbs” more)
      let pulseLfo = null;
      let pulseGain = null;
      if (params.pulse) {
        pulseLfo = this.ctx.createOscillator();
        pulseGain = this.ctx.createGain();
        pulseLfo.type = "square";
        pulseLfo.frequency.value = 6;
        pulseGain.gain.value = 0.02;
        gain.gain.value = 0.045;
        pulseLfo.connect(pulseGain);
        pulseGain.connect(gain.gain);
        pulseLfo.start();
      }

      osc.start();
      lfo.start();

      this.sirenNodes = {
        osc,
        lfo,
        lfoGain,
        gain,
        pulseLfo,
        type,
        stage,
        params,
      };
    }

    _retuneSiren(stage) {
      if (!this.sirenNodes || !this.ctx) return;
      const p = this.sirenParams(stage);
      const t = this.now();
      this.sirenNodes.osc.frequency.setTargetAtTime(p.base, t, 0.08);
      this.sirenNodes.lfo.frequency.setTargetAtTime(p.rate, t, 0.08);
      this.sirenNodes.lfoGain.gain.setTargetAtTime(p.depth, t, 0.08);
      this.sirenNodes.stage = stage;
      this.sirenNodes.params = p;
    }

    stopSiren() {
      const n = this.sirenNodes;
      if (!n) return;
      try {
        n.osc.stop();
        n.lfo.stop();
        if (n.pulseLfo) n.pulseLfo.stop();
      } catch (_) {}
      this.sirenNodes = null;
    }

    // ─── Eyes retreating (after ghost eaten) ──────────────────
    // High rapid alternating “tweet” while eyes return to pen.
    startEyes() {
      if (!this.enabled || !this.ctx || this.mutedLoops) return;
      if (this.eyesNodes) return;
      this.stopSiren(); // eyes replace siren in arcade

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();

      if (this.wave) osc.setPeriodicWave(this.wave);
      else osc.type = "square";

      osc.frequency.value = 900;
      gain.gain.value = 0.06;
      lfo.type = "square";
      lfo.frequency.value = 14; // rapid A/B
      lfoGain.gain.value = 180; // 900±180 → ~720–1080

      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start();
      lfo.start();

      this.eyesNodes = { osc, lfo, gain };
    }

    stopEyes() {
      if (!this.eyesNodes) return;
      try {
        this.eyesNodes.osc.stop();
        this.eyesNodes.lfo.stop();
      } catch (_) {}
      this.eyesNodes = null;
    }

    /** Call each frame: eyes sound if any ghost is eyes; else restore siren. */
    updateLoopSounds(dotsLeft, total, frightTimer, anyEyes, playing) {
      if (!this.enabled || !this.ctx || this.mutedLoops || !playing) {
        return;
      }
      if (anyEyes) {
        this.startEyes();
        return;
      }
      this.stopEyes();
      if (frightTimer > 0) {
        this.startFrightSiren();
      } else {
        this.startSiren(dotsLeft, total);
      }
    }

    stopAllLoops() {
      this.stopSiren();
      this.stopEyes();
    }
  }

  const audio = new AudioEngine();

  // ═══════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════

  function tileAt(tx, ty) {
    // Tunnel wrap for x
    if (ty < 0 || ty >= ROWS) return null;
    let x = tx;
    if (x < 0 || x >= COLS) {
      // Outside playfield horizontally — treat as empty tunnel
      if (ty === 14) return { type: "empty", isTunnel: true };
      return null;
    }
    return maze[ty][x];
  }

  function isWall(tx, ty, allowDoor = false) {
    const t = tileAt(Math.floor(tx), Math.floor(ty));
    if (!t) return true;
    if (t.type === "wall") return true;
    if (t.type === "door" && !allowDoor) return true;
    return false;
  }

  function isPassable(tx, ty, forGhost = false, asEyes = false) {
    const t = tileAt(tx, ty);
    if (!t) {
      // Horizontal wrap tunnel
      return ty === 14;
    }
    if (t.type === "wall") return false;
    if (t.type === "door") return asEyes || forGhost === "leaving";
    return true;
  }

  function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function tileKey(x, y) {
    return `${x},${y}`;
  }

  function clampTile(n) {
    return Math.floor(n);
  }

  function fruitForLevel(level) {
    return FRUITS[Math.min(Math.max(level, 1) - 1, FRUITS.length - 1)];
  }

  // ═══════════════════════════════════════════════════════════════
  // ENTITIES
  // ═══════════════════════════════════════════════════════════════

  class Actor {
    constructor(x, y) {
      this.x = x; // tile coords (center)
      this.y = y;
      this.dir = LEFT;
      this.nextDir = null;
      this.speed = FULL_SPEED * 0.8;
      this.pixelRest = 0; // sub-tile remainder not used; continuous float
    }

    tileX() {
      return Math.floor(this.x);
    }
    tileY() {
      return Math.floor(this.y);
    }

    // Center of current tile in continuous coords
    centerOfTile() {
      return { x: Math.floor(this.x) + 0.5, y: Math.floor(this.y) + 0.5 };
    }

    // Distance to center of current tile along movement
    distToCenter() {
      const c = this.centerOfTile();
      return Math.abs(this.x - c.x) + Math.abs(this.y - c.y);
    }

    atTileCenter(eps = 0.08) {
      const c = this.centerOfTile();
      return Math.abs(this.x - c.x) < eps && Math.abs(this.y - c.y) < eps;
    }

    snapToCenter() {
      const c = this.centerOfTile();
      this.x = c.x;
      this.y = c.y;
    }
  }

  class PacMan extends Actor {
    constructor() {
      super(13.5, 23);
      this.dir = LEFT;
      this.mouth = 0; // 0–1 animation phase
      this.alive = true;
      this.dying = false;
      this.deathFrame = 0;
      this.animTimer = 0;
      this.stopped = false;
      this.hideTimer = 0;
    }

    reset() {
      this.x = 13.5;
      this.y = 23;
      this.dir = LEFT;
      this.nextDir = null;
      this.alive = true;
      this.dying = false;
      this.deathFrame = 0;
      this.mouth = 0;
      this.stopped = false;
      this.hideTimer = 0;
    }
  }

  class Ghost extends Actor {
    constructor(name, color, home) {
      super(home.x, home.y);
      this.name = name;
      this.color = color;
      this.home = { ...home };
      this.mode = "scatter"; // scatter | chase | frightened | eaten
      this.frightened = false;
      this.flashing = false;
      this.inHouse = name !== "blinky";
      this.leaving = false;
      this.enterHouse = false;
      this.housePhase = null;
      this.houseTimer = 0; // seconds spent in current leave/enter sequence
      this.nextTile = null; // {x,y} maze destination tile (integer)
      this.elroy = 0; // 0 none, 1 cruise elroy, 2
      this.dotCounter = 0; // personal house release counter
      this.forcedReverse = false;
      this.animFrame = 0;
      this.hideTimer = 0;
      this.target = { x: 0, y: 0 };
    }

    reset(levelStart = false) {
      this.frightened = false;
      this.flashing = false;
      this.mode = "scatter";
      this.forcedReverse = false;
      this.elroy = 0;
      this.animFrame = 0;
      this.hideTimer = 0;
      this.enterHouse = false;
      this.housePhase = null;
      this.houseTimer = 0;
      this.leaving = false;
      this.nextTile = null;
      if (this.name === "blinky") {
        this.x = GHOST_HOUSE.exitX;
        this.y = GHOST_HOUSE.exitY;
        this.inHouse = false;
        this.dir = LEFT;
      } else if (this.name === "pinky") {
        this.x = GHOST_HOUSE.pinkyHome.x;
        this.y = GHOST_HOUSE.pinkyHome.y;
        this.inHouse = true;
        this.dir = DOWN;
      } else if (this.name === "inky") {
        this.x = GHOST_HOUSE.inkyHome.x;
        this.y = GHOST_HOUSE.inkyHome.y;
        this.inHouse = true;
        this.dir = UP;
      } else {
        this.x = GHOST_HOUSE.clydeHome.x;
        this.y = GHOST_HOUSE.clydeHome.y;
        this.inHouse = true;
        this.dir = UP;
      }
      if (levelStart) this.dotCounter = 0;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // GAME STATE
  // ═══════════════════════════════════════════════════════════════

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  // Draw in maze pixels, then let the bitmap cover the CSS box crisply.
  function fitCanvas() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fitCanvas();

  const scoreEl = document.getElementById("score");
  const highEl = document.getElementById("highscore");
  const levelEl = document.getElementById("level");
  const livesEl = document.getElementById("lives");
  const fruitTrayEl = document.getElementById("fruit-tray");
  const statusEl = document.getElementById("status");

  const state = {
    phase: "title", // title | ready | playing | dying | levelclear | gameover | paused
    score: 0,
    highScore: Number(localStorage.getItem("pacman-hi") || 0),
    level: 1,
    lives: 3,
    dotsEaten: 0,
    dotsRemaining: totalDots,
    ghostCombo: 0,
    globalDotCounter: -1, // -1 = use personal counters; set after death
    fruit: null, // { timer, fruit }
    fruitEatenThisLevel: 0,
    modeWaveIndex: 0,
    modeTimer: 0,
    frightTimer: 0,
    readyTimer: 0,
    dieTimer: 0,
    levelClearTimer: 0,
    flashMaze: false,
    pauseBuffer: false,
    extraLifeAwarded: false,
    houseTimer: 0, // global release timeout
    freeze: 0, // eat-score pause, seconds
    attractT: 0,
    lastTs: 0,
    heldDirs: [],
    padStart: false,
    padPause: false,
  };
  const dirHolds = new Map();

  const pac = new PacMan();
  const ghosts = {
    blinky: new Ghost("blinky", GHOST_COLORS.blinky, GHOST_HOUSE.blinkyHome),
    pinky: new Ghost("pinky", GHOST_COLORS.pinky, GHOST_HOUSE.pinkyHome),
    inky: new Ghost("inky", GHOST_COLORS.inky, GHOST_HOUSE.inkyHome),
    clyde: new Ghost("clyde", GHOST_COLORS.clyde, GHOST_HOUSE.clydeHome),
  };
  const ghostList = [ghosts.blinky, ghosts.pinky, ghosts.inky, ghosts.clyde];

  // Floating score popups
  const popups = [];

  // ═══════════════════════════════════════════════════════════════
  // UI HELPERS
  // ═══════════════════════════════════════════════════════════════

  function formatScore(n) {
    return n === 0 ? "00" : String(n);
  }

  let hudLives = -1;
  let hudLevel = -1;

  function updateHUD() {
    scoreEl.textContent = formatScore(state.score);
    highEl.textContent = formatScore(state.highScore);
    levelEl.textContent = String(state.level);

    // Reserve lives, matching the cabinet. The title shows all three.
    const icons =
      state.phase === "title" || state.phase === "gameover"
        ? Math.max(0, state.lives)
        : Math.max(0, state.lives - 1);
    if (icons !== hudLives) {
      hudLives = icons;
      livesEl.innerHTML = "";
      for (let i = 0; i < icons; i++) {
        const d = document.createElement("div");
        d.className = "life-icon";
        livesEl.appendChild(d);
      }
    }

    if (state.level !== hudLevel) {
      hudLevel = state.level;
      fruitTrayEl.innerHTML = "";
      const start = Math.max(1, state.level - 6);
      for (let L = start; L <= state.level; L++) {
        const f = fruitForLevel(L);
        const c = document.createElement("canvas");
        c.width = 22;
        c.height = 22;
        c.className = "fruit-icon";
        drawFruitIcon(c.getContext("2d"), 11, 11, f, 0.9);
        fruitTrayEl.appendChild(c);
      }
    }
  }

  function showOverlay(title, msg, cls = "") {
    if (!statusEl) return;
    statusEl.textContent = msg || title;
    statusEl.className = "status" + (cls ? " " + cls : "");
  }

  function hideOverlay() {
    if (!statusEl) return;
    statusEl.textContent = "";
    statusEl.className = "status";
  }

  // ═══════════════════════════════════════════════════════════════
  // LEVEL / ROUND SETUP
  // ═══════════════════════════════════════════════════════════════

  function resetMazeDots() {
    totalDots = 0;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const cell = maze[y][x];
        if (cell.original === "dot" || cell.original === "energizer") {
          cell.type = cell.original;
          totalDots++;
        }
      }
    }
    state.dotsEaten = 0;
    state.dotsRemaining = totalDots;
  }

  function startLevel(newLevel = false) {
    if (newLevel) {
      state.level++;
      resetMazeDots();
      state.fruitEatenThisLevel = 0;
      ghostList.forEach((g) => {
        g.dotCounter = 0;
      });
    }
    state.fruit = null;
    state.ghostCombo = 0;
    state.frightTimer = 0;
    state.modeWaveIndex = 0;
    state.modeTimer = modeWaves(state.level)[0].time;
    state.globalDotCounter = -1;
    state.houseTimer = 0;
    state.flashMaze = false;
    state.freeze = 0;

    pac.reset();
    ghostList.forEach((g) => g.reset(newLevel));

    // On new life (not new level), use global counter for release
    // (handled by caller via globalDotCounter)

    state.phase = "ready";
    // Longer READY when intro jingle is playing (~2.7s); shorter after a death
    state.readyTimer = state._longReady ? 2.75 : 2.0;
    state._longReady = false;
    audio.stopAllLoops();
    updateHUD();
    // Arcade shows READY! on the maze itself (canvas), not a full overlay
    hideOverlay();
  }

  function startGame() {
    audio.resume();
    audio.startJingle();
    state.score = 0;
    state.level = 1;
    state.lives = 3;
    state.extraLifeAwarded = false;
    resetMazeDots();
    state.fruitEatenThisLevel = 0;
    ghostList.forEach((g) => {
      g.dotCounter = 0;
    });
    state.globalDotCounter = -1;
    state._longReady = true; // hold READY through intro jingle
    startLevel(false);
    updateHUD();
  }

  function addScore(n) {
    state.score += n;
    if (state.score > state.highScore) {
      state.highScore = state.score;
      localStorage.setItem("pacman-hi", String(state.highScore));
    }
    if (!state.extraLifeAwarded && state.score >= 10000) {
      state.extraLifeAwarded = true;
      state.lives++;
      audio.extraLife();
      updateHUD();
    }
    updateHUD();
  }

  function popup(x, y, text) {
    popups.push({ x, y, text, life: 1.0 });
  }

  // ═══════════════════════════════════════════════════════════════
  // MOVEMENT — PAC-MAN
  // ═══════════════════════════════════════════════════════════════

  function canEnter(tx, ty) {
    const t = tileAt(tx, ty);
    if (!t) {
      return ty === 14; // tunnel wrap
    }
    return t.type !== "wall" && t.type !== "door";
  }

  function pelletHere(tx, ty) {
    const t = tileAt(tx, ty);
    return !!(t && (t.type === "dot" || t.type === "energizer"));
  }

  // Snap a queued turn onto the tile center. Returns distance skipped, or null.
  function commitTurn() {
    if (!pac.nextDir || pac.nextDir === pac.dir) {
      if (pac.nextDir === pac.dir) pac.nextDir = null;
      return null;
    }
    if (OPP.get(pac.dir) === pac.nextDir) {
      pac.dir = pac.nextDir;
      pac.nextDir = null;
      return 0;
    }
    const c = pac.centerOfTile();
    const along =
      pac.dir.x !== 0 ? (c.x - pac.x) * pac.dir.x : (c.y - pac.y) * pac.dir.y;
    // A little before the center, and a little after, still counts.
    if (along > 0.55 || along < -0.4) return null;
    const bx = Math.floor(c.x + 1e-6);
    const by = Math.floor(c.y + 1e-6);
    if (!canEnter(bx + pac.nextDir.x, by + pac.nextDir.y)) return null;
    pac.x = c.x;
    pac.y = c.y;
    pac.dir = pac.nextDir;
    pac.nextDir = null;
    return Math.max(0, along);
  }

  function updatePac(dt, spec) {
    if (!pac.alive || pac.dying) return;

    if (state.heldDirs.length) {
      pac.nextDir = state.heldDirs[state.heldDirs.length - 1];
    }

    const tx = pac.tileX();
    const ty = pac.tileY();
    // Slow for a whole dotted run, not a pulse in the middle of each tile.
    const eating =
      pelletHere(tx, ty) || pelletHere(tx + pac.dir.x, ty + pac.dir.y);
    const speedMul =
      state.frightTimer > 0
        ? eating
          ? spec.frightPacDots
          : spec.frightPac
        : eating
          ? spec.pacDots
          : spec.pac;
    pac.speed = FULL_SPEED * speedMul;

    let remaining = pac.speed * dt;
    pac.stopped = false;
    let guard = 0;
    while (remaining > 1e-6 && guard++ < 10) {
      const skipped = commitTurn();
      if (skipped != null) {
        remaining = Math.max(0, remaining - skipped);
        continue;
      }

      if (pac.y >= 13.4 && pac.y < 15.6) {
        if (pac.x < -0.5) pac.x += COLS;
        if (pac.x >= COLS + 0.5) pac.x -= COLS;
      }

      const c = pac.centerOfTile();
      const toCenter =
        pac.dir.x !== 0 ? (c.x - pac.x) * pac.dir.x : (c.y - pac.y) * pac.dir.y;
      if (toCenter > 0.001) {
        const step = Math.min(remaining, toCenter);
        pac.x += pac.dir.x * step;
        pac.y += pac.dir.y * step;
        remaining -= step;
        continue;
      }

      const fx = Math.floor(pac.x + 1e-4);
      const fy = Math.floor(pac.y + 1e-4);
      const nextTX = fx + pac.dir.x;
      const nextTY = fy + pac.dir.y;
      if (!canEnter(nextTX, nextTY)) {
        pac.x = fx + 0.5;
        pac.y = fy + 0.5;
        pac.stopped = true;
        remaining = 0;
      } else {
        const step = Math.min(remaining, 1);
        pac.x += pac.dir.x * step;
        pac.y += pac.dir.y * step;
        remaining -= step;
      }
    }

    if (pac.y >= 13 && pac.y <= 15) {
      if (pac.x < -0.5) pac.x += COLS;
      if (pac.x >= COLS + 0.5) pac.x -= COLS;
    }

    if (!pac.stopped) {
      pac.animTimer += dt;
      pac.mouth = (Math.sin(pac.animTimer * 18) + 1) / 2;
    } else {
      pac.mouth = 0.18;
    }

    eatAtPac();
  }

  function eatAtPac() {
    const tx = Math.floor(pac.x);
    const ty = Math.floor(pac.y);
    // Only eat when close to center of tile
    const c = { x: tx + 0.5, y: ty + 0.5 };
    if (Math.abs(pac.x - c.x) > 0.35 || Math.abs(pac.y - c.y) > 0.35) return;

    const cell = tileAt(tx, ty);
    if (!cell) return;

    if (cell.type === "dot") {
      cell.type = "empty";
      state.dotsEaten++;
      state.dotsRemaining--;
      addScore(10);
      audio.waka();
      onDotEaten();
    } else if (cell.type === "energizer") {
      cell.type = "empty";
      state.dotsEaten++;
      state.dotsRemaining--;
      addScore(50);
      audio.waka();
      triggerFright();
      onDotEaten();
    }

    // Fruit
    if (state.fruit) {
      const fx = 13.5;
      const fy = 17;
      if (Math.abs(pac.x - fx) < 0.7 && Math.abs(pac.y - fy) < 0.7) {
        addScore(state.fruit.fruit.points);
        popup(fx, fy, String(state.fruit.fruit.points));
        audio.stopAllLoops();
        audio.eatFruit();
        state.fruit = null;
        state.fruitEatenThisLevel++;
        state.freeze = 0.35;
      }
    }
  }

  function onDotEaten() {
    // Fruit spawn
    if (state.dotsEaten === 70 || state.dotsEaten === 170) {
      const f = levelSpec(state.level).fruit;
      state.fruit = {
        fruit: f,
        timer: 9 + Math.random(), // 9–10s
      };
    }

    // Ghost house release counters
    if (state.globalDotCounter >= 0) {
      state.globalDotCounter++;
    } else {
      // Increment counter of first ghost still in house (by priority pinky, inky, clyde)
      for (const name of ["pinky", "inky", "clyde"]) {
        const g = ghosts[name];
        if (g.inHouse && !g.leaving) {
          g.dotCounter++;
          break;
        }
      }
    }

    // Cruise Elroy
    updateElroy();

    // Level clear?
    if (state.dotsRemaining <= 0) {
      state.phase = "levelclear";
      state.levelClearTimer = 2.5;
      state.flashMaze = false;
      audio.stopAllLoops();
    }

    // Reset house timer when a dot is eaten
    state.houseTimer = 0;
  }

  function updateElroy() {
    const spec = levelSpec(state.level);
    const b = ghosts.blinky;
    if (state.dotsRemaining <= spec.elroy2Dots) b.elroy = 2;
    else if (state.dotsRemaining <= spec.elroy1Dots) b.elroy = 1;
    else b.elroy = 0;
  }

  function triggerFright() {
    const spec = levelSpec(state.level);
    if (spec.frightTime <= 0) {
      // Still reverse ghosts
      ghostList.forEach((g) => {
        if (g.mode !== "eaten" && !g.inHouse && !g.leaving) {
          g.dir = OPP.get(g.dir) || g.dir;
          g.nextTile = null;
        }
      });
      return;
    }
    state.frightTimer = spec.frightTime;
    state.ghostCombo = 0;
    ghostList.forEach((g) => {
      if (g.mode === "eaten") return;
      if (!g.inHouse && !g.leaving) {
        g.dir = OPP.get(g.dir) || g.dir;
        g.nextTile = null;
      }
      // Ghosts still in the pen aren't frightened until they leave (arcade-like)
      if (!g.inHouse && !g.leaving) {
        g.frightened = true;
        g.flashing = false;
        g.mode = "frightened";
      }
    });
    // Fright siren starts via per-frame updateLoopSounds
    audio.stopEyes();
    audio.startFrightSiren();
  }

  // ═══════════════════════════════════════════════════════════════
  // GHOST AI
  // ═══════════════════════════════════════════════════════════════

  function currentGhostMode() {
    if (state.frightTimer > 0) return "frightened";
    const waves = modeWaves(state.level);
    const w = waves[Math.min(state.modeWaveIndex, waves.length - 1)];
    return w.mode;
  }

  function getChaseTarget(ghost) {
    const px = pac.x;
    const py = pac.y;
    const pd = pac.dir;

    if (ghost.name === "blinky") {
      return { x: px, y: py };
    }
    if (ghost.name === "pinky") {
      // 4 tiles ahead; UP bug: also 4 left
      let tx = px + pd.x * 4;
      let ty = py + pd.y * 4;
      if (pd === UP) tx -= 4;
      return { x: tx, y: ty };
    }
    if (ghost.name === "inky") {
      // 2 ahead of pac (with UP bug), then double vector from blinky
      let ax = px + pd.x * 2;
      let ay = py + pd.y * 2;
      if (pd === UP) ax -= 2;
      const bx = ghosts.blinky.x;
      const by = ghosts.blinky.y;
      return { x: ax + (ax - bx), y: ay + (ay - by) };
    }
    // Clyde: if dist > 8 chase pac else scatter
    if (dist({ x: ghost.x, y: ghost.y }, { x: px, y: py }) > 8) {
      return { x: px, y: py };
    }
    return { ...SCATTER.clyde };
  }

  function getTarget(ghost) {
    if (ghost.mode === "eaten") {
      return { x: GHOST_HOUSE.exitX, y: GHOST_HOUSE.exitY }; // door entry
    }
    if (ghost.frightened) {
      // random — handled in direction pick
      return null;
    }
    // Elroy: always chase even in scatter
    if (ghost.name === "blinky" && ghost.elroy > 0) {
      return getChaseTarget(ghost);
    }
    const mode = currentGhostMode();
    if (ghost.frightened) return null;
    if (mode === "scatter") return { ...SCATTER[ghost.name] };
    return getChaseTarget(ghost);
  }

  /** Can this ghost step onto tile (tx, ty)? */
  function ghostCanPass(tx, ty, ghost) {
    // Horizontal tunnel wrap
    if (ty === 14 && (tx < 0 || tx >= COLS)) return true;
    if (ty < 0 || ty >= ROWS) return false;
    if (tx < 0 || tx >= COLS) return false;
    const t = maze[ty][tx];
    if (t.type === "wall") return false;
    if (t.type === "door") {
      // Door only for eyes / scripted house sequences
      return ghost.mode === "eaten" || ghost.leaving || ghost.enterHouse;
    }
    return true;
  }

  /**
   * At a tile center, choose next direction (arcade rules).
   * Does not reverse except when forced, or when a dead end leaves no other way.
   * Eyes included: reversing on every tile parks them on the cell nearest the house.
   */
  function pickGhostDir(ghost) {
    const tx = Math.floor(ghost.x + 1e-6);
    const ty = Math.floor(ghost.y + 1e-6);
    ghost.x = tx + 0.5;
    ghost.y = ty + 0.5;

    const reverse = OPP.get(ghost.dir);
    const target = getTarget(ghost);
    const allowReverse = ghost.forcedReverse;

    const options = [];
    for (const d of DIRS) {
      if (d === reverse && !allowReverse) continue;
      const nx = tx + d.x;
      const ny = ty + d.y;
      if (!ghostCanPass(nx, ny, ghost)) continue;
      if (
        d === UP &&
        ghost.mode !== "eaten" &&
        NO_UP_TILES.has(tileKey(tx, ty))
      ) {
        continue;
      }
      options.push(d);
    }

    // Must reverse if dead-end (should be rare)
    if (options.length === 0 && reverse && ghostCanPass(tx + reverse.x, ty + reverse.y, ghost)) {
      options.push(reverse);
    }
    if (options.length === 0) {
      // Absolute fallback — any open neighbor
      for (const d of DIRS) {
        if (ghostCanPass(tx + d.x, ty + d.y, ghost)) options.push(d);
      }
    }
    if (options.length === 0) {
      ghost.dir = reverse || LEFT;
      ghost.forcedReverse = false;
      return;
    }

    if (ghost.frightened && ghost.mode !== "eaten") {
      ghost.dir = options[Math.floor(Math.random() * options.length)];
    } else {
      // Prefer direction whose next tile center is closest to target.
      // Tie-break order: UP, LEFT, DOWN, RIGHT (DIRS array order).
      let best = options[0];
      let bestDist = Infinity;
      for (const d of options) {
        const nx = tx + d.x + 0.5;
        const ny = ty + d.y + 0.5;
        const dd = dist({ x: nx, y: ny }, target || { x: nx, y: ny });
        if (dd + 1e-6 < bestDist) {
          bestDist = dd;
          best = d;
        }
      }
      ghost.dir = best;
    }

    ghost.forcedReverse = false;
    ghost.target = target || ghost.target;
  }

  function ghostPersonalDotLimit(name) {
    // Level 1 is the slow release. Later levels send Inky out with Pinky.
    if (state.level <= 1) return { pinky: 0, inky: 30, clyde: 60 }[name];
    return { pinky: 0, inky: 0, clyde: 50 }[name];
  }

  function ghostGlobalDotLimit(name) {
    return { pinky: 7, inky: 17, clyde: 32 }[name];
  }

  function shouldReleaseGhost(ghost) {
    if (!ghost.inHouse || ghost.leaving) return false;
    if (ghost.name === "blinky") return true;
    // One ghost in the doorway at a time. The next waits until the lane is clear.
    const order = ["pinky", "inky", "clyde"];
    const idx = order.indexOf(ghost.name);
    for (let i = 0; i < idx; i++) {
      const ahead = ghosts[order[i]];
      if (ahead.inHouse || ahead.leaving) return false;
    }

    if (state.globalDotCounter >= 0) {
      const limit = ghostGlobalDotLimit(ghost.name);
      if (limit != null && state.globalDotCounter >= limit) return true;
    } else {
      const limit = ghostPersonalDotLimit(ghost.name);
      if (limit != null && ghost.dotCounter >= limit) return true;
    }

    const timeout = state.level === 1 ? 4 : 3;
    if (state.houseTimer > timeout) {
      for (const name of ["pinky", "inky", "clyde"]) {
        const g = ghosts[name];
        if (g.inHouse && !g.leaving) {
          return ghost.name === name;
        }
      }
    }
    return false;
  }

  /** Move ghost toward a point without overshooting; returns true when arrived. */
  function steerGhostTo(ghost, tx, ty, speed, dt) {
    const dx = tx - ghost.x;
    const dy = ty - ghost.y;
    const distLeft = Math.hypot(dx, dy);
    if (distLeft <= 0.001) {
      ghost.x = tx;
      ghost.y = ty;
      return true;
    }
    const step = Math.min(speed * dt, distLeft);
    ghost.x += (dx / distLeft) * step;
    ghost.y += (dy / distLeft) * step;
    if (Math.abs(dx) >= Math.abs(dy)) {
      ghost.dir = dx >= 0 ? RIGHT : LEFT;
    } else {
      ghost.dir = dy >= 0 ? DOWN : UP;
    }
    return distLeft - step <= 0.001;
  }

  function finishLeavingHouse(ghost) {
    ghost.x = GHOST_HOUSE.exitX;
    ghost.y = GHOST_HOUSE.exitY;
    ghost.inHouse = false;
    ghost.leaving = false;
    ghost.enterHouse = false;
    ghost.housePhase = null;
    ghost.houseTimer = 0;
    ghost.nextTile = null; // force fresh maze step
    ghost.dir = LEFT;
    if (state.frightTimer > 0) {
      ghost.frightened = true;
      ghost.flashing = state.frightTimer < 2;
      ghost.mode = "frightened";
    } else {
      ghost.frightened = false;
      ghost.flashing = false;
      ghost.mode = currentGhostMode();
    }
    ghost.forcedReverse = false;
  }

  function updateGhostHouse(ghost, dt) {
    const speed = FULL_SPEED * 0.5;
    ghost.houseTimer = (ghost.houseTimer || 0) + dt;

    // Failsafe: if a leave/enter sequence stalls, teleport out
    if ((ghost.leaving || ghost.enterHouse) && ghost.houseTimer > 4) {
      finishLeavingHouse(ghost);
      return true;
    }

    // Eyes diving back into the pen, then re-exit
    if (ghost.enterHouse) {
      ghost.speed = speed * 1.4;
      if (!ghost.housePhase) ghost.housePhase = "dropIn";

      if (ghost.housePhase === "toDoorX" || ghost.housePhase === "dropIn") {
        // Line up and drop to pen in one steer if possible
        if (Math.abs(ghost.x - GHOST_HOUSE.exitX) > 0.02) {
          steerGhostTo(ghost, GHOST_HOUSE.exitX, ghost.y, ghost.speed, dt);
          return true;
        }
        ghost.x = GHOST_HOUSE.exitX;
        if (steerGhostTo(ghost, GHOST_HOUSE.exitX, GHOST_HOUSE.penY, ghost.speed, dt)) {
          ghost.housePhase = "toSlot";
        }
        return true;
      }
      if (ghost.housePhase === "toSlot") {
        const slotX =
          ghost.name === "inky"
            ? GHOST_HOUSE.inkyHome.x
            : ghost.name === "clyde"
              ? GHOST_HOUSE.clydeHome.x
              : GHOST_HOUSE.exitX;
        if (steerGhostTo(ghost, slotX, GHOST_HOUSE.penY, speed, dt)) {
          ghost.enterHouse = false;
          ghost.inHouse = true;
          ghost.leaving = true;
          ghost.housePhase = "centerX";
          ghost.houseTimer = 0;
          ghost.frightened = false;
          ghost.flashing = false;
          ghost.mode = currentGhostMode();
        }
        return true;
      }
      ghost.housePhase = "dropIn";
      return true;
    }

    // Decide whether to start leaving
    if (ghost.inHouse && !ghost.leaving && shouldReleaseGhost(ghost)) {
      ghost.leaving = true;
      ghost.housePhase = "centerX";
      ghost.houseTimer = 0;
      state.houseTimer = 0;
    }

    // Exit: pen lane → under door → up through door → maze
    if (ghost.leaving) {
      ghost.inHouse = true;
      ghost.speed = speed;
      if (!ghost.housePhase) ghost.housePhase = "centerX";

      if (ghost.housePhase === "centerX") {
        // Vertical to pen lane, then horizontal to door column
        if (Math.abs(ghost.y - GHOST_HOUSE.penY) > 0.02) {
          steerGhostTo(ghost, ghost.x, GHOST_HOUSE.penY, speed, dt);
          return true;
        }
        ghost.y = GHOST_HOUSE.penY;
        if (steerGhostTo(ghost, GHOST_HOUSE.exitX, GHOST_HOUSE.penY, speed, dt)) {
          ghost.x = GHOST_HOUSE.exitX;
          ghost.housePhase = "exitUp";
        }
        return true;
      }

      if (ghost.housePhase === "exitUp") {
        if (steerGhostTo(ghost, GHOST_HOUSE.exitX, GHOST_HOUSE.exitY, speed, dt)) {
          finishLeavingHouse(ghost);
        }
        return true;
      }

      ghost.housePhase = "centerX";
      return true;
    }

    if (ghost.inHouse) {
      // Idle bounce while waiting for release
      ghost.speed = FULL_SPEED * 0.35;
      if (ghost.dir !== UP && ghost.dir !== DOWN) ghost.dir = UP;
      ghost.y += ghost.dir.y * ghost.speed * dt;
      if (ghost.y <= GHOST_HOUSE.penMinY) {
        ghost.y = GHOST_HOUSE.penMinY;
        ghost.dir = DOWN;
      } else if (ghost.y >= GHOST_HOUSE.penMaxY) {
        ghost.y = GHOST_HOUSE.penMaxY;
        ghost.dir = UP;
      }
      if (ghost.name === "inky") ghost.x = GHOST_HOUSE.inkyHome.x;
      else if (ghost.name === "clyde") ghost.x = GHOST_HOUSE.clydeHome.x;
      else ghost.x = GHOST_HOUSE.exitX;
      return true;
    }

    return false;
  }

  /**
   * Maze movement: always travel toward the *next tile's center*.
   * Previous logic used "distance to current tile center" which went
   * negative after leaving the center, snapping ghosts back forever.
   */
  function updateGhostMazeMove(ghost, dt) {
    let remaining = ghost.speed * dt;
    let guard = 0;
    // Eyes travel at double speed, so one frame can walk them off the gate
    // before the house entry gets a look at them.
    const homeX = Math.floor(GHOST_HOUSE.exitX);
    const homeY = Math.floor(GHOST_HOUSE.exitY);
    const parkedOnGate = (ax, ay) =>
      ghost.mode === "eaten" && ax === homeX && ay === homeY;

    while (remaining > 1e-6 && guard++ < 12) {
      // Tunnel wrap (continuous)
      if (ghost.y >= 13 && ghost.y <= 15) {
        if (ghost.x < -0.5) ghost.x += COLS;
        if (ghost.x >= COLS + 0.5) ghost.x -= COLS;
      }

      // Need a destination tile?
      if (!ghost.nextTile) {
        // Align to current tile center, pick a direction, set next tile
        const tx = Math.floor(ghost.x + 1e-6);
        const ty = Math.floor(ghost.y + 1e-6);
        ghost.x = tx + 0.5;
        ghost.y = ty + 0.5;

        pickGhostDir(ghost);

        const nx = tx + ghost.dir.x;
        const ny = ty + ghost.dir.y;
        ghost.nextTile = { x: nx, y: ny };
      }

      // Destination center (with tunnel wrap preference)
      let destX = ghost.nextTile.x + 0.5;
      let destY = ghost.nextTile.y + 0.5;

      // Shortest horizontal path through tunnel
      if (ghost.nextTile.y === 14 || (ghost.y >= 13 && ghost.y <= 15)) {
        // If next tile is outside [0,COLS), wrap dest into continuous space near ghost
        if (ghost.nextTile.x < 0) destX = -0.5;
        else if (ghost.nextTile.x >= COLS) destX = COLS + 0.5;
        // Also when ghost wrapped: if dest is far, adjust
        if (ghost.x > COLS - 2 && ghost.nextTile.x <= 1) {
          destX = ghost.nextTile.x + 0.5 + COLS;
        } else if (ghost.x < 2 && ghost.nextTile.x >= COLS - 2) {
          destX = ghost.nextTile.x + 0.5 - COLS;
        }
      }

      const dx = destX - ghost.x;
      const dy = destY - ghost.y;
      const distLeft = Math.hypot(dx, dy);

      if (distLeft <= 1e-4) {
        // Arrived — snap and clear destination so we pick again
        let arrX = ghost.nextTile.x;
        let arrY = ghost.nextTile.y;
        if (arrX < 0) arrX += COLS;
        if (arrX >= COLS) arrX -= COLS;
        ghost.x = arrX + 0.5;
        ghost.y = arrY + 0.5;
        ghost.nextTile = null;
        if (parkedOnGate(arrX, arrY)) break;
        continue;
      }

      const step = Math.min(remaining, distLeft);
      ghost.x += (dx / distLeft) * step;
      ghost.y += (dy / distLeft) * step;
      remaining -= step;

      if (step >= distLeft - 1e-6) {
        // Landed on dest this step
        let arrX = ghost.nextTile.x;
        let arrY = ghost.nextTile.y;
        if (arrX < 0) arrX += COLS;
        if (arrX >= COLS) arrX -= COLS;
        ghost.x = arrX + 0.5;
        ghost.y = arrY + 0.5;
        ghost.nextTile = null;
        if (parkedOnGate(arrX, arrY)) break;
      }
    }
  }

  function updateGhost(ghost, dt, spec) {
    ghost.animFrame += dt * 8;

    // Eyes at door → scripted house entry
    if (ghost.mode === "eaten" && !ghost.enterHouse && !ghost.inHouse) {
      const atDoor =
        Math.abs(ghost.x - GHOST_HOUSE.exitX) < 0.45 &&
        Math.abs(ghost.y - GHOST_HOUSE.exitY) < 0.45;
      if (atDoor) {
        ghost.x = GHOST_HOUSE.exitX;
        ghost.y = GHOST_HOUSE.exitY;
        ghost.enterHouse = true;
        ghost.housePhase = "dropIn";
        ghost.houseTimer = 0;
        ghost.nextTile = null;
        ghost.frightened = false;
        ghost.flashing = false;
        updateGhostHouse(ghost, dt);
        return;
      }
    }

    // House / leaving / re-entry
    if (ghost.enterHouse || ghost.inHouse || ghost.leaving) {
      updateGhostHouse(ghost, dt);
      return;
    }

    // Recover if body is inside pen without flags
    if (ghost.mode !== "eaten" && isInsidePen(ghost)) {
      ghost.inHouse = true;
      ghost.leaving = true;
      ghost.housePhase = "centerX";
      ghost.houseTimer = 0;
      ghost.nextTile = null;
      updateGhostHouse(ghost, dt);
      return;
    }

    // Speed
    let speedMul = spec.ghost;
    if (ghost.mode === "eaten") speedMul = 2;
    else if (ghost.frightened) speedMul = spec.frightGhost;
    else if (ghost.name === "blinky" && ghost.elroy === 2) speedMul = spec.elroy2;
    else if (ghost.name === "blinky" && ghost.elroy === 1) speedMul = spec.elroy1;

    const tx = Math.floor(ghost.x);
    const ty = Math.floor(ghost.y);
    const cell = tileAt(tx, ty);
    if (cell && cell.isTunnel && ghost.mode !== "eaten") {
      speedMul = spec.tunnel;
    }
    if (ty === 14 && (ghost.x < 5.5 || ghost.x > 21.5) && ghost.mode !== "eaten") {
      speedMul = Math.min(speedMul, spec.tunnel);
    }

    ghost.speed = FULL_SPEED * speedMul;

    // Mode reverse: turn around where they stand. The next choice is the
    // next tile center they actually reach, not a fresh path from a snap.
    if (ghost.forcedReverse) {
      ghost.dir = OPP.get(ghost.dir) || LEFT;
      ghost.forcedReverse = false;
      const tx = Math.floor(ghost.x + 1e-6);
      const ty = Math.floor(ghost.y + 1e-6);
      const cx = tx + 0.5;
      const cy = ty + 0.5;
      const ahead =
        ghost.dir.x !== 0
          ? (cx - ghost.x) * ghost.dir.x
          : (cy - ghost.y) * ghost.dir.y;
      if (ahead > 0.02) ghost.nextTile = { x: tx, y: ty };
      else ghost.nextTile = { x: tx + ghost.dir.x, y: ty + ghost.dir.y };
    }

    updateGhostMazeMove(ghost, dt);
  }

  // ═══════════════════════════════════════════════════════════════
  // COLLISIONS
  // ═══════════════════════════════════════════════════════════════

  function checkCollisions() {
    for (const g of ghostList) {
      if (g.inHouse || g.leaving || g.enterHouse) continue;
      const d = dist({ x: pac.x, y: pac.y }, { x: g.x, y: g.y });
      if (d < 0.75) {
        if (g.frightened && g.mode !== "eaten") {
          // Eat ghost
          g.mode = "eaten";
          g.frightened = false;
          g.flashing = false;
          g.nextTile = null;
          state.ghostCombo++;
          const pts = 200 * Math.pow(2, state.ghostCombo - 1);
          addScore(pts);
          popup(g.x, g.y, String(pts));
          state.freeze = Math.min(1.05, 0.32 + state.ghostCombo * 0.12);
          g.hideTimer = state.freeze;
          pac.hideTimer = state.freeze;
          audio.stopAllLoops();
          audio.eatGhost();
        } else if (g.mode !== "eaten" && !g.frightened) {
          // Death
          killPac();
          return;
        }
      }
    }
  }

  function killPac() {
    pac.alive = false;
    pac.dying = true;
    state.phase = "dying";
    state.dieTimer = 2.0;
    pac.deathFrame = 0;
    audio.stopAllLoops();
    audio.death();
  }

  function anyGhostEyes() {
    return ghostList.some((g) => g.mode === "eaten" || g.enterHouse);
  }

  function syncLoopAudio() {
    audio.updateLoopSounds(
      state.dotsRemaining,
      totalDots,
      state.frightTimer,
      anyGhostEyes(),
      state.phase === "playing"
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // MODE TIMERS
  // ═══════════════════════════════════════════════════════════════

  function updateModes(dt) {
    if (state.frightTimer > 0) {
      state.frightTimer -= dt;
      const spec = levelSpec(state.level);
      // Flashing near end
      const flashPeriod = (spec.flashes * 0.28); // approx
      if (state.frightTimer < flashPeriod && state.frightTimer > 0) {
        ghostList.forEach((g) => {
          if (g.frightened) g.flashing = true;
        });
      }
      if (state.frightTimer <= 0) {
        state.frightTimer = 0;
        state.ghostCombo = 0;
        ghostList.forEach((g) => {
          if (g.mode === "eaten") return;
          g.frightened = false;
          g.flashing = false;
          g.mode = currentGhostMode();
        });
        // Frightened ghosts do not reverse again when the blue wears off.
        // Chase siren is restored by syncLoopAudio.
      }
      return; // mode timer paused during fright
    }

    const waves = modeWaves(state.level);
    if (state.modeWaveIndex >= waves.length) return;
    state.modeTimer -= dt;
    if (state.modeTimer <= 0) {
      state.modeWaveIndex++;
      if (state.modeWaveIndex < waves.length) {
        state.modeTimer = waves[state.modeWaveIndex].time;
        const newMode = waves[state.modeWaveIndex].mode;
        ghostList.forEach((g) => {
          if (g.frightened || g.mode === "eaten" || g.inHouse || g.leaving) return;
          g.mode = newMode;
          g.forcedReverse = true;
          g.nextTile = null;
        });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // DRAWING
  // ═══════════════════════════════════════════════════════════════

  function tx(x) {
    return x * TILE;
  }
  function ty(y) {
    return y * TILE;
  }

  // Wall outline, built once. Each loop walks clockwise around a wall
  // block (the wall sits on the right of every edge) and is then pulled
  // a couple of pixels into the wall so the corridors stay wide.
  let mazeLoops = null;

  function isWallCell(x, y) {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
    return maze[y][x].type === "wall";
  }

  function offsetLoop(pts, dist) {
    const n = pts.length;
    const out = [];
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n];
      const curr = pts[i];
      const next = pts[(i + 1) % n];
      let ax = curr.x - prev.x;
      let ay = curr.y - prev.y;
      let bx = next.x - curr.x;
      let by = next.y - curr.y;
      const al = Math.hypot(ax, ay) || 1;
      const bl = Math.hypot(bx, by) || 1;
      ax /= al;
      ay /= al;
      bx /= bl;
      by /= bl;
      const n1x = -ay;
      const n1y = ax;
      const n2x = -by;
      const n2y = bx;
      let mx = n1x + n2x;
      let my = n1y + n2y;
      const ml = Math.hypot(mx, my) || 1;
      mx /= ml;
      my /= ml;
      const denom = mx * n2x + my * n2y;
      let miter = denom !== 0 ? dist / denom : dist;
      miter = Math.max(-dist * 1.8, Math.min(dist * 1.8, miter));
      out.push({ x: curr.x + mx * miter, y: curr.y + my * miter });
    }
    return out;
  }

  function simplifyLoop(pts) {
    const n = pts.length;
    const out = [];
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n];
      const curr = pts[i];
      const next = pts[(i + 1) % n];
      const cross =
        (curr.x - prev.x) * (next.y - curr.y) -
        (curr.y - prev.y) * (next.x - curr.x);
      if (Math.abs(cross) > 0.01) out.push(curr);
    }
    return out;
  }

  function buildMazeLoops() {
    const outgoing = new Map();
    const addEdge = (x1, y1, x2, y2) => {
      const k = x1 + "," + y1;
      let arr = outgoing.get(k);
      if (!arr) outgoing.set(k, (arr = []));
      arr.push({ x: x2, y: y2 });
    };
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!isWallCell(x, y)) continue;
        const x0 = x * TILE;
        const y0 = y * TILE;
        const x1 = x0 + TILE;
        const y1 = y0 + TILE;
        if (!isWallCell(x, y - 1)) addEdge(x0, y0, x1, y0);
        if (!isWallCell(x + 1, y)) addEdge(x1, y0, x1, y1);
        if (!isWallCell(x, y + 1)) addEdge(x1, y1, x0, y1);
        if (!isWallCell(x - 1, y)) addEdge(x0, y1, x0, y0);
      }
    }
    const loops = [];
    for (const startK of [...outgoing.keys()]) {
      while (outgoing.get(startK)?.length) {
        const [sx, sy] = startK.split(",").map(Number);
        let curr = outgoing.get(startK).pop();
        const loop = [{ x: sx, y: sy }];
        let guard = 0;
        let closed = false;
        while (guard++ < 8000) {
          loop.push({ x: curr.x, y: curr.y });
          if (curr.x === sx && curr.y === sy) {
            closed = true;
            break;
          }
          const outs = outgoing.get(curr.x + "," + curr.y);
          if (!outs || !outs.length) break;
          curr = outs.pop();
        }
        if (!closed || loop.length < 4) continue;
        loop.pop();
        loops.push(simplifyLoop(offsetLoop(loop, 2)));
      }
    }
    return loops;
  }

  function strokeRounded(pts, radius) {
    const n = pts.length;
    if (n < 3) return;
    ctx.beginPath();
    ctx.moveTo((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
    for (let i = 1; i <= n; i++) {
      const prev = pts[(i - 1 + n) % n];
      const curr = pts[i % n];
      const next = pts[(i + 1) % n];
      const len1 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      const len2 = Math.hypot(next.x - curr.x, next.y - curr.y);
      const r = Math.max(0, Math.min(radius, len1 * 0.45, len2 * 0.45));
      ctx.arcTo(curr.x, curr.y, next.x, next.y, r);
    }
    ctx.closePath();
    ctx.stroke();
  }

  function drawMaze() {
    const wallColor = state.flashMaze ? COLORS.mazeFlash : COLORS.maze;
    ctx.fillStyle = COLORS.black;
    ctx.fillRect(0, 0, W, H);

    if (!mazeLoops) mazeLoops = buildMazeLoops();
    ctx.strokeStyle = wallColor;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const pts of mazeLoops) strokeRounded(pts, 6);

    ctx.fillStyle = "#FFB8FF";
    ctx.fillRect(13 * TILE + 1, 12 * TILE + TILE / 2 - 1.5, 2 * TILE - 2, 3);

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const cell = maze[y][x];
        if (cell.type === "dot") {
          ctx.fillStyle = COLORS.dot;
          ctx.beginPath();
          ctx.arc(tx(x) + TILE / 2, ty(y) + TILE / 2, 2.3, 0, Math.PI * 2);
          ctx.fill();
        } else if (cell.type === "energizer") {
          const blink = Math.floor(performance.now() / 200) % 2 === 0;
          if (blink || state.phase === "title" || state.phase === "ready") {
            ctx.fillStyle = COLORS.dot;
            ctx.beginPath();
            ctx.arc(tx(x) + TILE / 2, ty(y) + TILE / 2, 6.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
  }

  function drawPac() {
    if (!pac.alive && !pac.dying) return;
    if (pac.hideTimer > 0) return;

    const cx = pac.x * TILE;
    const cy = pac.y * TILE;
    const r = 7.2;

    if (pac.dying) {
      // The wedge opens flat, then folds away. No sparkles.
      const t = 1 - state.dieTimer / 2.0;
      if (t < 0.85) {
        const startAngle = -Math.PI / 2 + t * Math.PI;
        const endAngle = -Math.PI / 2 - t * Math.PI + Math.PI * 2;
        ctx.fillStyle = COLORS.pac;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, startAngle, endAngle, false);
        ctx.closePath();
        ctx.fill();
      }
      return;
    }

    // Mouth opening based on direction
    let rot = 0;
    if (pac.dir === RIGHT) rot = 0;
    else if (pac.dir === DOWN) rot = Math.PI / 2;
    else if (pac.dir === LEFT) rot = Math.PI;
    else if (pac.dir === UP) rot = -Math.PI / 2;

    const mouthOpen = pac.stopped ? 0.15 : 0.05 + pac.mouth * 0.4;
    const a0 = rot + mouthOpen * Math.PI;
    const a1 = rot + (2 - mouthOpen) * Math.PI;

    ctx.fillStyle = COLORS.pac;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, a0, a1, false);
    ctx.closePath();
    ctx.fill();
  }

  function drawGhost(g) {
    if (state.phase === "dying") return;
    if (g.hideTimer > 0) return;

    const cx = g.x * TILE;
    const cy = g.y * TILE;

    if (g.mode === "eaten" || g.enterHouse) {
      drawGhostEyes(cx, cy - 1, g.dir);
      return;
    }

    let bodyColor = g.color;
    if (g.frightened) {
      const blinkOn = Math.floor(performance.now() / 150) % 2 === 0;
      bodyColor = g.flashing && blinkOn ? COLORS.frightFlash : COLORS.fright;
    }

    const r = 7;
    const bot = cy + 6;
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc(cx, cy - 1, r, Math.PI, 0, false);
    ctx.lineTo(cx + r, bot);
    const waves = 3;
    const ww = (r * 2) / waves;
    const frame = Math.floor(g.animFrame) % 2;
    for (let i = 0; i < waves; i++) {
      const xR = cx + r - i * ww;
      const xL = xR - ww;
      const mid = (xR + xL) / 2;
      const down = frame === 0 ? i % 2 === 0 : i % 2 !== 0;
      ctx.quadraticCurveTo(mid, bot + (down ? 3.2 : -1.4), xL, bot);
    }
    ctx.closePath();
    ctx.fill();

    if (g.frightened) {
      const face =
        g.flashing && Math.floor(performance.now() / 150) % 2 === 0
          ? "#FF0000"
          : "#FFB8FF";
      ctx.fillStyle = face;
      ctx.beginPath();
      ctx.arc(cx - 3.3, cy - 2, 1.45, 0, Math.PI * 2);
      ctx.arc(cx + 3.3, cy - 2, 1.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = face;
      ctx.lineWidth = 1.3;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy + 3.2);
      for (let i = 1; i <= 4; i++) {
        ctx.lineTo(cx - 5 + i * 2.5, cy + 3.2 + (i % 2 === 0 ? 1.8 : -1.8));
      }
      ctx.stroke();
    } else {
      drawGhostEyes(cx, cy - 1, g.dir);
    }
  }

  function drawGhostEyes(cx, cy, dir) {
    ctx.fillStyle = COLORS.eyeWhite;
    const eyeY = cy - 1.2;
    ctx.beginPath();
    ctx.ellipse(cx - 3.2, eyeY, 2.6, 3.1, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 3.2, eyeY, 2.6, 3.1, 0, 0, Math.PI * 2);
    ctx.fill();

    let ox = 0;
    let oy = 0;
    if (dir === LEFT) ox = -1.5;
    else if (dir === RIGHT) ox = 1.5;
    else if (dir === UP) oy = -1.6;
    else if (dir === DOWN) oy = 1.6;
    ctx.fillStyle = COLORS.eyeBlue;
    ctx.beginPath();
    ctx.arc(cx - 3.2 + ox, eyeY + oy, 1.35, 0, Math.PI * 2);
    ctx.arc(cx + 3.2 + ox, eyeY + oy, 1.35, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFruitIcon(c, x, y, fruit, scale = 1) {
    c.save();
    c.translate(x, y);
    c.scale(scale, scale);
    const name = fruit.name;
    if (name === "Cherry") {
      c.fillStyle = fruit.color;
      c.beginPath();
      c.arc(-3, 2, 4, 0, Math.PI * 2);
      c.arc(3, 3, 4, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = fruit.stem;
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(-3, -1);
      c.quadraticCurveTo(0, -8, 3, 0);
      c.stroke();
    } else if (name === "Strawberry") {
      c.fillStyle = fruit.color;
      c.beginPath();
      c.moveTo(0, 7);
      c.bezierCurveTo(-7, 2, -5, -4, 0, -4);
      c.bezierCurveTo(5, -4, 7, 2, 0, 7);
      c.fill();
      c.fillStyle = "#00FF00";
      c.fillRect(-3, -6, 6, 3);
      c.fillStyle = "#FFFF00";
      for (const [sx, sy] of [[-2, 0], [2, 1], [0, 3]]) {
        c.fillRect(sx, sy, 1.5, 1.5);
      }
    } else if (name === "Peach") {
      c.fillStyle = fruit.color;
      c.beginPath();
      c.arc(0, 1, 6, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#00FF00";
      c.beginPath();
      c.ellipse(2, -5, 3, 2, 0.5, 0, Math.PI * 2);
      c.fill();
    } else if (name === "Apple") {
      c.fillStyle = fruit.color;
      c.beginPath();
      c.arc(0, 1, 6, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#00FF00";
      c.fillRect(-1, -7, 2, 3);
    } else if (name === "Grapes") {
      c.fillStyle = fruit.color;
      for (const [gx, gy] of [[0, -2], [-4, 1], [4, 1], [-2, 5], [2, 5], [0, 3]]) {
        c.beginPath();
        c.arc(gx, gy, 3, 0, Math.PI * 2);
        c.fill();
      }
    } else if (name === "Galaxian") {
      c.fillStyle = "#FF0000";
      c.beginPath();
      c.moveTo(0, -6);
      c.lineTo(5, 2);
      c.lineTo(0, 6);
      c.lineTo(-5, 2);
      c.closePath();
      c.fill();
      c.fillStyle = "#FFFF00";
      c.fillRect(-1.5, -2, 3, 4);
    } else if (name === "Bell") {
      c.fillStyle = fruit.color;
      c.beginPath();
      c.arc(0, -1, 5, Math.PI, 0);
      c.lineTo(5, 5);
      c.lineTo(-5, 5);
      c.closePath();
      c.fill();
      c.fillStyle = "#FFF";
      c.fillRect(-1, 5, 2, 2);
    } else {
      // Key
      c.fillStyle = fruit.color;
      c.beginPath();
      c.arc(0, -3, 3.5, 0, Math.PI * 2);
      c.fill();
      c.fillRect(-1.5, 0, 3, 7);
      c.fillRect(-1.5, 5, 5, 2);
      c.fillRect(-1.5, 3, 4, 2);
      c.fillStyle = "#000";
      c.beginPath();
      c.arc(0, -3, 1.5, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  function drawFruit() {
    if (!state.fruit) return;
    drawFruitIcon(ctx, 13.5 * TILE, 17 * TILE, state.fruit.fruit, 1.1);
  }

  function drawPopups(dt) {
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.life -= dt;
      if (p.life <= 0) {
        popups.splice(i, 1);
        continue;
      }
      ctx.fillStyle = "#DEFFFF";
      ctx.font = "10px 'Press Start 2P', monospace";
      ctx.textAlign = "center";
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillText(p.text, p.x * TILE, p.y * TILE - (1 - p.life) * 20);
      ctx.globalAlpha = 1;
    }
  }

  function drawPlate(text, y, size, color) {
    ctx.font = `${size}px 'Press Start 2P', monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const w = ctx.measureText(text).width;
    ctx.fillStyle = "rgba(0,0,0,0.88)";
    ctx.fillRect(W / 2 - w / 2 - 10, y - size * 0.72, w + 20, size * 1.45);
    ctx.fillStyle = color;
    ctx.fillText(text, W / 2, y);
  }

  function drawBanner() {
    const blink = Math.floor(performance.now() / 480) % 2 === 0;
    if (state.phase === "title") {
      drawPlate("PAC-MAN", 17.15 * TILE, 18, COLORS.pac);
      if (blink) drawPlate("PRESS SPACE OR TAP", 18.7 * TILE, 8, "#DEDEFF");
      return;
    }
    if (state.phase === "ready") {
      drawPlate("READY!", 17.5 * TILE, 14, COLORS.ready);
      return;
    }
    if (state.phase === "paused") {
      drawPlate("PAUSED", 17.5 * TILE, 14, "#FFB8FF");
      return;
    }
    if (state.phase === "gameover") {
      drawPlate("GAME OVER", 17.15 * TILE, 12, "#FF0000");
      if (blink) drawPlate("PRESS SPACE OR TAP", 18.7 * TILE, 8, "#DEDEFF");
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // MAIN LOOP
  // ═══════════════════════════════════════════════════════════════

  function update(dt) {
    // Cap dt
    dt = Math.min(dt, 0.05);

    if (state.phase === "title") {
      state.attractT += dt;
      const bob = Math.sin(state.attractT * 3) * 0.16;
      pac.x = 13.5;
      pac.y = 23;
      pac.dir = LEFT;
      pac.alive = true;
      pac.dying = false;
      pac.mouth = (Math.sin(state.attractT * 10) + 1) / 2;
      ghosts.blinky.x = GHOST_HOUSE.exitX;
      ghosts.blinky.y = GHOST_HOUSE.exitY;
      ghosts.blinky.dir = LEFT;
      ghosts.blinky.inHouse = false;
      ghosts.pinky.x = GHOST_HOUSE.pinkyHome.x;
      ghosts.pinky.y = GHOST_HOUSE.pinkyHome.y + bob;
      ghosts.pinky.dir = DOWN;
      ghosts.pinky.inHouse = true;
      ghosts.inky.x = GHOST_HOUSE.inkyHome.x;
      ghosts.inky.y = GHOST_HOUSE.inkyHome.y - bob;
      ghosts.inky.dir = UP;
      ghosts.inky.inHouse = true;
      ghosts.clyde.x = GHOST_HOUSE.clydeHome.x;
      ghosts.clyde.y = GHOST_HOUSE.clydeHome.y - bob;
      ghosts.clyde.dir = UP;
      ghosts.clyde.inHouse = true;
      ghostList.forEach((g) => {
        g.animFrame += dt * 6;
        g.frightened = false;
        g.mode = "scatter";
        g.enterHouse = false;
        g.leaving = false;
      });
      return;
    }

    if (state.phase === "paused") return;

    if (state.phase === "ready") {
      state.readyTimer -= dt;
      ghostList.forEach((g) => {
        g.animFrame += dt * 6;
      });
      if (state.readyTimer <= 0) {
        state.phase = "playing";
        hideOverlay();
        syncLoopAudio();
      }
      return;
    }

    if (state.phase === "dying") {
      state.dieTimer -= dt;
      if (state.dieTimer <= 0) {
        state.lives--;
        updateHUD();
        if (state.lives <= 0) {
          state.phase = "gameover";
          showOverlay("GAME OVER", "PRESS SPACE TO PLAY AGAIN", "gameover");
          audio.stopAllLoops();
        } else {
          // Reset positions; enable global dot counter
          state.globalDotCounter = 0;
          pac.reset();
          ghostList.forEach((g) => g.reset(false));
          updateElroy();
          state.fruit = null;
          state.frightTimer = 0;
          state.modeWaveIndex = 0;
          state.modeTimer = modeWaves(state.level)[0].time;
          state.phase = "ready";
          state.readyTimer = 2.0;
          hideOverlay();
        }
      }
      return;
    }

    if (state.phase === "levelclear") {
      state.levelClearTimer -= dt;
      // Flash maze
      if (state.levelClearTimer < 1.8) {
        state.flashMaze = Math.floor(state.levelClearTimer * 6) % 2 === 0;
      }
      if (state.levelClearTimer <= 0) {
        startLevel(true);
      }
      return;
    }

    if (state.phase === "gameover") return;

    // Playing
    const spec = levelSpec(state.level);

    if (pac.hideTimer > 0) pac.hideTimer = Math.max(0, pac.hideTimer - dt);
    for (const g of ghostList) {
      if (g.hideTimer > 0) g.hideTimer = Math.max(0, g.hideTimer - dt);
    }
    if (state.freeze > 0) {
      state.freeze -= dt;
      return;
    }

    updateModes(dt);
    state.houseTimer += dt;

    if (state.fruit) {
      state.fruit.timer -= dt;
      if (state.fruit.timer <= 0) state.fruit = null;
    }

    updatePac(dt, spec);
    ghostList.forEach((g) => updateGhost(g, dt, spec));
    checkCollisions();
    syncLoopAudio();
  }

  function render(dt) {
    drawMaze();
    drawFruit();

    // Bodies first, Pac-Man, then eyes on top (arcade draw order)
    const eyes = ghostList.filter((g) => g.mode === "eaten" || g.enterHouse);
    const bodies = ghostList.filter((g) => g.mode !== "eaten" && !g.enterHouse);
    bodies.forEach(drawGhost);
    if (state.phase !== "levelclear") drawPac();
    eyes.forEach(drawGhost);

    drawPopups(dt || 0);
    drawBanner();
  }

  function frame(ts) {
    if (!state.lastTs) state.lastTs = ts;
    const dt = (ts - state.lastTs) / 1000;
    state.lastTs = ts;
    pollGamepad();
    update(dt);
    render(dt);
    requestAnimationFrame(frame);
  }

  // ═══════════════════════════════════════════════════════════════
  // INPUT
  // ═══════════════════════════════════════════════════════════════

  const KEY_DIR = {
    ArrowUp: UP,
    w: UP,
    W: UP,
    ArrowDown: DOWN,
    s: DOWN,
    S: DOWN,
    ArrowLeft: LEFT,
    a: LEFT,
    A: LEFT,
    ArrowRight: RIGHT,
    d: RIGHT,
    D: RIGHT,
  };

  function holdDir(dir, down) {
    const n = dirHolds.get(dir) || 0;
    const next = Math.max(0, n + (down ? 1 : -1));
    if (next === 0) dirHolds.delete(dir);
    else dirHolds.set(dir, next);
    state.heldDirs = state.heldDirs.filter((d) => d !== dir);
    if (next > 0) state.heldDirs.push(dir);
  }

  function resumeGame() {
    if (state.phase !== "paused") return;
    state.phase = "playing";
    hideOverlay();
    syncLoopAudio();
  }

  function togglePause() {
    if (state.phase === "playing") {
      state.phase = "paused";
      audio.stopAllLoops();
      showOverlay("PAUSED", "PRESS SPACE TO RESUME", "paused");
    } else if (state.phase === "paused") {
      resumeGame();
    }
  }

  function toggleMute() {
    audio.enabled = !audio.enabled;
    if (!audio.enabled) audio.stopAllLoops();
    else if (state.phase === "playing") syncLoopAudio();
    const btn = document.getElementById("btn-mute");
    if (btn) btn.textContent = audio.enabled ? "Mute" : "Sound";
  }

  function onKeyDown(e) {
    const dir = KEY_DIR[e.key];
    if (dir) {
      e.preventDefault();
      if (!e.repeat) holdDir(dir, true);
      pac.nextDir = dir;
    }
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (state.phase === "title" || state.phase === "gameover") startGame();
      else if (state.phase === "paused") resumeGame();
    }
    if (e.key === "p" || e.key === "P" || e.key === "Escape") {
      e.preventDefault();
      togglePause();
    }
    if (e.key === "m" || e.key === "M") toggleMute();
  }

  function onKeyUp(e) {
    const dir = KEY_DIR[e.key];
    if (dir) holdDir(dir, false);
  }

  function pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let dir = null;
    let start = false;
    let pause = false;
    for (let i = 0; i < pads.length; i++) {
      const gp = pads[i];
      if (!gp) continue;
      const ax = gp.axes[0] || 0;
      const ay = gp.axes[1] || 0;
      if (Math.hypot(ax, ay) > 0.45) {
        dir = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? RIGHT : LEFT) : (ay > 0 ? DOWN : UP);
      }
      const b = gp.buttons;
      if (b[12] && b[12].pressed) dir = UP;
      if (b[13] && b[13].pressed) dir = DOWN;
      if (b[14] && b[14].pressed) dir = LEFT;
      if (b[15] && b[15].pressed) dir = RIGHT;
      if ((b[0] && b[0].pressed) || (b[9] && b[9].pressed)) start = true;
      if (b[8] && b[8].pressed) pause = true;
    }
    if (dir) pac.nextDir = dir;
    if (start && !state.padStart) {
      if (state.phase === "title" || state.phase === "gameover") startGame();
      else if (state.phase === "paused") resumeGame();
    }
    if (pause && !state.padPause) togglePause();
    state.padStart = start;
    state.padPause = pause;
  }

  // Drag on the maze steers while the finger stays down.
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.pointerType !== "mouse") e.preventDefault();
    if (state.phase === "title" || state.phase === "gameover") startGame();
    else if (state.phase === "paused") resumeGame();
    if (e.pointerType === "mouse") return;
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) < 14) return;
    pac.nextDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? RIGHT : LEFT) : (dy > 0 ? DOWN : UP);
    drag.x = e.clientX;
    drag.y = e.clientY;
  });
  function endDrag(e) {
    if (drag && e.pointerId === drag.id) drag = null;
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  const DIR_BY_NAME = { up: UP, down: DOWN, left: LEFT, right: RIGHT };
  document.querySelectorAll("#touch-controls [data-dir]").forEach((btn) => {
    const dir = DIR_BY_NAME[btn.dataset.dir];
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      holdDir(dir, true);
      pac.nextDir = dir;
      if (state.phase === "title" || state.phase === "gameover") startGame();
      else if (state.phase === "paused") resumeGame();
    });
    const release = () => holdDir(dir, false);
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
    btn.addEventListener("pointerleave", release);
  });

  document.getElementById("btn-pause")?.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (state.phase === "title" || state.phase === "gameover") startGame();
    else togglePause();
  });
  document.getElementById("btn-mute")?.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    audio.resume();
    toggleMute();
  });

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", () => {
    dirHolds.clear();
    state.heldDirs = [];
    drag = null;
  });
  window.addEventListener("resize", fitCanvas);

  // ═══════════════════════════════════════════════════════════════
  // BOOT
  // ═══════════════════════════════════════════════════════════════

  // Initial positions for title
  pac.reset();
  ghostList.forEach((g) => g.reset(true));
  updateHUD();
  highEl.textContent = formatScore(state.highScore);
  showOverlay("PAC-MAN", "PRESS SPACE OR TAP TO START", "");

  requestAnimationFrame(frame);
})();
