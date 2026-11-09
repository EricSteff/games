/**
 * Plays the MIDI file the engine builds from a Doom MUS song.
 * A small FM synth stands in for a Sound Canvas: the notes and timing
 * are the shareware score, the tone is a browser instrument.
 */
(function () {
  'use strict';

  var RATE = 22050;
  var generation = 0;
  var buffer = null;
  var source = null;
  var gain = null;
  var looping = true;
  var playing = false;
  var paused = false;
  var startOffset = 0;
  var origin = null;
  var master = 64;
  var lastInfo = null;
  var chunkSources = [];
  var live = null;

  function audioContext() {
    var host = window.Module || (window.Module = {});
    if (!host.audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      host.audioCtx = new AC();
    }
    return host.audioCtx;
  }

  function ensureGain() {
    var c = audioContext();
    if (!c) return null;
    if (!gain) {
      gain = c.createGain();
      gain.connect(c.destination);
    }
    gain.gain.value = Math.max(0, Math.min(1, master / 127));
    return c;
  }

  function readVar(bytes, i) {
    var v = 0;
    var n = 0;
    var b;
    do {
      if (i >= bytes.length || n > 4) return null;
      b = bytes[i++];
      v = (v << 7) | (b & 0x7f);
      n++;
    } while (b & 0x80);
    return { v: v, i: i };
  }

  function presetFor(program) {
    if (program >= 32 && program <= 39) {
      return { a: 0.004, d: 0.1, s: 0.8, r: 0.08, ratio: 1, index: 0.18, noise: 0 };
    }
    if (program >= 24 && program <= 31) {
      return { a: 0.003, d: 0.16, s: 0.22, r: 0.1, ratio: 2, index: 2.4, noise: 0.18 };
    }
    if (program >= 16 && program <= 23) {
      return { a: 0.008, d: 0.04, s: 0.92, r: 0.06, ratio: 2, index: 0.3, noise: 0 };
    }
    if (program >= 40 && program <= 55) {
      return { a: 0.05, d: 0.12, s: 0.86, r: 0.16, ratio: 1, index: 0.22, noise: 0 };
    }
    if (program >= 56 && program <= 63) {
      return { a: 0.03, d: 0.08, s: 0.8, r: 0.1, ratio: 1, index: 1.35, noise: 0 };
    }
    if (program >= 80 && program <= 87) {
      return { a: 0.008, d: 0.08, s: 0.7, r: 0.1, ratio: 1, index: 1.15, noise: 0 };
    }
    if (program >= 88 && program <= 95) {
      return { a: 0.12, d: 0.18, s: 0.9, r: 0.22, ratio: 1, index: 0.4, noise: 0 };
    }
    return { a: 0.008, d: 0.1, s: 0.55, r: 0.1, ratio: 1, index: 0.55, noise: 0 };
  }

  function noteFreq(note, bend) {
    return 440 * Math.pow(2, ((note - 69) + bend * 2) / 12);
  }

  function parseMidi(bytes) {
    if (!bytes || bytes.length < 23) return null;
    if (bytes[0] !== 0x4d || bytes[1] !== 0x54 || bytes[2] !== 0x68 || bytes[3] !== 0x64) return null;
    var division = (bytes[12] << 8) | bytes[13];
    if (!division || (division & 0x8000)) division = 70;
    var i = 14;
    if (bytes[i] !== 0x4d || bytes[i + 1] !== 0x54 || bytes[i + 2] !== 0x72 || bytes[i + 3] !== 0x6b) {
      return null;
    }
    i += 8;

    var events = [];
    var tempo = 500000;
    var seconds = 0;
    var status = 0;
    var programs = {};

    while (i < bytes.length) {
      var delta = readVar(bytes, i);
      if (!delta) break;
      i = delta.i;
      seconds += delta.v * (tempo / 1000000) / division;
      if (i >= bytes.length) break;

      var b = bytes[i];
      if (b >= 0x80) {
        status = b;
        i++;
      } else if (!status) {
        break;
      }

      if (status === 0xff) {
        if (i >= bytes.length) break;
        var meta = bytes[i++];
        var len = readVar(bytes, i);
        if (!len) break;
        i = len.i;
        if (meta === 0x51 && len.v === 3 && i + 3 <= bytes.length) {
          tempo = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
        }
        if (meta === 0x2f) break;
        i += len.v;
        status = 0;
        continue;
      }

      if (status === 0xf0 || status === 0xf7) {
        var sl = readVar(bytes, i);
        if (!sl) break;
        i = sl.i + sl.v;
        status = 0;
        continue;
      }

      var type = status & 0xf0;
      var ch = status & 0x0f;
      if (type === 0xc0 || type === 0xd0) {
        if (i >= bytes.length) break;
        var prog = bytes[i++];
        events.push({ t: seconds, type: type, ch: ch, a: prog, b: 0 });
        if (type === 0xc0) programs[prog] = true;
      } else {
        if (i + 1 >= bytes.length) break;
        events.push({ t: seconds, type: type, ch: ch, a: bytes[i++], b: bytes[i++] });
      }
    }

    return {
      events: events,
      duration: Math.max(0.5, Math.min(seconds, 8 * 60)),
      programs: Object.keys(programs)
    };
  }

  function drumVoice(note) {
    if (note === 35 || note === 36) return { freq: 72, noise: false, k: 16, amp: 1 };
    if (note === 38 || note === 40) return { freq: 190, noise: true, k: 24, amp: 0.75 };
    if (note === 42 || note === 44) return { freq: 0, noise: true, k: 60, amp: 0.32 };
    if (note === 46) return { freq: 0, noise: true, k: 18, amp: 0.34 };
    if (note >= 41 && note <= 50) return { freq: noteFreq(note, 0) * 0.5, noise: false, k: 12, amp: 0.7 };
    return { freq: 220, noise: true, k: 12, amp: 0.4 };
  }

  function renderSong(parsed, gen, done) {
    var events = parsed.events;
    var duration = parsed.duration;
    var total = Math.max(1, Math.floor(duration * RATE));
    var out = new Float32Array(total);
    var voices = [];
    var channels = [];
    var c;
    for (c = 0; c < 16; c++) {
      channels.push({ program: 0, vol: 100, expr: 127, bend: 0, sustain: false });
    }
    var ei = 0;
    var pos = 0;
    var headFaded = false;
    var CHUNK = 11025;
    var SLICE = RATE;
    var TWO_PI = Math.PI * 2;
    live = { out: out, emitted: 0, cursor: 0, total: total };

    function levelOf(v, now) {
      var e = v.preset;
      var t;
      if (v.stage === 'a') {
        t = now - v.t0;
        if (e.a <= 0 || t >= e.a) {
          v.stage = 'd';
          v.t0 = now;
          v.level = 1;
          return 1;
        }
        v.level = t / e.a;
        return v.level;
      }
      if (v.stage === 'd') {
        t = now - v.t0;
        if (e.d <= 0 || t >= e.d) {
          v.stage = 's';
          v.level = e.s;
          return e.s;
        }
        v.level = 1 + (e.s - 1) * (t / e.d);
        return v.level;
      }
      if (v.stage === 's') {
        v.level = e.s;
        return e.s;
      }
      t = now - v.releaseAt;
      if (e.r <= 0 || t >= e.r) {
        v.dead = true;
        v.level = 0;
        return 0;
      }
      v.level = v.releaseLevel * (1 - t / e.r);
      return v.level;
    }

    function releaseVoice(v, now) {
      if (v.drum || v.stage === 'r') return;
      v.releaseLevel = v.level > 0 ? v.level : v.preset.s;
      v.stage = 'r';
      v.releaseAt = now;
    }

    function noteOff(ch, note, now, sustained) {
      var i;
      for (i = 0; i < voices.length; i++) {
        var v = voices[i];
        if (v.ch !== ch || v.note !== note || v.stage === 'r') continue;
        if (sustained) v.holding = true;
        else releaseVoice(v, now);
      }
    }

    function releaseHeld(ch, now) {
      var i;
      for (i = 0; i < voices.length; i++) {
        if (voices[i].ch === ch && voices[i].holding) {
          voices[i].holding = false;
          releaseVoice(voices[i], now);
        }
      }
    }

    function noteOn(ev, now, st) {
      var i;
      for (i = voices.length - 1; i >= 0; i--) {
        if (voices[i].ch === ev.ch && voices[i].note === ev.a) voices.splice(i, 1);
      }
      if (voices.length > 22) voices.shift();
      var amp = (ev.b / 127) * (st.vol / 127) * (st.expr / 127) * 0.34;
      if (ev.ch === 9) {
        var d = drumVoice(ev.a);
        voices.push({
          ch: ev.ch, note: ev.a, drum: true, noise: d.noise, freq: d.freq,
          k: d.k, amp: amp * d.amp * 2.2, phase: 0, born: now, seed: (ev.a * 997) >>> 0,
          preset: { a: 0, d: 0, s: 1, r: 0.05 }, stage: 's', t0: now, level: 1,
          holding: false, dead: false
        });
        return;
      }
      var preset = presetFor(st.program);
      voices.push({
        ch: ev.ch, note: ev.a, drum: false, preset: preset,
        freq: noteFreq(ev.a, st.bend), amp: amp, phase: 0, modPhase: 0,
        born: now, seed: 1, stage: 'a', t0: now, level: 0, bend: st.bend,
        holding: false, dead: false, releaseLevel: preset.s, releaseAt: 0
      });
    }

    function apply(ev, now) {
      var st = channels[ev.ch];
      if (ev.type === 0xc0) {
        st.program = ev.a;
        return;
      }
      if (ev.type === 0xe0) {
        st.bend = (((ev.b << 7) | ev.a) - 8192) / 8192;
        var vi;
        for (vi = 0; vi < voices.length; vi++) {
          if (!voices[vi].drum && voices[vi].ch === ev.ch) {
            voices[vi].freq = noteFreq(voices[vi].note, st.bend);
          }
        }
        return;
      }
      if (ev.type === 0xb0) {
        if (ev.a === 7) st.vol = ev.b;
        else if (ev.a === 11) st.expr = ev.b;
        else if (ev.a === 64) {
          st.sustain = ev.b >= 64;
          if (!st.sustain) releaseHeld(ev.ch, now);
        } else if (ev.a === 120 || ev.a === 123) {
          st.sustain = false;
          var k;
          for (k = 0; k < voices.length; k++) {
            if (voices[k].ch === ev.ch) releaseVoice(voices[k], now);
          }
        }
        return;
      }
      if (ev.type === 0x90 && ev.b > 0) noteOn(ev, now, st);
      else if (ev.type === 0x80 || (ev.type === 0x90 && ev.b === 0)) noteOff(ev.ch, ev.a, now, st.sustain);
    }

    function step() {
      if (gen !== generation) return;
      var end = Math.min(total, pos + CHUNK);
      var s;
      for (s = pos; s < end; s++) {
        var time = s / RATE;
        while (ei < events.length && events[ei].t <= time) {
          apply(events[ei], time);
          ei++;
        }
        var mix = 0;
        var vi;
        for (vi = voices.length - 1; vi >= 0; vi--) {
          var v = voices[vi];
          if (v.drum) {
            var age = time - v.born;
            if (age > 1.4) {
              voices.splice(vi, 1);
              continue;
            }
            var damp = Math.exp(-v.k * age);
            if (v.noise) {
              v.seed = (Math.imul(v.seed, 1664525) + 1013904223) >>> 0;
              mix += ((v.seed & 65535) / 32768 - 1) * damp * v.amp;
            }
            if (v.freq > 0) {
              v.phase += v.freq / RATE;
              mix += Math.sin(v.phase * TWO_PI) * damp * v.amp;
            }
            continue;
          }
          var g = levelOf(v, time);
          if (v.dead) {
            voices.splice(vi, 1);
            continue;
          }
          var inc = v.freq / RATE;
          v.modPhase += inc * v.preset.ratio;
          v.phase += inc;
          var mod = Math.sin(v.modPhase * TWO_PI) * v.preset.index * Math.max(g, 0.15);
          var sample = Math.sin(v.phase * TWO_PI + mod);
          if (v.preset.noise > 0 && time - v.born < 0.02) {
            v.seed = (Math.imul(v.seed, 1664525) + 1013904223) >>> 0;
            sample += ((v.seed & 65535) / 32768 - 1) * v.preset.noise;
          }
          mix += sample * g * v.amp;
        }
        out[s] = mix / (1 + Math.abs(mix));
      }
      pos = end;
      live.emitted = pos;
      if (!headFaded && pos > 0) {
        var fadeIn = Math.min((RATE * 0.012) | 0, (total / 2) | 0);
        var hf;
        for (hf = 0; hf < fadeIn && hf < pos; hf++) out[hf] *= hf / fadeIn;
        headFaded = true;
      }
      while (!paused && live.cursor < pos && (pos - live.cursor >= SLICE || pos >= total)) {
        var sliceEnd = pos >= total ? total : live.cursor + SLICE;
        if (sliceEnd > pos) sliceEnd = pos;
        if (sliceEnd >= total) {
          var fadeOut = Math.min((RATE * 0.012) | 0, (total / 2) | 0);
          var tf;
          for (tf = 0; tf < fadeOut; tf++) out[total - 1 - tf] *= tf / fadeOut;
        }
        done(out.subarray(live.cursor, sliceEnd), live.cursor / RATE, sliceEnd >= total, out, duration);
        live.cursor = sliceEnd;
        if (live.cursor >= total) break;
      }
      if (pos < total && gen === generation) setTimeout(step, 0);
    }

    step();
  }

  function stopSource() {
    var i;
    for (i = 0; i < chunkSources.length; i++) {
      try { chunkSources[i].stop(); } catch (e) {}
      try { chunkSources[i].disconnect(); } catch (e) {}
    }
    chunkSources.length = 0;
    source = null;
  }

  function rememberSource(src) {
    chunkSources.push(src);
    source = src;
  }

  function scheduleSlice(samples, songTime) {
    var c = ensureGain();
    if (!c || paused || !samples.length) return;
    if (origin == null) origin = c.currentTime + 0.05;
    var audioBuf = c.createBuffer(1, samples.length, RATE);
    audioBuf.getChannelData(0).set(samples);
    var src = c.createBufferSource();
    src.buffer = audioBuf;
    src.connect(gain);
    var when = origin + songTime;
    if (when < c.currentTime) when = c.currentTime;
    try { src.start(when); } catch (e) { return; }
    rememberSource(src);
  }

  function scheduleLoop(full, duration) {
    var c = ensureGain();
    if (!c || paused) return;
    var audioBuf = c.createBuffer(1, full.length, RATE);
    audioBuf.getChannelData(0).set(full);
    buffer = audioBuf;
    if (!looping) return;
    if (origin == null) origin = c.currentTime + 0.05;
    var src = c.createBufferSource();
    src.buffer = audioBuf;
    src.loop = true;
    src.connect(gain);
    var when = origin + duration;
    try {
      if (when <= c.currentTime + 0.02) src.start(c.currentTime + 0.02, (c.currentTime - origin) % duration);
      else src.start(when);
    } catch (e) { return; }
    rememberSource(src);
  }

  function startSource() {
    var c = ensureGain();
    if (!c || !buffer || paused) return;
    stopSource();
    source = c.createBufferSource();
    source.buffer = buffer;
    source.loop = looping;
    source.connect(gain);
    var off = startOffset;
    if (buffer.duration > 0) off = ((off % buffer.duration) + buffer.duration) % buffer.duration;
    origin = c.currentTime - off;
    try { source.start(0, off); } catch (e) { source = null; return; }
    rememberSource(source);
  }

  function positionNow() {
    var c = audioContext();
    if (paused || !c || origin == null) return startOffset;
    var pos = c.currentTime - origin;
    if (pos < 0) return 0;
    var dur = buffer ? buffer.duration : (lastInfo ? lastInfo.duration : 0);
    if (looping && dur > 0 && pos > dur) pos = pos % dur;
    return pos;
  }

  window.DoomMusic = {
    play: function (bytes, loop, volume) {
      generation++;
      var gen = generation;
      stopSource();
      buffer = null;
      origin = null;
      live = null;
      playing = true;
      paused = false;
      startOffset = 0;
      looping = !!loop;
      if (typeof volume === 'number') master = volume;
      ensureGain();
      var parsed = parseMidi(bytes);
      lastInfo = parsed;
      if (!parsed || !parsed.events.length) {
        console.warn('[doom] music: empty MIDI');
        playing = false;
        return;
      }
      console.log('[doom] music ' + parsed.events.length + ' events, ' +
        parsed.duration.toFixed(1) + 's, programs ' + parsed.programs.join(','));
      renderSong(parsed, gen, function (samples, songTime, isLast, full) {
        if (gen !== generation || !playing) return;
        scheduleSlice(samples, songTime);
        if (isLast) scheduleLoop(full, parsed.duration);
      });
    },
    stop: function () {
      generation++;
      playing = false;
      paused = false;
      stopSource();
      buffer = null;
      live = null;
      origin = null;
    },
    pause: function () {
      if (!playing || paused) return;
      startOffset = positionNow();
      paused = true;
      stopSource();
    },
    resume: function () {
      if (!playing || !paused) return;
      paused = false;
      if (buffer) {
        startSource();
        return;
      }
      var c = ensureGain();
      if (!c || !live) return;
      origin = c.currentTime - startOffset + 0.03;
      var from = Math.max(0, Math.min(live.emitted, Math.floor(startOffset * RATE)));
      if (from < live.emitted) scheduleSlice(live.out.subarray(from, live.emitted), from / RATE);
      live.cursor = live.emitted;
    },
    setVolume: function (volume) {
      master = volume;
      if (gain) gain.gain.value = Math.max(0, Math.min(1, volume / 127));
    },
    isPlaying: function () {
      return playing;
    },
    info: function () {
      return {
        playing: playing,
        paused: paused,
        audible: !!source,
        events: lastInfo ? lastInfo.events.length : 0,
        duration: lastInfo ? lastInfo.duration : 0,
        programs: lastInfo ? lastInfo.programs : []
      };
    }
  };
})();
