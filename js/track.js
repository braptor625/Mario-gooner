// Tracks: spline-based closed circuits, road/wall/scenery meshes, query() for physics.
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  // ---------------------------------------------------------------- helpers
  const col = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
  const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const _hc = new THREE.Color();
  const hsl = (h, s, l) => { _hc.setHSL(((h % 1) + 1) % 1, s, l); return [_hc.r, _hc.g, _hc.b]; };
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

  // Non-indexed vertex-colored triangle accumulator -> one merged mesh per material.
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
      this.quad(a1, b1, c1, d1, k);
      this.quad(a0, b0, b1, a1, k); this.quad(b0, c0, c1, b1, k);
      this.quad(c0, d0, d1, c1, k); this.quad(d0, a0, a1, d1, k);
    }
    frustum(x, y0, z, r0, r1, h, sides, k, rot) {
      rot = rot || 0;
      const y1 = y0 + h, top = [x, y1, z];
      for (let i = 0; i < sides; i++) {
        const a0 = rot + (i / sides) * Math.PI * 2, a1 = rot + ((i + 1) / sides) * Math.PI * 2;
        const b0 = [x + Math.cos(a0) * r0, y0, z + Math.sin(a0) * r0];
        const b1 = [x + Math.cos(a1) * r0, y0, z + Math.sin(a1) * r0];
        if (r1 <= 0) this.tri(b0, b1, top, k);
        else {
          const t0 = [x + Math.cos(a0) * r1, y1, z + Math.sin(a0) * r1];
          const t1 = [x + Math.cos(a1) * r1, y1, z + Math.sin(a1) * r1];
          this.quad(b0, b1, t1, t0, k); this.tri(top, t0, t1, k);
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

  // ---------------------------------------------------------------- definitions
  // pts: [x, z, y?, halfWidth?]; first point is the start/finish line (dist 0), heading toward pts[1].
  const DEFS = {
    meadow: {
      name: 'Meadow Loop', theme: 'meadow', seed: 11, hw: 12, shoulder: 5, scale: 1,
      pts: [[0, 0, 0, 13], [80, 0, 0.3, 13], [160, 0, 1], [230, -5, 2], [290, 10, 3], [330, 50, 4], [335, 105, 4],
        [300, 150, 3], [245, 165, 2], [200, 140, 1], [160, 110, 1], [110, 115, 1.5], [70, 150, 3], [20, 175, 4],
        [-40, 170, 4], [-90, 140, 3], [-110, 95, 2], [-105, 45, 1], [-80, 8, 0.4], [-40, 0, 0]],
      pads: [{ d: 40, len: 10, l: -5, w: 6 }, { d: 40, len: 10, l: 5, w: 6 }, { d: 110, len: 10, l: 0, w: 7 }],
      jumps: [], arches: [], lakeDist: 0,
    },
    dunes: {
      name: 'Sunscorch Dunes', theme: 'dunes', seed: 23, hw: 13, shoulder: 5, scale: 1,
      pts: [[0, 0, 0, 14], [70, 0, 0, 14], [160, 0, 0.5], [250, -10, 1], [320, 20, 2], [350, 90, 3], [345, 170, 3.5],
        [310, 240, 3], [255, 285, 2], [195, 285, 1.5], [172, 248, 1], [170, 215, 1], [167, 179, 1.5], [158, 165, 1.5], [144, 156, 1.5], [128, 153, 1.5], [112, 156, 1.5], [98, 165, 1.5], [89, 179, 1.5], [86, 215, 3], [84, 250, 3.2], [58, 280, 3.5], [0, 295, 3], [-70, 270, 2], [-120, 210, 1.5], [-130, 130, 1],
        [-110, 60, 0.5], [-70, 15, 0.2]],
      pads: [{ d: 130, len: 10, l: 0, w: 8 }],
      jumps: [{ d: 80, len: 10, l: 0, w: 10 }],
      arches: [40, 140], lakeDist: 0,
    },
    glacier: {
      name: 'Glacier Pass', theme: 'glacier', seed: 37, hw: 12, shoulder: 5, scale: 0.8,
      pts: [[60, 0, 0, 13],
        [130, 0, 0],
        [195, 0, 0.4],
        [255, 0, 1],
        [278, 6, 1.7],
        [296, 24, 2.3],
        [302, 47, 3],
        [296, 70, 3.7],
        [278, 88, 4.3],
        [255, 94, 5],
        [190, 94, 5],
        [120, 94, 5],
        [65, 94, 5.5],
        [30, 94, 6],
        [7, 100, 6.7],
        [-11, 118, 7.3],
        [-17, 141, 8],
        [-11, 164, 8.7],
        [6, 182, 9.3],
        [30, 188, 10],
        [100, 188, 10],
        [180, 188, 10.5],
        [255, 188, 11],
        [278, 194, 11.4],
        [296, 212, 11.8],
        [302, 235, 12.2],
        [296, 258, 12.7],
        [278, 276, 13.1],
        [255, 282, 13.5],
        [190, 282, 13],
        [120, 282, 12.5],
        [50, 282, 12],
        [-30, 280, 11.5],
        [-90, 262, 10.5],
        [-135, 225, 9],
        [-150, 170, 6.5],
        [-148, 110, 4.5],
        [-135, 50, 2.5],
        [-110, 12, 1],
        [-60, 0, 0.3],
        [0, 0, 0]],
      pads: [{ d: 40, len: 10, l: 0, w: 8 }],
      jumps: [], arches: [], lakeDist: 330, iceLen: 110,
    },
    starlight: {
      name: 'Starlight Ribbon', theme: 'starlight', seed: 51, hw: 12, shoulder: 5, scale: 1, noWalls: true,
      pts: [[0, 0, 0, 14], [100, 0, 0, 13], [190, -5, 1], [255, 25, 3], [285, 90, 5], [270, 160, 7], [220, 215, 8],
        [150, 240, 8], [100, 225, 6], [50, 245, 4], [-10, 275, 3], [-80, 270, 2], [-130, 220, 2.5], [-150, 150, 3.5],
        [-138, 95, 4.5], [-140, 45, 3], [-112, 10, 1.5], [-65, -2, 0.5]],
      pads: [{ d: 40, len: 10, l: -4, w: 6 }, { d: 40, len: 10, l: 4, w: 6 }, { d: 400, len: 10, l: 0, w: 8 }],
      jumps: [], arches: [], lakeDist: 0,
    },
  };

  const THEMES = {
    meadow: {
      sky: [0x3b8fe8, 0xbfe4ff, 0x8ac96a], fog: [0xbfe4ff, 140, 520], ground: 0x6fbf4a, shoulder: 0x4f9a35,
      road: [0x5d6170, 0x555967], curb: [0xe8383d, 0xffffff], hemi: [0xcfe8ff, 0x6a9a50, 0.95], sun: [0xfff2d8, 0.85],
      emb: 0x5cae3e, bg: 0xbfe4ff,
    },
    dunes: {
      sky: [0x5aa6e0, 0xf6d19a, 0xe3b866], fog: [0xf1c98a, 100, 440], ground: 0xe3b866, shoulder: 0xd2a352,
      road: [0x8c8179, 0x837870], curb: [0xc8502d, 0xf3e2b8], hemi: [0xffe9c4, 0xc89a55, 0.95], sun: [0xffe2b0, 0.95],
      emb: 0xd9aa5a, bg: 0xf1c98a,
    },
    glacier: {
      sky: [0x7fb2e6, 0xdcecf8, 0xeaf4ff], fog: [0xcfe6f7, 70, 400], ground: 0xeaf4ff, shoulder: 0xd2e5f3,
      road: [0x7d8794, 0x747e8b], curb: [0x3c7fd0, 0xffffff], hemi: [0xdcecff, 0x9db8d0, 1.0], sun: [0xe8f3ff, 0.8],
      emb: 0xdcecf7, bg: 0xcfe6f7,
    },
    starlight: {
      sky: [0x05031a, 0x1b0f4a, 0x0a0630], fog: [0x0a0630, 160, 650], ground: 0x000000, shoulder: 0x000000,
      road: [0x7050c0, 0x6040b0], curb: [0xffffff, 0x78f0ff], hemi: [0xb9a8ff, 0x3a2a7a, 1.05], sun: [0xffe6ff, 0.6],
      emb: 0x000000, bg: 0x0a0630,
    },
  };

  G.TRACKS = [
    { id: 'meadow', name: 'Meadow Loop', cup: 'comet', theme: 'meadow', laps: 3, music: 'meadow' },
    { id: 'dunes', name: 'Sunscorch Dunes', cup: 'comet', theme: 'dunes', laps: 3, music: 'dunes' },
    { id: 'glacier', name: 'Glacier Pass', cup: 'comet', theme: 'glacier', laps: 3, music: 'glacier' },
    { id: 'starlight', name: 'Starlight Ribbon', cup: 'comet', theme: 'starlight', laps: 3, music: 'starlight' },
    // Nova Cup: the same circuits driven in reverse
    { id: 'glacier_r', name: 'Glacier Pass R', cup: 'nova', theme: 'glacier', laps: 3, music: 'glacier', reversed: true },
    { id: 'dunes_r', name: 'Sunscorch Dunes R', cup: 'nova', theme: 'dunes', laps: 3, music: 'dunes', reversed: true },
    { id: 'meadow_r', name: 'Meadow Loop R', cup: 'nova', theme: 'meadow', laps: 3, music: 'meadow', reversed: true },
    { id: 'starlight_r', name: 'Starlight Ribbon R', cup: 'nova', theme: 'starlight', laps: 3, music: 'starlight', reversed: true },
  ];
  G.CUPS = [
    { id: 'comet', name: 'Comet Cup', tracks: ['meadow', 'dunes', 'glacier', 'starlight'] },
    { id: 'nova', name: 'Nova Cup', tracks: ['glacier_r', 'dunes_r', 'meadow_r', 'starlight_r'] },
  ];

  const EMB = 10;     // embankment width beyond the shoulder
  const CELL = 32;    // spatial hash cell

  // ---------------------------------------------------------------- Track
  class Track {
    constructor(trackId, scene) {
      this.scene = scene;
      this.id = trackId;
      const rev = /_r$/.test(trackId);
      const baseId = rev ? trackId.slice(0, -2) : trackId;
      const base = DEFS[baseId];
      if (!base) throw new Error('Unknown track ' + trackId);
      this.rev = rev;
      this.def = Object.assign({ id: trackId, rev: rev }, base);
      this.theme = base.theme;
      this.cfg = THEMES[base.theme];
      this.noWalls = !!base.noWalls;
      this.shoulder = base.shoulder;
      this.rng = mulberry(base.seed + (rev ? 1000 : 0));
      this._time = 0;
      this._geoms = []; this._mats = []; this._objs = []; this._tex = [];
      this._anim = {};
      this._res = {
        index: 0, dist: 0, lateral: 0, halfWidth: 12, wallDist: 17, y: 0, onRoad: true, surface: 'road',
        tx: 0, tz: 1, rx: -1, rz: 0,
      };
      this._sampleCurve(base, rev);
      this._buildRects(base, rev);
      this._buildGrid();
      this._buildItemSpots();
      this._buildMinimap();
      this._buildWorld(base, rev);
    }

    // ------------------------------------------------ spline sampling
    _sampleCurve(def, rev) {
      let src = def.pts.slice();
      if (rev) src = [src[0]].concat(src.slice(1).reverse());
      const sc = def.scale || 1, n = src.length;
      const pts = src.map((p) => new THREE.Vector3(p[0] * sc, p[2] || 0, p[1] * sc));
      const wv = src.map((p) => (p[3] !== undefined ? p[3] : def.hw));
      const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
      const K = 48, M = n * K;
      const fx = new Float64Array(M + 1), fy = new Float64Array(M + 1), fz = new Float64Array(M + 1);
      const cum = new Float64Array(M + 1);
      for (let m = 0; m <= M; m++) {
        const p = curve.getPoint(m / M);
        fx[m] = p.x; fy[m] = p.y; fz[m] = p.z;
        if (m > 0) cum[m] = cum[m - 1] + Math.hypot(fx[m] - fx[m - 1], fz[m] - fz[m - 1]);
      }
      const L = cum[M], N = Math.round(L), ds = L / N;
      this.N = N; this.ds = ds; this.length = L;
      const px = (this.px = new Float32Array(N)), py = (this.py = new Float32Array(N)), pz = (this.pz = new Float32Array(N));
      const tx = (this.tx = new Float32Array(N)), tz = (this.tz = new Float32Array(N));
      const rx = (this.rx = new Float32Array(N)), rz = (this.rz = new Float32Array(N));
      const hw = (this.hw = new Float32Array(N));
      let j = 0;
      for (let k = 0; k < N; k++) {
        const s = k * ds;
        while (j < M - 1 && cum[j + 1] < s) j++;
        const seg = cum[j + 1] - cum[j] || 1;
        const f = Math.min(1, Math.max(0, (s - cum[j]) / seg));
        px[k] = fx[j] + (fx[j + 1] - fx[j]) * f;
        py[k] = fy[j] + (fy[j + 1] - fy[j]) * f;
        pz[k] = fz[j] + (fz[j + 1] - fz[j]) * f;
        const u = (j + f) / K, a = Math.floor(u) % n, b = (a + 1) % n;
        let q = u - Math.floor(u); q = q * q * (3 - 2 * q);
        hw[k] = wv[a] + (wv[b] - wv[a]) * q;
      }
      for (let k = 0; k < N; k++) {
        const a = (k - 1 + N) % N, b = (k + 1) % N;
        let dx = px[b] - px[a], dz = pz[b] - pz[a];
        const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        tx[k] = dx; tz[k] = dz; rx[k] = -dz; rz[k] = dx;
      }
      // signed curvature (heading change per meter, + = left turn)
      const curv = (this.curv = new Float32Array(N));
      const W = 6;
      for (let k = 0; k < N; k++) {
        const a = (k - W + N) % N, b = (k + W) % N;
        const h0 = Math.atan2(tx[a], tz[a]), h1 = Math.atan2(tx[b], tz[b]);
        curv[k] = G.wrapAngle(h1 - h0) / (2 * W * ds);
      }
      let minY = 1e9;
      for (let k = 0; k < N; k++) if (py[k] < minY) minY = py[k];
      this.groundY = minY - 0.25;
    }

    _dist(d) { return this.rev ? this.length - d : d; }

    _buildRects(def, rev) {
      const L = this.length, r = [];
      const add = (a, kind) => {
        const d0 = a.d, d1 = a.d + a.len, l0 = a.l - a.w / 2, l1 = a.l + a.w / 2;
        if (rev) r.push({ d0: L - d1, d1: L - d0, l0: -l1, l1: -l0, kind });
        else r.push({ d0, d1, l0, l1, kind });
      };
      (def.pads || []).forEach((p) => add(p, 1));
      (def.jumps || []).forEach((p) => add(p, 2));
      this.rects = r;
      this.nrect = r.length;
    }

    _buildGrid() {
      const g = (this._grid = new Map());
      for (let i = 0; i < this.N; i++) {
        const key = Math.floor(this.px[i] / CELL) * 4096 + Math.floor(this.pz[i] / CELL);
        let a = g.get(key); if (!a) { a = []; g.set(key, a); }
        a.push(i);
      }
      this._noGo = [];
    }
    // true when (x,z) is at least m from the centerline and outside reserved circles
    clear(x, z, m) {
      const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), r = Math.ceil(m / CELL), m2 = m * m;
      for (let a = cx - r; a <= cx + r; a++) for (let b = cz - r; b <= cz + r; b++) {
        const arr = this._grid.get(a * 4096 + b);
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const i = arr[k], dx = x - this.px[i], dz = z - this.pz[i];
          if (dx * dx + dz * dz < m2) return false;
        }
      }
      for (let k = 0; k < this._noGo.length; k++) {
        const o = this._noGo[k];
        if (Math.hypot(x - o.x, z - o.z) < o.r + m * 0.3) return false;
      }
      return true;
    }

    // ------------------------------------------------ public query API
    query(x, z, hint) {
      const N = this.N, px = this.px, pz = this.pz, r = this._res;
      let best = -1, bd = 1e18;
      if (hint !== undefined && hint >= 0) {
        hint = hint | 0; if (hint >= N) hint %= N;
        for (let k = -40; k <= 40; k++) {
          let i = hint + k; if (i < 0) i += N; else if (i >= N) i -= N;
          const dx = x - px[i], dz = z - pz[i], d = dx * dx + dz * dz;
          if (d < bd) { bd = d; best = i; }
        }
        const lim = 2 * this.hw[best] + 30;
        if (bd > lim * lim) best = -1;
      }
      if (best < 0) {
        bd = 1e18;
        for (let i = 0; i < N; i++) {
          const dx = x - px[i], dz = z - pz[i], d = dx * dx + dz * dz;
          if (d < bd) { bd = d; best = i; }
        }
      }
      const i = best;
      const s = (x - px[i]) * this.tx[i] + (z - pz[i]) * this.tz[i];
      let j, t;
      if (s >= 0) { j = i; t = s / this.ds; } else { j = i === 0 ? N - 1 : i - 1; t = 1 + s / this.ds; }
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const j2 = j + 1 === N ? 0 : j + 1;
      const cx = px[j] + (px[j2] - px[j]) * t, cz = pz[j] + (pz[j2] - pz[j]) * t;
      let rx = this.rx[j] + (this.rx[j2] - this.rx[j]) * t, rz = this.rz[j] + (this.rz[j2] - this.rz[j]) * t;
      const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
      const lat = (x - cx) * rx + (z - cz) * rz;
      let dist = (j + t) * this.ds; if (dist >= this.length) dist -= this.length;
      const hw = this.hw[j] + (this.hw[j2] - this.hw[j]) * t;
      const a = lat < 0 ? -lat : lat;
      let surface = 'offroad';
      if (a <= hw) {
        surface = 'road';
        for (let k = 0; k < this.nrect; k++) {
          const q = this.rects[k];
          if (dist >= q.d0 && dist <= q.d1 && lat >= q.l0 && lat <= q.l1) { surface = q.kind === 1 ? 'boost' : 'jump'; break; }
        }
      } else if (this.noWalls && a > hw + 1) surface = 'void';
      r.index = i; r.dist = dist; r.lateral = lat; r.halfWidth = hw;
      r.wallDist = this.noWalls ? hw + 1 : hw + this.shoulder;
      r.y = this.py[j] + (this.py[j2] - this.py[j]) * t;
      r.onRoad = a <= hw; r.surface = surface;
      let tx = this.tx[j] + (this.tx[j2] - this.tx[j]) * t, tz = this.tz[j] + (this.tz[j2] - this.tz[j]) * t;
      const tl = Math.hypot(tx, tz) || 1;
      r.tx = tx / tl; r.tz = tz / tl; r.rx = rx; r.rz = rz;
      return r;
    }

    _frame(dist, o) {
      const L = this.length; dist = ((dist % L) + L) % L;
      const f = dist / this.ds; let i = Math.floor(f); const t = f - i;
      if (i >= this.N) i = 0;
      const j = i + 1 === this.N ? 0 : i + 1;
      o.x = this.px[i] + (this.px[j] - this.px[i]) * t;
      o.y = this.py[i] + (this.py[j] - this.py[i]) * t;
      o.z = this.pz[i] + (this.pz[j] - this.pz[i]) * t;
      let tx = this.tx[i] + (this.tx[j] - this.tx[i]) * t, tz = this.tz[i] + (this.tz[j] - this.tz[i]) * t;
      const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      o.tx = tx; o.tz = tz; o.rx = -tz; o.rz = tx;
      o.halfWidth = this.hw[i] + (this.hw[j] - this.hw[i]) * t;
      return o;
    }
    pointAt(dist) {
      return this._frame(dist, { x: 0, y: 0, z: 0, tx: 0, tz: 1, rx: -1, rz: 0, halfWidth: 12 });
    }
    respawnPoint(dist) {
      const p = this._frame(dist, { x: 0, y: 0, z: 0, tx: 0, tz: 1, rx: -1, rz: 0, halfWidth: 12 });
      return { x: p.x, y: p.y, z: p.z, heading: Math.atan2(p.tx, p.tz) };
    }
    getStartGrid(n) {
      n = n || 8;
      const out = [], tmp = { x: 0, y: 0, z: 0, tx: 0, tz: 1, rx: -1, rz: 0, halfWidth: 12 };
      for (let k = 0; k < n; k++) {
        const row = k >> 1, side = k & 1 ? 1 : -1;
        const d = this.length - 8 - row * 6 - (k & 1 ? 3 : 0);
        this._frame(d, tmp);
        const lat = side * 4;
        out.push({ x: tmp.x + tmp.rx * lat, y: tmp.y, z: tmp.z + tmp.rz * lat, heading: Math.atan2(tmp.tx, tmp.tz) });
      }
      return out;
    }

    _buildItemSpots() {
      const spots = [], tmp = { x: 0, y: 0, z: 0, tx: 0, tz: 1, rx: -1, rz: 0, halfWidth: 12 };
      const L = this.length;
      for (let r = 0; r < 5; r++) {
        let d = L * (0.1 + 0.18 * r);
        for (let tries = 0; tries < 12; tries++) {
          let bad = d < 20 || d > L - 20;
          for (let k = 0; k < this.nrect; k++) if (d > this.rects[k].d0 - 14 && d < this.rects[k].d1 + 14) bad = true;
          if (!bad) break;
          d += 12;
        }
        this._frame(d, tmp);
        for (let k = 0; k < 5; k++) {
          const l = (k - 2) * tmp.halfWidth * 0.38;
          spots.push({ x: tmp.x + tmp.rx * l, y: tmp.y, z: tmp.z + tmp.rz * l });
        }
      }
      this.itemBoxSpots = spots;
    }

    _buildMinimap() {
      const pts = [], n = 200;
      let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
      for (let k = 0; k < n; k++) {
        const i = Math.floor((k * this.N) / n), x = this.px[i], z = this.pz[i];
        pts.push({ x, z });
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      this.minimap = { points: pts, bounds: { minX, maxX, minZ, maxZ } };
    }

    // ------------------------------------------------ mesh construction
    _mat(opts, basic) {
      opts = Object.assign({}, opts);
      delete opts.flatShading; // not supported by Lambert/Basic in r128
      const m = basic
        ? new THREE.MeshBasicMaterial(Object.assign({ vertexColors: true, side: THREE.DoubleSide }, opts))
        : new THREE.MeshLambertMaterial(Object.assign({ vertexColors: true, side: THREE.DoubleSide }, opts));
      this._mats.push(m);
      return m;
    }
    _mesh(batch, mat, noCull) {
      if (batch.empty) return null;
      const g = batch.build(); this._geoms.push(g);
      const m = new THREE.Mesh(g, mat);
      if (noCull) m.frustumCulled = false;
      return this._add(m);
    }
    _add(o) { this.scene.add(o); this._objs.push(o); return o; }
    _P(i, l, dy) {
      return [this.px[i] + this.rx[i] * l, this.py[i] + dy, this.pz[i] + this.rz[i] * l];
    }
    _PD(d, l, dy) {
      const f = this._frame(d, this._ft || (this._ft = { x: 0, y: 0, z: 0, tx: 0, tz: 1, rx: -1, rz: 0, halfWidth: 12 }));
      return [f.x + f.rx * l, f.y + dy, f.z + f.rz * l];
    }

    _buildWorld(def, rev) {
      const cfg = this.cfg, theme = this.theme, N = this.N, ds = this.ds;
      const star = theme === 'starlight';
      const scene = this.scene;

      // fog / background
      scene.fog = new THREE.Fog(cfg.fog[0], cfg.fog[1], cfg.fog[2]);
      scene.background = new THREE.Color(cfg.bg);

      // lights
      this.hemi = new THREE.HemisphereLight(cfg.hemi[0], cfg.hemi[1], cfg.hemi[2]);
      this._add(this.hemi);
      this.sun = new THREE.DirectionalLight(cfg.sun[0], cfg.sun[1]);
      this.sun.position.set(this.px[0] + 90, 130, this.pz[0] + 60);
      this.sun.target.position.set(this.px[0], 0, this.pz[0]);
      this.sun.castShadow = false;
      this.sun.shadow.mapSize.set(1024, 1024);
      const sc = this.sun.shadow.camera;
      sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 400;
      this.sun.shadow.bias = -0.0008;
      this._add(this.sun); this._add(this.sun.target);

      // reserved circles (lake) before scatter
      let lake = null;
      if (theme === 'meadow') lake = this._findOpenSpot(48, 36);
      else if (theme === 'glacier') {
        const p = this.pointAt(this._dist(def.lakeDist));
        lake = { x: p.x, z: p.z, r: 52, onRoad: true };
      }
      this._lake = lake;

      this._buildSky(def);
      this._buildRoad(def);
      this._buildBoundaries(def);
      if (!star) this._buildGround();
      this._buildStartArch();
      this._buildScenery(def, lake);
      if (theme === 'glacier') this._buildSnow();
    }

    _findOpenSpot(r, margin) {
      let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
      for (let i = 0; i < this.N; i += 8) {
        minX = Math.min(minX, this.px[i]); maxX = Math.max(maxX, this.px[i]);
        minZ = Math.min(minZ, this.pz[i]); maxZ = Math.max(maxZ, this.pz[i]);
      }
      let best = null, bestD = -1;
      for (let x = minX; x <= maxX; x += 12) for (let z = minZ; z <= maxZ; z += 12) {
        let d = 1e9;
        for (let i = 0; i < this.N; i += 3) { const dd = Math.hypot(x - this.px[i], z - this.pz[i]); if (dd < d) d = dd; }
        if (d > bestD) { bestD = d; best = { x, z }; }
      }
      if (!best || bestD < r + margin * 0.5) return null;
      return { x: best.x, z: best.z, r: Math.min(r, bestD - margin * 0.5) };
    }

    // sky gradient sphere + camera-locked backdrop decorations
    _follow(obj, spin) {
      obj.frustumCulled = false;
      const self = this;
      obj.onBeforeRender = function (renderer, scene, camera) {
        obj.position.copy(camera.position);
        if (spin) obj.rotation.y = self._time * spin;
        obj.updateMatrixWorld(true);
      };
    }
    _buildSky(def) {
      const cfg = this.cfg;
      const geo = new THREE.SphereGeometry(300, 20, 14);
      const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
      const top = col(cfg.sky[0]), mid = col(cfg.sky[1]), bot = col(cfg.sky[2]);
      for (let i = 0; i < pos.count; i++) {
        const v = pos.getY(i) / 300;
        const c = v >= 0 ? mix(mid, top, Math.pow(v, 0.6)) : mix(mid, bot, Math.min(1, -v * 3));
        colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      this._geoms.push(geo);
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, depthTest: false });
      this._mats.push(mat);
      const sky = new THREE.Mesh(geo, mat);
      sky.renderOrder = -1000;
      this._follow(sky);
      this._add(sky);

      // decorations (clouds, distant ridges, planets), locked to the camera so they sit at infinity
      const b = new Batch(), rng = this.rng, theme = this.theme, R = 270;
      const ring = (n, fn) => { for (let i = 0; i < n; i++) fn((i / n) * Math.PI * 2 + rng() * 0.2, i); };
      if (theme === 'meadow') {
        b.blob(Math.cos(0.9) * R, 150, Math.sin(0.9) * R, 16, 16, 16, col(0xfff6c0), 1);
        ring(26, (a) => b.blob(Math.cos(a) * 285, -5, Math.sin(a) * 285, 60 + rng() * 40, 26 + rng() * 22, 40, mix(col(0x7fb38a), col(0xa9d4b4), rng()), 0));
        ring(16, (a) => {
          const y = 85 + rng() * 55, r = 230 + rng() * 40, cx = Math.cos(a) * r, cz = Math.sin(a) * r;
          for (let k = 0; k < 3; k++) b.blob(cx + (k - 1) * 14, y + (k === 1 ? 4 : 0), cz + rng() * 6, 16, 5.5, 9, col(0xffffff), 0);
        });
      } else if (theme === 'dunes') {
        b.blob(Math.cos(2.2) * R, 70, Math.sin(2.2) * R, 26, 26, 26, col(0xffefc0), 1);
        ring(26, (a) => b.blob(Math.cos(a) * 285, -8, Math.sin(a) * 285, 80 + rng() * 40, 18 + rng() * 22, 45, mix(col(0xd9a85c), col(0xe8c07a), rng()), 0));
        ring(5, (a) => b.frustum(Math.cos(a) * 288, -10, Math.sin(a) * 288, 46, 4, 50 + rng() * 25, 5, col(0xc98d50), 0));
      } else if (theme === 'glacier') {
        ring(22, (a) => {
          const x = Math.cos(a) * 285, z = Math.sin(a) * 285, h = 70 + rng() * 60, r = 50 + rng() * 30;
          b.frustum(x, -10, z, r, 0, h, 6, col(0x8fb0cf), rng() * 3);
          b.frustum(x, -10 + h * 0.55, z, r * 0.45, 0, h * 0.45, 6, col(0xffffff), 0);
        });
        ring(8, (a) => b.blob(Math.cos(a) * 250, 120 + rng() * 40, Math.sin(a) * 250, 40, 4, 12, col(0xf4fbff), 0));
      } else {
        ring(7, (a, i) => {
          const y = 40 + rng() * 120, r = 120 + rng() * 100, rad = 8 + rng() * 22;
          const c = [col(0xff7ab8), col(0x6fd8ff), col(0xffd36f), col(0xa98bff)][i % 4];
          b.blob(Math.cos(a) * r * 1.2, y, Math.sin(a) * r * 1.2, rad, rad, rad, c, 1);
        });
        b.blob(-150, 90, -190, 40, 40, 40, col(0x7a5cf0), 1);
        b.blob(-150, 90, -190, 62, 1.5, 62, col(0xffc6f5), 1);
      }
      const dm = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false, side: THREE.DoubleSide });
      this._mats.push(dm);
      const deco = this._mesh(b, dm, true);
      if (deco) { deco.renderOrder = -999; this._follow(deco, theme === 'meadow' ? 0.004 : 0); this._anim.deco = deco; }

      if (theme === 'starlight') {
        const n = 1800, pp = new Float32Array(n * 3), cc = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const u = rng() * 2 - 1, a = rng() * Math.PI * 2, s = Math.sqrt(1 - u * u), r = 290;
          pp[i * 3] = Math.cos(a) * s * r; pp[i * 3 + 1] = u * r; pp[i * 3 + 2] = Math.sin(a) * s * r;
          const c = [col(0xffffff), col(0xbfd8ff), col(0xffe4b0), col(0xffc0ea)][(rng() * 4) | 0], k = 0.5 + rng() * 0.5;
          cc[i * 3] = c[0] * k; cc[i * 3 + 1] = c[1] * k; cc[i * 3 + 2] = c[2] * k;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pp, 3));
        g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
        this._geoms.push(g);
        const m = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false });
        this._mats.push(m);
        const pts = new THREE.Points(g, m);
        pts.renderOrder = -998;
        this._follow(pts, 0.006);
        this._add(pts);
      }
    }

    _roadColors() {
      const cfg = this.cfg;
      return { a: col(cfg.road[0]), b: col(cfg.road[1]), c0: col(cfg.curb[0]), c1: col(cfg.curb[1]) };
    }

    _buildRoad(def) {
      const N = this.N, ds = this.ds, star = this.theme === 'starlight';
      const rc = this._roadColors(), road = new Batch(), hwA = this.hw;
      const white = [1, 1, 1];
      const ice = this.theme === 'glacier' ? { c: col(0xa9d9ff), c2: col(0x92c9f2) } : null;
      let iceD0 = 0, iceD1 = 0;
      if (ice) {
        const mid = this._dist(def.lakeDist), half = (def.iceLen || 100) / 2;
        iceD0 = mid - half; iceD1 = mid + half;
      }
      const lat = (h, c) => (c === 0 ? -h : c === 1 ? -h + 1.3 : c === 2 ? -0.3 : c === 3 ? 0.3 : c === 4 ? h - 1.3 : h);
      for (let i = 0; i < N; i += 2) {
        const j = i + 2 >= N ? 0 : i + 2, r = i >> 1, d = i * ds;
        const hi = hwA[i], hj = hwA[j];
        if (i < 4) {
          // start / finish checkerboard
          const nc = Math.max(4, Math.round((2 * hi) / 2.2));
          for (let c = 0; c < nc; c++) {
            const l0i = -hi + (c * 2 * hi) / nc, l1i = -hi + ((c + 1) * 2 * hi) / nc;
            const l0j = -hj + (c * 2 * hj) / nc, l1j = -hj + ((c + 1) * 2 * hj) / nc;
            const k = ((r + c) & 1) ? [0.08, 0.08, 0.08] : [0.98, 0.98, 0.98];
            road.quad(this._P(i, l0i, 0.04), this._P(i, l1i, 0.04), this._P(j, l1j, 0.04), this._P(j, l0j, 0.04), k);
          }
          continue;
        }
        const stripe = (r >> 2) & 1, dash = ((r >> 1) & 1) === 0, curbT = (r >> 1) & 1;
        const inIce = ice && d > iceD0 && d < iceD1;
        for (let c = 0; c < 5; c++) {
          let k, dy = 0.02;
          if (star) {
            const hue = d * 0.0022 + c * 0.07;
            if (c === 0 || c === 4) { k = curbT ? [1, 1, 1] : hsl(hue, 1, 0.75); dy = 0.05; }
            else if (c === 2) k = dash ? [1, 1, 1] : hsl(hue, 0.9, 0.55);
            else k = hsl(hue, 0.9, stripe ? 0.5 : 0.56);
          } else if (c === 0 || c === 4) { k = curbT ? rc.c1 : rc.c0; dy = 0.05; }
          else if (c === 2) k = dash ? white : (inIce ? ice.c : (stripe ? rc.a : rc.b));
          else k = inIce ? (stripe ? ice.c : ice.c2) : (stripe ? rc.a : rc.b);
          road.quad(this._P(i, lat(hi, c), dy), this._P(i, lat(hi, c + 1), dy), this._P(j, lat(hj, c + 1), dy), this._P(j, lat(hj, c), dy), k);
        }
        if (star) {
          // slab underside & edges
          const dk = (r & 1) ? col(0x4a2a9a) : col(0x6a3cc8), bk = col(0x1c0d44);
          for (let s = -1; s <= 1; s += 2) road.quad(this._P(i, s * hi, 0), this._P(i, s * hi, -0.9), this._P(j, s * hj, -0.9), this._P(j, s * hj, 0), dk);
          road.quad(this._P(i, -hi, -0.9), this._P(i, hi, -0.9), this._P(j, hj, -0.9), this._P(j, -hj, -0.9), bk);
        }
      }
      // glowing guard rails on the outside of sharper corners (starlight only)
      if (star) {
        for (let i = 0; i < N; i += 2) {
          const j = i + 2 >= N ? 0 : i + 2;
          if (Math.abs(this.curv[i]) < 0.011) continue;
          const s = this.curv[i] > 0 ? 1 : -1, cc = ((i >> 2) & 1) ? col(0x66f2ff) : col(0xff6ad5);
          const a0 = s * (hwA[i] + 0.1), a1 = s * (hwA[i] + 0.55), b0 = s * (hwA[j] + 0.1), b1 = s * (hwA[j] + 0.55);
          road.quad(this._P(i, a0, 0.05), this._P(i, a0, 1.0), this._P(j, b0, 1.0), this._P(j, b0, 0.05), cc);
          road.quad(this._P(i, a0, 1.0), this._P(i, a1, 1.0), this._P(j, b1, 1.0), this._P(j, b0, 1.0), cc);
          road.quad(this._P(i, a1, 1.0), this._P(i, a1, 0.05), this._P(j, b1, 0.05), this._P(j, b1, 1.0), cc);
        }
      }
      this.roadMesh = this._mesh(road, this._mat({}, star), true);

      // boost pads & jump ramps (flat decals just above the road)
      const pad = new Batch();
      const orange = col(0xff8a00), yellow = col(0xfff25a), blue = col(0x2c6bff), wht = [1, 1, 1];
      for (let k = 0; k < this.nrect; k++) {
        const q = this.rects[k], boost = q.kind === 1;
        const base = boost ? orange : blue, chev = boost ? yellow : wht;
        for (let d = q.d0; d < q.d1 - 0.01; d += 2) {
          const d2 = Math.min(q.d1, d + 2);
          pad.quad(this._PD(d, q.l0, 0.07), this._PD(d, q.l1, 0.07), this._PD(d2, q.l1, 0.07), this._PD(d2, q.l0, 0.07), base);
        }
        const w = q.l1 - q.l0, lc = (q.l0 + q.l1) / 2, h = Math.min(w / 2 - 0.4, 2.2), t = 0.9;
        const n = Math.max(1, Math.floor((q.d1 - q.d0) / 3));
        for (let c = 0; c < n; c++) {
          const dc = q.d0 + 0.5 + c * 3;
          pad.quad(this._PD(dc, q.l0 + 0.4, 0.1), this._PD(dc + h, lc, 0.1), this._PD(dc + h + t, lc, 0.1), this._PD(dc + t, q.l0 + 0.4, 0.1), chev);
          pad.quad(this._PD(dc, q.l1 - 0.4, 0.1), this._PD(dc + h, lc, 0.1), this._PD(dc + h + t, lc, 0.1), this._PD(dc + t, q.l1 - 0.4, 0.1), chev);
        }
        if (!boost) {
          // ramp lip posts
          const post = col(0xffffff);
          const a = this._PD(q.d0, q.l0 - 0.6, 0), b = this._PD(q.d0, q.l1 + 0.6, 0);
          pad.box(a[0], a[1], a[2], 0.5, 2.4, 0.5, 0, post);
          pad.box(b[0], b[1], b[2], 0.5, 2.4, 0.5, 0, post);
        }
      }
      const padMat = this._mat({}, true);
      this.padMesh = this._mesh(pad, padMat, true);
      this._padMat = padMat;
    }

    // shoulders, embankments, walls/fences
    _buildBoundaries(def) {
      const N = this.N, star = this.theme === 'starlight', cfg = this.cfg, theme = this.theme;
      if (star) return;
      const sh = this.shoulder, gy = this.groundY;
      const shC = col(cfg.shoulder), emC = col(cfg.emb), g = new Batch();
      for (let i = 0; i < N; i += 2) {
        const j = i + 2 >= N ? 0 : i + 2, hi = this.hw[i], hj = this.hw[j];
        const shade = ((i >> 3) & 1) ? 1 : 0.94;
        for (let s = -1; s <= 1; s += 2) {
          g.quad(this._P(i, s * hi, -0.01), this._P(i, s * (hi + sh), -0.01), this._P(j, s * (hj + sh), -0.01), this._P(j, s * hj, -0.01), mul(shC, shade));
          const yi = this.py[i] - gy, yj = this.py[j] - gy;
          g.quad(this._P(i, s * (hi + sh), -0.01), this._P(i, s * (hi + sh + EMB), -yi), this._P(j, s * (hj + sh + EMB), -yj), this._P(j, s * (hj + sh), -0.01), emC);
        }
      }
      this.shoulderMesh = this._mesh(g, this._mat({}, false), true);

      // walls / fences
      const w = new Batch();
      const ribbon = (side, o0, o1, y0, y1, step, cf) => {
        for (let i = 0; i < N; i += step) {
          const j = i + step >= N ? 0 : i + step, k = cf(i);
          const li = side * (this.hw[i] + sh + o0), lo = side * (this.hw[i] + sh + o1);
          const mi = side * (this.hw[j] + sh + o0), mo = side * (this.hw[j] + sh + o1);
          w.quad(this._P(i, li, y0), this._P(i, li, y1), this._P(j, mi, y1), this._P(j, mi, y0), k);
          w.quad(this._P(i, li, y1), this._P(i, lo, y1), this._P(j, mo, y1), this._P(j, mi, y1), k);
          w.quad(this._P(i, lo, y1), this._P(i, lo, y0), this._P(j, mo, y0), this._P(j, mo, y1), k);
        }
      };
      for (let s = -1; s <= 1; s += 2) {
        if (theme === 'meadow') {
          const wood = col(0xb8844a), wood2 = col(0xa87438), post = col(0x8a5a2b);
          ribbon(s, 0, 0.14, 0.35, 0.55, 2, (i) => ((i >> 2) & 1 ? wood : wood2));
          ribbon(s, 0, 0.14, 0.8, 1.0, 2, (i) => ((i >> 2) & 1 ? wood : wood2));
          for (let i = 0; i < N; i += 4) {
            const p = this._P(i, s * (this.hw[i] + sh + 0.07), 0);
            w.box(p[0], p[1], p[2], 0.28, 1.15, 0.28, Math.atan2(this.tx[i], this.tz[i]), post);
          }
        } else if (theme === 'dunes') {
          const a = col(0xcf9c5a), b = col(0xb98446);
          ribbon(s, 0, 0.9, 0, 1.1, 6, (i) => (((i / 6) | 0) & 1 ? a : b));
        } else {
          const top = col(0xf6fbff), side = col(0xc4dcee);
          ribbon(s, 0, 1.8, 0, 0.8, 4, (i) => (((i >> 2) & 1) ? top : side));
          ribbon(s, 0, 0.9, 0.8, 1.2, 4, () => top);
        }
      }
      this.wallMesh = this._mesh(w, this._mat({}, false), true);
    }

    _buildGround() {
      const geo = new THREE.PlaneGeometry(6000, 6000);
      geo.rotateX(-Math.PI / 2);
      this._geoms.push(geo);
      const mat = new THREE.MeshLambertMaterial({ color: this.cfg.ground });
      this._mats.push(mat);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(this.px[0], this.groundY, this.pz[0]);
      m.frustumCulled = false;
      this.ground = this._add(m);
    }

    _buildStartArch() {
      const b = new Batch(), f = this._frame(0, {}), star = this.theme === 'starlight';
      const wd = f.halfWidth + (star ? 1 : this.shoulder), h = Math.atan2(f.tx, f.tz);
      const pc = star ? col(0xff6ad5) : col(0xe8383d), pc2 = star ? col(0x6fe6ff) : col(0x2a54c8);
      const dark = col(0x1a1a1a), light = [1, 1, 1];
      for (let s = -1; s <= 1; s += 2) {
        const l = s * (wd + 1.2);
        b.box(f.x + f.rx * l, f.y, f.z + f.rz * l, 1.6, 9, 1.6, h, s < 0 ? pc : pc2);
      }
      const span = 2 * (wd + 1.2), cells = Math.round(span / 1.8), cw = span / cells;
      for (let c = 0; c < cells; c++) {
        const l = -span / 2 + (c + 0.5) * cw;
        for (let r = 0; r < 2; r++) {
          b.box(f.x + f.rx * l, f.y + 9 + r * 0.9, f.z + f.rz * l, cw, 0.9, 1.2, h, ((c + r) & 1) ? dark : light);
        }
      }
      this.arch = this._mesh(b, this._mat({}, false), true);
    }

    // ------------------------------------------------ scenery
    _scatter(count, off0, off1, margin, cb) {
      const rng = this.rng, N = this.N;
      let placed = 0, tries = 0;
      while (placed < count && tries < count * 25) {
        tries++;
        const i = (rng() * N) | 0, side = rng() < 0.5 ? -1 : 1;
        const off = this.hw[i] + this.shoulder + off0 + rng() * (off1 - off0);
        const x = this.px[i] + this.rx[i] * side * off + (rng() - 0.5) * 6;
        const z = this.pz[i] + this.rz[i] * side * off + (rng() - 0.5) * 6;
        if (!this.clear(x, z, margin)) continue;
        cb(x, z, i, rng);
        placed++;
      }
    }
    _farScatter(count, minD, cb) {
      const rng = this.rng;
      let cx = 0, cz = 0, minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
      for (let i = 0; i < this.N; i += 5) {
        cx += this.px[i]; cz += this.pz[i];
        minX = Math.min(minX, this.px[i]); maxX = Math.max(maxX, this.px[i]);
        minZ = Math.min(minZ, this.pz[i]); maxZ = Math.max(maxZ, this.pz[i]);
      }
      let placed = 0, tries = 0;
      while (placed < count && tries < count * 40) {
        tries++;
        const x = minX - 260 + rng() * (maxX - minX + 520), z = minZ - 260 + rng() * (maxZ - minZ + 520);
        if (!this.clear(x, z, minD)) continue;
        cb(x, z, rng); placed++;
      }
    }

    _buildScenery(def, lake) {
      const theme = this.theme, gy = this.groundY, b = new Batch();
      const marginTree = this.shoulder + 15 + EMB * 0.5;   // from centerline: hw ~13 + shoulder + embankment
      const m0 = 13 + this.shoulder + EMB + 3;
      if (lake) this._noGo.push({ x: lake.x, z: lake.z, r: lake.r + 4 });
      const jit = (c, r) => mul(c, 0.88 + r() * 0.24);

      if (theme === 'meadow') {
        this._scatter(260, 2, 70, m0, (x, z, i, r) => {
          const s = 0.8 + r() * 0.8;
          if (r() < 0.35) {
            b.box(x, gy, z, 0.5 * s, 2.0 * s, 0.5 * s, r() * 3, col(0x7a4f2a));
            for (let k = 0; k < 3; k++) b.frustum(x, gy + (1.6 + k * 1.7) * s, z, (2.5 - k * 0.7) * s, 0, 2.6 * s, 7, jit(col(0x2f8f46), r), r());
          } else {
            b.box(x, gy, z, 0.6 * s, 2.4 * s, 0.6 * s, r() * 3, col(0x7a4f2a));
            b.blob(x, gy + 3.7 * s, z, 2.6 * s, 2.3 * s, 2.6 * s, jit(col(0x45b24a), r), 0);
            b.blob(x + 1.1 * s, gy + 3.1 * s, z + 0.5 * s, 1.6 * s, 1.5 * s, 1.6 * s, jit(col(0x58c25a), r), 0);
          }
        });
        this._scatter(120, 1, 45, m0 - 4, (x, z, i, r) => b.blob(x, gy + 0.5, z, 1.2 + r(), 0.9 + r() * 0.5, 1.2 + r(), jit(col(0x3f9f45), r), 0));
        const fl = [col(0xff5a6a), col(0xffe14a), col(0xffffff), col(0xff9ae0)];
        this._scatter(260, 1, 50, m0 - 3, (x, z, i, r) => b.box(x, gy, z, 0.35, 0.5 + r() * 0.3, 0.35, r() * 3, fl[(r() * 4) | 0]));
        this._farScatter(26, 100, (x, z, r) => {
          const s = 25 + r() * 35;
          b.blob(x, gy - 4, z, s * 1.3, s * 0.55, s, jit(col(0x69b848), r), 1);
        });
      } else if (theme === 'dunes') {
        const green = col(0x3f9a4a);
        this._scatter(130, 2, 60, m0, (x, z, i, r) => {
          const s = 0.8 + r() * 0.9, c = jit(green, r);
          b.frustum(x, gy, z, 0.55 * s, 0.45 * s, 3.8 * s, 6, c, 0);
          b.blob(x, gy + 3.8 * s, z, 0.5 * s, 0.4 * s, 0.5 * s, c, 0);
          const side = r() < 0.5 ? -1 : 1;
          b.box(x + side * 0.7 * s, gy + 1.5 * s, z, 0.9 * s, 0.4 * s, 0.4 * s, 0, c);
          b.box(x + side * 1.05 * s, gy + 1.5 * s, z, 0.4 * s, 1.3 * s, 0.4 * s, 0, c);
        });
        this._scatter(110, 2, 70, m0 - 3, (x, z, i, r) => {
          const s = 0.8 + r() * 2.2;
          b.blob(x, gy + 0.3 * s, z, 1.6 * s, 1.0 * s, 1.3 * s, jit(r() < 0.5 ? col(0xb9885a) : col(0x9d7a5a), r), 0);
        });
        const rock = [col(0xc9733f), col(0xd98a4a), col(0xb85f35)];
        this._farScatter(14, 85, (x, z, r) => {
          const R0 = 14 + r() * 14, h = 14 + r() * 22;
          for (let k = 0; k < 3; k++) b.frustum(x, gy + k * h / 3, z, R0 * (1 - k * 0.06), R0 * (1 - (k + 1) * 0.06 - 0.1), h / 3, 8, rock[k], r());
        });
        this._farScatter(5, 130, (x, z, r) => {
          const R0 = 26 + r() * 16;
          b.frustum(x, gy, z, R0, 0, R0 * 1.05, 4, col(0xe7c27d), r());
        });
        this._farScatter(34, 90, (x, z, r) => {
          const s = 30 + r() * 40;
          b.blob(x, gy - 3, z, s * 1.6, s * 0.33, s, mix(col(0xe8c070), col(0xd9a85c), r()), 1);
        });
        // rock arches spanning the road
        const stone = col(0xc27a44), stone2 = col(0xb5693a);
        const fr = {};
        (def.arches || []).forEach((dd) => {
          this._frame(this._dist(dd), fr);
          const wd = fr.halfWidth + this.shoulder + 3, h = Math.atan2(fr.tx, fr.tz);
          for (let s = -1; s <= 1; s += 2) {
            const lx = fr.x + fr.rx * s * wd, lz = fr.z + fr.rz * s * wd;
            b.box(lx, fr.y - 2, lz, 5, 13, 5, h, stone);
            b.box(lx, fr.y + 8, lz, 6, 3, 6, h, stone2);
          }
          const nseg = 7, span = wd * 2 + 5;
          for (let k = 0; k < nseg; k++) {
            const l = -wd + (k / (nseg - 1)) * 2 * wd;
            const yy = fr.y + 11 + Math.sin((k / (nseg - 1)) * Math.PI) * 2.5;
            b.box(fr.x + fr.rx * l, yy, fr.z + fr.rz * l, span / nseg + 1.5, 3, 5, h, k & 1 ? stone : stone2);
          }
        });
      } else if (theme === 'glacier') {
        const snowTop = col(0xffffff);
        this._scatter(250, 2, 70, m0, (x, z, i, r) => {
          const s = 0.8 + r() * 1.0;
          b.box(x, gy, z, 0.5 * s, 1.5 * s, 0.5 * s, 0, col(0x5a3d2a));
          for (let k = 0; k < 3; k++) {
            const r0 = (2.6 - k * 0.7) * s, hh = 2.8 * s, yy = gy + (1.3 + k * 1.8) * s;
            b.frustum(x, yy, z, r0, 0, hh, 7, jit(col(0x1f6b57), r), r());
            b.frustum(x, yy + hh * 0.38, z, r0 * 0.62, 0, hh * 0.62, 7, snowTop, 0);
          }
        });
        this._scatter(90, 1, 60, m0 - 3, (x, z, i, r) => {
          const s = 0.8 + r() * 2.2;
          b.blob(x, gy + 0.3 * s, z, 1.7 * s, 1.2 * s, 1.5 * s, jit(col(0xbfe6ff), r), 0);
        });
        this._scatter(70, 3, 55, m0 - 2, (x, z, i, r) => {
          const s = 1 + r() * 2;
          for (let k = 0; k < 3; k++) b.frustum(x + (k - 1) * s * 0.7, gy, z + (r() - 0.5) * s, 0.5 * s, 0, (2 + r() * 3) * s, 5, jit(col(0x9fd8ff), r), 0);
        });
        this._scatter(10, 2, 20, m0 - 6, (x, z, i, r) => {
          b.blob(x, gy + 0.7, z, 1.0, 0.9, 1.0, [1, 1, 1], 0);
          b.blob(x, gy + 1.7, z, 0.75, 0.7, 0.75, [1, 1, 1], 0);
          b.blob(x, gy + 2.5, z, 0.5, 0.5, 0.5, [1, 1, 1], 0);
          b.box(x - 0.1, gy + 2.45, z + 0.45, 0.14, 0.14, 0.5, 0, col(0xff7a1a));
        });
        this._farScatter(30, 95, (x, z, r) => {
          const s = 25 + r() * 35;
          b.blob(x, gy - 4, z, s * 1.3, s * 0.5, s, mix(col(0xf2f9ff), col(0xd8ebf8), r()), 1);
        });
        if (lake) {
          const geo = new THREE.CircleGeometry(lake.r, 40); geo.rotateX(-Math.PI / 2); this._geoms.push(geo);
          const mat = new THREE.MeshPhongMaterial({ color: 0x9fd8ff, shininess: 120, specular: 0xffffff, flatShading: true, transparent: true, opacity: 0.92 });
          this._mats.push(mat);
          const m = new THREE.Mesh(geo, mat);
          m.position.set(lake.x, gy + 0.08, lake.z);
          this._anim.water = this._add(m);
        }
      } else {
        // starlight: floating rocks and crystals around the ribbon
        const rng = this.rng, cs = [col(0xff7ab8), col(0x6fd8ff), col(0xffd36f), col(0xa98bff), col(0x8cffc0)];
        for (let n = 0; n < 150; n++) {
          const i = (rng() * this.N) | 0, side = rng() < 0.5 ? -1 : 1;
          const off = this.hw[i] + 14 + rng() * 90;
          const x = this.px[i] + this.rx[i] * side * off, z = this.pz[i] + this.rz[i] * side * off;
          if (!this.clear(x, z, 26)) continue;
          const y = this.py[i] + (rng() - 0.5) * 70 - 8, s = 1.5 + rng() * 5;
          if (rng() < 0.5) b.blob(x, y, z, s, s * 0.8, s, mix(col(0x6a5a8a), col(0x9a8ac0), rng()), 0);
          else {
            const c = cs[(rng() * cs.length) | 0];
            b.frustum(x, y, z, s * 0.5, 0, s * 2.2, 5, c, rng());
            b.frustum(x, y - s * 1.2, z, s * 0.5, 0, s * 1.2, 5, mul(c, 0.7), rng());
          }
        }
        // glowing hoops over the road at a few distances
        const fr = {}, ringC = [col(0x66f2ff), col(0xff6ad5), col(0xffe066)];
        for (let k = 0; k < 5; k++) {
          const dd = this.length * (0.14 + k * 0.17);
          this._frame(dd, fr);
          const h = Math.atan2(fr.tx, fr.tz), c = ringC[k % 3], wd = fr.halfWidth + 3;
          for (let a = 0; a < 14; a++) {
            const t0 = (a / 14) * Math.PI;
            const l = Math.cos(t0) * wd, y = fr.y + Math.sin(t0) * 9;
            b.box(fr.x + fr.rx * -l, y, fr.z + fr.rz * -l, 1.1, 1.1, 1.1, h, c);
          }
        }
      }
      const mat = this._mat({}, theme === 'starlight');
      this.sceneryMesh = this._mesh(b, mat, true);

      // meadow lake
      if (theme === 'meadow' && lake) {
        const geo = new THREE.CircleGeometry(lake.r, 40); geo.rotateX(-Math.PI / 2); this._geoms.push(geo);
        const m2 = new THREE.MeshPhongMaterial({ color: 0x3aa7e0, shininess: 90, specular: 0xffffff, flatShading: true, transparent: true, opacity: 0.88 });
        this._mats.push(m2);
        const m = new THREE.Mesh(geo, m2);
        m.position.set(lake.x, gy + 0.08, lake.z);
        this._anim.water = this._add(m);
        // shore ring + reeds
        const sb = new Batch(), rng = this.rng;
        for (let a = 0; a < 26; a++) {
          const an = (a / 26) * Math.PI * 2, rr = lake.r + 1.5 + rng() * 2;
          sb.blob(lake.x + Math.cos(an) * rr, gy, lake.z + Math.sin(an) * rr, 2.5 + rng() * 2, 0.7, 2.5 + rng() * 2, col(0xd8cf93), 0);
          if (rng() < 0.6) sb.frustum(lake.x + Math.cos(an) * (rr - 1), gy, lake.z + Math.sin(an) * (rr - 1), 0.25, 0, 2.2, 4, col(0x3f8f3a), 0);
        }
        this.shoreMesh = this._mesh(sb, this._mat({}, false), true);
      }
    }

    _buildSnow() {
      const n = 650, self = this, rng = this.rng;
      const base = new Float32Array(n * 3), pos = new Float32Array(n * 3);
      for (let i = 0; i < n * 3; i++) base[i] = rng() * 120;
      const g = new THREE.BufferGeometry();
      const attr = new THREE.BufferAttribute(pos, 3); attr.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', attr);
      this._geoms.push(g);
      const m = new THREE.PointsMaterial({ color: 0xffffff, size: 0.42, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false });
      this._mats.push(m);
      const pts = new THREE.Points(g, m);
      pts.frustumCulled = false;
      pts.onBeforeRender = function (renderer, scene, camera) {
        const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, t = self._time;
        const S = 120, H = 50;
        for (let i = 0; i < n; i++) {
          const bx = base[i * 3], by = base[i * 3 + 1], bz = base[i * 3 + 2];
          pos[i * 3] = cx - S / 2 + ((((bx - cx) % S) + S) % S) + Math.sin(t * 0.8 + i) * 0.6;
          pos[i * 3 + 1] = cy - 18 + ((((by - t * 2.4 - cy) % H) + H) % H);
          pos[i * 3 + 2] = cz - S / 2 + ((((bz - cz) % S) + S) % S) + Math.cos(t * 0.7 + i * 1.3) * 0.6;
        }
        attr.needsUpdate = true;
      };
      this.snow = this._add(pts);
    }

    // ------------------------------------------------ per-frame animation
    update(dt, time) {
      this._time = time;
      if (this._padMat) { const k = 0.8 + 0.2 * Math.sin(time * 9); this._padMat.color.setRGB(k, k, k); }
      const w = this._anim.water;
      if (w) {
        w.position.y = this.groundY + 0.08 + Math.sin(time * 1.3) * 0.03;
        w.material.opacity = 0.86 + Math.sin(time * 0.9) * 0.04;
        const s = 1 + Math.sin(time * 0.7) * 0.004; w.scale.set(s, 1, s);
      }
    }

    dispose() {
      for (const o of this._objs) { if (o.parent) o.parent.remove(o); }
      for (const g of this._geoms) g.dispose();
      for (const m of this._mats) m.dispose();
      for (const t of this._tex) t.dispose();
      this._objs.length = 0; this._geoms.length = 0; this._mats.length = 0;
      if (this.hemi && this.hemi.dispose) this.hemi.dispose();
      if (this.sun && this.sun.shadow && this.sun.shadow.map) this.sun.shadow.map.dispose();
      if (this.scene) { this.scene.fog = null; this.scene.background = null; }
    }
  }

  G.Track = Track;
})();
