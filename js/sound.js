// js/sound.js — G.Sound: fully procedural Web Audio (no audio files).
// Music: step sequencer on a lookahead scheduler; themes are original loops.
// Voices: formant-ish "yips" per character. Engines: up to 4 player engines.
(function () {
  'use strict';
  const G = (window.G = window.G || {});
  const S = {};
  G.Sound = S;

  const MUTE_KEY = 'turbo-tandem-muted';
  const MAX_VOICES = 24;
  const MIN_GAP_MS = 40;
  const VOICE_GAP_MS = 600;
  const LOOKAHEAD = 0.1;
  const TICK_MS = 25;
  const MASTER_VOL = 0.9;
  const MUSIC_BASE = 0.35;
  const SFX_BASE = 0.6;
  const MAX_ENGINES = 4;
  const ENG_ACTIVE_S = 0.25;

  let ctx = null;
  let ready = false;
  let failed = false;
  let master = null, sfxBus = null, musicBus = null, engineBus = null, comp = null;
  let noiseBuf = null;
  let voices = 0;
  const lastPlayed = {};
  const lastVoice = {};
  let cur = null;          // current music track state
  let schedTimer = 0;
  let musicBoost = false;
  const engs = [null, null, null, null];   // engine voice nodes per player slot
  const engSeen = [-1e9, -1e9, -1e9, -1e9]; // ctx time of last setEngine per slot
  let musicVol = 1, sfxVol = 1;             // user levels 0..1
  let volExplicit = false;

  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  function readMuted() {
    try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { return false; }
  }
  function saveMuted(b) {
    try { localStorage.setItem(MUTE_KEY, b ? '1' : '0'); } catch (e) { /* ignore */ }
  }
  let muted = readMuted();
  Object.defineProperty(S, 'muted', { get: () => muted, enumerable: true });

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const clamp01 = (v) => clamp(v, 0, 1);
  const clampF = (f) => clamp(f, 20, 20000);
  const clampIdx = (i) => clamp(i | 0, 0, MAX_ENGINES - 1);

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

  // Initial user levels from the save file (0..1; values > 1 are read as percent).
  function savedVolumes() {
    let m = 1, s = 1;
    try {
      const st = G.Save && G.Save.settings;
      if (st) {
        if (typeof st.musicVol === 'number') m = st.musicVol;
        if (typeof st.sfxVol === 'number') s = st.sfxVol;
      }
    } catch (e) { /* ignore */ }
    if (m > 1) m /= 100;
    if (s > 1) s /= 100;
    return [clamp01(m), clamp01(s)];
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
      if (!volExplicit) {
        const v = savedVolumes();
        musicVol = v[0];
        sfxVol = v[1];
      }
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
      sfxBus = bus(SFX_BASE * sfxVol);
      musicBus = bus(MUSIC_BASE * musicVol);
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

  // music1 / sfx1 in 0..1. Safe to call before init (applied when the context is built).
  S.setVolumes = function (music01, sfx01) {
    volExplicit = true;
    if (typeof music01 === 'number') musicVol = clamp01(music01);
    if (typeof sfx01 === 'number') sfxVol = clamp01(sfx01);
    if (ready) {
      const t = ctx.currentTime;
      musicBus.gain.setTargetAtTime(MUSIC_BASE * musicVol, t, 0.05);
      sfxBus.gain.setTargetAtTime(SFX_BASE * sfxVol, t, 0.05);
    }
  };
  S.getVolumes = function () { return { music: musicVol, sfx: sfxVol }; };

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
    item_drop(c) {
      tone(c, 'triangle', 700, c.t, 0.12, 0.2, 350);
      noise(c, c.t, 0.08, 0.2, 'lowpass', 500);
    },
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
    // ---- new in v2 ----
    splash(c) {
      noise(c, c.t, 0.5, 0.5, 'bandpass', 1400, 350, 1.2);
      tone(c, 'sine', 900, c.t, 0.25, 0.12, 300);
      tone(c, 'sine', 1300, c.t + 0.08, 0.2, 0.08, 400);
    },
    ice(c) {
      arp(c, 'sine', [2093, 2637, 3136, 2637], 0.035, 0.16, 0.12);
      noise(c, c.t, 0.12, 0.2, 'highpass', 6000);
    },
    cannon(c) {
      tone(c, 'sawtooth', 120, c.t, 0.35, 0.22, 480);
      noise(c, c.t, 0.45, 0.4, 'lowpass', 900, 200, 0.9);
    },
    slipstream(c) {
      noise(c, c.t, 0.7, 0.22, 'bandpass', 900, 4000, 2.5);
      tone(c, 'triangle', 420, c.t, 0.6, 0.08, 900);
    },
    slap(c) {
      noise(c, c.t, 0.08, 0.5, 'highpass', 1500);
      tone(c, 'square', 220, c.t, 0.12, 0.14, 90);
    },
    rescue(c) {
      seq(c, 'sine', [523, 659, 784, 1046, 1318], 0.09, 0.2, 0.2);
      noise(c, c.t, 0.5, 0.12, 'bandpass', 700, 1400, 3);
    },
    chomp(c) {
      tone(c, 'sawtooth', 200, c.t, 0.25, 0.2, 60);
      noise(c, c.t, 0.22, 0.35, 'lowpass', 900, 150);
      tone(c, 'square', 180, c.t + 0.14, 0.1, 0.15, 70);
    },
    balloon_pop(c) {
      tone(c, 'sine', 900, c.t, 0.06, 0.3, 1800);
      noise(c, c.t, 0.06, 0.5, 'highpass', 3000);
    },
    shine_get(c) { arp(c, 'triangle', [1568, 2093, 2637, 3136], 0.05, 0.14, 0.16); },
    shine_lost(c) {
      tone(c, 'triangle', 880, c.t, 0.6, 0.22, 220);
      tone(c, 'sine', 440, c.t + 0.1, 0.5, 0.1, 110);
    },
    bomb_fuse(c) {
      noise(c, c.t, 0.9, 0.12, 'highpass', 4000);
      for (let i = 0; i < 8; i++) tone(c, 'square', 2400 + (i & 1) * 200, c.t + i * 0.11, 0.02, 0.07);
    },
    crowd(c) {
      noise(c, c.t, 1.6, 0.3, 'bandpass', 900, 700, 0.8);
      noise(c, c.t + 0.1, 1.4, 0.2, 'bandpass', 1500, 1100, 0.7);
      noise(c, c.t + 0.05, 1.2, 0.15, 'highpass', 3000);
    },
    unlock(c) { arp(c, 'triangle', [659, 880, 1175, 1319, 1760], 0.06, 0.18, 0.14); },
    cheer(c) {
      SFX.crowd(c);
      seq(c, 'square', [523, 659, 784], 0.1, 0.14, 0.12);
    },
  };
  SFX.mini_turbo = SFX.mini_turbo1; // alias

  S.play = function (name, opts) {
    if (!ready || muted || ctx.state !== 'running') return;
    if (!hasOwn(SFX, name)) return;
    const build = SFX[name];
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

  // ---------- character voices ("yips") ----------
  // Each character id maps to a profile: weight sets the base pitch (heavy low, light high),
  // the id hash picks the vowel and small tuning, and a few archetypes change the timbre.
  const ARCHETYPE = { wisp: 'ghost', thorn: 'plant', sprout: 'plant' };
  // Vowel formants [F1, F2] (Hz): a, e, i, o, u
  const VOWELS = [[730, 1090], [530, 1840], [270, 2290], [570, 840], [440, 1020]];
  // Syllables per kind: [duration s, pitch glide ratio]
  const YIP = {
    select: [[0.11, 1.35], [0.16, 1.5]],
    hit: [[0.16, 0.6]],
    boost: [[0.14, 1.4], [0.2, 1.7]],
    item: [[0.09, 1.6]],
    win: [[0.12, 1.3], [0.12, 1.5], [0.2, 1.8]],
    lose: [[0.2, 0.55], [0.22, 0.45]],
    swap: [[0.08, 1.4], [0.08, 0.8]],
    taunt: [[0.1, 1.2], [0.1, 0.9], [0.1, 1.25], [0.2, 0.8]],
  };
  const PITCH_MUL = [1, 1.12, 0.95, 1.06];

  function hashId(s) {
    let h = 2166136261;
    const str = String(s == null ? 'x' : s);
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  const profileCache = {};
  function charProfile(id) {
    const key = String(id);
    if (profileCache[key]) return profileCache[key];
    const h = hashId(key);
    const r = (k) => ((h >>> (k * 4)) & 15) / 15; // 0..1 from nibble k
    let weight = null;
    try {
      const list = G.CHARACTERS || [];
      for (let i = 0; i < list.length; i++) {
        if (list[i] && String(list[i].id) === key) { weight = list[i].weight; break; }
      }
    } catch (e) { /* ignore */ }
    if (weight !== 'light' && weight !== 'medium' && weight !== 'heavy') {
      weight = ['light', 'medium', 'heavy'][h % 3];
    }
    const basePitch = weight === 'heavy' ? 150 : weight === 'medium' ? 225 : 330;
    const arche = ARCHETYPE[key] || 'normal';
    let pitch = basePitch * (0.92 + 0.16 * r(0));
    const scale = weight === 'heavy' ? 0.82 : weight === 'light' ? 1.18 : 1;
    let wave = 'sawtooth', vib = 5.5, vibDepth = 0.02, q = 6;
    if (arche === 'ghost') {          // warbly: sine body, deep wobble
      wave = 'sine'; vib = 7; vibDepth = 0.09; q = 4; pitch *= 1.1;
    } else if (arche === 'plant') {   // growly: low square with slow wobble
      wave = 'square'; vib = 3; vibDepth = 0.03; q = 3; pitch *= 0.85;
    }
    const p = {
      pitch, scale, wave, vib, vibDepth, q, weight, arche,
      vowel: h >>> 3,               // first vowel index (mod 5 at use)
    };
    profileCache[key] = p;
    return p;
  }

  // One vowel-ish syllable: pitch-glided osc through two band-passes, enveloped.
  function syll(c, t, dur, f0, f1, vowel, p, vol) {
    const src = ctx.createOscillator();
    src.type = p.wave;
    src.frequency.setValueAtTime(clampF(f0), t);
    src.frequency.exponentialRampToValueAtTime(clampF(f1), t + dur);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = p.vib;
    const lfoG = ctx.createGain();
    lfoG.gain.value = f0 * p.vibDepth;
    lfo.connect(lfoG);
    lfoG.connect(src.frequency);

    const fm = VOWELS[vowel % VOWELS.length];
    const b1 = ctx.createBiquadFilter();
    b1.type = 'bandpass';
    b1.frequency.value = fm[0] * p.scale;
    b1.Q.value = p.q;
    const b2 = ctx.createBiquadFilter();
    b2.type = 'bandpass';
    b2.frequency.value = fm[1] * p.scale;
    b2.Q.value = p.q;
    const g1 = ctx.createGain();
    g1.gain.value = 1;
    const g2 = ctx.createGain();
    g2.gain.value = 0.5;
    const env = ctx.createGain();
    const a = Math.max(0.0002, vol * c.vol);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(a, t + Math.min(0.025, dur * 0.25));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(b1);
    src.connect(b2);
    b1.connect(g1);
    b2.connect(g2);
    g1.connect(env);
    g2.connect(env);
    env.connect(c.bus);
    reg(c.v, src);
    reg(c.v, lfo);
    src.start(t);
    lfo.start(t);
    src.stop(t + dur + 0.03);
    lfo.stop(t + dur + 0.03);
  }

  // Per-character gibberish call. kind: select|hit|boost|item|win|lose|swap|taunt
  S.voice = function (charId, kind, opts) {
    if (!ready || muted || ctx.state !== 'running') return;
    if (!hasOwn(YIP, kind)) return;
    const key = String(charId);
    const now = performance.now();
    const last = lastVoice[key];
    if (last !== undefined && now - last < VOICE_GAP_MS) return;
    if (voices >= MAX_VOICES) return;
    lastVoice[key] = now;

    const p = charProfile(key);
    const seqs = YIP[kind];
    const v = { n: 1 };
    voices++;
    const c = {
      v,
      t: ctx.currentTime + 0.005,
      vol: (opts && opts.volume != null ? opts.volume : 1) * 0.9,
      p: 1,
      bus: sfxBus,
    };
    try {
      let t = c.t;
      for (let i = 0; i < seqs.length; i++) {
        const dur = seqs[i][0];
        const ratio = seqs[i][1];
        const f0 = p.pitch * PITCH_MUL[i & 3];
        syll(c, t, dur, f0, f0 * ratio, p.vowel + i * 2, p, 0.5);
        if (p.arche !== 'plant') noise(c, t, 0.03, 0.12, 'bandpass', 1800, null, 2);
        t += dur * 0.9;
      }
    } catch (e) {
      // never let a sound break the game
    } finally {
      if (--v.n === 0) voices--;
    }
  };

  // ---------- engines (one per player slot, created on demand) ----------
  function ensureEngine(i) {
    const t = ctx.currentTime;
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = 55;
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.value = 55;
    o2.detune.value = 9 + i * 4;
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
    lfo.frequency.value = 5.5 + i * 0.4;
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
    engs[i] = { o1, o2, lp, g, rg };
  }

  // Called every frame per player: only sets AudioParam targets (creates nodes once per slot).
  // Engines heard at the same time are mixed quieter (1/sqrt(n)).
  S.setEngine = function (speed01, boosting, onRoad, playerIndex) {
    if (!ready) return;
    const i = clampIdx(playerIndex);
    if (!engs[i]) ensureEngine(i);
    const e = engs[i];
    const now = ctx.currentTime;
    engSeen[i] = now;
    let n = 0;
    for (let k = 0; k < MAX_ENGINES; k++) {
      if (engs[k] && now - engSeen[k] < ENG_ACTIVE_S) n++;
    }
    const mix = n > 1 ? 1 / Math.sqrt(n) : 1;
    const s = clamp(speed01 || 0, 0, 1);
    const f = (55 + s * 135) * (boosting ? 1.18 : 1);
    e.o1.frequency.setTargetAtTime(f, now, 0.06);
    e.o2.frequency.setTargetAtTime(f, now, 0.06);
    e.lp.frequency.setTargetAtTime(380 + s * 900 + (boosting ? 700 : 0), now, 0.1);
    e.g.gain.setTargetAtTime((0.16 + s * 0.1 + (boosting ? 0.05 : 0)) * mix, now, 0.08);
    e.rg.gain.setTargetAtTime((onRoad ? 0 : 0.12 + s * 0.12) * mix, now, 0.1);
  };

  // stopEngine() stops every slot; stopEngine(i) stops one.
  S.stopEngine = function (playerIndex) {
    if (!ready) return;
    const t = ctx.currentTime;
    const only = playerIndex === undefined || playerIndex === null ? -1 : clampIdx(playerIndex);
    for (let i = 0; i < MAX_ENGINES; i++) {
      if (only >= 0 && only !== i) continue;
      engSeen[i] = -1e9;
      const e = engs[i];
      if (!e) continue;
      e.g.gain.setTargetAtTime(0, t, 0.05);
      e.rg.gain.setTargetAtTime(0, t, 0.05);
    }
  };

  // ---------- music ----------
  // Melody tokens: MIDI number = note onset, '.' = rest onset, '-' = sustain previous (one 16th).
  // Each mel line is one bar of 16 tokens (12 when spb:12). Chords are semitone offsets from
  // base = tonic - 12. Bass pattern: r root, f fifth, o octave, t third, . rest (one char per 16th).
  // Arp pattern: digit = chord tone index, . rest. Drum chars: see DRUM.
  // Theme fields: bpm, tonic, chords, mel, lead{w,v}, bassI{w,v,p}, pad{w,v,every}?, arp{w,v,p,oct}?,
  // drums{key:pattern}, spb (steps per bar, default 16), swing (0..0.3, delays odd 16ths).
  // The first six themes use the legacy fields (leadWave, bass, kick, ...); prepTheme maps them.
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

    // ---- course themes (original) ----
    circuit: { // bright major, four-on-the-floor
      bpm: 150, tonic: 67,
      chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]],
      mel: [
        '71 - 74 - 76 - 79 - 81 - 79 - 76 - 74 -',
        '76 - 79 - 81 - 84 - 83 - 81 - 79 - 76 -',
        '74 - 78 - 81 - 83 - 86 - 83 - 81 - 78 -',
        '79 - - - 76 - 74 - 71 - 74 - 79 - - -',
      ],
      lead: { w: 'square', v: 0.06 },
      bassI: { w: 'triangle', v: 0.17, p: 'r.r.f.r.r.r.f.r.' },
      pad: { w: 'organ', v: 0.022, every: 16 },
      drums: { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.' },
    },
    beach: { // calypso: steel pans, claps, shaker and conga
      bpm: 118, tonic: 62,
      chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]],
      mel: [
        '66 - 69 - 69 - 74 - 73 - 71 - 69 - 66 -',
        '69 - 73 - 74 - 76 - 74 - 73 - 69 - 66 -',
        '73 - 71 - 69 - 73 - 74 - 76 - 74 - 71 -',
        '69 - - - 66 - 69 - 74 - - - 69 - - -',
      ],
      lead: { w: 'steel', v: 0.12 },
      bassI: { w: 'pluck', v: 0.16, p: 'r..f..r...f...t.' },
      pad: { w: 'epiano', v: 0.04, every: 8 },
      drums: { k: 'x.....x.x.......', c: '....x.......x...', z: 'x.x.x.x.x.x.x.x.', a: '..x...x...x.x...' },
    },
    park: { // carnival waltz, fast: 12 steps per bar (3/4)
      bpm: 176, spb: 12, tonic: 62,
      chords: [[0, 4, 7], [7, 11, 14], [5, 9, 12]],
      mel: [
        '74 - 78 - 81 - 83 - 81 - 78 -',
        '81 - 83 - 86 - 83 - 81 - 79 -',
        '76 - 74 - 71 - 73 - 74 - 76 -',
      ],
      lead: { w: 'brass', v: 0.05 },
      bassI: { w: 'triangle', v: 0.16, p: 'r...f...f...' },
      arp: { w: 'pluck', v: 0.05, p: '0.1.2.1.0.1.', oct: 12 },
      drums: { k: 'x...........', t: '.o.o.o.o.o.o', h: 'x.x.x.x.x.x.', b: 'b...b...b...' },
    },
    desert: { // harmonic minor (G# leading tone), oud-like pluck and darbuka
      bpm: 128, tonic: 69,
      chords: [[0, 3, 7], [8, 12, 15], [7, 11, 14], [0, 3, 7]],
      mel: [
        '69 - 72 - 74 - 76 - 75 - 72 - 68 - 69 -',
        '65 - 69 - 72 - 69 - 65 - 64 - 65 - 68 -',
        '64 - 68 - 71 - 68 - 69 - 71 - 72 - 71 -',
        '76 - 75 - 72 - 68 - 69 - - - 69 - - -',
      ],
      lead: { w: 'pluck', v: 0.09 },
      bassI: { w: 'triangle', v: 0.16, p: 'r...r...f...r...' },
      pad: { w: 'organ', v: 0.02, every: 16 },
      drums: { k: 'x.......x.......', a: '..x...x.x..x..x.', h: 'x.x.x.x.x.x.x.x.' },
    },
    bridge: { // driving rock, power-chord bass, fast 8ths
      bpm: 162, tonic: 64,
      chords: [[0, 7, 12], [-4, 3, 8], [-2, 5, 10], [0, 7, 12]],
      mel: [
        '64 - 64 - 67 - 64 - 62 - 64 - 67 - 71 -',
        '72 - 71 - 69 - 67 - 64 - 67 - 69 - 64 -',
        '60 - 60 - 64 - 60 - 62 - 64 - 66 - 69 -',
        '71 - 69 - 67 - 66 - 64 - - - 64 - - -',
      ],
      lead: { w: 'sawtooth', v: 0.035 },
      bassI: { w: 'square', v: 0.07, p: 'r.r.r.r.f.r.r.r.' },
      drums: { k: 'x...x.x.x...x.x.', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
    },
    classic: { // bouncy swing: brass lead, swung 8ths, cowbell
      bpm: 118, tonic: 70, swing: 0.22,
      chords: [[0, 4, 7], [-3, 0, 4], [3, 7, 10], [5, 9, 12]],
      mel: [
        '77 - 79 - 82 - 79 - 77 - 74 - 75 - 77 -',
        '74 - 75 - 77 - 79 - 82 - 84 - 82 - 79 -',
        '75 - 77 - 79 - 82 - 79 - 75 - 74 - 72 -',
        '70 - - - 74 - 77 - 79 - - - 82 - - -',
      ],
      lead: { w: 'brass', v: 0.06 },
      bassI: { w: 'triangle', v: 0.17, p: 'r..r..f.r..r.f..' },
      arp: { w: 'pluck', v: 0.04, p: '0.1.2.1.0.1.2.1.', oct: 12 },
      drums: { k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', b: '..b...b...b...b.' },
    },
    cruise: { // lounge / bossa: Fmaj7 - Gm7 - C7 with epiano, shaker and rim
      bpm: 96, tonic: 65,
      chords: [[0, 4, 7, 11], [2, 5, 9, 12], [7, 11, 14, 17], [0, 4, 7, 11]],
      mel: [
        '72 - 74 - 76 - 74 - 72 - 69 - 67 - - -',
        '74 - 77 - 79 - 77 - 74 - 72 - 70 - - -',
        '76 - 76 - 79 - 81 - 79 - 76 - 74 - 71 -',
        '72 - 71 - 69 - 67 - 69 - 72 - 74 - - -',
      ],
      lead: { w: 'epiano', v: 0.08 },
      bassI: { w: 'triangle', v: 0.15, p: 'r..f..r..t...f..' },
      pad: { w: 'triangle', v: 0.03, every: 8 },
      drums: { k: 'x..x..x...x.x...', z: 'x.x.x.x.x.x.x.x.', r: '..r.r...r..r.r..' },
    },
    stadium: { // heavy funk: dorian, horn section, syncopated bass
      bpm: 112, tonic: 67,
      chords: [[0, 3, 7, 10], [0, 3, 7, 10], [5, 9, 12, 15], [-2, 2, 5, 8]],
      mel: [
        '74 - 75 - 74 - 72 - 70 - 67 - 70 - 72 -',
        '70 - 72 - 74 - 77 - 79 - 77 - 74 - 72 -',
        '77 - 79 - 81 - 79 - 77 - 74 - 72 - 70 -',
        '74 - 72 - 70 - 69 - 67 - - - 69 - 67 -',
      ],
      lead: { w: 'brass', v: 0.05 },
      bassI: { w: 'square', v: 0.09, p: 'r..r.r..o.r.r..t' },
      drums: { k: 'x..x....x.x.....', s: '....x...o...x.o.', h: 'xoxoxoxoxoxoxoxo' },
    },
    snow: { // bell-ish lydian, sparse
      bpm: 100, tonic: 65,
      chords: [[0, 4, 7], [2, 6, 9], [7, 11, 14], [2, 6, 9]],
      mel: [
        '72 - - - 76 - - - 79 - - - 76 - - -',
        '77 - 76 - 74 - 72 - 69 - - - - - - -',
        '83 - - - 81 - 79 - 76 - - - 74 - - -',
        '78 - 76 - 74 - 76 - 81 - - - 79 - - -',
      ],
      lead: { w: 'bell', v: 0.09 },
      arp: { w: 'steel', v: 0.035, p: '0...1...2...1...', oct: 12 },
      pad: { w: 'organ', v: 0.02, every: 16 },
      bassI: { w: 'sine', v: 0.14, p: 'r.......f.......' },
      drums: { k: 'x.......x.......', z: '..x...x...x...x.' },
    },
    city: { // night synth-funk: detuned saw lead, pluck arps, clap
      bpm: 122, tonic: 69,
      chords: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [7, 11, 14]],
      mel: [
        '69 - 72 - 76 - 74 - 72 - 69 - 67 - 69 -',
        '72 - 74 - 76 - 79 - 76 - 74 - 72 - 68 -',
        '65 - 67 - 69 - 72 - 74 - - - 72 - - -',
        '71 - 74 - 76 - 74 - 71 - 69 - 71 - 74 -',
      ],
      lead: { w: 'sawtooth', v: 0.03 },
      bassI: { w: 'square', v: 0.07, p: 'r.r.r.r.r.o.r.r.' },
      arp: { w: 'pluck', v: 0.045, p: '0123012301230123', oct: 12 },
      drums: { k: 'x.......x...x...', c: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
    },
    serpent: { // tropical: pluck lead, steel pad, rim and conga
      bpm: 132, tonic: 66,
      chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [0, 3, 7]],
      mel: [
        '73 - 74 - 73 - 69 - 66 - 69 - 73 - 74 -',
        '69 - 71 - 73 - 76 - 74 - 73 - 71 - 69 -',
        '64 - 66 - 69 - 71 - 69 - 66 - 64 - - -',
        '66 - - - 69 - 71 - 73 - 71 - 69 - 66 -',
      ],
      lead: { w: 'pluck', v: 0.09 },
      pad: { w: 'steel', v: 0.03, every: 8 },
      bassI: { w: 'triangle', v: 0.16, p: 'r...r.r...r.r...' },
      drums: { k: 'x.....x...x.....', r: '..r...r...r...r.', a: 'x.x..x.x..x.x...' },
    },
    mountain: { // jungle drums: heavy toms and kick, pluck lead
      bpm: 104, tonic: 64,
      chords: [[0, 3, 7], [-4, 0, 3], [-7, -4, 0], [-5, -1, 2]],
      mel: [
        '64 - 67 - 71 - 67 - 64 - 62 - 64 - 67 -',
        '71 - 72 - 71 - 67 - 64 - - - 64 - 67 -',
        '60 - 64 - 67 - 64 - 60 - 57 - 60 - - -',
        '62 - 65 - 69 - 65 - 62 - 59 - 62 - 66 -',
      ],
      lead: { w: 'pluck', v: 0.08 },
      bassI: { w: 'triangle', v: 0.2, p: 'r.r.r.o.r.r.f.o.' },
      drums: { k: 'x.x.....x.x.....', t: '..o...x.....o...', T: '.....o.....T..o.', h: 'x.x.x.x.x.x.x.x.' },
    },
    colosseum: { // latin brass: dm-gm-A7 with congas and cowbell
      bpm: 124, tonic: 62,
      chords: [[0, 3, 7], [5, 8, 12], [7, 11, 14, 17], [0, 3, 7]],
      mel: [
        '74 - 77 - 79 - 81 - 79 - 77 - 74 - - -',
        '70 - 72 - 74 - 77 - 74 - 72 - 70 - 74 -',
        '76 - 77 - 79 - 76 - 74 - 73 - 74 - 76 -',
        '74 - - - 81 - 79 - 77 - 74 - 73 - 74 -',
      ],
      lead: { w: 'brass', v: 0.06 },
      bassI: { w: 'triangle', v: 0.15, p: 'r..r.f..r..r.t..' },
      drums: { k: 'x...x.x...x.x...', c: '....x.......x...', a: '..x.x...x.x..x..', b: 'x.x.x.x.x.x.x.x.' },
    },
    jungle: { // tribal percussion: pentatonic chant over toms and rim
      bpm: 100, tonic: 62,
      chords: [[0, 3, 7], [-4, 0, 3], [0, 3, 7], [-2, 2, 5]],
      mel: [
        '62 - - - 65 - - - 67 - - - 62 - - -',
        '69 - 67 - 65 - - - 62 - - - 65 - - -',
        '72 - 69 - 67 - 65 - 62 - - - - - - -',
        '65 - 67 - 69 - 72 - 69 - 67 - 65 - 62 -',
      ],
      lead: { w: 'pluck', v: 0.07 },
      bassI: { w: 'sine', v: 0.2, p: 'r.......r.......' },
      drums: { t: 'x..x..x...x..x..', T: '....T...x...T...', z: 'x.x.x.x.x.x.x.x.', r: '..r.r...r..r....' },
    },
    fortress: { // dark organ minor, slow toms
      bpm: 108, tonic: 62,
      chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [0, 3, 7]],
      mel: [
        '74 - - - 72 - 70 - 69 - - - 65 - - -',
        '69 - - - 70 - 72 - 74 - - - 72 - - -',
        '67 - - - 69 - 67 - 65 - - - 64 - - -',
        '62 - - - 65 - - - 69 - - - 62 - - -',
      ],
      lead: { w: 'organ', v: 0.06 },
      pad: { w: 'organ', v: 0.025, every: 16 },
      bassI: { w: 'sawtooth', v: 0.06, p: 'r...r...f...r...' },
      drums: { k: 'x.......x.......', t: '....o.......o...' },
    },
    rainbow: { // epic spacey arps over sawtooth lead
      bpm: 140, tonic: 69,
      chords: [[0, 4, 7], [5, 9, 12], [2, 5, 9], [7, 11, 14]],
      mel: [
        '81 - 83 - 81 - 76 - 79 - 81 - 83 - 86 -',
        '84 - - - 83 - 81 - 79 - 81 - 83 - 84 -',
        '77 - 79 - 81 - 83 - 81 - 79 - 77 - 74 -',
        '76 - - - 79 - 81 - 83 - 86 - - - 81 -',
      ],
      lead: { w: 'sawtooth', v: 0.028 },
      arp: { w: 'bell', v: 0.05, p: '0123210123210123', oct: 12 },
      pad: { w: 'organ', v: 0.02, every: 8 },
      bassI: { w: 'triangle', v: 0.16, p: 'r.r.r.r.r.r.r.r.' },
      drums: { k: 'x...x...x...x...', c: '....x.......x...', h: '..x...x...x...x.' },
    },

    // ---- others ----
    battle: { // fast, tense minor
      bpm: 170, tonic: 64,
      chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [0, 3, 7]],
      mel: [
        '71 - 71 - 74 - 76 - 74 - 71 - 69 - 67 -',
        '64 - 66 - 67 - 71 - 74 - 71 - 67 - 66 -',
        '62 - 64 - 66 - 69 - 71 - 69 - 66 - 64 -',
        '67 - 71 - 74 - 76 - 79 - - - 76 - - -',
      ],
      lead: { w: 'square', v: 0.05 },
      bassI: { w: 'sawtooth', v: 0.07, p: 'r.r.o.r.r.r.o.r.' },
      drums: { k: 'x.x.....x.x.....', s: '....x.......x...', c: '....o.......o...', h: 'xoxoxoxoxoxoxoxo' },
    },
    select: { // character-select jingle loop
      bpm: 116, tonic: 72,
      chords: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]],
      mel: [
        '76 - 79 - 81 - 84 - 81 - 79 - 76 - - -',
        '79 - 83 - 86 - 83 - 79 - 74 - 79 - - -',
        '81 - 84 - 81 - 79 - 76 - 77 - 79 - 81 -',
        '84 - - - 81 - 77 - 74 - - - 72 - - -',
      ],
      lead: { w: 'bell', v: 0.09 },
      arp: { w: 'pluck', v: 0.035, p: '0.1.2.1.0.1.2.1.', oct: 12 },
      bassI: { w: 'triangle', v: 0.15, p: 'r...r...f...r...' },
      drums: { k: 'x...x...x...x...', h: '..x...x...x...x.' },
    },
    ceremony: { // fanfare: brass over bass pulse and organ pad
      bpm: 104, tonic: 67,
      chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]],
      mel: [
        '67 - 67 - 67 - 71 - 74 - - - - - - -',
        '79 - - - 79 - 79 - 76 - 74 - 76 - - -',
        '77 - 77 - 77 - 81 - 84 - - - - - - -',
        '84 - - - 83 - 81 - 79 - 79 - 79 - - -',
      ],
      lead: { w: 'brass', v: 0.08 },
      pad: { w: 'organ', v: 0.02, every: 16 },
      bassI: { w: 'triangle', v: 0.16, p: 'r.......r.......' },
      drums: { k: 'x.x.x.x.x.x.x.x.', s: '....x.......x...', h: '..x...x...x...x.' },
    },
    timetrial: { // focused ticking loop
      bpm: 150, tonic: 69,
      chords: [[0, 4, 7], [5, 9, 12], [9, 12, 16], [7, 11, 14]],
      mel: [
        '76 - 81 - 79 - 76 - 74 - 76 - 79 - - -',
        '81 - 84 - 83 - 81 - 79 - 81 - 83 - - -',
        '84 - 88 - 86 - 84 - 83 - 81 - 79 - - -',
        '79 - 76 - 74 - 72 - 71 - 72 - 74 - 76 -',
      ],
      lead: { w: 'pluck', v: 0.08 },
      arp: { w: 'steel', v: 0.03, p: '0.1.2.3.0.1.2.1.', oct: 12 },
      bassI: { w: 'square', v: 0.07, p: 'r.r.r.r.r.r.r.r.' },
      drums: { k: 'x...x...x...x...', c: '....x.......x...', h: 'xoxoxoxoxoxoxoxo' },
    },
  };

  // Map legacy fields to the generic schema and precompute melody/pattern lookups.
  function prepTheme(th) {
    if (th.prepared) return th;
    th.prepared = true;
    th.spb = th.spb || 16;
    th.lead = th.lead || { w: th.leadWave || 'square', v: th.leadVol || 0.06 };
    th.bassI = th.bassI || { w: th.bassWave || 'triangle', v: th.bassVol || 0.15, p: th.bass || 'r...' };
    if (!th.pad && th.padVol) th.pad = { w: 'triangle', v: th.padVol, every: 16 };
    const dr = th.drums || { k: th.kick, s: th.snare, h: th.hat };
    th.dl = [];
    for (const key of Object.keys(dr)) {
      if (!hasOwn(DRUM, key) || !dr[key]) continue;
      th.dl.push({ fn: DRUM[key].fn, vol: DRUM[key].vol, pat: dr[key], len: dr[key].length });
    }
    // melody: one token per 16th; '-' extends the previous note
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
    return th;
  }

  // Plain WebAudio oscillator note.
  function plainNote(dest, type, m, t, dur, vol) {
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

  // One enveloped partial: peak at t, exponential decay over d*tail.
  function part(dest, type, f, t, d, peak, tail) {
    const tl = tail || 1;
    const o = ctx.createOscillator();
    const e = ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    e.gain.setValueAtTime(0.0001, t);
    e.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + 0.006);
    e.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.03, d * tl));
    o.connect(e);
    e.connect(dest);
    o.start(t);
    o.stop(t + Math.max(d, d * tl) + 0.1);
  }

  // Sustained partial: attack, hold until t+d, short release.
  function sus(dest, type, f, t, d, peak) {
    const o = ctx.createOscillator();
    const e = ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    e.gain.setValueAtTime(0.0001, t);
    e.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + 0.012);
    e.gain.setValueAtTime(Math.max(0.0002, peak), t + d);
    e.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.06);
    o.connect(e);
    e.connect(dest);
    o.start(t);
    o.stop(t + d + 0.1);
  }

  // Custom instrument voices; plain oscillator types fall through to plainNote.
  const CUSTOM = { steel: 1, bell: 1, organ: 1, brass: 1, pluck: 1, epiano: 1 };
  function note(dest, kind, m, t, dur, vol) {
    if (!hasOwn(CUSTOM, kind)) return plainNote(dest, kind, m, t, dur, vol);
    const f = 440 * Math.pow(2, (m - 69) / 12);
    const d = Math.max(0.05, dur);
    switch (kind) {
      case 'steel': // pan: bright fundamental, shimmering detuned octave
        part(dest, 'sine', f, t, d, vol, 1.2);
        part(dest, 'sine', f * 2, t, d * 0.5, vol * 0.35, 1);
        part(dest, 'sine', f * 2.008, t, d * 0.7, vol * 0.2, 1);
        break;
      case 'bell':
        part(dest, 'sine', f, t, d, vol, 2.5);
        part(dest, 'sine', f * 2.76, t, d * 0.6, vol * 0.4, 1);
        part(dest, 'sine', f * 5.4, t, d * 0.3, vol * 0.15, 1);
        break;
      case 'epiano':
        part(dest, 'sine', f, t, d, vol, 2);
        part(dest, 'sine', f * 2, t, d * 0.4, vol * 0.25, 1);
        part(dest, 'sine', f * 3, t, d * 0.3, vol * 0.1, 1);
        break;
      case 'pluck':
        part(dest, 'triangle', f, t, d, vol, 0.8);
        part(dest, 'sine', f * 2, t, d * 0.3, vol * 0.2, 0.5);
        break;
      case 'organ':
        sus(dest, 'sine', f, t, d, vol * 0.6);
        sus(dest, 'sine', f * 2, t, d, vol * 0.35);
        sus(dest, 'sine', f * 3, t, d, vol * 0.2);
        break;
      case 'brass': { // sawtooth through a filter that opens on attack
        const o = ctx.createOscillator();
        const lp = ctx.createBiquadFilter();
        const e = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.value = f;
        lp.type = 'lowpass';
        lp.Q.value = 1.5;
        lp.frequency.setValueAtTime(f * 2, t);
        lp.frequency.exponentialRampToValueAtTime(f * 6, t + 0.08);
        e.gain.setValueAtTime(0.0001, t);
        e.gain.linearRampToValueAtTime(Math.max(0.0002, vol), t + 0.03);
        e.gain.setValueAtTime(Math.max(0.0002, vol), t + d);
        e.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.08);
        o.connect(lp);
        lp.connect(e);
        e.connect(dest);
        o.start(t);
        o.stop(t + d + 0.12);
        break;
      }
      default:
        break;
    }
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

  function noiseHit(dest, t, dur, vol, ftype, f, q) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const flt = ctx.createBiquadFilter();
    flt.type = ftype;
    flt.frequency.value = f;
    if (q) flt.Q.value = q;
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
    plainNote(dest, 'triangle', 45, t, 0.08, vol * 0.8); // 45 midi ~ 110 Hz body
  }

  function clap(dest, t, vol) {
    noiseHit(dest, t, 0.1, vol, 'bandpass', 1400, 1.5);
    noiseHit(dest, t + 0.014, 0.09, vol * 0.7, 'bandpass', 1400, 1.5);
  }

  function tom(dest, t, vol, f, dur) {
    const d = dur || 0.22;
    const o = ctx.createOscillator();
    const e = ctx.createGain();
    o.frequency.setValueAtTime(f * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(f, t + d * 0.5);
    e.gain.setValueAtTime(vol, t);
    e.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(e);
    e.connect(dest);
    o.start(t);
    o.stop(t + d + 0.02);
  }

  function shaker(dest, t, vol) { noiseHit(dest, t, 0.035, vol, 'highpass', 7000); }

  function cowbell(dest, t, vol) {
    part(dest, 'square', 540, t, 0.12, vol * 0.6, 1);
    part(dest, 'square', 812, t, 0.12, vol * 0.6, 1);
  }

  function rim(dest, t, vol) {
    part(dest, 'sine', 1700, t, 0.03, vol, 1);
    noiseHit(dest, t, 0.02, vol * 0.8, 'highpass', 4000);
  }

  // Drum pattern keys: x = hit, o = soft hit, anything else = silent.
  const DRUM = {
    k: { vol: 0.55, fn: kick },
    s: { vol: 0.22, fn: snare },
    h: { vol: 0.07, fn: (d, t, v) => noiseHit(d, t, 0.04, v, 'highpass', 7000) },
    c: { vol: 0.2, fn: clap },
    t: { vol: 0.3, fn: (d, t, v) => tom(d, t, v, 150) },
    T: { vol: 0.3, fn: (d, t, v) => tom(d, t, v, 230) },
    a: { vol: 0.22, fn: (d, t, v) => tom(d, t, v, 300, 0.12) },   // conga
    z: { vol: 0.09, fn: shaker },
    b: { vol: 0.12, fn: cowbell },
    r: { vol: 0.14, fn: rim },
  };

  // Chord tone helper: indices past the chord wrap up an octave.
  function ci(ch, i) {
    return i < ch.length ? ch[i] : ch[i % ch.length] + 12;
  }

  function schedule(tr, step, t, sd) {
    const th = tr.th, g = tr.g;
    const spb = th.spb;
    const bar = Math.floor(step / spb);
    const pos = step % spb;
    const ch = th.chords[bar % th.chords.length];
    const base = th.tonic - 12;

    if (th.pad && pos % th.pad.every === 0) {
      const pd = th.pad;
      const n = Math.min(ch.length, 4);
      for (let i = 0; i < n; i++) note(g, pd.w, base + ch[i], t, sd * pd.every * 0.95, pd.v);
    }

    const bp = th.bassI.p;
    const bc = bp.length ? bp[step % bp.length] : '.';
    if (bc !== '.') {
      let m = base + ci(ch, 0);
      if (bc === 'f') m = base + ci(ch, 2);
      else if (bc === 't') m = base + ci(ch, 1);
      else if (bc === 'o') m = base + ci(ch, 0) + 12;
      note(g, th.bassI.w, m, t, sd * 0.9, th.bassI.v);
    }

    if (th.arp) {
      const ap = th.arp.p;
      const d = ap[step % ap.length];
      if (d !== '.' && d >= '0' && d <= '9') {
        note(g, th.arp.w, base + ci(ch, +d) + th.arp.oct, t, sd * 0.9, th.arp.v);
      }
    }

    const ev = th.melody[step % th.melLen];
    if (ev) note(g, th.lead.w, ev.m, t, ev.len * sd * 0.9, th.lead.v);

    for (let k = 0; k < th.dl.length; k++) {
      const dd = th.dl[k];
      const hc = dd.pat[step % dd.len];
      if (hc === 'x') dd.fn(g, t, dd.vol);
      else if (hc === 'o') dd.fn(g, t, dd.vol * 0.5);
    }
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
      const sw = (cur.step & 1) && cur.th.swing ? cur.th.swing * sd : 0;
      schedule(cur, cur.step, cur.nextTime + sw, sd);
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

  // Unknown theme names fall back to 'circuit'.
  S.playMusic = function (name) {
    if (!ready) return;
    const key = hasOwn(THEMES, name) ? name : 'circuit';
    if (cur && cur.name === key) return;
    fadeOutCurrent();
    const th = prepTheme(THEMES[key]);
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.setTargetAtTime(1, t, 0.25);
    g.connect(musicBus);
    cur = { name: key, th, g, step: 0, nextTime: t + 0.08 };
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
