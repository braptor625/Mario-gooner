// Shared namespace + helpers. Loaded right after three.min.js.
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  G.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  G.lerp = (a, b, t) => a + (b - a) * t;
  // frame-rate independent exponential smoothing
  G.damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
  G.wrapAngle = (a) => {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  };
  G.rand = (a, b) => a + Math.random() * (b - a);
  G.randInt = (a, b) => Math.floor(G.rand(a, b + 1));
  G.choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
  // weighted pick: {key: weight, ...} -> key
  G.weighted = (obj) => {
    let total = 0;
    for (const k in obj) total += Math.max(0, obj[k]);
    let r = Math.random() * total;
    for (const k in obj) {
      r -= Math.max(0, obj[k]);
      if (r <= 0) return k;
    }
    return Object.keys(obj)[0];
  };

  G.CC_SPEED = { 50: 22, 100: 26, 150: 30 };
  G.FIXED_DT = 1 / 60;

  // tiny pub/sub
  const handlers = {};
  G.events = {
    on(name, fn) { (handlers[name] = handlers[name] || []).push(fn); },
    off(name, fn) { const h = handlers[name]; if (h) { const i = h.indexOf(fn); if (i >= 0) h.splice(i, 1); } },
    emit(name, data) { const h = handlers[name]; if (h) for (let i = 0; i < h.length; i++) h[i](data); },
  };

  // scratch vectors (never hold across function calls you don't own)
  const scratch = [];
  G.tmpV = (i) => scratch[i] || (scratch[i] = new THREE.Vector3());

  G.makeTextSprite = (text, color = '#fff', size = 64) => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.font = `900 ${size}px "Trebuchet MS", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 10; ctx.strokeStyle = '#111'; ctx.strokeText(text, 128, 64);
    ctx.fillStyle = color; ctx.fillText(text, 128, 64);
    const tex = new THREE.CanvasTexture(c);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    spr.scale.set(2, 1, 1);
    return spr;
  };
})();
