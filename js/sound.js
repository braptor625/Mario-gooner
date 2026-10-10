// js/sound.js — G.Sound: fully procedural Web Audio (no audio files).
(function () {
  'use strict';
  const G = (window.G = window.G || {});
  const S = {};
  G.Sound = S;

  const MUTE_KEY = 'turbo-tandem-muted';
  const MAX_VOICES = 24;
  const MIN_GAP_MS = 40;
  const LOOKAHEAD = 0.1;
  const TICK_MS = 25;
  const MASTER_VOL = 0.9;

  let ctx = null;
  let ready = false;
  let failed = false;
  let master = null, sfxBus = null, musicBus = null, engineBus = null, comp = null;
  let noiseBuf = null;
  let voices = 0;
  const lastPlayed = {};
  let cur = null;          // current music track state
  let schedTimer = 0;
  let musicBoost = false;
  let eng = null;          // engine voice nodes

  function readMuted() {
    try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { return false; }
  }
  function saveMuted(b) {
    try { localStorage.setItem(MUTE_KEY, b ? '1' : '0'); } catch (e) { /* ignore */ }
  }
  let muted = readMuted();
  Object.defineProperty(S, 'muted', { get: () => muted, enumerable: true });

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const clampF = (f) => clamp(f, 20, 20000);

  function resumeCtx() {
    if (!ctx || ctx.state !== 'suspended') return;
    try {
      const p = ctx.resume();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* ignore */ }
  }

  function bus(vol) {
    const g = ctx.createGain();
    g.gain.value = vol;
    g.connect(master);
    return g;
  }

  function onKey(e) {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'KeyM' || e.key === 'm' || e.key === 'M') S.setMuted(!muted);
  }

  S.init = function () {
    if (failed) return;
    if (ready) { resumeCtx(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { failed = true; return; }
      ctx = new AC();
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER_VOL;
      master.connect(comp);
      comp.connect(ctx.destination);
      sfxBus = bus(0.6);
      musicBus = bus(0.35);
      engineBus = bus(0.25);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      ready = true;
    } catch (e) {
      failed = true;
      ctx = null;
      return;
    }
    document.addEventListener('keydown', onKey);
    ['pointerdown', 'keydown', 'touchend'].forEach((ev) => window.addEventListener(ev, resumeCtx, true));
    resumeCtx();
  };

  S.setMuted = function (b) {
    muted = !!b;
    saveMuted(muted);
    if (ready) master.gain.setTargetAtTime(muted ? 0 : MASTER_VOL, ctx.currentTime, 0.02);
  };

  S.setMusicTempoBoost = function (b) { musicBoost = !!b; };

  // ---------- voice helpers (SFX) ----------
  // A voice record counts live nodes; when the last one ends the voice slot is freed.
  function reg(v, node) {
    if (!v) return;
    v.n++;
    node.onended = () => { if (--v.n === 0) voices--; };
  }

  // c = { v, t, vol, p, bus }
  function tone(c, type, f, t, dur, vol, f2) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(clampF(f * c.p), t);
    if (f2) o.frequency.exponentialRampToValueAtTime(clampF(f2 * c.p), t + dur);
    const a = Math.max(0.0002, vol * c.vol);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(a, t + Math.min(0.01, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(c.bus);
    reg(c.v, o);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  // type: 'lowpass'|'highpass'|'bandpass'; f -> f2 is an optional sweep
  function noise(c, t, dur, vol, type, f, f2, q) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = type || 'lowpass';
    flt.Q.value = q || 0.7;
    flt.frequency.setValueAtTime(clampF(f * c.p), t);
    if (f2) flt.frequency.exponentialRampToValueAtTime(clampF(f2 * c.p), t + dur);
    const g = ctx.createGain();
    const a = Math.max(0.0002, vol * c.vol);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(a, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt);
    flt.connect(g);
    g.connect(c.bus);
    reg(c.v, src);
    src.start(t, Math.random() * 0.8);
    src.stop(t + dur + 0.03);
  }

  // helper: sequence of tones
  function seq(c, type, freqs, gap, dur, vol) {
    for (let i = 0; i < freqs.length; i++) tone(c, type, freqs[i], c.t + i * gap, dur, vol);
  }
  // helper: fast glassy arpeggio with random-ish sparkle
  function arp(c, type, freqs, gap, dur, vol) {
    for (let i = 0; i < freqs.length; i++) {
      tone(c, type, freqs[i], c.t + i * gap, dur, vol);
      tone(c, 'sine', freqs[i] * 2, c.t + i * gap, dur * 0.6, vol * 0.25);
    }
  }

  const SFX = {
    menu_move(c) { tone(c, 'square', 880, c.t, 0.05, 0.12); },
    menu_select(c) {
      tone(c, 'square', 660, c.t, 0.07, 0.14);
      tone(c, 'square', 990, c.t + 0.07, 0.1, 0.14);
    },
    menu_back(c) { tone(c, 'triangle', 440, c.t, 0.14, 0.2, 220); },
    countdown(c) { tone(c, 'square', 440, c.t, 0.18, 0.22); },
    go(c) {
      tone(c, 'square', 880, c.t, 0.5, 0.22);
      tone(c, 'triangle', 1320, c.t, 0.5, 0.15);
      noise(c, c.t, 0.12, 0.25, 'highpass', 3000);
    },
    item_box(c) { arp(c, 'triangle', [1047, 1319, 1568, 2093, 2637], 0.035, 0.12, 0.2); },
    roulette(c) {
      for (let i = 0; i < 8; i++) {
        tone(c, 'square', 1400 + Math.random() * 700, c.t + i * 0.035, 0.02, 0.1);
      }
    },
    item_get(c) { seq(c, 'triangle', [660, 880, 1100], 0.07, 0.12, 0.22); },
    throw(c) {
      noise(c, c.t, 0.25, 0.3, 'bandpass', 900, 300, 1.5);
      tone(c, 'triangle', 600, c.t, 0.2, 0.15, 200);
    },
    drop(c) {
      tone(c, 'triangle', 500, c.t, 0.15, 0.2, 150);
      noise(c, c.t, 0.1, 0.25, 'lowpass', 400);
    },
    shell_hit(c) {
      tone(c, 'square', 300, c.t, 0.35, 0.2, 80);
      noise(c, c.t, 0.3, 0.5, 'lowpass', 2000, 200);
    },
    banana_hit(c) {
      tone(c, 'sawtooth', 500, c.t, 0.3, 0.12, 120);
      tone(c, 'square', 700, c.t, 0.12, 0.1, 300);
    },
    spin(c) {
      tone(c, 'triangle', 900, c.t, 0.55, 0.22, 250);
      tone(c, 'triangle', 918, c.t, 0.55, 0.08, 255);
    },
    explosion(c) {
      noise(c, c.t, 0.8, 0.9, 'lowpass', 1800, 60, 0.8);
      tone(c, 'sine', 110, c.t, 0.6, 0.6, 35);
    },
    boost(c) {
      noise(c, c.t, 0.9, 0.35, 'bandpass', 300, 3000, 2);
      tone(c, 'sawtooth', 150, c.t, 0.9, 0.07, 600);
    },
    mini_turbo1(c) {
      tone(c, 'square', 300, c.t, 0.18, 0.14, 1200);
      tone(c, 'sine', 600, c.t, 0.15, 0.1, 2400);
    },
    mini_turbo2(c) {
      tone(c, 'square', 300, c.t, 0.3, 0.18, 1600);
      tone(c, 'square', 450, c.t + 0.05, 0.28, 0.12, 2000);
      noise(c, c.t, 0.3, 0.15, 'highpass', 2000, 8000);
    },
    drift_start(c) { noise(c, c.t, 0.3, 0.25, 'bandpass', 2500, 1800, 4); },
    hop(c) { tone(c, 'triangle', 200, c.t, 0.15, 0.3, 500); },
    swap(c) {
      tone(c, 'triangle', 700, c.t, 0.1, 0.2, 450);
      tone(c, 'triangle', 450, c.t + 0.09, 0.1, 0.2, 700);
    },
    bump(c) {
      noise(c, c.t, 0.15, 0.4, 'lowpass', 400);
      tone(c, 'sine', 120, c.t, 0.15, 0.3, 60);
    },
    wall(c) {
      noise(c, c.t, 0.12, 0.45, 'lowpass', 250);
      tone(c, 'square', 180, c.t, 0.1, 0.15, 90);
    },
    lap(c) { seq(c, 'square', [523, 659, 784, 1046], 0.08, 0.12, 0.16); },
    final_lap(c) {
      seq(c, 'square', [523, 659, 784, 1046, 1318], 0.1, 0.16, 0.18);
      tone(c, 'triangle', 1318, c.t + 0.5, 0.5, 0.2);
    },
    finish(c) {
      seq(c, 'square', [392, 523, 659, 784], 0.13, 0.14, 0.16);
      tone(c, 'square', 659, c.t + 0.55, 0.15, 0.16);
      tone(c, 'square', 784, c.t + 0.7, 0.15, 0.16);
      for (const f of [523, 659, 784, 1046]) tone(c, 'square', f, c.t + 0.9, 1.0, 0.1);
    },
    star(c) { arp(c, 'triangle', [1319, 1568, 2093, 2637, 2093, 2637, 3136], 0.045, 0.14, 0.14); },
    lightning(c) {
      noise(c, c.t, 0.4, 0.5, 'highpass', 2000, 6000);
      tone(c, 'square', 1200, c.t, 0.4, 0.2, 100);
      noise(c, c.t, 0.05, 0.6, 'highpass', 5000);
    },
    fall(c) {
      tone(c, 'triangle', 600, c.t, 0.7, 0.3, 80);
      noise(c, c.t + 0.6, 0.2, 0.4, 'lowpass', 300);
    },
    heart(c) { seq(c, 'sine', [880, 1175, 1568], 0.09, 0.2, 0.3); },
    fireball(c) {
      noise(c, c.t, 0.45, 0.3, 'bandpass', 400, 1500, 1.2);
      tone(c, 'sawtooth', 200, c.t, 0.45, 0.06, 120);
    },
    egg(c) {
      tone(c, 'triangle', 300, c.t, 0.12, 0.25, 900);
      tone(c, 'triangle', 900, c.t + 0.12, 0.14, 0.2, 400);
    },
    coin_bonus(c) {
      tone(c, 'square', 988, c.t, 0.1, 0.15);
      tone(c, 'square', 1319, c.t + 0.06, 0.16, 0.15);
    },
  };

  S.play = function (name, opts) {
    if (!ready || muted || ctx.state !== 'running') return;
    const build = SFX[name];
    if (!build) return;
    const now = performance.now();
    const last = lastPlayed[name];
    if (last !== undefined && now - last < MIN_GAP_MS) return;
    if (voices >= MAX_VOICES) return;
    lastPlayed[name] = now;

    const v = { n: 1 }; // sentinel held during build
    voices++;
    const c = {
      v,
      t: ctx.currentTime + 0.005,
      vol: opts && opts.volume != null ? opts.volume : 1,
      p: opts && opts.pitch ? opts.pitch : 1,
      bus: sfxBus,
    };
    try {
      build(c);
    } catch (e) {
      // never let a sound break the game
    } finally {
      if (--v.n === 0) voices--;
    }
  };

  // ---------- engine ----------
  function ensureEngine() {
    const t = ctx.currentTime;
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = 55;
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.value = 55;
    o2.detune.value = 9;
    const sq = ctx.createGain();
    sq.gain.value = 0.35;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 3;
    lp.frequency.value = 400;
    const g = ctx.createGain();
    g.gain.value = 0;
    o1.connect(lp);
    o2.connect(sq);
    sq.connect(lp);
    lp.connect(g);
    g.connect(engineBus);

    // wobble LFO (Hz depth added to both oscillators)
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 5.5;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 2.5;
    lfo.connect(lfoG);
    lfoG.connect(o1.frequency);
    lfoG.connect(o2.frequency);

    // off-road rumble
    const rs = ctx.createBufferSource();
    rs.buffer = noiseBuf;
    rs.loop = true;
    const rlp = ctx.createBiquadFilter();
    rlp.type = 'lowpass';
    rlp.frequency.value = 160;
    const rg = ctx.createGain();
    rg.gain.value = 0;
    rs.connect(rlp);
    rlp.connect(rg);
    rg.connect(engineBus);

    o1.start(t);
    o2.start(t);
    lfo.start(t);
    rs.start(t, Math.random() * 0.5);
    eng = { o1, o2, lp, g, rg };
  }

  // Called every frame: only sets AudioParam targets, never creates nodes.
  S.setEngine = function (speed01, boosting, onRoad) {
    if (!ready) return;
    if (!eng) ensureEngine();
    const s = clamp(speed01 || 0, 0, 1);
    const t = ctx.currentTime;
    const f = (55 + s * 135) * (boosting ? 1.18 : 1);
    eng.o1.frequency.setTargetAtTime(f, t, 0.06);
    eng.o2.frequency.setTargetAtTime(f, t, 0.06);
    eng.lp.frequency.setTargetAtTime(380 + s * 900 + (boosting ? 700 : 0), t, 0.1);
    eng.g.gain.setTargetAtTime(0.16 + s * 0.1 + (boosting ? 0.05 : 0), t, 0.08);
    eng.rg.gain.setTargetAtTime(onRoad ? 0 : 0.12 + s * 0.12, t, 0.1);
  };

  S.stopEngine = function () {
    if (!ready || !eng) return;
    const t = ctx.currentTime;
    eng.g.gain.setTargetAtTime(0, t, 0.05);
    eng.rg.gain.setTargetAtTime(0, t, 0.05);
  };

  // ---------- music ----------
  // Melody tokens: MIDI number = note onset, '.' = rest onset, '-' = sustain previous (one 16th).
  // Bass: r = root, f = fifth, o = octave, . = rest. Drums: x = hit.
  const THEMES = {
    menu: {
      bpm: 120, tonic: 62,
      chords: [[0, 3, 7], [10, 14, 17], [8, 12, 15], [7, 11, 14]],
      mel: [
        '62 - 65 67 69 - 70 - 69 67 65 - 62 - - -',
        '65 - 70 - 72 - 70 69 - 67 - 65 62 - 60 -',
      ],
      bass: 'r..r..r.r..r.f..', kick: 'x.....x...x.x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
      leadWave: 'square', leadVol: 0.07, bassWave: 'triangle', bassVol: 0.16, padVol: 0.035,
    },
    meadow: {
      bpm: 140, tonic: 72,
      chords: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]],
      mel: [
        '72 - 76 79 - 84 - 79 76 - 74 - 72 - - -',
        '71 - 74 76 - 79 - 76 74 - 72 - 71 - 74 -',
        '81 - 84 - 81 79 - 76 - 79 - 81 - 84 - -',
        '77 - 81 - 84 - 81 79 - 77 - 74 - 77 - 72 -',
      ],
      bass: 'r.r.f.r.r.r.f.r.', kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.',
      leadWave: 'square', leadVol: 0.07, bassWave: 'triangle', bassVol: 0.18, padVol: 0.03,
    },
    dunes: {
      bpm: 132, tonic: 69,
      chords: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [1, 5, 8]],
      mel: [
        '69 - 70 - 72 - 70 - 68 - 65 - 64 - 69 -',
        '70 - 69 - 65 - 64 - 60 - 64 - 65 - 68 -',
      ],
      bass: 'r...r.r...r.f...', kick: 'x.x.....x.x.....', snare: '....x.......x.x.', hat: 'x.x.x.x.x.x.x.x.',
      leadWave: 'sawtooth', leadVol: 0.05, bassWave: 'triangle', bassVol: 0.16, padVol: 0.03,
    },
    glacier: {
      bpm: 126, tonic: 65,
      chords: [[0, 4, 7], [2, 6, 9], [7, 11, 14], [2, 6, 9]],
      mel: [
        '65 - - - 71 - - - 72 - - - 69 - - -',
        '67 - - - 69 - - - 71 - - - 74 - - -',
        '72 - 71 - 69 - 67 - 65 - - - - - - -',
        '64 - - - 65 - - - 67 - - - 69 - 71 -',
      ],
      bass: 'r.......f.......', kick: 'x.......x.......', snare: '....x...', hat: '..x...x...x...x.',
      leadWave: 'triangle', leadVol: 0.09, bassWave: 'sine', bassVol: 0.18, padVol: 0.05,
    },
    starlight: {
      bpm: 150, tonic: 64,
      chords: [[0, 3, 7], [8, 12, 15], [10, 14, 17], [7, 11, 14]],
      mel: [
        '64 67 71 76 71 67 64 67 64 67 71 76 79 76 71 67',
        '72 76 79 84 79 76 72 76 72 76 79 84 79 76 72 -',
        '74 78 81 86 81 78 74 78 74 78 81 86 81 78 74 -',
        '71 75 78 83 78 75 71 75 71 75 78 83 78 75 71 -',
      ],
      bass: 'r.r.r.r.r.r.r.r.', kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx',
      leadWave: 'square', leadVol: 0.05, bassWave: 'triangle', bassVol: 0.14, padVol: 0.035,
    },
    results: {
      bpm: 110, tonic: 72,
      chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]],
      mel: [
        '72 - 76 - 79 - 84 - 79 - - - - - - -',
        '77 - 77 - 81 - 84 - 81 - 77 - 79 - 81 -',
        '79 - 83 - 86 - 83 - 79 - 74 - 79 - 83 -',
        '84 - - - 79 - - - 76 - 79 - 84 - - -',
      ],
      bass: 'r.....r.r.....r.', kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.',
      leadWave: 'triangle', leadVol: 0.09, bassWave: 'triangle', bassVol: 0.18, padVol: 0.035,
    },
  };

  function prepTheme(th) {
    if (th.melody) return th;
    const toks = th.mel.join(' ').split(/\s+/).filter(Boolean);
    const n = toks.length;
    const ev = [];
    for (let i = 0; i < n; i++) if (toks[i] !== '-') ev.push(i);
    const melody = new Array(n).fill(null);
    for (let k = 0; k < ev.length; k++) {
      const i = ev[k];
      const nxt = k + 1 < ev.length ? ev[k + 1] : ev[0] + n;
      if (toks[i] === '.') continue;
      melody[i] = { m: Number(toks[i]), len: nxt - i };
    }
    th.melody = melody;
    th.melLen = n;
    th.bassP = th.bass.padEnd(16, '.');
    th.kickP = th.kick.padEnd(16, '.');
    th.snareP = th.snare.padEnd(16, '.');
    th.hatP = th.hat.padEnd(16, '.');
    return th;
  }

  function note(dest, type, m, t, dur, vol) {
    const o = ctx.createOscillator();
    const e = ctx.createGain();
    o.type = type;
    o.frequency.value = 440 * Math.pow(2, (m - 69) / 12);
    e.gain.setValueAtTime(0.0001, t);
    e.gain.linearRampToValueAtTime(vol, t + 0.008);
    e.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.05, dur));
    o.connect(e);
    e.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function kick(dest, t, vol) {
    const o = ctx.createOscillator();
    const e = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    e.gain.setValueAtTime(vol, t);
    e.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(e);
    e.connect(dest);
    o.start(t);
    o.stop(t + 0.22);
  }

  function noiseHit(dest, t, dur, vol, ftype, f) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const flt = ctx.createBiquadFilter();
    flt.type = ftype;
    flt.frequency.value = f;
    const e = ctx.createGain();
    e.gain.setValueAtTime(vol, t);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt);
    flt.connect(e);
    e.connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  function snare(dest, t, vol) {
    noiseHit(dest, t, 0.16, vol, 'highpass', 1500);
    note(dest, 'triangle', 45, t, 0.08, vol * 0.8); // 45 midi ~ 110 Hz body
  }

  function schedule(tr, step, t, sd) {
    const th = tr.th, g = tr.g;
    const s16 = step & 15;
    const bar = step >> 4;
    const ch = th.chords[bar % th.chords.length];
    const base = th.tonic - 12;

    if (s16 === 0) {
      for (let i = 0; i < 3; i++) note(g, 'triangle', base + ch[i], t, sd * 15, th.padVol);
    }
    const bc = th.bassP[s16];
    if (bc !== '.') {
      let m = base + ch[0];
      if (bc === 'f') m = base + ch[2];
      else if (bc === 'o') m = base + ch[0] + 12;
      note(g, th.bassWave, m, t, sd * 0.9, th.bassVol);
    }
    const ev = th.melody[step % th.melLen];
    if (ev) note(g, th.leadWave, ev.m, t, ev.len * sd * 0.9, th.leadVol);

    if (th.kickP[s16] === 'x') kick(g, t, 0.55);
    if (th.snareP[s16] === 'x') snare(g, t, 0.22);
    if (th.hatP[s16] === 'x') noiseHit(g, t, 0.04, 0.07, 'highpass', 7000);
  }

  function stepDur(th) {
    return 60 / (th.bpm * (musicBoost ? 1.08 : 1)) / 4;
  }

  function tick() {
    if (!cur || !ctx) return;
    const now = ctx.currentTime;
    if (cur.nextTime < now) cur.nextTime = now + 0.05;
    const horizon = now + LOOKAHEAD;
    let guard = 16;
    while (cur.nextTime < horizon && guard-- > 0) {
      const sd = stepDur(cur.th);
      schedule(cur, cur.step, cur.nextTime, sd);
      cur.nextTime += sd;
      cur.step++;
    }
  }

  function startSched() {
    if (!schedTimer) schedTimer = setInterval(tick, TICK_MS);
  }
  function stopSched() {
    if (schedTimer) clearInterval(schedTimer);
    schedTimer = 0;
  }

  function fadeOutCurrent() {
    if (!cur) return;
    const old = cur;
    cur = null;
    const t = ctx.currentTime;
    old.g.gain.cancelScheduledValues(t);
    old.g.gain.setTargetAtTime(0, t, 0.15);
    setTimeout(() => { try { old.g.disconnect(); } catch (e) { /* ignore */ } }, 1500);
  }

  S.playMusic = function (name) {
    if (!ready) return;
    const th0 = THEMES[name];
    if (!th0) return;
    if (cur && cur.name === name) return;
    fadeOutCurrent();
    const th = prepTheme(th0);
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.setTargetAtTime(1, t, 0.25);
    g.connect(musicBus);
    cur = { name, th, g, step: 0, nextTime: t + 0.08 };
    tick();
    startSched();
  };

  S.stopMusic = function () {
    if (!ready) return;
    fadeOutCurrent();
    stopSched();
  };

  G.Sound = S;
})();
