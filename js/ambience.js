// Ambience (v5): starter drone (countdown light / FINAL LAP sign / checkered flag), per-theme ambient particles,
// event FX (confetti cannons, fireworks, hazard debris) and a sun lens flare. Everything is pooled:
// 5 instanced billboard pools (soft+, spark+, soft, square, critters) + flare pool + tumbleweed + drone parts.
(function () {
  'use strict';
  const G = (window.G = window.G || {});
  const hasCanvas = typeof document !== 'undefined' && !!document.createElement;
  const PI = Math.PI, TAU = Math.PI * 2;
  const rnd = Math.random;
  const R = (a, b) => a + rnd() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const _c = new THREE.Color();

  // ------------------------------------------------------------------ textures
  let _white = null, _glyph = null, _signTex = null, _flagTex = null;
  function whiteTex() {
    if (!_white) { _white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat); _white.needsUpdate = true; }
    return _white;
  }
  function canvasTex(w, h, draw) {
    if (!hasCanvas) return null;
    try {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      draw(c.getContext('2d'), w, h);
      return new THREE.CanvasTexture(c);
    } catch (e) { return null; }
  }
  function glyphTex() { // 2 cells: butterfly | gull
    if (_glyph) return _glyph;
    _glyph = canvasTex(128, 64, (x) => {
      x.fillStyle = '#fff';
      const wing = (cx, cy, rx, ry, rot) => { x.beginPath(); x.ellipse(cx, cy, rx, ry, rot, 0, TAU); x.fill(); };
      wing(18, 22, 14, 19, -0.5); wing(46, 22, 14, 19, 0.5); wing(21, 44, 9, 12, -0.3); wing(43, 44, 9, 12, 0.3);
      x.fillStyle = 'rgba(40,30,30,1)'; x.fillRect(30, 12, 4, 44);
      x.strokeStyle = '#fff'; x.lineWidth = 6; x.lineCap = 'round'; x.beginPath();
      x.moveTo(70, 38); x.quadraticCurveTo(82, 12, 96, 34); x.quadraticCurveTo(110, 12, 122, 38); x.stroke();
    });
    return _glyph || whiteTex();
  }
  function signTex() {
    if (_signTex) return _signTex;
    _signTex = canvasTex(256, 96, (x, w, h) => {
      x.fillStyle = '#d81e2c'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#fff'; x.fillRect(6, 6, w - 12, h - 12);
      x.fillStyle = '#d81e2c'; x.fillRect(12, 12, w - 24, h - 24);
      x.fillStyle = '#fff'; x.font = '900 40px Bungee, Rubik, Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('FINAL LAP!', w / 2, h / 2 + 2);
    });
    return _signTex;
  }
  function flagTex() {
    if (_flagTex) return _flagTex;
    _flagTex = canvasTex(128, 80, (x, w, h) => {
      const n = 8, s = w / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < 5; j++) { x.fillStyle = (i + j) & 1 ? '#111' : '#fafafa'; x.fillRect(i * s, j * (h / 5), s + 1, h / 5 + 1); }
    });
    if (_flagTex) { _flagTex.wrapS = _flagTex.wrapT = THREE.ClampToEdgeWrapping; }
    return _flagTex;
  }

  // ------------------------------------------------------------------ billboard pool
  const VS = [
    'attribute vec3 aPos; attribute vec4 aCol; attribute vec4 aSz;',
    'uniform float cells; varying vec2 vUv; varying vec4 vCol;',
    'void main(){',
    ' vec4 mv = viewMatrix * vec4( aPos, 1.0 );',
    ' float c = cos( aSz.z ), s = sin( aSz.z );',
    ' vec2 p = position.xy * aSz.xy; p = vec2( c * p.x - s * p.y, s * p.x + c * p.y );',
    ' mv.xy += p; gl_Position = projectionMatrix * mv;',
    ' vUv = vec2( ( uv.x + aSz.w ) / cells, uv.y ); vCol = aCol; }',
  ].join('\n');
  const FS = [
    'uniform sampler2D map; varying vec2 vUv; varying vec4 vCol;',
    'void main(){ vec4 t = texture2D( map, vUv ); float a = vCol.a * t.a; if ( a < 0.01 ) discard;',
    ' gl_FragColor = vec4( vCol.rgb * t.rgb, a ); }',
  ].join('\n');

  class Pool {
    constructor(N, tex, o) {
      o = o || {};
      this.N = N; this.dynStart = o.dynStart || 0; this.cur = this.dynStart; this.nAmb = 0; this.cell = 0;
      const g = (this.geo = new THREE.InstancedBufferGeometry());
      const pl = new THREE.PlaneBufferGeometry(1, 1);
      g.index = pl.index; g.setAttribute('position', pl.getAttribute('position')); g.setAttribute('uv', pl.getAttribute('uv'));
      const mk = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(N * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
      this.aPos = mk(3); this.aCol = mk(4); this.aSz = mk(4);
      g.setAttribute('aPos', this.aPos); g.setAttribute('aCol', this.aCol); g.setAttribute('aSz', this.aSz);
      g.instanceCount = N;
      this.mat = new THREE.ShaderMaterial({
        uniforms: { map: { value: tex || whiteTex() }, cells: { value: o.cells || 1 } },
        vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, depthTest: o.depthTest !== false,
        blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      this.mesh = new THREE.Mesh(g, this.mat);
      this.mesh.frustumCulled = false; this.mesh.renderOrder = o.order || 5;
      const F = () => new Float32Array(N);
      this.vx = F(); this.vy = F(); this.vz = F(); this.life = F(); this.max = F(); this.grav = F(); this.drag = F(); this.grow = F();
      this.spin = F(); this.flut = F(); this.ph = F(); this.w0 = F(); this.h0 = F(); this.a0 = F(); this.rad = F(); this.ylo = F(); this.yhi = F();
      this.shape = new Uint8Array(N); this.kind = new Uint8Array(N);
    }
    // dynamic emit (ring buffer over the non-ambient region); returns index so callers can tweak extras
    emit(x, y, z, vx, vy, vz, life, hex, a, w, h) {
      const i = this.cur; if (++this.cur >= this.N) this.cur = this.dynStart;
      const p = this.aPos.array, c = this.aCol.array, s = this.aSz.array;
      p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
      _c.setHex(hex); c[i * 4] = _c.r; c[i * 4 +1] = _c.g; c[i * 4 + 2] = _c.b; c[i * 4 + 3] = a;
      s[i * 4] = w; s[i * 4 + 1] = h; s[i * 4 + 2] = 0; s[i * 4 + 3] = this.cell;
      this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz; this.life[i] = life; this.max[i] = life;
      this.grav[i] = 0; this.drag[i] = 0; this.grow[i] = 0; this.spin[i] = 0; this.flut[i] = 0; this.shape[i] = 0;
      this.ph[i] = rnd() * TAU; this.w0[i] = w; this.h0[i] = h; this.a0[i] = a; this.kind[i] = 0;
      return i;
    }
    clearDyn() {
      for (let i = this.dynStart; i < this.N; i++) { this.life[i] = 0; this.aCol.array[i * 4 + 3] = 0; }
      this.cur = this.dynStart;
    }
    // ambient slot setup
    amb(i, kind, hex, a, w, h) {
      const c = this.aCol.array, s = this.aSz.array;
      _c.setHex(hex); c[i * 4] = _c.r; c[i * 4 + 1] = _c.g; c[i * 4 + 2] = _c.b; c[i * 4 + 3] = a;
      s[i * 4] = w; s[i * 4 + 1] = h; s[i * 4 + 2] = 0; s[i * 4 + 3] = this.cell;
      this.kind[i] = kind; this.a0[i] = a; this.w0[i] = w; this.h0[i] = h; this.ph[i] = rnd() * TAU; this.life[i] = 0;
    }
    stepDyn(dt, t) {
      const N = this.N, P = this.aPos.array, C = this.aCol.array, S = this.aSz.array;
      for (let i = this.dynStart; i < N; i++) {
        let l = this.life[i]; if (l <= 0) continue;
        l -= dt;
        if (l <= 0) { this.life[i] = 0; C[i * 4 + 3] = 0; continue; }
        this.life[i] = l;
        const m = this.max[i], u = 1 - l / m, k = i * 3;
        const dr = Math.max(0, 1 - this.drag[i] * dt);
        this.vx[i] *= dr; this.vz[i] *= dr; this.vy[i] = this.vy[i] * dr + this.grav[i] * dt;
        const fl = this.flut[i], ph = this.ph[i];
        P[k] += this.vx[i] * dt + (fl ? Math.sin(t * 7 + ph) * fl * dt : 0);
        P[k + 1] += this.vy[i] * dt;
        P[k + 2] += this.vz[i] * dt + (fl ? Math.cos(t * 6 + ph * 2) * fl * dt : 0);
        const sc = Math.max(0.05, 1 + this.grow[i] * u), sh = this.shape[i];
        C[i * 4 + 3] = this.a0[i] * Math.min(1, u * 12) * Math.min(1, (1 - u) * (sh === 1 || sh === 2 ? 4 : 2.5));
        if (sh === 1) { // confetti flip
          S[i * 4] = this.w0[i] * sc; S[i * 4 + 1] = this.h0[i] * sc * (0.12 + 0.88 * Math.abs(Math.sin(ph * 3 + u * m * this.spin[i])));
          S[i * 4 + 2] = ph;
        } else if (sh === 2) { // streamer
          S[i * 4] = this.w0[i]; S[i * 4 + 1] = this.h0[i] * (0.4 + 0.6 * Math.abs(Math.sin(ph + u * m * 3)));
          S[i * 4 + 2] = ph + u * m * this.spin[i];
        } else { S[i * 4] = this.w0[i] * sc; S[i * 4 + 1] = this.h0[i] * sc; }
      }
    }
    upload() { this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSz.needsUpdate = true; }
    dispose(scene) {
      scene.remove(this.mesh); this.geo.dispose(); this.mat.dispose();
    }
  }

  // ------------------------------------------------------------------ drone
  function mergeGeos(parts) {
    let n = 0;
    const gs = parts.map((p) => {
      const g = p.g.index ? p.g.toNonIndexed() : p.g;
      g.applyMatrix4(p.m); n += g.getAttribute('position').count; return { g, c: p.c };
    });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let o = 0;
    for (const { g, c } of gs) {
      const pa = g.getAttribute('position'), na = g.getAttribute('normal'); _c.setHex(c);
      for (let i = 0; i < pa.count; i++, o++) {
        pos[o * 3] = pa.getX(i); pos[o * 3 + 1] = pa.getY(i); pos[o * 3 + 2] = pa.getZ(i);
        nor[o * 3] = na ? na.getX(i) : 0; nor[o * 3 + 1] = na ? na.getY(i) : 1; nor[o * 3 + 2] = na ? na.getZ(i) : 0;
        col[o * 3] = _c.r; col[o * 3 + 1] = _c.g; col[o * 3 + 2] = _c.b;
      }
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return out;
  }
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
  function xf(x, y, z, rx, ry, rz, sx, sy, sz) {
    _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e);
    return new THREE.Matrix4().compose(_v1.set(x, y, z), _q, _v2.set(sx || 1, sy || 1, sz || 1));
  }

  function buildDrone() {
    const grp = new THREE.Group();
    const body = [
      { g: new THREE.SphereGeometry(0.55, 14, 10), m: xf(0, 0, 0), c: 0xffd23a },
      { g: new THREE.TorusGeometry(0.56, 0.085, 6, 18), m: xf(0, -0.02, 0, PI / 2), c: 0xe23b3b },
      { g: new THREE.SphereGeometry(0.14, 8, 6), m: xf(-0.2, 0.1, 0.47), c: 0xffffff },
      { g: new THREE.SphereGeometry(0.14, 8, 6), m: xf(0.2, 0.1, 0.47), c: 0xffffff },
      { g: new THREE.SphereGeometry(0.07, 6, 5), m: xf(-0.2, 0.1, 0.59), c: 0x111111 },
      { g: new THREE.SphereGeometry(0.07, 6, 5), m: xf(0.2, 0.1, 0.59), c: 0x111111 },
      { g: new THREE.SphereGeometry(0.2, 8, 6), m: xf(-0.7, 0, 0), c: 0x3aa0ff },
      { g: new THREE.SphereGeometry(0.2, 8, 6), m: xf(0.7, 0, 0), c: 0x3aa0ff },
      { g: new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6), m: xf(0, 0.65, 0), c: 0x8a8f99 },
      { g: new THREE.CylinderGeometry(0.04, 0.04, 0.55, 6), m: xf(0, -0.75, 0), c: 0x8a8f99 },
    ];
    const bodyMesh = new THREE.Mesh(mergeGeos(body), new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: 0x444444, flatShading: false }));
    grp.add(bodyMesh);
    // propeller (spins) + blur disc
    const prop = mergeGeos([
      { g: new THREE.BoxGeometry(1.7, 0.03, 0.14), m: xf(0, 0, 0), c: 0xe8e8ee },
      { g: new THREE.BoxGeometry(1.7, 0.03, 0.14), m: xf(0, 0, 0, 0, PI / 2), c: 0xe8e8ee },
      { g: new THREE.SphereGeometry(0.1, 6, 5), m: xf(0, 0.02, 0), c: 0xe23b3b },
    ]);
    const propMesh = new THREE.Mesh(prop, new THREE.MeshBasicMaterial({ vertexColors: true }));
    propMesh.position.y = 0.82; grp.add(propMesh);
    // traffic light
    const traffic = new THREE.Group(); traffic.position.y = -1.0;
    const boxGeo = mergeGeos([
      { g: new THREE.BoxGeometry(0.56, 1.3, 0.3), m: xf(0, -0.65, 0), c: 0x232b3a },
      { g: new THREE.BoxGeometry(0.62, 0.06, 0.4), m: xf(0, -0.04, 0.02), c: 0x3a4660 },
    ]);
    const boxMesh = new THREE.Mesh(boxGeo, new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 30 }));
    traffic.add(boxMesh);
    const lamps = [];
    const lg = new THREE.SphereGeometry(0.15, 10, 8);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ color: 0x2a2a2a }));
      m.position.set(0, -0.3 - i * 0.4, 0.17); traffic.add(m); lamps.push(m);
    }
    grp.add(traffic);
    // sign
    const sign = new THREE.Group(); sign.position.y = -0.9;
    const st = signTex();
    const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), new THREE.MeshBasicMaterial({ map: st || null, color: st ? 0xffffff : 0xd81e2c, side: THREE.DoubleSide }));
    signMesh.position.y = -0.55; sign.add(signMesh);
    sign.add(new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0x8a8f99 })));
    grp.add(sign);
    // flag
    const flag = new THREE.Group(); flag.position.set(0.75, 0.3, 0);
    flag.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.3, 6), new THREE.MeshBasicMaterial({ color: 0xcfcfd6 })));
    flag.children[0].position.y = 1.0;
    const clothGeo = new THREE.PlaneGeometry(1.6, 1.0, 10, 5);
    const clothBase = clothGeo.getAttribute('position').array.slice();
    const ft = flagTex();
    const cloth = new THREE.Mesh(clothGeo, new THREE.MeshBasicMaterial({ map: ft || null, color: ft ? 0xffffff : 0xdddddd, side: THREE.DoubleSide }));
    cloth.position.set(0.82, 1.65, 0); flag.add(cloth);
    grp.add(flag);
    grp.scale.setScalar(2.1);
    grp.visible = false;
    return { grp, body: bodyMesh, prop: propMesh, traffic, lamps, sign, flag, cloth, clothGeo, clothBase };
  }
  function disposeDrone(d, scene) {
    scene.remove(d.grp);
    d.grp.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { if (o.material.map && o.material.map !== _signTex && o.material.map !== _flagTex) o.material.map.dispose(); o.material.dispose(); }
    });
  }

  // ------------------------------------------------------------------ ambient profiles
  const CONF = [0xff3b4e, 0xffd23a, 0x3ad1ff, 0x59e06b, 0xff7ad9, 0xffffff, 0xff9a2e, 0xa56bff];
  // layer: [pool, count, R, ylo, yhi, size0, size1, colors, alpha, vx, vy, vz, wobble, twinkle, kind, shape]
  const PROFILES = {
    meadow: [
      ['A', 70, 24, -2, 9, 0.09, 0.17, [0xfff3b0, 0xffffff, 0xffe08a], 0.9, 0.35, 0.08, 0.2, 0.6, 2.2],
      ['E', 7, 30, -1.5, 3.5, 0.55, 0.75, [0xffe14a, 0xff7ad9, 0x6bd0ff, 0xffffff, 0xff9a3a], 1, 0, 0, 0, 0, 0, 6],
    ],
    beach: [
      ['C', 22, 34, -3, 3, 3.5, 6.5, [0xeaf6ff, 0xd6ecff], 0.07, 1.8, 0.25, 0.8, 0.6, 0, 2],
      ['A', 44, 24, -2, 7, 0.1, 0.2, [0xffffff, 0xbfefff], 0.75, 0.6, 0.1, 0.3, 0.8, 4.5],
      ['E', 6, 140, 14, 26, 4.2, 5.6, [0xffffff, 0xf2f2f2], 1, 0, 0, 0, 0, 0, 7],
    ],
    desert: [
      ['C', 34, 42, -2.5, 4, 2.2, 3.6, [0xf0d090, 0xf8e4b0], 0.38, 20, 0.05, 6, 0.6, 0, 1],
      ['C', 10, 40, -2.5, 3, 6, 9, [0xe8c890], 0.06, 7, 0.1, 2, 0.5, 0, 2],
      ['A', 30, 22, -2, 6, 0.08, 0.14, [0xffe8b0, 0xfff4d0], 0.6, 4, 0.1, 1.5, 0.6, 1.6],
    ],
    snow: [
      ['B', 80, 26, -2, 11, 0.14, 0.3, [0xffffff, 0xcfeeff, 0xe6f4ff], 0.85, 0.3, -0.35, 0.2, 0.5, 3.4],
    ],
    city: [
      ['A', 64, 26, -2, 10, 0.1, 0.22, [0x66ccff, 0xff66cc, 0xffe066, 0x9aff9a], 0.85, 0.2, 0.2, 0.15, 1.1, 1.6],
    ],
    jungle: [
      ['A', 42, 22, -1.5, 7, 0.13, 0.22, [0xd8ff5a, 0xb8ff40], 1, 0.2, 0.05, 0.2, 1.6, 3],
      ['D', 24, 20, -2, 11, 0.22, 0.32, [0x58b840, 0x8acb3a, 0xd8a030, 0xc86a28], 1, 0.4, -0.9, 0.3, 2.2, 0, 3, 1],
    ],
    fortress: [
      ['A', 78, 24, -2, 11, 0.09, 0.2, [0xff8a2a, 0xffc040, 0xff5a1a], 0.95, 0.4, 1.8, 0.3, 1.2, 7],
      ['C', 14, 28, -2, 5, 3, 5, [0xffa860], 0.05, 0.2, 1.2, 0.2, 0.6, 0, 2],
    ],
    rainbow: [
      ['B', 96, 40, -6, 22, 0.14, 0.34, [0xffffff, 0xffb8f0, 0xb8e8ff, 0xfff0a8, 0xc8ffc8], 0.95, 0, 0, 0, 0.3, 3],
    ],
    colosseum: [
      ['A', 40, 24, -2, 8, 0.09, 0.16, [0xffe9b0, 0xfff4d8], 0.6, 0.25, 0.05, 0.2, 0.5, 1.8],
    ],
    sunset: [
      ['A', 56, 24, -2, 9, 0.1, 0.18, [0xffb070, 0xffe0a0, 0xffd0d0], 0.8, 0.3, 0.1, 0.2, 0.7, 2],
      ['E', 4, 30, -1.5, 3.5, 0.5, 0.65, [0xffb03a, 0xff7a9a], 1, 0, 0, 0, 0, 0, 6],
    ],
    dust: [
      ['A', 40, 22, -2, 8, 0.08, 0.14, [0xffffff, 0xfff0d8], 0.55, 0.2, 0.05, 0.2, 0.5, 1.5],
    ],
  };
  const BY_ID = {
    sunshine_circuit: 'meadow', coral_coast: 'beach', tiny_tot_park: 'meadow', dusty_desert: 'desert',
    bayside_bridge: 'beach', castle_circuit: 'meadow', daydream_cruiser: 'sunset', mudslide_stadium: 'dust',
    grand_colosseum: 'colosseum', dino_ruins: 'jungle', lava_fortress: 'fortress', rainbow_ribbon: 'rainbow',
    frosty_floes: 'snow', neon_metro: 'city', serpent_coast: 'beach', boulder_peak: 'snow',
  };
  const BY_THEME = { meadow: 'meadow', dunes: 'desert', glacier: 'snow', starlight: 'rainbow' };
  const BY_SKY = { day: 'meadow', sunset: 'sunset', night: 'city', space: 'rainbow', indoor: 'dust' };
  const AMB_CAP = { A: 140, B: 100, C: 70, D: 30, E: 16 };

  function pickProfile(track) {
    const id = track && ((track.def && track.def.id) || track.id);
    const base = id ? String(id).replace(/_r$/, '') : '';
    if (BY_ID[base]) return BY_ID[base];
    if (track && BY_THEME[track.theme]) return BY_THEME[track.theme];
    if (track && BY_SKY[track.skyMode]) return BY_SKY[track.skyMode];
    return 'dust';
  }

  // ------------------------------------------------------------------ state
  let S = null;
  const v3a = new THREE.Vector3(), v3b = new THREE.Vector3();
  const Ambience = (G.Ambience = { active: false });

  function isHuman(k) { return !!(k && (k.isPlayer || k.human)); }
  function camPos(cam, out) { const e = cam.matrixWorld.elements; return out.set(e[12], e[13], e[14]); }

  Ambience.start = function (scene, track, game) {
    Ambience.stop();
    try {
      const quality = (G.GFX && G.GFX.quality) || 'high';
      const qf = quality === 'low' ? 0.5 : quality === 'medium' ? 0.75 : 1;
      const soft = (G.GFX && G.GFX.tex && G.GFX.tex.soft) || whiteTex();
      const spark = (G.GFX && G.GFX.tex && G.GFX.tex.spark) || soft;
      S = {
        scene, track, game, t: 0, qf, profile: pickProfile(track), pools: {}, camX: 0, camY: 3, camZ: 0,
        sched: [], shells: [], tw: null, ss: { on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ttl: 0, next: R(2, 5) },
        confNext: R(3, 6), arena: !!(G.Arena && track instanceof G.Arena), flare: null, flareA: 0, sky: track && track.skyMode,
      };
      const P = S.pools;
      P.A = new Pool(AMB_CAP.A + 40, soft, { additive: true, dynStart: AMB_CAP.A, order: 6 });
      P.B = new Pool(AMB_CAP.B + 420, spark, { additive: true, dynStart: AMB_CAP.B, order: 7 });
      P.C = new Pool(AMB_CAP.C + 170, soft, { dynStart: AMB_CAP.C, order: 4 });
      P.D = new Pool(AMB_CAP.D + 380, whiteTex(), { dynStart: AMB_CAP.D, order: 5 });
      P.E = new Pool(AMB_CAP.E, glyphTex(), { cells: 2, dynStart: AMB_CAP.E, order: 5 });
      P.Q = new Pool(5, soft, { additive: true, depthTest: false, order: 20, dynStart: 5 });
      for (const k in P) scene.add(P[k].mesh);
      buildAmbient(S);
      // tumbleweed
      if (S.profile === 'desert') {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), new THREE.MeshLambertMaterial({ color: 0x8a6a3a, wireframe: true }));
        m.visible = false; scene.add(m);
        S.tw = { mesh: m, x: 0, z: 0, dx: 1, dz: 0, gy: 0, idx: -1, on: false, next: 1 };
      }
      S.drone = buildDrone(); scene.add(S.drone.grp);
      S.dr = { state: 'off', mode: 'light', t: 0, dur: 1, hold: 0, lit: 0, green: false, x: 0, y: 0, z: 0, ux: 0, uy: 0, uz: 0, fx: 0, fy: 0, fz: 0, yaw: 0, ready: false };
      anchorDrone(S);
      showDrone('light', 2.6);
      setLamps(0, false);
      Ambience.active = true;
    } catch (e) {
      console.warn('[Ambience] start failed', e);
      Ambience.stop();
    }
  };

  function buildAmbient(s) {
    const prof = PROFILES[s.profile] || PROFILES.dust;
    const used = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    for (const L of prof) {
      const P = s.pools[L[0]]; if (!P) continue;
      let n = Math.round(L[1] * s.qf); n = Math.min(n, AMB_CAP[L[0]] - used[L[0]]);
      for (let j = 0; j < n; j++) {
        const i = used[L[0]]++;
        const kind = L[14] || 1; const size = R(L[5], L[6]) * (kind === 1 || kind === 2 || kind === 6 || kind === 7 ? 1 : 3.4);
        const shape = L[15] || 0;
        const hex = L[7][(rnd() * L[7].length) | 0];
        let w = size, h = size;
        if (kind === 6) { w = size * 2.2; h = w; }
        if (kind === 7) { w = size; h = size * 0.5; }
        if (L[0] === 'C' && L[14] === 1) { w = size * 2.6; h = size * 0.13; } // sand streak
        P.amb(i, kind, hex, L[8], w, h);
        P.vx[i] = L[9]; P.vy[i] = L[10]; P.vz[i] = L[11]; P.flut[i] = L[12]; P.spin[i] = L[13] * R(0.6, 1.4);
        P.rad[i] = (L[0] === 'A' || L[0] === 'B' || L[0] === 'D') ? L[2] * 0.6 : L[2]; P.ylo[i] = L[3]; P.yhi[i] = L[4]; P.shape[i] = shape;
        if (kind === 3 || shape === 1) P.shape[i] = 1;
        if (kind === 6) { P.grav[i] = rnd() * TAU; P.vx[i] = R(1.4, 2.6); }
        if (kind === 7) { P.aSz.array[i * 4 + 3] = 1; P.grav[i] = rnd() * TAU; P.spin[i] = (rnd() < 0.5 ? -1 : 1) * R(0.12, 0.28); P.drag[i] = R(18, 34); P.vx[i] = 1e9; }
        // initial placement random in box (relative to origin; repositioned on first update around camera)
        P.aPos.array[i * 3] = R(-P.rad[i], P.rad[i]); P.aPos.array[i * 3 + 1] = R(L[3], L[4]); P.aPos.array[i * 3 + 2] = R(-P.rad[i], P.rad[i]);
        P.life[i] = -1; // marks "needs first-frame placement around camera"
      }
    }
    for (const k in used) s.pools[k].nAmb = used[k];
  }

  // ------------------------------------------------------------------ drone control
  function anchorDrone(s) {
    const tr = s.track, d = s.dr;
    let ok = false;
    try {
      if (!s.arena && tr && tr.pointAt) {
        const p = tr.pointAt(0);
        d.hx = p.x; d.hy = p.y + 6.4; d.hz = p.z; d.tx = p.tx; d.tz = p.tz; d.rx = p.rx; d.rz = p.rz; d.hw = p.halfWidth || 10; d.gy = p.y; ok = true;
      }
    } catch (e) { ok = false; }
    if (!ok) {
      let gx = 0, gz = 0, hd = 0;
      try {
        const g = tr.getStartGrid(8); for (const q of g) { gx += q.x; gz += q.z; } gx /= g.length; gz /= g.length; hd = g[0].heading;
        d.gy = g[0].y || 0;
      } catch (e) { d.gy = 0; }
      d.tx = Math.sin(hd); d.tz = Math.cos(hd); d.rx = -d.tz; d.rz = d.tx; d.hw = 12;
      d.hx = gx + d.tx * 9; d.hz = gz + d.tz * 9; d.hy = d.gy + 7.5;
    }
    d.yaw0 = Math.atan2(-d.tx, -d.tz); // faces back toward the karts
  }
  function showDrone(mode, dur) {
    const d = S.dr, dd = S.drone;
    d.mode = mode; d.state = 'in'; d.t = 0; d.dur = dur;
    // enter from ahead / high / off to one side
    const side = mode === 'light' ? -22 : (rnd() < 0.5 ? -26 : 26);
    d.sx = d.hx + d.tx * (mode === 'light' ? 70 : 45) + d.rx * side; d.sy = d.hy + 16; d.sz = d.hz + d.tz * (mode === 'light' ? 70 : 45) + d.rz * side;
    d.x = d.sx; d.y = d.sy; d.z = d.sz; d.yaw = d.yaw0; d.hold = 0;
    dd.traffic.visible = mode === 'light'; dd.sign.visible = mode === 'sign'; dd.flag.visible = mode === 'flag';
    dd.grp.visible = true;
    dd.grp.scale.setScalar(2.1);
  }
  function setLamps(n, green) {
    const dd = S.drone; S.dr.lit = n; S.dr.green = green;
    for (let i = 0; i < 3; i++) {
      const on = green || i < n; const m = dd.lamps[i];
      m.material.color.setHex(on ? (green ? 0x35ff55 : 0xff2a1a) : 0x2a2a2a);
      m.scale.setScalar(on ? 1.2 : 1);
    }
  }
  function updateDrone(dt) {
    const d = S.dr, dd = S.drone; if (d.state === 'off') return;
    d.t += dt;
    const t = S.t;
    if (d.state === 'in') {
      const u = clamp(d.t / d.dur, 0, 1), e = 1 - Math.pow(1 - u, 3);
      d.x = d.sx + (d.hx - d.sx) * e; d.y = d.sy + (d.hy - d.sy) * e; d.z = d.sz + (d.hz - d.sz) * e;
      if (u >= 1) { d.state = 'hover'; d.t = 0; }
    } else if (d.state === 'hover') {
      d.x = d.hx; d.y = d.hy; d.z = d.hz;
      if (d.hold > 0 && d.t >= d.hold) { d.state = 'out'; d.t = 0; d.fx = d.tx * 6 + d.rx * (rnd() < 0.5 ? -4 : 4); d.fz = d.tz * 6 + d.rz * (rnd() < 0.5 ? -4 : 4); d.fy = 3; }
    } else if (d.state === 'out') {
      const a = d.t;
      d.x += d.fx * a * dt * 3; d.y += (d.fy + a * 9) * dt; d.z += d.fz * a * dt * 3;
      const k = clamp((d.t - 0.1) / 0.6, 0, 1);
      d.yaw = d.yaw0 + PI * (k * k * (3 - 2 * k)) * 0.9;
      if (d.t > 2.8) { d.state = 'off'; dd.grp.visible = false; return; }
    }
    const bob = d.state === 'hover' ? Math.sin(t * 2.2) * 0.2 : Math.sin(t * 3) * 0.1;
    dd.grp.position.set(d.x, d.y + bob, d.z);
    dd.grp.rotation.y = d.yaw;
    dd.grp.rotation.z = Math.sin(t * 1.7) * 0.05; dd.grp.rotation.x = d.state === 'in' ? 0.15 : 0;
    dd.prop.rotation.y += dt * 45;
    if (d.mode === 'sign') dd.sign.rotation.z = Math.sin(t * 2.4) * 0.06;
    if (d.mode === 'flag') {
      dd.flag.rotation.z = Math.sin(t * 3) * 0.05;
      const pos = dd.clothGeo.getAttribute('position'), b = dd.clothBase, arr = pos.array;
      for (let i = 0; i < pos.count; i++) {
        const x0 = b[i * 3], y0 = b[i * 3 + 1];
        const f = (x0 + 0.8) / 1.6; // 0 at pole, 1 at free edge
        arr[i * 3] = x0; arr[i * 3 + 1] = y0 + Math.sin(t * 9 - f * 6) * 0.05 * f;
        arr[i * 3 + 2] = Math.sin(t * 10 - f * 7 + y0) * 0.22 * f;
      }
      pos.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------------ hooks
  Ambience.countdown = function (n) {
    if (!S) return;
    try {
      const d = S.dr;
      if (n >= 1 && n <= 3) {
        if (d.state === 'off' || d.mode !== 'light') showDrone('light', 0.4);
        setLamps(4 - n, false);
      } else if (n === 0) {
        if (d.state === 'off' || d.mode !== 'light') { showDrone('light', 0.01); }
        setLamps(3, true);
        d.state = d.state === 'in' ? 'hover' : d.state; d.hold = 1.2; d.t = 0;
        if (d.state === 'hover') { d.x = d.hx; d.y = d.hy; d.z = d.hz; }
      }
    } catch (e) { /* ignore */ }
  };

  // schedule items: type 1 cannon confetti, 2 firework, 3 streamer cannon
  function sched(delay, type, x, y, z, ax, az) {
    const q = S.sched; if (q.length > 40) return;
    q.push({ t: delay, type, x, y, z, ax, az });
  }
  function lineCannons(isFinal) {
    const d = S.dr, off = d.hw + 1.5;
    for (let s = -1; s <= 1; s += 2) {
      const x = d.hx + d.rx * off * s, z = d.hz + d.rz * off * s, y = d.gy + 0.5;
      const ax = -d.rx * s, az = -d.rz * s;
      for (let k = 0; k < (isFinal ? 2 : 4); k++) sched(k * 0.28 + (s > 0 ? 0.05 : 0), isFinal ? 3 : 1, x, y, z, ax, az);
    }
  }
  Ambience.lap = function (kart, lap, isFinal) {
    if (!S || !isHuman(kart)) return;
    try {
      if (isFinal) {
        lineCannons(true);
        const p = kart.pos;
        burstConfetti(p.x, (kart.y !== undefined ? kart.y : p.y) + 1.2, p.z, 36, 7, 6);
        if (!S.arena && (S.dr.state === 'off' || S.dr.mode === 'sign')) { showDrone('sign', 0.9); S.dr.hold = 3.4; }
      }
    } catch (e) { /* ignore */ }
  };
  Ambience.finish = function (kart, place) {
    if (!S || !isHuman(kart)) return;
    try {
      lineCannons(false);
      const n = place <= 3 ? 7 : 3;
      for (let i = 0; i < n; i++) {
        const d = S.dr;
        sched(0.5 + i * 0.45, 2, d.hx + d.tx * R(-6, 10) + d.rx * R(-d.hw, d.hw), d.gy + R(16, 26), d.hz + d.tz * R(-6, 10) + d.rz * R(-d.hw, d.hw), 0, 0);
      }
      if (S.dr.state === 'off' || S.dr.mode !== 'flag') { showDrone('flag', 1.1); }
      S.dr.hold = 12;
    } catch (e) { /* ignore */ }
  };
  function groundAt(x, z, fb) {
    try {
      const q = S.track.query(x, z, -1, S.camY);
      if (q && isFinite(q.y)) return q.y;
    } catch (e) { /* ignore */ }
    return fb;
  }
  Ambience.hazardLaunched = function (e) {
    if (!S || !e) return;
    try {
      const x = e.x, z = e.z, y = groundAt(x, z, S.camY - 2.5) + 0.4;
      const C = S.pools.C, B = S.pools.B, D = S.pools.D;
      for (let i = 0; i < 14; i++) {
        const a = rnd() * TAU, sp = R(2, 6);
        const k = C.emit(x, y, z, Math.cos(a) * sp, R(1, 4), Math.sin(a) * sp, R(0.8, 1.4), rnd() < 0.5 ? 0xd9cdb6 : 0xb8ad98, 0.55, R(1.2, 2), R(1.2, 2));
        C.drag[k] = 2.2; C.grow[k] = 1.6; C.grav[k] = 1;
      }
      for (let i = 0; i < 14; i++) {
        const a = rnd() * TAU, sp = R(5, 12);
        const k = B.emit(x, y + 0.5, z, Math.cos(a) * sp, R(7, 15), Math.sin(a) * sp, R(0.6, 1.0), rnd() < 0.5 ? 0xffe46b : 0xffffff, 1, R(0.3, 0.55), R(0.3, 0.55));
        B.grav[k] = -24; B.drag[k] = 0.6; B.grow[k] = -0.5;
      }
      for (let i = 0; i < 10; i++) {
        const a = rnd() * TAU, sp = R(4, 9);
        const k = D.emit(x, y + 0.5, z, Math.cos(a) * sp, R(6, 13), Math.sin(a) * sp, R(0.9, 1.4), rnd() < 0.5 ? 0x7a6a55 : 0xa89878, 1, R(0.18, 0.34), R(0.18, 0.34));
        D.grav[k] = -26; D.shape[k] = 1; D.spin[k] = R(8, 16);
      }
    } catch (err) { /* ignore */ }
  };
  Ambience.itemHit = function (e) {
    if (!S || !e || !e.victim || !e.victim.pos) return;
    try {
      const p = e.victim.pos, y = (e.victim.y !== undefined ? e.victim.y : p.y) + 0.8;
      const B = S.pools.B, C = S.pools.C;
      const big = e.kind === 'flip';
      const n = big ? 18 : 9;
      for (let i = 0; i < n; i++) {
        const a = rnd() * TAU, sp = R(3, big ? 11 : 7);
        const k = B.emit(p.x, y, p.z, Math.cos(a) * sp, R(2, big ? 9 : 5), Math.sin(a) * sp, R(0.45, 0.8), [0xffe46b, 0xffffff, 0xffa030][i % 3], 1, R(0.3, 0.5), R(0.3, 0.5));
        B.grav[k] = -14; B.drag[k] = 1; B.grow[k] = -0.5;
      }
      for (let i = 0; i < (e.kind === 'squish' ? 4 : 6); i++) {
        const a = rnd() * TAU, sp = R(1.5, 4);
        const k = C.emit(p.x, y - 0.4, p.z, Math.cos(a) * sp, R(0.5, 2), Math.sin(a) * sp, R(0.5, 0.9), 0xdcd2c0, 0.45, R(0.9, 1.4), R(0.9, 1.4));
        C.drag[k] = 2; C.grow[k] = 1.4;
      }
    } catch (err) { /* ignore */ }
  };
  Ambience.boostPad = function (kart) {
    if (!S || !kart || !kart.pos) return;
    try {
      const B = S.pools.B, p = kart.pos, h = kart.heading || 0, fx = Math.sin(h), fz = Math.cos(h);
      const y = (kart.y !== undefined ? kart.y : p.y) + 0.3;
      for (let i = 0; i < 12; i++) {
        const sp = R(3, 9), lat = R(-1.2, 1.2);
        const k = B.emit(p.x - fx * 1.2 - fz * lat, y + R(0, 0.4), p.z - fz * 1.2 + fx * lat, -fx * sp, R(0.5, 2.5), -fz * sp, R(0.35, 0.6), [0xffb030, 0xffe070, 0xff6a20][i % 3], 1, R(0.3, 0.55), R(0.3, 0.55));
        B.grow[k] = -0.6; B.drag[k] = 1.5;
      }
    } catch (err) { /* ignore */ }
  };

  // ------------------------------------------------------------------ event FX primitives
  function burstConfetti(x, y, z, n, up, spread) {
    const D = S.pools.D;
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, sp = R(0.2, 1) * spread;
      const k = D.emit(x, y, z, Math.cos(a) * sp, up * R(0.6, 1.2), Math.sin(a) * sp, R(2.4, 4), CONF[(rnd() * CONF.length) | 0], 1, R(0.16, 0.3), R(0.16, 0.3));
      D.grav[k] = -6.5; D.drag[k] = 1.1; D.flut[k] = R(1, 2.4); D.shape[k] = 1; D.spin[k] = R(6, 14);
    }
  }
  function cannonConfetti(c, streamers) {
    const D = S.pools.D;
    const n = streamers ? 22 : 34;
    for (let i = 0; i < n; i++) {
      const sp = R(3, 8), up = R(15, 24);
      const vx = c.ax * sp + R(-3, 3), vz = c.az * sp + R(-3, 3);
      let k;
      if (streamers && i % 2 === 0) {
        k = D.emit(c.x, c.y, c.z, vx, up, vz, R(2.6, 4), CONF[(rnd() * CONF.length) | 0], 1, 0.11, R(0.8, 1.5));
        D.shape[k] = 2; D.spin[k] = R(-6, 6);
      } else {
        k = D.emit(c.x, c.y, c.z, vx, up, vz, R(2.8, 4.4), CONF[(rnd() * CONF.length) | 0], 1, R(0.18, 0.3), R(0.18, 0.3));
        D.shape[k] = 1; D.spin[k] = R(6, 14);
      }
      D.grav[k] = -7; D.drag[k] = 1.3; D.flut[k] = R(1, 2.6);
    }
    // muzzle puff
    const B = S.pools.B;
    for (let i = 0; i < 6; i++) {
      const k = B.emit(c.x, c.y + 0.3, c.z, c.ax * R(1, 5) + R(-2, 2), R(4, 11), c.az * R(1, 5) + R(-2, 2), R(0.3, 0.5), 0xfff2b0, 1, R(0.4, 0.7), R(0.4, 0.7));
      B.grav[k] = -10; B.grow[k] = -0.6;
    }
  }
  const FW = [[0xff4060, 0xffd0d8], [0x40d0ff, 0xd8f4ff], [0xffe040, 0xfff8d0], [0x70ff70, 0xe0ffe0], [0xff80ff, 0xffe0ff], [0xffa030, 0xffe8c0]];
  function explode(x, y, z) {
    const B = S.pools.B, pal = FW[(rnd() * FW.length) | 0];
    const n = Math.round(46 * (0.6 + 0.4 * S.qf));
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1, a = rnd() * TAU, r = Math.sqrt(1 - u * u), sp = R(8, 14);
      const k = B.emit(x, y, z, Math.cos(a) * r * sp, u * sp, Math.sin(a) * r * sp, R(1.3, 2.0), pal[i % 2], 1, R(0.55, 0.9), R(0.55, 0.9));
      B.grav[k] = -4.5; B.drag[k] = 1.5; B.grow[k] = -0.55;
    }
    for (let i = 0; i < 10; i++) { // inner glitter
      const a = rnd() * TAU, sp = R(2, 5);
      const k = B.emit(x, y, z, Math.cos(a) * sp, R(-2, 4), Math.sin(a) * sp, R(0.8, 1.2), 0xffffff, 1, 0.9, 0.9);
      B.drag[k] = 2; B.grow[k] = -0.8;
    }
  }
  function stepSched(dt) {
    const q = S.sched;
    for (let i = q.length - 1; i >= 0; i--) {
      const c = q[i]; c.t -= dt;
      if (c.t > 0) continue;
      q[i] = q[q.length - 1]; q.pop();
      if (c.type === 1) cannonConfetti(c, false);
      else if (c.type === 3) cannonConfetti(c, true);
      else if (c.type === 2) {
        const sh = S.shells; if (sh.length < 10) sh.push({ x: c.x, y: c.y - 19, z: c.z, vy: 19, tx: c.y });
      }
    }
    const sh = S.shells, B = S.pools.B;
    for (let i = sh.length - 1; i >= 0; i--) {
      const s = sh[i];
      s.vy -= 8 * dt; s.y += s.vy * dt;
      const k = B.emit(s.x + R(-0.2, 0.2), s.y, s.z + R(-0.2, 0.2), 0, -R(1, 3), 0, R(0.35, 0.6), 0xffd890, 0.9, 0.4, 0.4);
      B.grow[k] = -0.7;
      if (s.vy <= 1.5) { explode(s.x, s.y, s.z); sh[i] = sh[sh.length - 1]; sh.pop(); }
    }
  }

  // ------------------------------------------------------------------ ambient update
  function stepAmbient(P, dt, t, cx, cy, cz, first) {
    const n = P.nAmb; if (!n) return;
    const pa = P.aPos.array, ca = P.aCol.array, sa = P.aSz.array;
    for (let i = 0; i < n; i++) {
      const k = i * 3, kind = P.kind[i], Rr = P.rad[i], ph = P.ph[i];
      let x = pa[k], y = pa[k + 1], z = pa[k + 2];
      if (P.life[i] < 0) { // first placement relative to the camera
        x += cx; y += cy; z += cz; P.life[i] = 0;
        if (kind === 7) { P.vx[i] = cx + R(-60, 60); P.vz[i] = cz + R(-60, 60); }
      }
      if (kind === 7) { // gull orbit
        let ox = P.vx[i], oz = P.vz[i];
        const ddx = ox - cx, ddz = oz - cz;
        if (ddx * ddx + ddz * ddz > 150 * 150 || ox > 1e8) { const a = rnd() * TAU, d = R(35, 90); ox = P.vx[i] = cx + Math.cos(a) * d; oz = P.vz[i] = cz + Math.sin(a) * d; }
        P.grav[i] += P.spin[i] * dt; const ang = P.grav[i], rr = P.drag[i];
        x = ox + Math.cos(ang) * rr; z = oz + Math.sin(ang) * rr;
        y = cy + P.ylo[i] + (P.yhi[i] - P.ylo[i]) * 0.5 + Math.sin(t * 0.3 + ph) * 3;
        sa[i * 4] = P.w0[i] * (P.spin[i] > 0 ? 1 : -1); sa[i * 4 + 1] = P.h0[i] * (0.75 + 0.25 * Math.sin(t * 2.6 + ph));
        pa[k] = x; pa[k + 1] = y; pa[k + 2] = z;
        continue;
      }
      if (kind === 6) { // butterfly
        P.grav[i] += Math.sin(t * 0.9 + ph * 3) * 1.8 * dt;
        const hd = P.grav[i], sp = P.vx[i];
        x += Math.cos(hd) * sp * dt; z += Math.sin(hd) * sp * dt; y += Math.sin(t * 2.3 + ph) * 0.8 * dt;
        sa[i * 4 + 1] = P.h0[i] * (0.2 + 0.8 * Math.abs(Math.sin(t * 15 + ph)));
        sa[i * 4 + 2] = Math.sin(t * 1.5 + ph) * 0.3;
      } else {
        const wob = P.flut[i];
        x += (P.vx[i] + Math.sin(t * 0.8 + ph) * wob) * dt;
        z += (P.vz[i] + Math.cos(t * 0.7 + ph * 1.3) * wob) * dt;
        y += (P.vy[i] + Math.sin(t * 1.1 + ph * 2) * wob * 0.5) * dt;
        if (P.shape[i] === 1) { sa[i * 4 + 1] = P.h0[i] * (0.15 + 0.85 * Math.abs(Math.sin(t * 3.2 + ph * 5))); sa[i * 4 + 2] = ph + t * 0.6; }
      }
      // wrap around the camera box (modulo handles camera teleports)
      let dx = x - cx, dz = z - cz, dy = y - cy;
      const D2 = 2 * Rr, yl = P.ylo[i], yr = P.yhi[i] - yl;
      if (dx > Rr || dx < -Rr) { dx = ((dx + Rr) % D2 + D2) % D2 - Rr; x = cx + dx; }
      if (dz > Rr || dz < -Rr) { dz = ((dz + Rr) % D2 + D2) % D2 - Rr; z = cz + dz; }
      if (dy > yl + yr || dy < yl) { dy = ((dy - yl) % yr + yr) % yr + yl; y = cy + dy; }
      pa[k] = x; pa[k + 1] = y; pa[k + 2] = z;
      const e = Math.max(Math.abs(dx), Math.abs(dz)) / Rr;
      let f = e > 0.7 ? (1 - e) / 0.3 : 1;
      const ey = (dy - yl) / yr; if (ey < 0.12) f *= ey / 0.12; else if (ey > 0.88) f *= (1 - ey) / 0.12;
      const tw = P.spin[i];
      if (kind !== 6 && tw > 0) f *= 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * tw + ph));
      ca[i * 4 + 3] = P.a0[i] * (f < 0 ? 0 : f);
    }
  }

  function stepFlare(dt, cam) {
    const Q = S.pools.Q, G_ = G.GFX;
    let target = 0;
    const sky = S.sky;
    const m = cam.matrixWorld.elements;
    const right = v3a.set(m[0], m[1], m[2]), up = v3b.set(m[4], m[5], m[6]);
    if (G_ && G_.sunDir && sky !== 'night' && sky !== 'space' && sky !== 'indoor') {
      const d = G_.sunDir;
      const zc = -(d.x * m[8] + d.y * m[9] + d.z * m[10]);
      if (zc > 0.08 && d.y > 0.0) {
        const th = Math.tan(cam.fov * PI / 360), asp = cam.aspect || 1.6;
        const nx = (d.x * m[0] + d.y * m[1] + d.z * m[2]) / (zc * th * asp), ny = (d.x * m[4] + d.y * m[5] + d.z * m[6]) / (zc * th);
        S.fnx = nx; S.fny = ny;
        const edge = Math.max(Math.abs(nx), Math.abs(ny));
        target = clamp(1 - (edge - 0.75) / 0.6, 0, 1) * clamp((zc - 0.08) / 0.2, 0, 1);
      }
    }
    S.flareA += (target - S.flareA) * Math.min(1, dt * 5);
    const a = S.flareA, ca = Q.aCol.array;
    if (a < 0.003) { for (let i = 0; i < 5; i++) ca[i * 4 + 3] = 0; Q.upload(); return; }
    const dist = 25, th = Math.tan(cam.fov * PI / 360), uh = 2 * dist * th, uw = uh * (cam.aspect || 1.6);
    const cx = m[12] - m[8] * dist, cy = m[13] - m[9] * dist, cz = m[14] - m[10] * dist;
    const els = FLARE, pa = Q.aPos.array, sa = Q.aSz.array;
    const sc = G_.sunColor;
    for (let i = 0; i < 5; i++) {
      const E = els[i], nx = S.fnx * E[0], ny = S.fny * E[0];
      const ox = nx * 0.5 * uw, oy = ny * 0.5 * uh;
      pa[i * 3] = cx + right.x * ox + up.x * oy; pa[i * 3 + 1] = cy + right.y * ox + up.y * oy; pa[i * 3 + 2] = cz + right.z * ox + up.z * oy;
      _c.setHex(E[2]); if (i === 0 && sc) _c.lerp(sc, 0.5);
      ca[i * 4] = _c.r; ca[i * 4 + 1] = _c.g; ca[i * 4 + 2] = _c.b; ca[i * 4 + 3] = E[3] * a;
      sa[i * 4] = sa[i * 4 + 1] = E[1] * uh; sa[i * 4 + 2] = 0; sa[i * 4 + 3] = 0;
    }
    Q.upload();
  }
  const FLARE = [[1.0, 0.34, 0xfff0c0, 0.3], [0.62, 0.07, 0xffd890, 0.22], [0.28, 0.12, 0x9fd0ff, 0.1], [-0.25, 0.05, 0xffffff, 0.2], [-0.7, 0.16, 0xffb0e0, 0.09]];

  Ambience.update = function (dt, time, cameras) {
    if (!S) return;
    try {
      dt = Math.min(dt || 0.016, 0.1); S.t += dt; const t = S.t;
      const cam = cameras && cameras[0];
      if (cam) { const e = cam.matrixWorld.elements; S.camX = e[12]; S.camY = e[13]; S.camZ = e[14]; }
      const P = S.pools, cx = S.camX, cy = S.camY, cz = S.camZ;
      updateDrone(dt);
      stepSched(dt);
      // theme extras
      if (S.profile === 'colosseum') {
        S.confNext -= dt;
        if (S.confNext <= 0) {
          S.confNext = R(3.5, 7); const a = rnd() * TAU, d = R(40, 70);
          burstConfetti(cx + Math.cos(a) * d, cy + 3, cz + Math.sin(a) * d, 24, 11, 5);
        }
      }
      if (S.profile === 'rainbow') stepShooting(dt, cx, cy, cz);
      if (S.tw) stepTumble(dt, t, cx, cy, cz);
      for (const k of ['A', 'B', 'C', 'D', 'E']) {
        const p = P[k]; stepAmbient(p, dt, t, cx, cy, cz); p.stepDyn(dt, t); p.upload();
      }
      if (cam) stepFlare(dt, cam);
    } catch (e) {
      if (!S.warned) { S.warned = true; console.warn('[Ambience] update', e); }
    }
  };

  function stepShooting(dt, cx, cy, cz) {
    const s = S.ss, B = S.pools.B;
    if (!s.on) {
      s.next -= dt;
      if (s.next <= 0) {
        s.on = true; s.ttl = R(0.7, 1.1); s.next = R(2.5, 6);
        const a = rnd() * TAU, d = R(140, 220);
        s.x = cx + Math.cos(a) * d; s.z = cz + Math.sin(a) * d; s.y = cy + R(60, 120);
        const b = a + PI / 2 + R(-0.4, 0.4); s.vx = Math.cos(b) * 170; s.vz = Math.sin(b) * 170; s.vy = -R(30, 70);
      }
      return;
    }
    s.ttl -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
    for (let i = 0; i < 2; i++) {
      const k = B.emit(s.x - s.vx * dt * i * 0.5, s.y - s.vy * dt * i * 0.5, s.z - s.vz * dt * i * 0.5, 0, 0, 0, 0.55, i ? 0xb8e8ff : 0xffffff, 1, 5, 5);
      B.grow[k] = -0.9;
    }
    if (s.ttl <= 0) s.on = false;
  }
  function stepTumble(dt, t, cx, cy, cz) {
    const w = S.tw, m = w.mesh;
    if (!w.on) {
      w.next -= dt; if (w.next > 0) return;
      const a = rnd() * TAU, d = R(30, 55);
      w.x = cx + Math.cos(a) * d; w.z = cz + Math.sin(a) * d; w.idx = -1;
      const b = rnd() * TAU; w.dx = Math.cos(b); w.dz = Math.sin(b);
      w.on = true; m.visible = true;
    }
    w.x += w.dx * 7 * dt; w.z += w.dz * 7 * dt;
    try {
      const q = S.track.query(w.x, w.z, w.idx, cy);
      if (q && isFinite(q.y)) { w.gy = q.y; w.idx = q.index; }
    } catch (e) { w.gy = cy - 3; }
    m.position.set(w.x, w.gy + 0.65 + Math.abs(Math.sin(t * 3.2 + w.x)) * 0.45, w.z);
    m.rotation.x += dt * 5 * w.dz; m.rotation.z -= dt * 5 * w.dx; m.rotation.y += dt;
    const ddx = w.x - cx, ddz = w.z - cz;
    if (ddx * ddx + ddz * ddz > 90 * 90) { w.on = false; m.visible = false; w.next = R(1, 4); }
  }

  Ambience.stop = function () {
    Ambience.active = false;
    if (!S) return;
    const s = S; S = null;
    try {
      for (const k in s.pools) s.pools[k].dispose(s.scene);
      if (s.drone) disposeDrone(s.drone, s.scene);
      if (s.tw) { s.scene.remove(s.tw.mesh); s.tw.mesh.geometry.dispose(); s.tw.mesh.material.dispose(); }
    } catch (e) { /* ignore */ }
  };
})();
