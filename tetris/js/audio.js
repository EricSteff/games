/**
 * Chiptune-style audio for Game Boy Tetris (1989)
 * Music A-Type = Korobeiniki (Hirokazu Tanaka arrangement spirit)
 * Square-wave synthesis via Web Audio API
 */

let ctx = null;
let master = null;
let musicGain = null;
let sfxGain = null;
let musicOn = true;
let musicPlaying = false;
let musicTimer = null;
let noteIndex = 0;
let muted = false;

function ensure() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.4;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.22;
    musicGain.connect(master);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.28;
    sfxGain.connect(master);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function unlock() {
  ensure();
}

const N = {
  rest: 0,
  C3: 130.81,
  D3: 146.83,
  E3: 164.81,
  F3: 174.61,
  G3: 196.0,
  A3: 220.0,
  B3: 246.94,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  Fs4: 369.99,
  G4: 392.0,
  A4: 440.0,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  F5: 698.46,
  G5: 783.99,
  A5: 880.0,
};

/**
 * Korobeiniki — main A-Type melody (simplified single-voice chiptune)
 * [freq, duration in 16th notes at ~140 BPM]
 */
const KOROBEINIKI = [
  [N.E5, 2],
  [N.B4, 1],
  [N.C5, 1],
  [N.D5, 2],
  [N.C5, 1],
  [N.B4, 1],
  [N.A4, 2],
  [N.A4, 1],
  [N.C5, 1],
  [N.E5, 2],
  [N.D5, 1],
  [N.C5, 1],
  [N.B4, 3],
  [N.C5, 1],
  [N.D5, 2],
  [N.E5, 2],
  [N.C5, 2],
  [N.A4, 2],
  [N.A4, 3],
  [N.rest, 1],
  // B section
  [N.D5, 3],
  [N.F5, 1],
  [N.A5, 2],
  [N.G5, 1],
  [N.F5, 1],
  [N.E5, 3],
  [N.C5, 1],
  [N.E5, 2],
  [N.D5, 1],
  [N.C5, 1],
  [N.B4, 2],
  [N.B4, 1],
  [N.C5, 1],
  [N.D5, 2],
  [N.E5, 2],
  [N.C5, 2],
  [N.A4, 2],
  [N.A4, 3],
  [N.rest, 1],
  // Repeat flavor low
  [N.E4, 2],
  [N.B3, 1],
  [N.C4, 1],
  [N.D4, 2],
  [N.C4, 1],
  [N.B3, 1],
  [N.A3, 2],
  [N.A3, 1],
  [N.C4, 1],
  [N.E4, 2],
  [N.D4, 1],
  [N.C4, 1],
  [N.B3, 3],
  [N.C4, 1],
  [N.D4, 2],
  [N.E4, 2],
  [N.C4, 2],
  [N.A3, 2],
  [N.A3, 3],
  [N.rest, 1],
];

// Sixteenth note at ~138 BPM
const SIXTEENTH = (60 / 138 / 4) * 1000;

function tone(freq, durSec, type, dest, vol = 0.15) {
  if (muted || !freq) return;
  const c = ensure();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + durSec);
  osc.connect(g);
  g.connect(dest);
  osc.start();
  osc.stop(c.currentTime + durSec + 0.02);
}

function playNote() {
  if (!musicPlaying || !musicOn || muted) return;
  const [freq, sixteenths] = KOROBEINIKI[noteIndex % KOROBEINIKI.length];
  const ms = sixteenths * SIXTEENTH;
  const dur = (ms / 1000) * 0.92;
  if (freq > 0) {
    tone(freq, dur, "square", musicGain, 0.12);
    // light harmony octave down
    tone(freq / 2, dur, "square", musicGain, 0.04);
  }
  noteIndex++;
  musicTimer = setTimeout(playNote, ms);
}

export function startMusic() {
  if (musicPlaying || !musicOn || muted) return;
  ensure();
  musicPlaying = true;
  noteIndex = 0;
  playNote();
}

export function stopMusic() {
  musicPlaying = false;
  if (musicTimer) {
    clearTimeout(musicTimer);
    musicTimer = null;
  }
}

export function setMusicEnabled(on) {
  musicOn = on;
  if (!on) stopMusic();
  else if (!musicPlaying) startMusic();
}

export function isMusicEnabled() {
  return musicOn;
}

export function toggleMusic() {
  setMusicEnabled(!musicOn);
  return musicOn;
}

export function sfxMove() {
  tone(180, 0.03, "square", sfxGain, 0.06);
}

export function sfxRotate() {
  tone(280, 0.04, "square", sfxGain, 0.07);
}

export function sfxLock() {
  tone(120, 0.05, "triangle", sfxGain, 0.08);
}

export function sfxLine() {
  if (muted) return;
  ensure();
  [330, 392, 523, 659].forEach((f, i) => {
    setTimeout(() => tone(f, 0.08, "square", sfxGain, 0.1), i * 45);
  });
}

export function sfxTetris() {
  if (muted) return;
  ensure();
  [262, 330, 392, 523, 659, 784].forEach((f, i) => {
    setTimeout(() => tone(f, 0.09, "square", sfxGain, 0.11), i * 50);
  });
}

export function sfxGameOver() {
  if (muted) return;
  ensure();
  [392, 349, 330, 294, 262, 196].forEach((f, i) => {
    setTimeout(() => tone(f, 0.14, "square", sfxGain, 0.1), i * 100);
  });
}

export function sfxSelect() {
  tone(440, 0.05, "square", sfxGain, 0.08);
}

export function sfxStart() {
  tone(523, 0.08, "square", sfxGain, 0.1);
  setTimeout(() => tone(659, 0.1, "square", sfxGain, 0.1), 80);
}
