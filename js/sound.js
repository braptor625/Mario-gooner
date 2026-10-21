// js/sound.js — G.Sound: fully procedural Web Audio (no audio files).
//
// Graph:  layers/sfx/engines/ambience -> buses -> master -> compressor(limiter) -> soft clipper -> out
//   musicBus (user music volume)  <- musicDuck (sidechain-ish ducking) <- per-track fades <- layers (pan, reverb/delay sends)
//   sfxBus   (user sfx volume)    <- sfxIn / engineBus / ambBus / voiceBus
// Music: lookahead step sequencer, original themes + a generic arranger (pads, counter-melody, comping,
//        drum fills, crashes, stereo layers, reverb + ping-pong delay sends, final-lap key change).
// SFX: one-shot builders, optionally positional (pan + distance gain/lowpass vs the listener).
// Continuous voices (engines, squeal, wind, surface layers, ambience, shells) are persistent nodes
// modulated by params from G.Sound.update(dt) — no per-frame node creation.
// Robustness: playMusic()/play() before the context runs are remembered; any trusted interaction
// (window capture) creates/resumes the context; a "Click or press any key for sound" pill covers
// gamepad-only play inside sandboxed iframes.
(function () {
  'use strict';
  const G = (window.G = window.G || {});
  const S = {};
  G.Sound = S;

  const MUTE_KEY = 'turbo-tandem-muted';
  const MAX_VOICES = 32;
  const MIN_GAP_MS = 40;
  const VOICE_GAP_MS = 600;
  const VOICE_GLOBAL_GAP_MS = 320;
  const LOOKAHEAD = 0.6;
  const TICK_MS = 25;
  const MASTER_VOL = 1.0;
  const MUSIC_BASE = 1.0;
  const MUSIC_MAKEUP = 2.2;
  const OUT_TRIM = 0.95;
  const SFX_BASE = 1.0;
  const MAX_ENGINES = 4;
  const ENG_ACTIVE_S = 0.25;
  const N_TRAFFIC = 3;
  const N_SHELLS = 2;
  const MAXD = 170;       // beyond this distance positional sounds are skipped
  const REFD = 16;        // distance at which a positional sound is at half gain

  let ctx = null;
  let ready = false;       // graph built
  let failed = false;
  let running = false;     // ctx.state === 'running'
  let master = null, comp = null, clipper = null;
  let sfxBus = null, sfxIn = null, engineBus = null, ambBus = null, voiceBus = null;
  let musicBus = null, musicDuck = null;
  let mRevIn = null, mDlyIn = null, sRevIn = null;
  let noiseBuf = null;
  let voices = 0;
  const lastPlayed = {};
  const lastVoice = {};
  let lastVoiceAny = 0;
  let cur = null;           // current music track state
  let want = null;          // theme remembered until the context runs: {name}
  let schedTimer = 0;
  let musicBoost = false;
  let pending = [];         // sfx requested while suspended (flushed if still fresh)
  const engs = [null, null, null, null];
  const engSeen = [-1e9, -1e9, -1e9, -1e9];
  const engIn = [null, null, null, null];   // last setEngine() params per slot
  let musicVol = 1, sfxVol = 1;             // user levels 0..1
  let volExplicit = false;
  let duckT = 0;

  // listener (player 1's camera)
  const L = { x: 0, y: 0, z: 0, h: 0, rx: -1, rz: 0, set: false, vx: 0, vz: 0, stamp: 0 };

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
  const rnd = Math.random;
  const rr = (a, b) => a + (b - a) * rnd();
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // slider -> gain: a gentle curve so the middle of the slider is clearly lower than the top
  const vcurve = (v) => (v <= 0 ? 0 : Math.pow(v, 1.6));

  // ---------- context lifecycle ----------
  function resumeCtx() {
    if (!ctx || ctx.state === 'closed' || ctx.state === 'running') return;
    try {
      const p = ctx.resume();
      if (p && p.then) p.then(onState, () => {});
    } catch (e) { /* ignore */ }
  }

  function onState() {
    if (!ctx) return;
    const was = running;
    running = ctx.state === 'running';
    if (running && !was) {
      hidePill();
      if (want && !cur) startTheme(want.name);
      flushPending();
      if (amb.want) setAmbience(amb.want, true);
    }
    if (!running && was) { /* suspended by the browser: scheduler stalls on its own */ }
    if (ctx.state === 'closed') { ready = false; running = false; ctx = null; cur = null; }
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

  function makeIR(seconds, decay, dark) {
    const sr = ctx.sampleRate, n = Math.floor(sr * seconds);
    const buf = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const a = Math.exp(-t * decay);
        const w = rnd() * 2 - 1;
        lp += (w - lp) * (0.9 - dark * t);   // gets darker as it decays
        d[i] = lp * a * (i < 220 ? i / 220 : 1);
      }
    }
    return buf;
  }

  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { failed = true; return; }
    try {
      ctx = new AC({ latencyHint: 'interactive' });
    } catch (e) {
      try { ctx = new AC(); } catch (e2) { failed = true; ctx = null; return; }
    }
    try {
      if (!volExplicit) {
        const v = savedVolumes();
        musicVol = v[0];
        sfxVol = v[1];
      }
      // ---- output chain: master -> compressor (limiter) -> soft clipper -> destination
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -5;
      comp.knee.value = 3;
      comp.ratio.value = 20;
      comp.attack.value = 0.001;
      comp.release.value = 0.1;
      clipper = ctx.createWaveShaper();
      const N = 2048, curve = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * 2 - 1;
        curve[i] = 0.9 * Math.tanh(x / 0.9);
      }
      clipper.curve = curve;
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER_VOL;
      master.connect(comp);
      comp.connect(clipper);
      const trim = ctx.createGain();
      trim.gain.value = OUT_TRIM;   // final peaks sit around -3 dBFS
      clipper.connect(trim);
      trim.connect(ctx.destination);

      // ---- buses
      sfxBus = ctx.createGain(); sfxBus.gain.value = SFX_BASE * vcurve(sfxVol); sfxBus.connect(master);
      sfxIn = ctx.createGain(); sfxIn.gain.value = 1; sfxIn.connect(sfxBus);
      engineBus = ctx.createGain(); engineBus.gain.value = 1; engineBus.connect(sfxBus);
      ambBus = ctx.createGain(); ambBus.gain.value = 1; ambBus.connect(sfxBus);
      voiceBus = ctx.createGain(); voiceBus.gain.value = 1.5; voiceBus.connect(sfxBus);
      musicBus = ctx.createGain(); musicBus.gain.value = MUSIC_BASE * vcurve(musicVol); musicBus.connect(master);
      musicDuck = ctx.createGain(); musicDuck.gain.value = 1;
      // music glue compressor + makeup: tames the kick peaks so the body of the mix can be loud
      const mComp = ctx.createDynamicsCompressor();
      mComp.threshold.value = -28; mComp.knee.value = 12; mComp.ratio.value = 6; mComp.attack.value = 0.004; mComp.release.value = 0.12;
      const mMake = ctx.createGain(); mMake.gain.value = MUSIC_MAKEUP;
      musicDuck.connect(mComp); mComp.connect(mMake); mMake.connect(musicBus);

      // ---- shared noise
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;

      // ---- reverbs: music (long, into the music chain) and sfx (short, into the sfx bus)
      mRevIn = ctx.createGain();
      const mConv = ctx.createConvolver();
      mConv.buffer = makeIR(1.9, 3.2, 0.5);
      const mRet = ctx.createGain(); mRet.gain.value = 0.9;
      mRevIn.connect(mConv); mConv.connect(mRet); mRet.connect(musicDuck);
      sRevIn = ctx.createGain();
      const sConv = ctx.createConvolver();
      sConv.buffer = makeIR(1.1, 4.5, 0.6);
      const sRet = ctx.createGain(); sRet.gain.value = 0.8;
      sRevIn.connect(sConv); sConv.connect(sRet); sRet.connect(sfxBus);

      // ---- ping-pong delay for music leads (time synced per theme)
      mDlyIn = ctx.createGain();
      const dL = ctx.createDelay(1.5), dR = ctx.createDelay(1.5);
      dL.delayTime.value = 0.28; dR.delayTime.value = 0.28;
      const fb = ctx.createGain(); fb.gain.value = 0.33;
      const pL = ctx.createStereoPanner(), pR = ctx.createStereoPanner();
      pL.pan.value = -0.7; pR.pan.value = 0.7;
      const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 3200;
      mDlyIn.connect(dL); dL.connect(pL); pL.connect(musicDuck);
      dL.connect(dR); dR.connect(dlp); dlp.connect(fb); fb.connect(dL);
      dR.connect(pR); pR.connect(musicDuck);
      mDlyIn._dL = dL; mDlyIn._dR = dR;

      ctx.onstatechange = onState;
      ready = true;
    } catch (e) {
      failed = true;
      ctx = null;
      ready = false;
      return;
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) resumeCtx(); });
    window.addEventListener('focus', resumeCtx);
    if (!schedTimer) schedTimer = setInterval(tick, TICK_MS);
    hookEvents();
    onState();
  }

  S.init = function () {
    if (failed) return;
    if (ctx && ctx.state === 'closed') { ctx = null; ready = false; running = false; }
    if (!ready) build();
    resumeCtx();
  };

  // Any trusted interaction anywhere (capture) creates / resumes the context.
  function unlock(e) {
    if (e && e.isTrusted === false) return;
    if (failed) return;
    if (ready && running) return;
    S.init();
  }
  ['pointerdown', 'pointerup', 'mousedown', 'touchstart', 'touchend', 'click', 'keydown'].forEach((ev) => {
    try { window.addEventListener(ev, unlock, { capture: true, passive: true }); } catch (e) { /* ignore */ }
  });

  S.setMuted = function (b) {
    muted = !!b;
    saveMuted(muted);
    if (ready) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(muted ? 0 : MASTER_VOL, ctx.currentTime, 0.02);
    }
  };

  // music01 / sfx01 in 0..1 (values > 1 are read as percent 0..100). Safe before init.
  S.setVolumes = function (music01, sfx01) {
    volExplicit = true;
    const norm = (v) => (v > 1 ? v / 100 : v);
    if (typeof music01 === 'number' && isFinite(music01)) musicVol = clamp01(norm(music01));
    if (typeof sfx01 === 'number' && isFinite(sfx01)) sfxVol = clamp01(norm(sfx01));
    try {
      const st = G.Save && G.Save.settings;
      if (st) { st.musicVol = musicVol; st.sfxVol = sfxVol; }
    } catch (e) { /* ignore */ }
    if (ready) {
      const t = ctx.currentTime;
      musicBus.gain.cancelScheduledValues(t);
      sfxBus.gain.cancelScheduledValues(t);
      musicBus.gain.setTargetAtTime(MUSIC_BASE * vcurve(musicVol), t, 0.025);
      sfxBus.gain.setTargetAtTime(SFX_BASE * vcurve(sfxVol), t, 0.025);
    }
  };
  S.getVolumes = function () { return { music: musicVol, sfx: sfxVol }; };

  S.getState = function () {
    return {
      ready,
      state: ctx ? ctx.state : failed ? 'unsupported' : 'none',
      muted,
      music: musicVol,
      sfx: sfxVol,
      theme: cur ? cur.name : want ? want.name : null,
      playing: !!cur,
      ambience: amb.cur || null,
      voices,
      boost: musicBoost,
      pill: !!pill,
      needsGesture: !!ctx && !running,
    };
  };

  S.setMusicTempoBoost = function (b) {
    b = !!b;
    if (b === musicBoost) return;
    musicBoost = b;
    if (b && running) riser();
  };

  // ---------- "click for sound" pill ----------
  let pill = null, pillWanted = false, padTouched = false;
  function showPill() {
    if (pill || !document.body) return;
    try {
      pill = document.createElement('div');
      pill.id = 'snd-pill';
      pill.textContent = 'Click or press any key for sound';
      pill.setAttribute('role', 'status');
      pill.style.cssText = [
        'position:fixed', 'left:50%', 'top:max(26px, env(safe-area-inset-top))', 'transform:translateX(-50%) translateY(-8px)',
        'z-index:2147483000', 'pointer-events:none', 'padding:9px 20px 10px', 'border-radius:999px',
        'font:800 15px/1.1 "Trebuchet MS","Arial Rounded MT Bold",system-ui,sans-serif', 'letter-spacing:.04em', 'color:#fff',
        'background:linear-gradient(180deg,#3aa6ff,#1769d6)', 'border:3px solid #fff',
        'box-shadow:0 0 0 3px #ff9a1f,0 6px 0 rgba(8,40,110,.55),0 10px 22px rgba(0,0,0,.35)',
        'text-shadow:0 2px 0 rgba(8,40,110,.7)', 'opacity:0', 'transition:opacity .35s, transform .35s', 'white-space:nowrap',
      ].join(';');
      document.body.appendChild(pill);
      requestAnimationFrame(() => { if (pill) { pill.style.opacity = '1'; pill.style.transform = 'translateX(-50%)'; } });
    } catch (e) { pill = null; }
  }
  function hidePill() {
    pillWanted = false;
    if (!pill) return;
    const p = pill;
    pill = null;
    try {
      p.style.opacity = '0';
      setTimeout(() => { try { p.remove(); } catch (e) { /* ignore */ } }, 400);
    } catch (e) { /* ignore */ }
  }

  // Slow housekeeping (independent of the render loop): gamepad presses, pill, resume retries.
  function anyPadPressed() {
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : null;
      if (!pads) return false;
      for (let i = 0; i < pads.length; i++) {
        const p = pads[i];
        if (!p || !p.buttons) continue;
        for (let b = 0; b < p.buttons.length; b++) if (p.buttons[b].pressed) return true;
        for (let a = 0; a < p.axes.length && a < 4; a++) if (Math.abs(p.axes[a]) > 0.7) return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }
  setInterval(function housekeeping() {
    if (failed) return;
    if (ready && running) { if (pill) hidePill(); return; }
    if (anyPadPressed()) {
      padTouched = true;
      S.init();            // a pad press is not a user activation, but it costs nothing and works where the page was already activated
    }
    if (ready && ctx && ctx.state !== 'running') resumeCtx();
    // a controller is in use but the browser still blocks audio -> tell the player how to enable it
    if (padTouched && !running) pillWanted = true;
    if (pillWanted && !running && !pill) showPill();
  }, 120);
  window.addEventListener('gamepadconnected', () => { padTouched = true; S.init(); });

  // ---------- spatial helpers ----------
  S.setListener = function (x, y, z, heading) {
    if (typeof x !== 'number' || !isFinite(x) || !isFinite(z)) return;
    L.vx = L.set ? x - L.x : 0;
    L.vz = L.set ? z - L.z : 0;
    L.x = x; L.y = y || 0; L.z = z;
    if (typeof heading === 'number' && isFinite(heading)) {
      L.h = heading;
      L.rx = -Math.cos(heading);   // right-hand vector of a listener facing (sin h, cos h)
      L.rz = Math.sin(heading);
    }
    L.set = true;
    L.stamp = performance.now();
  };

  function spatial(x, z) {
    const dx = x - L.x, dz = z - L.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > MAXD) return null;
    const q = d / REFD;
    const g = 1 / (1 + Math.pow(q, 1.5));
    const pan = d < 0.5 ? 0 : clamp((dx * L.rx + dz * L.rz) / d, -1, 1) * Math.min(1, d / 5) * 0.92;
    return { g, pan, d, lp: clamp(19000 / (1 + d / 16), 1400, 19000) };
  }

  // Per-play output chain: gain -> [lowpass -> panner] -> dest, plus reverb send.
  function outChain(sp, wet, dest) {
    const o = ctx.createGain();
    o.gain.value = 1;
    if (sp) {
      o.gain.value = sp.g;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = sp.lp;
      lp.Q.value = 0.5;
      const pn = ctx.createStereoPanner();
      pn.pan.value = sp.pan;
      o.connect(lp); lp.connect(pn); pn.connect(dest);
    } else {
      o.connect(dest);
    }
    if (wet > 0.004) {
      const s = ctx.createGain();
      s.gain.value = wet;
      o.connect(s);
      s.connect(sRevIn);
    }
    return o;
  }

  function duck(amt, hold, rel, g) {
    if (!ready || !running) return;
    const a = g == null ? amt : 1 - (1 - amt) * g;
    if (a > 0.96) return;
    const t = ctx.currentTime;
    const p = musicDuck.gain;
    const curv = p.value;
    p.cancelScheduledValues(t);
    p.setValueAtTime(curv, t);
    p.setTargetAtTime(Math.min(curv, a), t, 0.012);
    p.setTargetAtTime(star.on ? 0.62 : 1, t + hold, rel / 3);
    duckT = t + hold + rel;
  }

  // ---------- voice helpers (SFX) ----------
  // A voice record counts live nodes; when the last one ends the voice slot is freed.
  function reg(v, node) {
    if (!v) return;
    v.n++;
    node.onended = () => { if (--v.n === 0) voices--; };
  }

  // c = { v, t, vol, p, bus }
  function tone(c, type, f, t, dur, vol, f2, att) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(clampF(f * c.p), t);
    if (f2) o.frequency.exponentialRampToValueAtTime(clampF(f2 * c.p), t + dur);
    const a = Math.max(0.0002, vol * c.vol);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(a, t + (att || Math.min(0.01, dur * 0.2)));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(c.bus);
    reg(c.v, o);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  // type: 'lowpass'|'highpass'|'bandpass'; f -> f2 is an optional sweep
  function noise(c, t, dur, vol, type, f, f2, q, att) {
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
    g.gain.linearRampToValueAtTime(a, t + (att || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt);
    flt.connect(g);
    g.connect(c.bus);
    reg(c.v, src);
    src.start(t, Math.random() * 1.2);
    src.stop(t + dur + 0.03);
  }

  // FM bell / metallic tone
  function fm(c, fc, ratio, idx, t, dur, vol) {
    const car = ctx.createOscillator(), mod = ctx.createOscillator();
    const mg = ctx.createGain(), g = ctx.createGain();
    car.frequency.value = clampF(fc * c.p);
    mod.frequency.value = clampF(fc * ratio * c.p);
    mg.gain.setValueAtTime(fc * idx, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(1, fc * idx * 0.05), t + dur);
    const a = Math.max(0.0002, vol * c.vol);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(a, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    mod.connect(mg); mg.connect(car.frequency);
    car.connect(g); g.connect(c.bus);
    reg(c.v, car); reg(c.v, mod);
    car.start(t); mod.start(t);
    car.stop(t + dur + 0.03); mod.stop(t + dur + 0.03);
  }

  function seq(c, type, freqs, gap, dur, vol) {
    for (let i = 0; i < freqs.length; i++) tone(c, type, freqs[i], c.t + i * gap, dur, vol);
  }
  function arp(c, type, freqs, gap, dur, vol) {
    for (let i = 0; i < freqs.length; i++) {
      tone(c, type, freqs[i], c.t + i * gap, dur, vol);
      tone(c, 'sine', freqs[i] * 2, c.t + i * gap, dur * 0.6, vol * 0.25);
    }
  }
  function bells(c, freqs, gap, dur, vol, t0) {
    for (let i = 0; i < freqs.length; i++) {
      fm(c, freqs[i], 2.76, 0.9, (t0 || c.t) + i * gap, dur, vol);
      tone(c, 'sine', freqs[i], (t0 || c.t) + i * gap, dur * 0.8, vol * 0.5);
    }
  }
  function chord(c, type, freqs, t, dur, vol) {
    for (let i = 0; i < freqs.length; i++) tone(c, type, freqs[i], t, dur, vol, null, 0.02);
  }
  const NOTE = { C4: 262, E4: 330, G4: 392, A4: 440, C5: 523, D5: 587, E5: 659, G5: 784, A5: 880, B5: 988, C6: 1047, E6: 1319, G6: 1568, C7: 2093 };

  const SFX = {
    menu_move(c) {
      tone(c, 'triangle', 784, c.t, 0.07, 0.17, 1046);
      tone(c, 'sine', 1568, c.t, 0.05, 0.07);
    },
    menu_select(c) {
      tone(c, 'square', 659, c.t, 0.07, 0.09);
      tone(c, 'triangle', 988, c.t + 0.06, 0.12, 0.17);
      tone(c, 'sine', 1976, c.t + 0.06, 0.1, 0.07);
      tone(c, 'triangle', 1319, c.t + 0.12, 0.2, 0.15);
    },
    menu_back(c) {
      tone(c, 'triangle', 523, c.t, 0.1, 0.17, 392);
      tone(c, 'sine', 392, c.t + 0.07, 0.15, 0.15, 294);
    },
    menu_locked(c) {
      tone(c, 'square', 170, c.t, 0.09, 0.1, 140);
      tone(c, 'square', 130, c.t + 0.11, 0.16, 0.1, 96);
      noise(c, c.t, 0.06, 0.08, 'lowpass', 600);
    },
    countdown(c) {          // 3-2-1: lower pip
      tone(c, 'square', 330, c.t, 0.24, 0.13);
      tone(c, 'sine', 330, c.t, 0.32, 0.22);
      tone(c, 'triangle', 660, c.t, 0.14, 0.05);
    },
    go(c) {                 // GO: high bright chord + sparkle
      chord(c, 'square', [660, 880, 1320], c.t, 0.7, 0.07);
      chord(c, 'triangle', [1320, 1760, 2640], c.t, 0.7, 0.08);
      noise(c, c.t, 0.14, 0.2, 'highpass', 3500, 9000);
      tone(c, 'sine', 330, c.t, 0.5, 0.2, 220);
      bells(c, [1760, 2349], 0.07, 0.4, 0.07, c.t + 0.05);
    },
    item_box(c) {
      arp(c, 'triangle', [1047, 1319, 1568, 2093, 2637], 0.035, 0.14, 0.18);
      bells(c, [2093], 0, 0.5, 0.06, c.t + 0.1);
    },
    roulette(c) {           // decelerating ticks while the slot spins
      let t = c.t, gap = 0.045;
      for (let i = 0; i < 22 && t < c.t + 1.9; i++) {
        const f = 1100 + (i % 5) * 160;
        tone(c, 'square', f, t, 0.025, 0.07);
        tone(c, 'sine', f * 2, t, 0.02, 0.04);
        t += gap;
        gap *= 1.09;
      }
    },
    item_get(c) {           // roulette lands
      seq(c, 'triangle', [660, 880, 1100], 0.065, 0.14, 0.2);
      bells(c, [1319, 1760], 0.08, 0.5, 0.1, c.t + 0.14);
    },
    item_drop(c) {
      tone(c, 'triangle', 700, c.t, 0.12, 0.2, 350);
      noise(c, c.t, 0.08, 0.2, 'lowpass', 500);
    },
    throw(c) {
      noise(c, c.t, 0.28, 0.3, 'bandpass', 1000, 280, 1.5);
      tone(c, 'triangle', 640, c.t, 0.22, 0.16, 200);
      tone(c, 'sine', 160, c.t, 0.1, 0.2, 80);
    },
    drop(c) {
      tone(c, 'triangle', 500, c.t, 0.15, 0.2, 150);
      noise(c, c.t, 0.1, 0.25, 'lowpass', 400);
      tone(c, 'sine', 90, c.t + 0.08, 0.12, 0.2, 60);
    },
    shell_hit(c) {
      tone(c, 'sine', 160, c.t, 0.28, 0.5, 45);
      tone(c, 'square', 300, c.t, 0.35, 0.16, 80);
      noise(c, c.t, 0.32, 0.5, 'lowpass', 2400, 200);
      noise(c, c.t, 0.04, 0.4, 'highpass', 4000);
      fm(c, 700, 1.41, 1.2, c.t, 0.25, 0.1);
    },
    banana_hit(c) {         // squish + slip whistle
      tone(c, 'sine', 280, c.t, 0.16, 0.34, 90);
      tone(c, 'sine', 420, c.t + 0.02, 0.12, 0.2, 140);
      noise(c, c.t, 0.1, 0.3, 'lowpass', 900, 200);
      tone(c, 'triangle', 1400, c.t + 0.08, 0.38, 0.14, 320);
      tone(c, 'square', 700, c.t, 0.12, 0.08, 300);
    },
    spin(c) {
      tone(c, 'triangle', 1000, c.t, 0.6, 0.2, 240);
      tone(c, 'triangle', 1018, c.t, 0.6, 0.08, 245);
      tone(c, 'sine', 500, c.t, 0.6, 0.12, 120);
      for (let i = 0; i < 4; i++) tone(c, 'sine', 700 - i * 100, c.t + i * 0.12, 0.08, 0.06);
    },
    explosion(c) {
      noise(c, c.t, 1.0, 0.95, 'lowpass', 2600, 55, 0.8);
      tone(c, 'sine', 95, c.t, 0.9, 0.9, 28);
      tone(c, 'sine', 55, c.t + 0.02, 1.1, 0.7, 24);
      noise(c, c.t, 0.06, 0.8, 'highpass', 3000);
      noise(c, c.t + 0.18, 0.6, 0.35, 'bandpass', 500, 120, 1.2);
      tone(c, 'sawtooth', 130, c.t, 0.5, 0.18, 40);
    },
    boost(c) {              // whoosh
      noise(c, c.t, 0.95, 0.4, 'bandpass', 300, 3600, 2, 0.08);
      noise(c, c.t, 0.6, 0.2, 'highpass', 2000, 7000, 0.7, 0.1);
      tone(c, 'sawtooth', 130, c.t, 0.8, 0.07, 640);
      tone(c, 'sine', 90, c.t, 0.25, 0.3, 55);
    },
    mini_turbo1(c) {
      const lvl = clamp(S._driftPeak || 1, 1, 3);
      const f0 = 300 * (1 + (lvl - 1) * 0.25);
      tone(c, 'square', f0, c.t, 0.22, 0.12, f0 * 4.2);
      tone(c, 'sine', f0 * 2, c.t, 0.2, 0.12, f0 * 8);
      noise(c, c.t, 0.35 + lvl * 0.1, 0.22, 'bandpass', 500, 4200 + lvl * 800, 2, 0.04);
      tone(c, 'sine', 100, c.t, 0.12, 0.3, 55);
      if (lvl >= 2) bells(c, [1319 * (lvl === 3 ? 1.26 : 1)], 0, 0.4, 0.08, c.t + 0.08);
      if (lvl >= 3) noise(c, c.t, 0.4, 0.15, 'highpass', 3000, 9000);
    },
    mini_turbo2(c) { SFX.mini_turbo1(c); tone(c, 'square', 450, c.t + 0.05, 0.28, 0.1, 2000); },
    mini_turbo3(c) { SFX.mini_turbo1(c); tone(c, 'square', 600, c.t + 0.05, 0.3, 0.1, 2600); },
    drift_start(c) {
      noise(c, c.t, 0.34, 0.2, 'bandpass', 2600, 1800, 5, 0.03);
      tone(c, 'sine', 260, c.t, 0.1, 0.16, 520);
    },
    charge(c) {             // drift charge level reached
      bells(c, [1319, 1760], 0.05, 0.28, 0.1);
      noise(c, c.t, 0.08, 0.12, 'highpass', 6000);
    },
    hop(c) {
      tone(c, 'triangle', 220, c.t, 0.16, 0.26, 560);
      tone(c, 'sine', 90, c.t, 0.07, 0.22, 60);
    },
    swap(c) {
      tone(c, 'triangle', 700, c.t, 0.1, 0.2, 450);
      tone(c, 'triangle', 450, c.t + 0.09, 0.1, 0.2, 700);
      noise(c, c.t, 0.2, 0.1, 'bandpass', 900, 2400, 3);
    },
    bump(c) {
      noise(c, c.t, 0.16, 0.45, 'lowpass', 500);
      tone(c, 'sine', 130, c.t, 0.17, 0.5, 52);
      tone(c, 'square', 330, c.t, 0.05, 0.08, 180);
    },
    wall(c) {
      tone(c, 'sine', 95, c.t, 0.2, 0.55, 45);
      noise(c, c.t, 0.14, 0.5, 'lowpass', 350);
      noise(c, c.t + 0.02, 0.18, 0.13, 'bandpass', 1800, 700, 2);
    },
    lap(c) {
      seq(c, 'square', [523, 659, 784, 1046], 0.075, 0.13, 0.1);
      bells(c, [1046, 1318, 1568, 2093], 0.075, 0.5, 0.09);
      noise(c, c.t + 0.3, 0.2, 0.1, 'highpass', 7000);
    },
    final_lap(c) {
      seq(c, 'square', [523, 659, 784, 1046, 1318], 0.095, 0.17, 0.1);
      seq(c, 'sawtooth', [262, 330, 392, 523, 659], 0.095, 0.17, 0.06);
      chord(c, 'triangle', [1046, 1318, 1568], c.t + 0.5, 0.8, 0.12);
      bells(c, [2093, 2637], 0.08, 0.7, 0.1, c.t + 0.5);
      noise(c, c.t + 0.5, 0.9, 0.18, 'highpass', 5000, 9000, 0.7, 0.01);
      tone(c, 'sine', 80, c.t + 0.5, 0.5, 0.3, 50);
    },
    finish(c) {
      seq(c, 'square', [392, 523, 659, 784], 0.13, 0.15, 0.1);
      seq(c, 'sawtooth', [196, 262, 330, 392], 0.13, 0.15, 0.06);
      for (const f of [523, 659, 784, 1046]) tone(c, 'square', f, c.t + 0.62, 1.1, 0.07, null, 0.02);
      for (const f of [262, 392]) tone(c, 'sawtooth', f, c.t + 0.62, 1.1, 0.06, null, 0.02);
      bells(c, [1568, 2093, 2637], 0.06, 0.9, 0.08, c.t + 0.64);
      noise(c, c.t + 0.62, 1.2, 0.2, 'highpass', 5500, 9000, 0.7, 0.01);
      tone(c, 'sine', 98, c.t + 0.62, 0.6, 0.35, 55);
    },
    star(c) {
      arp(c, 'triangle', [1319, 1568, 2093, 2637, 2093, 2637, 3136], 0.045, 0.15, 0.13);
      bells(c, [2637, 3136], 0.06, 0.5, 0.06, c.t + 0.15);
    },
    lightning(c) {
      noise(c, c.t, 0.05, 0.9, 'highpass', 5000);
      noise(c, c.t, 0.45, 0.6, 'highpass', 2200, 7000);
      tone(c, 'square', 1500, c.t, 0.35, 0.18, 90);
      noise(c, c.t + 0.05, 1.2, 0.7, 'lowpass', 900, 60, 0.9, 0.05);
      tone(c, 'sine', 70, c.t + 0.04, 1.0, 0.7, 30);
      // shrink zap: descending stepped square
      for (let i = 0; i < 6; i++) tone(c, 'square', 1800 - i * 220, c.t + 0.3 + i * 0.05, 0.05, 0.08);
    },
    shrink(c) {
      for (let i = 0; i < 6; i++) tone(c, 'square', 1800 - i * 220, c.t + i * 0.05, 0.05, 0.09);
      tone(c, 'triangle', 900, c.t, 0.4, 0.12, 120);
    },
    fall(c) {
      tone(c, 'triangle', 700, c.t, 0.8, 0.28, 70);
      tone(c, 'sine', 350, c.t + 0.05, 0.75, 0.15, 40);
      noise(c, c.t + 0.7, 0.25, 0.4, 'lowpass', 300);
    },
    heart(c) {
      seq(c, 'sine', [880, 1175, 1568], 0.09, 0.22, 0.28);
      bells(c, [1760], 0, 0.6, 0.06, c.t + 0.2);
    },
    fireball(c) {
      noise(c, c.t, 0.5, 0.3, 'bandpass', 400, 1600, 1.2, 0.04);
      tone(c, 'sawtooth', 200, c.t, 0.45, 0.06, 120);
      noise(c, c.t, 0.2, 0.15, 'highpass', 3500);
    },
    egg(c) {
      tone(c, 'triangle', 300, c.t, 0.12, 0.25, 900);
      tone(c, 'triangle', 900, c.t + 0.12, 0.14, 0.2, 400);
    },
    coin_bonus(c) {
      tone(c, 'square', 988, c.t, 0.1, 0.12);
      tone(c, 'square', 1319, c.t + 0.06, 0.2, 0.12);
      bells(c, [1976], 0, 0.3, 0.05, c.t + 0.06);
    },
    splash(c) {
      noise(c, c.t, 0.6, 0.55, 'bandpass', 1600, 350, 1.1, 0.01);
      noise(c, c.t, 0.25, 0.3, 'highpass', 4000, 1500);
      for (let i = 0; i < 4; i++) tone(c, 'sine', 600 + rnd() * 900, c.t + 0.06 + i * 0.07, 0.1, 0.07, 1400 + rnd() * 600);
    },
    ice(c) {
      arp(c, 'sine', [2093, 2637, 3136, 2637], 0.035, 0.18, 0.11);
      noise(c, c.t, 0.12, 0.2, 'highpass', 6000);
    },
    cannon(c) {
      tone(c, 'sawtooth', 110, c.t, 0.4, 0.2, 520);
      noise(c, c.t, 0.55, 0.45, 'lowpass', 1100, 160, 0.9);
      tone(c, 'sine', 80, c.t, 0.4, 0.55, 36);
      noise(c, c.t + 0.2, 0.5, 0.2, 'bandpass', 600, 3200, 2, 0.1);
    },
    slipstream(c) {
      noise(c, c.t, 0.75, 0.22, 'bandpass', 900, 4200, 2.5, 0.05);
      tone(c, 'triangle', 420, c.t, 0.6, 0.07, 940);
    },
    slap(c) {
      noise(c, c.t, 0.08, 0.5, 'highpass', 1500);
      tone(c, 'square', 220, c.t, 0.12, 0.14, 90);
      tone(c, 'sine', 120, c.t, 0.1, 0.3, 60);
    },
    rescue(c) {
      seq(c, 'sine', [523, 659, 784, 1046, 1318], 0.09, 0.22, 0.18);
      noise(c, c.t, 0.5, 0.12, 'bandpass', 700, 1400, 3);
      bells(c, [2093], 0, 0.7, 0.06, c.t + 0.4);
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
    shine_get(c) {
      arp(c, 'triangle', [1568, 2093, 2637, 3136], 0.05, 0.16, 0.14);
      bells(c, [3136], 0, 0.8, 0.07, c.t + 0.2);
    },
    shine_lost(c) {
      tone(c, 'triangle', 880, c.t, 0.6, 0.22, 220);
      tone(c, 'sine', 440, c.t + 0.1, 0.5, 0.1, 110);
    },
    bomb_fuse(c) {
      noise(c, c.t, 0.9, 0.12, 'highpass', 4000);
      for (let i = 0; i < 8; i++) tone(c, 'square', 2400 + (i & 1) * 200, c.t + i * 0.11, 0.02, 0.06);
    },
    crowd(c) {
      noise(c, c.t, 1.7, 0.3, 'bandpass', 900, 700, 0.8, 0.3);
      noise(c, c.t + 0.1, 1.5, 0.2, 'bandpass', 1500, 1100, 0.7, 0.3);
      noise(c, c.t + 0.05, 1.3, 0.14, 'highpass', 3000, null, 0.7, 0.3);
    },
    unlock(c) {
      arp(c, 'triangle', [659, 880, 1175, 1319, 1760], 0.06, 0.2, 0.13);
      bells(c, [2637], 0, 0.8, 0.06, c.t + 0.3);
    },
    cheer(c) {
      SFX.crowd(c);
      seq(c, 'square', [523, 659, 784], 0.1, 0.14, 0.08);
      bells(c, [1046, 1318, 1568], 0.1, 0.5, 0.06);
    },
    // ---- extras
    boing(c) {              // hazard launch
      tone(c, 'sine', 140, c.t, 0.5, 0.45, 520);
      tone(c, 'triangle', 180, c.t, 0.45, 0.2, 700);
      tone(c, 'sine', 60, c.t, 0.12, 0.5, 40);
      noise(c, c.t, 0.18, 0.2, 'lowpass', 1500, 300);
    },
    clink(c) {              // shell ricochet
      fm(c, 2100, 2.9, 1.0, c.t, 0.18, 0.2);
      fm(c, 3300, 3.1, 0.8, c.t + 0.01, 0.12, 0.1);
      noise(c, c.t, 0.02, 0.2, 'highpass', 7000);
    },
    whoosh(c) {
      noise(c, c.t, 0.6, 0.25, 'bandpass', 500, 2600, 1.5, 0.12);
    },
    swell(c) {              // crowd swell for lap / overtakes
      noise(c, c.t, 1.4, 0.2, 'bandpass', 1000, 1400, 0.8, 0.5);
      noise(c, c.t, 1.2, 0.1, 'highpass', 3500, null, 0.7, 0.5);
    },
    key_up(c) {
      noise(c, c.t, 0.7, 0.2, 'bandpass', 400, 5000, 2, 0.2);
      tone(c, 'sawtooth', 200, c.t, 0.6, 0.05, 800, 0.3);
    },
  };
  SFX.mini_turbo = SFX.mini_turbo1; // alias
  S.hasSfx = (n) => hasOwn(SFX, n);

  const WET = {
    menu_move: 0.04, menu_select: 0.14, menu_back: 0.1, countdown: 0.1, go: 0.26, lap: 0.26, final_lap: 0.32, finish: 0.36,
    explosion: 0.34, cheer: 0.18, star: 0.26, item_get: 0.22, item_box: 0.16, unlock: 0.28, lightning: 0.4, boing: 0.12,
    clink: 0.18, shell_hit: 0.16, charge: 0.18, shine_get: 0.3, rescue: 0.25, heart: 0.2, cannon: 0.2, crowd: 0.1, boost: 0.1,
    bump: 0.04, wall: 0.04, hop: 0.04, drift_start: 0.04, roulette: 0.04, throw: 0.04, drop: 0.04,
  };
  // [duck amount, hold s, release s]
  const DUCK = {
    explosion: [0.42, 0.35, 0.7], shell_hit: [0.58, 0.2, 0.5], lightning: [0.28, 0.5, 1.0], spin: [0.74, 0.15, 0.4],
    go: [0.6, 0.3, 0.5], lap: [0.7, 0.25, 0.5], final_lap: [0.5, 0.6, 0.8], finish: [0.42, 0.9, 1.0], cannon: [0.66, 0.2, 0.5],
    banana_hit: [0.74, 0.15, 0.4], fall: [0.7, 0.25, 0.5], star: [0.74, 0.2, 0.4], unlock: [0.7, 0.3, 0.5], shine_lost: [0.7, 0.2, 0.4],
    shine_get: [0.7, 0.2, 0.4], slap: [0.8, 0.1, 0.3], boost: [0.82, 0.2, 0.4], bump: [0.82, 0.1, 0.3], boing: [0.74, 0.2, 0.4],
    chomp: [0.7, 0.2, 0.4], countdown: [0.78, 0.15, 0.3],
  };


  // per-sound loudness trim (measured: brings every effect's peak into the same neighbourhood)
  const LEVEL = {
    menu_move: 1.55, menu_select: 2.0, menu_back: 2.1, menu_locked: 3, countdown: 1.3, go: 1.25, item_box: 1.45, roulette: 3,
    item_get: 1.45, throw: 1.4, drop: 2, shell_hit: 1.13, banana_hit: 1.4, spin: 1.45, explosion: 1.1, boost: 1.5, drift_start: 1.9,
    charge: 2, hop: 1.1, swap: 1.6, wall: 1.05, lap: 1.5, final_lap: 1.2, finish: 1.25, star: 2.2, lightning: 1.3, fall: 1.5,
    heart: 1.6, fireball: 2, egg: 1.45, coin_bonus: 2.1, splash: 1.3, ice: 1.4, cannon: 1.15, slipstream: 3, slap: 0.85,
    rescue: 2.1, chomp: 1.9, balloon_pop: 0.87, shine_get: 2.3, shine_lost: 1.9, bomb_fuse: 2, crowd: 1.4, unlock: 2.6, cheer: 1.6,
    boing: 1.07, clink: 1.25, whoosh: 3, swell: 1.7, key_up: 3, shrink: 1.85,
  };

  function flushPending() {
    if (!pending.length) return;
    const now = performance.now();
    const list = pending;
    pending = [];
    for (const p of list) if (now - p.at < 650) doPlay(p.name, p.opts);
  }

  function doPlay(name, opts) {
    const build = SFX[name];
    const now = performance.now();
    const last = lastPlayed[name];
    if (last !== undefined && now - last < MIN_GAP_MS) return;
    if (voices >= MAX_VOICES) return;
    let sp = null;
    if (opts && opts.x != null && opts.z != null && L.set) {
      sp = spatial(opts.x, opts.z);
      if (!sp || sp.g < 0.025) return;
    }
    lastPlayed[name] = now;
    const v = { n: 1 }; // sentinel held during build
    voices++;
    const out = outChain(sp, WET[name] !== undefined ? WET[name] : 0.08, sfxIn);
    const c = {
      v,
      t: ctx.currentTime + 0.005,
      vol: (opts && opts.volume != null ? opts.volume : 1) * (LEVEL[name] || 1),
      p: opts && opts.pitch ? opts.pitch : 1,
      bus: out,
    };
    try {
      build(c);
    } catch (e) {
      // never let a sound break the game
    } finally {
      if (--v.n === 0) voices--;
    }
    const dk = DUCK[name];
    if (dk) duck(dk[0], dk[1], dk[2], sp ? sp.g : null);
  }

  // opts: { volume, pitch, x, z }   (x,z world position -> panned + distance attenuated)
  S.play = function (name, opts) {
    if (failed || muted) return;
    if (!hasOwn(SFX, name)) return;
    if (!ready || !running) {
      if (pending.length < 8) pending.push({ name, opts, at: performance.now() });
      return;
    }
    doPlay(name, opts);
  };
  S.play3D = function (name, x, z, opts) {
    const o = Object.assign({}, opts || {});
    o.x = x; o.z = z;
    S.play(name, o);
  };

  // short rising swoosh used for the final-lap key change
  function riser() {
    if (!ready || !running) return;
    doPlay('key_up', null);
  }

  // ---------- character voices ("yips") ----------
  // Each character id maps to a profile: weight sets the base pitch (heavy low, light high),
  // the id hash picks the vowel and small tuning, and a few archetypes change the timbre.
  const ARCHETYPE = { wisp: 'ghost', thorn: 'plant', sprout: 'plant' };
  // Vowel formants [F1, F2] (Hz): a, e, i, o, u
  const VOWELS = [[730, 1090], [530, 1840], [270, 2290], [570, 840], [440, 1020]];
  // Syllables per kind: [duration s, pitch glide ratio]
  const YIP = {
    select: [[0.11, 1.35], [0.16, 1.5]],
    hit: [[0.16, 0.6], [0.14, 0.7]],
    boost: [[0.14, 1.4], [0.2, 1.7]],
    item: [[0.09, 1.6], [0.09, 1.2]],
    win: [[0.12, 1.3], [0.12, 1.5], [0.2, 1.8]],
    lose: [[0.2, 0.55], [0.22, 0.45]],
    swap: [[0.08, 1.4], [0.08, 0.8]],
    taunt: [[0.1, 1.2], [0.1, 0.9], [0.1, 1.25], [0.2, 0.8]],
    overtake: [[0.09, 1.3], [0.12, 1.7]],
    oops: [[0.08, 0.8], [0.2, 0.5]],
    cheer: [[0.1, 1.4], [0.1, 1.2], [0.16, 1.9]],
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

    const fm_ = VOWELS[vowel % VOWELS.length];
    const b1 = ctx.createBiquadFilter();
    b1.type = 'bandpass';
    b1.frequency.value = fm_[0] * p.scale;
    b1.Q.value = p.q;
    const b2 = ctx.createBiquadFilter();
    b2.type = 'bandpass';
    b2.frequency.value = fm_[1] * p.scale;
    b2.Q.value = p.q;
    const g1 = ctx.createGain();
    g1.gain.value = 1.6;
    const g2 = ctx.createGain();
    g2.gain.value = 0.8;
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

  // Per-character gibberish call. kind: select|hit|boost|item|win|lose|swap|taunt|overtake|oops|cheer
  // opts: {volume, x, z}
  S.voice = function (charId, kind, opts) {
    if (failed || muted || !ready || !running) return;
    if (!hasOwn(YIP, kind)) return;
    const key = String(charId);
    const now = performance.now();
    const last = lastVoice[key];
    if (last !== undefined && now - last < VOICE_GAP_MS) return;
    if (now - lastVoiceAny < VOICE_GLOBAL_GAP_MS && kind !== 'win' && kind !== 'lose' && kind !== 'select') return;
    if (voices >= MAX_VOICES) return;
    let sp = null;
    if (opts && opts.x != null && opts.z != null && L.set) {
      sp = spatial(opts.x, opts.z);
      if (!sp || sp.g < 0.06) return;
    }
    lastVoice[key] = now;
    lastVoiceAny = now;

    const p = charProfile(key);
    const seqs = YIP[kind];
    const v = { n: 1 };
    voices++;
    const out = outChain(sp, 0.14, voiceBus);
    const c = {
      v,
      t: ctx.currentTime + 0.005,
      vol: (opts && opts.volume != null ? opts.volume : 1) * 0.9,
      p: 1,
      bus: out,
    };
    try {
      let t = c.t;
      for (let i = 0; i < seqs.length; i++) {
        const dur = seqs[i][0];
        const ratio = seqs[i][1];
        const f0 = p.pitch * PITCH_MUL[i & 3];
        syll(c, t, dur, f0, f0 * ratio, p.vowel + i * 2, p, 0.5);
        if (p.arche !== 'plant') noise(c, t, 0.03, 0.1, 'bandpass', 1800, null, 2);
        t += dur * 0.9;
      }
    } catch (e) {
      // never let a sound break the game
    } finally {
      if (--v.n === 0) voices--;
    }
    if (kind === 'win' || kind === 'select') duck(0.8, 0.2, 0.4, sp ? sp.g : null);
  };

  // ---------- persistent per-player voice: engine + surface layers + squeal + charge hum ----------
  function mkNoiseSrc() {
    const rs = ctx.createBufferSource();
    rs.buffer = noiseBuf;
    rs.loop = true;
    return rs;
  }
  function branch(src, ftype, f, q, dest, gain) {
    const flt = ctx.createBiquadFilter();
    flt.type = ftype;
    flt.frequency.value = f;
    flt.Q.value = q || 0.7;
    const g = ctx.createGain();
    g.gain.value = gain || 0;
    src.connect(flt);
    flt.connect(g);
    g.connect(dest);
    return { flt, g };
  }

  function ensureEngine(i) {
    const t = ctx.currentTime;
    const pn = ctx.createStereoPanner();
    pn.pan.value = 0;
    pn.connect(engineBus);
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = 55;
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.value = 55;
    o2.detune.value = 9 + i * 4;
    const o3 = ctx.createOscillator();      // sub body
    o3.type = 'sine';
    o3.frequency.value = 27;
    const sq = ctx.createGain();
    sq.gain.value = 0.3;
    const sub = ctx.createGain();
    sub.gain.value = 0.8;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2.5;
    lp.frequency.value = 400;
    const g = ctx.createGain();
    g.gain.value = 0;
    o1.connect(lp);
    o2.connect(sq);
    sq.connect(lp);
    lp.connect(g);
    o3.connect(sub);
    sub.connect(g);
    g.connect(pn);

    // wobble LFO (Hz depth added to the oscillators)
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 5.5 + i * 0.4;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 2.2;
    lfo.connect(lfoG);
    lfoG.connect(o1.frequency);
    lfoG.connect(o2.frequency);

    // noise-based layers
    const ns = mkNoiseSrc();
    const rough = branch(ns, 'lowpass', 170, 0.7, pn);          // offroad rumble
    const sand = branch(ns, 'highpass', 3600, 0.6, pn);         // sand hiss
    const water = branch(ns, 'bandpass', 950, 0.9, pn);         // water wash (tremolo stage sits before the level gain)
    water.g.disconnect();
    const wam = ctx.createGain(); wam.gain.value = 0.6;
    water.g.connect(wam); wam.connect(pn);
    const wlfo = ctx.createOscillator(); wlfo.frequency.value = 3.1;
    const wlg = ctx.createGain(); wlg.gain.value = 0.4;
    wlfo.connect(wlg); wlg.connect(wam.gain);
    const ice = branch(ns, 'bandpass', 4300, 14, pn);           // ice creak
    const squealN = branch(ns, 'bandpass', 2600, 9, pn);        // tire squeal (noise)
    const sqo = ctx.createOscillator();                         // squeal tone
    sqo.type = 'sawtooth';
    sqo.frequency.value = 1300;
    const sqlfo = ctx.createOscillator(); sqlfo.frequency.value = 9;
    const sqlg = ctx.createGain(); sqlg.gain.value = 40;
    sqlfo.connect(sqlg); sqlg.connect(sqo.frequency);
    const sqbp = ctx.createBiquadFilter(); sqbp.type = 'bandpass'; sqbp.frequency.value = 2500; sqbp.Q.value = 6;
    const sqg = ctx.createGain(); sqg.gain.value = 0;
    sqo.connect(sqbp); sqbp.connect(sqg); sqg.connect(pn);
    // blue-spark charge hum
    const ho = ctx.createOscillator(); ho.type = 'sine'; ho.frequency.value = 440;
    const ho2 = ctx.createOscillator(); ho2.type = 'triangle'; ho2.frequency.value = 441.5;
    const hlfo = ctx.createOscillator(); hlfo.frequency.value = 12;
    const hlg = ctx.createGain(); hlg.gain.value = 0.3;
    const hg = ctx.createGain(); hg.gain.value = 0;
    const ham = ctx.createGain(); ham.gain.value = 0.7;
    hlfo.connect(hlg); hlg.connect(ham.gain);
    ho.connect(ham); ho2.connect(ham); ham.connect(hg); hg.connect(pn);

    [o1, o2, o3, lfo, wlfo, sqo, sqlfo, ho, ho2, hlfo].forEach((o) => o.start(t));
    ns.start(t, Math.random() * 1.0);
    engs[i] = { o1, o2, o3, lp, g, pn, rg: rough.g, sg: sand.g, wg: water.g, ig: ice.g, sqg, sqn: squealN.g, sqo, sqbp, ho, ho2, hg, hlfo, drift: 0, lvl: 0 };
  }

  let updSeen = false, liveState = true;
  const ENG_GAIN = 1.0;

  // Called every frame per player: only sets AudioParam targets (creates nodes once per slot).
  // Engines heard at the same time are mixed quieter (1/sqrt(n)).
  S.setEngine = function (speed01, boosting, onRoad, playerIndex) {
    if (!ready || !running) return;
    if (updSeen && !liveState) return;
    const i = clampIdx(playerIndex);
    if (!engs[i]) ensureEngine(i);
    const e = engs[i];
    const now = ctx.currentTime;
    engSeen[i] = now;
    let n = 0;
    for (let k = 0; k < MAX_ENGINES; k++) {
      if (engs[k] && now - engSeen[k] < ENG_ACTIVE_S) n++;
    }
    const mix = (n > 1 ? 1 / Math.sqrt(n) : 1) * ENG_GAIN;
    const s = clamp(speed01 || 0, 0, 1.3);
    const f = (52 + s * 120) * (boosting ? 1.16 : 1);
    e.o1.frequency.setTargetAtTime(f, now, 0.06);
    e.o2.frequency.setTargetAtTime(f, now, 0.06);
    e.o3.frequency.setTargetAtTime(f * 0.5, now, 0.06);
    e.lp.frequency.setTargetAtTime(330 + s * 750 + (boosting ? 600 : 0), now, 0.1);
    e.g.gain.setTargetAtTime((0.026 + s * 0.03 + (boosting ? 0.014 : 0)) * mix, now, 0.08);
    e.rg.gain.setTargetAtTime((onRoad ? 0 : 0.035 + s * 0.05) * mix, now, 0.1);
    engIn[i] = { s, boost: !!boosting, road: !!onRoad };
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
      zeroEngine(e, t);
    }
  };
  function zeroEngine(e, t) {
    e.g.gain.setTargetAtTime(0, t, 0.05);
    e.rg.gain.setTargetAtTime(0, t, 0.05);
    e.sg.gain.setTargetAtTime(0, t, 0.05);
    e.wg.gain.setTargetAtTime(0, t, 0.05);
    e.ig.gain.setTargetAtTime(0, t, 0.05);
    e.sqg.gain.setTargetAtTime(0, t, 0.04);
    e.sqn.gain.setTargetAtTime(0, t, 0.04);
    e.hg.gain.setTargetAtTime(0, t, 0.04);
  }

  // ---------- shared persistent voices: wind, traffic engines, shell hums, star loop ----------
  let wind = null, traffic = null, shellV = null;
  function ensureWind() {
    if (wind) return;
    const t = ctx.currentTime;
    const g = ctx.createGain(); g.gain.value = 0; g.connect(engineBus);
    const a = mkNoiseSrc(), b = mkNoiseSrc();
    const fa = branch(a, 'bandpass', 900, 0.8, g, 1);
    const fb = branch(b, 'bandpass', 900, 0.8, g, 1);
    const pa = ctx.createStereoPanner(); pa.pan.value = -0.7;
    const pb = ctx.createStereoPanner(); pb.pan.value = 0.7;
    // re-route each branch through its panner
    fa.g.disconnect(); fa.g.connect(pa); pa.connect(g);
    fb.g.disconnect(); fb.g.connect(pb); pb.connect(g);
    a.start(t, 0.1); b.start(t, 0.9);
    wind = { g, fa: fa.flt, fb: fb.flt };
  }

  function ensureTraffic() {
    if (traffic) return;
    traffic = [];
    const t = ctx.currentTime;
    for (let i = 0; i < N_TRAFFIC; i++) {
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 60;
      const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 60.7;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 2;
      const g = ctx.createGain(); g.gain.value = 0;
      const pn = ctx.createStereoPanner(); pn.pan.value = 0;
      o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(pn); pn.connect(engineBus);
      o1.start(t); o2.start(t);
      traffic.push({ o1, o2, lp, g, pn });
    }
  }

  function ensureShells() {
    if (shellV) return;
    shellV = [];
    const t = ctx.currentTime;
    for (let i = 0; i < N_SHELLS; i++) {
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 200;
      const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 402;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 14;
      const lg = ctx.createGain(); lg.gain.value = 0.35;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 1.5;
      const g = ctx.createGain(); g.gain.value = 0;
      const pn = ctx.createStereoPanner();
      const am = ctx.createGain(); am.gain.value = 0.7;
      lg.gain.value = 0.3;
      lfo.connect(lg); lg.connect(am.gain);
      o1.connect(lp); o2.connect(lp); lp.connect(am); am.connect(g); g.connect(pn); pn.connect(engineBus);
      o1.start(t); o2.start(t); lfo.start(t);
      shellV.push({ o1, o2, lp, g, pn, lfo });
    }
  }

  // star power jingle loop (scheduled by the music tick, own tiny sequencer)
  const star = { on: false, next: 0, step: 0, out: null };
  const STAR_NOTES = [84, 88, 91, 96, 91, 88, 84, 79, 86, 90, 93, 98, 93, 90, 86, 81];
  function tickStar() {
    if (!star.on || !running || muted) return;
    if (!star.out) {
      star.out = ctx.createGain(); star.out.gain.value = 1;
      const pn = ctx.createStereoPanner(); pn.pan.value = 0.1;
      star.out.connect(pn); pn.connect(voiceBus);
      const s2 = ctx.createGain(); s2.gain.value = 0.35; star.out.connect(s2); s2.connect(sRevIn);
    }
    const now = ctx.currentTime;
    if (star.next < now) star.next = now + 0.03;
    const sd = 60 / 168 / 4;
    let guard = 40;
    while (star.next < now + LOOKAHEAD && guard-- > 0) {
      const st = star.step, t = star.next;
      const m = STAR_NOTES[st & 15] + (st & 32 ? 2 : 0);
      if (st % 2 === 0 || st % 4 === 3) {
        note(star.out, 'bell', m, t, sd * 2, 0.05);
        if (st % 4 === 0) note(star.out, 'square', m - 12, t, sd * 1.5, 0.018);
      }
      if (st % 4 === 0) note(star.out, 'triangle', 48 + ((st >> 2) & 1) * 7, t, sd * 3, 0.07);
      if (st % 2 === 1) noiseHit(star.out, t, 0.03, 0.03, 'highpass', 8000);
      star.next += sd;
      star.step++;
    }
  }

  // ---------- music ----------
  // Melody tokens: MIDI number = note onset, '.' = rest onset, '-' = sustain previous (one 16th).
  // Each mel line is one bar of 16 tokens (12 when spb:12). Chords are semitone offsets from
  // base = tonic - 12. Bass pattern: r root, f fifth, o octave, t third, . rest (one char per 16th).
  // Arp pattern: digit = chord tone index, . rest. Drum chars: see DRUM.
  // Theme fields: bpm, tonic, chords, mel, lead{w,v}, bassI{w,v,p}, pad{w,v,every}?, arp{w,v,p,oct}?,
  // drums{key:pattern}, spb (steps per bar, default 16), swing (0..0.3, delays odd 16ths),
  // comp (false to disable the chord-stab layer), fan (intro fanfare), counter{w,v}?
  // The generic arranger adds (all procedural): default strings pad, counter-melody and octave-doubled
  // lead on "full" 4-bar sections, offbeat chord comping, open hats, tom/snare fills at phrase ends and
  // crash cymbals, stereo placement, reverb/delay sends.
  const THEMES = {
    menu: { // catchy bright major pop-rock hook: G - D - Em - C
      bpm: 126, tonic: 67,
      chords: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]],
      mel: [
        '79 - 74 - 76 79 - 76 74 - 71 - 74 - - -',
        '78 - 74 - 76 78 - 81 78 - 74 - 73 - 74 -',
        '79 - 76 - 79 83 - 79 76 - 79 - 83 - - -',
        '81 - 79 - 76 - 72 - 74 - 76 79 - - - -',
        '86 - 83 - 79 83 - 86 83 - 79 - 83 - - -',
        '85 - 81 - 78 81 - 85 81 - 78 - 81 - 78 -',
        '83 - 79 - 76 79 - 83 79 - 76 - 79 - 83 -',
        '84 - 81 - 77 81 - 84 83 - 79 - 74 - 79 -',
      ],
      lead: { w: 'square', v: 0.06 },
      arp: { w: 'pluck', v: 0.04, p: '0.1.2.1.0.1.2.1.', oct: 12 },
      bassI: { w: 'triangle', v: 0.17, p: 'r..r..r.r..r.f..' },
      pad: { w: 'strings', v: 0.022, every: 16 },
      counter: { w: 'bell', v: 0.04 },
      drums: { k: 'x.....x...x.x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', c: '....o.......o.o.' },
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
      comp: false,
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
      fan: true,
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
      comp: false,
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
      comp: false,
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
      comp: false,
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
      comp: false,
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
      fan: true,
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

  const COMPS = ['.....x.....x..x.', '..x...x...x...x.', '.x..x..x.x..x...', '...x.......x..x.'];

  // Map legacy fields to the generic schema and precompute melody/pattern lookups.
  function prepTheme(th, name) {
    if (th.prepared) return th;
    th.prepared = true;
    th.spb = th.spb || 16;
    th.lead = th.lead || { w: th.leadWave || 'square', v: th.leadVol || 0.06 };
    th.bassI = th.bassI || { w: th.bassWave || 'triangle', v: th.bassVol || 0.15, p: th.bass || 'r...' };
    if (!th.pad && th.padVol) th.pad = { w: 'triangle', v: th.padVol, every: 16 };
    if (!th.pad) th.pad = { w: 'strings', v: 0.03, every: th.spb };
    const dr = th.drums || { k: th.kick, s: th.snare, h: th.hat };
    th.dl = [];
    th.hasHat = false; th.hasSnare = false;
    for (const key of Object.keys(dr)) {
      if (!hasOwn(DRUM, key) || !dr[key]) continue;
      th.dl.push({ key, fn: DRUM[key].fn, vol: DRUM[key].vol, pat: dr[key], len: dr[key].length });
      if (key === 'h' || key === 'z') th.hasHat = true;
      if (key === 's' || key === 'c') th.hasSnare = true;
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
    if (th.comp !== false) {
      th.compPat = th.spb === 12 ? '....x...x...' : COMPS[hashId(name || 'x') % COMPS.length];
    }
    return th;
  }

  // Plain WebAudio oscillator note.
  function plainNote(dest, type, m, t, dur, vol) {
    const o = ctx.createOscillator();
    const e = ctx.createGain();
    o.type = type;
    o.frequency.value = mtof(m);
    e.gain.setValueAtTime(0.0001, t);
    e.gain.linearRampToValueAtTime(vol, t + 0.008);
    e.gain.setValueAtTime(vol, t + Math.max(0.01, dur * 0.4));
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
  function sus(dest, type, f, t, d, peak, att) {
    const o = ctx.createOscillator();
    const e = ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    const a = att || 0.012;
    e.gain.setValueAtTime(0.0001, t);
    e.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + a);
    e.gain.setValueAtTime(Math.max(0.0002, peak), t + Math.max(a, d));
    e.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.08);
    o.connect(e);
    e.connect(dest);
    o.start(t);
    o.stop(t + d + 0.12);
  }

  // Custom instrument voices; plain oscillator types fall through to plainNote.
  const CUSTOM = { steel: 1, bell: 1, organ: 1, brass: 1, pluck: 1, epiano: 1, strings: 1 };
  function note(dest, kind, m, t, dur, vol) {
    if (!hasOwn(CUSTOM, kind)) return plainNote(dest, kind, m, t, dur, vol);
    const f = mtof(m);
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
      case 'strings': { // two detuned saws, slow attack
        const lp = ctx.createBiquadFilter();
        const e = ctx.createGain();
        lp.type = 'lowpass';
        lp.frequency.value = Math.min(2400, f * 5);
        lp.Q.value = 0.5;
        const pk = Math.max(0.0002, vol);
        const at = Math.min(0.2, d * 0.3);
        e.gain.setValueAtTime(0.0001, t);
        e.gain.linearRampToValueAtTime(pk, t + at);
        e.gain.setValueAtTime(pk, t + Math.max(at, d * 0.8));
        e.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.25);
        lp.connect(e);
        e.connect(dest);
        for (let k = 0; k < 2; k++) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = f;
          o.detune.value = k ? 7 : -7;
          o.connect(lp);
          o.start(t);
          o.stop(t + d + 0.3);
        }
        break;
      }
      default:
        break;
    }
  }

  function kick(dest, t, vol) {
    const o = ctx.createOscillator();
    const e = ctx.createGain();
    o.frequency.setValueAtTime(155, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    e.gain.setValueAtTime(vol, t);
    e.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(e);
    e.connect(dest);
    o.start(t);
    o.stop(t + 0.24);
    // click
    noiseHit(dest, t, 0.012, vol * 0.25, 'highpass', 2500);
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
    src.start(t, Math.random() * 1.2);
    src.stop(t + dur + 0.02);
  }

  function snare(dest, t, vol) {
    noiseHit(dest, t, 0.17, vol, 'highpass', 1500);
    plainNote(dest, 'triangle', 45, t, 0.09, vol * 0.8); // 45 midi ~ 110 Hz body
  }

  function clap(dest, t, vol) {
    noiseHit(dest, t, 0.1, vol, 'bandpass', 1400, 1.5);
    noiseHit(dest, t + 0.014, 0.09, vol * 0.7, 'bandpass', 1400, 1.5);
    noiseHit(dest, t + 0.03, 0.16, vol * 0.5, 'bandpass', 1300, 1.2);
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

  function crash(dest, t, vol) {
    noiseHit(dest, t, 1.1, vol, 'highpass', 5200);
    noiseHit(dest, t, 0.6, vol * 0.6, 'bandpass', 8500, 1.2);
  }

  // Drum pattern keys: x = hit, o = soft hit, anything else = silent.
  const DRUM = {
    k: { vol: 0.62, fn: kick, pan: 0 },
    s: { vol: 0.24, fn: snare, pan: 0.04 },
    h: { vol: 0.07, fn: (d, t, v) => noiseHit(d, t, 0.04, v, 'highpass', 7000), pan: 0.3 },
    c: { vol: 0.22, fn: clap, pan: -0.05 },
    t: { vol: 0.32, fn: (d, t, v) => tom(d, t, v, 150), pan: -0.35 },
    T: { vol: 0.32, fn: (d, t, v) => tom(d, t, v, 230), pan: 0.35 },
    a: { vol: 0.24, fn: (d, t, v) => tom(d, t, v, 300, 0.12), pan: -0.45 },   // conga
    z: { vol: 0.09, fn: shaker, pan: 0.38 },
    b: { vol: 0.13, fn: cowbell, pan: 0.5 },
    r: { vol: 0.15, fn: rim, pan: -0.5 },
  };

  // Chord tone helper: indices past the chord wrap up an octave.
  function ci(ch, i) {
    return i < ch.length ? ch[i] : ch[i % ch.length] + 12;
  }

  const DBL = { square: 'pluck', sawtooth: 'bell', triangle: 'steel', brass: 'pluck', pluck: 'bell', steel: 'bell', bell: 'pluck', epiano: 'bell', organ: 'brass', sine: 'bell' };

  function mkLayer(tr, pan, rev, dly, gain) {
    const inn = ctx.createGain();
    inn.gain.value = gain == null ? 1 : gain;
    const pn = ctx.createStereoPanner();
    pn.pan.value = pan;
    inn.connect(pn);
    pn.connect(tr.fD);
    if (rev > 0) { const s = ctx.createGain(); s.gain.value = rev; pn.connect(s); s.connect(tr.fR); }
    if (dly > 0) { const s = ctx.createGain(); s.gain.value = dly; pn.connect(s); s.connect(tr.fY); }
    return inn;
  }

  function schedule(tr, step, t, sd) {
    const th = tr.th, Ly = tr.lay;
    const spb = th.spb;
    const bar = (step / spb) | 0;
    const pos = step % spb;
    const ch = th.chords[bar % th.chords.length];
    const tp = musicBoost ? 2 : 0;
    const base = th.tonic - 12 + tp;
    const full = (bar & 7) >= 2;          // every 8-bar cycle: 2 light intro/breakdown bars, then the full arrangement
    const phrase4 = (bar & 3) === 3;
    const ev = th.melody[step % th.melLen];

    // intro fanfare (results / ceremony)
    if (step === 0 && th.fan) {
      const tn = th.tonic + tp;
      [0, 4, 7, 12, 16].forEach((o, i) => note(Ly.fan, 'brass', tn + o, t + i * 0.09, 1.1 - i * 0.05, 0.075));
      [-12, -5].forEach((o, i) => note(Ly.fan, 'brass', tn + o, t + i * 0.09, 1.2, 0.06));
      tom(Ly.tomL, t, 0.4, 100, 0.5);
      tom(Ly.tomL, t + 0.09, 0.3, 120, 0.4);
      crash(Ly.crash, t + 0.36, 0.1);
    }

    // pad (stereo spread across the chord)
    const pd = th.pad;
    if (pd && pos % pd.every === 0) {
      const n = Math.min(ch.length, 4);
      for (let i = 0; i < n; i++) note(i & 1 ? Ly.padR : Ly.padL, pd.w, base + ch[i], t, sd * pd.every * 0.95, pd.v);
    }

    // bass
    const bp = th.bassI.p;
    const bc = bp.length ? bp[step % bp.length] : '.';
    if (bc !== '.') {
      let m = base + ci(ch, 0);
      if (bc === 'f') m = base + ci(ch, 2);
      else if (bc === 't') m = base + ci(ch, 1);
      else if (bc === 'o') m = base + ci(ch, 0) + 12;
      note(Ly.bass, th.bassI.w, m, t, sd * 0.9, th.bassI.v);
    }

    // arp
    if (th.arp) {
      const ap = th.arp.p;
      const d = ap[step % ap.length];
      if (d !== '.' && d >= '0' && d <= '9') {
        note(Ly.arp, th.arp.w, base + ci(ch, +d) + th.arp.oct, t, sd * 0.9, th.arp.v);
      }
    }

    // lead + octave-doubled lead (full sections)
    if (ev) {
      const m = ev.m + tp;
      note(Ly.lead, th.lead.w, m, t, ev.len * sd * 0.9, th.lead.v);
      if (full) note(Ly.dbl, DBL[th.lead.w] || 'bell', m + 12, t + sd * 0.02, ev.len * sd * 0.7, th.lead.v * 0.4);
    }

    // counter-melody on the off-beats (full sections): chord tones weaving above the bass
    if (full && !ev && pos % 4 === 2 && th.counter !== false) {
      const prev = th.melody[(step + th.melLen - 1) % th.melLen];
      if (!prev || prev.len > 1 || true) {
        const idx = ((pos >> 2) + bar) % ch.length;
        const cw = th.counter ? th.counter.w : (th.lead.w === 'pluck' || th.lead.w === 'bell' ? 'epiano' : 'pluck');
        note(Ly.cnt, cw, base + ch[idx] + 24, t, sd * 2.2, th.counter ? th.counter.v : 0.032);
      }
    }

    // chord comping stabs (offbeat), from the second bar
    if (th.compPat && th.compPat[pos % th.compPat.length] === 'x') {
      const n = Math.min(ch.length, 3);
      for (let i = 0; i < n; i++) note(Ly.comp, 'pluck', base + 12 + ch[i], t, sd * 1.3, 0.024);
    }

    // drums
    const fill = phrase4 && th.dl.length > 1 && bar >= 3;
    const bigFill = fill && (bar & 7) === 7 && th.hasSnare;
    const fillStart = spb - 4;
    const inFill = fill && pos >= fillStart;
    if (inFill) {
      // tom run down the kit, snare/clap on the last hit
      const fi = pos - fillStart;
      const fv = 0.2 + fi * 0.05;
      if (!bigFill) {
        tom(fi & 1 ? Ly.tomR : Ly.tomL, t, fv, [280, 230, 185, 140][fi] || 140, 0.18);
        if (fi === 3 && th.hasSnare) snare(Ly.drum.s || Ly.drums, t, 0.2);
      }
    }
    if (bigFill && pos >= spb - 8) {
      const fi = pos - (spb - 8);
      snare(Ly.drum.s || Ly.drums, t, 0.07 + fi * 0.026);
      if (fi >= 6) tom(Ly.tomL, t, 0.3, 160 - (fi - 6) * 20, 0.2);
    }
    for (let k = 0; k < th.dl.length; k++) {
      const dd = th.dl[k];
      const hc = dd.pat[step % dd.len];
      if (hc !== 'x' && hc !== 'o') continue;
      if (inFill && dd.key !== 'k' && dd.key !== 'z') continue;      // fill replaces the groove (kick keeps going)
      if (inFill && dd.key === 'k' && pos > fillStart + 1) continue;
      let v = dd.vol * (hc === 'o' ? 0.5 : 1);
      if (dd.key === 'h') v *= pos % 4 === 0 ? 1.15 : 0.8;          // hat accents
      v *= 0.94 + rnd() * 0.12;                                      // tiny velocity humanise
      dd.fn(Ly.drum[dd.key] || Ly.drums, t, v);
    }
    // crash at phrase starts, open hats on the "ands" in full sections
    if (pos === 0 && bar > 0 && ((bar & 7) === 0 || (full && (bar & 3) === 0)) && th.dl.length > 1) crash(Ly.crash, t, 0.075);
    if (full && th.hasHat && pos % 4 === 2 && !inFill && th.dl.length > 2) noiseHit(Ly.drum.h || Ly.drums, t, 0.1, 0.035, 'highpass', 6500);
  }

  function stepDur(th) {
    return 60 / (th.bpm * (musicBoost ? 1.08 : 1)) / 4;
  }

  function tick() {
    if (!ctx || !running) return;
    tickStar();
    if (!cur) return;
    const now = ctx.currentTime;
    if (cur.nextTime < now) cur.nextTime = now + 0.05;
    const horizon = now + LOOKAHEAD;
    let guard = 64;
    while (cur.nextTime < horizon && guard-- > 0) {
      const sd = stepDur(cur.th);
      const sw = (cur.step & 1) && cur.th.swing ? cur.th.swing * sd : 0;
      try { schedule(cur, cur.step, cur.nextTime + sw, sd); } catch (e) { /* never break the scheduler */ }
      cur.nextTime += sd;
      cur.step++;
    }
  }

  function fadeOutCurrent(tau) {
    if (!cur) return;
    const old = cur;
    cur = null;
    const t = ctx.currentTime;
    const k = tau || 0.25;
    [old.fD, old.fR, old.fY].forEach((g) => {
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(0, t, k);
    });
    setTimeout(() => {
      try { old.fD.disconnect(); old.fR.disconnect(); old.fY.disconnect(); } catch (e) { /* ignore */ }
    }, 2500 + k * 4000);
  }

  function startTheme(key) {
    if (!ready || !running) return;
    if (cur && cur.name === key) return;
    const crossfade = !!cur;
    fadeOutCurrent(0.3);
    const th = prepTheme(THEMES[key], key);
    const t = ctx.currentTime;
    const tr = { name: key, th, step: 0, nextTime: t + 0.07, lay: {} };
    const mk = (dest) => { const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.setTargetAtTime(1, t + 0.02, crossfade ? 0.35 : 0.08); g.connect(dest); return g; };
    tr.fD = mk(musicDuck); tr.fR = mk(mRevIn); tr.fY = mk(mDlyIn);
    const Ly = tr.lay;
    //            pan   rev   dly   gain
    Ly.lead = mkLayer(tr, -0.12, 0.2, 0.2);
    Ly.dbl = mkLayer(tr, 0.32, 0.3, 0.12);
    Ly.cnt = mkLayer(tr, 0.42, 0.25, 0.3);
    Ly.comp = mkLayer(tr, -0.38, 0.15, 0.06);
    Ly.padL = mkLayer(tr, -0.6, 0.4, 0);
    Ly.padR = mkLayer(tr, 0.6, 0.4, 0);
    Ly.arp = mkLayer(tr, 0.22, 0.22, 0.2);
    Ly.bass = mkLayer(tr, 0, 0.02, 0);
    Ly.drums = mkLayer(tr, 0, 0.06, 0);
    Ly.crash = mkLayer(tr, 0.2, 0.3, 0);
    Ly.tomL = mkLayer(tr, -0.4, 0.12, 0);
    Ly.tomR = mkLayer(tr, 0.4, 0.12, 0);
    Ly.fan = mkLayer(tr, 0, 0.3, 0.05);
    Ly.drum = {};
    for (const dd of th.dl) {
      const dp = DRUM[dd.key];
      Ly.drum[dd.key] = mkLayer(tr, dp.pan || 0, dd.key === 's' || dd.key === 'c' ? 0.16 : dd.key === 'k' ? 0.02 : 0.08, 0);
    }
    // tempo-synced dotted-eighth delay
    const sd = 60 / th.bpm / 4;
    try {
      mDlyIn._dL.delayTime.setTargetAtTime(sd * 3, t, 0.15);
      mDlyIn._dR.delayTime.setTargetAtTime(sd * 3, t, 0.15);
    } catch (e) { /* ignore */ }
    cur = tr;
    tick();
  }

  // Unknown theme names fall back to 'circuit'. Safe before init / while the context is suspended:
  // the theme is remembered and starts as soon as audio is running.
  S.playMusic = function (name) {
    const key = hasOwn(THEMES, name) ? name : 'circuit';
    want = { name: key };
    if (failed) return;
    if (!ready || !running) {
      if (ready) resumeCtx();
      return;
    }
    startTheme(key);
  };

  S.stopMusic = function () {
    want = null;
    if (!ready) return;
    fadeOutCurrent(0.2);
  };
  S.hasTheme = (n) => hasOwn(THEMES, n);

  // ---------- ambience (persistent layers + random one-shots, chosen per course) ----------
  const amb = { want: null, cur: null, layers: null, prof: null, next: {}, live: false };
  const AMB_BASE = { wind: 0.22, wave: 0.3, crowd: 0.2, rumble: 0.1, hum: 0.04, shimmer: 0.07, bug: 0.12 };
  const AMB_PROFILES = {
    meadow: { wind: 0.4, birds: 0.6, bug: 0.2 },
    beach: { wave: 0.85, wind: 0.3, gulls: 0.6, birds: 0.1 },
    harbor: { wave: 0.6, wind: 0.55, gulls: 0.5, horn: 0.12 },
    park: { crowd: 0.5, birds: 0.35, wind: 0.12, cheers: 0.3 },
    desert: { wind: 0.85, rumble: 0.08, bug: 0.1 },
    castle: { wind: 0.5, birds: 0.2, crowd: 0.2, cheers: 0.15 },
    stadium: { crowd: 0.85, rumble: 0.15, cheers: 0.6 },
    jungle: { wind: 0.2, birds: 0.9, bug: 0.9, rumble: 0.12, frog: 0.5 },
    lava: { rumble: 0.9, crackle: 0.9, wind: 0.2 },
    space: { shimmer: 1, chime: 0.7 },
    snow: { wind: 0.95, chime: 0.18 },
    city: { hum: 0.9, horn: 0.5, wind: 0.12, crowd: 0.12 },
    mountain: { wind: 1, rumble: 0.18, birds: 0.1 },
    serpent: { wave: 0.6, wind: 0.2, birds: 0.5, bug: 0.5, frog: 0.3 },
  };
  const AMB_BY_ID = {
    sunshine_circuit: 'meadow', coral_coast: 'beach', tiny_tot_park: 'park', dusty_desert: 'desert',
    bayside_bridge: 'harbor', castle_circuit: 'castle', daydream_cruiser: 'beach', mudslide_stadium: 'stadium',
    grand_colosseum: 'stadium', dino_ruins: 'jungle', lava_fortress: 'lava', rainbow_ribbon: 'space',
    frosty_floes: 'snow', neon_metro: 'city', serpent_coast: 'serpent', boulder_peak: 'mountain',
  };
  const AMB_BY_THEME = { meadow: 'meadow', dunes: 'desert', glacier: 'snow', starlight: 'space', desert: 'desert', beach: 'beach' };
  const AMB_BY_MUSIC = { circuit: 'meadow', beach: 'beach', park: 'park', desert: 'desert', bridge: 'harbor', classic: 'castle', cruise: 'beach', stadium: 'stadium', colosseum: 'stadium', jungle: 'jungle', fortress: 'lava', rainbow: 'space', snow: 'snow', city: 'city', serpent: 'serpent', mountain: 'mountain' };

  function ambFor(track) {
    if (!track) return null;
    if (track.id && AMB_BY_ID[track.id]) return AMB_BY_ID[track.id];
    const th = track.theme, mu = track.def && track.def.music;
    if (mu && AMB_BY_MUSIC[mu]) return AMB_BY_MUSIC[mu];
    if (th && AMB_BY_THEME[th]) return AMB_BY_THEME[th];
    return G.Game && G.Game.mode === 'battle' ? 'stadium' : 'meadow';
  }

  function ensureAmb() {
    if (amb.layers) return;
    const t = ctx.currentTime;
    const Ls = {};
    const lfo = (f, depth, target, offset) => {
      const o = ctx.createOscillator(); o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = depth;
      o.connect(g); g.connect(target); o.start(t);
      return o;
    };
    const stereoNoise = (ftype, f, q, dest, pans) => {
      const flts = [];
      pans.forEach((pv, i) => {
        const s = mkNoiseSrc();
        const flt = ctx.createBiquadFilter(); flt.type = ftype; flt.frequency.value = f; flt.Q.value = q;
        const pn = ctx.createStereoPanner(); pn.pan.value = pv;
        s.connect(flt); flt.connect(pn); pn.connect(dest);
        s.start(t, 0.37 + i * 0.83);
        flts.push(flt);
      });
      return flts;
    };
    const layer = () => { const g = ctx.createGain(); g.gain.value = 0; g.connect(ambBus); return g; };
    // wind: panned noise pair, gusting centre frequency
    Ls.wind = layer();
    { const f = stereoNoise('bandpass', 700, 0.6, Ls.wind, [-0.7, 0.7]); f.forEach((x, i) => lfo(0.09 + i * 0.05, 260, x.frequency)); }
    // waves: lowpassed noise with slow swell amplitude
    Ls.wave = layer();
    { const am = ctx.createGain(); am.gain.value = 0.55; am.connect(Ls.wave);
      stereoNoise('lowpass', 650, 0.5, am, [-0.5, 0.5]); lfo(0.13, 0.42, am.gain); lfo(0.07, 0.15, am.gain); }
    // crowd murmur: two formant-ish bands, slow movement
    Ls.crowd = layer();
    { const am = ctx.createGain(); am.gain.value = 0.75; am.connect(Ls.crowd);
      stereoNoise('bandpass', 750, 0.9, am, [-0.6, 0.6]); stereoNoise('bandpass', 1650, 1.1, am, [-0.3, 0.3]); lfo(0.31, 0.22, am.gain); }
    // rumble: deep noise + sub sine
    Ls.rumble = layer();
    { stereoNoise('lowpass', 95, 0.7, Ls.rumble, [0, 0]);
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 46;
      const og = ctx.createGain(); og.gain.value = 0.7; o.connect(og); og.connect(Ls.rumble); o.start(t);
      lfo(0.2, 0.3, og.gain); }
    // city hum: mains-ish harmonics + low traffic wash
    Ls.hum = layer();
    { [[50, 'sine', 1], [100, 'triangle', 0.45], [150, 'sine', 0.3], [200, 'sine', 0.12]].forEach((a) => {
        const o = ctx.createOscillator(); o.type = a[1]; o.frequency.value = a[0] * 1.002;
        const og = ctx.createGain(); og.gain.value = a[2]; o.connect(og); og.connect(Ls.hum); o.start(t); });
      stereoNoise('bandpass', 280, 0.8, Ls.hum, [-0.4, 0.4]); }
    // shimmer: detuned high sines breathing in and out
    Ls.shimmer = layer();
    { [1318.5, 1320.9, 1760, 1763.1, 2349.3, 988].forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const am = ctx.createGain(); am.gain.value = 0.35;
        const pn = ctx.createStereoPanner(); pn.pan.value = (i % 2 ? 1 : -1) * (0.2 + i * 0.1);
        o.connect(am); am.connect(pn); pn.connect(Ls.shimmer); o.start(t);
        lfo(0.05 + i * 0.037, 0.33, am.gain); }); }
    // insects: high band with fast tremolo
    Ls.bug = layer();
    { const am = ctx.createGain(); am.gain.value = 0.5; am.connect(Ls.bug);
      stereoNoise('bandpass', 5400, 7, am, [-0.5, 0.5]); lfo(21, 0.45, am.gain); }
    amb.layers = Ls;
  }

  function setAmbience(name, force) {
    amb.want = name;
    if (!ready || !running) return;
    if (!force && amb.cur === name) return;
    ensureAmb();
    const t = ctx.currentTime;
    const prof = name ? AMB_PROFILES[name] || AMB_PROFILES.meadow : null;
    for (const k of Object.keys(amb.layers)) {
      const target = prof && prof[k] ? prof[k] * AMB_BASE[k] : 0;
      amb.layers[k].gain.cancelScheduledValues(t);
      amb.layers[k].gain.setTargetAtTime(target, t, name ? 1.0 : 0.5);
    }
    amb.cur = name;
    amb.prof = prof;
    amb.next = {};
  }
  S.startAmbience = function (name) { setAmbience(name || 'meadow', true); };
  S.stopAmbience = function () { setAmbience(null, true); };

  // one-shot with a random stereo position (not tied to a world position)
  function shot(build, vol, pan, wet) {
    if (!ready || !running || voices >= MAX_VOICES - 4) return;
    const sp = { g: 1, pan: pan == null ? rr(-0.8, 0.8) : pan, lp: 14000 };
    const out = outChain(sp, wet == null ? 0.18 : wet, ambBus);
    const v = { n: 1 };
    voices++;
    const c = { v, t: ctx.currentTime + 0.01, vol: vol == null ? 1 : vol, p: 1, bus: out };
    try { build(c); } catch (e) { /* ignore */ } finally { if (--v.n === 0) voices--; }
  }
  const AMB_EVENTS = {
    birds(c) {
      const n = 2 + ((rnd() * 4) | 0), f0 = rr(2600, 4400);
      for (let i = 0; i < n; i++) {
        const f = f0 * rr(0.9, 1.15), t = c.t + i * rr(0.09, 0.14);
        tone(c, 'sine', f, t, 0.08, 0.045, f * (rnd() < 0.5 ? 1.35 : 0.7));
      }
    },
    gulls(c) {
      const f = rr(950, 1150);
      tone(c, 'sawtooth', f, c.t, 0.16, 0.03, f * 1.5);
      tone(c, 'sawtooth', f * 1.5, c.t + 0.16, 0.34, 0.03, f * 0.8);
      noise(c, c.t, 0.5, 0.05, 'bandpass', 1400, 1000, 3, 0.1);
      if (rnd() < 0.5) { tone(c, 'sawtooth', f * 1.1, c.t + 0.55, 0.14, 0.025, f * 1.6); tone(c, 'sawtooth', f * 1.6, c.t + 0.69, 0.3, 0.025, f * 0.85); }
    },
    horn(c) {
      const f = rr(300, 420);
      tone(c, 'sawtooth', f, c.t, 0.42, 0.028, null, 0.03);
      tone(c, 'square', f * 1.26, c.t, 0.42, 0.018, null, 0.03);
      if (rnd() < 0.4) { tone(c, 'sawtooth', f, c.t + 0.55, 0.3, 0.028, null, 0.03); tone(c, 'square', f * 1.26, c.t + 0.55, 0.3, 0.018, null, 0.03); }
    },
    crackle(c) {
      const n = 1 + ((rnd() * 3) | 0);
      for (let i = 0; i < n; i++) {
        noise(c, c.t + i * rr(0.03, 0.12), 0.05, 0.22, 'bandpass', rr(500, 2800), null, 1.5);
        tone(c, 'sine', rr(70, 120), c.t + i * 0.07, 0.12, 0.12, 45);
      }
    },
    cheers(c) { SFX.swell(c); },
    chime(c) {
      const sc = [1319, 1568, 1760, 2093, 2349, 2637];
      const f = sc[(rnd() * sc.length) | 0];
      fm(c, f, 2.76, 0.7, c.t, 1.1, 0.05);
      tone(c, 'sine', f, c.t, 0.9, 0.025);
    },
    frog(c) {
      const f = rr(380, 620), n = 2 + ((rnd() * 3) | 0);
      for (let i = 0; i < n; i++) tone(c, 'square', f, c.t + i * 0.07, 0.04, 0.03, f * 1.3);
    },
  };
  const AMB_EVT_RANGE = { birds: [3, 8], gulls: [5, 12], horn: [4, 10], crackle: [1, 3.5], cheers: [9, 20], chime: [2, 6], frog: [3, 8] };

  function ambEvents(dt) {
    const pr = amb.prof;
    if (!pr || !amb.cur) return;
    for (const k of Object.keys(AMB_EVT_RANGE)) {
      const w = pr[k];
      if (!w) continue;
      let n = amb.next[k];
      if (n === undefined) { n = amb.next[k] = rr(0.5, 3); }
      n -= dt;
      if (n <= 0) {
        const r = AMB_EVT_RANGE[k];
        n = rr(r[0], r[1]) / w;
        shot(AMB_EVENTS[k], k === 'cheers' ? 0.6 : 1, null, k === 'cheers' ? 0.3 : 0.2);
      }
      amb.next[k] = n;
    }
  }

  // ---------- events from the game (positional sounds for AI karts / hazards) ----------
  let evHooked = false;
  function isHuman(k) {
    if (!k) return false;
    if (k.isPlayer) return true;
    const hs = G.Game && G.Game.humans;
    if (hs) for (let i = 0; i < hs.length; i++) if (hs[i].kart === k) return true;
    return false;
  }
  function hookEvents() {
    if (evHooked || !G.events || !G.events.on) return;
    evHooked = true;
    G.events.on('itemUsed', (e) => {
      try {
        const k = e && e.kart;
        if (!k || !k.pos || isHuman(k) || k.ghost) return;
        const it = String(e.item || '');
        const o = { x: k.pos.x, z: k.pos.z };
        if (/mushroom/.test(it)) S.play('boost', o);
        else if (/shell|banana|bomb|fireball|egg|fake|spiny/.test(it)) S.play(/banana|fake/.test(it) ? 'drop' : 'throw', o);
        else if (/star/.test(it)) S.play('star', o);
        else if (/lightning/.test(it)) return;
        else S.play('item_get', o);
      } catch (err) { /* ignore */ }
    });
    G.events.on('itemHit', (e) => {
      try {
        const k = e && e.victim;
        if (!k || !k.pos || isHuman(k) || k.ghost) return;
        const it = String(e.item || '');
        const o = { x: k.pos.x, z: k.pos.z };
        if (/bomb|spiny|blue/.test(it)) S.play('explosion', o);
        else if (/shell/.test(it)) S.play('shell_hit', o);
        else if (/banana|fake/.test(it)) S.play('banana_hit', o);
        else if (/lightning/.test(it)) S.play('shrink', o);
        else S.play('spin', o);
        if (rnd() < 0.5) S.voice(k.rear || k.front, 'hit', o);
      } catch (err) { /* ignore */ }
    });
    G.events.on('hazardLaunched', (e) => {
      try { if (e && typeof e.x === 'number') S.play('boing', { x: e.x, z: e.z }); } catch (err) { /* ignore */ }
    });
  }

  // ---------- per-frame update (call once per rendered frame) ----------
  const prevHeld = [null, null, null, null];
  const prevPos = [0, 0, 0, 0];
  const lastOvt = [0, 0, 0, 0];
  let driftPeakT = 0;
  let zeroed = false;
  let starOn = false;
  const tmpNear = [];

  S.update = function (dt) {
    if (!ready) return;
    updSeen = true;
    const Gm = G.Game;
    if (!Gm) return;
    const st = Gm.state;
    liveState = st === 'intro' || st === 'countdown' || st === 'race' || st === 'finished';
    const ambLive = liveState || st === 'paused';
    if (!running) return;
    const now = ctx.currentTime;
    dt = dt > 0.25 ? 0.25 : dt || 0.016;

    // ambience follows the course while a race is on screen
    if (ambLive && Gm.track) {
      const key = ambFor(Gm.track);
      if (key !== amb.cur) setAmbience(key);
    } else if (amb.cur) setAmbience(null);
    ambEvents(ambLive ? dt : 0);

    const humans = Gm.humans || [];
    const top = (G.CC_SPEED && G.CC_SPEED[Gm.cc || 150]) || 30;

    // listener fallback: follow human 1 when main did not feed a camera recently
    if (humans[0] && humans[0].kart && humans[0].kart.pos && performance.now() - L.stamp > 400) {
      const k0 = humans[0].kart;
      S.setListener(k0.pos.x, k0.pos.y || 0, k0.pos.z, k0.heading || 0);
      L.stamp = 0;
    }

    if (!liveState) {
      if (!zeroed) {
        zeroed = true;
        for (let i = 0; i < MAX_ENGINES; i++) if (engs[i]) zeroEngine(engs[i], now);
        if (wind) wind.g.gain.setTargetAtTime(0, now, 0.08);
        if (traffic) traffic.forEach((v) => v.g.gain.setTargetAtTime(0, now, 0.08));
        if (shellV) shellV.forEach((v) => v.g.gain.setTargetAtTime(0, now, 0.08));
        setStar(false);
      }
      return;
    }
    zeroed = false;

    // ---- human karts: engine (if main did not feed it), squeal, charge hum, surfaces
    let anyStar = false;
    for (let i = 0; i < humans.length && i < MAX_ENGINES; i++) {
      const k = humans[i] && humans[i].kart;
      if (!k) continue;
      const spd = Math.abs(k.speed || 0);
      const s01 = clamp(spd / top, 0, 1.3);
      const surf = k.trackInfo && k.trackInfo.surface;
      const boosting = k.boostTimer > 0 || k.starTimer > 0;
      if (k.starTimer > 0) anyStar = true;
      if (!engs[i] || now - engSeen[i] > 0.12) {
        S.setEngine(s01, boosting, surf === 'road' || surf === 'boost' || surf === 'ice' || surf === 'jump' || !surf, i);
      }
      const e = engs[i];
      if (!e) continue;
      e.pn.pan.setTargetAtTime(humans.length > 1 ? (i & 1 ? 0.4 : -0.4) : 0, now, 0.2);
      const air = !!k.airborne;
      const drifting = !!k.drifting && !air && spd > 5;
      const lvl = drifting ? clamp(k.driftLevel | 0, 0, 3) : 0;
      const grip = drifting && surf !== 'sand' && surf !== 'mud' && surf !== 'water';
      const sq = grip ? Math.min(1, spd / 18) : 0;
      e.sqg.gain.setTargetAtTime(sq * 0.03, now, 0.05);
      e.sqn.gain.setTargetAtTime(sq * 0.022, now, 0.05);
      if (grip) {
        e.sqo.frequency.setTargetAtTime(1100 + spd * 12 + lvl * 90, now, 0.1);
        e.sqbp.frequency.setTargetAtTime(2100 + spd * 14, now, 0.1);
      }
      const hf = lvl === 1 ? 392 : lvl === 2 ? 587 : lvl >= 3 ? 784 : 0;
      if (hf) {
        e.ho.frequency.setTargetAtTime(hf, now, 0.02);
        e.ho2.frequency.setTargetAtTime(hf * 1.004, now, 0.02);
        e.hlfo.frequency.setTargetAtTime(8 + lvl * 4, now, 0.05);
      }
      e.hg.gain.setTargetAtTime(hf ? 0.007 + lvl * 0.003 : 0, now, 0.04);
      if (lvl > e.lvl && lvl >= 1) { S.play('charge', { volume: 0.7 + lvl * 0.15, pitch: 1 + (lvl - 1) * 0.2 }); }
      if (lvl > 0) { S._driftPeak = Math.max(S._driftPeak || 1, lvl); driftPeakT = 0; }
      e.lvl = lvl;
      e.sg.gain.setTargetAtTime(!air && surf === 'sand' ? 0.07 * Math.min(1, s01 * 1.2) : 0, now, 0.1);
      e.wg.gain.setTargetAtTime(!air && surf === 'water' ? 0.1 * Math.min(1, s01 * 1.4) : 0, now, 0.1);
      e.ig.gain.setTargetAtTime(!air && surf === 'ice' && s01 > 0.25 ? 0.03 * s01 : 0, now, 0.15);
      // item pickup / overtake chatter
      if (Gm.state === 'race' && !k.finished) {
        const held = k.heldItems && (k.heldItems[0] || k.heldItems[1]);
        if (held && !prevHeld[i] && rnd() < 0.55) S.voice(k.rear || k.front, 'item');
        prevHeld[i] = held || null;
        const pos = k.position | 0;
        if (pos > 0) {
          if (prevPos[i] > 0 && pos < prevPos[i] && Gm.raceTime > 4 && now - lastOvt[i] > 2.5) {
            lastOvt[i] = now;
            if (rnd() < 0.6) S.voice(k.rear || k.front, 'overtake');
            if (amb.prof && amb.prof.crowd && rnd() < 0.5) S.play('swell', { volume: 0.6 });
          }
          prevPos[i] = pos;
        }
      }
    }
    driftPeakT += dt;
    if (driftPeakT > 0.7) S._driftPeak = 1;
    setStar(anyStar);

    // ---- wind rush (human 1)
    const h0 = humans[0] && humans[0].kart;
    if (h0) {
      ensureWind();
      const s01 = clamp(Math.abs(h0.speed || 0) / top, 0, 1.3);
      const bst = h0.boostTimer > 0 || h0.starTimer > 0;
      const w = s01 * s01 * 0.2 + (bst ? 0.05 : 0);
      wind.g.gain.setTargetAtTime(w, now, 0.1);
      const wf = 450 + s01 * 2300 + (bst ? 700 : 0);
      wind.fa.frequency.setTargetAtTime(wf, now, 0.12);
      wind.fb.frequency.setTargetAtTime(wf * 1.13, now, 0.12);
    }

    // ---- nearest AI karts: persistent traffic engines with pan / distance / doppler
    if (L.set && Gm.karts && Gm.karts.length) {
      ensureTraffic();
      let n = 0;
      tmpNear.length = 0;
      for (let i = 0; i < Gm.karts.length; i++) {
        const k = Gm.karts[i];
        if (!k || k.ghost || !k.pos || isHuman(k)) continue;
        const dx = k.pos.x - L.x, dz = k.pos.z - L.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 90 * 90) continue;
        tmpNear.push({ k, d2 });
      }
      tmpNear.sort((a, b) => a.d2 - b.d2);
      for (let j = 0; j < N_TRAFFIC; j++) {
        const v = traffic[j], c = tmpNear[j];
        if (!c) { v.g.gain.setTargetAtTime(0, now, 0.08); continue; }
        const k = c.k, sp = spatial(k.pos.x, k.pos.z);
        if (!sp) { v.g.gain.setTargetAtTime(0, now, 0.08); continue; }
        const sk = clamp(Math.abs(k.speed || 0) / top, 0, 1.2);
        const d = Math.max(1, sp.d);
        const ux = (k.pos.x - L.x) / d, uz = (k.pos.z - L.z) / d;
        const h = k.heading || 0;
        const vkx = Math.sin(h) * (k.speed || 0), vkz = Math.cos(h) * (k.speed || 0);
        const closing = -((vkx - L.vx / dt) * ux + (vkz - L.vz / dt) * uz);   // >0 approaching
        const dop = 1 + clamp(closing / 70, -0.2, 0.2);
        const f = (46 + sk * 104) * dop * (0.96 + ((i32(k) % 7) * 0.012));
        v.o1.frequency.setTargetAtTime(f, now, 0.06);
        v.o2.frequency.setTargetAtTime(f * 1.006, now, 0.06);
        v.lp.frequency.setTargetAtTime(Math.min(sp.lp, 260 + sk * 700), now, 0.08);
        v.g.gain.setTargetAtTime(sp.g * (0.045 + sk * 0.04), now, 0.06);
        v.pn.pan.setTargetAtTime(sp.pan, now, 0.05);
        n++;
      }
    }

    // ---- shells: travel hum + ricochet clink
    const items = Gm.items;
    if (items && items.pools) {
      const types = ['shell_green', 'shell_red', 'mega_shell'];
      let b0 = null, b1 = null, d0 = 1e9, d1 = 1e9;
      for (let ti = 0; ti < types.length; ti++) {
        const arr = items.pools[types[ti]];
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const e = arr[i];
          if (!e.active) { e._sb = 0; continue; }
          if (e.bounces > (e._sb || 0)) { S.play('clink', { x: e.x, z: e.z, volume: 0.8 }); }
          e._sb = e.bounces;
          if (!L.set) continue;
          const dx = e.x - L.x, dz = e.z - L.z, d2 = dx * dx + dz * dz;
          if (d2 > 80 * 80) continue;
          e._t = ti;
          if (d2 < d0) { b1 = b0; d1 = d0; b0 = e; d0 = d2; } else if (d2 < d1) { b1 = e; d1 = d2; }
        }
      }
      if (b0 || shellV) {
        ensureShells();
        const sel = [b0, b1];
        for (let j = 0; j < N_SHELLS; j++) {
          const v = shellV[j], e = sel[j];
          const sp = e ? spatial(e.x, e.z) : null;
          if (!e || !sp) { v.g.gain.setTargetAtTime(0, now, 0.06); continue; }
          const d = Math.max(1, sp.d);
          const vv = ((e.vx || 0) * (e.x - L.x) + (e.vz || 0) * (e.z - L.z)) / d;
          const dop = 1 - clamp(vv / 80, -0.2, 0.2);
          const base = e._t === 2 ? 95 : e._t === 1 ? 250 : 190;
          v.o1.frequency.setTargetAtTime(base * dop, now, 0.05);
          v.o2.frequency.setTargetAtTime(base * 2.01 * dop, now, 0.05);
          v.lfo.frequency.setTargetAtTime(e._t === 1 ? 22 : 13, now, 0.2);
          v.lp.frequency.setTargetAtTime(Math.min(sp.lp, 1000), now, 0.08);
          v.g.gain.setTargetAtTime(sp.g * 0.05, now, 0.05);
          v.pn.pan.setTargetAtTime(sp.pan, now, 0.04);
        }
      }
    }
  };
  function i32(k) { return (k._sndId = k._sndId || ((Math.random() * 1e6) | 0)); }

  function setStar(on) {
    if (on === star.on) return;
    star.on = on;
    if (on) star.next = 0;
    if (ready && running && musicDuck) {
      const t = ctx.currentTime;
      musicDuck.gain.cancelScheduledValues(t);
      musicDuck.gain.setTargetAtTime(on ? 0.62 : 1, t, 0.15);
    }
  }
  S._driftPeak = 1;
  S._dbg = () => ({ ctx, master, comp, sfxBus, sfxIn, engineBus, ambBus, voiceBus, musicBus, musicDuck, engs, wind, traffic, shellV, amb, star });

  G.Sound = S;
})();
