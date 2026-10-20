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
  // makeAtlas(kit, cols, rows, cw, ch, draw(ctx, cw, ch, cell)) paints each cell of a canvas texture.
  function makeAtlas(kit, cols, rows, cw, ch, draw) {
    return kit.makeCanvasTexture(cols * cw, rows * ch, (ctx) => {
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { ctx.save(); ctx.translate(c * cw, r * ch); ctx.beginPath(); ctx.rect(0, 0, cw, ch); ctx.clip(); draw(ctx, cw, ch, r * cols + c); ctx.restore(); }
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

  // marble statue (pedestal, robe, torso, head, raised torch arm, cape)
  function statue(b, x, y, z, ry, s, c, c2) {
    const ca = Math.cos(ry), sa = Math.sin(ry);
    b.box(x, y, z, 2.6 * s, 0.9 * s, 2.6 * s, ry, c2);
    b.frustum(x, y + 0.9 * s, z, 0.95 * s, 0.6 * s, 2.3 * s, 8, c, 0);
    b.frustum(x, y + 3.1 * s, z, 0.72 * s, 0.5 * s, 1.5 * s, 8, c, 0);
    b.box(x - sa * 0.0, y + 2.5 * s, z, 1.5 * s, 2.1 * s, 0.25 * s, ry, c2);
    b.blob(x, y + 5.0 * s, z, 0.42 * s, 0.5 * s, 0.42 * s, c, 1);
    b.frustum(x, y + 5.45 * s, z, 0.46 * s, 0.2 * s, 0.25 * s, 6, c2, 0);
    const ax = x + ca * 0.95 * s, az = z - sa * 0.95 * s;
    b.frustum(ax, y + 3.5 * s, az, 0.2 * s, 0.15 * s, 1.9 * s, 5, c, 0);
    b.frustum(ax, y + 5.4 * s, az, 0.28 * s, 0.1 * s, 0.9 * s, 5, c2, 0);
  }
  function paintBanner(ctx, w, h, kind) {
    const pal = [['#a8242a', '#f0c030'], ['#1f3a8a', '#f4e6b0'], ['#e8b020', '#a8242a'], ['#1f8a8a', '#fff4d8']][kind % 4];
    ctx.fillStyle = pal[0]; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = pal[1]; ctx.fillRect(4, 4, w - 8, 5); ctx.fillRect(4, h - 9, w - 8, 5);
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(w * i / 6, h); ctx.lineTo(w * (i + 0.5) / 6, h - 22); ctx.lineTo(w * (i + 1) / 6, h); ctx.fill(); }
    ctx.strokeStyle = pal[1]; ctx.fillStyle = pal[1]; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(w / 2, h * 0.4, w * 0.3, 0, TAU); ctx.stroke();
    if (kind % 2 === 0) { ctx.beginPath(); ctx.moveTo(w / 2, h * 0.4 - w * 0.2); ctx.lineTo(w / 2 + w * 0.18, h * 0.4 + w * 0.14); ctx.lineTo(w / 2 - w * 0.18, h * 0.4 + w * 0.14); ctx.fill(); }
    else { for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ctx.beginPath(); ctx.moveTo(w / 2 + Math.cos(a) * w * 0.12, h * 0.4 + Math.sin(a) * w * 0.12); ctx.lineTo(w / 2 + Math.cos(a) * w * 0.36, h * 0.4 + Math.sin(a) * w * 0.36); ctx.stroke(); } }
    ctx.font = 'bold ' + Math.round(w * 0.2) + 'px Bungee, Impact, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(['AURUM', 'LEGIO', 'SOLIS', 'VICTA'][kind % 4], w / 2, h * 0.78);
  }
  function paintAd(ctx, w, h, kind) {
    const T = [['AURUM ARENA', '#a8242a', '#f6d34a'], ['OLEA GOLD OIL', '#f4e6b8', '#7a4a10'], ['LEGION LEAGUE', '#1f3a8a', '#f6d34a'], ['VICTOR WINES', '#5a2a7a', '#f4e6b8'], ['GLADIO GEAR', '#1f7a6a', '#fff0c0'], ['AQUA ROMA', '#1f8aa8', '#ffffff'], ['PANIS & CIRCUS', '#e8a030', '#5a1a10'], ['TITAN TIRES', '#2a4aa8', '#ffe070']][kind % 8];
    ctx.fillStyle = T[1]; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = T[2]; ctx.fillRect(0, 0, w, 8); ctx.fillRect(0, h - 8, w, 8);
    for (let i = 0; i < 14; i++) ctx.fillRect(i * w / 14, 8, w / 28, 6);
    ctx.font = 'bold ' + Math.round(h * 0.42) + 'px Bungee, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = T[2];
    ctx.fillText(T[0], w / 2, h * 0.54, w - 20);
  }
  function paintDecal(ctx, w, h, kind) {
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = 'rgba(255,248,225,0.92)'; ctx.strokeStyle = 'rgba(255,248,225,0.92)'; ctx.lineWidth = 8;
    if (kind === 0) { ctx.beginPath(); ctx.moveTo(w / 2, h * 0.04); ctx.lineTo(w * 0.92, h * 0.5); ctx.lineTo(w * 0.62, h * 0.5); ctx.lineTo(w * 0.62, h * 0.96); ctx.lineTo(w * 0.38, h * 0.96); ctx.lineTo(w * 0.38, h * 0.5); ctx.lineTo(w * 0.08, h * 0.5); ctx.fill(); }
    else if (kind === 1) { for (let k = 0; k < 3; k++) { const y = h * (0.1 + k * 0.28); ctx.beginPath(); ctx.moveTo(w * 0.08, y + h * 0.2); ctx.lineTo(w / 2, y); ctx.lineTo(w * 0.92, y + h * 0.2); ctx.lineTo(w * 0.92, y + h * 0.3); ctx.lineTo(w / 2, y + h * 0.1); ctx.lineTo(w * 0.08, y + h * 0.3); ctx.fill(); } }
    else if (kind === 2) { ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(w / 2, h * 0.5, w * 0.4, 0, TAU); ctx.stroke(); ctx.font = 'bold ' + Math.round(w * 0.2) + 'px Bungee, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.save(); ctx.translate(w / 2, h * 0.5); ctx.rotate(-Math.PI / 2); ctx.fillText('AURUM', 0, w * 0.07); ctx.restore(); }
    else { ctx.lineWidth = 7; ctx.strokeRect(10, 10, w - 20, h - 20); ctx.fillRect(10, 10, 26, 26); ctx.fillRect(w - 36, 10, 26, 26); }
  }

  function beautyCO(track, kit, o) {
    const { dp, FL, GAP1, GAP2, gates, torches } = o, L = kit.length, col = kit.col, mul = kit.mul, mix = kit.mix;
    const marble = col(0xf6eedc), marble2 = col(0xe0d2b0), gold = col(0xf2bd2a), goldD = col(0xc08a1a), terra = col(0xc65a3a), crimson = col(0xb02a2e), navy = col(0x28408f), dark = col(0x2e1c14);
    const ads = new Signs(kit, makeAtlas(kit, 4, 2, 256, 96, paintAd), 4, 2);
    const ban = new Signs(kit, makeAtlas(kit, 4, 1, 128, 256, paintBanner), 4, 1);
    const dec = new Signs(kit, makeAtlas(kit, 4, 1, 128, 256, paintDecal), 4, 1);
    const b = new kit.Batch(), gl = [], pools = [];
    const inAng = (a) => Math.atan2(-Math.cos(a), -Math.sin(a));
    // ---- arena floor mosaic: sun emblem, bands, spokes
    for (const [r0, r1, c] of [[58, 61, gold], [61, 64, terra], [150, 153, gold], [153, 157, crimson], [196 - 40, 196 - 37, mix(gold, [1, 1, 1], 0.2)]]) disc(b, 0, FL + 0.08, 0, r0, r1, 72, c, 0);
    for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU, a2 = a + TAU / 48, r0 = 64, r1 = 148; b.quad([Math.cos(a) * r0, FL + 0.09, Math.sin(a) * r0], [Math.cos(a) * r1, FL + 0.09, Math.sin(a) * r1], [Math.cos(a2) * r1, FL + 0.09, Math.sin(a2) * r1], [Math.cos(a2) * r0, FL + 0.09, Math.sin(a2) * r0], k & 1 ? mix(terra, [1, 1, 1], 0.25) : mix(gold, [1, 1, 1], 0.35)); }
    for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; b.blob(Math.cos(a) * 170, FL + 0.2, Math.sin(a) * 170, 4.5, 0.3, 4.5, k & 1 ? crimson : navy, 0); }
    // ---- victory columns (landmarks rising from the arena floor): outer ring + inner ring, gold statues on top
    const colTops = [];
    for (const [n, R, h, rr, ph] of [[12, 163, 66, 2.5, 0.2], [10, 56, 50, 2.1, 0.0]]) for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + ph, x = Math.cos(a) * R, z = Math.sin(a) * R;
      column(b, x, FL, z, h, rr, marble, marble2, 12);
      b.frustum(x, FL, z, rr * 1.6, rr * 1.35, 3.2, 12, gold, 0);
      b.frustum(x, FL + h, z, rr * 1.7, rr * 1.3, 1.6, 12, gold, 0);
      statue(b, x, FL + h + 1.4, z, inAng(a), 1.9, gold, goldD);
      b.frustum(x, FL + h + 12.4, z, 0.5, 0.1, 1.8, 5, col(0xffe9a0), 0);
      colTops.push([x, FL + h + 0.6, z]); gl.push([x, FL + h + 13.8, z, 0xffb050, 1]);
      b.frustum(x, FL + h + 12.0, z, 1.0, 0.7, 1.0, 6, goldD, 0); // brazier
    }
    // ---- fountain statues around the basin
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + 0.2; statue(b, Math.cos(a) * 21, FL + 8.4, Math.sin(a) * 21, inAng(a) + Math.PI, 0.9, marble, gold); }
    // ---- outer facade: arch bays, pilasters, cornice frieze, rooftop statues
    const ORW = 242, SEG = 72;
    for (let s = 0; s < SEG; s++) {
      const a = ((s + 0.5) / SEG) * TAU, ry = inAng(a), cx = Math.cos(a) * (ORW - 4.1), cz = Math.sin(a) * (ORW - 4.1);
      archOpening(b, cx, 33, cz, 6.6, 13, ry, dark, 0.08);
      archOpening(b, cx, 32.4, cz, 8.0, 14.2, ry, mul(marble2, 0.92), 0.05);
      b.box(cx, 46.6, cz, 1.6, 1.4, 1.2, ry, gold);                                  // keystone
      const pa = (s / SEG) * TAU, px = Math.cos(pa) * (ORW - 4.6), pz = Math.sin(pa) * (ORW - 4.6);
      b.box(px, 30, pz, 2.6, 0.6, 2.6, 0, gold); b.frustum(px, 30.6, pz, 1.1, 0.95, 25.2, 6, marble, 0.3); b.box(px, 55.8, pz, 2.8, 0.8, 2.8, 0, gold);
      b.box(Math.cos(a) * (ORW - 4.5), 54.4, Math.sin(a) * (ORW - 4.5), 1.4, 3.6, (TAU * ORW) / SEG + 0.3, -a + Math.PI / 2, s & 1 ? terra : crimson); // frieze
      if (s % 3 === 1) { const q = ban; q.board(cx * 0.995, 34.5, cz * 0.995, 5.2, 10.4, ry, ((s / 3) | 0) % 4, [1, 1, 1], 0); }
      if (s % 3 === 0) statue(b, Math.cos(a) * 244, 58, Math.sin(a) * 244, inAng(a), 1.3, marble, gold);
    }
    disc(b, 0, 58.06, 0, 236, 238.6, 72, gold, 0);
    // ---- stands: ad boards on the tier fronts, gold lip trims, aisle stairs
    const SEGS = 72;
    for (let k = 3; k < 10; k++) {
      const ri = 186 + k * 5.2, y0 = FL + 4 + k * 7;
      for (let s = 0; s < SEGS; s++) {
        const a0 = (s / SEGS) * TAU, a1 = ((s + 1) / SEGS) * TAU, am = (a0 + a1) / 2, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        b.quad([c0 * (ri - 0.05), y0 + 6.3, s0 * (ri - 0.05)], [c1 * (ri - 0.05), y0 + 6.3, s1 * (ri - 0.05)], [c1 * (ri - 0.05), y0 + 7.0, s1 * (ri - 0.05)], [c0 * (ri - 0.05), y0 + 7.0, s0 * (ri - 0.05)], gold);
        if (s % 6 === 0) b.quad([c0 * ri, y0 + 7.04, s0 * ri], [Math.cos(a0 + 0.012) * ri, y0 + 7.04, Math.sin(a0 + 0.012) * ri], [Math.cos(a0 + 0.012) * (ri + 5.2), y0 + 7.04, Math.sin(a0 + 0.012) * (ri + 5.2)], [c0 * (ri + 5.2), y0 + 7.04, s0 * (ri + 5.2)], dark);
        if ((s + k) % 3 === 0 && k >= 4) ads.board(Math.cos(am) * (ri - 0.12), y0 + 2.4, Math.sin(am) * (ri - 0.12), 12.6, 3.6, inAng(am), (s * 5 + k * 3) % 8, [1, 1, 1], 0);
      }
    }
    kit.mesh(b);
    // ---- ornate balustrade on top of the engine guard rail (skips the void gaps), lamps with glow
    const sb = new kit.Batch(), gaps = [[GAP1 - 2, GAP1 + 18], [GAP2 - 2, GAP2 + 18]];
    const inGap = (d) => gaps.some((g) => d > g[0] && d < g[1]);
    for (let d = 1.5, n = 0; d < L - 1; d += 4.0, n++) {
      if (inGap(d)) continue;
      const f = kit.frame(d), f2 = kit.frame(d + 4), hd = Math.atan2(f.tx, f.tz);
      for (let s = -1; s <= 1; s += 2) {
        const l = s * (f.halfWidth + 0.83), x = f.x + f.rx * l, z = f.z + f.rz * l, l2 = s * (f2.halfWidth + 0.83), x2 = f2.x + f2.rx * l2, z2 = f2.z + f2.rz * l2, cc = n & 1 ? gold : marble;
        const hw = 0.23;   // rail: top + two sides (6 tris)
        sb.quad([x - f.rx * hw, f.y + 1.62, z - f.rz * hw], [x + f.rx * hw, f.y + 1.62, z + f.rz * hw], [x2 + f2.rx * hw, f2.y + 1.62, z2 + f2.rz * hw], [x2 - f2.rx * hw, f2.y + 1.62, z2 - f2.rz * hw], cc);
        sb.quad([x - f.rx * hw, f.y + 1.62, z - f.rz * hw], [x2 - f2.rx * hw, f2.y + 1.62, z2 - f2.rz * hw], [x2 - f2.rx * hw, f2.y + 1.4, z2 - f2.rz * hw], [x - f.rx * hw, f.y + 1.4, z - f.rz * hw], mul(cc, 0.85));
        sb.quad([x + f.rx * hw, f.y + 1.62, z + f.rz * hw], [x2 + f2.rx * hw, f2.y + 1.62, z2 + f2.rz * hw], [x2 + f2.rx * hw, f2.y + 1.4, z2 + f2.rz * hw], [x + f.rx * hw, f.y + 1.4, z + f.rz * hw], mul(cc, 0.85));
        if (n % 4 === 0) sb.box(x, f.y + 0.9, z, 0.4, 0.52, 0.4, hd, marble);
        if (n % 6 === 0) {
          sb.box(x, f.y + 0.9, z, 0.6, 0.9, 0.6, hd, marble2); sb.blob(x, f.y + 2.15, z, 0.34, 0.34, 0.34, gold, 0);
          gl.push([x, f.y + 2.2, z, 0xffc060, 0.8]);
          if (n % 12 === 0) pools.push([x, f.y + 0.1, z, 5.5, 0xffa040, 0.45]);
        }
      }
    }
    // gate statues (quadriga-style crown): gold statue + glowing orb above each triumphal gate
    for (const gd of gates) { const f = kit.frame(gd); statue(sb, f.x, f.y + 18.6, f.z, Math.atan2(f.tx, f.tz), 1.5, gold, goldD); }
    kit.mesh(sb);
    // ---- painted road decals: arrows, chevrons, sponsor roundels, start-grid boxes
    for (const [d, cell] of [[dp(-20), 0], [dp(60), 1], [dp(210), 2], [dp(300), 0], [dp(430), 1], [dp(600), 2], [dp(700), 0], [dp(850), 1], [dp(905), 2]]) {
      if (inGap(d) || inGap(d + 14)) continue;
      dec.strip(d, d + 10, cell === 2 ? -4 : -3, cell === 2 ? 4 : 3, 0.07, cell, [1, 1, 1]);
    }
    for (let k = 0; k < 4; k++) for (const l of [-5.5, 5.5]) dec.strip(L - 7 - k * 8, L - 2 - k * 8, l - 1.9, l + 1.9, 0.07, 3, [1, 1, 1]);
    ads.mesh({}); ban.mesh({}); dec.mesh({ decal: true });
    // glows (torches, lamps, brazier tops) and light pools on the road
    for (const t of torches) gl.push([t[0], t[1] + 0.4, t[2], 0xffa030, 1]);
    glowPoints(kit, gl, 7, 0.9); glowPools(kit, pools);
    // bunting between the outer victory columns, banners on the central pavilion
    for (let k = 0; k < 12; k++) { const a0 = (k / 12) * TAU + 0.2, a1 = ((k + 1) / 12) * TAU + 0.2; kit.bunting([Math.cos(a0) * 163, FL + 63, Math.sin(a0) * 163], [Math.cos(a1) * 163, FL + 63, Math.sin(a1) * 163], [0xb02a2e, 0xf2bd2a, 0x28408f, 0xf6eedc], 26, 2.4, 6); }
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + 0.3; kit.banner(Math.cos(a) * 24.4, FL + 24, Math.sin(a) * 24.4, 3.2, 12, -a + Math.PI / 2, k & 1 ? [0xb02a2e, 0xf2bd2a] : [0x28408f, 0xf6eedc], { pattern: 'vstripes' }); }
    // fountain basin jets
    { const em = []; for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; em.push([Math.cos(a) * 15, FL + 9, Math.sin(a) * 15]); }
      kit.particles({ emitters: em, count: 14, vel: [0, 7, 0], spread: [1.2, 1.2, 1.2], life: 1.6, grav: -9, size: 0.8, alpha: 0.9, pow: 0.6, color: [0xdff8ff, 0xffffff] }); }
  }

  (function () {
    const dp = CO.dAtPhi;
    const GAP1 = dp(468), GAP2 = dp(725);
    const pads = [];
    const padAt = (p, pair) => { const d = dp(p); if (pair) { pads.push({ d, len: 11, l: -6, w: 8 }, { d, len: 11, l: 6, w: 8 }); } else pads.push({ d, len: 11, l: 0, w: 10 }); };
    padAt(-82, true); padAt(40); padAt(150, true); padAt(270); padAt(380, true); padAt(458); padAt(560);
    pads.push({ d: GAP2 - 18, len: 11, l: 0, w: 10 }); padAt(800, true); padAt(870); padAt(925, true);
    G.defineTrack({
      id: 'grand_colosseum', name: 'Grand Colosseum', cup: 'special', order: 1, laps: 2, music: 'colosseum', seed: 1017,
      hw: 12, shoulder: 3, scale: 1, style: 'meadow', sky: 'sunset', railColors: [0xf6eedc, 0xe2b53a], noWalls: true, rails: true, ground: false, startArch: true, offroad: 'offroad',
      theme: {
        sky: [0x2c4fb0, 0xff9a62, 0xffc98a], fog: [0xf0b27a, 260, 900], ground: 0xd8bd84, shoulder: 0xb99b62,
        road: [0x8a7c70, 0x7e7064], curb: [0xb7432e, 0xf0e2c0], hemi: [0xffd8b8, 0x8a5a48, 0.78], sun: [0xffbe84, 0.72], emb: 0xc9a46a, bg: 0xf0b27a,
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
            b.quad([c0 * ri, y1, s0 * ri], [c1 * ri, y1, s1 * ri], [c1 * ro, y1, s1 * ro], [c0 * ro, y1, s0 * ro], mix(col([0xb02a2e, 0x28408f, 0xe6b422, 0x2f8a52][((s / 6) | 0) % 4]), rc, 0.45));
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
        const placedGates = [];
        for (const gd of [dp(30), dp(225), dp(520), dp(610), dp(760), dp(880)]) {
          const f = kit.frame(gd), hd = Math.atan2(f.tx, f.tz), wd = f.halfWidth + 3;
          if (roadAbove(f.x, f.z, f.y, 20) || roadAbove(f.x + f.rx * wd, f.z + f.rz * wd, f.y, 20) || roadAbove(f.x - f.rx * wd, f.z - f.rz * wd, f.y, 20)) continue;
          placedGates.push(gd);
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
        beautyCO(track, kit, { dp, FL, GAP1, GAP2, gates: placedGates, torches: tor });
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

  // additive light shafts: list [[x0,y0,z0 (top), x1,y1,z1 (bottom), halfWidth, hex, k]] -> one draw
  function shaftMesh(kit, list) {
    if (!list.length) return null;
    const P = [], C = [];
    for (const [tx, ty, tz, bx, by, bz, w, hexc, k] of list) {
      const c = kit.col(hexc), m = k === undefined ? 1 : k, dx = bz - tz, dz = -(bx - tx), l = Math.hypot(dx, dz) || 1, ox = (dx / l) * w, oz = (dz / l) * w;
      P.push(tx - ox * 0.3, ty, tz - oz * 0.3, tx + ox * 0.3, ty, tz + oz * 0.3, bx + ox, by, bz + oz, tx - ox * 0.3, ty, tz - oz * 0.3, bx + ox, by, bz + oz, bx - ox, by, bz - oz);
      C.push(c[0] * m, c[1] * m, c[2] * m, c[0] * m, c[1] * m, c[2] * m, 0, 0, 0, c[0] * m, c[1] * m, c[2] * m, 0, 0, 0, 0, 0, 0);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); kit.trackGeom(g);
    const m = new THREE.Mesh(g, kit.trackMat(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })));
    m.frustumCulled = false; m.renderOrder = 4; kit.add(m); return m;
  }
  function paintDinoAd(ctx, w, h, kind) {
    const T = [['RAPTOR RUSH', '#3a2a14', '#ffd23f'], ['AMBER GRILL', '#a8480f', '#fff0c0'], ['FERN & CO TOURS', '#1f5a2a', '#e8ffb0'], ['TRI-TOP TREATS', '#7a2a5a', '#ffe4a0'], ['MOSSY ROCK SPA', '#2a6a6a', '#e8fff0'], ['VOLCANO VIEW', '#8a1f0f', '#ffd080'], ['EGG & EGG', '#f0e4c0', '#6a3a10'], ['JURA TIRES', '#222', '#ff8a2a']][kind % 8];
    ctx.fillStyle = '#6a4522'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = T[1]; ctx.fillRect(8, 8, w - 16, h - 16);
    ctx.strokeStyle = T[2]; ctx.lineWidth = 4; ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.font = 'bold ' + Math.round(h * 0.34) + 'px Bungee, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = T[2]; ctx.fillText(T[0], w / 2, h * 0.52, w - 40);
  }
  function paintGlyph(ctx, w, h, kind) {
    ctx.fillStyle = ['#8d8a78', '#857f6c', '#948f7c', '#7d8470'][kind % 4]; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) { ctx.fillStyle = 'rgba(' + (60 + (i * 37) % 60) + ',' + (60 + (i * 53) % 60) + ',50,0.12)'; ctx.fillRect((i * 29) % w, (i * 47) % h, 5 + (i % 9), 4 + (i % 7)); }
    ctx.fillStyle = 'rgba(70,120,50,0.55)'; for (let i = 0; i < 9; i++) ctx.fillRect(i * w / 9, 0, w / 9 * 0.7, 10 + (i * 13) % 26);
    ctx.strokeStyle = '#3a382c'; ctx.fillStyle = '#3a382c'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    const cx = w / 2;
    if (kind === 0) { ctx.beginPath(); ctx.arc(cx, h * 0.3, w * 0.26, 0, TAU); ctx.stroke(); ctx.fillRect(cx - w * 0.14, h * 0.26, w * 0.1, 10); ctx.fillRect(cx + w * 0.04, h * 0.26, w * 0.1, 10); ctx.beginPath(); ctx.moveTo(cx - w * 0.14, h * 0.38); ctx.lineTo(cx + w * 0.14, h * 0.38); ctx.stroke(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * w * 0.3, h * 0.3 + Math.sin(a) * w * 0.3); ctx.lineTo(cx + Math.cos(a) * w * 0.42, h * 0.3 + Math.sin(a) * w * 0.42); ctx.stroke(); } }
    else if (kind === 1) { ctx.beginPath(); for (let i = 0; i < 80; i++) { const a = i * 0.28, r = 4 + i * 0.7; ctx.lineTo(cx + Math.cos(a) * r, h * 0.3 + Math.sin(a) * r); } ctx.stroke(); }
    else if (kind === 2) { for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(w * 0.15, h * (0.18 + k * 0.12)); for (let i = 1; i <= 6; i++) ctx.lineTo(w * (0.15 + i * 0.12), h * (0.18 + k * 0.12 + (i & 1 ? 0.05 : 0))); ctx.stroke(); } }
    else { ctx.beginPath(); ctx.moveTo(cx, h * 0.1); ctx.lineTo(cx + w * 0.3, h * 0.4); ctx.lineTo(cx, h * 0.34); ctx.lineTo(cx - w * 0.3, h * 0.4); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, h * 0.5, 14, 0, TAU); ctx.fill(); }
    // simple dino footprint row
    for (let k = 0; k < 3; k++) { const y = h * (0.62 + k * 0.1); ctx.beginPath(); ctx.arc(cx - 10 + (k & 1) * 20, y, 7, 0, TAU); ctx.fill(); }
  }
  function paintDecalDR(ctx, w, h, kind) {
    if (kind !== 2) return paintDecal(ctx, w, h, kind);
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = 'rgba(255,248,225,0.9)';
    for (const [x, y] of [[0.3, 0.3], [0.68, 0.72]]) { ctx.beginPath(); ctx.ellipse(w * x, h * y, w * 0.2, h * 0.1, 0, 0, TAU); ctx.fill(); for (let t = -1; t <= 1; t++) { ctx.beginPath(); ctx.ellipse(w * (x + t * 0.17), h * (y - 0.14 - (t ? 0 : 0.03)), w * 0.06, h * 0.05, 0, 0, TAU); ctx.fill(); } }
  }
  function triceratops(b, x, y, z, ry, s, c, frill) {
    const ca = Math.cos(ry), sa = Math.sin(ry), P = (f, l, h) => [x + sa * f + ca * l, y + h, z + ca * f - sa * l];
    const bl = (f, l, h, rx, ry2, rz, cc) => { const p = P(f, l, h); b.blob(p[0], p[1], p[2], rx * s, ry2 * s, rz * s, cc, 1); };
    bl(0, 0, 2.2, 1.7, 1.6, 2.9, c); bl(0, 0, 2.3, 1.55, 1.4, 1.5, mix2(c, 1.1));
    bl(0, 0, 2.2, 1.0, 0.4, 3.0, mix2(c, 1.3));
    bl(3.0, 0, 2.1, 1.0, 1.0, 1.3, c);                       // head
    bl(2.0, 0, 3.0, 1.9, 0.18, 1.6, frill);                   // frill
    for (const l of [-0.55, 0.55]) { const p = P(3.5, l, 3.0), q = P(4.7, l, 3.8); b.frustum(p[0], p[1], p[2], 0.2 * s, 0.03 * s, 1.5 * s, 5, [0.95, 0.9, 0.75], 0); }
    { const p = P(4.3, 0, 2.0); b.frustum(p[0], p[1], p[2], 0.15 * s, 0.02 * s, 0.9 * s, 5, [0.95, 0.9, 0.75], 0); }
    for (const [f, l] of [[1.7, -1.0], [1.7, 1.0], [-1.6, -1.0], [-1.6, 1.0]]) { const p = P(f, l, 0); b.frustum(p[0], p[1], p[2], 0.55 * s, 0.4 * s, 1.5 * s, 6, mix2(c, 0.85), 0); }
    for (let k = 1; k <= 3; k++) bl(-2.6 - k * 0.9, 0, 2.0 - k * 0.12, 0.9 - k * 0.2, 0.8 - k * 0.15, 0.9, c);
  }
  function mix2(c, k) { return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)]; }
  function stegosaurus(b, x, y, z, ry, s, c, plate) {
    const ca = Math.cos(ry), sa = Math.sin(ry), P = (f, l, h) => [x + sa * f + ca * l, y + h, z + ca * f - sa * l];
    const bl = (f, l, h, rx, ry2, rz, cc) => { const p = P(f, l, h); b.blob(p[0], p[1], p[2], rx * s, ry2 * s, rz * s, cc, 1); };
    bl(0, 0, 2.2, 1.3, 1.5, 3.2, c); bl(0, 0, 1.8, 1.1, 0.7, 2.8, mix2(c, 1.25));
    bl(3.4, 0, 1.5, 0.45, 0.45, 0.8, c); bl(2.9, 0, 1.9, 0.5, 0.5, 0.7, c);
    for (let k = 0; k < 7; k++) { const f = 1.9 - k * 0.8, h = 3.3 + 0.7 * Math.sin((k / 6) * Math.PI), p = P(f, 0, h); b.frustum(p[0], p[1] - 0.2 * s, p[2], 0.55 * s, 0.0, 1.5 * s * (0.6 + 0.4 * Math.sin((k / 6) * Math.PI + 0.3)), 4, plate, ry + k); }
    for (const [f, l] of [[1.7, -0.8], [1.7, 0.8], [-1.5, -0.8], [-1.5, 0.8]]) { const p = P(f, l, 0); b.frustum(p[0], p[1], p[2], 0.45 * s, 0.35 * s, 1.5 * s, 6, mix2(c, 0.85), 0); }
    for (let k = 1; k <= 4; k++) bl(-2.8 - k * 0.9, 0, 1.8 + k * 0.05, 0.75 - k * 0.12, 0.6 - k * 0.1, 0.9, c);
    for (const l of [-0.4, 0.4]) { const p = P(-7.2, l, 2.0); b.frustum(p[0], p[1], p[2], 0.14 * s, 0.0, 1.4 * s, 4, [0.9, 0.85, 0.7], 0); }
  }
  // giant fern: many arching fronds with leaflet-like colour banding
  function fern(b, x, y, z, s, a0, c1, c2) {
    for (let k = 0; k < 9; k++) {
      const a = a0 + (k / 9) * TAU, L = (2.6 + (k % 3) * 0.7) * s, w = 0.55 * s, ca = Math.cos(a), sa = Math.sin(a), px = -sa * w, pz = ca * w;
      const m = [x + ca * L * 0.5, y + 1.3 * s, z + sa * L * 0.5], e = [x + ca * L, y - 0.3 * s, z + sa * L];
      b.quad([x, y + 0.2 * s, z], [m[0] + px, m[1], m[2] + pz], [e[0], e[1], e[2]], [m[0] - px, m[1], m[2] - pz], k & 1 ? c1 : c2);
    }
  }
  function beautyDR(track, kit, o) {
    const L = kit.length, gy = kit.groundY, col = kit.col, mul = kit.mul, mix = kit.mix, rng = kit.rng, DR = o.DR;
    const stone = col(0x8d8a78), stoneD = col(0x6f6d5e), moss = col(0x5a7d3a), wood = col(0x7a5028), woodD = col(0x5a3a1a), amber = col(0xffa23a);
    const fg = [col(0x2f9a3c), col(0x45b34a), col(0x1f7a35), col(0x6cc24a), col(0x2a8a50), col(0x8ad04a)];
    const jit = (c, r) => mul(c, 0.85 + r() * 0.3);
    const jf = new kit.Batch(), b = new kit.Batch(), gl = [], pools = [], flames = [];
    // ---- undergrowth along the whole course: ferns, flowering bushes, mossy boulders, rock clusters
    kit.scatter(400, 0, 7, 12.6, (x, z, i, r) => {
      const t = r();
      if (t < 0.5) fern(jf, x, gy + 0.3, z, 0.7 + r() * 0.9, r() * 6, jit(fg[(r() * 6) | 0], r), jit(fg[(r() * 6) | 0], r));
      else if (t < 0.78) { const s = 0.8 + r() * 0.8; for (let k = 0; k < 2; k++) jf.blob(x + (r() - 0.5) * 1.6 * s, gy + 0.7 * s, z + (r() - 0.5) * 1.6 * s, 1.2 * s, 0.85 * s, 1.2 * s, jit(fg[(r() * 6) | 0], r), 0); const fc = [col(0xff5a8a), col(0xffe14a), col(0xffffff), col(0xff8a3a), col(0xb06aff)][(r() * 5) | 0]; for (let k = 0; k < 3; k++) jf.box(x + (r() - 0.5) * 2 * s, gy + 1.3 * s + r() * 0.5, z + (r() - 0.5) * 2 * s, 0.3, 0.3, 0.3, r() * 3, fc); }
      else { const s = 0.6 + r() * 1.5; b.blob(x, gy + 0.2 * s, z, 1.5 * s, 0.9 * s, 1.3 * s, jit(r() < 0.5 ? stone : stoneD, r), 0); if (r() < 0.6) b.blob(x, gy + 0.85 * s, z, 1.2 * s, 0.3 * s, 1.0 * s, jit(moss, r), 0); }
    });
    kit.scatter(40, 3, 38, 14, (x, z, i, r) => {       // rock outcrops with moss caps
      const s = 1.8 + r() * 3.2, c = jit(stone, r);
      b.blob(x, gy + 0.5 * s, z, 2.2 * s, 1.6 * s, 1.9 * s, c, 1); b.blob(x + 1.6 * s, gy + 0.3 * s, z + 0.7 * s, 1.5 * s, 1.0 * s, 1.4 * s, jit(stoneD, r), 0);
      b.blob(x - 0.4 * s, gy + 1.9 * s, z - 0.3 * s, 1.5 * s, 0.6 * s, 1.3 * s, jit(moss, r), 0);
    });
    kit.scatter(26, 2, 30, 13.5, (x, z, i, r) => {      // giant mushrooms + fallen logs
      if (r() < 0.55) { const s = 0.8 + r() * 1.2, c = [col(0xe04a3a), col(0xf0a030), col(0xb86ad8)][(r() * 3) | 0]; b.frustum(x, gy, z, 0.5 * s, 0.35 * s, 2.4 * s, 7, col(0xf0e4c8), 0); b.blob(x, gy + 2.6 * s, z, 1.9 * s, 0.9 * s, 1.9 * s, c, 1); b.blob(x + 0.6 * s, gy + 3.3 * s, z, 0.3 * s, 0.1 * s, 0.3 * s, [1, 1, 1], 0); gl.push([x, gy + 2.2 * s, z, 0xff90c0, 0.35]); }
      else { b.box(x, gy, z, 1.7, 1.7, 7.5, r() * 6, jit(woodD, r)); b.blob(x, gy + 1.7, z, 0.9, 0.2, 2.6, jit(moss, r), 0); }
    });
    // ---- carved stelae (glyph boards on stone slabs) and signposts with painted adverts
    const gly = new Signs(kit, makeAtlas(kit, 4, 1, 128, 256, paintGlyph), 4, 1), ads = new Signs(kit, makeAtlas(kit, 4, 2, 256, 128, paintDinoAd), 4, 2), dec = new Signs(kit, makeAtlas(kit, 4, 1, 128, 256, paintDecalDR), 4, 1);
    const inCave = (d) => d > DR.cave[0] - 12 && d < DR.cave[1] + 12, inBridge = (d) => d > DR.bridge[0] - 18 && d < DR.bridge[1] + 18, inFord = (d) => d > DR.ford[0] - 10 && d < DR.ford[1] + 10;
    let ai = 0;
    for (let d = 46; d < L - 20; d += 58) {
      if (inCave(d) || inBridge(d) || inFord(d)) continue;
      const f = kit.frame(d), s = ((d / 58) | 0) & 1 ? 1 : -1, l = s * (f.halfWidth + 4.6), p = kit.at(d, l, 0), hd = Math.atan2(f.tx, f.tz), face = hd + (s > 0 ? Math.PI / 2 : -Math.PI / 2);
      if ((d / 58 | 0) % 3 === 2) {     // advert signpost
        b.box(p[0] + f.rx * s * 0.0, p[1] - 0.4, p[2], 0.35, 3.8, 0.35, 0, wood);
        b.box(p[0] + f.tx * 2.4, p[1] - 0.4, p[2] + f.tz * 2.4, 0.35, 3.8, 0.35, 0, wood);
        const c2 = kit.at(d + 1.2, l, 0); b.box(c2[0], c2[1] + 3.4, c2[2], 0.3, 0.3, 3.4, hd, woodD);
        ads.board(c2[0] - f.rx * s * 0.2, c2[1] + 0.9, c2[2] - f.rz * s * 0.2, 4.6, 2.3, face, ai++ % 8, [1, 1, 1], 0);
      } else {                         // glyph stele with moss cap and glow gems
        const sl = kit.at(d, l, 0), q = 5 + (rng() * 2);
        b.box(sl[0], sl[1] - 0.6, sl[2], 2.8, q, 1.1, face, stone); b.blob(sl[0], sl[1] - 0.6 + q, sl[2], 1.5, 0.45, 0.8, mul(moss, 0.9), 0);
        const nx = Math.sin(face), nz = Math.cos(face);
        gly.board(sl[0] + nx * 0.58, sl[1] - 0.2, sl[2] + nz * 0.58, 2.6, 4.4, face, ((d / 58) | 0) % 4, [1, 1, 1], 0);
        b.box(sl[0] - f.tx * 2.4, sl[1] - 0.6, sl[2] - f.tz * 2.4, 1.6, 1.4, 1.6, hd, stoneD);
      }
    }
    // ---- tiki torches with flame glow
    for (let d = 20; d < L - 10; d += 46) {
      if (inCave(d) || inBridge(d)) continue;
      const f = kit.frame(d), s = ((d / 46) | 0) & 1 ? 1 : -1, l = s * (f.halfWidth + 1.9), p = kit.at(d, l, 0);
      b.frustum(p[0], p[1] - 0.3, p[2], 0.17, 0.12, 2.8, 6, wood, 0); b.frustum(p[0], p[1] + 2.5, p[2], 0.3, 0.2, 0.5, 6, woodD, 0);
      flames.push([p[0], p[1] + 3.3, p[2]]); gl.push([p[0], p[1] + 3.4, p[2], 0xff9a30, 1]); if (((d / 46) | 0) % 2 === 0) pools.push([p[0], p[1] + 0.12, p[2], 4.5, 0xff9a30, 0.35]);
    }
    // ---- road decals: carved-arrows, chevrons, footprints, start grid boxes
    for (const [d, cell] of [[70, 0], [180, 2], [300, 1], [480, 0], [650, 2], [800, 1], [960, 0], [1070, 2], [1290, 0], [1400, 2], [1560, 1]]) {
      if (inCave(d) || inBridge(d) || inFord(d) || (d > DR.dino - 30 && d < DR.dino + 20)) continue;
      dec.strip(d, d + 9, -3, 3, 0.07, cell, [1, 1, 1]);
    }
    for (let k = 0; k < 4; k++) for (const l of [-5, 5]) dec.strip(L - 7 - k * 8, L - 2 - k * 8, l - 1.9, l + 1.9, 0.07, 3, [1, 1, 1]);
    // ---- dinosaurs: triceratops herd + stegosaurs near the road, nesting eggs
    const herd = [[190, 28, 0], [210, 36, 1], [405, -30, 0], [560, 34, 1], [610, -34, 0], [820, -32, 1], [1230, 38, 0], [1400, -34, 1], [1480, 30, 0], [1190, -40, 1]];
    for (const [d, lat, kind] of herd) {
      const f = kit.frame(d), s = Math.sign(lat), l = lat + s * f.halfWidth, p = kit.at(d, l, 0);
      if (!kit.clear(p[0], p[2], 22) && false) continue;
      const ry = Math.atan2(f.tx, f.tz) + (rng() - 0.5) * 1.2 + (s > 0 ? Math.PI / 2 : -Math.PI / 2) * 0.8;
      if (kind === 0) triceratops(b, p[0], gy, p[2], ry, 1.7 + rng() * 0.8, col(0xb8864a), col(0xd4553a));
      else stegosaurus(b, p[0], gy, p[2], ry, 1.7 + rng() * 0.8, col(0x5a9a6a), col(0xe8903a));
      if (kind === 0) for (let e = 0; e < 3; e++) b.blob(p[0] + 7 + e * 1.3, gy + 0.5, p[2] + 2 - e, 0.6, 0.8, 0.6, col(0xf2ecd2), 1);
    }
    // ---- ancient arches over the road (two) with vine curtains
    for (const gd of [610, 1290]) {
      const f = kit.frame(gd), hd = Math.atan2(f.tx, f.tz), wd = f.halfWidth + 3.4;
      for (let s = -1; s <= 1; s += 2) { const x = f.x + f.rx * s * wd, z = f.z + f.rz * s * wd; b.box(x, f.y - 1.2, z, 3.6, 13, 3.6, hd, stone); b.box(x, f.y + 11.6, z, 4.4, 1.0, 4.4, hd, stoneD); b.blob(x, f.y + 12.8, z, 2.2, 0.8, 2.2, moss, 0); for (let k = 0; k < 4; k++) b.box(x + f.tx * (k - 1.5) * 0.9, f.y + 3 + k * 2.6, z + f.tz * (k - 1.5) * 0.9, 3.9, 0.3, 3.9, hd, mul(stoneD, 0.9)); }
      b.box(f.x, f.y + 12.4, f.z, 2 * wd + 3, 2.6, 3.4, hd, stone); b.box(f.x, f.y + 15, f.z, 2 * wd - 2, 1.0, 3.0, hd, moss);
      gly.board(f.x - f.tx * 1.75, f.y + 12.6, f.z - f.tz * 1.75, 6, 2.2, hd + Math.PI, 2, [1, 1, 1], 0); gly.board(f.x + f.tx * 1.75, f.y + 12.6, f.z + f.tz * 1.75, 6, 2.2, hd, 2, [1, 1, 1], 0);
      for (let k = 0; k < 7; k++) { const l = (k - 3) * 2.8; jf.box(f.x + f.rx * l, f.y + 8 + (k % 3), f.z + f.rz * l, 0.12, 3.8 - (k % 3), 0.12, 0, fg[k % 3]); }
    }
    // ---- distant volcano with glowing crater, lava streaks and smoke
    {
      const f = kit.frame(L - 5), vx = f.x + f.tx * 520 + f.rx * 180, vz = f.z + f.tz * 520 + f.rz * 180, vy = gy - 12, H = 210, R0 = 190, vb = new kit.Batch(), vg = new kit.Batch();
      vb.frustum(vx, vy, vz, R0, 38, H, 9, col(0x5a4a40), 0.3); vb.frustum(vx, vy, vz, R0 * 1.15, R0 * 0.55, H * 0.3, 9, col(0x4a6a3a), 0.3);
      vb.frustum(vx, vy + H - 6, vz, 44, 30, 10, 9, col(0x3a2a26), 0.3); vg.frustum(vx, vy + H + 1, vz, 30, 28, 1, 9, col(0xff7a2a), 0.3);
      for (let k = 0; k < 6; k++) { const a = k * 1.05 + 0.2, rr = R0 * 0.0; vg.frustum(vx + Math.cos(a) * 34, vy + H - 40, vz + Math.sin(a) * 34, 3.0, 1.2, 38, 4, col(0xff6a1a), a); }
      kit.mesh(vb); kit.mesh(vg, {}, true);
      kit.particles({ x: vx, y: vy + H + 6, z: vz, count: 30, vel: [6, 12, 2], spread: [3, 2, 3], life: 9, size: 60, grow: 4, alpha: 0.5, pow: 1.1, wob: 4, color: [0x5a5048, 0x6a6058, 0x7a7068] });
      gl.push([vx, vy + H + 10, vz, 0xff7a2a, 1]);
    }
    // ---- mist banks, fireflies, light shafts
    { const ff = []; for (let d = 40; d < L; d += 34) { const f = kit.frame(d), s = ((d / 34) | 0) & 1 ? 1 : -1, p = kit.at(d, s * (f.halfWidth + 6), 0); ff.push([p[0], p[1] + 2, p[2]]); }
      kit.particles({ emitters: ff, count: 5, vel: [0, 0.3, 0], spread: [0.6, 0.3, 0.6], jitter: [5, 1.5, 5], life: 4.2, size: 0.9, alpha: 1, pow: 0.7, fadeIn: 0.4, wob: 1.2, color: [0xf4ff80, 0xb8ff90], additive: true }); }
    // ---- dense giant-fern hedges and pebbles hugging both sides of the road
    for (let d = 4, n = 0; d < L - 4; d += 7.5, n++) {
      if (inCave(d) || inBridge(d)) continue;
      for (let s = -1; s <= 1; s += 2) {
        const f = kit.frame(d + hash(n, s + 3) * 4), l = s * (f.halfWidth + 3.9 + hash(n, s + 9) * 3.2), p = kit.at(d, l, 0), sc = 1.5 + hash(n, s + 5) * 1.3, y = p[1] - 0.9;
        fern(jf, p[0], y, p[2], sc, hash(n, s) * 6, jit(fg[(hash(n, s + 1) * 6) | 0], rng), jit(fg[(hash(n, s + 2) * 6) | 0], rng));
        if (hash(n, s + 7) < 0.5) { const q = kit.at(d + 3.2, l + s * 1.6, 0); fern(jf, q[0], q[1] - 0.9, q[2], sc * 0.7, hash(n, s + 4) * 6, jit(fg[2], rng), jit(fg[3], rng)); }
        if (hash(n, s + 11) < 0.3) { const q = kit.at(d + 1.5, l - s * 0.8, 0); b.blob(q[0], q[1] - 0.6, q[2], 0.9, 0.5, 0.8, jit(stone, rng), 0); }
      }
    }
    kit.mesh(b); kit.foliage(jf, { strength: 0.4, heightScale: 0.14 });
    gly.mesh({}); ads.mesh({}); dec.mesh({ decal: true });
    kit.particles({ emitters: flames, count: 6, vel: [0, 1.8, 0], spread: [0.2, 0.5, 0.2], life: 0.8, size: 1.0, grow: -0.5, alpha: 0.95, color: [0xffa030, 0xffd060, 0xff6a20], additive: true });
    glowPoints(kit, gl, 6, 0.9); glowPools(kit, pools);
  }

  G.defineTrack({
    id: 'dino_ruins', name: 'Dino Ruins', cup: 'special', order: 2, laps: 3, music: 'jungle', seed: 2077,
    hw: 11, shoulder: 3, scale: 1, style: 'meadow', walls: 'none', offroad: 'grass',
    theme: {
      sky: [0x2a8ed8, 0xc8eccc, 0x8ad080], fog: [0xb8e4b0, 170, 700], ground: 0x2f6e3a, shoulder: 0x7a6440,
      road: [0x8c7c5f, 0x7f7056], curb: [0x4d7a35, 0xd8cfa6], hemi: [0xeaf8d4, 0x3d6a3a, 0.95], sun: [0xfff0b8, 1.0], emb: 0x3b7d3d, bg: 0xb8e4b0,
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
      kit.scatter(560, 1, 55, M - 1, (x, z, i, r) => {
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
      beautyDR(track, kit, { DR });
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

  function paintLavaBanner(ctx, w, h, kind) {
    ctx.fillStyle = ['#7a1410', '#1c1826', '#8a3a10', '#3a1020'][kind % 4]; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e8a02a'; ctx.fillRect(5, 5, w - 10, 6); ctx.fillRect(5, h - 11, w - 10, 6);
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(w * i / 5, h); ctx.lineTo(w * (i + 0.5) / 5, h - 26); ctx.lineTo(w * (i + 1) / 5, h); ctx.fill(); }
    ctx.fillStyle = '#ffb030'; ctx.strokeStyle = '#ffb030'; ctx.lineWidth = 7; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(w / 2, h * 0.14); ctx.quadraticCurveTo(w * 0.86, h * 0.36, w / 2, h * 0.58); ctx.quadraticCurveTo(w * 0.14, h * 0.36, w / 2, h * 0.14); ctx.fill();
    ctx.fillStyle = ['#7a1410', '#1c1826', '#8a3a10', '#3a1020'][kind % 4]; ctx.beginPath(); ctx.moveTo(w / 2, h * 0.24); ctx.quadraticCurveTo(w * 0.7, h * 0.38, w / 2, h * 0.5); ctx.quadraticCurveTo(w * 0.3, h * 0.38, w / 2, h * 0.24); ctx.fill();
    ctx.fillStyle = '#ffb030'; ctx.font = 'bold ' + Math.round(w * 0.19) + 'px Bungee, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(['IGNIS', 'UMBRA', 'MAGMA', 'EMBER'][kind % 4], w / 2, h * 0.76);
  }
  function paintLavaAd(ctx, w, h, kind) {
    const T = [['IGNIS INDUSTRIES', '#2a2a32', '#ffb030'], ['MAGMA MOTORS', '#8a1a10', '#ffe0a0'], ['CAUTION: SMASHERS', '#e8b020', '#201810'], ['OBSIDIAN OIL', '#18161e', '#ff6a2a'], ['KEEP OUT!', '#a82a1a', '#ffe8c0'], ['EMBER ENERGY', '#3a2a30', '#ff9a40'], ['FORGE & FRY', '#5a2a1a', '#ffd070'], ['DRAKE TIRES', '#111', '#ff5a20']][kind % 8];
    ctx.fillStyle = T[1]; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = T[2]; for (let i = 0; i < w; i += 28) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 14, 0); ctx.lineTo(i + 4, 10); ctx.lineTo(i - 10, 10); ctx.fill(); ctx.beginPath(); ctx.moveTo(i, h); ctx.lineTo(i + 14, h); ctx.lineTo(i + 4, h - 10); ctx.lineTo(i - 10, h - 10); ctx.fill(); }
    ctx.font = 'bold ' + Math.round(h * 0.36) + 'px Bungee, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(T[0], w / 2, h * 0.52, w - 30);
  }
  function paintLavaDecal(ctx, w, h, kind) {
    ctx.clearRect(0, 0, w, h);
    if (kind === 0) { // glowing crack
      ctx.strokeStyle = 'rgba(255,120,30,0.95)'; ctx.lineWidth = 7; ctx.lineJoin = 'round'; ctx.beginPath(); let x = w * 0.3, y = 0; ctx.moveTo(x, y);
      for (let i = 1; i <= 9; i++) { x += ((i * 7919) % 31 - 15) * 0.9; x = Math.max(8, Math.min(w - 8, x)); y = (h * i) / 9; ctx.lineTo(x, y); if (i % 3 === 0) { ctx.moveTo(x, y); ctx.lineTo(x + (i % 2 ? 22 : -22), y + 16); ctx.moveTo(x, y); } }
      ctx.stroke(); ctx.strokeStyle = 'rgba(255,230,140,0.95)'; ctx.lineWidth = 2.5; ctx.stroke();
    } else if (kind === 1) { // hazard chevrons
      ctx.fillStyle = 'rgba(255,190,40,0.9)'; for (let k = 0; k < 4; k++) { const y = h * k / 4; ctx.beginPath(); ctx.moveTo(w * 0.05, y + h * 0.22); ctx.lineTo(w * 0.5, y); ctx.lineTo(w * 0.95, y + h * 0.22); ctx.lineTo(w * 0.95, y + h * 0.3); ctx.lineTo(w * 0.5, y + h * 0.08); ctx.lineTo(w * 0.05, y + h * 0.3); ctx.fill(); }
    } else if (kind === 2) { // flame roundel
      ctx.strokeStyle = 'rgba(255,170,50,0.92)'; ctx.fillStyle = 'rgba(255,170,50,0.92)'; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.4, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w / 2, h * 0.3); ctx.quadraticCurveTo(w * 0.78, h * 0.5, w / 2, h * 0.7); ctx.quadraticCurveTo(w * 0.22, h * 0.5, w / 2, h * 0.3); ctx.fill();
    } else { ctx.strokeStyle = 'rgba(255,230,200,0.92)'; ctx.lineWidth = 7; ctx.fillStyle = ctx.strokeStyle; ctx.strokeRect(10, 10, w - 20, h - 20); ctx.fillRect(10, 10, 26, 26); ctx.fillRect(w - 36, 10, 26, 26); }
  }
  // winged stone gargoyle (original design): crouching body, folded wings, horns, glowing eyes into `eyes`
  function gargoyle(b, eyes, x, y, z, ry, s, c, c2) {
    const ca = Math.cos(ry), sa = Math.sin(ry), P = (f, l, h) => [x + sa * f + ca * l, y + h, z + ca * f - sa * l];
    const bl = (f, l, h, rx, ry2, rz, cc) => { const p = P(f, l, h); b.blob(p[0], p[1], p[2], rx * s, ry2 * s, rz * s, cc, 1); };
    b.box(x, y, z, 3.4 * s, 1.4 * s, 3.4 * s, ry, c2);
    bl(0, 0, 3.0, 1.0, 1.3, 1.3, c); bl(0.9, 0, 4.4, 0.8, 0.8, 0.8, c);
    for (const l of [-1, 1]) { const p = P(0.3, l * 1.2, 3.6), q = P(-1.6, l * 3.4, 6.2), r = P(-1.6, l * 3.0, 3.0), t = P(-0.2, l * 0.5, 4.8); b.tri(p, q, r, mul2(c, 0.9)); b.tri(p, t, q, mul2(c, 1.05)); }
    for (const l of [-0.45, 0.45]) { const p = P(1.0, l, 5.0); b.frustum(p[0], p[1], p[2], 0.17 * s, 0.0, 1.2 * s, 5, c2, 0); const e = P(1.65, l * 0.8, 4.45); eyes.blob(e[0], e[1], e[2], 0.14 * s, 0.1 * s, 0.14 * s, [1, 0.3, 0.05], 0); }
    for (const l of [-0.7, 0.7]) { const p = P(0.9, l, 1.4); b.frustum(p[0], p[1], p[2], 0.35 * s, 0.28 * s, 1.6 * s, 6, c, 0); }
    bl(1.5, 0, 4.1, 0.35, 0.28, 0.5, c2);
  }
  function mul2(c, k) { return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)]; }
  function beautyLF(track, kit, o) {
    const L = kit.length, gy = kit.groundY, col = kit.col, mul = kit.mul, mix = kit.mix, rng = kit.rng, LF = o.LF, inOpen = o.inOpen;
    const basalt = col(0x34303a), basalt2 = col(0x4a4552), iron = col(0x2a2a32), ironL = col(0x5a5a66), crust = col(0x1e1a20);
    const b = new kit.Batch(), eb = new kit.Batch(), gl = [], pools = [], flames = [];
    const inHall = (d) => d > LF.hall[0] - 8 && d < LF.hall[1] + 8;
    // ---- crust islands floating on the lava, glowing rims
    const rim = new kit.Batch();
    kit.scatter(240, 1.5, 70, 13, (x, z, i, r) => {
      const rr = 2.5 + r() * 8, n = 9, a0 = r() * 6, y = gy + 0.11;
      for (let k = 0; k < n; k++) { const a = a0 + (k / n) * TAU, a2 = a0 + ((k + 1) / n) * TAU, ra = rr * (0.8 + 0.3 * hash(i + k, 3)), rb = rr * (0.8 + 0.3 * hash(i + k + 1, 3));
        b.tri([x, y, z], [x + Math.cos(a) * ra, y, z + Math.sin(a) * ra], [x + Math.cos(a2) * rb, y, z + Math.sin(a2) * rb], mul(crust, 0.8 + r() * 0.5));
        rim.quad([x + Math.cos(a) * ra, y - 0.01, z + Math.sin(a) * ra], [x + Math.cos(a) * (ra + 0.9), y - 0.01, z + Math.sin(a) * (ra + 0.9)], [x + Math.cos(a2) * (rb + 0.9), y - 0.01, z + Math.sin(a2) * (rb + 0.9)], [x + Math.cos(a2) * rb, y - 0.01, z + Math.sin(a2) * rb], col(0xffa030)); }
      if (r() < 0.45) { const s = 1 + r() * 2.5; b.frustum(x, y, z, 0.9 * s, 0.1 * s, 3.4 * s, 5, mul(basalt, 0.8 + r() * 0.4), r() * 3); }
    });
    kit.mesh(rim, {}, true);
    // ---- spikes along the crenellated walls, gargoyle statues, chains
    for (let d = 3, k = 0; d < L - 3; d += 4.8, k++) {
      if (inOpen(d) || inHall(d)) continue;
      const f = kit.frame(d), hd = Math.atan2(f.tx, f.tz);
      for (let s = -1; s <= 1; s += 2) { const l = s * (f.halfWidth + 1.8), x = f.x + f.rx * l, z = f.z + f.rz * l; b.frustum(x, f.y + 1.0, z, 0.24, 0.0, 1.5, 5, ironL, 0); b.box(x, f.y + 0.95, z, 0.9, 0.2, 0.9, hd, iron); }
    }
    for (let d = 90, n = 0; d < L - 40; d += 112, n++) {
      if (inOpen(d) || inHall(d) || (d > LF.statue - 30 && d < LF.statue + 30)) continue;
      const f = kit.frame(d), hd = Math.atan2(f.tx, f.tz);
      for (let s = -1; s <= 1; s += 2) { const l = s * (f.halfWidth + 4.4), p = kit.at(d, l, 0); gargoyle(b, eb, p[0], p[1] - 0.6, p[2], hd + (s > 0 ? -1 : 1) * 1.15, 1.25 + (n & 1) * 0.2, mix(basalt2, col(0x9a7a6a), 0.45), col(0x5a4a50)); gl.push([p[0], p[1] + 4.4, p[2], 0xff4a10, 0.7]); pools.push([p[0], p[1] + 0.12, p[2], 5, 0xff5a1a, 0.4]); }
    }
    // chains hanging along the drawbridge and from the hall ceiling, with lanterns
    const link = (x, y, z, ry, rz) => b.box(x, y, z, 0.18, 0.18, 0.5, ry, ironL);
    for (let s = -1; s <= 1; s += 2) for (let d = LF.bridge[0] + 8; d < LF.bridge[1] - 12; d += 16) {
      for (let k = 0; k < 14; k++) { const t = k / 13, p = kit.at(d + t * 16, s * (kit.frame(d).halfWidth + 1.2), 4.0 - 1.5 * 4 * t * (1 - t)), f = kit.frame(d + t * 16); link(p[0], p[1], p[2], Math.atan2(f.tx, f.tz) + (k & 1 ? Math.PI / 2 : 0)); }
    }
    for (let d = LF.hall[0] + 16; d < LF.hall[1] - 8; d += 16) for (const l of [-6, 0, 6]) {
      const p = kit.at(d, l, 0); for (let k = 0; k < 9; k++) link(p[0], p[1] + 17 - k * 0.5, p[2], (k & 1 ? 1.57 : 0));
      eb.blob(p[0], p[1] + 12.2, p[2], 0.5, 0.7, 0.5, [1, 0.62, 0.15], 0); b.frustum(p[0], p[1] + 12.9, p[2], 0.3, 0.0, 0.5, 6, iron, 0); gl.push([p[0], p[1] + 12.3, p[2], 0xffa040, 1]);
      if (l === 0) pools.push([p[0], p[1] + 0.12, p[2], 7, 0xff8a30, 0.35]);
    }
    // ---- cliffs with lava falls
    const fall = kit.flowMat('lava', { speed: [0, 0.35], repeat: [1, 3], color: 0xffc080, fallback: 0xff6a1a });
    for (const [d, s] of [[170, 1], [470, -1], [740, 1], [1130, -1], [1330, 1]]) {
      const f = kit.frame(d), cl = s * (f.halfWidth + 46), cx = f.x + f.rx * cl, cz = f.z + f.rz * cl, cb = new kit.Batch();
      if (!kit.clear(cx, cz, 30)) { }
      cb.frustum(cx, gy - 2, cz, 26, 11, 44, 16, mix(basalt, basalt2, 0.5), 0); cb.frustum(cx + f.rx * s * 8, gy - 2, cz + f.rz * s * 8, 14, 6, 52, 7, basalt, 1);
      cb.frustum(cx, gy + 40, cz, 9, 7, 2, 8, col(0xff7a1a), 0);
      kit.mesh(cb);
      const bx = cx - f.rx * s * 25.8, bz = cz - f.rz * s * 25.8, ux = cx - f.rx * s * 11.1, uz = cz - f.rz * s * 11.1, fx = bx - f.rx * s * 2, fz = bz - f.rz * s * 2, w2 = 4.2, tx = f.tx * w2, tz = f.tz * w2;
      kit.panel([[bx - tx, gy - 1.8, bz - tz], [bx + tx, gy - 1.8, bz + tz], [ux + tx * 0.8, gy + 41.5, uz + tz * 0.8], [ux - tx * 0.8, gy + 41.5, uz - tz * 0.8]], fall, [1, 1]);
      pools.push([fx, gy + 0.2, fz, 11, 0xff5a14, 0.45]); gl.push([fx, gy + 3, fz, 0xff7a20, 1]);
      kit.particles({ x: fx - f.rx * s * 2, y: gy + 2, z: fz - f.rz * s * 2, count: 18, vel: [0, 3, 0], spread: [2, 1.2, 2], jitter: [3, 0.5, 3], life: 3, size: 6, grow: 2, alpha: 0.35, pow: 1, color: [0xffb060, 0x6a3a30] });
    }
    // ---- keep: glowing windows and ember crest
    const K = track._lfKeep;
    if (K && K.kr > 12) {
      const wn = new kit.Batch();
      for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU, r = K.kr * 0.855; for (let h = 0; h < 3; h++) wn.box(K.kx + Math.cos(a) * r, K.kg + 8 + h * 8, K.kz + Math.sin(a) * r, 0.8, 3.4, 2.0, -a, col(0xffa030)); }
      for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.8, r = K.kr * 0.95 + 5.6; for (let h = 0; h < 4; h++) wn.box(K.kx + Math.cos(a) * r, K.kg + 10 + h * 8, K.kz + Math.sin(a) * r, 0.5, 3, 1.2, -a, col(0xffb040)); }
      kit.mesh(wn, {}, true); pools.push([K.kx, K.kg + 0.2, K.kz, K.kr * 1.8, 0xff5a1a, 0.5]);
    }
    // ---- adverts / banners / decals
    const ads = new Signs(kit, makeAtlas(kit, 4, 2, 256, 96, paintLavaAd), 4, 2), ban = new Signs(kit, makeAtlas(kit, 4, 1, 128, 256, paintLavaBanner), 4, 1);
    const dec = new Signs(kit, makeAtlas(kit, 4, 1, 128, 256, paintLavaDecal), 4, 1), crk = new Signs(kit, dec.tex, 4, 1);
    let ai = 0;
    for (let d = 40; d < L - 20; d += 78) {
      if (inOpen(d) || inHall(d)) continue;
      const f = kit.frame(d), s = ((d / 78) | 0) & 1 ? 1 : -1, hd = Math.atan2(f.tx, f.tz), p = kit.at(d, s * (f.halfWidth + 1.2), 0);
      ads.board(p[0], p[1] + 1.0, p[2], 5.6, 2.1, hd + (s > 0 ? 1 : -1) * Math.PI / 2, ai++ % 8, [1, 1, 1], 0);
      b.box(p[0] - f.tx * 2.9, p[1] + 0.4, p[2] - f.tz * 2.9, 0.4, 3.2, 0.4, 0, iron); b.box(p[0] + f.tx * 2.9, p[1] + 0.4, p[2] + f.tz * 2.9, 0.4, 3.2, 0.4, 0, iron);
    }
    for (let d = 55; d < L - 20; d += 92) { if (inOpen(d)) continue; const f = kit.frame(d), s = ((d / 92) | 0) & 1 ? -1 : 1, hd = Math.atan2(f.tx, f.tz), p = kit.at(d, s * (f.halfWidth + 3.2), 0);
      b.frustum(p[0], p[1] - 0.6, p[2], 0.3, 0.25, 11.5, 6, iron, 0); b.box(p[0], p[1] + 10.4, p[2] + 0, 0.3, 0.3, 2.6, hd + 1.57, iron);
      ban.board(p[0], p[1] + 2.2, p[2], 3.0, 8.2, hd + (s > 0 ? 1 : -1) * Math.PI / 2, ((d / 92) | 0) % 4, [1, 1, 1], 0.04); }
    for (const [d, c] of [[60, 2], [330, 1], [475, 0], [660, 2], [760, 1], [1000, 0], [1190, 2], [1290, 1]]) { if (inOpen(d) || inHall(d)) continue; dec.strip(d, d + 9, -3, 3, 0.07, c, [1, 1, 1]); }
    for (let k = 0; k < 4; k++) for (const l of [-5.5, 5.5]) dec.strip(L - 7 - k * 8, L - 2 - k * 8, l - 1.9, l + 1.9, 0.07, 3, [1, 1, 1]);
    // hazard stripes before smashers / fire bars, glowing cracks along the road edges
    for (const dd of [LF.smash[0][0] - 14, LF.bars[0][0] - 12, LF.bars[1][0] - 12]) dec.strip(dd, dd + 6, -6, 6, 0.07, 1, [1, 1, 1]);
    for (let d = 8; d < L - 12; d += 13) { if (inHall(d)) continue; const f = kit.frame(d), s = hash(d | 0, 5) < 0.5 ? -1 : 1, off = s * (f.halfWidth * 0.62 + hash(d | 0, 7) * 1.0); crk.strip(d, d + 12, off - 1.6, off + 1.6, 0.065, 0, [1, 0.8, 0.6]); }
    kit.mesh(b); kit.mesh(eb, {}, true);
    ads.mesh({}); ban.mesh({}); dec.mesh({ decal: true }); crk.mesh({ basic: true, additive: true, decal: true });
    // ---- ash drifting through the air, hot light pools & halos
    { const em = []; for (let d = 0; d < L; d += 47) { const f = kit.frame(d), p = kit.at(d, (((d / 47) | 0) & 1 ? 1 : -1) * (f.halfWidth + 8), 6); em.push([p[0], p[1], p[2]]); }
      kit.particles({ emitters: em, count: 14, vel: [0.7, -0.9, 0.3], spread: [0.4, 0.3, 0.4], jitter: [14, 8, 14], life: 7, size: 0.5, alpha: 0.7, pow: 0.5, wob: 1.6, color: [0x8a8078, 0x6a625c, 0xb0a498] }); }
    glowPoints(kit, gl, 9, 0.85); glowPools(kit, pools);
  }

  G.defineTrack({
    id: 'lava_fortress', name: 'Lava Fortress', cup: 'special', order: 3, laps: 3, music: 'fortress', seed: 3003,
    hw: 11, shoulder: 1.2, scale: 1, walls: 'none', offroad: 'offroad',
    theme: {
      sky: [0x0b0610, 0x2a0a12, 0x5a1608], fog: [0x4a1409, 120, 520], ground: 0xff5a14, shoulder: 0x3a3238,
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
        const lm = kit.flowMat('lava', { speed: [0.014, 0.009], repeat: [110, 110], color: 0xe8a070, fallback: 0xff5a14 });
        const lp = new THREE.Mesh(lg, lm); lp.position.set(kit.px[0], gy + 0.05, kit.pz[0]); lp.frustumCulled = false; kit.add(lp);
        kit.blinker(lm, 3.4, { mode: 'sine', lo: 0.78 });
        // heat embers rising off the lava all over the course
        const em = []; for (let k = 0; k < 14; k++) em.push([kit.px[0] + (rng() - 0.5) * 520, gy + 0.3, kit.pz[0] + (rng() - 0.5) * 520]);
        kit.particles({ emitters: em, count: 22, vel: [0.3, 5, 0.2], spread: [0.8, 2.2, 0.8], jitter: [60, 0, 60], life: 5.5, size: 0.9, grow: -0.5, alpha: 0.9, pow: 0.6, wob: 2.2, color: [0xff8a2a, 0xffc040, 0xff5a1a], additive: true });
      }
      // ---- sky: dark gradient dome + volcano silhouettes + embers (drawn over the engine's default backdrop)
      { const geo = kit.trackGeom(new THREE.SphereGeometry(292, 20, 14)), pos = geo.attributes.position, cc = new Float32Array(pos.count * 3);
        const top = col(0x0e0510), mid = col(0x3a0c10), bot = col(0xb4340e);
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
      track._lfKeep = { kx: kxz ? kxz[0] : 0, kz: kxz ? kxz[1] : 0, kg, kr };
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
      beautyLF(track, kit, { LF, inOpen });
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

  function paintNeonAd(ctx, w, h, kind) {
    const T = [['STELLAR SODA', '#ff6ad5'], ['COMET CAFE', '#66f2ff'], ['NOVA TIRES', '#ffe066'], ['ORBIT BANK', '#8cffc0'], ['LUNA PARK', '#a98bff'], ['GALAXY GUM', '#ff9a5c'], ['STARBURST', '#ff6ad5'], ['RAINBOW RUSH', '#66f2ff']][kind % 8];
    ctx.fillStyle = '#080422'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = T[1]; ctx.lineWidth = 6; ctx.shadowColor = T[1]; ctx.shadowBlur = 14; ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.font = 'bold ' + Math.round(h * 0.38) + 'px Bungee, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff'; ctx.fillText(T[0], w / 2, h * 0.53, w - 40);
    ctx.shadowBlur = 0; ctx.fillStyle = T[1]; ctx.globalAlpha = 0.5; ctx.fillText(T[0], w / 2, h * 0.53, w - 40);
  }
  function paintNeonDecal(ctx, w, h, kind) {
    ctx.clearRect(0, 0, w, h); ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 10; ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.strokeStyle = ctx.fillStyle;
    if (kind === 2) { ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.4, 0, TAU); ctx.stroke(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * TAU / 5, a2 = a + TAU / 10; ctx.beginPath(); ctx.lineTo(w / 2 + Math.cos(a) * w * 0.28, h / 2 + Math.sin(a) * w * 0.28); ctx.lineTo(w / 2 + Math.cos(a2) * w * 0.12, h / 2 + Math.sin(a2) * w * 0.12); ctx.lineTo(w / 2 + Math.cos(a + TAU / 5) * w * 0.28, h / 2 + Math.sin(a + TAU / 5) * w * 0.28); ctx.fill(); } }
    else paintDecal(ctx, w, h, kind);
  }
  // latitude-banded sphere (gas giant) with optional tilted ring; tilt rotates about X
  function bandedPlanet(b, cx, cy, cz, R, bands, tilt, ring, kit) {
    const nLat = 18, nLon = 28, ct = Math.cos(tilt), st = Math.sin(tilt);
    const T = (x, y, z) => [cx + x, cy + y * ct - z * st, cz + y * st + z * ct];
    for (let i = 0; i < nLat; i++) {
      const a0 = -Math.PI / 2 + (Math.PI * i) / nLat, a1 = -Math.PI / 2 + (Math.PI * (i + 1)) / nLat, c = bands[Math.floor(((i + 0.5) / nLat) * bands.length + 0.35 * Math.sin(i * 1.7)) % bands.length];
      for (let j = 0; j < nLon; j++) {
        const b0 = (j / nLon) * TAU, b1 = ((j + 1) / nLon) * TAU, sh = 0.78 + 0.22 * Math.cos(b0 - 0.8);
        const q = (a, bb) => T(Math.cos(a) * Math.cos(bb) * R, Math.sin(a) * R, Math.cos(a) * Math.sin(bb) * R);
        b.quad(q(a0, b0), q(a0, b1), q(a1, b1), q(a1, b0), [c[0] * sh, c[1] * sh, c[2] * sh]);
      }
    }
    if (ring) for (let k = 0; k < ring.length; k++) {
      const r0 = R * ring[k][0], r1 = R * ring[k][1], c = ring[k][2];
      for (let j = 0; j < 40; j++) { const a0 = (j / 40) * TAU, a1 = ((j + 1) / 40) * TAU; b.quad(T(Math.cos(a0) * r0, 0, Math.sin(a0) * r0), T(Math.cos(a0) * r1, 0, Math.sin(a0) * r1), T(Math.cos(a1) * r1, 0, Math.sin(a1) * r1), T(Math.cos(a1) * r0, 0, Math.sin(a1) * r0), c); }
    }
  }
  // vertical ring segment in the plane facing yaw `ry`, centred (cx,cy,cz)
  function ringArc(b, cx, cy, cz, ry, r0, r1, depth, c, a0, a1, n) {
    const rx = Math.cos(ry), rz = -Math.sin(ry), nx = Math.sin(ry) * depth / 2, nz = Math.cos(ry) * depth / 2;
    const P = (r, a, s) => [cx + rx * Math.cos(a) * r + nx * s, cy + Math.sin(a) * r, cz + rz * Math.cos(a) * r + nz * s];
    for (let i = 0; i < n; i++) { const u0 = a0 + ((a1 - a0) * i) / n, u1 = a0 + ((a1 - a0) * (i + 1)) / n;
      b.quad(P(r0, u0, 1), P(r1, u0, 1), P(r1, u1, 1), P(r0, u1, 1), c); b.quad(P(r0, u0, -1), P(r0, u1, -1), P(r1, u1, -1), P(r1, u0, -1), c);
      b.quad(P(r1, u0, 1), P(r1, u0, -1), P(r1, u1, -1), P(r1, u1, 1), c); b.quad(P(r0, u0, 1), P(r0, u1, 1), P(r0, u1, -1), P(r0, u0, -1), c); }
  }
  function neonStar(b, cx, cy, cz, ry, R, c, th) {
    const rx = Math.cos(ry), rz = -Math.sin(ry), nx = Math.sin(ry) * th / 2, nz = Math.cos(ry) * th / 2, pts = [];
    for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i * Math.PI) / 5, r = i & 1 ? R * 0.42 : R; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    const P = (p, s) => [cx + rx * p[0] + nx * s, cy + p[1], cz + rz * p[0] + nz * s];
    for (let i = 0; i < 10; i++) { const p = pts[i], q = pts[(i + 1) % 10];
      b.tri(P([0, 0], 1), P(p, 1), P(q, 1), c); b.tri(P([0, 0], -1), P(q, -1), P(p, -1), c); b.quad(P(p, 1), P(p, -1), P(q, -1), P(q, 1), mul2(c, 0.8)); }
  }
  function beautyRB(track, kit, o) {
    const { cx, cz, rad, neon } = o, L = kit.length, col = kit.col, mul = kit.mul, mix = kit.mix, rng = kit.rng;
    const lit = new kit.Batch(), emi = new kit.Batch(), gl = [];
    const pal = (a) => a.map(col);
    // ---- hero gas giants (banded, ringed) in the backdrop
    bandedPlanet(lit, cx + Math.cos(0.9) * (rad + 330), 70, cz + Math.sin(0.9) * (rad + 330), 85, pal([0xf5c27a, 0xe0894f, 0xffe0b0, 0xc7683c, 0xf0a860, 0xffd6a0, 0xb85a34]), 0.45,
      [[1.35, 1.55, col(0xe8c89a)], [1.6, 1.95, col(0xc9a070)], [2.0, 2.15, col(0xf2dcb8)]], kit);
    bandedPlanet(lit, cx + Math.cos(3.9) * (rad + 380), 20, cz + Math.sin(3.9) * (rad + 380), 62, pal([0x7fe0e8, 0x4aa8d8, 0xb8f4f4, 0x6cc0e0, 0x3a88c8]), -0.35, [[1.4, 1.7, col(0xbff4ff)], [1.75, 1.85, col(0x8adcf0)]], kit);
    bandedPlanet(lit, cx + Math.cos(5.5) * (rad + 300), 105, cz + Math.sin(5.5) * (rad + 300), 40, pal([0xff7ab8, 0xd44a98, 0xffa0d0, 0xb03a88]), 0.2, null, kit);
    bandedPlanet(lit, cx + Math.cos(2.2) * (rad + 260), -30, cz + Math.sin(2.2) * (rad + 260), 30, pal([0x9a7cf0, 0x6a4ad0, 0xc0a8ff]), 0.1, [[1.5, 1.8, col(0xd8c8ff)]], kit);
    kit.mesh(lit);
    // ---- space station: rotating habitat ring + hub + solar wings with glowing windows
    { const sx = cx + Math.cos(3.1) * (rad + 150), sy = 78, sz = cz + Math.sin(3.1) * (rad + 150);
      const sb = new kit.Batch(), wb = new kit.Batch(), hub = new kit.Batch(), Rr = 42, N = 28;
      for (let i = 0; i < N; i++) { const a = (i / N) * TAU, y = Math.sin(a) * Rr, z = Math.cos(a) * Rr;
        sb.box(0, y - 2.4, z, 5.2, 4.8, 6.0, 0, i & 1 ? col(0xd8dcf0) : col(0xaab4dc));
        if (i % 2 === 0) wb.box(0, y - 1.0, z, 5.4, 2.0, 6.2, 0, col(0xffe9a0)); }
      for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.4; for (let r = 6; r < Rr - 3; r += 6) sb.box(0, Math.sin(a) * r - 0.5, Math.cos(a) * r, 1.0, 1.0, 1.0, 0, col(0x8a90b8)); }
      hub.blob(0, 0, 0, 9, 9, 9, col(0xe8ecff), 1); hub.frustum(0, -22, 0, 2.6, 2.6, 44, 8, col(0x9098c0), 0);
      for (const sg of [-1, 1]) { hub.box(-8, sg * 30 - 0.3, -8, 16, 0.6, 16, 0, col(0x2a4aa8)); hub.box(-8, sg * 30 + 0.3, -0.2, 16, 0.2, 0.4, 0, col(0xd8dcf0)); hub.box(-0.2, sg * 30 + 0.3, -8, 0.4, 0.2, 16, 0, col(0xd8dcf0)); }
      hub.frustum(0, 24, 0, 0.4, 0.05, 12, 4, col(0xcccccc), 0);
      kit.spinBatch(sb, { x: sx, y: sy, z: sz, axis: 'x', speed: 0.06 });
      kit.spinBatch(wb, { x: sx, y: sy, z: sz, axis: 'x', speed: 0.06, basic: true });
      kit.spinBatch(hub, { x: sx, y: sy, z: sz, axis: 'y', speed: 0.02 });
      gl.push([sx, sy, sz, 0xffe9a0, 1], [sx, sy + 24, sz, 0xff6060, 0.9]); }
    // ---- rainbow arcs standing in the distance, neon stars on slim pylons, beacon towers
    { const arcs = new kit.Batch(), rcol = [0xff3a4a, 0xff9a3a, 0xffe03a, 0x4ae070, 0x3ab0ff, 0x9a5aff];
      for (let k = 0; k < 4; k++) { const a = k * 1.7 + 0.6, d = rad + 230 + (k % 2) * 80, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, ry = a + Math.PI / 2 + 0.3, R0 = 95 + k * 12;
        rcol.forEach((c, i) => ringArc(arcs, x, -25 + k * 8, z, ry, R0 + i * 4.2, R0 + i * 4.2 + 4, 3, col(c), 0, Math.PI, 28)); }
      kit.mesh(arcs, {}, true);
      const st = new kit.Batch(), stP = new kit.Batch();
      for (let k = 0; k < 8; k++) { const a = k * 0.8 + 0.2, d = rad + 70 + (k % 3) * 40, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, y = 36 + (k % 4) * 16, c = neon[k % neon.length];
        neonStar(st, x, y, z, a + Math.PI / 2, 13, c, 2.2); stP.frustum(x, y - 40, z, 1.0, 0.5, 40, 6, col(0x6a5aa8), 0); gl.push([x, y, z, 0xffffff, 0.6]); }
      kit.mesh(stP); const sm = kit.mesh(st, {}, true); if (sm) kit.blinker(sm.material, 2.8, { mode: 'sine', lo: 0.55 }); }
    { const tw = new kit.Batch(), tg = new kit.Batch();
      for (let k = 0; k < 5; k++) { const a = k * 1.3 + 0.9, d = rad + 40 + (k % 2) * 60, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, y0 = -30, h = 70 + k * 12;
        tw.frustum(x, y0, z, 3, 1.2, h, 8, col(0x4a3a98), 0);
        for (let r = 0; r < 6; r++) disc(tg, x, y0 + 14 + r * (h / 7), z, 3.5 + (r % 3), 6.5 + (r % 3) * 1.3, 18, neon[(r + k) % neon.length], 0);
        tg.blob(x, y0 + h + 3, z, 3.4, 3.4, 3.4, col(0xffffff), 1); gl.push([x, y0 + h + 3, z, 0xff9af0, 1]); }
      kit.mesh(tw); const tm = kit.mesh(tg, {}, true); if (tm) kit.blinker(tm.material, 3.0, { mode: 'sine', lo: 0.5 }); }
    // ---- comets: glowing heads with long additive tails
    { const tails = [], hb = new kit.Batch();
      for (let k = 0; k < 7; k++) { const a = k * 0.93 + 0.3, d = rad + 150 + (k % 3) * 90, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, y = 20 + (k * 37) % 120, dx = Math.cos(a + 2.4), dz = Math.sin(a + 2.4);
        hb.blob(x, y, z, 3.2, 3.2, 3.2, col(0xffffff), 1); tails.push([x, y, z, x + dx * 190, y + 55, z + dz * 190, 6.5, [0x80f0ff, 0xff9af0, 0xffe080][k % 3], 0.8]); gl.push([x, y, z, 0xbff8ff, 0.9]); }
      kit.mesh(hb, {}, true); shaftMesh(kit, tails); }
    // ---- nebula clouds (huge soft sprites)
    { const nb = [], nb2 = []; for (let k = 0; k < 26; k++) { const a = rng() * TAU, d = rad + 260 + rng() * 360, c = [0x6a2ad0, 0xd0409a, 0x2a70d8, 0x40d0c0, 0x9a40e8][k % 5];
        (k % 2 ? nb : nb2).push([cx + Math.cos(a) * d, -40 + rng() * 200, cz + Math.sin(a) * d, c, 0.55]); }
      glowPoints(kit, nb, 260, 0.34); glowPoints(kit, nb2, 170, 0.3); }
    // ---- neon billboards, road decals, edge glow strips
    const ads = new Signs(kit, makeAtlas(kit, 4, 2, 256, 96, paintNeonAd), 4, 2), dec = new Signs(kit, makeAtlas(kit, 4, 1, 128, 256, paintNeonDecal), 4, 1), pyl = new kit.Batch();
    let ai = 0;
    for (let d = 60; d < L - 30; d += 71) {
      if (d > 1595 && d < 1650) continue;
      const f = kit.frame(d), s = ((d / 71) | 0) & 1 ? 1 : -1, hd = Math.atan2(f.tx, f.tz), p = kit.at(d, s * (f.halfWidth + 5), 0), face = hd + (s > 0 ? Math.PI / 2 : -Math.PI / 2), c = neon[ai % neon.length];
      pyl.box(p[0], p[1] - 1.5, p[2], 0.5, 6.5, 0.5, 0, mul(c, 0.6)); ads.board(p[0], p[1] + 3.0, p[2], 8.4, 3.2, face, ai++ % 8, [1, 1, 1], 0); gl.push([p[0], p[1] + 4.6, p[2], c, 0.8]);
    }
    kit.mesh(pyl, {}, true); ads.mesh({ basic: true });
    for (const [d, cell] of [[110, 0], [260, 1], [420, 0], [700, 2], [860, 1], [1010, 0], [1160, 2], [1330, 1], [1500, 0], [1700, 1], [1860, 2], [1960, 0]]) { if (d > 1590 && d < 1640) continue; dec.strip(d, d + 9, cell === 2 ? -4 : -3, cell === 2 ? 4 : 3, 0.07, cell, [1, 1, 1]); }
    for (let k = 0; k < 4; k++) for (const l of [-5.5, 5.5]) dec.strip(L - 7 - k * 8, L - 2 - k * 8, l - 1.9, l + 1.9, 0.07, 3, [1, 1, 1]);
    dec.mesh({ decal: true, basic: true });
    for (const [c, s] of [[0x66f2ff, -1], [0xff6ad5, 1]]) { const m = kit.trackMat(new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      const hwid = 12; // outer glow strip hugging the slab edge, slightly below the road plane
      kit.ribbon(0, L, s * (hwid + 1.1), s * (hwid + 3.4), -0.35, m, { step: 6 }); }
    glowPoints(kit, gl, 14, 0.75);
  }

  G.defineTrack({
    id: 'rainbow_ribbon', name: 'Rainbow Ribbon', cup: 'special', order: 4, laps: 3, music: 'rainbow', seed: 4041,
    hw: 12, shoulder: 3, scale: 1, style: 'starlight', noWalls: true, rails: true, startArch: true,
    theme: {
      sky: [0x03010f, 0x1e0f5a, 0x0a0430], fog: [0x140a48, 200, 800], ground: 0x000000, shoulder: 0x000000,
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
      beautyRB(track, kit, { cx, cz, rad, neon });
    },
  });
})();
