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
      const b = new kit.Batch();

      // ---- dense jungle
      const M = 17;
      kit.scatter(330, 1, 60, M, (x, z, i, r) => {
        const s = 0.8 + r() * 1.1, tp = r();
        if (tp < 0.45) {
          b.frustum(x, gy, z, 0.9 * s, 0.5 * s, 6 * s, 6, trunkC, 0);
          b.blob(x, gy + 7.4 * s, z, 3.9 * s, 2.9 * s, 3.9 * s, jit(greens[(r() * 5) | 0], r), 0);
          b.blob(x + 2.1 * s, gy + 6.2 * s, z + 1.3 * s, 2.7 * s, 2.1 * s, 2.7 * s, jit(greens[(r() * 5) | 0], r), 0);
          b.blob(x - 1.7 * s, gy + 6.6 * s, z - 1.0 * s, 2.5 * s, 2.0 * s, 2.5 * s, jit(greens[(r() * 5) | 0], r), 0);
        } else if (tp < 0.8) {
          b.frustum(x, gy, z, 0.45 * s, 0.3 * s, 9 * s, 5, palmC, 0);
          const a0 = r() * 6;
          for (let k = 0; k < 6; k++) frond(b, x, gy + 9 * s, z, a0 + (k * TAU) / 6, 4.6 * s, 0.9 * s, jit(greens[(r() * 5) | 0], r));
        } else {
          for (let k = 0; k < 4; k++) b.blob(x + (r() - 0.5) * 3 * s, gy + 0.9 * s, z + (r() - 0.5) * 3 * s, 1.6 * s, 1.2 * s, 1.6 * s, jit(greens[(r() * 5) | 0], r), 0);
          if (r() < 0.5) b.box(x, gy + 1.2 * s, z, 0.4, 0.4, 0.4, 0, [col(0xff5a6a), col(0xffe14a), col(0xff9ae0)][(r() * 3) | 0]);
        }
      });
      kit.scatter(40, 2, 40, M - 3, (x, z, i, r) => { const s = 1 + r() * 2.4; b.blob(x, gy + 0.3 * s, z, 1.8 * s, 1.1 * s, 1.5 * s, jit(r() < 0.5 ? stoneC : mossC, r), 0); });
      // giant canopy trees overhanging the road edge (high, never over the lane centre)
      for (let d = 30; d < L; d += 34 + ((d * 7) % 13)) {
        const f = kit.frame(d), s = ((d / 34) | 0) & 1 ? 1 : -1, l = s * (f.halfWidth + 9 + rng() * 5), p = kit.at(d, l, 0);
        if (d > DR.cave[0] - 10 && d < DR.cave[1] + 10) continue;
        if (d > DR.dino - 40 && d < DR.dino + 40) continue;
        b.frustum(p[0], gy, p[2], 1.8, 1.1, p[1] - gy + 8, 7, trunkC, 0);
        b.blob(p[0], p[1] + 17, p[2], 8.5, 4.2, 8.5, jit(greens[2], rng), 1);
        b.blob(p[0] + 4, p[1] + 15, p[2] + 3, 6, 3, 6, jit(greens[0], rng), 0);
        for (let v = 0; v < 3; v++) b.box(p[0] + (rng() - 0.5) * 9, p[1] + 8, p[2] + (rng() - 0.5) * 9, 0.12, 8 + rng() * 4, 0.12, 0, greens[3]);
      }
      kit.farScatter(22, 160, (x, z, r) => {
        const h = 60 + r() * 90, R0 = 50 + r() * 60, c = mix(col(0x3a7a4a), col(0x5a8f5a), r());
        b.frustum(x, gy - 6, z, R0, R0 * 0.25, h, 7, c, r() * 3);
        b.frustum(x, gy - 6 + h * 0.8, z, R0 * 0.3, 0, h * 0.35, 7, mul(c, 1.15), 0);
      });

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
        for (let k = 0; k < 6; k++) hoop(kit, rb, rd + k * 3.4, 15 - Math.abs(k - 2.5) * 0.7, 1.0, 26, bone, -0.4);
        const f0 = kit.frame(rd + 8.5);
        for (let k = 0; k <= 5; k++) { const f = kit.frame(rd + k * 3.4), a = 14.2 - Math.abs(k - 2.5) * 0.7; rb.box(f.x, f.y + a - 0.4, f.z, 1.2, 1.0, 3.6, Math.atan2(f.tx, f.tz), bone); }
      }
      // entry gate to the start straight
      { const f = kit.frame(L - 10), hd = Math.atan2(f.tx, f.tz), wd = f.halfWidth + 5;
        for (let s = -1; s <= 1; s += 2) { const x = f.x + f.rx * s * wd, z = f.z + f.rz * s * wd; rb.box(x, f.y - 1, z, 4, 15, 4, hd, stoneC); rb.box(x, f.y + 14, z, 5, 1.2, 5, hd, stoneD); }
        rb.box(f.x, f.y + 14, f.z, 2 * wd + 2, 3, 4.2, hd, stoneC); rb.box(f.x, f.y + 17, f.z, 2 * wd - 4, 2, 3.6, hd, mossC); }
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
      kit.mesh(cb); kit.mesh(gl, {}, true);

      // ---- rope bridge over the river
      const bb = new kit.Batch();
      const plank = [col(0xa8793f), col(0x93672f), col(0xb8894a)];
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
        track._drWater = kit.mesh(wbk, { transparent: true, opacity: 0.9 }); }

      // ---- waterfall + pool beside the ford
      { const f = kit.frame(DR.fall), hd = Math.atan2(f.tx, f.tz), s = 1, cl = s * (f.halfWidth + 46);
        const cx = f.x + f.rx * cl, cz = f.z + f.rz * cl, cb2 = new kit.Batch();
        for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU, r0 = 28 + hash(k, 2) * 8; cb2.frustum(cx + Math.cos(a) * r0 * 0.9 + f.rx * 14, gy - 2, cz + Math.sin(a) * r0 * 0.9 + f.rz * 14, 14 + hash(k, 3) * 8, 7, 34 + hash(k, 4) * 12, 7, mix(col(0x6d6a60), col(0x4d6a45), hash(k, 5)), k); }
        cb2.frustum(cx + f.rx * 14, gy - 2, cz + f.rz * 14, 30, 16, 36, 9, col(0x77746a), 1);
        cb2.blob(cx + f.rx * 14, gy + 36, cz + f.rz * 14, 22, 7, 22, mossC, 1);
        kit.mesh(cb2);
        const fx = f.x + f.rx * (f.halfWidth + 22), fz = f.z + f.rz * (f.halfWidth + 22);
        const pg = kit.trackGeom(new THREE.CircleGeometry(19, 24)); pg.rotateX(-Math.PI / 2);
        const pm = kit.trackMat(new THREE.MeshPhongMaterial({ color: 0x5cc7ee, transparent: true, opacity: 0.88, shininess: 60, specular: 0xffffff }));
        const pool = new THREE.Mesh(pg, pm); pool.position.set(fx + f.rx * 6, gy + 0.2, fz + f.rz * 6); kit.add(pool);
        // falling water curtains
        const wm1 = kit.trackMat(new THREE.MeshBasicMaterial({ color: 0xe8f8ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
        const wm2 = kit.trackMat(new THREE.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
        const topP = f.halfWidth + 31;
        const curt = (dl, w, mat) => {
          const g = new THREE.BufferGeometry(); const y0 = gy + 0.3, y1 = gy + 38;
          const A = kit.at(DR.fall + dl - w / 2, topP, 0), B = kit.at(DR.fall + dl + w / 2, topP, 0);
          g.setAttribute('position', new THREE.Float32BufferAttribute([A[0], y1, A[2], B[0], y1, B[2], B[0], y0, B[2], A[0], y0, A[2]], 3));
          g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals(); kit.trackGeom(g);
          const m = new THREE.Mesh(g, mat); kit.add(m); return m;
        };
        curt(0, 9, wm1); curt(-2.5, 3, wm2); curt(3, 3.5, wm2);
        track._drFall = [wm1, wm2];
        const sp = new kit.Batch();
        for (let k = 0; k < 9; k++) { const q = kit.at(DR.fall + (k - 4) * 1.3, topP - 1.5 - (k % 3) * 1.2, 0); sp.blob(q[0], gy + 1.2 + (k % 2), q[2], 2.2, 1.4, 2.2, [1, 1, 1], 0); }
        kit.mesh(sp, {}, true);
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
      dc(DR.dino, 0, 20.5, 14, 4.6, 14, belly);
      for (let k = -2; k <= 2; k++) { const p = kit.at(DR.dino + k * 5.2, 0, 34); db.frustum(p[0], p[1], p[2], 1.8, 0, 4.2, 5, col(0x4d7a32), k); }
      for (let k = 0; k < 7; k++) dc(DR.dino - 9 + hash(k, 1) * 19, (hash(k, 2) - 0.5) * 14, 27 + hash(k, 3) * 6, 1.6, 1.2, 1.6, spot);
      // neck sweeping up and out over the left side, head looking down the road
      for (let k = 0; k < 9; k++) { const t = k / 8, r = 6.5 - t * 3.2; dc(DR.dino + 12 + t * 26, -t * 15, 27 + Math.sin(t * 1.5) * 24 + t * 6, r, r, r, k & 1 ? skin : skin2); }
      { const hp = kit.at(DR.dino + 40, -16, 55);
        db.blob(hp[0], hp[1], hp[2], 6.2, 4.4, 6.8, skin2, 1); const sn = kit.at(DR.dino + 45.5, -16.5, 53.6); db.blob(sn[0], sn[1], sn[2], 3.6, 2.6, 3.8, skin, 1);
        const e1 = kit.at(DR.dino + 40.5, -21.5, 56.5), e2 = kit.at(DR.dino + 40.5, -10.5, 56.5);
        db.blob(e1[0], e1[1], e1[2], 1.5, 1.5, 1.5, [1, 1, 1], 0); db.blob(e2[0], e2[1], e2[2], 1.5, 1.5, 1.5, [1, 1, 1], 0);
        const q1 = kit.at(DR.dino + 41.7, -21.6, 56.4), q2 = kit.at(DR.dino + 41.7, -10.4, 56.4);
        db.blob(q1[0], q1[1], q1[2], 0.8, 0.8, 0.8, [0.05, 0.05, 0.05], 0); db.blob(q2[0], q2[1], q2[2], 0.8, 0.8, 0.8, [0.05, 0.05, 0.05], 0); }
      // tail
      for (let k = 0; k < 8; k++) { const t = k / 7, r = 6.2 - t * 4.8; dc(DR.dino - 13 - t * 34, t * 14, 22 - t * 9, r, r * 0.9, r, k & 1 ? skin : skin2); }
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
          x: p[0], y: p[1], z: p[2], radius: 3.4, hitKind: 'squish', vx: 0, vz: 0, active: false, object3D: g,
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
          x: p[0], y: p[1], z: p[2], radius: 2.7, hitKind: 'flip', vx: 0, vz: 0, active: false, object3D: g,
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
