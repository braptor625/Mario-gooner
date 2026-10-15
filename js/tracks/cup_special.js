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
  const objList = (kit) => kit.add(new (THREE.Group)());
  // shared simple helpers for hazards
  const mkHazard = (kind, r) => ({ x: 0, y: 0, z: 0, radius: r, hitKind: kind, vx: 0, vz: 0, active: false, object3D: null });
  function sharedMesh(kit, geo, mat) { kit.trackGeom(geo); if (mat) kit.trackMat(mat); return new THREE.Mesh(geo, mat); }
  function batchGeo(kit, b) { const g = b.build(); kit.trackGeom(g); return g; }

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
      hw: 12, shoulder: 3, scale: 1, style: 'meadow', noWalls: true, ground: false, startArch: true, offroad: 'offroad',
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
        const TIERS = 10, SEG = 72;
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
            b.box(Math.cos(a) * r2, y1, Math.sin(a) * r2, 2.2, 1.7 + hash(c, k) * 0.5, 1.8, a + Math.PI / 2, crowd[(hash(c, k + 5) * 7) | 0]);
          }
        }
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
          b.box(Math.cos(a) * r + 2, 69, Math.sin(a) * r, 4, 2.6, 0.2, -a, [col(0xc8302a), col(0x2a54c8), col(0xe6b422)][s % 3]);
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
          sb.box(f.x, f.y + 11.6, f.z, 2 * wd - 4, 2.4, 3.2, hd, col(0xb7432e));
        }
        for (let d = 24; d < L; d += 60) {
          const f = kit.frame(d), s = ((d / 60) | 0) & 1 ? 1 : -1, l = s * (f.halfWidth + 1.6);
          sb.box(f.x + f.rx * l, f.y, f.z + f.rz * l, 0.7, 2.2, 0.7, 0, stone2);
          sb.blob(f.x + f.rx * l, f.y + 2.8, f.z + f.rz * l, 0.8, 0.9, 0.8, col(0xff9a2a), 0);
        }
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
    hw: 12, shoulder: 3, scale: 1, style: 'starlight', noWalls: true, startArch: true,
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
      for (let n = 0; n < 9; n++) {
        const s = 22 + rng() * 38, a = rng() * TAU, dist = rad + 160 + rng() * 260;
        const x = cx + Math.cos(a) * dist, z = cz + Math.sin(a) * dist, y = -20 + rng() * 110, c = col(pcol[n % 6]);
        b.blob(x, y, z, s, s, s, c, 2);
        b.blob(x + s * 0.3, y + s * 0.35, z + s * 0.4, s * 0.55, s * 0.4, s * 0.55, kit.mul(c, 1.18), 1);
        if (n % 3 === 0) disc(b, x, y, z, s * 1.35, s * 1.9, 28, kit.mix(c, [1, 1, 1], 0.5), 0);
        if (n % 3 === 1) b.blob(x + s * 1.9, y + s * 0.5, z, s * 0.28, s * 0.28, s * 0.28, kit.mix(c, [1, 1, 1], 0.3), 1);
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
      const g = new kit.Batch();
      for (let k = 0; k < 9; k++) hoop(kit, g, L * (0.045 + k * 0.105) + (k % 2) * 13, 17, 1.7, 44, neon[k % neon.length], 0);
      // light pylons along the edges
      for (let d = 30; d < L - 20; d += 36) {
        const f = kit.frame(d);
        for (let s = -1; s <= 1; s += 2) {
          const l = s * (f.halfWidth + 1.3), c = neon[((d / 36) | 0) % neon.length];
          g.box(f.x + f.rx * l, f.y, f.z + f.rz * l, 0.5, 2.6, 0.5, 0, kit.mul(c, 0.7));
          g.blob(f.x + f.rx * l, f.y + 3.0, f.z + f.rz * l, 0.7, 0.7, 0.7, c, 0);
        }
      }
      // spiral core: glowing column + level rings at the centre of the helix
      let hx = 0, hz = 0, hn = 0, hy0 = 1e9, hy1 = -1e9;
      for (let d = 495; d < 1085; d += 6) { const f = kit.frame(d); hx += f.x; hz += f.z; hn++; hy0 = Math.min(hy0, f.y); hy1 = Math.max(hy1, f.y); }
      hx /= hn; hz /= hn;
      g.frustum(hx, hy0 - 22, hz, 2.6, 2.2, hy1 - hy0 + 60, 10, col(0x66f2ff), 0);
      for (let y = hy0 - 10, k = 0; y < hy1 + 24; y += 12, k++) disc(g, hx, y, hz, 3, 7.5, 20, neon[k % neon.length], 0);
      kit.mesh(g, {}, true);
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
