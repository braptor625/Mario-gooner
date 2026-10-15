// Battle mode: arenas (Track-interface), rules (balloon / shine / bomb) and battle AI.
// Classic script; attaches G.ARENAS, G.Arena, G.BattleMode, G.BattleAI. Three.js r128.
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  const TAU = Math.PI * 2;
  const W = 1000;          // "wall distance" constant of the lateral trick
  const KR = 1.3;          // kart radius folded into every wall / obstacle
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const wrapA = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

  G.ARENAS = [
    { id: 'cookie', name: 'Biscuit Bowl', music: 'battle' },
    { id: 'blocks', name: 'Toy Block Town', music: 'battle' },
    { id: 'pipes', name: 'Pipeworks Plaza', music: 'battle' },
    { id: 'tilt', name: 'Tilt Table', music: 'battle' },
  ];

  // ------------------------------------------------------------------ geometry helpers
  const col = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
  const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const mulberry = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const ICO = {};
  function icoPositions(detail) {
    if (!ICO[detail]) ICO[detail] = new THREE.IcosahedronGeometry(1, detail).attributes.position.array;
    return ICO[detail];
  }

  class Batch {
    constructor() { this.p = []; this.c = []; }
    tri(a, b, c, k) {
      this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      this.c.push(k[0], k[1], k[2], k[0], k[1], k[2], k[0], k[1], k[2]);
    }
    quad(a, b, c, d, k) { this.tri(a, b, c, k); this.tri(a, c, d, k); }
    box(cx, y0, cz, sx, sy, sz, ry, k) {
      const c = Math.cos(ry), s = Math.sin(ry), hx = sx / 2, hz = sz / 2, y1 = y0 + sy;
      const v = (lx, lz, y) => [cx + lx * c + lz * s, y, cz - lx * s + lz * c];
      const a0 = v(-hx, -hz, y0), b0 = v(hx, -hz, y0), c0 = v(hx, hz, y0), d0 = v(-hx, hz, y0);
      const a1 = v(-hx, -hz, y1), b1 = v(hx, -hz, y1), c1 = v(hx, hz, y1), d1 = v(-hx, hz, y1);
      this.quad(a1, b1, c1, d1, mul(k, 1.12));
      this.quad(a0, b0, b1, a1, k); this.quad(b0, c0, c1, b1, mul(k, 0.85));
      this.quad(c0, d0, d1, c1, mul(k, 0.92)); this.quad(d0, a0, a1, d1, mul(k, 0.8));
    }
    frustum(x, y0, z, r0, r1, h, sides, k, rot) {
      rot = rot || 0;
      const y1 = y0 + h, top = [x, y1, z];
      for (let i = 0; i < sides; i++) {
        const a0 = rot + (i / sides) * TAU, a1 = rot + ((i + 1) / sides) * TAU;
        const b0 = [x + Math.cos(a0) * r0, y0, z + Math.sin(a0) * r0];
        const b1 = [x + Math.cos(a1) * r0, y0, z + Math.sin(a1) * r0];
        const kk = mul(k, 0.85 + 0.15 * Math.cos(a0 * 1.0 + 0.7));
        if (r1 <= 0) this.tri(b0, b1, top, kk);
        else {
          const t0 = [x + Math.cos(a0) * r1, y1, z + Math.sin(a0) * r1];
          const t1 = [x + Math.cos(a1) * r1, y1, z + Math.sin(a1) * r1];
          this.quad(b0, b1, t1, t0, kk); this.tri(top, t0, t1, mul(k, 1.1));
        }
      }
    }
    blob(x, y, z, sx, sy, sz, k, detail) {
      const P = icoPositions(detail || 0);
      for (let i = 0; i < P.length; i += 9) {
        this.tri(
          [x + P[i] * sx, y + P[i + 1] * sy, z + P[i + 2] * sz],
          [x + P[i + 3] * sx, y + P[i + 4] * sy, z + P[i + 5] * sz],
          [x + P[i + 6] * sx, y + P[i + 7] * sy, z + P[i + 8] * sz], k);
      }
    }
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      g.computeVertexNormals();
      g.computeBoundingSphere();
      return g;
    }
    get empty() { return this.p.length === 0; }
  }

  // ------------------------------------------------------------------ arena configs
  // shape: 0 circle (R) | 1 box (hx,hz). loop: {kind:'circle', r} | {kind:'square', h}
  const CFG = {
    cookie: {
      shape: 0, R: 95, loop: { kind: 'circle', r: 62 }, seed: 5,
      sky: [0xffc9e0, 0xfff1dc, 0xf2c391], fog: [0xffe9d6, 220, 620], bg: 0xffe9d6,
      hemi: [0xfff4e6, 0xd9a070, 0.75], sun: [0xfff0d0, 0.55], spots: { sep: 24, max: 16, maxR: 85 },
    },
    blocks: {
      shape: 1, hx: 90, hz: 90, loop: { kind: 'square', h: 82 }, seed: 9,
      sky: [0x8fc2ff, 0xdbe8ff, 0xf3e4cc], fog: [0xdbe8ff, 240, 700], bg: 0xdbe8ff,
      hemi: [0xeef4ff, 0xa89878, 1.0], sun: [0xfff4e0, 0.85], spots: { sep: 24, max: 18, maxR: 84 },
    },
    pipes: {
      shape: 1, hx: 85, hz: 85, loop: { kind: 'circle', r: 68 }, seed: 13,
      sky: [0x1d2b66, 0x5b86bd, 0xf0b070], fog: [0xb9a38a, 200, 600], bg: 0xb9a38a,
      hemi: [0xbcd0f0, 0x8a7a6a, 0.95], sun: [0xffd9a0, 0.9], spots: { sep: 24, max: 16, maxR: 80 },
    },
    tilt: {
      shape: 0, R: 80, isVoid: true, loop: { kind: 'circle', r: 58 }, seed: 17,
      sky: [0x2458d0, 0x86c4f8, 0xeaf7ff], fog: [0xbfe0ff, 260, 900], bg: 0xbfe0ff,
      hemi: [0xdcecff, 0x7a9ac0, 1.05], sun: [0xffffff, 0.85], spots: { sep: 22, max: 12, maxR: 38 },
    },
  };

  // ------------------------------------------------------------------ Arena
  class Arena {
    constructor(id, scene, opts) {
      opts = opts || {};
      const cfg = CFG[id] || CFG.cookie;
      if (!CFG[id]) id = 'cookie';
      this.id = id;
      this.cfg = cfg;
      this.scene = scene;
      this.isArena = true;
      this.laps = 0;
      this.mirror = false;
      const adef = G.ARENAS.find((a) => a.id === id);
      this.def = { id, name: adef.name, laps: 0, music: 'battle' };
      this.name = adef.name;
      this.theme = 'battle';
      this.shape = cfg.shape;
      this.R = cfg.R || 0; this.hx = cfg.hx || 0; this.hz = cfg.hz || 0;
      this.isVoid = !!cfg.isVoid;
      this.rng = mulberry(cfg.seed + (opts.seed || 0));
      this.obs = [];
      this._geoms = []; this._mats = []; this._tex = [];
      this._time = 0;
      this.tiltX = 0; this.tiltZ = 0;
      this.hf = null; // height function (x,z) -> y
      this._nx = 1; this._nz = 0; this._d = 0;
      this._q = {
        index: 0, dist: 0, lateral: 0, halfWidth: W, wallDist: W, y: 0, onRoad: true, surface: 'road',
        tx: 0, tz: 1, rx: -1, rz: 0, edgeD: 100, ex: 1, ez: 0, dWall: 100,
      };
      this._p = { x: 0, y: 0, z: 0, tx: 0, tz: 1, rx: -1, rz: 0, halfWidth: W };
      this._noHaz = [];

      this.root = new THREE.Group();
      this.world = this.isVoid ? new THREE.Group() : this.root; // tilting part
      if (this.isVoid) this.root.add(this.world);
      scene.add(this.root);

      // lights / fog / sky
      scene.fog = new THREE.Fog(cfg.fog[0], cfg.fog[1], cfg.fog[2]);
      scene.background = new THREE.Color(cfg.bg);
      this.hemi = new THREE.HemisphereLight(cfg.hemi[0], cfg.hemi[1], cfg.hemi[2]);
      this.root.add(this.hemi);
      this.sun = new THREE.DirectionalLight(cfg.sun[0], cfg.sun[1]);
      this.sun.position.set(70, 120, 50);
      this.sun.target.position.set(0, 0, 0);
      this.sun.castShadow = false;
      this.root.add(this.sun); this.root.add(this.sun.target);

      this.hf = this._heightFn();
      this.b = new Batch();
      BUILD[id](this, this.b, this.rng);
      const mat = this._mat();
      const mesh = new THREE.Mesh(this._geo(this.b.build()), mat);
      mesh.frustumCulled = false;
      this.world.add(mesh);
      this._buildSky();

      this._buildLoop();
      this._buildSpots();
      this._buildMinimap();
      this.length = Math.max(10, Math.round(this._loopLen));
    }

    // -------- resources
    _geo(g) { this._geoms.push(g); return g; }
    _mat() {
      const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
      this._mats.push(m);
      return m;
    }
    _heightFn() {
      const self = this;
      if (this.id === 'pipes') {
        return (x, z) => {
          const r = Math.sqrt(x * x + z * z);
          const t = clamp((38 - r) / 12, 0, 1);
          return 2.4 * t * t * (3 - 2 * t);
        };
      }
      if (this.id === 'tilt') return (x, z) => x * self.tiltZ - z * self.tiltX;
      return () => 0;
    }

    // -------- obstacle registration (solid for physics; visuals are drawn by the builders)
    addCirc(x, z, r) { this.obs.push({ t: 0, x, z, a: r, b: 0, c: 1, s: 0 }); }
    addBox(x, z, hx, hz, ry) { this.obs.push({ t: 1, x, z, a: hx, b: hz, c: Math.cos(ry || 0), s: Math.sin(ry || 0) }); }

    // -------- signed distance to nearest wall/obstacle (kart radius folded in); sets _d,_nx,_nz
    _sdf(x, z, withOuter) {
      let best = 1e9, nx = 1, nz = 0;
      const q = this._q;
      let ed, enx, enz;
      if (this.shape === 0) {
        const l = Math.sqrt(x * x + z * z);
        ed = this.R - l;
        if (l > 1e-6) { enx = x / l; enz = z / l; } else { enx = 1; enz = 0; }
      } else {
        const ax = this.hx - Math.abs(x), az = this.hz - Math.abs(z);
        if (ax < az) { ed = ax; enx = x < 0 ? -1 : 1; enz = 0; } else { ed = az; enx = 0; enz = z < 0 ? -1 : 1; }
      }
      q.edgeD = ed; q.ex = enx; q.ez = enz;
      if (!this.isVoid) { best = ed - KR; nx = enx; nz = enz; }
      const obs = this.obs;
      for (let i = 0; i < obs.length; i++) {
        const o = obs[i];
        const dx = x - o.x, dz = z - o.z;
        if (o.t === 0) {
          const l = Math.sqrt(dx * dx + dz * dz);
          const d = l - o.a - KR;
          if (d < best) {
            best = d;
            if (l > 1e-6) { nx = -dx / l; nz = -dz / l; } else { nx = 1; nz = 0; }
          }
        } else {
          const lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c;
          const qx = Math.abs(lx) - o.a, qz = Math.abs(lz) - o.b;
          let d, gx, gz;
          if (qx > 0 || qz > 0) {
            const mx = qx > 0 ? qx : 0, mz = qz > 0 ? qz : 0;
            const l = Math.sqrt(mx * mx + mz * mz);
            d = l;
            if (d - KR >= best) continue;
            gx = (lx < 0 ? -mx : mx) / l; gz = (lz < 0 ? -mz : mz) / l;
          } else if (qx > qz) { d = qx; gx = lx < 0 ? -1 : 1; gz = 0; } else { d = qz; gx = 0; gz = lz < 0 ? -1 : 1; }
          d -= KR;
          if (d < best) {
            best = d;
            // gradient (pointing into free space) -> world, then negate (wall normal points toward the wall)
            nx = -(gx * o.c + gz * o.s); nz = -(-gx * o.s + gz * o.c);
          }
        }
      }
      this._d = best; this._nx = nx; this._nz = nz;
      return best;
    }

    // -------- Track interface
    query(x, z, hint, y) {
      const q = this._q;
      let d = this._sdf(x, z);
      if (d > 900) d = 900;
      q.dWall = d;
      q.lateral = W - d;
      q.rx = this._nx; q.rz = this._nz;
      let a = Math.atan2(x, z);
      if (a < 0) a += TAU;
      q.dist = (a / TAU) * this.length;
      q.index = q.dist | 0;
      let tx = q.rz, tz = -q.rx;
      if (tx * Math.cos(a) - tz * Math.sin(a) < 0) { tx = -tx; tz = -tz; }
      q.tx = tx; q.tz = tz;
      q.y = this.hf(x, z);
      q.surface = (this.isVoid && q.edgeD < 0) ? 'void' : 'road';
      return q;
    }

    _buildLoop() {
      const N = 96, L = this.cfg.loop;
      this.loopN = N;
      this.lx = new Float32Array(N); this.lz = new Float32Array(N); this.ly = new Float32Array(N);
      let len = 0;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU;
        const s = Math.sin(a), c = Math.cos(a);
        let px, pz;
        if (L.kind === 'circle') { px = s * L.r; pz = c * L.r; } else {
          const m = Math.max(Math.abs(s), Math.abs(c));
          px = (s / m) * L.h; pz = (c / m) * L.h;
        }
        // push out of anything solid, searching along the radial direction
        if (this._sdf(px, pz) < 3.5) {
          let found = false;
          const rl = Math.sqrt(px * px + pz * pz), ux = px / rl, uz = pz / rl;
          for (let k = 1; k < 60 && !found; k++) {
            for (let sg = -1; sg <= 1; sg += 2) {
              const rr = rl + sg * k * 1.5;
              if (rr < 4) continue;
              const tx = ux * rr, tz = uz * rr;
              if (this._sdf(tx, tz) >= 3.5) { px = tx; pz = tz; found = true; break; }
            }
          }
        }
        this.lx[i] = px; this.lz[i] = pz;
      }
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        len += Math.hypot(this.lx[j] - this.lx[i], this.lz[j] - this.lz[i]);
      }
      this._loopLen = len;
      for (let i = 0; i < N; i++) this.ly[i] = this.hf(this.lx[i], this.lz[i]);
    }

    _frame(dist, o) {
      const N = this.loopN;
      let f = ((dist % this.length) + this.length) % this.length;
      f = (f / this.length) * N;
      let i = Math.floor(f);
      const t = f - i;
      if (i >= N) i = 0;
      const j = i + 1 === N ? 0 : i + 1;
      o.x = this.lx[i] + (this.lx[j] - this.lx[i]) * t;
      o.z = this.lz[i] + (this.lz[j] - this.lz[i]) * t;
      o.y = this.hf(o.x, o.z);
      let tx = this.lx[j] - this.lx[i], tz = this.lz[j] - this.lz[i];
      const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      o.tx = tx; o.tz = tz; o.rx = -tz; o.rz = tx; o.halfWidth = W;
      return o;
    }
    pointAt(dist) { return this._frame(dist, this._p); }
    respawnPoint(dist) {
      const p = this._frame(dist, { x: 0, y: 0, z: 0, tx: 0, tz: 1, rx: -1, rz: 0, halfWidth: W });
      const l = Math.hypot(p.x, p.z);
      return { x: p.x, y: p.y, z: p.z, heading: l > 1 ? Math.atan2(-p.x, -p.z) : 0 };
    }
    getStartGrid(n) {
      n = n || 4;
      const out = [], tmp = { x: 0, y: 0, z: 0, tx: 0, tz: 1, rx: -1, rz: 0, halfWidth: W };
      for (let i = 0; i < n; i++) {
        this._frame(((i + 0.5) / n) * this.length, tmp);
        const l = Math.hypot(tmp.x, tmp.z);
        out.push({ x: tmp.x, y: tmp.y, z: tmp.z, heading: l > 1 ? Math.atan2(-tmp.x, -tmp.z) : 0 });
      }
      return out;
    }

    // free spot nearest to (x0,z0) with at least `minD` clearance
    safeSpot(x0, z0, minD, out) {
      out = out || { x: 0, z: 0, y: 0 };
      minD = minD || 4;
      for (let r = 0; r < 80; r += 2) {
        const n = r === 0 ? 1 : Math.ceil(r * 0.8);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * TAU + r;
          const x = x0 + Math.sin(a) * r, z = z0 + Math.cos(a) * r;
          if (this._sdf(x, z) >= minD && this._q.edgeD > minD) { out.x = x; out.z = z; out.y = this.hf(x, z); return out; }
        }
      }
      out.x = x0; out.z = z0; out.y = this.hf(x0, z0);
      return out;
    }

    _buildSpots() {
      const sp = this.cfg.spots, rng = mulberry(this.cfg.seed * 7 + 1);
      const cand = [];
      const step = 5;
      for (let x = -sp.maxR; x <= sp.maxR; x += step) {
        for (let z = -sp.maxR; z <= sp.maxR; z += step) {
          if (x * x + z * z > sp.maxR * sp.maxR) continue;
          if (this._sdf(x, z) < 6 || this._q.edgeD < 6) continue;
          cand.push([x, z]);
        }
      }
      for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = cand[i]; cand[i] = cand[j]; cand[j] = t; }
      const picked = [];
      for (let i = 0; i < cand.length && picked.length < sp.max; i++) {
        let ok = true;
        for (let k = 0; k < picked.length; k++) {
          if (Math.hypot(cand[i][0] - picked[k][0], cand[i][1] - picked[k][1]) < sp.sep) { ok = false; break; }
        }
        if (ok) picked.push(cand[i]);
      }
      this.itemBoxSpots = picked.map((p) => ({ x: p[0], y: this.hf(p[0], p[1]), z: p[1] }));
    }

    _buildMinimap() {
      const pts = [];
      let minX, maxX, minZ, maxZ;
      if (this.shape === 0) {
        for (let i = 0; i < 64; i++) { const a = (i / 64) * TAU; pts.push({ x: Math.sin(a) * this.R, z: Math.cos(a) * this.R }); }
        minX = minZ = -this.R; maxX = maxZ = this.R;
      } else {
        pts.push({ x: -this.hx, z: -this.hz }, { x: this.hx, z: -this.hz }, { x: this.hx, z: this.hz }, { x: -this.hx, z: this.hz });
        minX = -this.hx; maxX = this.hx; minZ = -this.hz; maxZ = this.hz;
      }
      this.minimap = { points: pts, bounds: { minX, maxX, minZ, maxZ } };
    }

    getHazards() { return this._noHaz; }

    update(dt, time) {
      this._time = time !== undefined ? time : this._time + dt;
      if (this.id === 'tilt') {
        const t = this._time;
        this.tiltX = 0.03 * Math.sin(t * 0.33);
        this.tiltZ = 0.03 * Math.sin(t * 0.21 + 1.3);
        this.world.rotation.x = this.tiltX;
        this.world.rotation.z = this.tiltZ;
      }
      if (this._deco) this._deco.rotation.y = this._time * (this.id === 'tilt' ? 0.004 : 0);
    }

    dispose() {
      if (this.root.parent) this.root.parent.remove(this.root);
      for (const g of this._geoms) g.dispose();
      for (const m of this._mats) m.dispose();
      if (this.hemi && this.hemi.dispose) this.hemi.dispose();
      if (this.scene) { this.scene.fog = null; this.scene.background = null; }
    }

    // -------- ground builder (polar grid for circles, square grid for boxes)
    ground(colorFn, step) {
      const b = this.b, hf = this.hf;
      if (this.shape === 0) {
        const R = this.R, nr = Math.ceil(R / step), ns = Math.ceil(Math.max(32, Math.round((TAU * R) / (step * 1.6))) / 16) * 16;
        this._ns = ns;
        for (let i = 0; i < nr; i++) {
          const r0 = (R * i) / nr, r1 = (R * (i + 1)) / nr;
          for (let j = 0; j < ns; j++) {
            const a0 = (j / ns) * TAU, a1 = ((j + 1) / ns) * TAU;
            const p = (r, a) => { const x = Math.sin(a) * r, z = Math.cos(a) * r; return [x, hf(x, z), z]; };
            const am = (a0 + a1) / 2, rm = (r0 + r1) / 2;
            b.quad(p(r0, a0), p(r1, a0), p(r1, a1), p(r0, a1), colorFn(Math.sin(am) * rm, Math.cos(am) * rm, i, j));
          }
        }
      } else {
        const nx = Math.ceil((this.hx * 2) / step), nz = Math.ceil((this.hz * 2) / step);
        for (let i = 0; i < nx; i++) {
          const x0 = -this.hx + (i * 2 * this.hx) / nx, x1 = -this.hx + ((i + 1) * 2 * this.hx) / nx;
          for (let j = 0; j < nz; j++) {
            const z0 = -this.hz + (j * 2 * this.hz) / nz, z1 = -this.hz + ((j + 1) * 2 * this.hz) / nz;
            b.quad([x0, hf(x0, z0), z0], [x0, hf(x0, z1), z1], [x1, hf(x1, z1), z1], [x1, hf(x1, z0), z0], colorFn((x0 + x1) / 2, (z0 + z1) / 2, i, j));
          }
        }
      }
    }

    _buildSky() {
      const cfg = this.cfg;
      const geo = this._geo(new THREE.SphereGeometry(300, 20, 14));
      const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
      const top = col(cfg.sky[0]), mid = col(cfg.sky[1]), bot = col(cfg.sky[2]);
      for (let i = 0; i < pos.count; i++) {
        const v = pos.getY(i) / 300;
        const c = v >= 0 ? mix(mid, top, Math.pow(v, 0.6)) : mix(mid, bot, Math.min(1, -v * 3));
        colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, depthTest: false });
      this._mats.push(mat);
      const sky = new THREE.Mesh(geo, mat);
      sky.renderOrder = -1000;
      this._follow(sky);
      this.root.add(sky);

      const b = new Batch(), rng = this.rng;
      DECO[this.id](b, rng);
      if (!b.empty) {
        const dm = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false, side: THREE.DoubleSide });
        this._mats.push(dm);
        const deco = new THREE.Mesh(this._geo(b.build()), dm);
        deco.renderOrder = -999;
        this._follow(deco);
        this.root.add(deco);
        this._deco = deco;
      }
    }
    _follow(obj) {
      obj.frustumCulled = false;
      obj.onBeforeRender = function (renderer, scene, camera) {
        obj.position.copy(camera.position);
        obj.updateMatrixWorld(true);
      };
    }
  }

  // ------------------------------------------------------------------ arena builders
  function pillar(b, x, z, r, h, color, capColor, y0) {
    y0 = y0 || 0;
    b.frustum(x, y0, z, r, r, h, 14, color);
    b.frustum(x, y0 + h - 1.2, z, r + 0.55, r + 0.55, 1.2, 14, capColor);
  }
  function ring(n, fn, off) { for (let i = 0; i < n; i++) fn((i / n) * TAU + (off || 0), i); }

  const BUILD = {
    cookie(A, b, rng) {
      const R = A.R;
      const base = col(0xe0a862), dark = col(0xb97a3c), icing = col(0xffb8cc);
      A.ground((x, z, i, j) => {
        const r = Math.sqrt(x * x + z * z);
        let c;
        if (r > R - 11 && r < R - 6.5) c = mul(icing, 0.95 + 0.1 * rng());
        else if (r >= R - 6.5) c = mul(dark, 0.9 + 0.2 * rng());
        else c = mul(mix(base, col(0xd39350), (Math.sin(x * 0.11) * Math.cos(z * 0.13) + 1) / 2), 0.93 + 0.14 * rng());
        return c;
      }, 4.5);
      b.frustum(0, -2.4, 0, R, R, 2.38, 56, dark);
      // rim bumps
      ring(52, (a) => b.blob(Math.sin(a) * (R + 1.2), 0.2, Math.cos(a) * (R + 1.2), 3.8, 2.6, 3.8, mul(dark, 1.1), 0));
      // plate + cloth
      b.frustum(0, -5.4, 0, R + 24, R + 24, 2.95, 56, col(0xf6f8ff));
      ring(40, (a) => b.blob(Math.sin(a) * (R + 23), -2.6, Math.cos(a) * (R + 23), 3.6, 1.1, 3.6, col(0x7fb2f0), 0));
      for (let i = -12; i < 12; i++) {
        for (let j = -12; j < 12; j++) {
          const c = ((i + j) & 1) ? col(0xe85a5a) : col(0xfff4f0);
          b.quad([i * 40, -5.5, j * 40], [i * 40, -5.5, j * 40 + 40], [i * 40 + 40, -5.5, j * 40 + 40], [i * 40 + 40, -5.5, j * 40], c);
        }
      }
      // choc chips (decor)
      for (let i = 0; i < 40; i++) {
        const a = rng() * TAU, r = Math.sqrt(rng()) * (R - 12);
        b.blob(Math.sin(a) * r, 0.1, Math.cos(a) * r, 1.4 + rng(), 0.35, 1.2 + rng(), col(0x4a2a1a), 0);
      }
      // gumdrops
      const gum = [0xff4a6a, 0x6adf6a, 0xffc83a, 0x5aa8ff, 0xc070ff, 0xff8a3a];
      ring(6, (a, i) => {
        const x = Math.sin(a + 0.26) * 52, z = Math.cos(a + 0.26) * 52, c = col(gum[i]);
        A.addCirc(x, z, 3.2);
        b.frustum(x, 0, z, 3.4, 2.6, 2.4, 10, c);
        b.blob(x, 2.2, z, 2.6, 1.7, 2.6, mul(c, 1.15), 1);
      });
      // giant chocolate chunk at the center
      A.addCirc(0, 0, 8);
      b.frustum(0, 0, 0, 8.4, 7.4, 5.5, 12, col(0x5b3220));
      b.frustum(0, 5.4, 0, 7.4, 6.2, 0.9, 12, col(0xfff0f6));
      b.blob(0, 6.2, 0, 3, 1.4, 3, col(0xff6a8a), 1);
      // lollipops
      ring(4, (a, i) => {
        const x = Math.sin(a + 0.8) * 30, z = Math.cos(a + 0.8) * 30;
        A.addCirc(x, z, 1.0);
        b.frustum(x, 0, z, 0.55, 0.55, 7, 8, col(0xf4f4f4));
        b.frustum(x, 7, z, 4.4, 4.4, 0.9, 16, col(i & 1 ? 0xff5a8a : 0x5ac8ff));
        b.frustum(x, 7.9, z, 3.0, 3.0, 0.3, 16, col(0xffffff));
        b.frustum(x, 8.1, z, 1.5, 1.5, 0.3, 16, col(i & 1 ? 0xff5a8a : 0x5ac8ff));
      });
      // sprinkles
      const sp = [0xff5a8a, 0x5ac8ff, 0xffd23a, 0x7adf6a, 0xffffff, 0xc070ff];
      let placed = 0, guard = 0;
      while (placed < 14 && guard++ < 200) {
        const a = rng() * TAU, r = 18 + rng() * 64;
        const x = Math.sin(a) * r, z = Math.cos(a) * r, ry = rng() * Math.PI;
        let ok = true;
        for (const o of A.obs) if (Math.hypot(o.x - x, o.z - z) < (o.a || 1) + 9) { ok = false; break; }
        if (!ok) continue;
        A.addBox(x, z, 4, 0.8, ry);
        b.box(x, 0, z, 8, 1.5, 1.6, ry, col(sp[placed % sp.length]));
        placed++;
      }
    },

    blocks(A, b, rng) {
      const H = 90;
      const street = col(0x727886);
      A.ground((x, z, i, j) => {
        const k = ((i + j) & 1) ? 1 : 0.94;
        return mul(street, k * (0.96 + 0.08 * rng()));
      }, 5);
      // dashed lane markings on the 4 streets + outer ring
      const dash = col(0xf6d65a);
      for (const c of [-30, 30]) {
        for (let t = -80; t < 80; t += 8) {
          b.box(c, 0.04, t, 0.5, 0.04, 3.4, 0, dash);
          b.box(t, 0.04, c, 3.4, 0.04, 0.5, 0, dash);
        }
      }
      // perimeter fence of toy bricks
      const fc = [0xe8453c, 0x3c8de8, 0xf2c230, 0x4cc26a];
      for (let i = 0; i < 12; i++) {
        const t = -H + 7.5 + i * 15, c = col(fc[i % 4]);
        b.box(t, 0, -H - 2, 15, 5, 4, 0, c); b.box(t, 0, H + 2, 15, 5, 4, 0, col(fc[(i + 1) % 4]));
        b.box(-H - 2, 0, t, 4, 5, 15, 0, col(fc[(i + 2) % 4])); b.box(H + 2, 0, t, 4, 5, 15, 0, col(fc[(i + 3) % 4]));
        for (let s = -1; s <= 1; s += 2) {
          b.frustum(t + s * 3.5, 5, -H - 2, 1.5, 1.4, 1.2, 8, c); b.frustum(t + s * 3.5, 5, H + 2, 1.5, 1.4, 1.2, 8, c);
          b.frustum(-H - 2, 5, t + s * 3.5, 1.5, 1.4, 1.2, 8, c); b.frustum(H + 2, 5, t + s * 3.5, 1.5, 1.4, 1.2, 8, c);
        }
      }
      const pal = [0xe8453c, 0x3c8de8, 0xf2c230, 0x4cc26a, 0xb060e8, 0xff8a30];
      for (let bi = -1; bi <= 1; bi++) {
        for (let bj = -1; bj <= 1; bj++) {
          const x = bi * 60, z = bj * 60, k = (bi + 1) * 3 + bj + 1;
          if (bi === 0 && bj === 0) {
            A.addBox(0, 0, 14, 14, 0);
            b.box(0, 0, 0, 28, 12, 28, 0, col(0xe8453c));
            b.box(0, 12, 0, 20, 10, 20, 0.2, col(0x3c8de8));
            b.box(0, 22, 0, 12, 8, 12, 0.5, col(0xf2c230));
            b.frustum(0, 30, 0, 7, 0, 7, 4, col(0x4cc26a), 0.8);
          } else if (Math.abs(bi) === 1 && Math.abs(bj) === 1) {
            A.addCirc(x, z, 15);
            const bands = [0xe8453c, 0xffffff, 0x3c8de8];
            for (let s = 0; s < 3; s++) b.frustum(x, s * 3.4, z, 15, 15, 3.4, 18, col(bands[s]));
            b.frustum(x, 10.2, z, 15, 6, 2, 18, col(0xf2c230));
            b.frustum(x, 12.2, z, 6, 6, 1.4, 12, col(0xe8453c));
          } else {
            const h = 8 + (k % 3) * 2.5, c = col(pal[k % pal.length]);
            A.addBox(x, z, 14, 14, 0);
            b.box(x, 0, z, 28, h, 28, 0, c);
            for (let sx = -1; sx <= 1; sx += 2) for (let sz = -1; sz <= 1; sz += 2) b.frustum(x + sx * 7, h, z + sz * 7, 2.6, 2.4, 1.6, 10, mul(c, 1.1));
            b.box(x, h, z, 8, 5, 8, rng() * 1.5, col(pal[(k + 3) % pal.length]));
          }
        }
      }
    },

    pipes(A, b, rng) {
      const tile = [col(0x9ea5ad), col(0x8e959d)];
      A.ground((x, z, i, j) => {
        const r = Math.sqrt(x * x + z * z);
        if (r < 26) return mul(col(0x9fc0d6), 0.95 + 0.08 * rng());
        if (r < 39) {
          const a = Math.atan2(x, z) + Math.PI;
          return ((Math.floor((a / TAU) * 24) & 1) ? col(0xf2c230) : col(0x2a2d33));
        }
        return mul(tile[(i + j) & 1], 0.96 + 0.08 * rng());
      }, 2.5);
      // low concrete walls
      const hx = A.hx, wc = col(0xb9bec4), st = col(0xf2c230);
      for (let t = -hx; t < hx; t += 10) {
        const c = ((t / 10) & 1) ? wc : st;
        b.box(t + 5, 0, -hx - 1.5, 10, 3.4, 3, 0, c); b.box(t + 5, 0, hx + 1.5, 10, 3.4, 3, 0, c);
        b.box(-hx - 1.5, 0, t + 5, 3, 3.4, 10, 0, c); b.box(hx + 1.5, 0, t + 5, 3, 3.4, 10, 0, c);
      }
      // ring of green pipes
      ring(8, (a) => {
        const x = Math.sin(a + 0.39) * 55, z = Math.cos(a + 0.39) * 55;
        A.addCirc(x, z, 2.6);
        pillar(b, x, z, 2.6, 9, col(0x3dbb5a), col(0x2a8f43));
      });
      // big corner pipes
      for (let sx = -1; sx <= 1; sx += 2) for (let sz = -1; sz <= 1; sz += 2) {
        const x = sx * 62, z = sz * 62;
        A.addCirc(x, z, 5);
        pillar(b, x, z, 5, 12, col(0xd9503a), col(0xa83a28));
      }
      // central pipe on the raised platform
      A.addCirc(0, 0, 4);
      pillar(b, 0, 0, 4, 8, col(0xf2c230), col(0xc79a10), 2.4);
      // lying pipes
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * (TAU), x = Math.sin(a) * 42, z = Math.cos(a) * 42, ry = a + Math.PI / 2;
        A.addBox(x, z, 8, 1.8, ry);
        b.box(x, 0, z, 16, 3.4, 3.6, ry, col(0x6f8fb5));
        b.box(x, 0, z, 17, 3.0, 4.2, ry, col(0x58779c));
      }
    },

    tilt(A, b, rng) {
      const R = A.R;
      A.ground((x, z, i, j) => {
        const r = Math.sqrt(x * x + z * z);
        if (i < 1) return col(0xffd24a);
        const ri = i >> 1, s = Math.floor((j * 16) / A._ns);
        const c = ((ri + s) & 1) ? col(0x5ec8f0) : col(0xf4fbff);
        return mul(c, 0.96 + 0.06 * rng());
      }, 5);
      // underside
      b.frustum(0, -2.2, 0, R, R, 2.18, 48, col(0x3c4a66));
      b.frustum(0, -16, 0, 26, R, 13.8, 24, col(0x56688c));
      b.frustum(0, -22, 0, 0, 26, 6, 24, col(0x34405c));
      // edge markers
      ring(60, (a, i) => b.box(Math.sin(a) * (R - 0.8), 0, Math.cos(a) * (R - 0.8), 2.2, 0.35, 0.7, a, i & 1 ? col(0xe8453c) : col(0xffffff)));
      // bumpers
      ring(6, (a) => {
        const x = Math.sin(a + 0.52) * 44, z = Math.cos(a + 0.52) * 44;
        A.addCirc(x, z, 1.8);
        b.frustum(x, 0, z, 1.8, 1.8, 2.4, 12, col(0xff5a8a));
        b.frustum(x, 2.4, z, 2.3, 2.3, 0.8, 12, col(0xffffff));
      });
      A.addCirc(0, 0, 4.2);
      b.frustum(0, 0, 0, 4.2, 3.6, 3, 14, col(0x3c8de8));
      b.frustum(0, 3, 0, 3.6, 3.6, 0.7, 14, col(0xf2c230));
    },
  };

  const DECO = {
    cookie(b, rng) {
      ring(14, (a, i) => {
        const x = Math.cos(a) * 285, z = Math.sin(a) * 285, c = [col(0xffa8c8), col(0xa8e0ff), col(0xfff0a0), col(0xc8f0b0)][i % 4];
        b.frustum(x, -10, z, 34, 26, 36, 8, c);
        b.blob(x, 30, z, 34, 22, 34, mul(c, 1.12), 1);
        b.blob(x, 52, z, 5, 5, 5, col(0xe83a4a), 0);
      });
      ring(14, (a) => b.blob(Math.cos(a) * 240, 90 + rng() * 40, Math.sin(a) * 240, 40, 8, 22, col(0xffffff), 0), 0.2);
    },
    blocks(b, rng) {
      ring(16, (a, i) => {
        const x = Math.cos(a) * 285, z = Math.sin(a) * 285, c = col([0xe8453c, 0x3c8de8, 0xf2c230, 0x4cc26a][i % 4]);
        const s = 40 + rng() * 40;
        b.box(x, -10, z, s, s * (0.8 + rng()), s, rng(), c);
      });
      ring(10, (a) => b.blob(Math.cos(a) * 230, 100 + rng() * 40, Math.sin(a) * 230, 30, 8, 18, col(0xffffff), 0), 0.3);
    },
    pipes(b, rng) {
      ring(40, (a) => {
        const h = 30 + rng() * 80, w = 20 + rng() * 25;
        b.box(Math.cos(a) * 290, -10, Math.sin(a) * 290, w, h, w, rng(), mix(col(0x1a2038), col(0x3a4468), rng()));
      });
      b.blob(Math.cos(2.4) * 250, 80, Math.sin(2.4) * 250, 22, 22, 22, col(0xffe4b0), 1);
    },
    tilt(b, rng) {
      // clouds above and below the platform
      for (let i = 0; i < 60; i++) {
        const a = rng() * TAU, r = 120 + rng() * 150, y = -70 + rng() * 150;
        const s = 14 + rng() * 22;
        b.blob(Math.cos(a) * r, y, Math.sin(a) * r, s * 1.6, s * 0.5, s, col(y < 0 ? 0xffffff : 0xf0f8ff), 0);
      }
      ring(5, (a, i) => {
        const x = Math.cos(a) * 230, z = Math.sin(a) * 230, y = -30 + rng() * 60;
        b.frustum(x, y - 12, z, 5, 24, 12, 8, col(0x8a6a4a));
        b.frustum(x, y, z, 24, 24, 3, 12, col(0x6fcf5a));
      }, 0.5);
    },
  };

  G.Arena = Arena;

  // ------------------------------------------------------------------ battle rules
  const MAX_BALLOONS = 3;
  const SHINE_TIME = 55;
  const PALETTE = [0xff4a4a, 0x4a9cff, 0xffd23a, 0x4ee06a, 0xc46cff, 0xff8a30, 0x3ae0e0, 0xff78c8];
  const TIME_LIMIT = { balloon: 180, bomb: 180, shine: 300 };

  let sharedBalloon = null;
  function getBalloonRes() {
    if (sharedBalloon) return sharedBalloon;
    const geo = new THREE.IcosahedronGeometry(0.42, 1);
    geo.scale(1, 1.2, 1);
    const stringGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.8, 4);
    stringGeo.translate(0, -0.9, 0);
    const stringMat = new THREE.MeshBasicMaterial({ color: 0xdddddd });
    // shine star
    const sh = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + Math.PI / 2, r = i & 1 ? 0.55 : 1.25;
      if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    sh.closePath();
    const starGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.45, bevelEnabled: false });
    starGeo.translate(0, 0, -0.22);
    const beamGeo = new THREE.CylinderGeometry(0.7, 0.7, 70, 10, 1, true);
    beamGeo.translate(0, 35, 0);
    sharedBalloon = {
      geo, stringGeo, stringMat, starGeo, beamGeo,
      starMat: new THREE.MeshLambertMaterial({ color: 0xffd23a, emissive: 0xffa800 }),
      glowMat: new THREE.MeshBasicMaterial({ color: 0xffe680, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      beamMat: new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      ptMat: new THREE.PointsMaterial({ size: 0.7, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    };
    return sharedBalloon;
  }

  const POP_N = 96;
  const BOFF_SIDE = [-0.55, 0.55, 0];
  const BOFF_UP = [2.25, 2.25, 2.8];

  class BattleMode {
    constructor(game, opts) {
      opts = opts || {};
      this.game = game || null;
      this.type = opts.type || 'balloon';
      this.arena = opts.arena;
      this.karts = opts.karts || (game && game.karts) || [];
      this.scene = (this.arena && this.arena.scene) || (game && game.scene);
      this.time = 0;
      this.timeLimit = opts.timeLimit || TIME_LIMIT[this.type] || 180;
      this.timeLeft = this.timeLimit;
      this.over = false;
      this.ending = false;
      this.endTimer = 0;
      this.winner = null;
      this.maxBalloons = MAX_BALLOONS;
      this.humans = 0;
      this._elim = 0;
      for (const k of this.karts) if (k.isPlayer) this.humans++;
      this.target = opts.target || (this.humans <= 2 ? 3 : 4);
      this._pendingHits = [];
      this._res = getBalloonRes();
      this._disposables = [];

      // shine
      this.shine = { state: 'wait', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mesh: null };
      this.holder = null;
      this.shineFree = false;
      this._shineSpot = { x: 0, y: 0, z: 0 };

      const n = this.karts.length;
      for (let i = 0; i < n; i++) {
        const k = this.karts[i];
        const color = PALETTE[i % PALETTE.length];
        let nm = '';
        try {
          const cid = (k.entrant && k.entrant.front) || k.front;
          const ch = G.CHARACTERS && G.CHARACTERS.find((c) => c.id === cid);
          nm = ch ? ch.name : '';
        } catch (e) { /* ignore */ }
        k._bt = {
          i, color, name: nm || ('Kart ' + (i + 1)), balloons: MAX_BALLOONS, out: false, outOrder: 0, score: 0,
          shineTime: SHINE_TIME, held: 0, popCd: 0, prevStun: false, prevFall: false, grabCd: 0, lastAttacker: null,
          pending: false, pendAtt: null, ghost: false, stealCd: 0, lastPopT: 0,
          hud: { type: this.type, balloons: 0, maxBalloons: MAX_BALLOONS, shineTime: SHINE_TIME, hasShine: false, score: 0, target: this.target, timeLeft: 0, out: false },
          bx: new Float32Array(3), by: new Float32Array(3), bz: new Float32Array(3), meshes: null,
        };
        k.btOut = false;
        k._btMul = k._btMul || 1;
        if (this.type === 'balloon') this._makeBalloons(k);
      }
      let hn = 0;
      for (const k of this.karts) if (k.isPlayer && this.humans > 1) k._bt.name += ' P' + (++hn);

      if (this.type === 'shine') this._makeShine();
      this._makePopFx();

      this._onHit = (e) => {
        if (!e || !e.victim || !e.victim._bt) return;
        const t = e.victim._bt;
        t.pending = true; t.pendAtt = e.attacker || null;
      };
      G.events.on('itemHit', this._onHit);
    }

    // -------- visuals
    _makeBalloons(k) {
      const R = this._res, t = k._bt;
      const mat = new THREE.MeshLambertMaterial({ color: t.color, emissive: new THREE.Color(t.color).multiplyScalar(0.25) });
      t.mat = mat; this._disposables.push(mat);
      t.meshes = [];
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(R.geo, mat);
        const s = new THREE.Mesh(R.stringGeo, R.stringMat);
        m.add(s);
        m.frustumCulled = false;
        this.scene.add(m);
        t.meshes.push(m);
        t.bx[i] = k.pos.x; t.by[i] = k.pos.y + 2; t.bz[i] = k.pos.z;
      }
    }
    _makeShine() {
      const R = this._res, sh = this.shine;
      const g = new THREE.Group();
      const star = new THREE.Mesh(R.starGeo, R.starMat);
      const glow = new THREE.Mesh(R.starGeo, R.glowMat);
      glow.scale.set(1.3, 1.3, 1.6);
      const beam = new THREE.Mesh(R.beamGeo, R.beamMat);
      g.add(star, glow);
      g.visible = false;
      beam.visible = false;
      this.scene.add(g); this.scene.add(beam);
      sh.mesh = g; sh.beam = beam; sh.star = star;
      star.frustumCulled = false; glow.frustumCulled = false; beam.frustumCulled = false;
    }
    _makePopFx() {
      const R = this._res;
      this._pp = new Float32Array(POP_N * 3); this._pc = new Float32Array(POP_N * 3);
      this._pv = new Float32Array(POP_N * 3); this._pl = new Float32Array(POP_N); this._pb = new Float32Array(POP_N * 3);
      for (let i = 0; i < POP_N; i++) this._pp[i * 3 + 1] = -1000;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this._pp, 3));
      g.setAttribute('color', new THREE.BufferAttribute(this._pc, 3));
      this._pg = g;
      this._points = new THREE.Points(g, R.ptMat);
      this._points.frustumCulled = false;
      this.scene.add(this._points);
      this._pcur = 0;
    }
    _burst(x, y, z, color, n) {
      const c = new THREE.Color(color);
      for (let q = 0; q < n; q++) {
        const i = this._pcur; this._pcur = (i + 1) % POP_N;
        const k = i * 3, a = Math.random() * TAU, u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u), sp = 4 + Math.random() * 6;
        this._pp[k] = x; this._pp[k + 1] = y; this._pp[k + 2] = z;
        this._pv[k] = Math.cos(a) * s * sp; this._pv[k + 1] = u * sp + 3; this._pv[k + 2] = Math.sin(a) * s * sp;
        this._pb[k] = c.r; this._pb[k + 1] = c.g; this._pb[k + 2] = c.b;
        this._pc[k] = c.r; this._pc[k + 1] = c.g; this._pc[k + 2] = c.b;
        this._pl[i] = 0.7;
      }
    }
    _stepFx(dt) {
      let any = false;
      for (let i = 0; i < POP_N; i++) {
        if (this._pl[i] <= 0) continue;
        const k = i * 3;
        this._pl[i] -= dt;
        if (this._pl[i] <= 0) { this._pp[k + 1] = -1000; this._pc[k] = this._pc[k + 1] = this._pc[k + 2] = 0; continue; }
        any = true;
        this._pv[k + 1] -= 16 * dt;
        this._pp[k] += this._pv[k] * dt; this._pp[k + 1] += this._pv[k + 1] * dt; this._pp[k + 2] += this._pv[k + 2] * dt;
        const f = this._pl[i] / 0.7;
        this._pc[k] = this._pb[k] * f; this._pc[k + 1] = this._pb[k + 1] * f; this._pc[k + 2] = this._pb[k + 2] * f;
      }
      if (any || this._fxDirty) { this._pg.attributes.position.needsUpdate = true; this._pg.attributes.color.needsUpdate = true; }
      this._fxDirty = any;
    }

    _snd(name) { try { if (G.Sound && G.Sound.play) G.Sound.play(name); } catch (e) { /* ignore */ } }

    // -------- rule helpers
    aliveCount() {
      let n = 0;
      for (const k of this.karts) if (!k._bt.out) n++;
      return n;
    }
    _ghostify(k) {
      const t = k._bt;
      t.ghost = true;
      try {
        k.model.group.traverse((o) => {
          if (!o.isMesh || !o.material) return;
          const clone = (m) => { const c = m.clone(); c.transparent = true; c.opacity = 0.32; c.depthWrite = false; return c; };
          o.material = Array.isArray(o.material) ? o.material.map(clone) : clone(o.material);
        });
      } catch (e) { /* ignore */ }
    }
    _knockOut(k, attacker) {
      const t = k._bt;
      if (t.out) return;
      t.out = true; t.outOrder = ++this._elim; t.outTime = this.time;
      k.btOut = true;
      this._ghostify(k);
      G.events.emit('battleOut', { kart: k, attacker: attacker || null });
    }
    _pop(k, attacker, steal) {
      const t = k._bt;
      if (t.out || t.balloons <= 0) return;
      t.balloons--;
      t.popCd = 0.6; t.lastPopT = this.time;
      const i = t.balloons; // index of the popped balloon (visuals hide >= balloons)
      if (t.meshes) this._burst(t.bx[i], t.by[i], t.bz[i], t.color, 14);
      else this._burst(k.pos.x, k.pos.y + 2.2, k.pos.z, t.color, 10);
      this._snd('balloon_pop');
      G.events.emit('balloonPop', { kart: k, attacker: attacker || null, left: t.balloons });
      if (steal && attacker && attacker._bt && !attacker._bt.out && attacker._bt.balloons < MAX_BALLOONS) {
        attacker._bt.balloons++;
      }
      if (t.balloons <= 0) this._knockOut(k, attacker);
    }
    _registerHit(k, attacker, kind) {
      const t = k._bt;
      if (t.out || t.popCd > 0) return;
      t.popCd = 0.5;
      if (this.type === 'balloon') this._pop(k, attacker, false);
      else if (this.type === 'shine') { if (this.holder === k) this._dropShine(k); }
      else if (this.type === 'bomb') {
        if (attacker && attacker !== k && attacker._bt && !attacker._bt.out) {
          attacker._bt.score++;
          this._snd('coin_bonus');
          G.events.emit('battleScore', { kart: attacker, victim: k, score: attacker._bt.score });
        }
      }
    }
    _nearestStar(k) {
      let best = null, bd = 25;
      for (const o of this.karts) {
        if (o === k || o._bt.out) continue;
        if (!(o.starTimer > 0 || o.boostTimer > 0)) continue;
        const d = (o.pos.x - k.pos.x) * (o.pos.x - k.pos.x) + (o.pos.z - k.pos.z) * (o.pos.z - k.pos.z);
        if (d < bd) { bd = d; best = o; }
      }
      return best;
    }

    // -------- shine
    _shineSpawn() {
      const sh = this.shine;
      this.arena.safeSpot(0, 0, 5, this._shineSpot);
      sh.x = this._shineSpot.x; sh.z = this._shineSpot.z; sh.y = this._shineSpot.y + 0.2;
      sh.state = 'free'; sh.vx = sh.vz = sh.vy = 0;
      sh.mesh.visible = true; sh.beam.visible = true;
      this.shineFree = true;
      this._snd('item_box');
    }
    _grabShine(k) {
      const sh = this.shine;
      this.holder = k; k._bt.held++;
      sh.state = 'held'; this.shineFree = false;
      this._snd('item_get');
      G.events.emit('shineGrab', { kart: k });
    }
    _dropShine(k) {
      const sh = this.shine;
      if (this.holder !== k) return;
      this.holder = null;
      sh.state = 'drop'; this.shineFree = false;
      sh.x = k.pos.x; sh.z = k.pos.z; sh.y = k.pos.y + 2;
      const a = Math.random() * TAU, s = rnd(5, 9);
      sh.vx = Math.cos(a) * s; sh.vz = Math.sin(a) * s; sh.vy = 13;
      k._bt.grabCd = 1.6;
      this._snd('drop');
      G.events.emit('shineDrop', { kart: k });
    }
    _stepShine(dt) {
      const sh = this.shine, A = this.arena;
      if (sh.state === 'wait') {
        if (this.time >= 3) this._shineSpawn();
        return;
      }
      const m = sh.mesh;
      if (sh.state === 'held') {
        const k = this.holder;
        if (k._bt.out || k.falling) { this._dropShine(k); return; }
        sh.x = k.pos.x; sh.z = k.pos.z; sh.y = k.pos.y + 3.1 + Math.sin(this.time * 4) * 0.15;
        k._bt.shineTime -= dt;
        if (k._bt.shineTime <= 0) { k._bt.shineTime = 0; this._finish(k); }
      } else if (sh.state === 'drop') {
        sh.vy -= 28 * dt;
        sh.x += sh.vx * dt; sh.z += sh.vz * dt; sh.y += sh.vy * dt;
        const q = A.query(sh.x, sh.z, -1);
        if (q.dWall < 1.5) {
          sh.x -= q.rx * (1.5 - q.dWall); sh.z -= q.rz * (1.5 - q.dWall);
          const vn = sh.vx * q.rx + sh.vz * q.rz;
          if (vn > 0) { sh.vx -= 2 * vn * q.rx; sh.vz -= 2 * vn * q.rz; }
        }
        if (q.surface === 'void' && sh.y < q.y - 6) { this._shineSpawn(); return; }
        if (q.surface !== 'void' && sh.y <= q.y + 0.3 && sh.vy < 0) {
          sh.y = q.y + 0.3; sh.vy = 0; sh.vx = sh.vz = 0; sh.state = 'free'; this.shineFree = true;
        }
      } else if (sh.state === 'free') {
        const q = A.query(sh.x, sh.z, -1);
        sh.y = q.y + 0.3 + Math.sin(this.time * 3) * 0.12;
        if (q.surface === 'void') { this._shineSpawn(); return; }
        let best = null, bd = 2.6 * 2.6;
        for (const k of this.karts) {
          const t = k._bt;
          if (t.out || k.falling || t.grabCd > 0) continue;
          const dx = k.pos.x - sh.x, dz = k.pos.z - sh.z;
          const d = dx * dx + dz * dz;
          if (d < bd && Math.abs(k.pos.y - q.y) < 3) { bd = d; best = k; }
        }
        if (best) this._grabShine(best);
      }
      m.position.set(sh.x, sh.y, sh.z);
      m.rotation.y = this.time * 2.4;
      const s = sh.state === 'held' ? 0.55 : 1;
      m.scale.set(s, s, s);
      sh.beam.position.set(sh.x, sh.y - 1, sh.z);
      sh.beam.visible = sh.state !== 'held';
    }

    // -------- end of match
    _finish(winner) {
      if (this.ending) return;
      this.ending = true; this.endTimer = 2.2;
      this.winner = winner || null;
      G.events.emit('battleEnd', { winner: this.winner, type: this.type });
    }
    _rankKey(k) {
      const t = k._bt;
      if (this.type === 'balloon') return (t.out ? t.outOrder : 1000 + t.balloons * 100 + (this.time - t.lastPopT) * 0.01);
      if (this.type === 'shine') return (SHINE_TIME - t.shineTime) * 10 + (this.holder === k ? 1 : 0);
      return t.score * 100 - (t.lastPopT || 0) * 0.001;
    }
    _leader() {
      let best = null, bk = -1e9;
      for (const k of this.karts) { const v = this._rankKey(k); if (v > bk) { bk = v; best = k; } }
      return best;
    }

    // -------- main step (fixed dt), call AFTER kart.update / collisions / items.update
    step(dt) {
      this.time += dt;
      this.timeLeft = Math.max(0, this.timeLimit - this.time);
      const karts = this.karts, n = karts.length;

      // 1. detect hits
      for (let i = 0; i < n; i++) {
        const k = karts[i], t = k._bt;
        if (t.popCd > 0) t.popCd -= dt;
        if (t.grabCd > 0) t.grabCd -= dt;
        if (t.stealCd > 0) t.stealCd -= dt;
        if (t.out) { this._keepGhost(k); continue; }
        const stun = k.spinTimer > 0 || k.squishTimer > 0;
        let hit = t.pending;
        let att = t.pendAtt;
        if (stun && !t.prevStun) { hit = true; if (!att) att = this._nearestStar(k); }
        t.prevStun = stun;
        t.pending = false; t.pendAtt = null;
        if (hit) this._registerHit(k, att, k.hitKind);
        if (k.falling && !t.prevFall && !t.out) {
          if (this.type === 'balloon') this._pop(k, null, false);
          else if (this.type === 'shine' && this.holder === k) this._dropShine(k);
        }
        t.prevFall = k.falling;
      }

      // 2. ram-steal: boosting / star kart bumps another kart
      if (!this.ending) {
        for (let i = 0; i < n; i++) {
          const a = karts[i], ta = a._bt;
          if (ta.out || ta.stealCd > 0 || !(a.boostTimer > 0 || a.starTimer > 0) || a.speed < 12) continue;
          for (let j = 0; j < n; j++) {
            if (i === j) continue;
            const b = karts[j], tb = b._bt;
            if (tb.out || b.falling || b.starTimer > 0) continue;
            const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
            if (dx * dx + dz * dz > 2.7 * 2.7) continue;
            if (a.boostTimer <= 0 && a.starTimer <= 0) continue;
            if (b.boostTimer > 0 && b.speed >= a.speed) continue;
            ta.stealCd = 1.0;
            if (this.type === 'balloon' && tb.popCd <= 0) { tb.popCd = 0.6; this._pop(b, a, true); }
            else if (this.type === 'shine' && this.holder === b) {
              this.holder = a; ta.held++; this.shine.state = 'held'; this._snd('item_get');
              G.events.emit('shineGrab', { kart: a });
            }
            break;
          }
        }
      }

      // 3. mode specific
      if (this.type === 'shine') {
        this._stepShine(dt);
        for (let i = 0; i < n; i++) karts[i].speedMul = (this.holder === karts[i] ? 0.93 : 1) * (karts[i]._btMul || 1);
      } else {
        for (let i = 0; i < n; i++) karts[i].speedMul = karts[i]._btMul || 1;
      }
      if (this.type === 'balloon') this._stepBalloons(dt);
      this._stepFx(dt);

      // 4. win conditions
      if (!this.ending) {
        if (this.type === 'balloon') {
          if (n > 1 && this.aliveCount() <= 1) {
            let w = null; for (const k of karts) if (!k._bt.out) w = k;
            this._finish(w || this._leader());
          } else if (this.timeLeft <= 0) this._finish(this._leader());
        } else if (this.type === 'bomb') {
          for (const k of karts) if (k._bt.score >= this.target) { this._finish(k); break; }
          if (!this.ending && this.timeLeft <= 0) this._finish(this._leader());
        } else if (this.type === 'shine') {
          if (this.timeLeft <= 0) this._finish(this._leader());
        }
      } else {
        this.endTimer -= dt;
        if (this.endTimer <= 0) this.over = true;
      }
    }

    _keepGhost(k) {
      k.invulnTimer = 1e9;
      k.heldItems[0] = null; k.heldItems[1] = null;
      k.itemCounts[0] = 0; k.itemCounts[1] = 0;
      k.roulette[0] = 0; k.roulette[1] = 0;
      k.starTimer = 0;
    }

    _stepBalloons(dt) {
      const karts = this.karts, tm = this.time;
      const f = Math.min(1, dt * 9);
      for (let q = 0; q < karts.length; q++) {
        const k = karts[q], t = k._bt;
        if (!t.meshes) continue;
        const sh = Math.sin(k.heading), ch = Math.cos(k.heading);
        for (let i = 0; i < 3; i++) {
          const m = t.meshes[i];
          if (t.out || i >= t.balloons) { if (m.visible) m.visible = false; continue; }
          m.visible = true;
          const back = 0.6, side = BOFF_SIDE[i];
          const tx = k.pos.x - sh * back - ch * side + Math.sin(tm * 2.1 + i * 2) * 0.15;
          const ty = k.pos.y + BOFF_UP[i] + Math.sin(tm * 3 + i + t.i) * 0.12 + (k.shrinkTimer > 0 ? -0.8 : 0);
          const tz = k.pos.z - ch * back + sh * side + Math.cos(tm * 2.3 + i * 2) * 0.15;
          t.bx[i] += (tx - t.bx[i]) * f; t.by[i] += (ty - t.by[i]) * f; t.bz[i] += (tz - t.bz[i]) * f;
          m.position.set(t.bx[i], t.by[i], t.bz[i]);
          m.rotation.z = (tx - t.bx[i]) * 0.4;
        }
      }
    }

    // -------- UI feed
    hudState(kart) {
      const t = kart._bt;
      const h = t.hud;
      h.type = this.type;
      h.balloons = t.balloons;
      h.maxBalloons = MAX_BALLOONS;
      h.shineTime = Math.ceil(t.shineTime);
      h.hasShine = this.holder === kart;
      h.score = t.score;
      h.target = this.target;
      h.timeLeft = Math.ceil(this.timeLeft);
      h.out = t.out;
      return h;
    }

    isOver() { return this.over; }

    results() {
      const rows = this.karts.slice();
      rows.sort((a, b) => this._rankKey(b) - this._rankKey(a));
      if (this.winner) { const i = rows.indexOf(this.winner); if (i > 0) { rows.splice(i, 1); rows.unshift(this.winner); } }
      return rows.map((k, i) => {
        const t = k._bt;
        let stat;
        if (this.type === 'balloon') stat = t.out ? 'Out' : t.balloons + (t.balloons === 1 ? ' balloon' : ' balloons');
        else if (this.type === 'shine') stat = Math.ceil(t.shineTime) + 's left';
        else stat = t.score + (t.score === 1 ? ' point' : ' points');
        return { pos: i + 1, name: t.name, kartColor: '#' + ('000000' + t.color.toString(16)).slice(-6), isPlayer: !!k.isPlayer, stat, kart: k };
      });
    }

    dispose() {
      G.events.off('itemHit', this._onHit);
      for (const k of this.karts) {
        const t = k._bt;
        if (!t) continue;
        if (t.meshes) for (const m of t.meshes) if (m.parent) m.parent.remove(m);
        k.btOut = false; k.speedMul = 1;
        k.invulnTimer = 0;
      }
      const sh = this.shine;
      if (sh.mesh && sh.mesh.parent) sh.mesh.parent.remove(sh.mesh);
      if (sh.beam && sh.beam.parent) sh.beam.parent.remove(sh.beam);
      if (this._points) { this.scene.remove(this._points); this._pg.dispose(); }
      for (const d of this._disposables) d.dispose();
    }
  }
  G.BattleMode = BattleMode;

  // ------------------------------------------------------------------ Battle AI
  class BattleAI {
    constructor(kart, arena, opts) {
      opts = opts || {};
      this.kart = kart; this.arena = arena;
      const sk = (this.skill = clamp(opts.skill === undefined ? 0.6 : opts.skill, 0, 1));
      kart._btMul = 0.9 + 0.1 * sk;
      this.gx = 0; this.gz = 0; this.target = null;
      this.retargetT = 0; this.spot = -1; this.lastSpot = -1; this.spotCool = 0;
      this.wanderT = 0;
      this.steerS = 0;
      this.stuckT = 0; this.recoverT = 0; this.recoverSteer = 1;
      this.drifting = false; this.driftT = 0; this.driftDir = 0; this.driftCool = rnd(1, 4); this.wiggleSide = 1; this.wiggleT = 0;
      this.maxHold = rnd(0.7, 1.4);
      // items
      this.phase = 0; this.itemWait = 0; this.itemAge = 0; this.lastItem = null; this.relBack = false; this.dragT = 0; this.dragLimit = 8; this.swapCool = 0;
      // scan results
      this.aimD = 1e9; this.nearD = 1e9; this.behindD = 1e9;
      // avoidance scratch
      this._dA = 100; this._rxA = 0; this._rzA = 0; this._eD = 100; this._exA = 0; this._ezA = 0;
      const inp = kart.input || (kart.input = {});
      inp.accel = 1; inp.brake = 0; inp.steer = 0; inp.drift = false; inp.item = false;
      inp.itemPressed = false; inp.itemReleased = false; inp.swapPressed = false; inp.throwBack = false;
    }

    _pickSpot() {
      const A = this.arena, k = this.kart, s = A.itemBoxSpots;
      if (!s || !s.length) { this.spot = -1; return; }
      let best = -1, bs = 1e9;
      for (let i = 0; i < s.length; i++) {
        if (i === this.lastSpot) continue;
        const d = Math.hypot(s[i].x - k.pos.x, s[i].z - k.pos.z) + rnd(0, 45);
        if (d < bs) { bs = d; best = i; }
      }
      this.spot = best;
    }

    _pickTarget(battle, karts) {
      const k = this.kart;
      let best = null, bs = 1e9;
      for (let i = 0; i < karts.length; i++) {
        const o = karts[i];
        if (o === k || (o._bt && o._bt.out) || o.btOut) continue;
        let d = Math.hypot(o.pos.x - k.pos.x, o.pos.z - k.pos.z);
        if (battle && battle.type === 'balloon' && o._bt) d += o._bt.balloons * 6 - 10; // prefer weakened
        if (battle && battle.type === 'bomb' && o._bt) d -= o._bt.score * 6;
        if (d < bs) { bs = d; best = o; }
      }
      this.target = best;
    }

    _scan(karts, fx, fz) {
      const k = this.kart;
      let aim = 1e9, near = 1e9, behind = 1e9;
      for (let i = 0; i < karts.length; i++) {
        const o = karts[i];
        if (o === k || o.btOut) continue;
        const dx = o.pos.x - k.pos.x, dz = o.pos.z - k.pos.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        const f = dx * fx + dz * fz;
        if (f > 0) {
          const ang = Math.abs(Math.atan2(dx * fz - dz * fx, f));
          if (ang < 0.2 && d < aim) aim = d;
          if (d < near) near = d;
        } else if (d < behind && d < 40) behind = d;
      }
      this.aimD = aim; this.nearD = near; this.behindD = behind;
    }

    update(dt, ctx) {
      const k = this.kart, A = this.arena, inp = k.input;
      ctx = ctx || {};
      const karts = ctx.karts || [], battle = ctx.battle || null;
      const sk = this.skill;
      const out = !!k.btOut;
      inp.itemPressed = false; inp.itemReleased = false; inp.swapPressed = false; inp.throwBack = false;

      const h = k.heading, fx = Math.sin(h), fz = Math.cos(h);
      const speed = k.speed || 0;
      const top = (k.stats && k.stats.topSpeed) || 26;
      const px = k.pos.x, pz = k.pos.z;

      // ---- goal selection
      this.retargetT -= dt; this.spotCool -= dt;
      if (this.retargetT <= 0) {
        this.retargetT = rnd(0.5, 1.0);
        this._pickTarget(battle, karts);
      }
      let gx = px + fx * 20, gz = pz + fz * 20;
      const type = battle ? battle.type : 'balloon';
      const hasItem = !!(k.heldItems[0] || k.heldItems[1] || k.roulette[0] > 0 || k.roulette[1] > 0);
      const tg = this.target;
      let mode = 0; // 0 wander, 1 spot, 2 chase, 3 flee, 4 shine
      if (out) mode = 0;
      else if (type === 'shine' && battle) {
        if (battle.holder === k) mode = 3;
        else if (battle.shineFree) mode = 4;
        else if (battle.holder) { mode = 2; this.target = battle.holder; }
        else mode = 1;
      } else if (!hasItem && this.arena.itemBoxSpots.length) mode = 1;
      else if (tg) mode = 2;
      if (mode === 2 && !this.target) mode = 1;

      if (mode === 1 || mode === 0) {
        if (this.spot < 0 || this.spotCool <= 0 && Math.hypot(A.itemBoxSpots[this.spot].x - px, A.itemBoxSpots[this.spot].z - pz) < 5) {
          this.lastSpot = this.spot; this._pickSpot(); this.spotCool = 0.3;
        }
        if (this.spot >= 0) { gx = A.itemBoxSpots[this.spot].x; gz = A.itemBoxSpots[this.spot].z; }
        if (mode === 0 && out) this.retargetT = 1;
      } else if (mode === 2) {
        const o = this.target;
        const d = Math.hypot(o.pos.x - px, o.pos.z - pz);
        const lead = clamp(d / Math.max(top, 8), 0, 1) * 0.5;
        gx = o.pos.x + (o.vel ? o.vel.x : 0) * lead; gz = o.pos.z + (o.vel ? o.vel.z : 0) * lead;
      } else if (mode === 4) {
        gx = battle.shine.x; gz = battle.shine.z;
      } else if (mode === 3) {
        // flee from the nearest opponent, keep to open ground
        let ax = 0, az = 0;
        for (let i = 0; i < karts.length; i++) {
          const o = karts[i];
          if (o === k || o.btOut) continue;
          const dx = px - o.pos.x, dz = pz - o.pos.z, d2 = dx * dx + dz * dz + 1;
          if (d2 > 80 * 80) continue;
          ax += dx / d2 * 40; az += dz / d2 * 40;
        }
        const cl = Math.hypot(px, pz) + 1, pull = clamp((cl - 30) / 60, 0, 1);
        ax += -px / cl * pull * 0.8; az += -pz / cl * pull * 0.8;
        const l = Math.hypot(ax, az);
        if (l < 0.01) { ax = fx; az = fz; } else { ax /= l; az /= l; }
        // swirl a little so we do not park in a corner
        gx = px + (ax + -az * 0.35) * 30; gz = pz + (az + ax * 0.35) * 30;
      }

      // ---- steering with obstacle / edge avoidance
      let dx = gx - px, dz = gz - pz;
      let l = Math.sqrt(dx * dx + dz * dz) || 1; dx /= l; dz /= l;
      const look = 6 + Math.max(0, speed) * 0.55;
      const q = A.query(px + fx * look, pz + fz * look, -1, k.pos.y);
      const dA = q.dWall, rxA = q.rx, rzA = q.rz, eD = q.edgeD, exA = q.ex, ezA = q.ez;
      const q0 = A.query(px, pz, -1, k.pos.y);
      const d0 = q0.dWall, rx0 = q0.rx, rz0 = q0.rz;
      let vx = dx, vz = dz;
      let wd = clamp((7 - dA) / 6, 0, 1), ax = -rxA, az = -rzA;
      const w0 = clamp((4 - d0) / 3, 0, 1);
      if (w0 > wd) { wd = w0; ax = -rx0; az = -rz0; }
      if (A.isVoid) {
        const ew = clamp((14 - eD) / 9, 0, 1);
        if (ew > wd) { wd = ew; ax = -exA; az = -ezA; }
      }
      if (wd > 0.001) {
        let tx = -az, tz = ax;
        if (tx * dx + tz * dz < 0) { tx = -tx; tz = -tz; }
        vx = dx * (1 - wd) + (ax * 0.55 + tx * 0.9) * wd;
        vz = dz * (1 - wd) + (az * 0.55 + tz * 0.9) * wd;
      }
      const diff = wrapA(Math.atan2(vx, vz) - h); // + => target is to the LEFT
      let steerT = clamp(-diff * 2.4, -1, 1);
      const absD = diff < 0 ? -diff : diff;
      let accel = 1, brake = 0;
      if (absD > 1.3 && speed > top * 0.5) accel = 0;
      if (absD > 2.3 && speed > 6) { accel = 0; brake = 1; }

      // ---- stuck recovery
      if (this.recoverT > 0) {
        this.recoverT -= dt; accel = 0; brake = 1; steerT = -this.recoverSteer;
        if (this.recoverT <= 0) this.stuckT = 0;
      } else if (!k.falling && k.stallTimer <= 0 && k.spinTimer <= 0 && speed < 1.5 && speed > -1.5) {
        this.stuckT += dt;
        if (this.stuckT > 1.2) { this.recoverT = 1.0; this.recoverSteer = diff > 0 ? -1 : 1; if (Math.random() < 0.3) this.recoverSteer = -this.recoverSteer; }
      } else if (speed > 3) this.stuckT = 0;

      // ---- drifting (occasional, counter-steer wiggles charge the mini-turbo)
      let driftHeld = false;
      if (k.falling || k.spinTimer > 0 || this.recoverT > 0 || out && false) this.drifting = false;
      else {
        this.driftCool -= dt;
        if (!this.drifting) {
          if (this.driftCool <= 0 && sk > 0.3 && absD > 0.55 && absD < 1.6 && speed > top * 0.6 && wd < 0.05 && !k.drifting) {
            this.drifting = true; this.driftT = 0; this.driftDir = diff > 0 ? -1 : 1; this.maxHold = rnd(0.8, 1.6);
            this.wiggleSide = 1; this.wiggleT = 0.28 - 0.1 * sk;
          }
        }
        if (this.drifting) {
          this.driftT += dt;
          let end = false;
          if (this.driftT > 0.4 && !k.drifting) end = true;
          else if (this.driftT > this.maxHold || wd > 0.1 || speed < top * 0.35) end = true;
          else if (k.driftLevel >= 1 && absD < 0.3) end = true;
          if (end) { this.drifting = false; this.driftCool = rnd(2, 5); } else {
            driftHeld = true;
            const dir = this.driftDir;
            if (this.driftT < 0.2) steerT = dir * 0.8;
            else if (k.driftLevel < 1) {
              this.wiggleT -= dt;
              if (this.wiggleT <= 0) { this.wiggleSide = -this.wiggleSide; this.wiggleT = 0.28 - 0.1 * sk; }
              steerT = dir * (this.wiggleSide > 0 ? 0.8 : -0.7);
            } else steerT = dir * clamp(dir * steerT, 0.1, 1);
          }
        }
      }

      this.steerS += (steerT - this.steerS) * Math.min(1, dt * (driftHeld ? 20 : 13));
      inp.steer = this.steerS; inp.accel = accel; inp.brake = brake; inp.drift = driftHeld;

      // ---- items
      if (out) { inp.item = false; this.phase = 0; } else {
        this._scan(karts, fx, fz);
        this._items(dt, type, mode, battle);
      }
    }

    _items(dt, type, mode, battle) {
      const k = this.kart, inp = k.input;
      const held = k.heldItems, id = held[0] || null, rou = k.roulette;
      if (this.swapCool > 0) this.swapCool -= dt;
      if (!id && rou[0] <= 0 && held[1] && rou[1] <= 0 && this.swapCool <= 0 && this.phase === 0) { inp.swapPressed = true; this.swapCool = 2; }
      if (this.phase === 2) {
        inp.item = false; inp.itemReleased = true; inp.throwBack = this.relBack;
        this.phase = 0; this.itemWait = rnd(0.3, 0.9);
        return;
      }
      if (id !== this.lastItem) {
        this.lastItem = id; this.itemWait = rnd(0.3, 1.2); this.itemAge = 0;
        if (this.phase === 1) this.phase = 0;
      }
      if (!id || rou[0] > 0) { inp.item = false; this.phase = 0; return; }
      this.itemAge += dt;
      if (this.phase === 1) {
        this.dragT += dt;
        if (this.behindD < 8 || this.dragT > this.dragLimit || this.aimD < 18) {
          inp.item = false; inp.itemReleased = true; inp.throwBack = this.behindD < 8;
          this.relBack = this.behindD < 8;
          this.phase = 0; this.itemWait = rnd(0.4, 1.0);
        } else { inp.item = true; inp.throwBack = true; }
        return;
      }
      inp.item = false;
      if (this.itemWait > 0) { this.itemWait -= dt; return; }
      const age = this.itemAge, aim = this.aimD, near = this.nearD, behind = this.behindD;
      let act = 0;
      const holdingShine = battle && battle.holder === k;
      switch (id) {
        case 'shell_green': case 'shell_green3': case 'shell_red3':
          if (aim < 55) act = 1; else if (behind < 14) act = 2; else if (age > 12) act = 1;
          break;
        case 'bomb':
          if (aim < 40 || near < 16) act = 1; else if (behind < 9) act = 2; else if (age > 7) act = 1;
          break;
        case 'shell_red': case 'egg': case 'fireball': case 'mega_shell': case 'spiny': case 'heart': case 'chomp':
          if (near < 70 || age > 6) act = 1;
          break;
        case 'banana': case 'fake_box': case 'giant_banana':
          if (aim < 16) act = 1; else act = 3;
          break;
        case 'mushroom': case 'mushroom3': case 'mushroom_gold':
          if (holdingShine || mode === 2 && near > 18 || age > 5) act = 1;
          break;
        case 'star':
          if (near < 40 || age > 4) act = 1;
          break;
        default: act = 1;
      }
      if (type === 'shine' && holdingShine && (id === 'shell_red' || id === 'spiny' || id === 'fireball')) act = behind < 20 ? 2 : (near < 35 ? 1 : 0);
      if (act === 1 || act === 2) {
        inp.itemPressed = true; inp.item = true; inp.throwBack = act === 2;
        this.relBack = act === 2; this.phase = 2;
      } else if (act === 3) {
        inp.itemPressed = true; inp.item = true; inp.throwBack = true;
        this.phase = 1; this.dragT = 0; this.dragLimit = rnd(5, 12);
      }
    }
  }
  G.BattleAI = BattleAI;
})();
