// Kart physics, drift, hits, visuals. Depends on G (util.js), THREE r128, G.Characters, G.KARTS, track.
(function () {
  'use strict';
  const G = (window.G = window.G || {});
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
  const TAU = Math.PI * 2;

  const HOP_TIME = 0.25, HOP_H = 0.35;
  const SPIN_TIME = 1.1, FLIP_TIME = 1.5, SQUISH_TIME = 1.5;
  const MT_TIME = 1.0;            // mini-turbo length (s)
  const CHARGE_BLUE = 1.0;        // drift charge needed for blue sparks (holding ~1.1 s, wiggles speed it up)
  const CHARGE_RATE = 0.9;        // charge per second just from holding the drift
  const CHARGE_FLICK = 0.4;       // extra charge per counter-steer wiggle (DD technique)
  const FLICKS_BLUE = 2;          // wiggles needed for blue sparks
  const FALL_TIME = 0.4, CARRY_TIME = 1.2, DRONE_HANG = 3.4;
  const SLAP_CD = 0.8, SLAP_ANIM = 0.4;
  const DRAFT_NEED = 1.2, DRAFT_RANGE = 18, DRAFT_COS = Math.cos(12 * Math.PI / 180);
  const SURF_MUL = { offroad: 0.55, grass: 0.55, sand: 0.6, mud: 0.5, water: 0.65 };
  const GRAVITY = 32;
  const FX_W = new Float32Array(3);
  const RGB = new Float32Array(3);
  function hsv(h, sat, v) {
    const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - sat), q = v * (1 - f * sat), t = v * (1 - (1 - f) * sat);
    switch (i % 6) {
      case 0: RGB[0] = v; RGB[1] = t; RGB[2] = p; break;
      case 1: RGB[0] = q; RGB[1] = v; RGB[2] = p; break;
      case 2: RGB[0] = p; RGB[1] = v; RGB[2] = t; break;
      case 3: RGB[0] = p; RGB[1] = q; RGB[2] = v; break;
      case 4: RGB[0] = t; RGB[1] = p; RGB[2] = v; break;
      default: RGB[0] = v; RGB[1] = p; RGB[2] = q; break;
    }
  }

  // ======================================================================
  // Shared particle hub (G.Particles): instanced billboard sprites, 2 draw calls
  // (additive + alpha) plus 1 for blob shadows, per scene. Used by kart.js and items.js.
  // Cells in the atlas: 0 soft dot, 1 4-point spark, 2 ring, 3 smoke puff.
  // ======================================================================
  let atlasTex = null, shadowTex = null;
  function makeAtlas() {
    if (atlasTex) return atlasTex;
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 128;
    const x = cv.getContext('2d');
    x.clearRect(0, 0, 512, 128);
    let g = x.createRadialGradient(64, 64, 0, 64, 64, 60);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.22, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.32)'); g.addColorStop(0.8, 'rgba(255,255,255,0.06)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    // spark: glow + thin 4-point star
    const ox = 128;
    g = x.createRadialGradient(ox + 64, 64, 0, ox + 64, 64, 40);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(ox, 0, 128, 128);
    x.fillStyle = 'rgba(255,255,255,0.95)';
    x.beginPath();
    x.moveTo(ox + 64, 2); x.quadraticCurveTo(ox + 68, 60, ox + 126, 64); x.quadraticCurveTo(ox + 68, 68, ox + 64, 126);
    x.quadraticCurveTo(ox + 60, 68, ox + 2, 64); x.quadraticCurveTo(ox + 60, 60, ox + 64, 2); x.fill();
    // ring
    const rx = 256;
    g = x.createRadialGradient(rx + 64, 64, 28, rx + 64, 64, 62);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,255,255,0.9)'); g.addColorStop(0.7, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(rx, 0, 128, 128);
    // puff: clustered soft blobs
    const px = 384;
    const blobs = [[64, 64, 44], [44, 56, 30], [84, 58, 30], [58, 84, 28], [82, 82, 26], [66, 40, 24]];
    for (let i = 0; i < blobs.length; i++) {
      const b = blobs[i];
      g = x.createRadialGradient(px + b[0], b[1], 0, px + b[0], b[1], b[2]);
      g.addColorStop(0, 'rgba(255,255,255,0.85)'); g.addColorStop(0.6, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(px, 0, 128, 128);
    }
    atlasTex = new THREE.CanvasTexture(cv);
    atlasTex.generateMipmaps = false;
    atlasTex.minFilter = THREE.LinearFilter; atlasTex.magFilter = THREE.LinearFilter;
    return atlasTex;
  }
  function makeShadowTex() {
    if (shadowTex) return shadowTex;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const x = cv.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 31);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.45, 'rgba(0,0,0,0.8)'); g.addColorStop(0.75, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    shadowTex = new THREE.CanvasTexture(cv);
    return shadowTex;
  }

  const P_VERT = [
    'attribute vec3 iPos; attribute vec3 iVel; attribute vec4 iData; attribute vec4 iColor;',
    'varying vec2 vUv; varying vec4 vCol;',
    'void main(){',
    '  vec2 q = position.xy; float sz = iData.x; float mode = iData.z;',
    '  vCol = iColor;',
    '  vUv = vec2((iData.y + q.x + 0.5) * 0.25, q.y + 0.5);',
    '  vec4 mv;',
    '  if (sz <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }',
    '  if (mode < 0.5) {',
    '    mv = modelViewMatrix * vec4(iPos, 1.0);',
    '    float cr = cos(iData.w), sr = sin(iData.w);',
    '    vec2 r = vec2(q.x * cr - q.y * sr, q.x * sr + q.y * cr);',
    '    float s2 = max(sz, -mv.z * 0.0022);',
    '    mv.xy += r * s2;',
    '  } else if (mode < 1.5) {',
    '    mv = modelViewMatrix * vec4(iPos, 1.0);',
    '    vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;',
    '    vec2 d = vv.xy; float l = length(d);',
    '    vec2 dir = l > 1e-4 ? d / l : vec2(1.0, 0.0);',
    '    float len = sz + length(iVel) * 0.045;',
    '    float s2 = max(sz, -mv.z * 0.0022);',
    '    mv.xy += dir * q.x * len + vec2(-dir.y, dir.x) * q.y * s2;',
    '  } else {',
    '    float cr = cos(iData.w), sr = sin(iData.w);',
    '    vec2 r = vec2(q.x * cr - q.y * sr, q.x * sr + q.y * cr) * sz;',
    '    mv = modelViewMatrix * vec4(iPos.x + r.x, iPos.y, iPos.z + r.y, 1.0);',
    '  }',
    '  gl_Position = projectionMatrix * mv;',
    '}'].join('\n');
  const P_FRAG = [
    'uniform sampler2D map; varying vec2 vUv; varying vec4 vCol;',
    'void main(){ vec4 t = texture2D(map, vUv); gl_FragColor = vec4(vCol.rgb, vCol.a * t.a); if (gl_FragColor.a < 0.003) discard; }'].join('\n');

  class PSys {
    constructor(N, F, additive) {
      this.N = N; this.F = F; const T = (this.T = N + F);
      this.pos = new Float32Array(T * 3); this.vel = new Float32Array(T * 3);
      this.dat = new Float32Array(T * 4); this.col = new Float32Array(T * 4);
      this.life = new Float32Array(N); this.max = new Float32Array(N);
      this.grav = new Float32Array(N); this.drag = new Float32Array(N);
      this.s0 = new Float32Array(N); this.s1 = new Float32Array(N);
      this.c0 = new Float32Array(N * 4); this.c1 = new Float32Array(N * 3);
      this.rv = new Float32Array(N); this.r0 = new Float32Array(N);
      this.cur = 0; this.fc = 0; this.fcPrev = 0; this.alive = 0;
      this._e0 = -1; this._e1 = 0; this._e2 = 0;
      this.attack = additive ? 14 : 7;
      const geo = (this.geo = new THREE.InstancedBufferGeometry());
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0]), 3));
      geo.setIndex([0, 1, 2, 2, 1, 3]);
      const mk = (a, n) => { const at = new THREE.InstancedBufferAttribute(a, n); at.setUsage(THREE.DynamicDrawUsage); return at; };
      this.aPos = mk(this.pos, 3); this.aVel = mk(this.vel, 3); this.aDat = mk(this.dat, 4); this.aCol = mk(this.col, 4);
      geo.setAttribute('iPos', this.aPos); geo.setAttribute('iVel', this.aVel);
      geo.setAttribute('iData', this.aDat); geo.setAttribute('iColor', this.aCol);
      geo.instanceCount = T;
      this.mat = new THREE.ShaderMaterial({
        uniforms: { map: { value: makeAtlas() } }, vertexShader: P_VERT, fragmentShader: P_FRAG,
        transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      this.mesh = new THREE.Mesh(geo, this.mat);
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = additive ? 6 : 5;
      this.mesh.name = additive ? 'fx_add' : 'fx_alpha';
    }
    endColor(r, g, b) { this._e0 = r; this._e1 = g; this._e2 = b; }
    // one-shot particle that lives `life` seconds
    spawn(cell, mode, x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, grav, drag) {
      const i = this.cur; this.cur = (i + 1) % this.N;
      const k = i * 3;
      this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
      this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
      this.life[i] = life; this.max[i] = life; this.grav[i] = grav; this.drag[i] = drag;
      this.s0[i] = s0; this.s1[i] = s1;
      const c = i * 4; this.c0[c] = r; this.c0[c + 1] = g; this.c0[c + 2] = b; this.c0[c + 3] = a;
      if (this._e0 >= 0) { this.c1[k] = this._e0; this.c1[k + 1] = this._e1; this.c1[k + 2] = this._e2; this._e0 = -1; }
      else { this.c1[k] = r; this.c1[k + 1] = g; this.c1[k + 2] = b; }
      this.r0[i] = Math.random() * 6.283; this.rv[i] = (Math.random() - 0.5) * 3;
      this.dat[i * 4] = s0; this.dat[i * 4 + 1] = cell; this.dat[i * 4 + 2] = mode; this.dat[i * 4 + 3] = this.r0[i];
      this.alive = 1;
    }
    // sprite that exists for this frame only (re-put every frame)
    put(cell, mode, x, y, z, size, r, g, b, a, vx, vy, vz, rot) {
      if (this.fc >= this.F) return;
      const i = this.N + this.fc++;
      const k = i * 3, c = i * 4;
      this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
      this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
      this.dat[c] = size; this.dat[c + 1] = cell; this.dat[c + 2] = mode; this.dat[c + 3] = rot;
      this.col[c] = r; this.col[c + 1] = g; this.col[c + 2] = b; this.col[c + 3] = a;
    }
    begin(dt) {
      for (let i = this.N, e = this.N + this.fcPrev; i < e; i++) this.dat[i * 4] = 0;
      this.fcPrev = this.fc = 0;
      if (!this.alive) { this._dirty = true; return; }
      let any = 0;
      const N = this.N, att = this.attack;
      for (let i = 0; i < N; i++) {
        const L = this.life[i];
        if (L <= 0) continue;
        const nl = L - dt, d = i * 4, k = i * 3;
        this.life[i] = nl;
        if (nl <= 0) { this.dat[d] = 0; continue; }
        any = 1;
        const dg = this.drag[i];
        if (dg > 0) { const f = 1 / (1 + dg * dt); this.vel[k] *= f; this.vel[k + 1] *= f; this.vel[k + 2] *= f; }
        this.vel[k + 1] -= this.grav[i] * dt;
        this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
        const age = 1 - nl / this.max[i];
        const e = 1 - (1 - age) * (1 - age);
        this.dat[d] = this.s0[i] + (this.s1[i] - this.s0[i]) * e;
        this.dat[d + 3] = this.r0[i] + this.rv[i] * (this.max[i] - nl);
        this.col[d] = this.c0[d] + (this.c1[k] - this.c0[d]) * age;
        this.col[d + 1] = this.c0[d + 1] + (this.c1[k + 1] - this.c0[d + 1]) * age;
        this.col[d + 2] = this.c0[d + 2] + (this.c1[k + 2] - this.c0[d + 2]) * age;
        const fade = (1 - age) * Math.min(1, age * att + 0.05);
        this.col[d + 3] = this.c0[d + 3] * fade;
      }
      this.alive = any;
      this._dirty = true;
    }
    flush() {
      this.aPos.needsUpdate = this.aVel.needsUpdate = this.aDat.needsUpdate = this.aCol.needsUpdate = true;
    }
    dispose() { this.geo.dispose(); this.mat.dispose(); }
  }

  const SH_VERT = 'attribute float aA; varying vec2 vUv; varying float vA; void main(){ vUv = uv; vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const SH_FRAG = 'uniform sampler2D map; varying vec2 vUv; varying float vA; void main(){ float a = texture2D(map, vUv).a * vA; if (a < 0.004) discard; gl_FragColor = vec4(0.0, 0.0, 0.0, a); }';
  class ShadowSys {
    constructor(cap) {
      this.cap = cap; this.used = new Uint8Array(cap);
      this.pos = new Float32Array(cap * 12); this.al = new Float32Array(cap * 4);
      const uv = new Float32Array(cap * 8), idx = [];
      for (let i = 0; i < cap; i++) {
        uv.set([0, 0, 1, 0, 0, 1, 1, 1], i * 8);
        idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3);
      }
      this.geo = new THREE.BufferGeometry();
      this.aPos = new THREE.BufferAttribute(this.pos, 3); this.aPos.setUsage(THREE.DynamicDrawUsage);
      this.aA = new THREE.BufferAttribute(this.al, 1); this.aA.setUsage(THREE.DynamicDrawUsage);
      this.geo.setAttribute('position', this.aPos);
      this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      this.geo.setAttribute('aA', this.aA);
      this.geo.setIndex(idx);
      this.mat = new THREE.ShaderMaterial({
        uniforms: { map: { value: makeShadowTex() } }, vertexShader: SH_VERT, fragmentShader: SH_FRAG,
        transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      this.mesh = new THREE.Mesh(this.geo, this.mat);
      this.mesh.frustumCulled = false; this.mesh.renderOrder = 1; this.mesh.name = 'kart_shadows';
    }
    alloc() { for (let i = 0; i < this.cap; i++) if (!this.used[i]) { this.used[i] = 1; return i; } return -1; }
    free(i) { if (i >= 0) { this.used[i] = 0; this.set(i, 0, 0, 0, 0, 0, 0, 0); } }
    // half-extents hx (side) / hz (forward) in world units, rotated by heading
    set(i, x, y, z, heading, hx, hz, a) {
      if (i < 0) return;
      const s = Math.sin(heading), c = Math.cos(heading), o = i * 12;
      for (let v = 0; v < 4; v++) {
        const lx = (v & 1 ? hx : -hx), lz = (v & 2 ? hz : -hz);
        this.pos[o + v * 3] = x + c * lx + s * lz;
        this.pos[o + v * 3 + 1] = y;
        this.pos[o + v * 3 + 2] = z - s * lx + c * lz;
        this.al[i * 4 + v] = a;
      }
      this.aPos.needsUpdate = true; this.aA.needsUpdate = true;
    }
    dispose() { this.geo.dispose(); this.mat.dispose(); }
  }

  // ---- tire skid marks: ONE pooled ribbon mesh (ring buffer of quads) per scene, fades by age in the shader ----
  const SK_VERT = 'attribute vec2 aD; varying vec2 vUv; varying vec2 vD; void main(){ vUv = uv; vD = aD; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const SK_FRAG = 'uniform float uT; varying vec2 vUv; varying vec2 vD; void main(){ float age = uT - vD.x; float a = vD.y * (1.0 - smoothstep(1.2, 4.0, age)); a *= smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x); if (a < 0.004) discard; gl_FragColor = vec4(0.025, 0.025, 0.03, a); }';
  class SkidSys {
    constructor(cap) {
      this.cap = cap; this.cur = 0; this.dirty = false;
      this.pos = new Float32Array(cap * 12); this.dat = new Float32Array(cap * 8);
      for (let i = 0; i < cap * 4; i++) this.dat[i * 2] = -1000;
      const uv = new Float32Array(cap * 8), idx = [];
      for (let i = 0; i < cap; i++) {
        uv.set([0, 0, 1, 0, 0, 1, 1, 1], i * 8);
        idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3);
      }
      this.geo = new THREE.BufferGeometry();
      this.aPos = new THREE.BufferAttribute(this.pos, 3); this.aPos.setUsage(THREE.DynamicDrawUsage);
      this.aD = new THREE.BufferAttribute(this.dat, 2); this.aD.setUsage(THREE.DynamicDrawUsage);
      this.geo.setAttribute('position', this.aPos);
      this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      this.geo.setAttribute('aD', this.aD);
      this.geo.setIndex(idx);
      this.mat = new THREE.ShaderMaterial({
        uniforms: { uT: { value: 0 } }, vertexShader: SK_VERT, fragmentShader: SK_FRAG,
        transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
      });
      this.mesh = new THREE.Mesh(this.geo, this.mat);
      this.mesh.frustumCulled = false; this.mesh.renderOrder = 2; this.mesh.name = 'skid_marks';
    }
    // quad from previous edge pair (L0,R0) to new pair (L1,R1); a0/a1 = alpha at the two ends
    quad(t, y, l0x, l0z, r0x, r0z, l1x, l1z, r1x, r1z, a0, a1) {
      const i = this.cur; this.cur = (i + 1) % this.cap;
      const o = i * 12, p = this.pos, d = this.dat, q = i * 8;
      p[o] = l0x; p[o + 1] = y; p[o + 2] = l0z; p[o + 3] = r0x; p[o + 4] = y; p[o + 5] = r0z;
      p[o + 6] = l1x; p[o + 7] = y; p[o + 8] = l1z; p[o + 9] = r1x; p[o + 10] = y; p[o + 11] = r1z;
      d[q] = t; d[q + 1] = a0; d[q + 2] = t; d[q + 3] = a0; d[q + 4] = t; d[q + 5] = a1; d[q + 6] = t; d[q + 7] = a1;
      this.dirty = true;
    }
    flush() { if (this.dirty) { this.aPos.needsUpdate = true; this.aD.needsUpdate = true; this.dirty = false; } }
    dispose() { this.geo.dispose(); this.mat.dispose(); }
  }

  class FXHub {
    constructor(scene) {
      this.scene = scene; this.owners = []; this.round = -1; this.started = false;
      this.add = new PSys(2200, 1800, true);
      this.alpha = new PSys(900, 160, false);
      this.shadow = new ShadowSys(16);
      this.skid = new SkidSys(3000); this.time = 0;
      this.root = new THREE.Group(); this.root.name = 'fx_hub';
      this.root.add(this.shadow.mesh, this.skid.mesh, this.alpha.mesh, this.add.mesh);
      scene.add(this.root);
    }
    acquire(o) { if (this.owners.indexOf(o) < 0) this.owners.push(o); }
    release(o) {
      const i = this.owners.indexOf(o);
      if (i >= 0) this.owners.splice(i, 1);
      if (!this.owners.length) {
        this.scene.remove(this.root);
        this.add.dispose(); this.alpha.dispose(); this.shadow.dispose(); this.skid.dispose();
        hubs.delete(this.scene);
      }
    }
    // every owner calls this once per sim step; the first call of a step advances the simulation
    step(o, dt) {
      if (!this.started || o._fxR === this.round) {
        this.round++; this.started = true;
        this.add.begin(dt); this.alpha.begin(dt);
        this.add.flush(); this.alpha.flush();
        this.time += dt; this.skid.mat.uniforms.uT.value = this.time; this.skid.flush();
      }
      o._fxR = this.round;
    }
  }
  const hubs = new WeakMap();
  G.Particles = {
    hub(scene, owner) {
      if (!scene) return null;
      let h = hubs.get(scene);
      if (!h) { h = new FXHub(scene); hubs.set(scene, h); }
      if (owner) h.acquire(owner);
      return h;
    },
  };

  // ---- rescue drone resources (lazy, shared geometry) ----
  let droneShared = null;
  function getDroneShared() {
    if (droneShared) return droneShared;
    const body = new THREE.SphereGeometry(0.5, 10, 8); body.scale(1, 0.72, 1);
    const eye = new THREE.SphereGeometry(0.17, 8, 6);
    const mast = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 5);
    const blade = new THREE.BoxGeometry(1.9, 0.04, 0.2);
    const line = new THREE.CylinderGeometry(0.025, 0.025, 1, 4);
    const prong = new THREE.BoxGeometry(0.08, 0.5, 0.08);
    const hub = new THREE.SphereGeometry(0.14, 6, 5);
    droneShared = {
      body, eye, mast, blade, line, prong, hub,
      mBody: new THREE.MeshLambertMaterial({ color: 0xf2f2ee, flatShading: true }),
      mAccent: new THREE.MeshLambertMaterial({ color: 0xe8a020, flatShading: true }),
      mDark: new THREE.MeshLambertMaterial({ color: 0x222833, flatShading: true }),
      mLine: new THREE.MeshBasicMaterial({ color: 0xdddddd }),
    };
    return droneShared;
  }
  function buildDrone() {
    const d = getDroneShared();
    const g = new THREE.Group();
    g.add(new THREE.Mesh(d.body, d.mBody));
    const eye = new THREE.Mesh(d.eye, d.mDark); eye.position.set(0, 0.05, 0.4); g.add(eye);
    const band = new THREE.Mesh(d.hub, d.mAccent); band.position.set(0, 0.3, 0); band.scale.set(1.6, 0.5, 1.6); g.add(band);
    const mast = new THREE.Mesh(d.mast, d.mDark); mast.position.y = 0.45; g.add(mast);
    const rotor = new THREE.Group(); rotor.position.y = 0.62;
    const b1 = new THREE.Mesh(d.blade, d.mAccent), b2 = new THREE.Mesh(d.blade, d.mAccent);
    b2.rotation.y = Math.PI / 2;
    rotor.add(b1, b2); g.add(rotor);
    const line = new THREE.Mesh(d.line, d.mLine); g.add(line);
    const claw = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2;
      const pr = new THREE.Mesh(d.prong, d.mDark);
      pr.position.set(Math.cos(a) * 0.18, -0.2, Math.sin(a) * 0.18);
      pr.rotation.z = Math.cos(a) * 0.4; pr.rotation.x = -Math.sin(a) * 0.4;
      claw.add(pr);
    }
    g.add(claw);
    g.frustumCulled = false;
    g.userData = { rotor, line, claw };
    return g;
  }

  // ---- fallback kart if characters.js unavailable ----
  function buildFallbackKart(colorHex) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: colorHex || 0xdd3333 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 2.2), bodyMat);
    body.position.y = 0.5;
    group.add(body);
    const wheels = [], pivots = [];
    const wm = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const wg = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 10);
    wg.rotateZ(Math.PI / 2);
    const pos = [[-0.8, 0.35, 0.8], [0.8, 0.35, 0.8], [-0.8, 0.35, -0.8], [0.8, 0.35, -0.8]];
    for (let i = 0; i < 4; i++) {
      const w = new THREE.Mesh(wg, wm);
      if (i < 2) {
        const p = new THREE.Object3D();
        p.position.set(pos[i][0], pos[i][1], pos[i][2]);
        p.add(w);
        group.add(p);
        pivots.push(p);
      } else {
        w.position.set(pos[i][0], pos[i][1], pos[i][2]);
        group.add(w);
      }
      wheels.push(w);
    }
    const frontSeat = new THREE.Object3D(); frontSeat.position.set(0, 0.8, 0.4);
    const rearSeat = new THREE.Object3D(); rearSeat.position.set(0, 0.8, -0.5);
    group.add(frontSeat, rearSeat);
    const mk = (c) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshLambertMaterial({ color: c })); m.position.y = 0.35; const g = new THREE.Group(); g.add(m); return g; };
    const front = mk(0xffcc88), rear = mk(0x88ccff);
    frontSeat.add(front); rearSeat.add(rear);
    const ex = [new THREE.Object3D(), new THREE.Object3D()];
    ex[0].position.set(-0.4, 0.4, -1.1); ex[1].position.set(0.4, 0.4, -1.1);
    group.add(ex[0], ex[1]);
    return { group, body, wheels, frontWheelPivots: pivots, frontSeat, rearSeat, front, rear, exhausts: ex };
  }

  // ---- overlay arms for riders (the baked rider mesh has no separate arms); shown only while cheering / throwing / flailing ----
  let armGeo = null;
  const armMats = {};
  function armMat(c) {
    const k = new THREE.Color(c).getHexString();
    return armMats[k] || (armMats[k] = new THREE.MeshLambertMaterial({ color: new THREE.Color(c) }));
  }
  function addArms(rider) {
    if (!rider || rider.userData.arms) return;
    if (!armGeo) {
      armGeo = { up: new THREE.CylinderGeometry(0.07, 0.085, 0.3, 7), hand: new THREE.SphereGeometry(0.11, 8, 6) };
      armGeo.up.translate(0, 0.15, 0);
    }
    const id = (rider.name || '').replace('rider_', '');
    const ch = G.CHARACTERS && G.CHARACTERS.find((c) => c.id === id);
    const cc = ch ? ch.colors : { primary: 0xdd3333, skin: 0xffcc99 };
    const arms = [];
    for (let side = -1; side <= 1; side += 2) {
      const pv = new THREE.Group();
      pv.position.set(side * 0.34, 0.5, 0.04);
      const up = new THREE.Mesh(armGeo.up, armMat(cc.primary));
      const hd = new THREE.Mesh(armGeo.hand, armMat(cc.skin));
      hd.position.y = 0.34;
      pv.add(up, hd);
      pv.visible = false;
      rider.add(pv);
      arms.push(pv);
    }
    rider.userData.arms = arms; // [right (-x), left (+x)]
    rider.userData.by = rider.position.y;
    rider.userData.bs = rider.scale.x;
  }

  // item ids used instantly (fist pump) vs thrown / dropped (wind-up + throw)
  const INSTANT_ITEM = { mushroom: 1, mushroom3: 1, mushroom_gold: 1, star: 1, lightning: 1, chomp: 1 };
  let evHooked = false;

  class Kart {
    constructor(opts) {
      opts = opts || {};
      this.scene = opts.scene;
      this.track = opts.track;
      this.kartId = opts.kartId;
      this.front = opts.frontId;
      this.rear = opts.rearId;
      this.isPlayer = !!opts.isPlayer;
      this.ghost = !!opts.ghost;
      this.coop = null;
      this.index = opts.index || 0;
      this.cc = opts.cc || 100;

      // stats
      const kdef = (G.KARTS && G.KARTS.find((k) => k.id === opts.kartId)) || { speed: 3, accel: 3, handling: 3, mass: 3, weight: 'medium', color: 0xdd3333 };
      let weight = kdef.weight || 'medium';
      try { if (G.Characters && G.Characters.kartWeight) weight = G.Characters.kartWeight(this.front, this.rear) || weight; } catch (e) { /* ignore */ }
      const wTop = weight === 'heavy' ? 1.04 : weight === 'light' ? 0.97 : 1;
      const wAcc = weight === 'heavy' ? 0.9 : weight === 'light' ? 1.06 : 1;
      const base = (G.CC_SPEED && G.CC_SPEED[this.cc]) || 26;
      this.stats = {
        topSpeed: base * (1 + (kdef.speed - 3) * 0.04) * wTop,
        accel: (9.5 + 1.8 * (kdef.accel - 3)) * wAcc,
        handling: 1 + (kdef.handling - 3) * 0.08,
        mass: kdef.mass || 3,
      };
      this.weight = weight;

      // state
      this.pos = new THREE.Vector3();
      this.vel = new THREE.Vector3();
      this.heading = 0;
      this.speed = 0;
      this.y = 0;
      this.speed01 = 0;
      this.input = { accel: 0, brake: 0, steer: 0, drift: false, itemPressed: false, itemReleased: false, item: false, swapPressed: false, throwBack: false };
      this.heldItems = [null, null];
      this.itemCounts = [0, 0];
      this.roulette = [0, 0];
      this.draggedItem = null;
      this.onBeforeHit = null;
      this.trackInfo = { index: 0, dist: 0, lateral: 0, halfWidth: 8, wallDist: 8, y: 0, onRoad: true, surface: 'road', tx: 0, tz: 1, rx: -1, rz: 0 };
      this.trackIndex = -1;
      this.lap = 0;
      this.dist = 0;
      this.lastDist = 0;
      this.raceDist = 0;
      this.lastGoodDist = 0;
      this.lastGoodY = 0;
      this._progressInit = false;
      this.finished = false;
      this.finishTime = 0;
      this.position = 1;
      this.wrongWay = false;
      this._wrongT = 0;

      this.drifting = false;
      this.driftDir = 0;
      this.driftLevel = 0;
      this.driftCharge = 0;
      this.boostTimer = 0;
      this.boostPower = 1;
      this.starTimer = 0;
      this.shrinkTimer = 0;
      this.spinTimer = 0;
      this.invulnTimer = 0;
      this.falling = false;
      this.rescued = false;
      this.cannonFlight = false;
      this.drafting01 = 0;
      this._draft = 0; this._draftCd = 0; this._draftSeen = -1;
      this._slapCd = 0; this._slapAnim = 0; this._slapSide = 1;
      this._wobble = 0; this._wobbleDir = 1;
      this._flickN = 0; this._flickMin = 0; this._flickSt = 0;
      this._driftSteer = 0; this._kx = 0; this._kz = 0; this._impactCd = 0;
      this._cn = null; this._cnT = 0; this._cnDur = 1; this._cnD0 = 0; this._cnD1 = 0; this._cnY0 = 0; this._cnH = 16;
      this._rescueT = 0; this._rp = null;
      this._capX = 0; this._capY = 0; this._capZ = 0; this._capH = 0;
      this._drone = null;
      this._lastSurf = 'road';
      this._gx = 0; this._gz = 0; this._gInit = false;
      this.speedMul = 1;
      this.lostItems = false;
      this.hitKind = null;
      this.flipTimer = 0;
      this.squishTimer = 0;
      this.stallTimer = 0;
      this.burnoutTimer = 0;
      this.airborne = false;
      this.vy = 0;
      this.airTime = 0;
      this.fromJump = false;

      this._fallTimer = 0;
      this._hopTimer = 0;
      this._hopPending = false;
      this._prevDrift = false;
      this._flick = 0;
      this._swapCd = 0;
      this._swapAnim = 0;
      this._wallCd = 0;
      this._wallSnd = 0;
      this._bumpCd = 0;
      this._padCd = 0;
      this._jumpCd = 0;
      this._prevGround = 0;
      this._pitch = 0;
      this._roll = 0;
      this._steerVis = 0;
      this._leanF = 0;
      this._leanR = 0;
      this._driftVis = 0;
      this._wheelSpin = 0;
      this._scale = 1;
      this._spinDur = SPIN_TIME;
      this._flipDur = FLIP_TIME;
      this._frame = 0;
      this._emitSide = 0;
      this._hue = 0;
      // v5 liveliness state
      this._t = 0; this._ph = (this.index * 1.7 + Math.random() * 6.28);
      this._sq = 0; this._sqV = 0; this._sus = 0; this._susV = 0; this._wh = 0; this._whV = 0;
      this._pitchDyn = 0; this._prevSpeed = 0; this._prevVyG = 0; this._prevPy = 0;
      this._landVy = 0; this._wasAir = false; this._airVy = 0; this._prevHop = 0;
      this._dizzy = 0; this._flipLanded = false; this._spinTurns = 1; this._hitFx = 0;
      this._cheerT = 0; this._cheerDur = 1; this._cheerK = 0; this._cheerCd = 0;
      this._throwT = 0; this._throwBack = false; this._throwInstant = false;
      this._slump = 0; this._look = [0, 0, 0]; this._lookCd = 0; this._lookB = 0; this._lbk = 0;
      this._armW = [0, 0]; this._prevHeld0 = null; this._prevHeld1 = null; this._prevPos = 0; this._rev = 0; this._popT = 0;
      this._sk = new Float32Array(16); this._skOn = new Uint8Array(2);
      this._revAI = Math.random() < 0.6; this._holdW = 0;

      // model
      let model = null;
      try {
        if (G.Characters && G.Characters.buildKart) model = G.Characters.buildKart(this.kartId, this.front, this.rear);
      } catch (e) { model = null; }
      if (!model || !model.group) model = buildFallbackKart(kdef.color);
      this.model = model;
      if (!model.wheels) model.wheels = [];
      if (!model.frontWheelPivots) model.frontWheelPivots = [];
      if (!model.exhausts) model.exhausts = [];
      this.mesh = new THREE.Group();
      this.mesh.rotation.order = 'YXZ';
      model.group.rotation.order = 'YXZ';
      this.mesh.add(model.group);
      this._bodyBaseY = model.body ? model.body.position.y : 0;
      // suspended parts (move relative to the wheels): body, chrome, seats -> [obj, baseY, obj, baseY, ...]
      this._susp = [];
      model.group.traverse((o) => { if (o === model.body || o === model.frontSeat || o === model.rearSeat || o.name === 'kartChrome') this._susp.push(o, o.position.y); });
      addArms(model.front); addArms(model.rear);
      if (!evHooked && G.events && G.events.on) {
        evHooked = true;
        G.events.on('itemUsed', (d) => { if (d && d.kart && d.kart._onItemUsed) d.kart._onItemUsed(d.item); });
      }

      // clone materials of body for star flashing
      this._emMats = [];
      const root = model.body || model.group;
      root.traverse((o) => {
        if (o.isMesh && o.material) {
          if (Array.isArray(o.material)) o.material = o.material.map((m) => m.clone());
          else o.material = o.material.clone();
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of ms) if (m.emissive) this._emMats.push(m);
        }
      });

      if (this.ghost) {
        model.group.traverse((o) => {
          if (o.isMesh && o.material) {
            const ms = Array.isArray(o.material) ? o.material : [o.material];
            for (let i = 0; i < ms.length; i++) {
              if (!ms[i]._ghostCloned) { ms[i] = ms[i].clone(); ms[i]._ghostCloned = true; }
              ms[i].transparent = true; ms[i].opacity = 0.4; ms[i].depthWrite = false;
            }
            o.material = Array.isArray(o.material) ? ms : ms[0];
          }
        });
      }

      // exhaust offsets (kart-local) for boost flames; shared FX hub for particles + blob shadows
      let exs = model.exhausts;
      this._exOff = new Float32Array(6);
      this._exN = 2;
      if (!exs.length) { this._exOff.set([-0.4, 0.4, -1.1, 0.4, 0.4, -1.1]); }
      else {
        this.mesh.updateMatrixWorld(true);
        const n = Math.min(2, exs.length);
        this._exN = n;
        for (let i = 0; i < n; i++) {
          const e = exs[i].matrixWorld.elements;
          this._exOff[i * 3] = e[12]; this._exOff[i * 3 + 1] = e[13]; this._exOff[i * 3 + 2] = e[14];
        }
      }
      this._fx = null; this._shSlot = -1;
      if (this.scene && !this.ghost) {
        this._fx = G.Particles.hub(this.scene, this);
        this._shSlot = this._fx.shadow.alloc();
      }

      if (this.scene) this.scene.add(this.mesh);
      this._syncMesh(0);
    }

    // ------------------------------------------------------------ helpers
    getForward(out) {
      return out.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    }

    isInvincible() {
      return this.starTimer > 0 || this.invulnTimer > 0 || this.cannonFlight;
    }

    _snd(name) {
      if (this.isPlayer && !this.ghost && G.Sound && G.Sound.play) G.Sound.play(name);
    }

    _loseItems() {
      const lost = [];
      for (let s = 0; s < 2; s++) {
        const id = this.heldItems[s];
        if (id) { const n = Math.max(1, this.itemCounts[s] | 0); for (let k = 0; k < n; k++) lost.push(id); }
      }
      this.heldItems[0] = null; this.heldItems[1] = null;
      this.itemCounts[0] = 0; this.itemCounts[1] = 0;
      this.roulette[0] = 0; this.roulette[1] = 0;
      this.lostItems = true;
      if (lost.length && G.events) G.events.emit('kartLostItems', { kart: this, items: lost });
    }

    _endDrift(release) {
      if (this.drifting && release) {
        if (this.driftLevel >= 1) { if (this._fx) this._fxMiniTurbo(); this._boost(MT_TIME, 1, false); this._snd('mini_turbo1'); this._cheer(0.7, 0); this._popT = 0.4; this._whV -= 1.4; }
      }
      this.drifting = false;
      this.driftDir = 0;
      this.driftLevel = 0;
      this.driftCharge = 0;
      this._flick = 0;
      this._flickN = 0; this._flickSt = 0; this._flickMin = 0;
    }

    _boost(seconds, power, sound) {
      if (this._fx && this.boostTimer <= 0.05) { this._fxBoostPop(power); this._whV -= 1.6 * Math.min(1.4, power); }
      if (seconds >= this.boostTimer || power > this.boostPower) {
        if (this.boostTimer <= 0 || power >= this.boostPower) this.boostPower = power;
      }
      if (seconds > this.boostTimer) this.boostTimer = seconds;
      const kick = this.stats.topSpeed * (1 + 0.35 * power) * 0.9;
      if (this.speed < kick) this.speed = kick;
      if (sound) this._snd('boost');
    }

    boost(seconds, power) {
      this._boost(seconds, power === undefined ? 1 : power, true);
    }

    rocketStart(level) {
      if (level >= 2) { this._boost(1.2, 1, true); this._whV -= 3.2; this._cheer(1.0, 1); }
      else if (level === 1) { this._boost(0.6, 1, true); this._whV -= 1.6; this._cheer(0.7, 0); }
      else if (level < 0) { this.burnoutTimer = 1.0; this.stallTimer = 1.0; this.speed = 0; this._slump = 0.8; }
    }

    hit(kind) {
      if (this.falling || this.ghost || this.isInvincible()) return;
      if (this.onBeforeHit && this.onBeforeHit(kind) === true) return;
      if (this.spinTimer > 0 || this.squishTimer > 0) return;
      this._endDrift(false);
      this.boostTimer = 0;
      this.hitKind = kind;
      this._dizzy = 1.0; this._cheerT = 0; this._throwT = 0;
      this._flipLanded = false;
      this._spinTurns = Math.abs(this.speed) > 0.65 * this.stats.topSpeed ? 2 : 1;
      if (this._fx) this._fxHit(kind);
      if (kind === 'spin') {
        this.spinTimer = this._spinDur = SPIN_TIME;
        this.speed *= 0.15;
        this._loseItems();
        this.invulnTimer = SPIN_TIME + 1.5;
      } else if (kind === 'flip') {
        this.spinTimer = this._flipDur = FLIP_TIME;
        this.speed = 0;
        this.vel.set(0, 0, 0);
        this._loseItems();
        this.invulnTimer = FLIP_TIME + 1.5;
      } else if (kind === 'squish') {
        this.squishTimer = SQUISH_TIME;
        this.speed *= 0.3;
        this.invulnTimer = SQUISH_TIME + 1.5;
      }
    }

    // shove (no item loss); star / invulnerable karts are not bumped
    bump(vx, vz) {
      if (this.falling || this.ghost || this.isInvincible()) return;
      this.vel.x += vx; this.vel.z += vz;
      this.speed *= 0.8;
      this._wobble = 0.45;
      this._wobbleDir = (vx * Math.cos(this.heading) - vz * Math.sin(this.heading)) > 0 ? -1 : 1;
      this._endDrift(false);
    }

    respawn() {
      const L = this.track ? this.track.length : 1;
      let d = this.lastGoodDist - 5;
      d = ((d % L) + L) % L;
      const rp = this.track.respawnPoint(d);
      this.pos.set(rp.x, rp.y, rp.z);
      this.heading = rp.heading; this._kx = 0; this._kz = 0;
      this.speed = 0;
      this.vel.set(0, 0, 0);
      this.vy = 0;
      this.airborne = false;
      this.falling = false;
      this._fallTimer = 0;
      this.spinTimer = 0; this.squishTimer = 0; this.boostTimer = 0; this.burnoutTimer = 0;
      this._endDrift(false);
      this._hopTimer = 0; this._hopPending = false;
      this.stallTimer = 1.0;
      this.invulnTimer = 2.0;
      this.rescued = false; this.cannonFlight = false;
      if (this._drone) this._drone.visible = false;
      this.trackIndex = -1;
      this._prevGround = rp.y;
      this.y = rp.y;
    }

    // ------------------------------------------------------------ liveliness helpers
    // kind 0: quick hop + fist pump, 1: both arms up (big cheer)
    _cheer(dur, kind) {
      if (this.ghost || this.spinTimer > 0 || this.squishTimer > 0) return;
      if (this._cheerT > 0 && this._cheerK > kind && this._cheerT > dur) return;
      this._cheerT = dur; this._cheerDur = dur; this._cheerK = kind;
    }

    _onItemUsed(item) {
      if (this.ghost) return;
      this._throwInstant = !!(INSTANT_ITEM[item] || (item && item.indexOf('mushroom') === 0));
      this._throwBack = !!this.input.throwBack;
      this._throwT = this._throwInstant ? 0.5 : 0.55;
      if (this._throwInstant) this._cheer(0.6, 0);
    }

    // the human whose input drives this kart (for look-back / countdown rev)
    _humanState() {
      const gm = G.Game;
      if (!gm || !gm.humans || !G.Input) return null;
      for (let i = 0; i < gm.humans.length; i++) {
        const h = gm.humans[i];
        if (h.kart !== this) continue;
        const pl = G.Input.players, idx = this.coop ? this.coop.driver : (h.players ? h.players[0] : 0);
        return (pl && pl[idx] && pl[idx].state) || G.Input.state;
      }
      return null;
    }

    swap() {
      if (this._swapCd > 0 || this.falling) return;
      this._swapCd = 0.4;
      let t = this.front; this.front = this.rear; this.rear = t;
      t = this.heldItems[0]; this.heldItems[0] = this.heldItems[1]; this.heldItems[1] = t;
      t = this.itemCounts[0]; this.itemCounts[0] = this.itemCounts[1]; this.itemCounts[1] = t;
      t = this.roulette[0]; this.roulette[0] = this.roulette[1]; this.roulette[1] = t;
      if (this.coop) { t = this.coop.driver; this.coop.driver = this.coop.thrower; this.coop.thrower = t; }
      this._snd('swap');
      const m = this.model;
      if (!m.frontSeat || !m.rearSeat || !m.front || !m.rear) return;
      if (this._swapAnim > 0) this._finishSwap();
      const parent = m.frontSeat.parent;
      if (!parent) { const f = m.front; m.front = m.rear; m.rear = f; return; }
      this._swFrom = this._swFrom || new THREE.Vector3();
      this._swTo = this._swTo || new THREE.Vector3();
      this._swA = m.front; // moving front -> rear seat
      this._swB = m.rear;  // moving rear -> front seat
      this._swALocal = m.front.position.clone();
      this._swBLocal = m.rear.position.clone();
      parent.add(this._swA); parent.add(this._swB);
      this._swParent = parent;
      this._swapAnim = 0.35;
      this._swapStep(0);
    }

    _swapStep(dt) {
      const m = this.model;
      this._swapAnim -= dt;
      const p = clamp(1 - this._swapAnim / 0.35, 0, 1);
      const sw = Math.sin(p * Math.PI);
      const arc = sw * 0.8;
      const side = sw * 0.42;
      const fs = m.frontSeat.position, rs = m.rearSeat.position;
      // A: front -> rear
      this._swA.position.set(
        fs.x + (rs.x - fs.x) * p + this._swALocal.x - side,
        fs.y + (rs.y - fs.y) * p + arc + this._swALocal.y,
        fs.z + (rs.z - fs.z) * p + this._swALocal.z);
      this._swB.position.set(
        rs.x + (fs.x - rs.x) * p + this._swBLocal.x + side,
        rs.y + (fs.y - rs.y) * p + arc * 1.25 + this._swBLocal.y,
        rs.z + (fs.z - rs.z) * p + this._swBLocal.z);
      this._swA.rotation.y = p * TAU; this._swB.rotation.y = -p * TAU;
      // somersault-ish tuck + stretch while airborne, squash on touchdown
      this._swA.rotation.x = -sw * 0.6; this._swB.rotation.x = -sw * 0.6;
      this._swA.rotation.z = sw * 0.35; this._swB.rotation.z = -sw * 0.35;
      const st = p > 0.85 ? 1 - Math.sin((p - 0.85) / 0.15 * Math.PI) * 0.22 : 1 + sw * 0.12;
      this._swA.scale.y = this._swB.scale.y = (this._swA.userData.bs || 1) * st;
      if (this._swapAnim <= 0) this._finishSwap();
    }

    _finishSwap() {
      const m = this.model;
      this._swapAnim = 0;
      if (!this._swA) return;
      this._swA.rotation.set(0, 0, 0); this._swB.rotation.set(0, 0, 0);
      this._swA.scale.y = this._swA.userData.bs || this._swA.scale.x; this._swB.scale.y = this._swB.userData.bs || this._swB.scale.x;
      this._cheer(0.45, 0);
      m.rearSeat.add(this._swA);
      m.frontSeat.add(this._swB);
      this._swA.position.copy(this._swALocal);
      this._swB.position.copy(this._swBLocal);
      m.front = this._swB;
      m.rear = this._swA;
      this._swA = null; this._swB = null;
    }

    // ------------------------------------------------------------ slap
    _slap() {
      this._slapCd = SLAP_CD;
      this._slapAnim = SLAP_ANIM;
      const karts = Kart._karts;
      const s = Math.sin(this.heading), c = Math.cos(this.heading);
      const rx = -c, rz = s;
      let side = this._slapSide, bestD = 1e9, victim = null, vlat = 0;
      if (karts) {
        for (let i = 0; i < karts.length; i++) {
          const k = karts[i];
          if (!k || k === this || k.ghost || k.falling || k.cannonFlight) continue;
          const dx = k.pos.x - this.pos.x, dz = k.pos.z - this.pos.z;
          const d2 = dx * dx + dz * dz;
          if (d2 > 9) continue;
          const along = dx * s + dz * c;
          if (Math.abs(along) > 2.4) continue;
          if (d2 < bestD) { bestD = d2; victim = k; vlat = dx * rx + dz * rz; }
        }
      }
      if (victim) side = vlat >= 0 ? 1 : -1;
      else side = (this.input.steer || 0) < -0.2 ? -1 : 1;
      this._slapSide = side;
      this._snd('slap');
      if (!victim || victim.isInvincible()) return;
      victim.bump(rx * side * 9, rz * side * 9);
      if (victim.isPlayer && !this.isPlayer) victim._snd('slap');
      if (victim.heldItems[0] && !this.heldItems[0] && !victim.draggedItem) {
        this.heldItems[0] = victim.heldItems[0]; this.itemCounts[0] = victim.itemCounts[0];
        victim.heldItems[0] = null; victim.itemCounts[0] = 0; victim.roulette[0] = 0;
        this.stolen = true;
        if (G.events) G.events.emit('kartSlapSteal', { thief: this, victim: victim, item: this.heldItems[0] });
      }
    }

    // ------------------------------------------------------------ cannon flight
    _startCannon(to, height) {
      const track = this.track, L = track.length, ti = this.trackInfo;
      if (this.cannonFlight || this.falling) return false;
      let d1 = ((to % L) + L) % L;
      const d0 = ti.dist;
      if (d1 <= d0) d1 += L;
      const len = d1 - d0;
      this._cnD0 = d0; this._cnD1 = d1; this._cnY0 = this.pos.y;
      this._cnH = height !== undefined ? height : Math.min(30, 8 + len * 0.12);
      this._cnDur = clamp(len / 48, 1.1, 4.5);
      this._cnT = 0;
      this.cannonFlight = true;
      this.airborne = false;
      this._endDrift(false);
      this._snd('cannon');
      return true;
    }

    _updateCannon(dt) {
      const track = this.track, L = track.length, ti = this.trackInfo;
      this._cnT += dt;
      const u = clamp(this._cnT / this._cnDur, 0, 1);
      let d = this._cnD0 + (this._cnD1 - this._cnD0) * u;
      d = ((d % L) + L) % L;
      const p = track.pointAt(d);
      const arc = 4 * this._cnH * u * (1 - u);
      const prevY = this.pos.y;
      this.pos.x = p.x; this.pos.z = p.z;
      this.pos.y = this._cnY0 + (p.y - this._cnY0) * u + arc;
      this.vy = (this.pos.y - prevY) / dt;
      this.heading = Math.atan2(p.tx, p.tz);
      const cruise = (this._cnD1 - this._cnD0) / this._cnDur;
      this.speed = Math.min(cruise, this.stats.topSpeed * 1.2);
      this.vel.set(p.tx * this.speed, 0, p.tz * this.speed);
      ti.dist = d; ti.lateral = 0; ti.onRoad = true; ti.surface = 'road'; ti.y = p.y;
      ti.tx = p.tx; ti.tz = p.tz; ti.rx = p.rx; ti.rz = p.rz; ti.halfWidth = p.halfWidth; ti.wallDist = p.halfWidth;
      this._updateProgress(dt);
      if (u >= 1) {
        this.cannonFlight = false;
        this.airborne = false;
        this.pos.y = p.y; this.vy = 0; this.airTime = 0;
        this.speed = this.stats.topSpeed * 0.9;
        this.vel.set(p.tx * this.speed, 0, p.tz * this.speed);
        this.trackIndex = -1;
        this.lastGoodDist = d; this.lastGoodY = p.y; this._prevGround = p.y;
        this.invulnTimer = Math.max(this.invulnTimer, 0.5);
        this._lastSurf = 'road';
      }
      this._visuals(dt, 0);
    }

    // ------------------------------------------------------------ rescue drone
    _startRescue() {
      const track = this.track;
      if (!track || !track.respawnPoint) return false;
      const L = track.length;
      let d = this.lastGoodDist - 5;
      d = ((d % L) + L) % L;
      this._rp = track.respawnPoint(d);
      this._capX = this.pos.x; this._capY = this.pos.y; this._capZ = this.pos.z; this._capH = this.heading;
      this.rescued = true;
      this._rescueT = 0;
      this.speed = 0; this.vel.set(0, 0, 0); this.vy = 0;
      if (!this._drone) {
        this._drone = buildDrone();
        if (this.scene) this.scene.add(this._drone);
      }
      this._drone.visible = true;
      this._fxBubbles(16);
      this._snd('hop');
      return true;
    }

    _updateRescue(dt) {
      const rp = this._rp;
      this._rescueT += dt;
      const t = this._rescueT;
      const dr = this._drone, ud = dr.userData;
      const e = (x) => x * x * (3 - 2 * x);
      this._fallTimer = FALL_TIME + t;
      if (t < CARRY_TIME) {
        const p = clamp(t / CARRY_TIME, 0, 1);
        const ep = e(p);
        this.pos.x = this._capX + (rp.x - this._capX) * ep;
        this.pos.z = this._capZ + (rp.z - this._capZ) * ep;
        const hangY = rp.y + 2.6;
        const yUp = this._capY + (hangY - this._capY) * e(clamp(p / 0.7, 0, 1));
        this.pos.y = p < 0.7 ? yUp : hangY + (rp.y - hangY) * e((p - 0.7) / 0.3);
        let dh = rp.heading - this._capH;
        while (dh > Math.PI) dh -= TAU; while (dh < -Math.PI) dh += TAU;
        this.heading = this._capH + dh * ep;
        // drone sits above the kart; swoops in over the first 0.25 s
        const sw = clamp(1 - t / 0.25, 0, 1);
        dr.position.set(this.pos.x + sw * 7, this.pos.y + DRONE_HANG + sw * 3, this.pos.z + sw * 4);
      }
      ud.rotor.rotation.y += dt * 40;
      const len = Math.max(0.3, DRONE_HANG - 0.9);
      ud.line.scale.y = len; ud.line.position.y = -0.4 - len / 2;
      ud.claw.position.y = -0.4 - len;
      dr.rotation.y = this.heading;
      dr.rotation.z = Math.sin(t * 6) * 0.05;
      this.trackInfo.y = this.pos.y;
      this._visuals(dt, 0);
      if (t >= CARRY_TIME) {
        this.rescued = false; this.falling = false;
        this._drone.visible = false;
        this.pos.set(rp.x, rp.y, rp.z);
        this.heading = rp.heading; this._kx = 0; this._kz = 0;
        this.speed = 0; this.vel.set(0, 0, 0); this.vy = 0;
        this.airborne = false; this.airTime = 0;
        this._fallTimer = 0;
        this.spinTimer = 0; this.squishTimer = 0; this.boostTimer = 0; this.burnoutTimer = 0;
        this._endDrift(false);
        this._hopTimer = 0; this._hopPending = false;
        this.invulnTimer = 1.0;
        this.stallTimer = 0.2;
        this.trackIndex = -1;
        this._prevGround = rp.y; this.lastGoodY = rp.y;
        this._lastSurf = 'road';
        this.y = rp.y;
      }
    }

    // ------------------------------------------------------------ ghost drive (no physics)
    setGhostPose(x, y, z, heading, yawOffset, steer) {
      const m = this.model;
      if (!this._gInit) { this._gx = x; this._gz = z; this._gInit = true; }
      const dx = x - this._gx, dz = z - this._gz;
      this._gx = x; this._gz = z;
      this._wheelSpin += Math.sqrt(dx * dx + dz * dz) / 0.35;
      this.pos.set(x, y, z);
      this.heading = heading;
      this.y = y;
      this.mesh.position.set(x, y, z);
      this.mesh.rotation.set(0, heading, 0);
      m.group.rotation.y = yawOffset || 0;
      const wh = m.wheels;
      for (let i = 0; i < wh.length; i++) wh[i].rotation.x = this._wheelSpin;
      const pv = m.frontWheelPivots;
      for (let i = 0; i < pv.length; i++) pv[i].rotation.y = -(steer || 0) * 0.45;
      if (m.front) m.front.rotation.z = (steer || 0) * 0.18;
      if (m.rear) m.rear.rotation.z = (steer || 0) * 0.14;
    }

    // ------------------------------------------------------------ particles (shared FX hub, see G.Particles)
    _exWorld(i, out) {
      const o = this._exOff, sc = this._scale, s = Math.sin(this.heading), c = Math.cos(this.heading);
      const lx = o[i * 3] * sc, ly = o[i * 3 + 1] * sc, lz = o[i * 3 + 2] * sc;
      out[0] = this.pos.x + c * lx + s * lz; out[1] = this.pos.y + ly; out[2] = this.pos.z - s * lx + c * lz;
    }

    // flame burst at the exhausts when a boost starts (all boosts)
    _fxBoostPop(power) {
      const A = this._fx.add, s = Math.sin(this.heading), c = Math.cos(this.heading), w = FX_W;
      for (let e = 0; e < this._exN; e++) {
        this._exWorld(e, w);
        for (let j = 0; j < 6; j++) {
          const sp = 8 + Math.random() * 10, sd = (Math.random() - 0.5) * 3;
          A.endColor(1, 0.25, 0.02);
          A.spawn(0, 1, w[0] - s * 0.4, w[1], w[2] - c * 0.4, -s * sp + c * sd, 0.5 + Math.random(), -c * sp - s * sd, 0.3 + Math.random() * 0.2, 0.22, 0.08, 1, 0.8, 0.3, 0.9, 2, 1.5);
        }
        A.endColor(1, 0.4, 0.05);
        A.spawn(0, 0, w[0] - s * 0.5, w[1], w[2] - c * 0.5, -s * 2, 0, -c * 2, 0.28, 1.0, 2.2, 1, 0.85, 0.5, 0.7, 0, 3);
      }
    }

    // mini-turbo release burst (drift level >= 1)
    _fxMiniTurbo() {
      const A = this._fx.add, s = Math.sin(this.heading), c = Math.cos(this.heading), y = this.pos.y + 0.25;
      for (let side = -1; side <= 1; side += 2) {
        const bx = this._wx(1.0, side * 0.75), bz = this._wz(1.0, side * 0.75);
        A.endColor(0.15, 0.35, 1);
        A.spawn(0, 0, bx, y, bz, 0, 0.5, 0, 0.3, 0.6, 1.9, 0.4, 0.65, 1, 0.8, 0, 0);
        for (let j = 0; j < 9; j++) {
          const a = Math.random() * 6.283, sp = 5 + Math.random() * 9;
          A.endColor(0.2, 0.35, 1);
          A.spawn(0, 1, bx, y, bz, Math.cos(a) * sp - s * 6, 1 + Math.random() * 5, Math.sin(a) * sp - c * 6, 0.35 + Math.random() * 0.3, 0.14, 0.05, 0.6, 0.85, 1, 1, 12, 0.6);
        }
        for (let j = 0; j < 2; j++) {
          A.endColor(0.15, 0.35, 1);
          A.spawn(1, 0, bx + (Math.random() - 0.5) * 0.8, y + Math.random() * 0.6, bz + (Math.random() - 0.5) * 0.8, 0, 1.5, 0, 0.4, 0.5, 0.1, 0.5, 0.75, 1, 0.9, 0, 0);
        }
      }
      A.endColor(0.2, 0.5, 1);
      A.spawn(2, 2, this.pos.x, this.pos.y + 0.1, this.pos.z, 0, 0, 0, 0.4, 1.2, 6, 0.4, 0.65, 1, 0.7, 0, 0);
    }

    // per-frame visual effects; called once at the end of update()
    _updateFx(dt, burn, spd01) {
      const fx = this._fx;
      if (!fx) return;
      const A = fx.add, S = fx.alpha, fr = this._frame, w = FX_W;
      const hd = this.heading, sn = Math.sin(hd), cs = Math.cos(hd), py = this.pos.y;
      const rnd = Math.random;
      // ---- blob shadow
      {
        const gy = this._gy;
        const h = Math.max(0, py - gy);
        const ss = this._scale * (1 - clamp(h * 0.06, 0, 0.55));
        const vis = (!this.falling || this._fallTimer < 0.4 || this.cannonFlight);
        fx.shadow.set(this._shSlot, this.pos.x, gy + 0.06, this.pos.z, hd, 1.35 * ss, 1.75 * ss, vis ? 0.62 * (1 - clamp(h * 0.04, 0, 0.5)) : 0);
      }
      // ---- drift sparks (yellow -> blue) with streaks + glow
      if (this.drifting && this.driftCharge > 0.3 && !this.airborne) {
        const blue = this.driftLevel >= 1;
        const r = blue ? 0.3 : 1, g = blue ? 0.62 : 0.78, b = blue ? 1 : 0.15;
        const er = blue ? 0.1 : 1, eg = blue ? 0.25 : 0.3, eb = blue ? 1 : 0.02;
        for (let side = -1; side <= 1; side += 2) {
          const bx = this._wx(1.05, side * 0.78), bz = this._wz(1.05, side * 0.78), by = py + 0.18;
          const pul = 0.85 + 0.25 * Math.sin(fr * 0.9 + side);
          A.put(0, 0, bx, by, bz, (blue ? 1.15 : 0.9) * pul, r, g, b, 0.55, 0, 0, 0, 0);
          A.put(0, 0, bx, by, bz, 0.42 * pul, 1, 1, 1, 0.9, 0, 0, 0, 0);
          for (let j = 0; j < 3; j++) {
            const sp = 3 + rnd() * 8, a = (rnd() - 0.5) * 2.2;
            // sparks fly out backward and to the outside of the drift
            const vx = -sn * sp * 0.7 - cs * side * sp * 0.7 * Math.cos(a) + cs * (rnd() - 0.5) * 2;
            const vz = -cs * sp * 0.7 + sn * side * sp * 0.7 * Math.cos(a) - sn * (rnd() - 0.5) * 2;
            A.endColor(er, eg, eb);
            A.spawn(0, 1, bx, by, bz, vx, 2 + rnd() * 4, vz, 0.22 + rnd() * 0.28, 0.085, 0.03, blue ? 0.75 : 1, blue ? 0.9 : 0.95, blue ? 1 : 0.6, 1, 16, 0.4);
          }
        }
        if ((fr & 1) === 0) {
          const side = (fr & 2) ? 0.78 : -0.78;
          A.endColor(er, eg, eb);
          A.spawn(1, 0, this._wx(1.05, side), py + 0.3, this._wz(1.05, side), (rnd() - 0.5) * 2, 1.5 + rnd() * 2, (rnd() - 0.5) * 2, 0.3, 0.32, 0.08, blue ? 0.7 : 1, blue ? 0.85 : 0.9, blue ? 1 : 0.5, 0.95, 4, 0.5);
        }
      }
      // ---- drift smoke / tire smoke
      if ((((this.drifting && !this.airborne) && spd01 > 0.05) || burn) && (fr % 3) === 0) {
        const side = (fr & 3) ? 0.75 : -0.75;
        const grey = burn ? 0.8 : 0.9;
        S.endColor(grey * 0.85, grey * 0.85, grey * 0.9);
        S.spawn(3, 0, this._wx(1.0, side), py + 0.15, this._wz(1.0, side), -sn * 1.5 + (rnd() - 0.5), 0.9 + rnd() * 0.7, -cs * 1.5 + (rnd() - 0.5), burn ? 0.9 : 0.65, 0.6, burn ? 2.6 : 2.0, grey, grey, grey, burn ? 0.8 : 0.55, -0.4, 1.2);
      }
      // ---- surface puffs
      const sf = this.trackInfo.surface;
      if (!this.airborne && !this.falling && !this.cannonFlight && spd01 > 0.2 && (SURF_MUL[sf] || (!this.trackInfo.onRoad && sf === 'offroad'))) {
        const side = (fr & 1) ? 0.75 : -0.75;
        const bx = this._wx(0.9, side), bz = this._wz(0.9, side), by = py + 0.12;
        const k = 0.6 + spd01 * 0.6;
        if (sf === 'water') {
          S.endColor(0.8, 0.92, 1);
          S.spawn(3, 0, bx, by, bz, (rnd() - 0.5) * 3, 2.5 + rnd() * 2, (rnd() - 0.5) * 3, 0.6, 0.6, 1.8, 0.75, 0.9, 1, 0.8, 9, 1);
          for (let j = 0; j < 3; j++) A.spawn(0, 1, bx, by, bz, (rnd() - 0.5) * 7, 4 + rnd() * 4, (rnd() - 0.5) * 7, 0.5, 0.12, 0.05, 0.8, 0.95, 1, 0.9, 22, 0.2);
        } else if (sf === 'mud') {
          S.endColor(0.28, 0.17, 0.08);
          S.spawn(3, 0, bx, by, bz, (rnd() - 0.5) * 3, 2.2 + rnd() * 2, (rnd() - 0.5) * 3, 0.65, 0.8 * k, 2.0 * k, 0.42, 0.26, 0.12, 0.9, 11, 0.8);
          S.spawn(0, 0, bx, by, bz, (rnd() - 0.5) * 6, 3 + rnd() * 3, (rnd() - 0.5) * 6, 0.5, 0.2, 0.15, 0.26, 0.15, 0.07, 0.95, 24, 0.1);
        } else if (sf === 'sand') {
          S.endColor(0.85, 0.75, 0.5);
          S.spawn(3, 0, bx, by, bz, (rnd() - 0.5) * 1.5 - sn * 1.5, 0.9 + rnd() * 0.8, (rnd() - 0.5) * 1.5 - cs * 1.5, 0.85, 1.0 * k, 3.4 * k, 0.92, 0.8, 0.52, 0.8, -0.3, 1.2);
        } else {
          S.endColor(0.62, 0.55, 0.38);
          S.spawn(3, 0, bx, by, bz, (rnd() - 0.5) * 1.5 - sn * 1.5, 0.9 + rnd() * 0.8, (rnd() - 0.5) * 1.5 - cs * 1.5, 0.8, 0.9 * k, 3.2 * k, 0.6, 0.52, 0.34, 0.8, -0.3, 1.2);
        }
      }
      // faint exhaust puffs at speed
      if (this.boostTimer <= 0 && spd01 > 0.3 && (fr & 7) === 0 && !this.falling) {
        const side = (fr & 8) ? 0.4 : -0.4;
        S.spawn(3, 0, this._wx(1.25, side), py + 0.4, this._wz(1.25, side), (rnd() - 0.5) * 0.4, 0.5, (rnd() - 0.5) * 0.4, 0.45, 0.25, 0.7, 0.85, 0.85, 0.9, 0.16, -0.4, 1);
      }
      // ---- boost exhaust flames: layered additive sprites + stretched tongue + trailing sparks
      if (this.boostTimer > 0 && !this.falling) {
        const fade = Math.min(1, this.boostTimer * 5);
        for (let e = 0; e < this._exN; e++) {
          this._exWorld(e, w);
          const fl = 0.85 + 0.3 * Math.sin(fr * 2.1 + e * 2.7) + (rnd() - 0.5) * 0.25;
          const ex = w[0], ey = w[1], ez = w[2];
          A.put(0, 0, ex - sn * 0.15, ey, ez - cs * 0.15, 1.9 * fl * fade, 1, 0.38, 0.05, 0.5, 0, 0, 0, 0);
          A.put(0, 0, ex - sn * 0.5, ey, ez - cs * 0.5, 1.0 * fl * fade, 1, 0.65, 0.12, 0.8, 0, 0, 0, 0);
          A.put(0, 0, ex - sn * 0.85, ey, ez - cs * 0.85, 0.65 * fl * fade, 1, 0.85, 0.3, 0.75, 0, 0, 0, 0);
          A.put(0, 0, ex - sn * 0.2, ey, ez - cs * 0.2, 0.55 * fl * fade, 0.7, 0.85, 1, 0.95, 0, 0, 0, 0);
          const L = 0.9 * fl;
          A.put(0, 1, ex - sn * (0.3 + L), ey, ez - cs * (0.3 + L), 0.3 * fade, 1, 0.55, 0.1, 0.85, -sn * 22, 0, -cs * 22, 0);
          if ((fr & 1) === 0) {
            const sp = 7 + rnd() * 6;
            A.endColor(1, 0.2, 0.02);
            A.spawn(0, 1, ex - sn * 0.6, ey, ez - cs * 0.6, -sn * sp + (rnd() - 0.5) * 2, (rnd() - 0.5) * 1.2, -cs * sp + (rnd() - 0.5) * 2, 0.3 + rnd() * 0.15, 0.16, 0.05, 1, 0.75, 0.25, 0.9, 1, 1);
          }
          if ((fr % 5) === 0) {
            S.endColor(0.3, 0.3, 0.32);
            S.spawn(3, 0, ex - sn * 0.9, ey + 0.1, ez - cs * 0.9, -sn * 3, 0.6, -cs * 3, 0.5, 0.35, 1.0, 0.5, 0.45, 0.4, 0.18, -0.2, 1.5);
          }
        }
      }
      // ---- star power: rainbow sparkle trail + aura
      if (this.starTimer > 0 && !this.falling) {
        const hue = (this._hue + 0.33) % 1;
        hsv(hue, 0.65, 1);
        A.put(0, 0, this.pos.x, py + 0.7, this.pos.z, 3.4 * this._scale * (0.92 + 0.12 * Math.sin(fr * 0.7)), RGB[0], RGB[1], RGB[2], 0.28, 0, 0, 0, 0);
        for (let j = 0; j < 2; j++) {
          const h0 = rnd();
          hsv(h0, 0.85, 1);
          const sr = RGB[0], sg = RGB[1], sb = RGB[2];
          hsv((h0 + 0.3) % 1, 0.85, 1);
          const a = rnd() * 6.283, rr = 0.6 + rnd() * 0.9;
          A.endColor(RGB[0], RGB[1], RGB[2]);
          A.spawn(1, 0, this.pos.x + Math.cos(a) * rr - sn * (0.6 + rnd() * 1.4), py + 0.2 + rnd() * 1.1, this.pos.z + Math.sin(a) * rr - cs * (0.6 + rnd() * 1.4),
            (rnd() - 0.5) * 1.5, 0.8 + rnd() * 1.4, (rnd() - 0.5) * 1.5, 0.45 + rnd() * 0.4, 0.42, 0.08, sr, sg, sb, 0.95, -1, 0.5);
        }
      }
      // ---- slipstream wind lines
      if (this.drafting01 > 0.05) {
        const sd = (rnd() < 0.5 ? -1 : 1) * (0.8 + rnd() * 0.9), ah = 1.5 + rnd() * 2.5;
        const u = this.drafting01;
        A.spawn(0, 1, this._wx(-ah, sd), py + 0.25 + rnd() * 0.9, this._wz(-ah, sd), -sn * 30, 0, -cs * 30, 0.32, 0.09, 0.04, 0.85, 0.95, 1, 0.55 + 0.4 * u, 0, 0);
      }
      this._updateFx2(dt, burn, spd01);
    }

    // world offset from kart center: back distance, side (right +)
    _wx(back, side) {
      const s = Math.sin(this.heading), c = Math.cos(this.heading);
      return this.pos.x - s * back - c * side;
    }
    _wz(back, side) {
      const s = Math.sin(this.heading), c = Math.cos(this.heading);
      return this.pos.z - c * back + s * side;
    }

    // ------------------------------------------------------------ main update
    update(dt) {
      const inp = this.input;
      const st = this.stats;
      const track = this.track;
      if (this.ghost) return;
      if (this._fx) this._fx.step(this, dt);
      this._frame++;
      if (this._slapCd > 0) this._slapCd -= dt;
      if (this._slapAnim > 0) this._slapAnim -= dt;
      if (this._draftCd > 0) this._draftCd -= dt;
      if (this._wobble > 0) this._wobble -= dt;

      // timers
      if (this.boostTimer > 0) this.boostTimer -= dt;
      if (this.starTimer > 0) this.starTimer -= dt;
      if (this.shrinkTimer > 0) this.shrinkTimer -= dt;
      if (this.invulnTimer > 0) this.invulnTimer -= dt;
      if (this.stallTimer > 0) this.stallTimer -= dt;
      if (this.burnoutTimer > 0) this.burnoutTimer -= dt;
      if (this._swapCd > 0) this._swapCd -= dt;
      if (this._wallCd > 0) this._wallCd -= dt;
      if (this._wallSnd > 0) this._wallSnd -= dt;
      if (this._bumpCd > 0) this._bumpCd -= dt;
      if (this._jumpCd > 0) this._jumpCd -= dt;
      if (this.squishTimer > 0) this.squishTimer -= dt;
      if (this._hopTimer > 0) this._hopTimer -= dt;
      if (this.spinTimer > 0) { this.spinTimer -= dt; if (this.spinTimer <= 0) this.hitKind = null; }
      if (this._swapAnim > 0) this._swapStep(dt);

      if (this.rescued) { this._updateRescue(dt); return; }
      if (this.cannonFlight) { this._updateCannon(dt); return; }

      if (inp.swapPressed && !this.falling && this.spinTimer <= 0) this.swap();
      if (!this.falling && this.spinTimer <= 0 && this.squishTimer <= 0 && this._slapCd <= 0 &&
          (inp.slapPressed || (inp.itemPressed && !this.heldItems[0] && !this.heldItems[1] && this.roulette[0] <= 0 && this.roulette[1] <= 0))) this._slap();

      const stunned = this.spinTimer > 0 || this.falling || this.stallTimer > 0;
      const topBase = st.topSpeed;
      const grounded = !this.airborne;

      // ---- falling state
      if (this.falling) {
        this._fallTimer += dt;
        this.vy -= GRAVITY * 0.6 * dt;
        this.pos.y += this.vy * dt;
        this.vel.multiplyScalar(0.97);
        this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
        this.speed *= 0.97;
        if (this._fallTimer >= FALL_TIME) { if (!this._startRescue()) { if (this._fallTimer >= 1.2) this.respawn(); } else { this._updateRescue(0); return; } }
        this._visuals(dt, 0);
        return;
      }

      // ---- surface / top speed
      const ti = this.trackInfo;
      const surfNow = ti.surface;
      let smul = SURF_MUL[surfNow] || 1;
      if (smul === 1 && !ti.onRoad && surfNow !== 'boost' && surfNow !== 'jump' && surfNow !== 'ice' && surfNow !== 'cannon' && surfNow !== 'void') smul = 0.55;
      const offroad = smul < 1;
      const onIce = surfNow === 'ice';
      const boosting = this.boostTimer > 0;
      let top = topBase * this.speedMul;
      if (boosting) top *= 1 + 0.35 * this.boostPower;
      if (this.starTimer > 0) top *= 1.15;
      if (this.shrinkTimer > 0) top *= 0.7;
      if (this.squishTimer > 0) top *= 0.6;
      if (offroad && !boosting && this.starTimer <= 0 && grounded) top *= smul;

      // ---- speed
      if (stunned) {
        const drag = this.spinTimer > 0 ? 18 : 30;
        if (this.speed > 0) this.speed = Math.max(0, this.speed - drag * dt);
        else this.speed = Math.min(0, this.speed + drag * dt);
        if (this.spinTimer > 0 && this.hitKind === 'flip') this.speed = 0;
      } else if (grounded) {
        const acc = inp.accel > 0.5, brk = inp.brake > 0.5;
        const frac = clamp(this.speed / top, 0, 1.5);
        if (acc) {
          if (this.speed < top) {
            let a = st.accel * (frac < 0.7 ? 1 : 0.3);
            if (boosting) a *= 3;
            if (this.speed < 0) a = 30;
            this.speed = Math.min(top, this.speed + a * dt);
          }
        } else if (brk) {
          if (this.speed > 0.5) this.speed -= 28 * dt;
          else this.speed = Math.max(-6, this.speed - 10 * dt);
        } else {
          const d = (3.5 + 0.06 * Math.abs(this.speed)) * dt;
          if (this.speed > d) this.speed -= d; else if (this.speed < -d) this.speed += d; else this.speed = 0;
        }
        if (this.speed > top) {
          this.speed = Math.max(top, this.speed - (offroad ? 16 : 7) * dt);
        }
      }
      if (this.burnoutTimer > 0) this.speed = 0;

      // ---- drift state machine
      const driftEdge = inp.drift && !this._prevDrift;
      this._prevDrift = !!inp.drift;
      const steer = stunned ? 0 : clamp(inp.steer || 0, -1, 1);
      const spd01 = Math.abs(this.speed) / topBase;

      if (!stunned) {
        if (driftEdge && grounded && !this.drifting && this._hopTimer <= 0) {
          this._hopTimer = HOP_TIME;
          this._hopPending = true;
          this._snd('hop');
        }
        if (this._hopPending && !this.drifting) {
          if (!inp.drift) this._hopPending = false;
          else if (Math.abs(steer) > 0.3 && spd01 > 0.4) {
            this.drifting = true;
            this.driftDir = steer > 0 ? 1 : -1;
            this.driftCharge = 0; this.driftLevel = 0; this._flick = 0; this._flickSeen = 0;
            this._flickN = 0; this._flickSt = 0; this._flickMin = 0; this._driftSteer = steer;
            this._hopPending = false;
            this._snd('drift_start');
          } else if (this._hopTimer <= 0) this._hopPending = false;
        }
      }
      if (this.drifting) {
        if (!inp.drift) {
          this._endDrift(true);
        } else if (spd01 < 0.25 || stunned) {
          this._endDrift(false);
        } else {
          // wiggle-only charge. Forgiving for keyboards (input.js ramps/snaps steer ~8-12 /s):
          // a flick = rel dips below -0.15 then comes back above 0.35 (or returns to centre after a deep dip).
          const rel = steer * this.driftDir;
          if (this._flickSt === 0) {
            if (rel < -0.15) { this._flickSt = 1; this._flickMin = rel; }
          } else {
            if (rel < this._flickMin) this._flickMin = rel;
            if (rel > 0.35 || (rel > -0.02 && this._flickMin < -0.45)) { this._flickSt = 0; this._flickN++; }
          }
          // holding the slide charges on its own; DD-style wiggles charge faster
          this.driftCharge = (this.driftCharge || 0) + CHARGE_RATE * dt;
          if (this._flickN !== this._flickSeen) { this.driftCharge += CHARGE_FLICK * (this._flickN - (this._flickSeen || 0)); this._flickSeen = this._flickN; }
          const wasBlue = this.driftLevel >= 1;
          this.driftLevel = this.driftCharge >= CHARGE_BLUE ? 1 : 0;
          if (!wasBlue && this.driftLevel >= 1) this._snd('drift_start');
        }
      }

      // ---- steering
      if (!stunned || this.stallTimer > 0 && this.spinTimer <= 0 && !this.falling) {
        const f = spd01;
        let c = Math.pow(Math.min(f / 0.5, 1), 0.7);
        if (f > 0.6) c *= 1 - 0.2 * Math.min(1, (f - 0.6) / 0.4);
        if (this.airborne) c *= 0.5;
        let rate = 1.9 * st.handling * c;
        if (onIce) rate *= 0.85;
        const sgn = this.speed < 0 ? -1 : 1;
        if (this.drifting) {
          this._driftSteer = damp(this._driftSteer, steer, 7, dt);
          const turn = this.driftDir * (0.6 + 0.35 * this._driftSteer * this.driftDir);
          this.heading -= turn * rate * 0.95 * dt;
        } else {
          this.heading -= steer * rate * sgn * dt;
        }
      }

      // ---- velocity (slip)
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      const grip = this.airborne ? 1.5 : onIce ? (this.drifting ? 0.9 : 1.1) : this.drifting ? 2.8 : 7;
      const kg = 1 - Math.exp(-grip * dt);
      this.vel.x += (fx * this.speed - this.vel.x) * kg;
      this.vel.z += (fz * this.speed - this.vel.z) * kg;
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      // kart-to-kart knock-back decays on its own so bumps read as bounces, not sticking
      if (this._kx !== 0 || this._kz !== 0) {
        this.pos.x += this._kx * dt; this.pos.z += this._kz * dt;
        const kd = Math.exp(-5 * dt);
        this._kx *= kd; this._kz *= kd;
        if (this._kx * this._kx + this._kz * this._kz < 0.01) { this._kx = 0; this._kz = 0; }
      }
      if (this._impactCd > 0) this._impactCd -= dt;
      if (this._wobble > 0) this.heading += this._wobbleDir * Math.sin(this._wobble * 40) * 0.6 * dt;

      // ---- vertical
      if (this.airborne) {
        this.vy -= GRAVITY * dt;
        this.pos.y += this.vy * dt;
        this.airTime += dt;
      }

      // ---- track query
      if (track) this._queryTrack(dt);

      // ---- progress
      this._updateProgress(dt);

      // ---- visuals
      this._visuals(dt, steer);
      this.speed01 = clamp(this.speed / topBase, -1, 1.5);
    }

    _queryTrack(dt) {
      const ti = this.trackInfo;
      const r = this.track.query(this.pos.x, this.pos.z, this.trackIndex, this.pos.y);
      ti.index = r.index; ti.dist = r.dist; ti.lateral = r.lateral; ti.halfWidth = r.halfWidth;
      ti.wallDist = r.wallDist; ti.y = r.y; ti.onRoad = r.onRoad; ti.surface = r.surface;
      ti.tx = r.tx; ti.tz = r.tz; ti.rx = r.rx; ti.rz = r.rz;
      this.trackIndex = r.index;
      const surf = ti.surface;

      // walls (void edge takes precedence on wall-less tracks)
      const lat = ti.lateral;
      const wd = ti.wallDist;
      if (Math.abs(lat) > wd && surf !== 'void') {
        const sgn = lat > 0 ? 1 : -1;
        const excess = Math.abs(lat) - wd + 0.05;
        this.pos.x -= ti.rx * sgn * excess;
        this.pos.z -= ti.rz * sgn * excess;
        const vl = this.vel.x * ti.rx + this.vel.z * ti.rz;
        if (vl * sgn > 0) {
          this.vel.x -= ti.rx * vl * 1.55; // bounce off (restitution ~0.55)
          this.vel.z -= ti.rz * vl * 1.55;
        }
        if (this._wallCd <= 0) {
          this._wallCd = 0.25;
          const into = Math.abs(Math.sin(this.heading) * ti.rx + Math.cos(this.heading) * ti.rz); // 0 glancing .. 1 head-on
          this.speed *= 1 - 0.5 * into;
          this.vel.x *= 0.9; this.vel.z *= 0.9;
          this._kx -= ti.rx * sgn * 3 * into; this._kz -= ti.rz * sgn * 3 * into;
          // nudge heading toward track tangent
          const th = Math.atan2(ti.tx, ti.tz);
          let dh = th - this.heading;
          while (dh > Math.PI) dh -= TAU;
          while (dh < -Math.PI) dh += TAU;
          if (this.speed < 0) dh = 0;
          this.heading += dh * 0.35;
          if (this._wallSnd <= 0) { this._wallSnd = 0.4; this._snd('wall'); }
          if (this._fx) this._fxWall(sgn, into);
          this._sqV -= 1.5 * into; this._susV -= 0.5 * into;
          this._endDrift(false);
        }
      }

      // vertical + surface
      const gy = ti.y;
      if (r.cannonTo !== undefined && surf === 'cannon' && !this.airborne && this._startCannon(r.cannonTo, r.cannonHeight)) return;
      if (surf === 'void' && !this.airborne) {
        this.falling = true; this._fallTimer = 0; this.vy = 0;
        this._endDrift(false);
        this._snd('fall');
        return;
      }
      if (surf === 'water' && this._lastSurf !== 'water' && !this.airborne) { this._snd('splash'); if (this._fx && Math.abs(this.speed) > 4) this._fxLand(10); }
      this._lastSurf = surf;
      if (this.airborne) {
        if (surf === 'void') {
          if (this.pos.y < this.lastGoodY - 5) {
            this.falling = true; this._fallTimer = 0; this.vy = Math.min(this.vy, 0);
            this._endDrift(false);
            this._snd('fall');
            return;
          }
        } else if (this.pos.y <= gy && this.vy <= 0) {
          this.pos.y = gy;
          this.airborne = false;
          if (this.fromJump && this.airTime > 0.35) {
            this._boost(0.6, 1, false);
            this._snd('mini_turbo1');
          }
          this.fromJump = false;
          this.vy = 0;
          this.airTime = 0;
          this._prevGround = gy;
        }
      } else {
        this.pos.y = damp(this.pos.y, gy, 20, dt);
        if (Math.abs(this.pos.y - gy) > 1) this.pos.y = gy;
        this.lastGoodY = gy;
        this.lastGoodDist = ti.dist;
        if (surf === 'jump' && this._jumpCd <= 0) {
          // DD ramps always carry you over their gap: guarantee a minimum launch speed
          const minLaunch = this.stats.topSpeed * 0.85;
          if (this.speed < minLaunch) this.speed = minLaunch;
          this.airborne = true;
          this.fromJump = true;
          this.vy = 8 + Math.abs(this.speed) * 0.12;
          this.airTime = 0;
          this._jumpCd = 0.6;
        }
      }
      if (surf === 'boost') {
        if (this._padCd <= 0) this.boost(0.9, 1);
        this._padCd = 0.3;
      } else if (this._padCd > 0) this._padCd -= dt;
      if (this.lastGoodY === undefined) this.lastGoodY = gy;
    }

    _updateProgress(dt) {
      const ti = this.trackInfo;
      const L = this.track ? this.track.length : 1;
      const d = ti.dist;
      if (!this._progressInit) {
        this._progressInit = true;
        this.dist = d; this.lastDist = d;
        this.lastGoodDist = d;
      } else {
        const prev = this.dist;
        if (prev > L * 0.75 && d < L * 0.25) this.lap++;
        else if (prev < L * 0.25 && d > L * 0.75) this.lap--;
        this.lastDist = prev;
        this.dist = d;
      }
      this.raceDist = this.lap * L + this.dist - L;
      // wrong way
      const sp = Math.sqrt(this.vel.x * this.vel.x + this.vel.z * this.vel.z);
      if (sp > 5 && (this.vel.x * ti.tx + this.vel.z * ti.tz) / sp < -0.3) {
        this._wrongT += dt;
        if (this._wrongT > 1) this.wrongWay = true;
      } else { this._wrongT = 0; this.wrongWay = false; }
    }

    // ------------------------------------------------------------ visuals
    _syncMesh(dt) {
      const m = this.mesh;
      m.position.copy(this.pos);
      this.y = this.pos.y;
      m.rotation.y = this.heading;
    }

    _visuals(dt, steer) {
      const m = this.model;
      const ti = this.trackInfo;
      const sp = this.speed;
      const spd01 = clamp(Math.abs(sp) / this.stats.topSpeed, 0, 1.5);
      const rnd = Math.random;
      this.y = this.pos.y;
      this._t += dt;
      const t = this._t;
      if (this._cheerT > 0) this._cheerT -= dt;
      if (this._cheerCd > 0) this._cheerCd -= dt;
      if (this._throwT > 0) this._throwT -= dt;
      const hitting = this.spinTimer > 0 || this.squishTimer > 0;
      if (!hitting && this._dizzy > 0) this._dizzy -= dt;

      // smooth values
      this._steerVis = damp(this._steerVis, steer, 12, dt);
      this._driftVis = damp(this._driftVis, this.drifting ? 1 : 0, 10, dt);
      const ddir = this.drifting ? this.driftDir : (this._lastDir || 0);
      if (this.drifting) this._lastDir = this.driftDir;
      // riders lean into turns, much harder while drifting (driver leads, thrower follows a beat later)
      this._leanF = damp(this._leanF, this._steerVis * 0.24 + ddir * 0.44 * this._driftVis, 10, dt);
      this._leanR = damp(this._leanR, this._steerVis * 0.18 + ddir * 0.3 * this._driftVis, 5, dt);

      // slope pitch
      const gy = ti.y;
      let pitchT;
      if (this.airborne) pitchT = -clamp(this.vy * 0.04, -0.4, 0.4);
      else {
        const dgy = gy - this._prevGround;
        const move = Math.max(Math.abs(sp) * dt, 0.05);
        pitchT = -Math.atan(clamp(dgy / move, -1, 1) * (sp < 0 ? -1 : 1));
      }
      this._prevGround = gy;
      this._pitch = damp(this._pitch, clamp(pitchT, -0.5, 0.5), 8, dt);
      const rollT = -this._steerVis * 0.085 * Math.min(spd01, 1) - ddir * 0.15 * this._driftVis;
      this._roll = damp(this._roll, rollT, 9, dt);

      // longitudinal acceleration -> nose dips when braking / lifts when accelerating or boosting
      if (dt > 0) {
        const acc = (sp - this._prevSpeed) / dt;
        this._pitchDyn = damp(this._pitchDyn, clamp(-acc * 0.0042, -0.07, 0.13), 9, dt);
      }
      this._prevSpeed = sp;

      // landing detection (jump / flip landings squash the kart and kick up dust)
      const air = this.airborne && !this.falling;
      if (air) this._airVy = this.vy;
      if (this._wasAir && !this.airborne && !this.falling && !this.cannonFlight) {
        const iv = Math.max(0, -this._airVy);
        if (iv > 2.5) this._onLand(iv);
      }
      this._wasAir = air;
      if (this._prevHop > 0 && this._hopTimer <= 0 && !this.airborne) { this._sqV -= 2.2; this._susV -= 0.7; if (this._fx && spd01 > 0.2) this._fxLand(3); }
      this._prevHop = this._hopTimer;

      // squash & stretch spring (stretch while rising, squash on landing)
      let sqT = 0;
      if (air) sqT = clamp(this._airVy * 0.007, -0.06, 0.12);
      else if (this._hopTimer > 0) sqT = (1 - this._hopTimer / HOP_TIME) < 0.5 ? 0.05 : -0.025;
      this._sqV += (-(this._sq - sqT) * 220 - this._sqV * 11) * dt;
      this._sq = clamp(this._sq + this._sqV * dt, -0.5, 0.3);

      // suspension: body hangs on a spring; bumps, kerbs, offroad and landings excite it
      if (!air && !this.falling && !this.cannonFlight && dt > 0) {
        const vyG = (this.pos.y - this._prevPy) / dt;
        this._susV -= clamp(vyG - this._prevVyG, -25, 25) * 0.011;
        this._prevVyG = vyG;
        const rough = (SURF_MUL[ti.surface] || !ti.onRoad) ? 3.2 : 0.35;
        this._susV += (rnd() - 0.5) * Math.min(spd01, 1) * rough;
      } else this._prevVyG = 0;
      this._prevPy = this.pos.y;
      this._susV += (-this._sus * 190 - this._susV * 11) * dt;
      this._sus = clamp(this._sus + this._susV * dt, -0.14, 0.12);

      // wheelie spring (rocket start / boost start / mini-turbo kick the nose up)
      this._whV += (-this._wh * 55 - this._whV * 6.5) * dt;
      this._wh = clamp(this._wh + this._whV * dt, -0.6, 0.06);

      // hop
      let hopY = 0;
      if (this._hopTimer > 0) hopY = HOP_H * Math.sin(Math.PI * (1 - this._hopTimer / HOP_TIME));

      // hit anims
      let spinAng = 0, flipAng = 0, rollAng = 0, flipY = 0, sy = 1, widen = 1, fallY = 0;
      if (this.spinTimer > 0) {
        const p = 1 - this.spinTimer / (this.hitKind === 'flip' ? this._flipDur : this._spinDur);
        if (this.hitKind === 'flip') {
          const AIR = 0.78;
          if (p < AIR) {
            const q = p / AIR, r = q * q * (3 - 2 * q);
            flipY = 2.5 * 4 * q * (1 - q);
            flipAng = r * TAU; rollAng = r * TAU;
          } else {
            const u = (p - AIR) / (1 - AIR);
            if (!this._flipLanded) {
              this._flipLanded = true; this._sq = -0.42; this._sqV = 0; this._susV -= 1.4;
              if (this._fx) this._fxLand(14);
              this._snd('bump');
            }
            flipY = 0.5 * Math.sin(u * Math.PI) * (1 - u);
          }
        } else {
          const e = 1 - Math.pow(1 - p, 3);
          spinAng = e * TAU * this._spinTurns;
          flipY = 0.28 * Math.sin(Math.min(1, p * 3.2) * Math.PI);
          rollAng = Math.sin(p * TAU * 2 * this._spinTurns) * 0.1 * (1 - p);
        }
      }
      if (this.squishTimer > 0) {
        const left = this.squishTimer;
        if (left > 0.6) sy = 0.2 + Math.sin(t * 34) * 0.015;
        else {
          const q = 1 - left / 0.6, x1 = q - 1;
          sy = 0.2 + 0.8 * (1 + 3.2 * x1 * x1 * x1 + 2.2 * x1 * x1);   // ease-out-back: pops past 1 and settles
        }
        widen = 1 + (1 - sy) * 0.45;
      }
      if (this.falling) {
        fallY = -0.5 * this._fallTimer * this._fallTimer * 6;
        flipAng = this._fallTimer * 1.5;
        if (this.rescued) flipAng = Math.min(FALL_TIME * 1.5, flipAng) * clamp(1 - (this._fallTimer - FALL_TIME) / 0.3, 0, 1);
      }
      if (this.cannonFlight) {
        const u = clamp(this._cnT / this._cnDur, 0, 1);
        spinAng = u * TAU * 2;
        flipAng = -Math.sin(u * Math.PI) * 0.4;
      }

      // engine shake (idle / countdown / revving)
      let rev = 0;
      const gm = G.Game;
      if (this.burnoutTimer > 0) rev = 1;
      else if (gm && (gm.state === 'countdown' || gm.state === 'intro')) {
        const hs = this._humanState();
        rev = hs ? (hs.accel ? 1 : 0) : (this._revAI ? 0.35 + 0.35 * Math.sin(t * 9 + this._ph) : 0);
      }
      this._rev = damp(this._rev, rev, 10, dt);
      const idle = !air && !this.falling && Math.abs(sp) < 2.5 && !hitting && !this.rescued && !this.cannonFlight;
      const shake = idle ? 0.005 + 0.018 * this._rev : spd01 * 0.003;
      const shx = (rnd() - 0.5) * 2 * shake, shz = (rnd() - 0.5) * 2 * shake;

      // mesh transform
      const mesh = this.mesh;
      const targetScale = this.shrinkTimer > 0 ? 0.5 : 1;
      this._scale = damp(this._scale, targetScale, 10, dt);
      mesh.scale.set(this._scale, this._scale, this._scale);
      mesh.position.copy(this.pos);
      mesh.rotation.y = this.heading;
      mesh.rotation.x = this._pitch + this._pitchDyn;
      mesh.rotation.z = this._roll + (this._wobble > 0 ? this._wobbleDir * Math.sin(this._wobble * 36) * 0.12 * Math.min(1, this._wobble * 4) : 0) + (idle ? shx * 0.5 : 0);
      const g = m.group;
      const wh = this._wh, swh = Math.sin(wh), cwh = Math.cos(wh);
      g.position.set(shx, hopY + flipY + (0.3 - 0.3 * cwh - 0.75 * swh), shz + (-0.75 - 0.3 * swh + 0.75 * cwh));
      g.rotation.y = -ddir * 0.44 * this._driftVis + spinAng;
      g.rotation.x = flipAng + wh;
      g.rotation.z = rollAng;
      const sqx = (1 - this._sq * 0.5) * widen, sqy = (1 + this._sq) * sy;
      g.scale.set(sqx, sqy, sqx);
      if (this.falling) { g.position.y = 0; }

      // invuln flash (not for star)
      let vis = true;
      if (this.starTimer <= 0 && this.invulnTimer > 0 && this.spinTimer <= 0 && this.squishTimer <= 0) vis = ((this._frame >> 2) & 1) === 0 || this.invulnTimer > 3;
      g.visible = vis;

      // star flash
      if (this._emMats.length) {
        if (this.starTimer > 0) {
          this._hue = (this._hue + dt * 2.5) % 1;
          if (!this._starCol) this._starCol = new THREE.Color();
          this._starCol.setHSL(this._hue, 1, 0.5);
          for (let i = 0; i < this._emMats.length; i++) this._emMats[i].emissive.copy(this._starCol);
          this._starOn = true;
        } else if (this._starOn) {
          for (let i = 0; i < this._emMats.length; i++) this._emMats[i].emissive.setRGB(0, 0, 0);
          this._starOn = false;
        }
      }

      // wheels
      const burn = this.burnoutTimer > 0;
      this._wheelSpin += (burn ? 40 : sp) * dt / 0.35;
      const whs = m.wheels;
      for (let i = 0; i < whs.length; i++) whs[i].rotation.x = this._wheelSpin;
      const pv = m.frontWheelPivots;
      const steerAng = -(this.drifting ? this.driftDir * 0.5 + this._steerVis * 0.3 : this._steerVis) * 0.45;
      for (let i = 0; i < pv.length; i++) pv[i].rotation.y = steerAng;

      // suspended parts ride the spring (wheels stay planted)
      const sus = this._susp, so = this._sus;
      for (let i = 0; i < sus.length; i += 2) sus[i].position.y = sus[i + 1] + so;

      this._riders(dt, spd01, hitting, ddir);

      // visual FX (boost flames, drift sparks, dust, shadow ...)
      this._gy = gy;
      this._updateFx(dt, burn, spd01);
    }

    // ------------------------------------------------------------ rider animation
    _arm(rider, a, th, out, w) {
      const arm = rider.userData.arms && rider.userData.arms[a];
      if (!arm) return;
      if (w < 0.03) { arm.visible = false; return; }
      arm.visible = true;
      const wc = w > 1 ? 1 : w;
      arm.scale.setScalar(0.35 + 0.65 * wc);
      const sg = a ? -1 : 1;
      arm.rotation.x = 2.2 + (th - 2.2) * wc;
      arm.rotation.z = sg * (0.15 + (out - 0.15) * wc);
    }

    _riders(dt, spd01, hitting, ddir) {
      const m = this.model, t = this._t, fr = this._frame;
      const swapping = this._swapAnim > 0;
      const rnd = Math.random;
      const hs = this._humanState();
      const lookBack = !!(hs && hs.lookBack) && !hitting;
      this._lbk = damp(this._lbk, lookBack ? 1 : 0, 9, dt);

      // ---- reactions
      const h0 = this.heldItems[0], h1 = this.heldItems[1];
      if (this._swapCd <= 0 && ((h0 && !this._prevHeld0) || (h1 && !this._prevHeld1))) this._cheer(0.55, 0);
      this._prevHeld0 = h0; this._prevHeld1 = h1;
      if (this._prevPos > 0 && this.position > 0 && this.position < this._prevPos && this._cheerCd <= 0 && !this.finished && spd01 > 0.4 && !hitting) { this._cheer(0.8, 0); this._cheerCd = 3; }
      this._prevPos = this.position;
      if (this.finished && !this._finDone) {
        this._finDone = true;
        if (this.position <= 5) { this._cheerT = this._cheerDur = 60; this._cheerK = 1; }
      }
      const loser = this.finished && this.position > 5;
      const slumpT = hitting ? 1 : this._dizzy > 0 ? 0.55 : loser ? 0.75 : this.burnoutTimer > 0 ? 0.5 : 0;
      this._slump = damp(this._slump, slumpT, hitting ? 16 : 4, dt);
      const slump = this._slump;

      // neighbours: driver glances at the nearest kart beside us, thrower checks who is behind
      if (((fr + this.index) & 3) === 0) {
        const ks = Kart._karts;
        const sn = Math.sin(this.heading), cs = Math.cos(this.heading);
        let bs = 1e9, bb = 1e9, ys = 0, yb = 0;
        if (ks) for (let i = 0; i < ks.length; i++) {
          const o = ks[i];
          if (!o || o === this || o.ghost || o.falling) continue;
          const dx = o.pos.x - this.pos.x, dz = o.pos.z - this.pos.z, d2 = dx * dx + dz * dz;
          if (d2 > 225) continue;
          const df = dx * sn + dz * cs, dl = dx * cs - dz * sn;
          if (Math.abs(df) < 4 && d2 < 49 && d2 < bs) { bs = d2; ys = Math.atan2(dl, Math.max(0.4, df + 1.5)); }
          else if (df < -2 && d2 < bb) { bb = d2; yb = Math.atan2(dl, df); }
        }
        this._look[0] = bs < 1e8 ? clamp(ys, -1.2, 1.2) : 0; this._look[2] = bs < 1e8 ? 1 : 0;
        this._look[1] = bb < 1e8 ? clamp(yb, -2.2, 2.2) : 0; this._lookB = bb < 1e8 ? 1 : 0;
      }

      const dr = m.front, th = m.rear;
      const cheerEnv = this._cheerT > 0 ? Math.min(1, (this._cheerDur - this._cheerT) * 12, this._cheerT * 7) : 0;
      const cheerK = this._cheerK;
      const flail = this.spinTimer > 0;
      const holding = !!this.draggedItem && !hitting;
      this._holdW = damp(this._holdW, holding ? 1 : 0, 12, dt);

      // ---- thrower arm pose (throw sequence > hold)
      let tArm = 2.2, tOut = 0.2, tW = 0, tYaw = 0, tTilt = 0;
      if (this._holdW > 0.02) {
        tArm = -1.0 + Math.sin(t * 7) * 0.07; tOut = 0.3; tW = this._holdW; tYaw = -0.75 * this._holdW; tTilt = -0.12 * this._holdW;
      }
      if (this._throwT > 0 && !this._throwInstant && !hitting) {
        const e = 0.55 - this._throwT;
        let a1, y1, tl, w1 = 1;
        if (this._throwBack) {
          if (e < 0.14) { const u = e / 0.14; a1 = -0.6 - 0.2 * u; y1 = -0.9 * u; tl = -0.1 * u; }
          else if (e < 0.26) { const u = (e - 0.14) / 0.12; a1 = -0.8 - 0.95 * u; y1 = -0.9 - 0.4 * u; tl = -0.1 + 0.3 * u; }
          else { a1 = -1.75; y1 = -1.3 * this._throwT / 0.29; tl = 0.2 * this._throwT / 0.29; w1 = Math.min(1, this._throwT / 0.2); }
        } else if (e < 0.14) { const u = e / 0.14; a1 = -0.9 - 0.45 * u; y1 = -0.95 * u; tl = -0.3 * u; }
        else if (e < 0.26) { const u = (e - 0.14) / 0.12, v = u * u * (3 - 2 * u); a1 = -1.35 + 2.85 * v; y1 = -0.95 + 1.5 * v; tl = -0.3 + 0.6 * v; }
        else { const u = this._throwT / 0.29; a1 = 1.5; y1 = 0.55 * u; tl = 0.3 * u; w1 = Math.min(1, this._throwT / 0.2); }
        tArm = a1; tYaw = y1; tTilt = tl; tW = w1; tOut = 0.2;
      }

      // ---- per rider
      for (let role = 0; role < 2; role++) {
        const r = role ? th : dr;
        if (!r) continue;
        const ud = r.userData, head = ud.head;
        const by = ud.by !== undefined ? ud.by : 0, bs = ud.bs || 1;
        const ph = this._ph + role * 1.9;
        let aw = ud.aw || 0;

        // arm targets
        let wR = 0, wL = 0, thR = 2.2, thL = 2.2, outR = 0.3, outL = 0.3;
        const wave = Math.sin(t * 17 + role * 1.7);
        if (swapping) { wR = wL = 1; thR = 0.1 + wave * 0.25; thL = 0.1 - wave * 0.25; outR = outL = 0.7; }
        else if (flail) { wR = wL = 1; thR = 0.8 + Math.sin(t * 18 + role * 1.3) * 0.9; thL = 0.8 + Math.sin(t * 21 + 2 + role) * 0.9; outR = 0.8 + Math.sin(t * 13) * 0.3; outL = 0.8 + Math.sin(t * 15) * 0.3; }
        else if (cheerEnv > 0.02) {
          wR = cheerEnv; thR = 0.05 + wave * 0.22; outR = 0.55 + cheerK * 0.3;
          if (cheerK > 0.5) { wL = cheerEnv; thL = 0.05 - wave * 0.22; outL = outR; }
        }
        if (role === 1 && !swapping && !flail) {
          if (tW > 0.02) { wR = Math.max(wR, tW); thR = wR === tW ? tArm : thR; outR = tOut; }
        }
        // driver steers with both hands up on the wheel when drifting: arms lowered, tiny counter-steer wiggle shown via twist
        this._arm(r, 0, thR, outR, wR);
        this._arm(r, 1, thL, outL, wL);

        if (swapping) {
          if (head) { head.rotation.y = 0; head.rotation.x = 0; head.rotation.z = 0; }
          continue;
        }

        // body
        let rx, ry, rz, py, sY = 1 + Math.sin(t * 2.3 + ph) * 0.014;
        const bob = Math.sin(t * 5.5 + ph) * 0.006 + Math.sin(fr * 0.42 + ph) * 0.012 * Math.min(spd01, 1);
        const bounce = cheerEnv > 0.02 ? Math.abs(Math.sin(t * (cheerK > 0.5 ? 11 : 15) + ph)) * (cheerK > 0.5 ? 0.16 : 0.12) * cheerEnv : 0;
        rz = role ? this._leanR : this._leanF * 1.25;
        rx = this._pitchDyn * 2.4 - this._wh * 0.5 + slump * 0.55 - cheerEnv * 0.2;
        ry = 0;
        if (role === 0) {
          ry = ddir * 0.3 * this._driftVis - this._steerVis * 0.22 * this._driftVis + this._lbk * 0.9;
        } else {
          ry = this._lbk * -0.9;
          if (this._slapAnim > 0) {
            const p = 1 - this._slapAnim / SLAP_ANIM, sw = Math.sin(Math.min(1, p * 1.25) * Math.PI);
            rz = this._slapSide * 1.15 * sw; ry = this._slapSide * 0.9 * sw; rx = -0.25 * sw;
          } else if (tW > 0.02) { ry += tYaw; rx += tTilt; }
        }
        if (slump > 0.05 && flail) { rz += Math.sin(t * 14 + ph) * 0.4 * slump; rx += Math.sin(t * 11 + ph) * 0.25; }
        py = by + bob + bounce + this._sus * 0.7 - slump * 0.11;
        sY += cheerEnv * 0.05 * Math.sin(t * 22) + this._sus * 1.1 + this._sq * 0.45;
        r.rotation.set(rx, ry, rz);
        r.position.y = py;
        r.scale.set(bs * (1 - (sY - 1) * 0.5), bs * sY, bs * (1 - (sY - 1) * 0.5));

        // head: looks into the turn, glances at neighbours, nods, wobbles when dizzy
        if (head) {
          let yaw, hx = 0, hz = 0;
          if (role === 0) {
            yaw = -this._steerVis * 0.4 - ddir * 0.45 * this._driftVis;
            if (this._look[2] > 0.5 && spd01 > 0.1) yaw = this._look[0] * 0.85;
          } else {
            yaw = holding ? -0.55 : -this._steerVis * 0.25;
            if (this._lookB > 0.5 && !holding && spd01 > 0.1) yaw = this._look[1] * 0.75;
          }
          if (Math.abs(this.speed) < 3) yaw += Math.sin(t * 0.8 + ph) * 0.35;
          yaw += this._lbk * (role ? -1.2 : 1.7);
          if (cheerEnv > 0.02) { hx = -0.25 * cheerEnv; hz = Math.sin(t * 9 + ph) * 0.13 * cheerEnv; }
          hx += slump * 0.5;
          if (this._dizzy > 0 || hitting) { const dz = hitting ? 1 : clamp(this._dizzy * 1.5, 0, 1); hz += Math.sin(t * 6.5 + ph) * 0.22 * dz; hx += Math.sin(t * 5 + ph + 1) * 0.18 * dz; yaw += Math.sin(t * 4 + ph) * 0.4 * dz; }
          const k = 1 - Math.exp(-11 * dt);
          head.rotation.y += (yaw - head.rotation.y) * k;
          head.rotation.x += (hx - head.rotation.x) * k;
          head.rotation.z += (hz - head.rotation.z) * k;
        }
      }
    }

    // ------------------------------------------------------------ landing / hit fx helpers
    _onLand(iv) {
      this._sqV -= Math.min(9, iv * 0.55);
      this._susV -= Math.min(2, iv * 0.12);
      if (this._fx) this._fxLand(iv);
    }

    // dust colour per surface into RGB
    _dustCol() {
      const sf = this.trackInfo.surface;
      if (sf === 'sand') { RGB[0] = 0.9; RGB[1] = 0.78; RGB[2] = 0.52; }
      else if (sf === 'mud') { RGB[0] = 0.32; RGB[1] = 0.22; RGB[2] = 0.12; }
      else if (sf === 'grass' || (!this.trackInfo.onRoad && sf === 'offroad')) { RGB[0] = 0.5; RGB[1] = 0.55; RGB[2] = 0.3; }
      else if (sf === 'water') { RGB[0] = 0.8; RGB[1] = 0.92; RGB[2] = 1; }
      else if (sf === 'ice') { RGB[0] = 0.9; RGB[1] = 0.95; RGB[2] = 1; }
      else { RGB[0] = 0.74; RGB[1] = 0.71; RGB[2] = 0.65; }
    }

    // expanding dust ring + radial puffs where the kart touches down
    _fxLand(iv) {
      const fx = this._fx;
      if (!fx) return;
      const S = fx.alpha, big = clamp(iv / 12, 0.3, 1.3), x = this.pos.x, y = this.pos.y + 0.1, z = this.pos.z, rnd = Math.random;
      this._dustCol();
      const r = RGB[0], g = RGB[1], b = RGB[2];
      S.endColor(r, g, b);
      S.spawn(2, 2, x, y, z, 0, 0, 0, 0.55, 1.2, 4.5 + 4 * big, r, g, b, 0.6, 0, 0);
      const n = 8 + (big * 6 | 0);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rnd() * 0.5, sp = (3 + rnd() * 3) * (0.6 + big * 0.5);
        S.endColor(r * 0.9, g * 0.9, b * 0.9);
        S.spawn(3, 0, x + Math.cos(a) * 0.9, y, z + Math.sin(a) * 0.9, Math.cos(a) * sp, 0.6 + rnd() * 0.8, Math.sin(a) * sp, 0.6 + rnd() * 0.3, 0.5, 1.5 + big, r, g, b, 0.62, -0.2, 2.6);
      }
    }

    _fxHit(kind) {
      const fx = this._fx;
      if (!fx) return;
      const A = fx.add, S = fx.alpha, x = this.pos.x, y = this.pos.y + 0.7, z = this.pos.z, rnd = Math.random;
      A.endColor(1, 0.5, 0.1);
      A.spawn(1, 0, x, y, z, 0, 0, 0, 0.32, 1.1, 3.6, 1, 0.95, 0.6, 0.95, 0, 0);
      A.endColor(1, 0.4, 0.05);
      A.spawn(2, 2, x, y - 0.5, z, 0, 0, 0, 0.35, 1, 6.5, 1, 0.85, 0.4, 0.75, 0, 0);
      for (let j = 0; j < 16; j++) {
        const a = rnd() * TAU, sp = 5 + rnd() * 9;
        A.endColor(1, 0.35, 0.05);
        A.spawn(0, 1, x, y, z, Math.cos(a) * sp, 2 + rnd() * 6, Math.sin(a) * sp, 0.4 + rnd() * 0.3, 0.14, 0.04, 1, 0.9, 0.45, 1, 14, 0.5);
      }
      if (kind === 'squish') {
        this._dustCol();
        for (let j = 0; j < 8; j++) { const a = j / 8 * TAU; S.spawn(3, 0, x + Math.cos(a), this.pos.y + 0.15, z + Math.sin(a), Math.cos(a) * 3.5, 0.5, Math.sin(a) * 3.5, 0.6, 0.5, 1.8, RGB[0], RGB[1], RGB[2], 0.6, 0, 2); }
      }
    }

    _fxWall(sgn, into) {
      const fx = this._fx;
      if (!fx || into < 0.15) return;
      const A = fx.add, S = fx.alpha, rnd = Math.random;
      const bx = this._wx(0.3, sgn * 0.95), bz = this._wz(0.3, sgn * 0.95), by = this.pos.y + 0.4;
      const ti = this.trackInfo, n = 6 + (into * 10 | 0);
      A.endColor(1, 0.3, 0.05);
      A.spawn(1, 0, bx, by, bz, 0, 0, 0, 0.18, 0.5, 1.8, 1, 0.9, 0.5, 0.9, 0, 0);
      for (let j = 0; j < n; j++) {
        const sp = 4 + rnd() * 9;
        A.endColor(1, 0.3, 0.04);
        A.spawn(0, 1, bx, by, bz, -ti.rx * sgn * sp * 0.6 + ti.tx * (rnd() - 0.3) * sp, 1.5 + rnd() * 4, -ti.rz * sgn * sp * 0.6 + ti.tz * (rnd() - 0.3) * sp, 0.3 + rnd() * 0.25, 0.1, 0.03, 1, 0.85, 0.4, 1, 16, 0.4);
      }
      S.endColor(0.5, 0.5, 0.5);
      S.spawn(3, 0, bx, by, bz, -ti.rx * sgn * 1.5, 0.6, -ti.rz * sgn * 1.5, 0.5, 0.4, 1.4, 0.7, 0.68, 0.62, 0.35, 0, 2);
    }

    // rescue drone pickup: ring bubbles + sparkles around the captured kart
    _fxBubbles(n) {
      const fx = this._fx;
      if (!fx) return;
      const S = fx.alpha, A = fx.add, rnd = Math.random, x = this.pos.x, y = this.pos.y, z = this.pos.z;
      for (let i = 0; i < n; i++) {
        const a = rnd() * TAU, rr = 0.4 + rnd() * 1.1;
        S.endColor(0.85, 0.97, 1);
        S.spawn(2, 0, x + Math.cos(a) * rr, y + 0.2 + rnd() * 1.4, z + Math.sin(a) * rr, (rnd() - 0.5) * 0.8, 1.4 + rnd() * 1.8, (rnd() - 0.5) * 0.8, 0.9 + rnd() * 0.5, 0.15, 0.55 + rnd() * 0.4, 0.45, 0.8, 1, 0.95, -0.5, 0.6);
      }
      for (let i = 0; i < n >> 1; i++) {
        A.endColor(0.5, 0.8, 1);
        A.spawn(1, 0, x + (rnd() - 0.5) * 1.8, y + 0.3 + rnd() * 1.4, z + (rnd() - 0.5) * 1.8, 0, 1 + rnd(), 0, 0.7, 0.55, 0.08, 0.8, 0.95, 1, 0.95, 0, 0);
      }
    }

    // tire marks, wall scrape, spin smoke, dizzy stars, idle exhaust, clods, spray (called from _updateFx)
    _updateFx2(dt, burn, spd01) {
      const fx = this._fx, A = fx.add, S = fx.alpha, fr = this._frame, rnd = Math.random;
      const ti = this.trackInfo, m = this.model, sp = this.speed;
      const air = this.airborne || this.falling || this.cannonFlight || this.rescued;
      const sn = Math.sin(this.heading), cs = Math.cos(this.heading), py = this.pos.y, sc = this._scale;
      const sf = ti.surface;
      const vyaw = this.heading + m.group.rotation.y, vs = Math.sin(vyaw), vc = Math.cos(vyaw);

      // ---- skid marks (rear tires) on tarmac
      {
        let str = 0;
        if (!air && ti.onRoad && !SURF_MUL[sf] && sf !== 'water') {
          if (this.drifting && this._driftVis > 0.4 && spd01 > 0.3) str = this.driftLevel >= 1 ? 0.68 : 0.52;
          else if (this.spinTimer > 0 && this.hitKind === 'spin') str = 0.5;
          else if (this.input.brake > 0.5 && sp > 0.6 * this.stats.topSpeed) str = 0.34;
        }
        const sk = fx.skid, K = this._sk;
        for (let w = 0; w < 2; w++) {
          const o = w * 8;
          if (str <= 0) { this._skOn[w] = 0; continue; }
          const lx = (w ? 0.8 : -0.8) * sc, lz = -0.75 * sc;
          const cx = this.pos.x + lx * vc + lz * vs, cz = this.pos.z - lx * vs + lz * vc;
          if (!this._skOn[w]) { this._skOn[w] = 1; K[o] = cx; K[o + 1] = cz; K[o + 6] = 0; continue; }
          const dx = cx - K[o], dz = cz - K[o + 1], d2 = dx * dx + dz * dz;
          if (d2 < 0.3) continue;
          if (d2 > 9) { K[o] = cx; K[o + 1] = cz; K[o + 6] = 0; continue; }
          const d = Math.sqrt(d2), hw = 0.14 * sc, nx = -dz / d * hw, nz = dx / d * hw;
          let plx, plz, prx, prz, a0 = str;
          if (K[o + 6] > 0) { plx = K[o + 2]; plz = K[o + 3]; prx = K[o + 4]; prz = K[o + 5]; }
          else { plx = K[o] + nx; plz = K[o + 1] + nz; prx = K[o] - nx; prz = K[o + 1] - nz; a0 = 0; }
          const nlx = cx + nx, nlz = cz + nz, nrx = cx - nx, nrz = cz - nz;
          sk.quad(fx.time, py + 0.045, plx, plz, prx, prz, nlx, nlz, nrx, nrz, a0, str);
          K[o] = cx; K[o + 1] = cz; K[o + 2] = nlx; K[o + 3] = nlz; K[o + 4] = nrx; K[o + 5] = nrz; K[o + 6] = 1;
        }
      }

      // ---- wall scrape sparks
      if (!air && sp > 7 && ti.wallDist - Math.abs(ti.lateral) < 0.7 && sf !== 'void') {
        const sg = ti.lateral > 0 ? 1 : -1;
        const bx = this._wx(rnd() * 1.2 - 0.4, sg * 0.95), bz = this._wz(rnd() * 1.2 - 0.4, sg * 0.95), by = py + 0.25 + rnd() * 0.3;
        for (let j = 0; j < 2; j++) {
          const v = 3 + rnd() * 7;
          A.endColor(1, 0.3, 0.04);
          A.spawn(0, 1, bx, by, bz, -sn * v - ti.rx * sg * (1 + rnd() * 2), 1 + rnd() * 3, -cs * v - ti.rz * sg * (1 + rnd() * 2), 0.22 + rnd() * 0.2, 0.09, 0.03, 1, 0.9, 0.5, 1, 18, 0.4);
        }
        A.put(0, 0, bx, by, bz, 0.5, 1, 0.7, 0.25, 0.7, 0, 0, 0, 0);
        if ((fr & 7) === 0) { S.endColor(0.5, 0.5, 0.5); S.spawn(3, 0, bx, by, bz, -sn * 2, 0.6, -cs * 2, 0.5, 0.3, 1.0, 0.7, 0.68, 0.62, 0.25, -0.3, 1.5); }
      }

      // ---- spin-out: tire smoke at all four wheels
      if (this.spinTimer > 0 && this.hitKind === 'spin' && !air && (fr & 1) === 0) {
        for (let w = 0; w < 4; w++) {
          const lx = (w & 1 ? 0.8 : -0.8) * sc, lz = (w & 2 ? -0.75 : 0.75) * sc;
          S.endColor(0.85, 0.85, 0.88);
          S.spawn(3, 0, this.pos.x + lx * vc + lz * vs, py + 0.15, this.pos.z - lx * vs + lz * vc, (rnd() - 0.5) * 2.5, 0.8 + rnd() * 0.8, (rnd() - 0.5) * 2.5, 0.8, 0.6, 2.3, 0.92, 0.92, 0.94, 0.55, -0.3, 1.5);
        }
      }

      // ---- dizzy stars orbiting the riders' heads
      if (this._dizzy > 0 || this.spinTimer > 0 || this.squishTimer > 0) {
        const kf = (this.spinTimer > 0 || this.squishTimer > 0) ? 1 : clamp(this._dizzy / 0.3, 0, 1);
        for (let role = 0; role < 2; role++) {
          const r = role ? m.rear : m.front;
          const hd = r && r.userData.head;
          if (!hd) continue;
          const e = hd.matrixWorld.elements;
          const hx = e[12], hy = e[13] + 0.5 * sc, hz = e[14];
          for (let j = 0; j < 3; j++) {
            const a = this._t * 7.5 + j * 2.094 + role * 1.3, rad = 0.46 * sc;
            const yel = (j & 1) ? 0.4 : 0;
            const sx = hx + Math.cos(a) * rad, sy2 = hy + Math.sin(a) * 0.07, sz = hz + Math.sin(a) * rad, sz2 = 0.42 * sc + 0.05 * Math.sin(a * 3);
            S.put(1, 0, sx, sy2, sz, sz2 * 1.25, 0.9, 0.45, 0.0, 0.9 * kf, 0, 0, 0, a * 2);   // dark rim so it reads on bright sky
            A.put(1, 0, sx, sy2, sz, sz2, 1, 0.92 + yel * 0.08, 0.15 + yel * 0.5, 0.95 * kf, 0, 0, 0, a * 2);
          }
        }
      }

      // ---- idle / revving exhaust puffs + mini-turbo backfire pops
      if (!air && Math.abs(sp) < 3 && this.boostTimer <= 0 && this.spinTimer <= 0) {
        const per = this._rev > 0.4 ? 4 : 14;
        if ((fr % per) === 0) {
          const e = (fr >> 2) & 1 && this._exN > 1 ? 1 : 0;
          this._exWorld(e, FX_W);
          const rv = this._rev;
          S.endColor(0.7, 0.7, 0.72);
          S.spawn(3, 0, FX_W[0] - sn * 0.2, FX_W[1], FX_W[2] - cs * 0.2, -sn * (1 + rv * 2.5) + (rnd() - 0.5) * 0.5, 0.5 + rnd() * 0.4, -cs * (1 + rv * 2.5) + (rnd() - 0.5) * 0.5, 0.6, 0.18, 0.7 + rv * 0.6, 0.9 - rv * 0.1, 0.9 - rv * 0.1, 0.92 - rv * 0.1, 0.4 + rv * 0.25, -0.3, 1.2);
          if (rv > 0.5 && (fr & 4) === 0) { A.endColor(1, 0.2, 0.02); A.spawn(0, 0, FX_W[0] - sn * 0.3, FX_W[1], FX_W[2] - cs * 0.3, -sn, 0, -cs, 0.1, 0.3, 0.12, 1, 0.7, 0.2, 0.8, 0, 0); }
        }
      }
      if (this._popT > 0) {
        this._popT -= dt;
        if ((fr & 3) === 0) {
          this._exWorld(rnd() < 0.5 ? 0 : (this._exN > 1 ? 1 : 0), FX_W);
          const bx = FX_W[0] - sn * 0.35, bz = FX_W[2] - cs * 0.35;
          A.endColor(1, 0.3, 0.02);
          A.spawn(0, 0, bx, FX_W[1], bz, -sn * 2, 0, -cs * 2, 0.14, 0.9, 0.2, 1, 0.85, 0.35, 0.95, 0, 2);
          A.spawn(1, 0, bx, FX_W[1], bz, 0, 0, 0, 0.12, 0.8, 0.3, 1, 0.9, 0.5, 0.9, 0, 0);
          for (let j = 0; j < 4; j++) { A.endColor(1, 0.3, 0.04); A.spawn(0, 1, bx, FX_W[1], bz, -sn * (6 + rnd() * 6) + (rnd() - 0.5) * 3, (rnd() - 0.5) * 2, -cs * (6 + rnd() * 6) + (rnd() - 0.5) * 3, 0.2, 0.1, 0.03, 1, 0.8, 0.3, 1, 3, 0.5); }
          S.endColor(0.3, 0.3, 0.3);
          S.spawn(3, 0, bx, FX_W[1], bz, -sn * 3, 0.5, -cs * 3, 0.4, 0.2, 0.8, 0.35, 0.33, 0.32, 0.4, -0.2, 2);
        }
      }

      // ---- offroad clods + water spray arcs
      if (!air && spd01 > 0.25 && (fr & 1) === 0) {
        const off = sf === 'grass' || sf === 'mud' || sf === 'sand' || (sf === 'offroad' && !ti.onRoad);
        if (off) {
          const side = (fr & 2) ? 0.78 : -0.78, bx = this._wx(0.9, side), bz = this._wz(0.9, side);
          if (sf === 'mud') S.endColor(0.2, 0.12, 0.05);
          const c0 = sf === 'mud' ? 0.3 : sf === 'sand' ? 0.8 : 0.4, c1 = sf === 'mud' ? 0.19 : sf === 'sand' ? 0.68 : 0.28, c2 = sf === 'mud' ? 0.09 : sf === 'sand' ? 0.4 : 0.1;
          S.spawn(0, 0, bx, py + 0.15, bz, (rnd() - 0.5) * 4 - sn * 2, 3.5 + rnd() * 3.5, (rnd() - 0.5) * 4 - cs * 2, 0.7, 0.3, 0.2, c0, c1, c2, 0.95, 26, 0.1);
        } else if (sf === 'water') {
          for (let sd = -1; sd <= 1; sd += 2) {
            const bx = this._wx(-0.7, sd * 0.8), bz = this._wz(-0.7, sd * 0.8);
            for (let j = 0; j < 2; j++) { const v = 2 + rnd() * 3.5; A.spawn(0, 1, bx, py + 0.2, bz, -cs * sd * v - sn * 3, 5 + rnd() * 4, sn * sd * v - cs * 3, 0.65, 0.14, 0.05, 0.75, 0.93, 1, 0.85, 22, 0.15); }
          }
        }
      }

      // ---- rescue drone: bubbles while hauled
      if (this.rescued && (fr & 1) === 0) this._fxBubbles(2);
    }

    dispose() {
      if (this.scene) { this.scene.remove(this.mesh); if (this._drone) this.scene.remove(this._drone); }
      if (this._fx) { this._fx.shadow.free(this._shSlot); this._fx.release(this); this._fx = null; }
    }

    // ------------------------------------------------------------ collisions
    // slipstream: idempotent per step (safe if main also calls it)
    static updateDrafting(karts) {
      const dt = 1 / 60, n = karts.length;
      Kart._karts = karts;
      for (let i = 0; i < n; i++) {
        const a = karts[i];
        if (!a || a.ghost || a._draftSeen === a._frame) continue;
        a._draftSeen = a._frame;
        let on = false;
        const ok = !a.falling && !a.cannonFlight && !a.rescued && a.spinTimer <= 0 && a._draftCd <= 0 && a.speed > 0.7 * a.stats.topSpeed;
        if (ok) {
          const fx = Math.sin(a.heading), fz = Math.cos(a.heading);
          for (let j = 0; j < n && !on; j++) {
            const b = karts[j];
            if (!b || b === a || b.ghost || b.falling || b.cannonFlight || b.speed < 0.7 * b.stats.topSpeed) continue;
            const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
            const d2 = dx * dx + dz * dz;
            if (d2 > DRAFT_RANGE * DRAFT_RANGE || d2 < 4) continue;
            const along = dx * fx + dz * fz;
            if (along <= 0 || along * along < DRAFT_COS * DRAFT_COS * d2) continue;
            if (Math.abs(a.pos.y - b.pos.y) > 3) continue;
            on = true;
          }
        }
        if (on) {
          a._draft += dt;
          if ((a._frame % 3) === 0) {
            const sd = (a._frame & 3) ? 0.9 : -0.9;
            void sd;
          }
          if (a._draft >= DRAFT_NEED) {
            a._draft = 0; a._draftCd = 1.5;
            a._boost(1.2, 1, false);
            a._snd('slipstream');
          }
        } else if (a._draft > 0) a._draft = Math.max(0, a._draft - dt * 2);
        a.drafting01 = clamp(a._draft / DRAFT_NEED, 0, 1);
      }
    }

    static resolveCollisions(karts) {
      const n = karts.length;
      Kart.updateDrafting(karts);
      for (let i = 0; i < n; i++) {
        const a = karts[i];
        if (!a || a.falling || a.ghost || a.cannonFlight) continue;
        for (let j = i + 1; j < n; j++) {
          const b = karts[j];
          if (!b || b.falling || b.ghost || b.cannonFlight) continue;
          const ra = 1.2 * (a.shrinkTimer > 0 ? 0.5 : 1);
          const rb = 1.2 * (b.shrinkTimer > 0 ? 0.5 : 1);
          const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
          const rr = ra + rb;
          const d2 = dx * dx + dz * dz;
          if (d2 >= rr * rr) continue;
          if (Math.abs(a.pos.y - b.pos.y) > 1.5) continue;
          let d = Math.sqrt(d2), nx, nz;
          if (d < 1e-4) { nx = 1; nz = 0; d = 0; } else { nx = dx / d; nz = dz / d; }
          const overlap = rr - d;
          const ma = Math.pow(a.stats.mass, 1.5), mb = Math.pow(b.stats.mass, 1.5); // heavy karts shove light ones
          const wa = mb / (ma + mb), wb = ma / (ma + mb); // share of push for a, b
          a.pos.x -= nx * overlap * wa; a.pos.z -= nz * overlap * wa;
          b.pos.x += nx * overlap * wb; b.pos.z += nz * overlap * wb;
          // bounce: a decaying knock-back impulse along the contact normal (min 3.5 m/s so pileups
          // spread out), plus a one-off speed loss only for a kart that drove nose-first into the other
          const rv = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
          if (rv < 0 || overlap > 0.4) {
            const close = Math.max(0, -rv);
            const jimp = Math.min(14, 3.5 + close * 0.9);
            a._kx -= nx * jimp * wa * 2; a._kz -= nz * jimp * wa * 2;
            b._kx += nx * jimp * wb * 2; b._kz += nz * jimp * wb * 2;
            if (close > 2) {
              const aInto = Math.sin(a.heading) * nx + Math.cos(a.heading) * nz;       // a facing b
              const bInto = -(Math.sin(b.heading) * nx + Math.cos(b.heading) * nz);    // b facing a
              const loss = Math.min(0.3, close * 0.02);
              if (a._impactCd <= 0 && aInto > 0.5) { a.speed *= 1 - loss * wa * 2 * aInto; a._impactCd = 0.4; }
              if (b._impactCd <= 0 && bInto > 0.5) { b.speed *= 1 - loss * wb * 2 * bInto; b._impactCd = 0.4; }
            }
          }
          // star / squish
          const aStar = a.starTimer > 0, bStar = b.starTimer > 0;
          if (aStar && !bStar) b.hit('flip');
          else if (bStar && !aStar) a.hit('flip');
          else if (!aStar && !bStar) {
            if (a.shrinkTimer <= 0 && b.shrinkTimer > 0) b.hit('squish');
            else if (b.shrinkTimer <= 0 && a.shrinkTimer > 0) a.hit('squish');
          }
          if ((a._bumpCd <= 0 && b._bumpCd <= 0) && (a.isPlayer || b.isPlayer)) {
            a._bumpCd = 0.3; b._bumpCd = 0.3;
            if (G.Sound && G.Sound.play) G.Sound.play('bump');
          }
        }
      }
    }
  }

  // helper: whether stall came with accel pressed (for rocket-start smoke)
  function inp0(k) { return k.input && k.input.accel > 0.5; }

  G.Kart = Kart;
})();
