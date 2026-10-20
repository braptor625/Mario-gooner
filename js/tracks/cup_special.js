// Special Cup (4 courses): Grand Colosseum, Dino Ruins, Lava Fortress, Rainbow Ribbon.
// Registers through G.defineTrack(); all scenery is built with the track kit (merged vertex-coloured batches).
(function () {
  'use strict';
  const G = (window.G = window.G || {});
  if (!G.defineTrack) return;
  const TAU = Math.PI * 2;
  const hash = (a, b) => {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (t) => t * t * (3 - 2 * t);

  // ------------------------------------------------------------ path building
  // Turtle: segments ['S', length] straight, ['A', radius, degrees] arc (+ right, - left).
  // yfn(d) -> height, hwfn(d) -> half width (optional). Returns [[x, z, y, hw], ...] (closed loop).
  function turtle(segs, step, yfn, hwfn) {
    let x = 0, z = 0, h = Math.PI / 2, d = 0;
    const out = [[0, 0, yfn(0), hwfn ? hwfn(0) : undefined]];
    for (const s of segs) {
      if (s[0] === 'S') {
        const n = Math.max(1, Math.round(s[1] / step)), dd = s[1] / n;
        for (let k = 0; k < n; k++) { x += Math.sin(h) * dd; z += Math.cos(h) * dd; d += dd; out.push([x, z, yfn(d), hwfn ? hwfn(d) : undefined]); }
      } else {
        const R = s[1], a = (s[2] * Math.PI) / 180, L = Math.abs(a) * R, n = Math.max(2, Math.round(L / step)), da = a / n;
        for (let k = 0; k < n; k++) {
          const hm = h - da / 2; x += Math.sin(hm) * (L / n); z += Math.cos(hm) * (L / n); h -= da; d += L / n;
          out.push([x, z, yfn(d), hwfn ? hwfn(d) : undefined]);
        }
      }
    }
    const e = out[out.length - 1];
    if (Math.hypot(e[0], e[1]) < 6) out.pop();
    return out;
  }
  // piecewise-linear keyframes [[d, y], ...] smoothed with a box filter of width w
  function keyY(keys, w) {
    const lin = (d) => {
      if (d <= keys[0][0]) return keys[0][1];
      for (let i = 1; i < keys.length; i++) if (d <= keys[i][0]) { const a = keys[i - 1], b = keys[i]; return a[1] + ((b[1] - a[1]) * (d - a[0])) / (b[0] - a[0] || 1); }
      return keys[keys.length - 1][1];
    };
    return (d) => { let s = 0; for (let k = -4; k <= 4; k++) s += lin(d + (k * w) / 8); return s / 9; };
  }

  // ------------------------------------------------------------ build helpers (use inside decorate)
  // flat strip alongside the road between lateral l0..l1 (numbers, or fn(halfWidth))
  function strip(kit, b, d0, d1, l0, l1, dy, c, step) {
    step = step || 2;
    for (let d = d0; d < d1 - 1e-6; d += step) {
      const e = Math.min(d1, d + step), fa = kit.frame(d), fb = kit.frame(e);
      const a0 = typeof l0 === 'function' ? l0(fa.halfWidth) : l0, a1 = typeof l1 === 'function' ? l1(fa.halfWidth) : l1;
      const b0 = typeof l0 === 'function' ? l0(fb.halfWidth) : l0, b1 = typeof l1 === 'function' ? l1(fb.halfWidth) : l1;
      b.quad([fa.x + fa.rx * a0, fa.y + dy, fa.z + fa.rz * a0], [fa.x + fa.rx * a1, fa.y + dy, fa.z + fa.rz * a1],
        [fb.x + fb.rx * b1, fb.y + dy, fb.z + fb.rz * b1], [fb.x + fb.rx * b0, fb.y + dy, fb.z + fb.rz * b0], c);
    }
  }
  // low wall (visual) along one side: `off` metres beyond the road edge
  function wall(kit, b, d0, d1, side, off, h, th, ca, cb, step) {
    step = step || 3;
    for (let d = d0, k = 0; d < d1 - 0.01; d += step, k++) {
      const e = Math.min(d1, d + step), f = kit.frame((d + e) / 2), l = side * (f.halfWidth + off + th / 2);
      b.box(f.x + f.rx * l, f.y - 0.4, f.z + f.rz * l, th, h + 0.4, e - d + 0.12, Math.atan2(f.tx, f.tz), k & 1 ? cb : ca);
    }
  }
  // true when some road runs below (x,z) (more than 3 m under yTop)
  function roadBelow(kit, x, z, yTop, rad) {
    const px = kit.px, py = kit.py, pz = kit.pz, hw = kit.hw;
    for (let i = 0; i < kit.N; i += 2) {
      if (py[i] > yTop - 3) continue;
      const dx = px[i] - x, dz = pz[i] - z, r = hw[i] + rad;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }
  // support columns (+ cross beams) under an elevated road
  function pillars(kit, b, d0, d1, step, o) {
    for (let d = d0; d < d1; d += step) {
      const f = kit.frame(d), top = f.y - 0.5, hgt = top - o.floor;
      if (hgt < 3) continue;
      const hd = Math.atan2(f.tx, f.tz);
      let ok = 0;
      for (let s = -1; s <= 1; s += 2) {
        const l = s * (f.halfWidth + o.off), x = f.x + f.rx * l, z = f.z + f.rz * l;
        if (roadBelow(kit, x, z, top, o.r + 1)) continue;
        b.frustum(x, o.floor, z, o.r * 1.25, o.r, hgt, 8, o.c, 0);
        b.box(x, top - 1.1, z, o.r * 2.9, 1.1, o.r * 2.9, hd, o.c2 || o.c);
        ok++;
      }
      if (ok === 2 && o.beam) b.box(f.x, top - 1.05, f.z, 2 * (f.halfWidth + o.off), 0.9, o.r * 1.5, hd, o.c2 || o.c);
    }
  }
  // rocky/stone tunnel shell lofted along the road
  function tunnel(kit, b, d0, d1, o) {
    const step = o.step || 4, segs = o.segs || 12, pal = o.pal;
    let prev = null, row = 0;
    for (let d = d0; d <= d1 + 0.01; d += step, row++) {
      const f = kit.frame(d), ring = [];
      const W = f.halfWidth + o.w, e = Math.min(1, Math.min(d - d0, d1 - d) / (o.taper || 1));
      const H = o.h * (o.taper ? 0.55 + 0.45 * smooth(e) : 1);
      const pt = (l, y) => [f.x + f.rx * l, f.y + y, f.z + f.rz * l];
      ring.push(pt(W * 1.04, -(o.drop || 6)));
      for (let k = 0; k <= segs; k++) {
        const a = (Math.PI * k) / segs, j = (hash(row, k) - 0.5) * (o.rough || 0);
        ring.push(pt(Math.cos(a) * (W + j) * 1.04, Math.sin(a) * (H + j) + 0.2));
      }
      ring.push(pt(-W * 1.04, -(o.drop || 6)));
      if (prev) for (let k = 0; k < ring.length - 1; k++) {
        const c = pal[(hash(row * 7 + 1, k) * pal.length) | 0], sh = 0.8 + hash(row, k + 31) * 0.3;
        b.quad(prev[k], prev[k + 1], ring[k + 1], ring[k], [c[0] * sh, c[1] * sh, c[2] * sh]);
      }
      prev = ring;
    }
  }
  // blocky tree / big plant etc. helpers
  function disc(b, x, y, z, r0, r1, n, c, ry) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
      b.quad([x + Math.cos(a0) * r0, y, z + Math.sin(a0) * r0], [x + Math.cos(a0) * r1, y, z + Math.sin(a0) * r1],
        [x + Math.cos(a1) * r1, y, z + Math.sin(a1) * r1], [x + Math.cos(a1) * r0, y, z + Math.sin(a1) * r0], c);
    }
  }
  // circular arch (vertical hoop) across the road at distance d, made of n boxes
  function hoop(kit, b, d, r, th, n, c, lift) {
    const f = kit.frame(d), hd = Math.atan2(f.tx, f.tz);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, l = Math.cos(a) * r, y = Math.sin(a) * r + (lift || 0);
      if (y < -1) continue;
      b.box(f.x + f.rx * l, f.y + y, f.z + f.rz * l, th, th, th * 1.6, hd, c);
    }
  }
  // smooth vertical band (arch) across the road at distance d: ring between radii r0..r1, `depth` along the road
  function arcBand(kit, b, d, r0, r1, depth, c, a0, a1, n, lift) {
    const f = kit.frame(d), tx = f.tx * depth / 2, tz = f.tz * depth / 2;
    const P = (r, a, s) => [f.x + f.rx * Math.cos(a) * r + tx * s, f.y + Math.sin(a) * r + (lift || 0), f.z + f.rz * Math.cos(a) * r + tz * s];
    for (let i = 0; i < n; i++) {
      const u0 = a0 + ((a1 - a0) * i) / n, u1 = a0 + ((a1 - a0) * (i + 1)) / n;
      b.quad(P(r0, u0, 1), P(r1, u0, 1), P(r1, u1, 1), P(r0, u1, 1), c);
      b.quad(P(r0, u0, -1), P(r0, u1, -1), P(r1, u1, -1), P(r1, u0, -1), c);
      b.quad(P(r1, u0, 1), P(r1, u0, -1), P(r1, u1, -1), P(r1, u1, 1), c);
      b.quad(P(r0, u0, 1), P(r0, u1, 1), P(r0, u1, -1), P(r0, u0, -1), c);
    }
  }
  // shared simple helpers for hazards
  const mkHazard = (kind, r) => ({ x: 0, y: 0, z: 0, radius: r, hitKind: kind, vx: 0, vz: 0, active: false, object3D: null });
  function sharedMesh(kit, geo, mat) { kit.trackGeom(geo); if (mat) kit.trackMat(mat); return new THREE.Mesh(geo, mat); }
  function batchGeo(kit, b) { const g = b.build(); kit.trackGeom(g); return g; }

  // ------------------------------------------------------------ beauty helpers
  // Atlas-textured quads (signage, banners, painted road decals): everything lands in ONE mesh / draw call.
  // atlas(cols, rows, draw(ctx, cell, x, y, w, h)) paints each cell of a canvas texture.
  function makeAtlas(kit, cols, rows, cw, ch, draw) {
    return kit.makeCanvasTexture(cols * cw, rows * ch, (ctx) => {
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { ctx.save(); ctx.translate(c * cw, r * ch); ctx.beginPath(); ctx.rect(0, 0, cw, ch); ctx.clip(); draw(ctx, r * cols + c, cw, ch); ctx.restore(); }
    });
  }
  class Signs {
    constructor(kit, tex, cols, rows) { this.kit = kit; this.tex = tex; this.cols = cols; this.rows = rows; this.p = []; this.uv = []; this.k = []; this.i = []; this.n = 0; }
    uvr(cell) { const c = cell % this.cols, r = (cell / this.cols) | 0; return [c / this.cols, 1 - (r + 1) / this.rows, (c + 1) / this.cols, 1 - r / this.rows]; }
    // corners: bottom-left, bottom-right, top-right, top-left ([x,y,z]); k = tint [r,g,b]
    quad(a, b, c, d, cell, k) {
      const t = this.uvr(cell); k = k || [1, 1, 1];
      this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
      this.uv.push(t[0], t[1], t[2], t[1], t[2], t[3], t[0], t[3]);
      for (let q = 0; q < 4; q++) this.k.push(k[0], k[1], k[2]);
      const n = this.n; this.i.push(n, n + 1, n + 2, n, n + 2, n + 3); this.n += 4;
    }
    // upright board, bottom-centre (cx,y0,cz), facing direction ry (normal = (sin ry, 0, cos ry)), optional tilt back (rad)
    board(cx, y0, cz, w, h, ry, cell, k, tilt) {
      const s = Math.sin(ry), c = Math.cos(ry), rx = c, rz = -s, hw = w / 2, tl = Math.tan(tilt || 0) * h;
      const P = (l, y, o) => [cx + rx * l - s * o, y0 + y, cz + rz * l - c * o];
      this.quad(P(-hw, 0, 0), P(hw, 0, 0), P(hw, h, tl), P(-hw, h, tl), cell, k);
    }
    // road-conforming decal over d0..d1, lateral l0..l1 (cell v runs forward along the road)
    strip(d0, d1, l0, l1, dy, cell, k, step) {
      step = step || 5; const n = Math.max(1, Math.ceil((d1 - d0) / step)), kit = this.kit;
      for (let j = 0; j < n; j++) {
        const a = d0 + ((d1 - d0) * j) / n, e = d0 + ((d1 - d0) * (j + 1)) / n, t = this.uvr(cell);
        const A = kit.at(a, l0, dy), B = kit.at(a, l1, dy), C = kit.at(e, l1, dy), D = kit.at(e, l0, dy);
        const v0 = t[1] + (t[3] - t[1]) * (j / n), v1 = t[1] + (t[3] - t[1]) * ((j + 1) / n), kk = k || [1, 1, 1];
        this.p.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2], D[0], D[1], D[2]);
        this.uv.push(t[0], v0, t[2], v0, t[2], v1, t[0], v1);
        for (let q = 0; q < 4; q++) this.k.push(kk[0], kk[1], kk[2]);
        const m = this.n; this.i.push(m, m + 1, m + 2, m, m + 2, m + 3); this.n += 4;
      }
    }
    // o: {basic, decal, opacity, fog}
    mesh(o) {
      o = o || {};
      if (!this.n) return null;
      const kit = this.kit, g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.k, 3));
      g.setIndex(this.i); g.computeVertexNormals(); kit.trackGeom(g);
      const mo = { map: this.tex, vertexColors: true, side: THREE.DoubleSide };
      if (o.decal) { mo.transparent = true; mo.depthWrite = false; mo.polygonOffset = true; mo.polygonOffsetFactor = -4; mo.polygonOffsetUnits = -4; }
      if (o.alpha) { mo.transparent = true; mo.alphaTest = 0.04; }
      if (o.additive) { mo.transparent = true; mo.blending = THREE.AdditiveBlending; mo.depthWrite = false; }
      if (o.fog === false) mo.fog = false;
      const m = new THREE.Mesh(g, kit.trackMat(o.basic ? new THREE.MeshBasicMaterial(mo) : new THREE.MeshLambertMaterial(mo)));
      m.frustumCulled = false; if (o.decal) m.renderOrder = 2;
      kit.add(m); return m;
    }
  }
  // soft round glow texture (white centre -> transparent), cached per kit
  function glowTex(kit) {
    return kit._glowT || (kit._glowT = kit.makeCanvasTexture(64, 64, (c) => {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(0.6, 'rgba(255,255,255,0.14)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    }));
  }
  // camera-facing additive glow sprites (lamp halos, braziers, neon bulbs): pts [[x,y,z,hex,sizeMul?]], size in metres
  function glowPoints(kit, pts, size, alpha) {
    if (!pts.length) return null;
    const pos = new Float32Array(pts.length * 3), cc = new Float32Array(pts.length * 3);
    pts.forEach((q, i) => { const c = kit.col(q[3] === undefined ? 0xffc060 : q[3]), m = q[4] || 1; pos.set([q[0], q[1], q[2]], i * 3); cc.set([c[0] * m, c[1] * m, c[2] * m], i * 3); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(cc, 3)); kit.trackGeom(g);
    const m = kit.trackMat(new THREE.PointsMaterial({ size, map: glowTex(kit), vertexColors: true, transparent: true, opacity: alpha === undefined ? 0.85 : alpha, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false }));
    const p = new THREE.Points(g, m); p.frustumCulled = false; kit.add(p); return p;
  }
  // flat additive light pools on the ground / road: list [[x,y,z,r,hex,k]]
  function glowPools(kit, list, segs) {
    if (!list.length) return null;
    segs = segs || 14; const P = [], C = [];
    for (const [x, y, z, r, hexc, k] of list) {
      const c = kit.col(hexc), m = k === undefined ? 1 : k;
      for (let s = 0; s < segs; s++) {
        const a0 = (s / segs) * TAU, a1 = ((s + 1) / segs) * TAU;
        P.push(x, y, z, x + Math.cos(a0) * r, y, z + Math.sin(a0) * r, x + Math.cos(a1) * r, y, z + Math.sin(a1) * r);
        C.push(c[0] * m, c[1] * m, c[2] * m, 0, 0, 0, 0, 0, 0);
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); kit.trackGeom(g);
    const m = new THREE.Mesh(g, kit.trackMat(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })));
    m.frustumCulled = false; m.renderOrder = 3; kit.add(m); return m;
  }
  // fluted column: plinth, tapering shaft, torus-ish rings, flared capital, abacus
  function column(b, x, y, z, h, r, c, c2, sides) {
    sides = sides || 10;
    b.box(x, y, z, r * 2.9, r * 0.55, r * 2.9, 0, c2);
    b.frustum(x, y + r * 0.55, z, r * 1.25, r * 1.1, r * 0.35, sides, c, 0);
    b.frustum(x, y + r * 0.9, z, r * 1.0, r * 0.82, h - r * 2.3, sides, c, 0.2);
    b.frustum(x, y + h - r * 1.4, z, r * 0.95, r * 1.25, r * 0.7, sides, c2, 0);
    b.frustum(x, y + h - r * 0.7, z, r * 1.25, r * 1.5, r * 0.45, sides, c, 0);
    b.box(x, y + h - r * 0.25, z, r * 3.3, r * 0.5, r * 3.3, 0, c2);
  }
  // flat arched opening on a facade plane (outward normal (sin ry, 0, cos ry)): rectangle + half-disc, bottom-centre at (cx,y0,cz)
  function archOpening(b, cx, y0, cz, w, h, ry, c, off) {
    const s = Math.sin(ry), co = Math.cos(ry), rx = co, rz = -s, hw = w / 2, hr = h - hw, o = off || 0.05;
    const P = (l, y) => [cx + rx * l + s * o, y0 + y, cz + rz * l + co * o];
    b.quad(P(-hw, 0), P(hw, 0), P(hw, hr), P(-hw, hr), c);
    const n = 6;
    for (let i = 0; i < n; i++) { const a0 = Math.PI * i / n, a1 = Math.PI * (i + 1) / n; b.tri(P(0, hr), P(Math.cos(a0) * hw, hr + Math.sin(a0) * hw), P(Math.cos(a1) * hw, hr + Math.sin(a1) * hw), c); }
  }

  // =====================================================================================
  // 1. GRAND COLOSSEUM  (DD Wario Colosseum): stadium bowl, spiral ramps up and around, void edges, big jumps
  // =====================================================================================
  const CO = (function () {
    const R = (p) => (p <= 480 ? 82 + 14 * ((p + 90) / 570) : p <= 540 ? 96 + 42 * smooth((p - 480) / 60) : p <= 940 ? 138 : 138 - 56 * smooth((p - 940) / 50));
    const Y = (p) => {
      if (p <= 480) { const u = clamp(((p + 90) / 570 - 0.03) / 0.97, 0, 1); return 22 * u; }
      if (p <= 540) return 22;
      if (p <= 940) return 22 * (1 - (p - 540) / 400);
      return 0;
    };
    const pts = [], phis = [];
    for (let p = -90; p < 990 - 1; ) {
      const r = R(p);
      pts.push([r * Math.cos((p * Math.PI) / 180), r * Math.sin((p * Math.PI) / 180), Y(p), 12]);
      phis.push(p);
      p += ((13 / r) * 180) / Math.PI;
    }
    // exact centre-line distance of control point positions (replicates the engine's spline sampling)
    const n = pts.length, K = 48, M = n * K;
    const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(q[0], q[2], q[1])), true, 'centripetal');
    const cum = new Float64Array(M + 1);
    let px = 0, pz = 0;
    for (let m = 0; m <= M; m++) {
      const q = curve.getPoint(m / M);
      if (m > 0) cum[m] = cum[m - 1] + Math.hypot(q.x - px, q.z - pz);
      px = q.x; pz = q.z;
    }
    const total = cum[M];
    const dAtPhi = (p) => {
      let i = 0; while (i < phis.length - 1 && phis[i + 1] <= p) i++;
      const f = i < phis.length - 1 ? (p - phis[i]) / (phis[i + 1] - phis[i]) : 0;
      const m = (i + f) * K, m0 = Math.floor(m), fr = m - m0;
      return cum[m0] + (cum[Math.min(M, m0 + 1)] - cum[m0]) * fr;
    };
    return { pts, dAtPhi, total };
  })();

  (function () {
    const dp = CO.dAtPhi;
    const GAP1 = dp(468), GAP2 = dp(725);
    const pads = [];
    const padAt = (p, pair) => { const d = dp(p); if (pair) { pads.push({ d, len: 11, l: -6, w: 8 }, { d, len: 11, l: 6, w: 8 }); } else pads.push({ d, len: 11, l: 0, w: 10 }); };
    padAt(-82, true); padAt(40); padAt(150, true); padAt(270); padAt(380, true); padAt(458); padAt(560);
    pads.push({ d: GAP2 - 18, len: 11, l: 0, w: 10 }); padAt(800, true); padAt(870); padAt(925, true);
    G.defineTrack({
      id: 'grand_colosseum', name: 'Grand Colosseum', cup: 'special', order: 1, laps: 2, music: 'colosseum', seed: 1017,
      hw: 12, shoulder: 3, scale: 1, style: 'meadow', noWalls: true, rails: true, ground: false, startArch: true, offroad: 'offroad',
      theme: {
        sky: [0x3c82d8, 0xf1d9a8, 0xe7c488], fog: [0xe8d3a4, 230, 820], ground: 0xd8bd84, shoulder: 0xb99b62,
        road: [0x7b7064, 0x70655a], curb: [0xb7432e, 0xf0e2c0], hemi: [0xfff0d0, 0x9a7a4a, 1.0], sun: [0xfff0d0, 0.9], emb: 0xc9a46a, bg: 0xe8d3a4,
      },
      pts: CO.pts, pads,
      jumps: [{ d: GAP1, len: 3, l: 0, w: 22 }, { d: GAP2, len: 3, l: 0, w: 22 }],
      zones: [{ d: GAP1 + 3, len: 10, l: 0, w: 30, surface: 'void', color: 0x2a1a10 }, { d: GAP2 + 3, len: 10, l: 0, w: 30, surface: 'void', color: 0x2a1a10 }],
      itemRows: [{ d: dp(-40), count: 5 }, { d: dp(120), count: 5, double: true }, { d: dp(330), count: 5 }, { d: dp(560), count: 5 }, { d: dp(640), count: 5, double: true }, { d: dp(780), count: 5 }, { d: dp(900), count: 5 }],
      decorate(track, kit) {
        const col = kit.col, mul = kit.mul, mix = kit.mix, rng = kit.rng, L = kit.length;
        const FL = -42;
        const sand = col(0xd9bf86), sand2 = col(0xcdb078), stone = col(0xe7d3a6), stone2 = col(0xd3bb88), dark = col(0x3b2a1c), gold = col(0xe6b422);
        const b = new kit.Batch();
        // ---- arena floor (the abyss under the road) with concentric bands
        for (let k = 0; k < 8; k++) disc(b, 0, FL, 0, k * 30, (k + 1) * 30, 64, k & 1 ? sand2 : sand, 0);
        disc(b, 0, FL, 0, 240, 330, 64, sand2, 0);
        // ---- stands: tiered bowl with a crowd
        const crowd = [col(0xe8383d), col(0x2a54c8), col(0xffd23f), col(0x3fbf5a), col(0xffffff), col(0xff8a2a), col(0xb05ad8)];
        const TIERS = 10, SEG = 72, qd = [[], [], [], []];   // animated spectators on the odd tiers, one group per quadrant
        for (let k = 0; k < TIERS; k++) {
          const ri = 186 + k * 5.2, ro = ri + 5.2, y0 = FL + 4 + k * 7, y1 = y0 + 7;
          for (let s = 0; s < SEG; s++) {
            const a0 = (s / SEG) * TAU, a1 = ((s + 1) / SEG) * TAU, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
            const rc = (s + k) & 1 ? stone : stone2;
            b.quad([c0 * ri, y0, s0 * ri], [c1 * ri, y0, s1 * ri], [c1 * ri, y1, s1 * ri], [c0 * ri, y1, s0 * ri], rc);
            b.quad([c0 * ri, y1, s0 * ri], [c1 * ri, y1, s1 * ri], [c1 * ro, y1, s1 * ro], [c0 * ro, y1, s0 * ro], mul(rc, 0.92));
          }
          const cnt = Math.floor((TAU * (ri + 2.6)) / 6.2);
          for (let c = 0; c < cnt; c++) {
            const a = (c / cnt) * TAU + hash(k, c) * 0.01, r2 = ri + 2.6;
            if (k & 1) { qd[Math.min(3, (a / TAU * 4) | 0)].push([Math.cos(a) * r2, y1, Math.sin(a) * r2, Math.atan2(-Math.cos(a), -Math.sin(a)), a / TAU]); continue; }
            b.box(Math.cos(a) * r2, y1, Math.sin(a) * r2, 2.2, 1.7 + hash(c, k) * 0.5, 1.8, a + Math.PI / 2, crowd[(hash(c, k + 5) * 7) | 0]);
          }
        }
        qd.forEach((g) => kit.crowd(g, { scale: 2.1, radius: 90, period: 19, woff: 4, waveTime: 11 }));
        // podium wall (arched) between the arena and the stands
        for (let s = 0; s < SEG; s++) {
          const a = ((s + 0.5) / SEG) * TAU, r = 184;
          b.box(Math.cos(a) * r, FL, Math.sin(a) * r, 2.4, 36 - 8, (TAU * r) / SEG + 0.3, -a + Math.PI / 2, s & 1 ? stone : stone2);
          if (s % 2 === 0) b.box(Math.cos(a) * (r - 1.3), FL + 2, Math.sin(a) * (r - 1.3), 0.6, 7, 6, -a + Math.PI / 2, dark);
        }
        // outer wall with arcades, banners and cornice
        const ORW = 242;
        for (let s = 0; s < SEG; s++) {
          const a = ((s + 0.5) / SEG) * TAU, cx = Math.cos(a) * ORW, cz = Math.sin(a) * ORW;
          b.box(cx, FL, cz, 8, 100, (TAU * ORW) / SEG + 0.4, -a + Math.PI / 2, s & 1 ? stone : stone2);
          for (let row = 0; row < 3; row++) b.box(Math.cos(a) * (ORW - 4.2), 30 + row * 10 - 4, Math.sin(a) * (ORW - 4.2), 0.8, 6, 5, -a + Math.PI / 2, dark);
          if (s % 3 === 0) {
            const pc = [col(0xc8302a), col(0x2a54c8), col(0xe6b422)][(s / 3) % 3 | 0];
            b.box(Math.cos(a) * (ORW - 4.4), 14 + 4, Math.sin(a) * (ORW - 4.4), 0.5, 11, 3.2, -a + Math.PI / 2, pc);
          }
        }
        disc(b, 0, 58, 0, 236, 250, 72, mul(stone, 0.95), 0);
        for (let s = 0; s < 36; s++) {
          const a = ((s + 0.5) / 36) * TAU, r = 238;
          b.box(Math.cos(a) * r, 58, Math.sin(a) * r, 0.5, 14, 0.5, 0, col(0xf2e6c6));
          kit.flag(Math.cos(a) * r, 72, Math.sin(a) * r, 4.6, 2.8, -a, [[0xc8302a, 0xf0e2c0], [0x2a54c8, 0xf0e2c0], [0xe6b422, 0xc8302a]][s % 3], { pole: 0.01 });
        }
        // ---- central domed pavilion + fountain
        for (let k = 0; k < 4; k++) disc(b, 0, FL + k * 2, 0, 0, 40 - k * 3, 36, k & 1 ? stone2 : stone, 0);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU, x = Math.cos(a) * 24, z = Math.sin(a) * 24;
          b.frustum(x, FL + 8, z, 2.1, 1.7, 52, 10, stone, 0);
          b.box(x, FL + 8, z, 5, 2, 5, 0, stone2); b.box(x, FL + 59, z, 5, 2.2, 5, 0, stone2);
        }
        disc(b, 0, FL + 61.2, 0, 0, 27.5, 36, stone2, 0);
        b.blob(0, FL + 61, 0, 25, 24, 25, gold, 2);
        b.frustum(0, FL + 80, 0, 1.0, 0.1, 14, 6, gold, 0);
        b.blob(0, FL + 82, 0, 1.6, 1.6, 1.6, col(0xffffff), 1);
        const wcol = col(0x4cc3ff);
        disc(b, 0, FL + 8.4, 0, 0, 17, 32, wcol, 0);
        for (let i = 0; i < 32; i++) { const a = (i / 32) * TAU; b.box(Math.cos(a) * 18, FL + 8, Math.sin(a) * 18, 2, 2.4, 2.2, -a, stone); }
        b.frustum(0, FL + 8, 0, 3.2, 2.4, 30, 8, stone, 0);
        kit.particles({ x: 0, y: FL + 43, z: 0, count: 80, vel: [0, 12, 0], spread: [2.6, 2.4, 2.6], life: 2.6, grav: -14, size: 1.1, alpha: 0.9, pow: 0.5, color: [0xcdf4ff, 0xffffff, 0x9fe6ff] });
        for (let k = 0; k < 3; k++) { b.frustum(0, FL + 24 + k * 6, 0, 9 - k * 2.5, 4 - k, 1.6, 12, stone, 0); b.frustum(0, FL + 25.4 + k * 6, 0, 8 - k * 2.5, 1.2, 4.2, 12, mix(wcol, [1, 1, 1], 0.4), 0); }
        kit.mesh(b);

        // ---- supports under every elevated stretch + edge kerbs + torches + gates
        const sb = new kit.Batch();
        pillars(kit, sb, 0, L, 22, { floor: FL, off: 1.6, r: 1.05, c: col(0xcdb683), c2: col(0xb59d6d), beam: true });
        wall(kit, sb, 0, L, -1, 0.05, 0.35, 0.7, col(0xf0e2c0), col(0xb7432e), 3);
        wall(kit, sb, 0, L, 1, 0.05, 0.35, 0.7, col(0xf0e2c0), col(0xb7432e), 3);
        // road-above test for gates
        const roadAbove = (x, z, y, h) => {
          for (let i = 0; i < kit.N; i += 2) {
            if (kit.py[i] < y + 2 || kit.py[i] > y + h) continue;
            const dx = kit.px[i] - x, dz = kit.pz[i] - z, r = kit.hw[i] + 4;
            if (dx * dx + dz * dz < r * r) return true;
          }
          return false;
        };
        for (const gd of [dp(30), dp(225), dp(520), dp(610), dp(760), dp(880)]) {
          const f = kit.frame(gd), hd = Math.atan2(f.tx, f.tz), wd = f.halfWidth + 3;
          if (roadAbove(f.x, f.z, f.y, 20) || roadAbove(f.x + f.rx * wd, f.z + f.rz * wd, f.y, 20) || roadAbove(f.x - f.rx * wd, f.z - f.rz * wd, f.y, 20)) continue;
          for (let s = -1; s <= 1; s += 2) {
            const x = f.x + f.rx * s * wd, z = f.z + f.rz * s * wd;
            sb.box(x, f.y - 0.5, z, 3.2, 14, 3.2, hd, stone); sb.box(x, f.y + 13, z, 4.2, 1.4, 4.2, hd, gold);
            for (let q = 0; q < 3; q++) sb.box(x + f.rx * s * 0.0, f.y + 2 + q * 4, z, 3.6, 0.5, 3.6, hd, stone2);
          }
          sb.box(f.x, f.y + 14, f.z, 2 * wd + 4, 3, 3.6, hd, stone);
          sb.box(f.x, f.y + 17, f.z, 2 * wd + 1, 1.6, 3.2, hd, gold);
          for (let s = -1; s <= 1; s += 2) kit.flag(f.x + f.rx * s * wd, f.y + 14.7, f.z + f.rz * s * wd, 5, 2.6, hd - Math.PI / 2, s < 0 ? [0xb7432e, 0xe6b422] : [0x2a54c8, 0xe6b422], { pole: 4 });
          sb.box(f.x, f.y + 11.6, f.z, 2 * wd - 4, 2.4, 3.2, hd, col(0xb7432e));
        }
        const tor = [];
        for (let d = 24; d < L; d += 60) {
          const f = kit.frame(d), s = ((d / 60) | 0) & 1 ? 1 : -1, l = s * (f.halfWidth + 1.6);
          sb.box(f.x + f.rx * l, f.y, f.z + f.rz * l, 0.7, 2.2, 0.7, 0, stone2);
          sb.blob(f.x + f.rx * l, f.y + 2.8, f.z + f.rz * l, 0.8, 0.9, 0.8, col(0xff9a2a), 0);
          tor.push([f.x + f.rx * l, f.y + 3.2, f.z + f.rz * l]);
        }
        kit.particles({ emitters: tor, count: 8, vel: [0, 1.8, 0], spread: [0.25, 0.5, 0.25], life: 0.85, size: 1.1, grow: -0.5, alpha: 0.95, color: [0xffa030, 0xffd060, 0xff6a20], additive: true });
        kit.birds({ cx: 0, cz: 0, y: 95, radius: 125, count: 9, speed: 0.09, size: 1.8 });
        for (let s = -1; s <= 1; s += 2) kit.crowdStand({ d0: L - 40, d1: L + 55, side: s, l0: 12 + 1.4, rows: 2, gap: 1.2, rise: 0, step: 2.2, scale: 1.1, radius: 55, colors: [0xe8383d, 0x2a54c8, 0xffd23f, 0x3fbf5a, 0xffffff, 0xb05ad8] });
        // ramp lips + warning chevrons at the two gaps
        for (const gd of [GAP1, GAP2]) for (const [e, dir] of [[gd + 3, 1], [gd + 13, -1]]) {
          const f = kit.frame(e), hd = Math.atan2(f.tx, f.tz);
          sb.box(f.x, f.y - 0.6, f.z, 2 * f.halfWidth + 1.6, 0.6, 1.2, hd, col(0xb7432e));
          for (let s = -1; s <= 1; s += 2) { const l = s * (f.halfWidth + 0.9); sb.box(f.x + f.rx * l, f.y - 0.5, f.z + f.rz * l, 1.4, 4.2, 1.4, hd, gold); }
        }
        kit.mesh(sb);
      },
    });
  })();

  // =====================================================================================
  // 2. DINO RUINS  (DD Dino Dino Jungle): jungle, stomping giant, geysers, rope bridge, cave, waterfall
  // =====================================================================================
  const DR_SEGS = [['S', 79.9], ['A', 56.9, 80.3], ['S', 45], ['A', 49.6, -78.7], ['S', 45.1], ['A', 55.5, 127.2], ['S', 154], ['A', 76.4, -59.3], ['S', 40],
    ['A', 61, 149.1], ['S', 167.9], ['A', 89.6, 74.7], ['S', 90.3], ['A', 65.6, -58.5], ['S', 90.9], ['A', 60.1, 125.2], ['S', 43.1]];
  const DR_Y = keyY([[0, 2], [160, 3], [330, 4], [450, 5], [600, 4], [720, 3], [870, 3.5], [1040, 3.5], [1150, 1.2], [1166, 0.4], [1248, 0.4], [1262, 1.2],
    [1330, 2.5], [1450, 3.5], [1540, 3], [1580, 2]], 60);
  const DR_PTS = turtle(DR_SEGS, 14, DR_Y, () => 11);
  const DR = { dino: 512, rows: [505, 519], geys: [[905, -4.5, 0], [938, 4.5, 2.0], [972, -3, 4.0], [1008, 4, 1.0]], cave: [1046, 1152], bridge: [1160, 1252], fall: 1360, ford: [1336, 1368] };
  const T_STOMP = 4.4, UP_STOMP = 9.5, T_GEY = 6.0;

  function frond(b, x, y, z, a, L, w, c) {
    const ca = Math.cos(a), sa = Math.sin(a), px = -sa * w, pz = ca * w;
    const mx = x + ca * L * 0.5, mz = z + sa * L * 0.5;
    b.quad([x, y, z], [mx + px, y + 0.5, mz + pz], [x + ca * L, y - 1.4, z + sa * L], [mx - px, y + 0.5, mz - pz], c);
  }

  G.defineTrack({
    id: 'dino_ruins', name: 'Dino Ruins', cup: 'special', order: 2, laps: 3, music: 'jungle', seed: 2077,
    hw: 11, shoulder: 3, scale: 1, style: 'meadow', walls: 'none', offroad: 'grass',
    theme: {
      sky: [0x2f9ac8, 0xb9e6c8, 0x7fc27a], fog: [0xa4d8a0, 150, 560], ground: 0x2f6e3a, shoulder: 0x7a6440,
      road: [0x8c7c5f, 0x7f7056], curb: [0x4d7a35, 0xd8cfa6], hemi: [0xe4f6d0, 0x3d6a3a, 0.95], sun: [0xfff3c4, 0.85], emb: 0x3b7d3d, bg: 0xa4d8a0,
    },
    pts: DR_PTS,
    pads: [{ d: 30, len: 11, l: -5, w: 7 }, { d: 30, len: 11, l: 5, w: 7 }, { d: 330, len: 11, l: 0, w: 9 }, { d: 440, len: 11, l: 0, w: 9 },
      { d: 700, len: 11, l: 0, w: 9 }, { d: 880, len: 11, l: -4, w: 7 }, { d: 880, len: 11, l: 4, w: 7 }, { d: 1030, len: 11, l: 0, w: 9 },
      { d: 1270, len: 11, l: 0, w: 9 }, { d: 1420, len: 11, l: 0, w: 9 }, { d: 1500, len: 11, l: -5, w: 7 }, { d: 1500, len: 11, l: 5, w: 7 }],
    jumps: [],
    zones: [
      { d: DR.ford[0], len: DR.ford[1] - DR.ford[0], l: 0, w: 24, surface: 'water' },
      { d: DR.bridge[0], len: DR.bridge[1] - DR.bridge[0], l: -15.2, w: 8, surface: 'void', offroad: true, decal: false },
      { d: DR.bridge[0], len: DR.bridge[1] - DR.bridge[0], l: 15.2, w: 8, surface: 'void', offroad: true, decal: false },
    ],
    itemRows: [{ d: 130, count: 5 }, { d: 350, count: 5, double: true }, { d: 462, count: 5 }, { d: 720, count: 5 }, { d: 880 - 40, count: 5, double: true }, { d: 1100, count: 5 }, { d: 1290, count: 5 }, { d: 1460, count: 5 }],

    decorate(track, kit) {
      const col = kit.col, mul = kit.mul, mix = kit.mix, rng = kit.rng, L = kit.length, gy = kit.groundY;
      const jit = (c, r) => mul(c, 0.86 + r() * 0.28);
      const greens = [col(0x2f8f3c), col(0x3da34a), col(0x1f6f35), col(0x58b84a), col(0x2a7f45)];
      const trunkC = col(0x6a4a2a), palmC = col(0x8a6a3a), stoneC = col(0x8d8a78), stoneD = col(0x6f6d5e), mossC = col(0x5a7d3a), bone = col(0xeee2c2);
      const b = new kit.Batch(), jf = new kit.Batch();   // jf: jungle foliage (wind-swayed)

      // ---- dense jungle
      const M = 17;
      kit.scatter(700, 1, 55, M - 1, (x, z, i, r) => {
        const s = 0.8 + r() * 1.1, tp = r();
        if (tp < 0.45) {
          jf.frustum(x, gy, z, 0.9 * s, 0.5 * s, 6 * s, 6, trunkC, 0);
          jf.blob(x, gy + 7.4 * s, z, 3.9 * s, 2.9 * s, 3.9 * s, jit(greens[(r() * 5) | 0], r), 0);
          jf.blob(x + 2.1 * s, gy + 6.2 * s, z + 1.3 * s, 2.7 * s, 2.1 * s, 2.7 * s, jit(greens[(r() * 5) | 0], r), 0);
          jf.blob(x - 1.7 * s, gy + 6.6 * s, z - 1.0 * s, 2.5 * s, 2.0 * s, 2.5 * s, jit(greens[(r() * 5) | 0], r), 0);
        } else if (tp < 0.8) {
          jf.frustum(x, gy, z, 0.45 * s, 0.3 * s, 9 * s, 5, palmC, 0);
          const a0 = r() * 6;
          for (let k = 0; k < 6; k++) frond(jf, x, gy + 9 * s, z, a0 + (k * TAU) / 6, 4.6 * s, 0.9 * s, jit(greens[(r() * 5) | 0], r));
        } else {
          for (let k = 0; k < 4; k++) jf.blob(x + (r() - 0.5) * 3 * s, gy + 0.9 * s, z + (r() - 0.5) * 3 * s, 1.6 * s, 1.2 * s, 1.6 * s, jit(greens[(r() * 5) | 0], r), 0);
          if (r() < 0.5) jf.box(x, gy + 1.2 * s, z, 0.4, 0.4, 0.4, 0, [col(0xff5a6a), col(0xffe14a), col(0xff9ae0)][(r() * 3) | 0]);
        }
      });
      kit.scatter(40, 2, 40, M - 3, (x, z, i, r) => { const s = 1 + r() * 2.4; b.blob(x, gy + 0.3 * s, z, 1.8 * s, 1.1 * s, 1.5 * s, jit(r() < 0.5 ? stoneC : mossC, r), 0); });
      // giant canopy trees overhanging the road edge (high, never over the lane centre)
      for (let d = 30; d < L; d += 34 + ((d * 7) % 13)) {
        const f = kit.frame(d), s = ((d / 34) | 0) & 1 ? 1 : -1, l = s * (f.halfWidth + 9 + rng() * 5), p = kit.at(d, l, 0);
        if (d > DR.cave[0] - 10 && d < DR.cave[1] + 10) continue;
        if (d > DR.dino - 40 && d < DR.dino + 40) continue;
        jf.frustum(p[0], gy, p[2], 1.8, 1.1, p[1] - gy + 8, 7, trunkC, 0);
        jf.blob(p[0], p[1] + 17, p[2], 8.5, 4.2, 8.5, jit(greens[2], rng), 1);
        jf.blob(p[0] + 4, p[1] + 15, p[2] + 3, 6, 3, 6, jit(greens[0], rng), 0);
        for (let v = 0; v < 3; v++) jf.box(p[0] + (rng() - 0.5) * 9, p[1] + 8, p[2] + (rng() - 0.5) * 9, 0.12, 8 + rng() * 4, 0.12, 0, greens[3]);
      }
      kit.farScatter(22, 160, (x, z, r) => {
        const h = 60 + r() * 90, R0 = 50 + r() * 60, c = mix(col(0x3a7a4a), col(0x5a8f5a), r());
        b.frustum(x, gy - 6, z, R0, R0 * 0.25, h, 7, c, r() * 3);
        b.frustum(x, gy - 6 + h * 0.8, z, R0 * 0.3, 0, h * 0.35, 7, mul(c, 1.15), 0);
      });

      kit.mesh(b);
      kit.foliage(jf, { strength: 0.4, heightScale: 0.14 });
      // ---- stone walls & log fences along the road (bridge stretch left open)
      const wb = new kit.Batch();
      const sh = 3;
      for (const [a, c] of [[0, DR.bridge[0] - 2], [DR.bridge[1] + 2, L]]) for (let s = -1; s <= 1; s += 2) wall(kit, wb, a, c, s, sh, 1.25, 1.0, stoneC, mossC, 3);
      kit.mesh(wb);

      // ---- ancient ruins: stepped temple, broken columns, idol head, fossil rib arches
      const rb = new kit.Batch();
      const placeAt = (d, lat, fn) => { const p = kit.at(d, lat, 0); if (kit.clear(p[0], p[2], 30)) { fn(p[0], p[2], gy); return true; } return false; };
      for (const [d, lat] of [[255, 85], [620, -90], [1420, 90], [200, -80], [760, 95]]) placeAt(d, lat, (x, z, y) => {
        for (let k = 0; k < 5; k++) { rb.box(x, y + k * 5, z, 40 - k * 7, 5.2, 40 - k * 7, 0.2, k & 1 ? stoneC : stoneD); }
        rb.box(x, y + 25, z, 9, 8, 9, 0.2, stoneC); rb.box(x, y + 33, z, 11, 1.8, 11, 0.2, mossC);
        for (let k = 0; k < 6; k++) rb.blob(x + (rng() - 0.5) * 36, y + 3 + rng() * 14, z + (rng() - 0.5) * 36, 3, 2, 3, mossC, 0);
      });
      for (const d of [1470, 1500, 1535, 1565, 30 + 0]) for (let s = -1; s <= 1; s += 2) {
        if (d === 30) continue;
        const f = kit.frame(d), l = s * (f.halfWidth + 6.5), p = kit.at(d, l, 0), h = 4 + hash(d, s) * 8;
        rb.frustum(p[0], p[1] - 1, p[2], 1.5, 1.25, h, 8, stoneC, 0); rb.box(p[0], p[1] - 1 + h, p[2], 3.2, 0.8, 3.2, 0, stoneD);
        if (hash(d, s + 4) < 0.5) rb.blob(p[0] + 1.2, p[1] + h, p[2] - 0.8, 1.2, 0.8, 1.2, mossC, 0);
      }
      // carved idol head
      placeAt(690, -62, (x, z, y) => {
        rb.box(x, y, z, 14, 16, 12, 0.5, stoneC); rb.box(x, y + 16, z, 16, 3, 14, 0.5, stoneD);
        for (const e of [-3.2, 3.2]) { rb.box(x + Math.cos(0.5) * e, y + 11, z - Math.sin(0.5) * e, 3, 2.4, 13, 0.5, col(0x2a2a22)); rb.blob(x + Math.cos(0.5) * e + Math.sin(0.5) * 6.5, y + 11, z - Math.sin(0.5) * e + Math.cos(0.5) * 6.5, 0.9, 0.9, 0.9, col(0xffd23f), 0); }
        rb.box(x + Math.sin(0.5) * 6, y + 4.5, z + Math.cos(0.5) * 6, 8, 2, 1.2, 0.5, col(0x2a2a22));
        rb.box(x, y + 19, z, 6, 4, 6, 0.5, stoneC);
      });
      // fossil rib arches over the road
      for (const rd of [240, 1010]) {
        for (let k = 0; k < 6; k++) { const R0 = 15 - Math.abs(k - 2.5) * 0.7; arcBand(kit, rb, rd + k * 3.4, R0 - 1.0, R0, 0.9, bone, 0, Math.PI, 14, -0.3); }
        for (let k = 0; k <= 4; k++) { const f = kit.frame(rd + k * 3.4 + 1.7), a = 14.4 - Math.abs(k - 2) * 0.8; rb.box(f.x, f.y + a - 0.3, f.z, 1.3, 1.1, 3.5, Math.atan2(f.tx, f.tz), bone); }
      }
      // entry gate to the start straight
      { const f = kit.frame(L - 10), hd = Math.atan2(f.tx, f.tz), wd = f.halfWidth + 5;
        for (let s = -1; s <= 1; s += 2) { const x = f.x + f.rx * s * wd, z = f.z + f.rz * s * wd; rb.box(x, f.y - 1, z, 4, 15, 4, hd, stoneC); rb.box(x, f.y + 14, z, 5, 1.2, 5, hd, stoneD); }
        rb.box(f.x, f.y + 14, f.z, 2 * wd + 2, 3, 4.2, hd, stoneC); rb.box(f.x, f.y + 17, f.z, 2 * wd - 4, 2, 3.6, hd, mossC);
        for (let s = -1; s <= 1; s += 2) kit.flag(f.x + f.rx * s * wd, f.y + 14.6, f.z + f.rz * s * wd, 4.6, 2.6, hd - Math.PI / 2, s < 0 ? [0xd8cfa6, 0x4d7a35] : [0xc8502d, 0xd8cfa6], { pole: 4.2 });
        kit.banner(f.x, f.y + 9.2, f.z, 7, 5, hd, [0x4d7a35, 0xd8cfa6, 0xc8502d], { pattern: 'vstripes' }); }
      for (let s = -1; s <= 1; s += 2) kit.crowdStand({ d0: L - 40, d1: L + 55, side: s, l0: 11 + 1.5, rows: 2, gap: 1.2, rise: 0, step: 2.3, scale: 1.15, radius: 55, colors: [0x8a5a2b, 0x4d7a35, 0xc8502d, 0xd8cfa6, 0x2f78d0], skin: [0xc08a58, 0xa8744a, 0x7ac66a, 0xf6d2b0] });
      { let ccx = 0, ccz = 0, cn = 0; for (let i = 0; i < kit.N; i += 8) { ccx += kit.px[i]; ccz += kit.pz[i]; cn++; }
        kit.birds({ cx: ccx / cn, cz: ccz / cn, y: 78, radius: 170, count: 4, speed: 0.07, size: 3.4, body: 0x6a4a2a, wing: 0xc08a58 });
        kit.birds({ cx: ccx / cn + 120, cz: ccz / cn - 60, y: 58, radius: 100, count: 7, speed: -0.11, size: 1.3, body: 0xd8383d, wing: 0x2f9a3a }); }
      kit.mesh(rb);

      // ---- cave tunnel
      const cb = new kit.Batch();
      const rock = [col(0x5a4a3c), col(0x4a3d32), col(0x6a5a48), col(0x3f352c)];
      tunnel(kit, cb, DR.cave[0], DR.cave[1], { h: 10, w: 4.5, rough: 2.4, pal: rock, drop: 8, taper: 14, segs: 14, step: 4 });
      const gl = new kit.Batch();
      for (let d = DR.cave[0] + 8; d < DR.cave[1] - 6; d += 5.5) {
        const f = kit.frame(d), a = hash(d | 0, 3) * Math.PI, l = Math.cos(a) * (f.halfWidth + 3.2), p = kit.at(d, l, Math.sin(a) * 8.5 + 0.3);
        const cc = hash(d | 0, 9) < 0.5 ? col(0x6ff2d2) : col(0x9a8cff), h = 0.8 + hash(d | 0, 5) * 1.4;
        gl.frustum(p[0], p[1], p[2], 0.3, 0, h, 5, cc, hash(d | 0, 1));
        gl.frustum(p[0], p[1] - h * 0.5, p[2], 0.25, 0, h * 0.6, 5, mul(cc, 0.8), 1);
        if (hash(d | 0, 8) < 0.7) { const q = kit.at(d + 2, -l * 0.9, 9.4 * Math.sin(a) * 0 + 8); cb.frustum(q[0], q[1] - 3.2, q[2], 0.55, 0, 3.4, 6, rock[1], 0); }
      }
      for (const d of [DR.cave[0] + 3, DR.cave[1] - 3]) {
        const f = kit.frame(d), hd = Math.atan2(f.tx, f.tz), wd = f.halfWidth + 4.6;
        for (let s = -1; s <= 1; s += 2) { const x = f.x + f.rx * s * wd, z = f.z + f.rz * s * wd; cb.box(x, f.y - 2, z, 3.2, 8, 3.2, hd, rock[2]); cb.blob(x, f.y + 6.5, z, 2.4, 2, 2.4, mossC, 0); }
      }
      kit.mesh(cb);
      { const gm = kit.mesh(gl, {}, true); if (gm) kit.blinker(gm.material, 3.2, { mode: 'sine', lo: 0.45 }); }   // glow crystals pulse

      // ---- rope bridge over the river
      const bb = new kit.Batch();
      const plank = [col(0x8a5f2d), col(0x76501f), col(0x94683a)];
      for (let d = DR.bridge[0]; d < DR.bridge[1] - 0.3; d += 1.2) {
        const e = d + 1.0, fa = kit.frame(d), fb = kit.frame(e), w = fa.halfWidth + 0.5;
        const k = plank[(((d / 1.2) | 0) * 7) % 3];
        bb.quad([fa.x - fa.rx * w, fa.y + 0.1, fa.z - fa.rz * w], [fa.x + fa.rx * w, fa.y + 0.1, fa.z + fa.rz * w], [fb.x + fb.rx * w, fb.y + 0.1, fb.z + fb.rz * w], [fb.x - fb.rx * w, fb.y + 0.1, fb.z - fb.rz * w], k);
      }
      const rope = col(0xcdb98a), post = col(0x6a4a2a);
      for (let s = -1; s <= 1; s += 2) {
        for (let d = DR.bridge[0]; d <= DR.bridge[1]; d += 6) {
          const f = kit.frame(d), l = s * (f.halfWidth + 0.7);
          bb.box(f.x + f.rx * l, f.y, f.z + f.rz * l, 0.45, 2.2, 0.45, 0, post);
        }
        for (const hh of [0.5, 1.2, 1.9]) wall(kit, bb, DR.bridge[0], DR.bridge[1], s, 0.5, 0.12, 0.14, rope, rope, 3);
      }
      for (const d of [DR.bridge[0] + 1, DR.bridge[1] - 1]) for (let s = -1; s <= 1; s += 2) { const f = kit.frame(d), l = s * (f.halfWidth + 1.4); bb.box(f.x + f.rx * l, f.y - 0.2, f.z + f.rz * l, 1.2, 4.4, 1.2, Math.atan2(f.tx, f.tz), post); bb.blob(f.x + f.rx * l, f.y + 4.6, f.z + f.rz * l, 0.9, 0.9, 0.9, col(0xffd23f), 0); }
      kit.mesh(bb);
      // river under the bridge
      { const wbk = new kit.Batch(), wc = col(0x3a9fd8), wc2 = col(0x5cc0ea), wy = gy + 0.14;
        for (let d = DR.bridge[0] - 14; d < DR.bridge[1] + 14; d += 4) {
          const fa = kit.frame(d), fb = kit.frame(d + 4);
          const e0 = Math.min(1, (d - DR.bridge[0] + 14) / 10, (DR.bridge[1] + 14 - d) / 10), hwid = 46 * Math.max(0.35, e0);
          wbk.quad([fa.x - fa.rx * hwid, wy, fa.z - fa.rz * hwid], [fa.x + fa.rx * hwid, wy, fa.z + fa.rz * hwid], [fb.x + fb.rx * hwid, wy, fb.z + fb.rz * hwid], [fb.x - fb.rx * hwid, wy, fb.z - fb.rz * hwid], ((d / 4) | 0) & 1 ? wc : wc2);
        }
        const wmsh = new THREE.Mesh(kit.trackGeom(wbk.build()), kit.waterMat({ color: 0x3a9fd8, deep: 0x1c6a9c, opacity: 0.9 })); wmsh.frustumCulled = false; kit.add(wmsh); track._drWater = wmsh; }

      // ---- waterfall + pool beside the ford
      { const f = kit.frame(DR.fall), hd = Math.atan2(f.tx, f.tz), s = 1, cl = s * (f.halfWidth + 46);
        const cx = f.x + f.rx * cl, cz = f.z + f.rz * cl, cb2 = new kit.Batch();
        for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU, r0 = 28 + hash(k, 2) * 8; cb2.frustum(cx + Math.cos(a) * r0 * 0.9 + f.rx * 14, gy - 2, cz + Math.sin(a) * r0 * 0.9 + f.rz * 14, 14 + hash(k, 3) * 8, 7, 34 + hash(k, 4) * 12, 7, mix(col(0x6d6a60), col(0x4d6a45), hash(k, 5)), k); }
        cb2.frustum(cx + f.rx * 14, gy - 2, cz + f.rz * 14, 30, 16, 36, 9, col(0x77746a), 1);
        cb2.blob(cx + f.rx * 14, gy + 36, cz + f.rz * 14, 22, 7, 22, mossC, 1);
        kit.mesh(cb2);
        const fx = f.x + f.rx * (f.halfWidth + 22), fz = f.z + f.rz * (f.halfWidth + 22);
        const pg = kit.trackGeom(new THREE.CircleGeometry(19, 24)); pg.rotateX(-Math.PI / 2);
        const pm = kit.waterMat({ color: 0x5cc7ee, opacity: 0.88 });
        const pool = new THREE.Mesh(pg, pm); pool.position.set(fx + f.rx * 6, gy + 0.2, fz + f.rz * 6); kit.add(pool);
        // falling water curtains
        const wm1 = kit.flowMat('water', { speed: [0, 1.7], repeat: [1, 3], opacity: 0.85, fallback: 0xe8f8ff });
        const wm2 = kit.flowMat('water', { speed: [0, 2.5], repeat: [1, 4], opacity: 0.65, color: 0xcfeeff, fallback: 0x9fdcff });
        const topP = f.halfWidth + 31;
        const curt = (dl, w, mat) => {
          const g = new THREE.BufferGeometry(); const y0 = gy + 0.3, y1 = gy + 38;
          const A = kit.at(DR.fall + dl - w / 2, topP, 0), B = kit.at(DR.fall + dl + w / 2, topP, 0);
          g.setAttribute('position', new THREE.Float32BufferAttribute([A[0], y1, A[2], B[0], y1, B[2], B[0], y0, B[2], A[0], y0, A[2]], 3));
          g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
          g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals(); kit.trackGeom(g);
          const m = new THREE.Mesh(g, mat); m.frustumCulled = false; kit.add(m); return m;
        };
        curt(0, 9, wm1); curt(-2.5, 3, wm2); curt(3, 3.5, wm2);
        track._drFall = [wm1, wm2];
        const sp = new kit.Batch();
        for (let k = 0; k < 9; k++) { const q = kit.at(DR.fall + (k - 4) * 1.3, topP - 1.5 - (k % 3) * 1.2, 0); sp.blob(q[0], gy + 1.2 + (k % 2), q[2], 2.2, 1.4, 2.2, [1, 1, 1], 0); }
        kit.mesh(sp, {}, true);
        { const q = kit.at(DR.fall, topP - 2, 0); kit.particles({ x: q[0], y: gy + 1.5, z: q[2], count: 40, vel: [0, 2.6, 0], spread: [3, 1.2, 3], jitter: [5, 0.5, 5], life: 2.3, size: 4.2, grow: 1.6, alpha: 0.4, pow: 1.1, color: [0xffffff, 0xdff6ff] }); }   // spray at the foot of the falls
      }

      // ---- geyser vents on the road, dino body, background dinos
      const vb = new kit.Batch();
      for (const [d, lat] of DR.geys) {
        const p = kit.at(d, lat, 0);
        disc(vb, p[0], p[1] + 0.12, p[2], 0, 3.0, 14, col(0x3a2f26), 0);
        disc(vb, p[0], p[1] + 0.14, p[2], 2.6, 3.4, 14, col(0xd8c68a), 0);
        for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU; vb.blob(p[0] + Math.cos(a) * 3.6, p[1] + 0.3, p[2] + Math.sin(a) * 3.6, 0.6, 0.4, 0.6, col(0xe8dca8), 0); }
      }
      kit.mesh(vb);
      const db = new kit.Batch();
      const skin = col(0x6f9a4a), skin2 = col(0x86ad58), belly = col(0xd8d49a), spot = col(0x4a6a32);
      const dc = (d, lat, y, rx, ry, rz, c) => { const p = kit.at(d, lat, y); db.blob(p[0], p[1], p[2], rx, ry, rz, c, 1); };
      // body
      for (let k = -1; k <= 1; k++) dc(DR.dino + k * 6.5, 0, 25, 11.5, 9, 11.5, k === 0 ? skin2 : skin);
      for (let k = -2; k <= 2; k++) { const p = kit.at(DR.dino + k * 5.2, 0, 34); db.frustum(p[0], p[1], p[2], 1.8, 0, 4.2, 5, col(0x4d7a32), k); }
      for (let k = 0; k < 7; k++) dc(DR.dino - 9 + hash(k, 1) * 19, (hash(k, 2) - 0.5) * 14, 27 + hash(k, 3) * 6, 1.6, 1.2, 1.6, spot);
      // neck sweeping up and out over the left side, head looking down the road (separate mesh: idle sway)
      {
        const piv = kit.at(DR.dino + 12, 0, 27), nk = new kit.Batch();
        const dn = (d, lat, y, rx, ry, rz, c) => { const p = kit.at(d, lat, y); nk.blob(p[0] - piv[0], p[1] - piv[1], p[2] - piv[2], rx, ry, rz, c, 1); };
        for (let k = 0; k < 9; k++) { const t = k / 8, r = 6.5 - t * 3.2; dn(DR.dino + 12 + t * 26, -t * 15, 27 + Math.sin(t * 1.5) * 24 + t * 6, r, r, r, k & 1 ? skin : skin2); }
        const hp = kit.at(DR.dino + 40, -16, 55);
        nk.blob(hp[0] - piv[0], hp[1] - piv[1], hp[2] - piv[2], 6.2, 4.4, 6.8, skin2, 1); dn(DR.dino + 45.5, -16.5, 53.6, 3.6, 2.6, 3.8, skin);
        dn(DR.dino + 40.5, -21.5, 56.5, 1.5, 1.5, 1.5, [1, 1, 1]); dn(DR.dino + 40.5, -10.5, 56.5, 1.5, 1.5, 1.5, [1, 1, 1]);
        dn(DR.dino + 41.7, -21.6, 56.4, 0.8, 0.8, 0.8, [0.05, 0.05, 0.05]); dn(DR.dino + 41.7, -10.4, 56.4, 0.8, 0.8, 0.8, [0.05, 0.05, 0.05]);
        const g = new THREE.Group(); g.position.set(piv[0], piv[1], piv[2]);
        const m = new THREE.Mesh(kit.trackGeom(nk.build()), kit.mat({})); m.frustumCulled = false; g.add(m); kit.add(g);
        kit.sway(g, 'y', 0.13, 0.5, 0); kit.sway(g, 'z', 0.04, 0.9, 1.3);
        // tail swishing
        const tp = kit.at(DR.dino - 13, 0, 22), tk = new kit.Batch();
        for (let k = 0; k < 8; k++) { const t = k / 7, r = 6.2 - t * 4.8, q = kit.at(DR.dino - 13 - t * 34, t * 14, 22 - t * 9); tk.blob(q[0] - tp[0], q[1] - tp[1], q[2] - tp[2], r, r * 0.9, r, k & 1 ? skin : skin2, 1); }
        const tg = new THREE.Group(); tg.position.set(tp[0], tp[1], tp[2]);
        const tm = new THREE.Mesh(kit.trackGeom(tk.build()), kit.mat({})); tm.frustumCulled = false; tg.add(tm); kit.add(tg);
        kit.sway(tg, 'y', 0.1, 0.7, 2);
      }
      // hips (leg tops are hidden inside the body, these are the thighs)
      for (const row of DR.rows) for (const lat of [-7, 0, 7]) dc(row, lat, 19.5, 3.9, 2.6, 3.9, skin);
      kit.mesh(db);
      // distant long-necks for atmosphere
      const fb2 = new kit.Batch();
      kit.farScatter(5, 130, (x, z, r) => {
        const s = 1.3 + r() * 0.9, a = r() * TAU, c = mix(skin, col(0x5a8a4a), r());
        fb2.blob(x, gy + 12 * s, z, 12 * s, 7 * s, 8 * s, c, 1);
        for (let k = 0; k < 7; k++) { const t = k / 6; fb2.blob(x + Math.cos(a) * (8 + t * 12) * s, gy + (14 + t * 22) * s, z + Math.sin(a) * (8 + t * 12) * s, (3.6 - t * 1.6) * s, (3.6 - t * 1.6) * s, (3.6 - t * 1.6) * s, c, 0); }
        fb2.blob(x + Math.cos(a) * 21 * s, gy + 37 * s, z + Math.sin(a) * 21 * s, 3 * s, 2 * s, 2.4 * s, c, 0);
        for (const lx of [-5, 5]) for (const lz of [-3, 3]) fb2.frustum(x + lx * s, gy, z + lz * s, 2.4 * s, 2.0 * s, 10 * s, 6, mul(c, 0.9), 0);
      });
      kit.mesh(fb2);
      track._drAnim = { t: 0 };
    },

    hazards(track, kit) {
      const col = kit.col, out = [];
      // ---- stomping legs
      const lb = new kit.Batch();
      const skin = col(0x6f9a4a), skin2 = col(0x5d8540), toe = col(0xefe5c0);
      lb.frustum(0, 2.2, 0, 2.9, 3.6, 16, 8, skin, 0);
      lb.frustum(0, 2.2, 0, 3.7, 2.9, 1.4, 8, skin2, 0);
      lb.blob(0, 1.5, 0, 4.0, 1.8, 4.0, skin2, 1);
      for (let k = -1; k <= 1; k++) { lb.blob(k * 2.3, 0.9, 3.3, 1.2, 1.0, 1.5, toe, 0); lb.frustum(k * 2.3, 0.4, 4.4, 0.55, 0, 1.2, 4, [0.3, 0.27, 0.2], 0); }
      const legGeo = batchGeo(kit, lb), legMat = kit.mat({});
      const shGeo = kit.trackGeom(new THREE.CircleGeometry(1, 24)); shGeo.rotateX(-Math.PI / 2);
      const shMat = kit.trackMat(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
      const mkLeg = (d, lat, off) => {
        const p = kit.at(d, lat, 0), f = kit.frame(d);
        const g = new THREE.Group(); g.position.set(p[0], p[1], p[2]); g.rotation.y = Math.atan2(f.tx, f.tz);
        const leg = new THREE.Mesh(legGeo, legMat); g.add(leg);
        const sh = new THREE.Mesh(shGeo, shMat); sh.position.y = 0.16; g.add(sh);
        const h = {
          x: p[0], y: p[1], z: p[2], radius: 3.4, hitKind: 'squish', vx: 0, vz: 0, active: false, launchable: false, object3D: g,
          update(dt, time) {
            let u = (time + off) % T_STOMP; if (u < 0) u += T_STOMP;
            let lift = UP_STOMP, sc = 0.35, act = false;
            if (u < 1.2) sc = 0.35 + 0.65 * smooth(clamp((u - 0.2) / 1.0, 0, 1));
            else if (u < 1.5) { const q = (u - 1.2) / 0.3; lift = UP_STOMP * (1 - q * q); sc = 1; act = q > 0.8; }
            else if (u < 2.5) { lift = 0; sc = 1; act = true; }
            else if (u < 3.1) { const q = smooth((u - 2.5) / 0.6); lift = UP_STOMP * q; sc = 1 - q * 0.65; }
            leg.position.y = lift; sh.scale.set(3.4 * sc, 1, 3.4 * sc); this.active = act;
          },
        };
        out.push(h);
      };
      for (let r = 0; r < DR.rows.length; r++) {
        mkLeg(DR.rows[r], -7, 0); mkLeg(DR.rows[r], 7, 0); mkLeg(DR.rows[r], 0, T_STOMP / 2);
      }
      // ---- steam geysers
      const cg = kit.trackGeom(new THREE.CylinderGeometry(0.9, 1.5, 1, 12, 1, true)); cg.translate(0, 0.5, 0);
      const sg = kit.trackGeom(new THREE.SphereGeometry(1, 10, 8));
      const sm = kit.trackMat(new THREE.MeshBasicMaterial({ color: 0xf4fcff, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide }));
      for (const [d, lat, off] of DR.geys) {
        const p = kit.at(d, lat, 0);
        const g = new THREE.Group(); g.position.set(p[0], p[1], p[2]);
        const col1 = new THREE.Mesh(cg, sm), cap = new THREE.Mesh(sg, sm), puff = new THREE.Mesh(sg, sm);
        g.add(col1); g.add(cap); g.add(puff);
        const h = {
          x: p[0], y: p[1], z: p[2], radius: 2.7, hitKind: 'flip', vx: 0, vz: 0, active: false, launchable: false, object3D: g,
          update(dt, time) {
            let u = (time + off) % T_GEY; if (u < 0) u += T_GEY;
            let hh = 0.2 + 0.25 * (0.5 + 0.5 * Math.sin(time * 4 + off)), r = 1, act = false;
            if (u >= 3.0 && u < 4.4) { const q = (u - 3.0) / 1.4; hh = 1.2 + q * 2.4 + 0.4 * Math.sin(time * 18); r = 1.0 + q * 0.4; }
            else if (u >= 4.4 && u < 5.8) { const q = Math.min(1, (u - 4.4) / 0.18), z2 = (u - 4.4) / 1.4; hh = 15 * smooth(q) * (1 - 0.35 * z2 * z2); r = 1.8; act = u > 4.5 && u < 5.7; }
            else if (u >= 5.8) { hh = 2.2 * (1 - (u - 5.8) / 0.2); r = 1.2; }
            col1.scale.set(r, hh, r); cap.position.y = hh; cap.scale.set(r * 1.6, r * 1.1, r * 1.6); puff.position.y = hh * 0.55; puff.scale.set(r * 1.25, hh * 0.18 + 0.1, r * 1.25);
            this.active = act;
          },
        };
        out.push(h);
      }
      return out;
    },

    update(track, dt, time) {
      const f = track._drFall;
      if (f) { f[0].opacity = 0.74 + Math.sin(time * 7) * 0.08; f[1].opacity = 0.55 + Math.sin(time * 5 + 1) * 0.1; }
      if (track._drWater) track._drWater.position.y = Math.sin(time * 1.2) * 0.03;
    },
  });

  // =====================================================================================
  // 3. LAVA FORTRESS  (DD Bowser's Castle): drawbridge, smasher hall, fire bars, lava fireballs, flame statue, final jump
  // =====================================================================================
  const LF_SEGS = [['S', 136.8], ['A', 53.4, 91.8], ['S', 75.3], ['A', 48.8, -59.8], ['S', 60.3], ['A', 44, 160], ['S', 112.7], ['A', 63.4, -77.4], ['S', 45],
    ['A', 50.9, 100.8], ['S', 156.5], ['A', 58.1, 100], ['S', 50.6], ['A', 45.3, -58.7], ['S', 49], ['A', 44, 103.5], ['S', 101.9]];
  const LF_Y = keyY([[0, 3], [137, 3], [222, 3], [298, 3.5], [349, 4], [409, 4.5], [532, 4.5], [644, 4.5], [730, 5], [775, 6], [865, 8], [1021, 8], [1123, 5],
    [1220, 4], [1269, 3.5], [1348, 3], [1450, 3]], 60);
  const LF_HW = (d) => (d < 850 || d > 1040 ? 11 : d < 892 ? 11 - 3.5 * smooth((d - 850) / 42) : d < 998 ? 7.5 : 7.5 + 3.5 * smooth((d - 998) / 42));
  const LF_PTS = turtle(LF_SEGS, 14, LF_Y, LF_HW);
  const LF = {
    bridge: [224, 296], hall: [534, 642], smash: [[556, -6.5, 0], [556, 6.5, 1.7], [590, 0, 0.9], [620, -6.5, 2.6], [620, 6.5, 0.4]],
    statue: 382, bars: [[912, 0, 1.5], [962, 1.2, -1.5]], fire: [[792, 1], [816, -1], [840, 1], [1075, -1], [1100, 1]], gap: 1380,
    open: [[222, 298], [788, 852], [892, 998], [1056, 1122], [1376, 1396]],
  };
  const T_SMASH = 3.4, UP_SMASH = 12;

  G.defineTrack({
    id: 'lava_fortress', name: 'Lava Fortress', cup: 'special', order: 3, laps: 3, music: 'fortress', seed: 3003,
    hw: 11, shoulder: 1.2, scale: 1, walls: 'none', offroad: 'offroad',
    theme: {
      sky: [0x0b0610, 0x2a0a12, 0x5a1608], fog: [0x3a0e08, 110, 470], ground: 0xff5a14, shoulder: 0x3a3238,
      road: [0x575a66, 0x4d505c], curb: [0xd23a1a, 0x2a2a30], hemi: [0xffb090, 0x4a1a10, 0.95], sun: [0xff9a60, 0.65], emb: 0x2e2a30, bg: 0x2a0a08,
    },
    pts: LF_PTS,
    pads: [{ d: 24, len: 11, l: -5.5, w: 7 }, { d: 24, len: 11, l: 5.5, w: 7 }, { d: 305, len: 11, l: 0, w: 9 }, { d: 470, len: 11, l: 0, w: 9 }, { d: 658, len: 11, l: 0, w: 9 },
      { d: 750, len: 11, l: 0, w: 9 }, { d: 868, len: 11, l: 0, w: 7 }, { d: 1030, len: 11, l: 0, w: 8 }, { d: 1190, len: 11, l: 0, w: 9 }, { d: 1350, len: 11, l: -5, w: 7 }, { d: 1350, len: 11, l: 5, w: 7 }],
    jumps: [{ d: LF.gap, len: 3, l: 0, w: 22 }],
    zones: (function () {
      const z = [];
      const side = (d0, d1, hw) => { for (const s of [-1, 1]) z.push({ d: d0, len: d1 - d0, l: s * (hw + 0.3 + 7), w: 14, surface: 'void', color: 0xff6a1a, offroad: true }); };
      side(224, 296, 11); side(790, 850, 11); side(894, 996, 7.5); side(1058, 1120, 11);
      z.push({ d: LF.gap + 3, len: 10, l: 0, w: 30, surface: 'void', color: 0xff5a12 });
      return z;
    })(),
    itemRows: [{ d: 175, count: 5 }, { d: 400, count: 5, double: true }, { d: 520, count: 5 }, { d: 700, count: 5 }, { d: 860, count: 4, double: true }, { d: 1040, count: 5 }, { d: 1200, count: 5, double: true }, { d: 1320, count: 5 }],

    decorate(track, kit) {
      const col = kit.col, mul = kit.mul, mix = kit.mix, rng = kit.rng, L = kit.length, gy = kit.groundY;
      const basalt = col(0x34303a), basalt2 = col(0x45414c), brick = col(0x5a5662), brick2 = col(0x4a4652), lavaC = col(0xff6a1a), gold = col(0xe0a82a), red = col(0x9a1c14);
      const flames = [];   // torch / brazier flame emitters (one particle draw at the end)
      // ---- flowing lava sheet over the ground plane (scrolling molten texture, pulsing glow)
      {
        const lg = kit.trackGeom(new THREE.PlaneGeometry(2600, 2600)); lg.rotateX(-Math.PI / 2);
        const lm = kit.flowMat('lava', { speed: [0.014, 0.009], repeat: [110, 110], color: 0xffd0a0, fallback: 0xff5a14 });
        const lp = new THREE.Mesh(lg, lm); lp.position.set(kit.px[0], gy + 0.05, kit.pz[0]); lp.frustumCulled = false; kit.add(lp);
        kit.blinker(lm, 3.4, { mode: 'sine', lo: 0.78 });
        // heat embers rising off the lava all over the course
        const em = []; for (let k = 0; k < 14; k++) em.push([kit.px[0] + (rng() - 0.5) * 520, gy + 0.3, kit.pz[0] + (rng() - 0.5) * 520]);
        kit.particles({ emitters: em, count: 22, vel: [0.3, 5, 0.2], spread: [0.8, 2.2, 0.8], jitter: [60, 0, 60], life: 5.5, size: 0.9, grow: -0.5, alpha: 0.9, pow: 0.6, wob: 2.2, color: [0xff8a2a, 0xffc040, 0xff5a1a], additive: true });
      }
      // ---- sky: dark gradient dome + volcano silhouettes + embers (drawn over the engine's default backdrop)
      { const geo = kit.trackGeom(new THREE.SphereGeometry(292, 20, 14)), pos = geo.attributes.position, cc = new Float32Array(pos.count * 3);
        const top = col(0x07040c), mid = col(0x24080e), bot = col(0x7a2208);
        for (let i = 0; i < pos.count; i++) { const v = pos.getY(i) / 292, c = v >= 0 ? mix(mid, top, Math.pow(v, 0.5)) : mix(mid, bot, Math.min(1, -v * 2.5)); cc.set(c, i * 3); }
        geo.setAttribute('color', new THREE.BufferAttribute(cc, 3));
        const m = new THREE.Mesh(geo, kit.trackMat(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, depthTest: false })));
        m.renderOrder = -995; kit.follow(m); kit.add(m);
        const vb = new kit.Batch();
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * TAU + rng() * 0.3, h = 50 + rng() * 70, r0 = 55 + rng() * 40, x = Math.cos(a) * 275, z = Math.sin(a) * 275;
          vb.frustum(x, -20, z, r0, 7 + rng() * 5, h, 7, mix(col(0x1a1216), col(0x2c1a1a), rng()), rng() * 3);
          vb.frustum(x, -20 + h - 2, z, 8 + rng() * 4, 6, 4, 7, col(0xff6a1a), 0);
        }
        vb.blob(-120, 140, 210, 22, 22, 22, col(0xffb070), 1);
        const m2 = kit.mesh(vb, { fog: false, depthWrite: false }, true); m2.renderOrder = -994; kit.follow(m2);
        // embers rising around the camera
        const n = 260, base = new Float32Array(n * 3), pos2 = new Float32Array(n * 3);
        for (let i = 0; i < n * 3; i++) base[i] = rng() * 100;
        const g2 = kit.trackGeom(new THREE.BufferGeometry()), pa = new THREE.BufferAttribute(pos2, 3); pa.setUsage(THREE.DynamicDrawUsage); g2.setAttribute('position', pa);
        const em = new THREE.Points(g2, kit.trackMat(new THREE.PointsMaterial({ color: 0xff8a2a, size: 0.55, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })));
        em.frustumCulled = false;
        em.onBeforeRender = function (renderer, scene, camera) {
          const cx = track.mirror ? -camera.position.x : camera.position.x, cy = camera.position.y, cz = camera.position.z, t = track._time, S = 100, H = 40;
          for (let i = 0; i < n; i++) {
            pos2[i * 3] = cx - S / 2 + ((((base[i * 3] + Math.sin(t * 0.7 + i) * 2 - cx) % S) + S) % S);
            pos2[i * 3 + 1] = cy - 12 + ((((base[i * 3 + 1] + t * (2.2 + (i % 5) * 0.6) - cy) % H) + H) % H);
            pos2[i * 3 + 2] = cz - S / 2 + ((((base[i * 3 + 2] + Math.cos(t * 0.6 + i * 1.7) * 2 - cz) % S) + S) % S);
          }
          pa.needsUpdate = true;
        };
        kit.add(em);
      }
      // ---- crenellated walls and kerbs
      const wb = new kit.Batch();
      const open = LF.open;
      const inOpen = (d) => open.some((o) => d >= o[0] - 3 && d <= o[1] + 3);
      for (let d = 0; d < L - 2; d += 2.4) {
        const k = (d / 2.4) | 0;
        for (let s = -1; s <= 1; s += 2) {
          const f = kit.frame(d + 1.2), l = s * (f.halfWidth + 1.2 + 0.6), hd = Math.atan2(f.tx, f.tz);
          if (inOpen(d)) { // low stone kerb on the open (lava) edges
            const lk = s * (f.halfWidth + 0.15);
            wb.box(f.x + f.rx * lk, f.y - 0.2, f.z + f.rz * lk, 0.7, 0.65, 2.5, hd, k & 1 ? brick : red);
          } else {
            wb.box(f.x + f.rx * l, f.y - 0.4, f.z + f.rz * l, 1.2, 1.4, 2.5, hd, k & 1 ? brick : brick2);
            if (k % 2 === 0) wb.box(f.x + f.rx * l, f.y + 1.0, f.z + f.rz * l, 1.3, 0.9, 1.3, hd, brick2);
          }
        }
      }
      kit.mesh(wb);

      // ---- drawbridge with gatehouses
      const bb = new kit.Batch(), wood = [col(0x5a3a20), col(0x4a2e18), col(0x6a4426)];
      for (let d = LF.bridge[0]; d < LF.bridge[1] - 0.3; d += 1.5) {
        const e = d + 1.3, fa = kit.frame(d), fb = kit.frame(e), w = fa.halfWidth + 0.8, k = wood[(((d / 1.5) | 0) * 5) % 3];
        bb.quad([fa.x - fa.rx * w, fa.y + 0.12, fa.z - fa.rz * w], [fa.x + fa.rx * w, fa.y + 0.12, fa.z + fa.rz * w], [fb.x + fb.rx * w, fb.y + 0.12, fb.z + fb.rz * w], [fb.x - fb.rx * w, fb.y + 0.12, fb.z - fb.rz * w], k);
      }
      for (let s = -1; s <= 1; s += 2) wall(kit, bb, LF.bridge[0], LF.bridge[1], s, 0.7, 0.35, 0.5, col(0x2a2a30), col(0x3a3a42), 3);
      for (let s = -1; s <= 1; s += 2) for (let d = LF.bridge[0] + 8; d < LF.bridge[1] - 4; d += 16) {
        const f = kit.frame(d), l = s * (f.halfWidth + 1.2);
        bb.box(f.x + f.rx * l, f.y, f.z + f.rz * l, 0.7, 4.5, 0.7, 0, col(0x2a2a30));
        const p = kit.at(d + 8, l, 4.2); bb.box(p[0], p[1], p[2], 0.35, 0.35, 16, Math.atan2(f.tx, f.tz), col(0x6a6a74));
      }
      const tower = (d, s, sy) => {
        const f = kit.frame(d), l = s * (f.halfWidth + 8), p = kit.at(d, l, 0);
        bb.frustum(p[0], p[1] - 6, p[2], 7.5, 6.5, 8 + sy + 6, 10, brick, 0.3);
        bb.frustum(p[0], p[1] + 8 + sy, p[2], 8.2, 8.2, 1.8, 10, brick2, 0.3);
        for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; bb.box(p[0] + Math.cos(a) * 7.6, p[1] + 9.8 + sy, p[2] + Math.sin(a) * 7.6, 1.8, 1.6, 1.8, -a, brick); }
        bb.frustum(p[0], p[1] + 8.5 + sy, p[2], 6.4, 0, 9, 10, red, 0);
        bb.frustum(p[0], p[1] + 17.4 + sy, p[2], 0.15, 0.15, 4, 4, col(0xcccccc), 0);
        kit.flag(p[0], p[1] + 21.4 + sy, p[2], 4.2, 2.2, (d * 0.37) % 6.28, [0xc8201a, 0x2a2a30], { pole: 0.01 });
        const w2 = kit.at(d - s * 0, l - s * 7.4, 5); bb.box(w2[0], w2[1], w2[2], 1.6, 1.4, 1.6, 0, col(0xffb040));
      };
      for (const dd of [LF.bridge[0] - 4, LF.bridge[1] + 4]) { tower(dd, -1, 0); tower(dd, 1, 0); }
      for (const dd of [LF.bridge[0] - 4, LF.bridge[1] + 4]) {
        const f = kit.frame(dd), hd = Math.atan2(f.tx, f.tz), wd = f.halfWidth + 3.2;
        bb.box(f.x, f.y + 11, f.z, 2 * wd + 2, 3.4, 3.4, hd, brick2);
        for (let k = -3; k <= 3; k++) bb.box(f.x + f.rx * k * 3.2, f.y + 14.4, f.z + f.rz * k * 3.2, 1.8, 1.4, 1.8, hd, brick);
        bb.box(f.x, f.y + 9.9, f.z, 2 * wd - 4, 1, 3, hd, col(0x2a2a30));
      }
      kit.mesh(bb);

      // ---- castle hall (stone vault with pillars, torches and banners)
      const hb = new kit.Batch(), tb = new kit.Batch();
      tunnel(kit, hb, LF.hall[0], LF.hall[1], { h: 17, w: 3.5, rough: 0.0, pal: [col(0x3c3a46), col(0x34323d), col(0x45424f)], drop: 8, taper: 8, segs: 12, step: 4 });
      for (let d = LF.hall[0] + 8; d < LF.hall[1]; d += 16) for (let s = -1; s <= 1; s += 2) {
        const f = kit.frame(d), l = s * (f.halfWidth + 2.6), p = kit.at(d, l, 0), hd = Math.atan2(f.tx, f.tz);
        hb.box(p[0], p[1] - 1, p[2], 2.6, 16, 2.6, hd, brick); hb.box(p[0], p[1] + 14.6, p[2], 3.4, 1.2, 3.4, hd, brick2);
        tb.box(p[0] - f.rx * s * 1.7, p[1] + 5, p[2] - f.rz * s * 1.7, 0.5, 0.9, 0.5, 0, col(0x222222));
        tb.blob(p[0] - f.rx * s * 1.7, p[1] + 6.2, p[2] - f.rz * s * 1.7, 0.6, 0.9, 0.6, col(0xffa030), 0);
        flames.push([p[0] - f.rx * s * 1.7, p[1] + 6.8, p[2] - f.rz * s * 1.7]);
        const q = kit.at(d + 8, s * (f.halfWidth + 1.8), 12); kit.banner(q[0], q[1] - 4, q[2], 2.6, 8, hd - Math.PI / 2, s < 0 ? [0x9a1c14, 0xe0a82a] : [0x20203a, 0xe0a82a], { pattern: 'vstripes', amp: 0.18 });
      }
      for (const dd of [LF.hall[0] + 1, LF.hall[1] - 1]) {
        const f = kit.frame(dd), hd = Math.atan2(f.tx, f.tz), wd = f.halfWidth + 4;
        for (let s = -1; s <= 1; s += 2) { const x = f.x + f.rx * s * wd, z = f.z + f.rz * s * wd; hb.box(x, f.y - 2, z, 3.4, 15, 3.4, hd, brick); }
        hb.box(f.x, f.y + 13, f.z, 2 * wd + 3, 3, 3.6, hd, brick2);
        for (let k = -3; k <= 3; k++) hb.box(f.x + f.rx * k * 4, f.y + 15.3, f.z + f.rz * k * 4, 2.4, 1.6, 2.4, hd, brick);
      }
      kit.mesh(hb); kit.mesh(tb, {}, true);

      // ---- flame-spitting dragon idol
      const sb = new kit.Batch(), sd = LF.statue;
      { const f = kit.frame(sd), hd = Math.atan2(f.tx, f.tz), base = f.halfWidth + 14, S = (dd, lat, y) => kit.at(sd + dd, base + lat, y);
        const bx = (dd, lat, y, sx, sy, sz, c) => { const p = S(dd, lat, y); sb.box(p[0], p[1], p[2], sx, sy, sz, hd, c); };
        bx(0, 0, -4, 20, 4, 22, basalt2); bx(0, 0, -0.5, 16, 3, 18, basalt);
        bx(0, 6, 2.5, 12, 20, 14, basalt);               // torso (leans away from the road)
        bx(-7.5, 5, 4, 3.4, 11, 4, basalt2); bx(7.5, 5, 4, 3.4, 11, 4, basalt2); // arms
        bx(-9.5, 5, 0.5, 5, 2.4, 5, brick2); bx(9.5, 5, 0.5, 5, 2.4, 5, brick2);
        bx(0, 0.6, 22, 9, 8, 9, basalt2);               // head
        bx(0, -4.4, 19, 8, 2.6, 7, basalt);              // jaw (towards road)
        bx(0, -5.4, 22.2, 3.6, 2.4, 5, col(0xff7a20));   // glowing maw
        for (const e of [-2.6, 2.6]) { bx(e, -4.2, 25.2, 1.8, 1.5, 0.8, col(0xff3a10)); }
        for (const e of [-1, 1]) { const p = S(e * 4.2, 1, 30); sb.frustum(p[0], p[1] - 3, p[2], 1.5, 0, 6, 6, brick, 0); }
        for (const e of [-3.4, -1.1, 1.1, 3.4]) { const p = S(e, -4.8, 18.4); sb.frustum(p[0], p[1], p[2], 0.5, 0, 1.4, 4, col(0xe8e0d0), 0); }
        const p = S(0, 8, 14); sb.frustum(p[0], p[1], p[2], 5, 1.5, 12, 8, basalt2, 0.2); // wings/ridge
        const pl = S(0, 0, 0); track._lfMouth = S(0, -5.4, 22.2);
      }
      kit.mesh(sb);
      // lava pits / braziers beside the statue
      const bz = new kit.Batch();
      for (const dd of [-14, 14]) { const p = kit.at(sd + dd, kit.frame(sd).halfWidth + 3.5, 0); bz.frustum(p[0], p[1] - 0.6, p[2], 1.0, 1.5, 2.2, 6, basalt2, 0); bz.blob(p[0], p[1] + 2.4, p[2], 1.3, 1.5, 1.3, col(0xff7a1a), 0); flames.push([p[0], p[1] + 3.2, p[2]]); }
      if (track._lfMouth) flames.push([track._lfMouth[0], track._lfMouth[1], track._lfMouth[2]]);
      kit.mesh(bz, {}, true);

      // ---- central keep + corner towers (inside the loop)
      const kb = new kit.Batch();
      let cx = 0, cz = 0, cn = 0;
      for (let i = 0; i < kit.N; i += 8) { cx += kit.px[i]; cz += kit.pz[i]; cn++; }
      cx /= cn; cz /= cn;
      const kp = [[cx, cz, 1.0]];
      let best = null, bd = -1;
      for (let x = cx - 90; x <= cx + 90; x += 10) for (let z = cz - 90; z <= cz + 90; z += 10) { let m = 1e9; for (let i = 0; i < kit.N; i += 4) m = Math.min(m, Math.hypot(x - kit.px[i], z - kit.pz[i])); if (m > bd) { bd = m; best = [x, z]; } }
      const kxz = best, kg = gy - 1, kr = Math.min(40, bd - 24);
      if (kr > 12) {
        const [kx, kz] = kxz;
        kb.frustum(kx, kg, kz, kr, kr * 0.85, 30, 10, brick, 0.1);
        for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; kb.box(kx + Math.cos(a) * kr * 0.84, kg + 30, kz + Math.sin(a) * kr * 0.84, 4, 3, 4, -a, brick2); }
        kb.frustum(kx, kg + 30, kz, kr * 0.62, kr * 0.55, 26, 10, brick2, 0.2);
        kb.frustum(kx, kg + 56, kz, kr * 0.7, 0, kr * 0.9, 10, red, 0.2);
        kb.frustum(kx, kg + 56 + kr * 0.9, kz, 0.3, 0.3, 8, 4, col(0xcccccc), 0);
        kb.box(kx + 2.2, kg + 62 + kr * 0.9, kz, 4.4, 2.6, 0.2, 0, col(0xc8201a));
        for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.8, tx = kx + Math.cos(a) * kr * 0.95, tz = kz + Math.sin(a) * kr * 0.95;
          kb.frustum(tx, kg, tz, 6, 5.4, 44, 8, brick, 0); kb.frustum(tx, kg + 44, tz, 7.2, 0, 14, 8, red, 0); }
        for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; kb.box(kx + Math.cos(a) * kr * 0.6, kg + 12, kz + Math.sin(a) * kr * 0.6, 2.4, 2.4, 0.4, -a, col(0xff9a30)); }
      }
      // spiky obsidian rocks standing in the lava
      kit.scatter(110, 2, 60, 15, (x, z, i, r) => { const h = 2 + r() * 9, w = 1.5 + r() * 3; kb.frustum(x, gy - 1, z, w, w * 0.2, h, 5, mix(basalt, basalt2, r()), r() * 3); if (r() < 0.4) kb.blob(x, gy + 0.2, z, w * 1.8, 0.5, w * 1.8, lavaC, 0); });
      kit.farScatter(16, 120, (x, z, r) => { const h = 25 + r() * 40, w = 14 + r() * 18; kb.frustum(x, gy - 4, z, w, w * 0.25, h, 6, basalt, r() * 3); kb.frustum(x, gy - 4 + h, z, w * 0.25, 0, 5, 6, lavaC, 0); });
      kit.mesh(kb);
      // ---- torches along the course
      const tb2 = new kit.Batch(), tb3 = new kit.Batch();
      for (let d = 18; d < L - 10; d += 38) {
        if (inOpen(d) || (d > LF.hall[0] - 6 && d < LF.hall[1] + 6)) continue;
        const f = kit.frame(d), s = ((d / 38) | 0) & 1 ? 1 : -1, l = s * (f.halfWidth + 1.8);
        tb2.box(f.x + f.rx * l, f.y, f.z + f.rz * l, 0.9, 3.3, 0.9, 0, basalt2); tb2.box(f.x + f.rx * l, f.y + 3.3, f.z + f.rz * l, 1.5, 0.5, 1.5, 0, basalt);
        tb3.blob(f.x + f.rx * l, f.y + 4.3, f.z + f.rz * l, 0.7, 1.1, 0.7, col(0xffb030), 0);
        flames.push([f.x + f.rx * l, f.y + 4.9, f.z + f.rz * l]);
      }
      kit.mesh(tb2); kit.mesh(tb3, {}, true);
      // ---- final jump: crumbled lips + ember posts
      const jb = new kit.Batch();
      for (const e of [LF.gap + 3, LF.gap + 13]) { const f = kit.frame(e), hd = Math.atan2(f.tx, f.tz); jb.box(f.x, f.y - 0.5, f.z, 2 * f.halfWidth + 1.6, 0.7, 1.3, hd, red);
        for (let s = -1; s <= 1; s += 2) { const l = s * (f.halfWidth + 0.9); jb.box(f.x + f.rx * l, f.y - 0.5, f.z + f.rz * l, 1.5, 5, 1.5, hd, basalt2); jb.blob(f.x + f.rx * l, f.y + 5.4, f.z + f.rz * l, 0.9, 0.9, 0.9, col(0xff8a2a), 0); } }
      kit.mesh(jb);
      kit.particles({ emitters: flames, count: 7, vel: [0, 2.0, 0], spread: [0.25, 0.6, 0.25], life: 0.85, size: 1.3, grow: -0.5, alpha: 0.95, color: [0xffa030, 0xffd060, 0xff6a20], additive: true });
      // smoke from the keep and a smouldering crater plume
      if (kr > 12) kit.particles({ x: kxz[0], y: kg + 56 + kr * 0.9, z: kxz[1], count: 22, vel: [3, 5, 1], spread: [1, 1.2, 1], life: 8, size: 12, grow: 2.2, alpha: 0.45, pow: 1.1, wob: 3, color: [0x2a2630, 0x3a3640, 0x4a4650] });
      // fire-bar pivots
      const pb = new kit.Batch();
      for (const [d] of LF.bars) { const p = kit.at(d, 0, 0); pb.frustum(p[0], p[1], p[2], 1.2, 1.0, 1.5, 8, basalt2, 0); }
      kit.mesh(pb);
      track._lfAnim = { ground: track.ground };
    },

    hazards(track, kit) {
      const col = kit.col, out = [];
      const dummy = new THREE.Object3D();
      // ---- smashers
      const sbt = new kit.Batch(), stone = col(0x4b4854), stone2 = col(0x3a3742);
      sbt.box(0, 0.9, 0, 8, 6.4, 8, 0, stone);
      sbt.box(0, 7.3, 0, 8.8, 1.0, 8.8, 0, stone2);
      sbt.box(0, 0.9, 0, 8.6, 1.0, 8.6, 0, stone2);
      for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3], [0, 0]]) sbt.frustum(x, 0, z, 0.05, 0.9, 0.9, 5, [0.75, 0.75, 0.8], 0);
      for (const e of [-2, 2]) { sbt.box(e, 4.5, 4.02, 1.7, 1.1, 0.3, 0, [1, 0.15, 0.08]); sbt.box(e, 5.1, 4.1, 2.2, 0.35, 0.3, 0.0, [0.1, 0.1, 0.12]); }
      sbt.box(0, 2.6, 4.02, 4.6, 1.0, 0.3, 0, [0.08, 0.08, 0.1]);
      for (let k = -2; k <= 2; k++) sbt.box(k * 0.9, 2.5, 4.2, 0.4, 0.8, 0.3, 0, [0.9, 0.9, 0.85]);
      const smGeo = batchGeo(kit, sbt), smMat = kit.mat({});
      const shGeo = kit.trackGeom(new THREE.PlaneGeometry(1, 1)); shGeo.rotateX(-Math.PI / 2);
      const shMat = kit.trackMat(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
      for (const [d, lat, off] of LF.smash) {
        const p = kit.at(d, lat, 0), f = kit.frame(d), hd = Math.atan2(f.tx, f.tz);
        const g = new THREE.Group(); g.position.set(p[0], p[1], p[2]); g.rotation.y = hd + Math.PI;
        const blk = new THREE.Mesh(smGeo, smMat); g.add(blk);
        const sh = new THREE.Mesh(shGeo, shMat); sh.position.y = 0.16; g.add(sh);
        out.push({
          x: p[0], y: p[1], z: p[2], radius: 4.4, hitKind: 'squish', vx: 0, vz: 0, active: false, launchable: false, object3D: g,
          update(dt, time) {
            let u = (time + off) % T_SMASH; if (u < 0) u += T_SMASH;
            let lift = UP_SMASH, sc = 0.45, act = false;
            if (u < 1.3) sc = 0.45 + 0.55 * smooth(clamp((u - 0.3) / 1.0, 0, 1));
            else if (u < 1.5) { const q = (u - 1.3) / 0.2; lift = UP_SMASH * (1 - q * q); sc = 1; act = q > 0.75; }
            else if (u < 2.3) { lift = 0; sc = 1; act = true; }
            else if (u < 2.9) { const q = smooth((u - 2.3) / 0.6); lift = UP_SMASH * q; sc = 1 - q * 0.55; }
            blk.position.y = lift; sh.scale.set(8.4 * sc, 1, 8.4 * sc); this.active = act;
          },
        });
      }
      // ---- fire bars (instanced beads)
      const bead = kit.trackGeom(new THREE.SphereGeometry(1, 8, 6));
      const beadMat = kit.trackMat(new THREE.MeshBasicMaterial({ color: 0xff7a1a }));
      const nBeads = LF.bars.length * 6;
      const beads = new THREE.InstancedMesh(bead, beadMat, nBeads); beads.frustumCulled = false; kit.add(beads);
      const armB = new kit.Batch(); armB.box(0, 0.7, 0, 15, 0.45, 0.45, 0, [0.35, 0.33, 0.38]); armB.blob(0, 0.9, 0, 1.1, 1.1, 1.1, [0.3, 0.3, 0.34], 0);
      const armGeo = batchGeo(kit, armB), armMat = kit.mat({});
      let bi = 0;
      for (const [d, ph, w] of LF.bars) {
        const p = kit.at(d, 0, 0), arm = new THREE.Mesh(armGeo, armMat); arm.position.set(p[0], p[1] + 0.9, p[2]); kit.add(arm);
        for (const r of [-6.6, -4.4, -2.2, 2.2, 4.4, 6.6]) {
          const idx = bi++;
          out.push({
            x: p[0], y: p[1] + 1.0, z: p[2], radius: 1.35, hitKind: 'spin', vx: 0, vz: 0, active: true, launchable: false, object3D: null,
            update(dt, time) {
              const th = ph + time * w, c = Math.cos(th), s = Math.sin(th);
              this.x = p[0] + c * r; this.z = p[2] + s * r; this.vx = -s * r * w; this.vz = c * r * w;
              dummy.position.set(this.x, this.y, this.z); const sc = 1.15 + 0.12 * Math.sin(time * 14 + idx); dummy.scale.set(sc, sc, sc); dummy.updateMatrix();
              beads.setMatrixAt(idx, dummy.matrix); beads.instanceMatrix.needsUpdate = true;
              arm.rotation.y = -th;
            },
          });
        }
      }
      // ---- lava fireballs leaping across the road
      const fbGeo = kit.trackGeom(new THREE.SphereGeometry(1, 10, 8)), fbMat = kit.trackMat(new THREE.MeshBasicMaterial({ color: 0xff8a20 }));
      const fbs = new THREE.InstancedMesh(fbGeo, fbMat, LF.fire.length); fbs.frustumCulled = false; kit.add(fbs);
      LF.fire.forEach(([d, dir], idx) => {
        const f = kit.frame(d), hw = f.halfWidth, l0 = -dir * (hw + 3.5), l1 = dir * (hw + 3.5), off = idx * 1.37, T = 3.3;
        out.push({
          x: f.x, y: f.y, z: f.z, radius: 1.8, hitKind: 'spin', vx: 0, vz: 0, active: false, launchable: false, object3D: null,
          update(dt, time) {
            let u = (time + off) % T; if (u < 0) u += T;
            const q = u / 2.1; let vis = false;
            if (q < 1) {
              const lat = l0 + (l1 - l0) * q, h = 13 * 4 * q * (1 - q) - 2.5;
              this.x = f.x + f.rx * lat; this.z = f.z + f.rz * lat; this.y = f.y + h;
              this.vx = f.rx * (l1 - l0) / 2.1; this.vz = f.rz * (l1 - l0) / 2.1; vis = h > -2.2;
              this.active = h > -0.3 && Math.abs(lat) < hw + 1.5;
            } else this.active = false;
            dummy.position.set(this.x, vis ? this.y : -500, this.z); const sc = vis ? 1.7 + 0.2 * Math.sin(time * 20 + idx) : 0.01; dummy.scale.set(sc, sc * 1.25, sc); dummy.updateMatrix();
            fbs.setMatrixAt(idx, dummy.matrix); fbs.instanceMatrix.needsUpdate = true;
          },
        });
      });
      // ---- statue flame jets
      const flGeo = kit.trackGeom((function () { const b = new kit.Batch(); b.blob(0, 0, 0, 1.6, 1.6, 2.3, [1, 0.45, 0.08], 1); b.blob(0, 0.5, 0.4, 1.1, 1.1, 1.6, [1, 0.85, 0.2], 1); return b.build(); })());
      const flMat = kit.trackMat(new THREE.MeshBasicMaterial({ vertexColors: true }));
      const NF = 5, fls = new THREE.InstancedMesh(flGeo, flMat, NF); fls.frustumCulled = false; kit.add(fls);
      const sf = kit.frame(LF.statue), mouth = track._lfMouth, TF = 5.6;
      const ml = (mouth[0] - sf.x) * sf.rx + (mouth[2] - sf.z) * sf.rz;
      for (let j = 0; j < NF; j++) {
        out.push({
          x: sf.x, y: sf.y, z: sf.z, radius: 2.1, hitKind: 'spin', vx: 0, vz: 0, active: false, launchable: false, object3D: null,
          update(dt, time) {
            let u = (time + 0.0) % TF; if (u < 0) u += TF;
            const t0 = 1.3 + j * 0.3, q = (u - t0) / 2.0; let vis = false;
            if (q >= 0 && q <= 1) {
              const lat = ml - (ml + 16) * q;
              this.x = sf.x + sf.rx * lat; this.z = sf.z + sf.rz * lat; this.y = sf.y + 1.2; this.vx = -sf.rx * (ml + 16) / 2.0; this.vz = -sf.rz * (ml + 16) / 2.0;
              this.active = q > 0.05; vis = true;
            } else this.active = false;
            dummy.position.set(this.x, vis ? this.y + 0.6 : -500, this.z); const sc = vis ? 1.0 + q * 0.9 : 0.01; dummy.scale.set(sc, sc, sc); dummy.rotation.y = Math.atan2(-sf.rx, -sf.rz) + Math.PI / 2 * 0; dummy.updateMatrix();
            fls.setMatrixAt(j, dummy.matrix); fls.instanceMatrix.needsUpdate = true;
          },
        });
      }
      return out;
    },

    update(track, dt, time) {
      const g = track.ground;
      if (g && g.material) g.material.color.setHSL(0.045 + Math.sin(time * 0.8) * 0.006, 1, 0.5 + Math.sin(time * 1.7) * 0.04);
    },
  });

  // =====================================================================================
  // 4. RAINBOW RIBBON  (DD Rainbow Road): long neon ribbon in space, giant spiral, humps, jump
  // =====================================================================================
  const RB_SEGS = [['S', 170], ['A', 70, 102.5], ['S', 40], ['A', 76.1, -82.8], ['S', 50], ['A', 62, 540], ['S', 70], ['A', 86.7, -59.5],
    ['S', 100], ['A', 80, 92], ['S', 227.7], ['A', 85, 76.3], ['S', 100.2], ['A', 70, 51.6], ['S', 80]];
  const RB_Y = keyY([[0, 40], [170, 40], [495, 64], [1085, 26], [1700, 26], [2052, 40]], 70);
  const RB_PTS = turtle(RB_SEGS, 14, (d) => {
    let y = RB_Y(d);
    if (d > 1095 && d < 1335) { const w = Math.min(1, (d - 1095) / 40, (1335 - d) / 40); y += 1.7 * Math.sin(((d - 1095) / 100) * TAU) * w; }
    return y;
  }, (d) => 12);

  G.defineTrack({
    id: 'rainbow_ribbon', name: 'Rainbow Ribbon', cup: 'special', order: 4, laps: 3, music: 'rainbow', seed: 4041,
    hw: 12, shoulder: 3, scale: 1, style: 'starlight', noWalls: true, rails: true, startArch: true,
    theme: {
      sky: [0x03010f, 0x140a3c, 0x070320], fog: [0x0a0630, 190, 720], ground: 0x000000, shoulder: 0x000000,
      road: [0x7050c0, 0x6040b0], curb: [0xffffff, 0x78f0ff], hemi: [0xc7b8ff, 0x3a2a7a, 1.1], sun: [0xffe6ff, 0.6], emb: 0x000000, bg: 0x0a0630,
    },
    offroad: 'offroad', pts: RB_PTS,
    pads: [
      { d: 40, len: 11, l: -5.5, w: 7 }, { d: 40, len: 11, l: 5.5, w: 7 },
      { d: 300, len: 11, l: 0, w: 8 }, { d: 560, len: 11, l: -5, w: 7 }, { d: 560, len: 11, l: 5, w: 7 },
      { d: 780, len: 11, l: 0, w: 8 }, { d: 1015, len: 11, l: 0, w: 9 },
      { d: 1180, len: 11, l: -5, w: 7 }, { d: 1180, len: 11, l: 5, w: 7 }, { d: 1460, len: 11, l: 0, w: 9 }, { d: 1545, len: 11, l: 0, w: 9 },
      { d: 1805, len: 11, l: -5, w: 7 }, { d: 1805, len: 11, l: 5, w: 7 }, { d: 1940, len: 11, l: 0, w: 9 },
    ],
    jumps: [{ d: 1612, len: 3, l: 0, w: 22 }],
    zones: [{ d: 1615, len: 10, l: 0, w: 30, surface: 'void', color: 0x07031a }],
    itemRows: [{ d: 230, count: 5 }, { d: 640, count: 5, double: true }, { d: 880, count: 5 }, { d: 1230, count: 5 }, { d: 1400, count: 5, double: true }, { d: 1740, count: 5 }, { d: 1900, count: 5, double: true }],
    decorate(track, kit) {
      const rng = kit.rng, col = kit.col, L = kit.length;
      let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
      for (let i = 0; i < kit.N; i += 6) { minX = Math.min(minX, kit.px[i]); maxX = Math.max(maxX, kit.px[i]); minZ = Math.min(minZ, kit.pz[i]); maxZ = Math.max(maxZ, kit.pz[i]); }
      const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, rad = Math.max(maxX - minX, maxZ - minZ) / 2;
      const neon = [col(0xff6ad5), col(0x66f2ff), col(0xffe066), col(0xa98bff), col(0x8cffc0), col(0xff9a5c)];
      // ---- lit decor: planets, asteroids, crystals
      const b = new kit.Batch();
      const pcol = [0xff7ab8, 0x5fc8ff, 0xffb347, 0x9a7cf0, 0x6fe0a8, 0xf26b6b];
      for (let n = 0; n < 9; n++) {   // planets turn slowly on their axes (rings / moons ride along)
        const pb = new kit.Batch();
        const s = 22 + rng() * 38, a = rng() * TAU, dist = rad + 160 + rng() * 260;
        const x = cx + Math.cos(a) * dist, z = cz + Math.sin(a) * dist, y = -20 + rng() * 110, c = col(pcol[n % 6]);
        pb.blob(0, 0, 0, s, s, s, c, 2);
        pb.blob(s * 0.3, s * 0.35, s * 0.4, s * 0.55, s * 0.4, s * 0.55, kit.mul(c, 1.18), 1);
        if (n % 3 === 0) disc(pb, 0, 0, 0, s * 1.35, s * 1.9, 28, kit.mix(c, [1, 1, 1], 0.5), 0);
        if (n % 3 === 1) pb.blob(s * 1.9, s * 0.5, 0, s * 0.28, s * 0.28, s * 0.28, kit.mix(c, [1, 1, 1], 0.3), 1);
        kit.spinBatch(pb, { x, y, z, axis: 'y', speed: 0.05 + (n % 4) * 0.025 });
      }
      for (let n = 0; n < 170; n++) {
        const i = (rng() * kit.N) | 0, side = rng() < 0.5 ? -1 : 1, off = kit.hw[i] + 14 + rng() * 120;
        const x = kit.px[i] + Math.cos(i) * 0 + (kit.pz[(i + 1) % kit.N] - kit.pz[i]) * 0, z = 0;
        const f = kit.frame(i * kit.ds), px = f.x + f.rx * side * off, pz = f.z + f.rz * side * off;
        if (!kit.clear(px, pz, 30)) continue;
        const y = f.y + (rng() - 0.5) * 90 - 14, s = 1.5 + rng() * 5;
        if (roadBelow(kit, px, pz, y + 40, s + 12) && false) continue;
        if (rng() < 0.55) b.blob(px, y, pz, s, s * 0.8, s, kit.mix(col(0x6a5a8a), col(0x9a8ac0), rng()), 0);
        else { const c = neon[(rng() * neon.length) | 0]; b.frustum(px, y, pz, s * 0.5, 0, s * 2.2, 5, c, rng()); b.frustum(px, y - s * 1.2, pz, s * 0.5, 0, s * 1.2, 5, kit.mul(c, 0.7), rng()); }
      }
      kit.mesh(b);
      // ---- glowing (unlit) decor: neon hoops, pylons, helix core
      const g = new kit.Batch(), hoopB = [new kit.Batch(), new kit.Batch(), new kit.Batch()], pylB = [new kit.Batch(), new kit.Batch()];
      for (let k = 0; k < 9; k++) arcBand(kit, hoopB[k % 3], L * (0.045 + k * 0.105) + (k % 2) * 13, 15.4, 17.4, 1.4, neon[k % neon.length], -0.12, Math.PI + 0.12, 24, 0);
      // light pylons along the edges
      for (let d = 30; d < L - 20; d += 36) {
        const f = kit.frame(d);
        for (let s = -1; s <= 1; s += 2) {
          const l = s * (f.halfWidth + 1.3), c = neon[((d / 36) | 0) % neon.length], pb2 = pylB[((d / 36) | 0) & 1];
          pb2.box(f.x + f.rx * l, f.y, f.z + f.rz * l, 0.5, 2.6, 0.5, 0, kit.mul(c, 0.7));
          pb2.blob(f.x + f.rx * l, f.y + 3.0, f.z + f.rz * l, 0.7, 0.7, 0.7, c, 0);
        }
      }
      // spiral core: glowing column + level rings at the centre of the helix
      let hx = 0, hz = 0, hn = 0, hy0 = 1e9, hy1 = -1e9;
      for (let d = 495; d < 1085; d += 6) { const f = kit.frame(d); hx += f.x; hz += f.z; hn++; hy0 = Math.min(hy0, f.y); hy1 = Math.max(hy1, f.y); }
      hx /= hn; hz /= hn;
      g.frustum(hx, hy0 - 22, hz, 2.6, 2.2, hy1 - hy0 + 60, 10, col(0x66f2ff), 0);
      for (let y = hy0 - 10, k = 0; y < hy1 + 24; y += 12, k++) disc(g, hx, y, hz, 3, 7.5, 20, neon[k % neon.length], 0);
      kit.mesh(g, {}, true);
      hoopB.forEach((hb2, i) => { const m = kit.mesh(hb2, {}, true); if (m) kit.blinker(m.material, 2.4, { duty: 0.6, phase: i / 3, lo: 0.3 }); });   // hoops chase around
      pylB.forEach((pb2, i) => { const m = kit.mesh(pb2, {}, true); if (m) kit.blinker(m.material, 1.6, { duty: 0.5, phase: i * 0.5, lo: 0.35 }); });
      // searchlights sweeping from the helix core, fireworks all around, twinkling stardust along the ribbon
      kit.lightBeam({ x: hx, y: hy1 + 34, z: hz, len: 220, width: 9, speed: 0.3, tilt: 0.55, count: 3, color: 0xff9af0, opacity: 0.5 });
      kit.lightBeam({ x: hx, y: hy0 - 6, z: hz, len: 180, width: 7, speed: -0.45, tilt: 0.5, count: 2, color: 0x7af2ff, opacity: 0.5 });
      { const em = []; for (let k = 0; k < 9; k++) { const a = k * 0.7 + 0.4, r = rad + 120 + (k % 3) * 70; em.push([cx + Math.cos(a) * r, 40 + (k % 4) * 30, cz + Math.sin(a) * r]); }
        kit.particles({ emitters: em, count: 70, sphere: 28, life: 7, win: 0.3, grav: -7, size: 3.2, grow: -0.5, alpha: 1, pow: 0.6, fadeIn: 0.04, color: [0xff4060, 0x40d0ff, 0xffe040, 0x70ff70, 0xff80ff, 0xffa030], burst: true, tex: 'spark', additive: true });
        const sd = []; for (let d = 20; d < L; d += 55) { const f = kit.frame(d); sd.push([f.x, f.y + 2.2, f.z]); }
        kit.particles({ emitters: sd, count: 6, vel: [0, 1.2, 0], spread: [1.6, 0.5, 1.6], jitter: [10, 1.5, 10], life: 2.4, size: 1.1, alpha: 0.9, pow: 0.7, fadeIn: 0.3, color: [0xff6ad5, 0x66f2ff, 0xffe066, 0xffffff], tex: 'spark', additive: true }); }
      // ---- lip beacons around the big jump
      const jb = new kit.Batch();
      for (const dd of [1608, 1625]) { const f = kit.frame(dd); for (let s = -1; s <= 1; s += 2) { const l = s * (f.halfWidth - 0.6); jb.box(f.x + f.rx * l, f.y, f.z + f.rz * l, 0.7, 5, 0.7, 0, neon[1]); jb.blob(f.x + f.rx * l, f.y + 5.4, f.z + f.rz * l, 0.9, 0.9, 0.9, neon[2], 0); } }
      kit.mesh(jb, {}, true);

      // ---- falling stars: streaks that follow the camera
      const NS = 90, pos = new Float32Array(NS * 6), colr = new Float32Array(NS * 6);
      const base = new Float32Array(NS * 3), spd = new Float32Array(NS);
      for (let i = 0; i < NS; i++) {
        base[i * 3] = rng() * 400; base[i * 3 + 1] = rng() * 160; base[i * 3 + 2] = rng() * 400; spd[i] = 22 + rng() * 30;
        const c = neon[(rng() * neon.length) | 0];
        colr.set([c[0], c[1], c[2], 0, 0, 0], i * 6);
      }
      const geo = kit.trackGeom(new THREE.BufferGeometry());
      const pa = new THREE.BufferAttribute(pos, 3); pa.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', pa); geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
      const mat = kit.trackMat(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      const lines = new THREE.LineSegments(geo, mat);
      lines.frustumCulled = false;
      lines.onBeforeRender = function (renderer, scene, camera) {
        const cxp = track.mirror ? -camera.position.x : camera.position.x, cyp = camera.position.y, czp = camera.position.z, t = track._time;
        const S = 400, H = 160;
        for (let i = 0; i < NS; i++) {
          const bx = base[i * 3], by = base[i * 3 + 1], bz = base[i * 3 + 2], v = spd[i];
          const hx2 = cxp - S / 2 + ((((bx + t * v * 0.5 - cxp) % S) + S) % S);
          const hy2 = cyp - H / 2 + ((((by - t * v - cyp) % H) + H) % H);
          const hz2 = czp - S / 2 + ((((bz + t * v * 0.35 - czp) % S) + S) % S);
          pos[i * 6] = hx2; pos[i * 6 + 1] = hy2; pos[i * 6 + 2] = hz2;
          pos[i * 6 + 3] = hx2 - v * 0.2; pos[i * 6 + 4] = hy2 + v * 0.4; pos[i * 6 + 5] = hz2 - v * 0.14;
        }
        pa.needsUpdate = true;
      };
      kit.add(lines);
    },
  });
})();
