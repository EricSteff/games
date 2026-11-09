/* Korobeiniki — the public-domain folk song behind the Tetris theme —
   in an original arrangement: lead, harmony, bass, pad, and a light rhythm.
   Sound effects stay short so the melody stays in front. */
(function (global) {
  "use strict";

  const MUTE_KEY = "timingslip.nestetris.mute";
  const BPM = 138;
  const STEP = 60 / BPM / 4;

  const A_MELODY = [
    [76, 2], [71, 1], [72, 1], [74, 2], [72, 1], [71, 1],
    [69, 2], [69, 1], [72, 1], [76, 2], [74, 1], [72, 1],
    [71, 3], [72, 1], [74, 2], [76, 2],
    [72, 2], [69, 2], [69, 3], [0, 1]
  ];
  const B_MELODY = [
    [74, 3], [77, 1], [81, 2], [79, 1], [77, 1],
    [76, 3], [72, 1], [76, 2], [74, 1], [72, 1],
    [71, 2], [71, 1], [72, 1], [74, 2], [76, 2],
    [72, 2], [69, 2], [69, 3], [0, 1]
  ];

  /* A natural minor: a third below each scale tone. */
  const THIRD_DOWN = { 9: -4, 11: -4, 0: -3, 2: -3, 4: -4, 5: -3, 7: -3 };

  const CHORDS = {
    Am: [57, 60, 64],
    F: [53, 57, 60],
    C: [60, 64, 67],
    Dm: [53, 57, 62],
    G: [55, 59, 62]
  };

  /* One pass of the theme: two A phrases, two B phrases. 128 sixteenths. */
  const HARMONY = [
    ["Am", 16, 45],
    ["F", 8, 41],
    ["C", 8, 36],
    ["Am", 16, 45],
    ["Dm", 8, 38],
    ["Am", 8, 45],
    ["Dm", 16, 38],
    ["Am", 16, 45],
    ["C", 8, 36],
    ["G", 8, 43],
    ["F", 8, 41],
    ["Am", 8, 45]
  ];

  function span(notes) {
    let n = 0;
    for (let i = 0; i < notes.length; i++) n += notes[i][1];
    return n;
  }

  if (span(A_MELODY) !== 32 || span(B_MELODY) !== 32) {
    throw new Error("Tetris theme phrase length");
  }

  let ctx = null;
  let master = null;
  let musicBus = null;
  let delaySend = null;
  let noiseBuf = null;
  let muted = false;
  let playing = false;
  let timer = null;
  let step = 0;
  let nextTime = 0;

  try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch (err) { muted = false; }

  function freq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function ensure() {
    if (!ctx) {
      const AudioCtx = global.AudioContext || global.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.42;
      master.connect(ctx.destination);

      musicBus = ctx.createGain();
      musicBus.gain.value = 0.72;
      musicBus.connect(master);

      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.2;
      const damp = ctx.createBiquadFilter();
      damp.type = "lowpass";
      damp.frequency.value = 2400;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.28;
      delay.connect(damp);
      damp.connect(feedback);
      feedback.connect(delay);
      damp.connect(musicBus);
      delaySend = delay;

      const seconds = 1;
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function envelope(when, dur, peak) {
    const gain = ctx.createGain();
    const attack = Math.min(0.018, Math.max(0.006, dur * 0.18));
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), when + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(dur, attack + 0.02));
    return gain;
  }

  function lead(midi, when, dur, peak) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.6;
    filter.frequency.setValueAtTime(700, when);
    filter.frequency.exponentialRampToValueAtTime(2400, when + Math.min(0.09, dur * 0.45));

    const body = ctx.createOscillator();
    body.type = "triangle";
    body.frequency.setValueAtTime(freq(midi), when);
    const air = ctx.createOscillator();
    air.type = "sawtooth";
    air.frequency.setValueAtTime(freq(midi), when);
    air.detune.setValueAtTime(8, when);
    const airGain = ctx.createGain();
    airGain.gain.value = 0.22;

    if (dur > 0.22) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 4.6;
      depth.gain.value = 7;
      lfo.connect(depth);
      depth.connect(body.detune);
      lfo.start(when);
      lfo.stop(when + dur + 0.05);
    }

    const amp = envelope(when, dur, peak);
    body.connect(filter);
    air.connect(airGain);
    airGain.connect(filter);
    filter.connect(amp);
    amp.connect(musicBus);
    const send = ctx.createGain();
    send.gain.value = 0.34;
    amp.connect(send);
    send.connect(delaySend);
    body.start(when);
    air.start(when);
    body.stop(when + dur + 0.03);
    air.stop(when + dur + 0.03);
  }

  function tone(midi, when, dur, type, peak, dest) {
    if (!midi) return;
    const osc = ctx.createOscillator();
    const amp = envelope(when, dur, peak);
    osc.type = type;
    osc.frequency.setValueAtTime(freq(midi), when);
    osc.connect(amp);
    amp.connect(dest || musicBus);
    osc.start(when);
    osc.stop(when + dur + 0.03);
  }

  function hat(when, loud) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = loud ? 5000 : 7000;
    const amp = envelope(when, loud ? 0.045 : 0.025, loud ? 0.045 : 0.02);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(musicBus);
    src.start(when);
    src.stop(when + 0.06);
  }

  function clap(when) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1700;
    filter.Q.value = 0.7;
    const amp = envelope(when, 0.09, 0.04);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(musicBus);
    src.start(when);
    src.stop(when + 0.1);
  }

  function kick(when) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(148, when);
    osc.frequency.exponentialRampToValueAtTime(48, when + 0.09);
    amp.gain.setValueAtTime(0.2, when);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
    osc.connect(amp);
    amp.connect(musicBus);
    osc.start(when);
    osc.stop(when + 0.18);
  }

  function playMelody(notes, origin, rich, place) {
    let at = origin;
    for (let i = 0; i < notes.length; i++) {
      const midi = notes[i][0];
      const len = notes[i][1];
      if (midi && place === at) {
        const dur = len * STEP * 0.94;
        lead(midi, nextTime, dur, rich ? 0.16 : 0.14);
        const harm = THIRD_DOWN[midi % 12];
        if (rich && harm != null && len >= 2) {
          tone(midi + harm, nextTime, dur * 0.9, "triangle", 0.045, musicBus);
        }
      }
      at += len;
    }
  }

  function playHarmony(origin, rich, place) {
    let at = origin;
    for (let i = 0; i < HARMONY.length; i++) {
      const name = HARMONY[i][0];
      const len = HARMONY[i][1];
      const root = HARMONY[i][2];
      if (place === at) {
        const dur = len * STEP * 0.96;
        const chord = CHORDS[name];
        for (let n = 0; n < chord.length; n++) {
          tone(chord[n], nextTime, dur, "sine", rich ? 0.028 : 0.016, musicBus);
        }
      }
      for (let local = 0; local < len; local += 2) {
        if (place !== at + local) continue;
        const pulse = local % 8;
        const midi = pulse === 4 ? root + 7 : (pulse === 2 || pulse === 6 ? root + 12 : root);
        tone(midi, nextTime, STEP * 1.6, "triangle", rich ? 0.11 : 0.085, musicBus);
      }
      at += len;
    }
  }

  function schedule() {
    if (!ctx || !playing) return;
    if (nextTime < ctx.currentTime - 0.08) nextTime = ctx.currentTime + 0.02;
    while (nextTime < ctx.currentTime + 0.28) {
      const place = step % 256;
      const pass = Math.floor(place / 128);
      const origin = pass * 128;
      const rich = pass === 1;
      const inside = place - origin;
      if (inside < 64) playMelody(A_MELODY, origin + (inside >= 32 ? 32 : 0), rich, place);
      else playMelody(B_MELODY, origin + (inside >= 96 ? 96 : 64), rich, place);
      playHarmony(origin, rich, place);
      if (place % 8 === 0) kick(nextTime);
      if (place % 2 === 0) hat(nextTime, place % 4 === 0);
      if (rich && place % 8 === 4) clap(nextTime);
      step += 1;
      nextTime += STEP;
    }
  }

  function startMusic(fromTop) {
    if (!ensure()) return;
    if (fromTop) step = 0;
    playing = true;
    nextTime = ctx.currentTime + 0.06;
    if (timer) clearInterval(timer);
    timer = setInterval(schedule, 40);
    schedule();
  }

  function stopMusic() {
    playing = false;
    if (timer) clearInterval(timer);
    timer = null;
  }

  function setMuted(next) {
    muted = !!next;
    try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch (err) { /* private mode */ }
    if (master && ctx) master.gain.setValueAtTime(muted ? 0 : 0.42, ctx.currentTime);
    return muted;
  }

  function isMuted() {
    return muted;
  }

  function blip(midi, when, dur, type, peak, slide) {
    if (!ctx || muted || !midi) return;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq(midi), when);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq(midi + slide)), when + dur);
    amp.gain.setValueAtTime(peak, when);
    amp.gain.exponentialRampToValueAtTime(0.0008, when + dur);
    osc.connect(amp);
    amp.connect(master);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  function play(event) {
    if (!ensure() || muted) return;
    const now = ctx.currentTime;
    if (event === "rotate") blip(79, now, 0.06, "square", 0.05, 3);
    else if (event === "deny") blip(54, now, 0.05, "square", 0.03, -2);
    else if (event === "hold") {
      blip(67, now, 0.07, "square", 0.05, 0);
      blip(74, now + 0.06, 0.08, "square", 0.05, 0);
    } else if (event === "hard") blip(48, now, 0.09, "square", 0.07, -8);
    else if (event === "lock") blip(52, now, 0.05, "triangle", 0.05, -4);
    else if (event === "clear1") blip(72, now, 0.12, "triangle", 0.07, 2);
    else if (event === "clear2") {
      blip(74, now, 0.1, "triangle", 0.07, 0);
      blip(79, now + 0.08, 0.12, "triangle", 0.07, 0);
    } else if (event === "clear3") {
      blip(76, now, 0.09, "triangle", 0.07, 0);
      blip(81, now + 0.07, 0.1, "triangle", 0.07, 0);
      blip(84, now + 0.14, 0.14, "triangle", 0.07, 0);
    } else if (event === "tetris") {
      blip(72, now, 0.1, "square", 0.06, 0);
      blip(76, now + 0.09, 0.1, "square", 0.06, 0);
      blip(79, now + 0.18, 0.1, "square", 0.06, 0);
      blip(84, now + 0.27, 0.22, "square", 0.07, 0);
    } else if (event === "tspin") {
      blip(68, now, 0.08, "square", 0.06, 0);
      blip(80, now + 0.08, 0.16, "triangle", 0.07, 0);
    } else if (event === "level") {
      blip(76, now, 0.08, "triangle", 0.06, 0);
      blip(84, now + 0.08, 0.16, "triangle", 0.07, 0);
    } else if (event === "perfect") {
      blip(72, now, 0.1, "triangle", 0.07, 0);
      blip(79, now + 0.1, 0.1, "triangle", 0.07, 0);
      blip(84, now + 0.2, 0.1, "triangle", 0.07, 0);
      blip(91, now + 0.3, 0.24, "triangle", 0.08, 0);
    } else if (event === "over") {
      blip(64, now, 0.16, "triangle", 0.07, -5);
      blip(59, now + 0.14, 0.16, "triangle", 0.07, -5);
      blip(52, now + 0.28, 0.28, "triangle", 0.08, -4);
    }
  }

  function playAll(events) {
    for (let i = 0; i < events.length; i++) play(events[i]);
  }

  global.ModernTetrisAudio = {
    unlock: ensure,
    startMusic: startMusic,
    stopMusic: stopMusic,
    setMuted: setMuted,
    isMuted: isMuted,
    playAll: playAll
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
