// Star Cup: Frosty Floes, Neon Metro, Serpent Coast, Boulder Peak.
// Original courses inspired by the layouts / gameplay roles of four classic kart-racer circuits.
(function () {
  'use strict';
  const G = (window.G = window.G || {});
  const T = THREE;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ------------------------------------------------------------------ canvas guard (node tests)
  function canvasOK() {
    try {
      const c = document.createElement('canvas');
      return typeof c.getContext === 'function' && !!c.getContext('2d');
    } catch (e) { return false; }
  }
  function tex(kit, w, h, draw) {
    if (!canvasOK()) return null;
    try { return kit.makeCanvasTexture(w, h, draw); } catch (e) { return null; }
  }

  // ------------------------------------------------------------------ centerline helpers
  // Rounded polygon: corners [x, z, R]; returns [[x,z,y,hw],...] starting on the straight leading into corner 0.
  function polyPts(corners, o) {
    const n = corners.length, step = o.step || 40, info = [];
    for (let i = 0; i < n; i++) {
      const p = corners[(i + n - 1) % n], c = corners[i], q = corners[(i + 1) % n];
      let ax = c[0] - p[0], az = c[1] - p[1]; const al = Math.hypot(ax, az); ax /= al; az /= al;
      let bx = q[0] - c[0], bz = q[1] - c[1]; const bl = Math.hypot(bx, bz); bx /= bl; bz /= bl;
      const cr = ax * bz - az * bx, dot = ax * bx + az * bz, phi = Math.atan2(Math.abs(cr), dot);
      const R = c[2] || o.R || 50, t = R * Math.tan(phi / 2);
      info.push({ c, ax, az, bx, bz, phi, R, t, sgn: cr >= 0 ? 1 : -1 });
    }
    const arc = (a) => {
      const pts = [], p0x = a.c[0] - a.ax * a.t, p0z = a.c[1] - a.az * a.t;
      const nx = -a.sgn * a.az, nz = a.sgn * a.ax;
      const cx = p0x + nx * a.R, cz = p0z + nz * a.R;
      const vx = -nx * a.R, vz = -nz * a.R;
      const m = Math.max(2, Math.ceil((a.phi * a.R) / 13));
      for (let k = 0; k <= m; k++) {
        const th = a.sgn * a.phi * (k / m), co = Math.cos(th), si = Math.sin(th);
        pts.push([cx + vx * co - vz * si, cz + vx * si + vz * co]);
      }
      return pts;
    };
    const raw = []; let startIdx = 0;
    for (let i = 0; i < n; i++) {
      const A = info[i], B = info[(i + 1) % n];
      const ap = arc(A);
      for (const p of ap) raw.push(p);
      const sx = A.c[0] + A.bx * A.t, sz = A.c[1] + A.bz * A.t;
      const ex = B.c[0] - B.ax * B.t, ez = B.c[1] - B.az * B.t;
      const L = Math.hypot(ex - sx, ez - sz);
      const fr = [];
      for (let s = step; s < L - step * 0.4; s += step) fr.push(s / L);
      if (i === n - 1) { fr.push(o.startT || 0.5); fr.sort((u, v) => u - v); }
      for (const f of fr) {
        if (i === n - 1 && f === (o.startT || 0.5) && !raw.startMark) { startIdx = raw.length; }
        raw.push([sx + (ex - sx) * f, sz + (ez - sz) * f]);
      }
    }
    const pts = raw.slice(startIdx).concat(raw.slice(0, startIdx));
    let s = 0;
    return pts.map((p, i) => {
      if (i > 0) s += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      return [p[0], p[1], o.y ? o.y(s, p[0], p[1]) : 0, o.hw ? o.hw(s) : undefined];
    });
  }

  // Mirrors the engine's centerline sampling so features can be placed by position.
  function sampler(pts) {
    const n = pts.length, K = 48, M = n * K;
    const v = pts.map((p) => new T.Vector3(p[0], p[2] || 0, p[1]));
    const curve = new T.CatmullRomCurve3(v, true, 'centripetal');
    const X = new Float64Array(M + 1), Z = new Float64Array(M + 1), cum = new Float64Array(M + 1);
    for (let m = 0; m <= M; m++) {
      const p = curve.getPoint(m / M); X[m] = p.x; Z[m] = p.z;
      if (m > 0) cum[m] = cum[m - 1] + Math.hypot(X[m] - X[m - 1], Z[m] - Z[m - 1]);
    }
    return {
      L: cum[M],
      dOf(x, z) {
        let b = 0, bd = 1e18;
        for (let m = 0; m < M; m++) { const d = (X[m] - x) * (X[m] - x) + (Z[m] - z) * (Z[m] - z); if (d < bd) { bd = d; b = m; } }
        return cum[b];
      },
      ctrl(i) { return cum[i * K]; },
    };
  }

  // ------------------------------------------------------------------ geometry helpers
  // cylinder / cone between two points
  function tube(b, a, c, r0, r1, sides, k, capEnd) {
    const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    let px = 0, py = 1, pz = 0;
    if (Math.abs(uy) > 0.9) { px = 1; py = 0; }
    // v1 = u x p, v2 = u x v1
    let v1x = uy * pz - uz * py, v1y = uz * px - ux * pz, v1z = ux * py - uy * px;
    const l1 = Math.hypot(v1x, v1y, v1z); v1x /= l1; v1y /= l1; v1z /= l1;
    const v2x = uy * v1z - uz * v1y, v2y = uz * v1x - ux * v1z, v2z = ux * v1y - uy * v1x;
    const ring = (p, r, ang) => {
      const co = Math.cos(ang) * r, si = Math.sin(ang) * r;
      return [p[0] + v1x * co + v2x * si, p[1] + v1y * co + v2y * si, p[2] + v1z * co + v2z * si];
    };
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * TAU, a1 = ((i + 1) / sides) * TAU;
      const b0 = ring(a, r0, a0), b1 = ring(a, r0, a1), t0 = ring(c, r1, a0), t1 = ring(c, r1, a1);
      b.quad(b0, b1, t1, t0, k);
      if (capEnd) b.tri(c, t0, t1, k);
    }
  }
  // instanced mesh helper (no per-frame allocation)
  function makeInst(kit, geom, mat, count) {
    const mesh = new T.InstancedMesh(geom, mat, count);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    kit.add(mesh);
    const m4 = new T.Matrix4(), col = new T.Color();
    return {
      mesh,
      set(i, x, y, z, ry, sx, sy, sz) {
        m4.makeRotationY(ry);
        const e = m4.elements;
        if (sx !== undefined) { e[0] *= sx; e[1] *= sx; e[2] *= sx; e[4] *= sy; e[5] *= sy; e[6] *= sy; e[8] *= sz; e[9] *= sz; e[10] *= sz; }
        e[12] = x; e[13] = y; e[14] = z;
        mesh.setMatrixAt(i, m4);
      },
      color(i, hex) { col.setHex(hex); mesh.setColorAt(i, col); },
      done() { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; },
    };
  }
  // arch / tunnel shell over the road between d0..d1
  function tunnel(kit, b, o) {
    const step = o.step || 5, na = o.na || 12, y0 = o.y0 === undefined ? -3 : o.y0;
    const ringPts = (d, rx, h) => {
      const f = kit.frame(d), out = [];
      const P = (l, y) => [f.x + f.rx * l, f.y + y, f.z + f.rz * l];
      out.push(P(-rx, y0));
      for (let j = 0; j <= na; j++) { const a = Math.PI * (1 - j / na); out.push(P(Math.cos(a) * rx, Math.sin(a) * h)); }
      out.push(P(rx, y0));
      return out;
    };
    const nst = Math.max(1, Math.round((o.d1 - o.d0) / step));
    const shells = [[o.rx, o.h, true]];
    if (o.thick) shells.push([o.rx + o.thick, o.h + o.thick * 0.8, false]);
    const rings = shells.map(() => []);
    for (let k = 0; k <= nst; k++) {
      const d = o.d0 + ((o.d1 - o.d0) * k) / nst;
      shells.forEach((s, si) => rings[si].push(ringPts(d, s[0], s[1])));
    }
    shells.forEach((s, si) => {
      for (let k = 0; k < nst; k++) {
        const A = rings[si][k], B = rings[si][k + 1];
        for (let j = 0; j < A.length - 1; j++) b.quad(A[j], A[j + 1], B[j + 1], B[j], o.color(k, j, s[2]));
      }
    });
    if (o.thick) {
      for (const k of [0, nst]) {
        const A = rings[0][k], B = rings[1][k];
        for (let j = 0; j < A.length - 1; j++) b.quad(A[j], A[j + 1], B[j + 1], B[j], o.rim ? o.rim(j) : o.color(k, j, false));
      }
    }
  }
  // wall strip beside the road
  function roadWall(kit, b, d0, d1, lat, h, thick, k0, k1, step, y0) {
    step = step || 4; y0 = y0 || 0;
    for (let d = d0, i = 0; d < d1 - 0.01; d += step, i++) {
      const e = Math.min(d1, d + step), k = i & 1 ? k1 : k0;
      const a = kit.at(d, lat, y0), c = kit.at(e, lat, y0), a2 = kit.at(d, lat + thick, y0), c2 = kit.at(e, lat + thick, y0);
      const up = (p) => [p[0], p[1] + h, p[2]];
      b.quad(a, up(a), up(c), c, k); b.quad(up(a), up(a2), up(c2), up(c), k); b.quad(a2, c2, up(c2), up(a2), k);
    }
  }
  // height terrain draped around the centerline. height(x,z,i,dd,roadH) -> y ; dd = distance beyond (hw+shoulder)
  function makeTerrain(kit, o) {
    const N = kit.N, cell = o.cell || 10, CH = 16, grid = new Map();
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (let i = 0; i < N; i += 2) {
      const x = kit.px[i], z = kit.pz[i];
      const key = Math.floor(x / CH) * 8192 + Math.floor(z / CH);
      let a = grid.get(key); if (!a) { a = []; grid.set(key, a); } a.push(i);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    const near = (x, z) => {
      const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
      for (let r = 1; r <= 8; r++) {
        let best = -1, bd = 1e18;
        for (let a = cx - r; a <= cx + r; a++) for (let c = cz - r; c <= cz + r; c++) {
          const arr = grid.get(a * 8192 + c); if (!arr) continue;
          for (let k = 0; k < arr.length; k++) {
            const i = arr[k], d = (x - kit.px[i]) * (x - kit.px[i]) + (z - kit.pz[i]) * (z - kit.pz[i]);
            if (d < bd) { bd = d; best = i; }
          }
        }
        if (best >= 0 && bd < (r * CH) * (r * CH)) return best;
      }
      return -1;
    };
    const sh = o.shoulder, under = o.under === undefined ? 1.5 : o.under;
    const h = (x, z) => {
      const i = near(x, z);
      if (i < 0) return o.height(x, z, -1, 999, 0);
      const dc = Math.hypot(x - kit.px[i], z - kit.pz[i]);
      const dd = dc - (kit.hw[i] + sh);
      return o.height(x, z, i, dd, kit.py[i] - under);
    };
    const pad = o.pad || 140;
    const x0 = Math.floor((minX - pad) / cell) * cell, z0 = Math.floor((minZ - pad) / cell) * cell;
    const nx = Math.ceil((maxX + pad - x0) / cell), nz = Math.ceil((maxZ + pad - z0) / cell);
    const H = new Float32Array((nx + 1) * (nz + 1));
    for (let a = 0; a <= nx; a++) for (let c = 0; c <= nz; c++) H[a * (nz + 1) + c] = h(x0 + a * cell, z0 + c * cell);
    const b = new kit.Batch();
    for (let a = 0; a < nx; a++) for (let c = 0; c < nz; c++) {
      const h00 = H[a * (nz + 1) + c], h10 = H[(a + 1) * (nz + 1) + c], h11 = H[(a + 1) * (nz + 1) + c + 1], h01 = H[a * (nz + 1) + c + 1];
      const xa = x0 + a * cell, za = z0 + c * cell;
      const hm = (h00 + h10 + h11 + h01) / 4;
      if (o.skip && o.skip(hm)) continue;
      const k = o.color(xa + cell / 2, za + cell / 2, hm, a, c);
      if (!k) continue;
      const p00 = [xa, h00, za], p10 = [xa + cell, h10, za], p11 = [xa + cell, h11, za + cell], p01 = [xa, h01, za + cell];
      b.tri(p00, p01, p11, k); b.tri(p00, p11, p10, k);
    }
    return { h, mesh: b };
  }
  const colj = (kit, c, r, a) => kit.mul(c, 1 - a + r() * a * 2);

  // ====================================================================================================
  // COURSE 1 — FROSTY FLOES  (frozen-lake circuit with an ice cave, sliding penguins and ice blocks)
  // ====================================================================================================
  (function frosty() {
    const HW = 11;
    const corners = [[330, 0, 70], [400, 190, 70], [250, 240, 55], [190, 140, 50], [70, 150, 45], [20, 245, 55], [-120, 225, 65], [-170, 80, 70], [-95, 0, 60]];
    const L0 = 1250;
    const pts = polyPts(corners, {
      step: 50, startT: 0.62,
      y: (s) => 2.6 * (1 + Math.sin((s / L0) * TAU - 2.2)),
      hw: (s) => HW + 1.2 * Math.sin((s / L0) * TAU * 3),
    });
    const S = sampler(pts), L = S.L;
    const dLake = S.dOf(330, 0) + 90;             // frozen lake on the right-hand sweep
    const dCave = S.dOf(130, 146);                 // ice cave in the S-bend
    const dLake2 = S.dOf(-160, 120);               // late ice sheet
    G.defineTrack({
      id: 'frosty_floes', name: 'Frosty Floes', cup: 'star', order: 1, laps: 3, music: 'snow', seed: 5101,
      hw: HW, shoulder: 5, scale: 1, style: 'glacier', snow: true, offroad: 'offroad',
      walls: 'barrier', wallColors: [0xffffff, 0xbfe0f5],
      theme: {
        sky: [0x4f8fe0, 0xc4e2fb, 0xeaf5ff], fog: [0xd2e8f8, 80, 430], ground: 0xe4f1fb, shoulder: 0xf4f9ff,
        road: [0x7c869c, 0x737d93], curb: [0x2c7ed6, 0xffffff], hemi: [0xe0efff, 0xa4bcd8, 1.0], sun: [0xfff4e4, 0.85],
        emb: 0xd8e8f6, bg: 0xd2e8f8,
      },
      pts,
      pads: [{ d: 40, len: 10, l: -4.5, w: 6 }, { d: 40, len: 10, l: 4.5, w: 6 }, { d: S.dOf(-120, 150) + 10, len: 10, l: 0, w: 8 }],
      jumps: [],
      zones: [
        { d: dLake - 135, len: 270, l: 0, w: 2 * (HW + 7), surface: 'ice', offroad: true, color: 0xb4e2ff },
        { d: dCave - 40, len: 90, l: 0, w: 2 * (HW + 7), surface: 'ice', offroad: true, color: 0xa4d8f8 },
        { d: dLake2 - 25, len: 90, l: 0, w: 2 * (HW + 7), surface: 'ice', offroad: true, color: 0xb4e2ff },
      ],
      itemRows: [0.07, 0.2, 0.36, 0.52, 0.68, 0.84].map((f, i) => ({ d: f * L, count: 5, double: i === 4 })),
      decorate: frostyDecor(dLake, dCave, dLake2),
      hazards: frostyHazards(dLake, dCave),
    });
  })();

  function frostyDecor(dLake, dCave, dLake2) {
    return function (track, kit) {
      const rng = kit.rng, col = kit.col, gy = kit.groundY, L = kit.length;
      const b = new kit.Batch();
      const white = [1, 1, 1];
      // ---- big frozen lake discs (glossy) under the ice zones
      const lakeMat = new T.MeshPhongMaterial({ color: 0x9fd6ff, shininess: 110, specular: 0xffffff, transparent: true, opacity: 0.93 });
      kit.trackMat(lakeMat);
      for (const lk of [{ d: dLake, r: 118 }, { d: dLake2, r: 58 }]) {
        const f = kit.frame(lk.d);
        const geo = kit.trackGeom(new T.CircleGeometry(lk.r, 36)); geo.rotateX(-Math.PI / 2);
        const m = new T.Mesh(geo, lakeMat);
        m.position.set(f.x + f.rx * 8, gy + 0.05, f.z + f.rz * 8); kit.add(m);
        kit.reserve(f.x + f.rx * 8, f.z + f.rz * 8, lk.r * 0.55);
      }
      // ---- trees, mounds, crystals
      const m0 = 11 + 5 + 10 + 4;
      kit.scatter(230, 3, 90, m0, (x, z, i, r) => {
        const s = 0.9 + r() * 1.1;
        b.box(x, gy, z, 0.5 * s, 1.6 * s, 0.5 * s, 0, col(0x5a3d2a));
        const g = colj(kit, col(0x1f6b57), r, 0.12);
        for (let k = 0; k < 4; k++) {
          const r0 = (2.9 - k * 0.65) * s, hh = 2.9 * s, yy = gy + (1.3 + k * 1.7) * s;
          b.frustum(x, yy, z, r0, 0, hh, 7, g, r());
          b.frustum(x, yy + hh * 0.36, z, r0 * 0.64, 0, hh * 0.64, 7, white, 0);
        }
      });
      kit.scatter(110, 1, 70, m0 - 4, (x, z, i, r) => {
        const s = 0.8 + r() * 2.4;
        b.blob(x, gy + 0.2 * s, z, 1.8 * s, 1.0 * s, 1.5 * s, colj(kit, col(0xf4faff), r, 0.04), 1);
      });
      kit.scatter(90, 3, 70, m0 - 2, (x, z, i, r) => {
        const s = 1 + r() * 2.2, c = colj(kit, col(0xa6dcff), r, 0.1);
        for (let k = 0; k < 3; k++) b.frustum(x + (k - 1) * s * 0.7, gy, z + (r() - 0.5) * s, 0.55 * s, 0, (2.2 + r() * 3.6) * s, 5, c, 0);
      });
      // snowmen (original: top-hatted "Frostkins")
      kit.scatter(9, 2, 22, m0 - 6, (x, z, i, r) => {
        b.blob(x, gy + 0.9, z, 1.2, 1.0, 1.2, white, 0); b.blob(x, gy + 2.1, z, 0.9, 0.8, 0.9, white, 0); b.blob(x, gy + 3.0, z, 0.65, 0.6, 0.65, white, 0);
        b.box(x - 0.15, gy + 2.95, z + 0.55, 0.15, 0.15, 0.6, 0, col(0xff7a1a));
        b.box(x - 0.5, gy + 3.5, z - 0.5, 1.0, 0.8, 1.0, 0, col(0x2a2a40));
      });
      // igloos
      kit.scatter(7, 4, 40, m0 + 2, (x, z, i, r) => {
        b.blob(x, gy, z, 3.4, 2.6, 3.4, col(0xeef7ff), 1);
        const f = r() * TAU;
        b.box(x + Math.cos(f) * 3.2, gy, z + Math.sin(f) * 3.2, 1.8, 1.6, 2.2, -f, col(0xcfe6f6));
      });
      // far ice mountains
      kit.farScatter(24, 100, (x, z, r) => {
        const s = 28 + r() * 40, h = s * (1.0 + r() * 0.8);
        b.frustum(x, gy - 3, z, s, 0, h, 6, col(0x9db9d6), r() * 3);
        b.frustum(x, gy - 3 + h * 0.5, z, s * 0.52, 0, h * 0.5, 6, white, 0);
      });
      kit.mesh(b, {}, false);

      // ---- ice cave in the S-bend
      const cb = new kit.Batch(), cI = col(0xbfe6ff), cI2 = col(0x9fd2f5), cO = col(0xeaf6ff), cO2 = col(0xd6ecfa);
      const d0 = dCave - 36, d1 = dCave + 54;
      tunnel(kit, cb, {
        d0, d1, step: 5, na: 12, rx: 11 + 5 + 2, h: 13, thick: 4.5, y0: -2,
        color: (k, j, inner) => (inner ? ((k + j) & 1 ? cI : cI2) : ((k + j) & 1 ? cO : cO2)),
        rim: (j) => (j & 1 ? col(0xffffff) : col(0xdff0fb)),
      });
      // stalactites + stalagmite fangs
      for (let d = d0 + 6; d < d1 - 3; d += 4 + rng() * 4) {
        const l = (rng() - 0.5) * 24, f = kit.frame(d);
        const p = [f.x + f.rx * l, f.y + 11.5 - Math.abs(l) * 0.32, f.z + f.rz * l];
        const h = 2 + rng() * 3.2;
        cb.frustum(p[0], p[1] - h, p[2], 0.05, 0.55 + rng() * 0.4, h, 5, col(0xdff3ff), 0);
      }
      kit.mesh(cb, {}, false);
      // ---- ice arches over the road (landmark gates)
      const ab = new kit.Batch();
      for (const d of [L * 0.06, dLake - 150, dLake2 + 90]) {
        tunnel(kit, ab, {
          d0: d, d1: d + 7, step: 3.5, na: 12, rx: 11 + 7, h: 12, thick: 2.5, y0: -2,
          color: (k, j, inner) => (inner ? cI : cO), rim: () => white,
        });
      }
      kit.mesh(ab, {}, false);
      // frost glow lanterns along cave
      const lb = new kit.Batch();
      for (let d = d0 + 8; d < d1 - 4; d += 12) for (const s of [-1, 1]) {
        const p = kit.at(d, s * 17.2, 1.2); lb.box(p[0], p[1], p[2], 0.7, 0.7, 0.7, 0, col(0x9fe8ff));
      }
      kit.mesh(lb, {}, true);
    };
  }

  function frostyHazards(dLake, dCave) {
    return function (track, kit) {
      const list = [], col = kit.col;
      // Chillybill: belly-sliding skater (original), one shared geometry
      const pb = new kit.Batch(), navy = col(0x1d2a52), wht = [1, 1, 1], org = col(0xff8a1a), red = col(0xe8383d);
      pb.blob(0, 0.55, 0, 0.8, 0.5, 1.2, navy, 1);
      pb.blob(0, 0.42, 0.2, 0.62, 0.34, 0.95, wht, 1);
      pb.blob(0, 0.85, 1.05, 0.48, 0.46, 0.48, navy, 1);
      pb.blob(0, 0.78, 1.28, 0.34, 0.26, 0.3, wht, 0);
      pb.box(0, 0.8, 1.6, 0.2, 0.12, 0.42, 0, org);
      pb.box(-0.22, 1.1, 1.38, 0.1, 0.1, 0.1, 0, wht); pb.box(0.22, 1.1, 1.38, 0.1, 0.1, 0.1, 0, wht);
      pb.box(-0.95, 0.5, 0.2, 0.95, 0.1, 0.55, 0.5, navy); pb.box(0.95, 0.5, 0.2, 0.95, 0.1, 0.55, -0.5, navy);
      pb.box(-0.3, 0.3, -1.25, 0.34, 0.1, 0.46, 0.2, org); pb.box(0.3, 0.3, -1.25, 0.34, 0.1, 0.46, -0.2, org);
      pb.box(0, 0.88, 0.7, 0.9, 0.24, 0.34, 0, red);
      pb.box(-0.5, 0.7, 0.45, 0.3, 0.3, 0.7, 0, red);
      const pg = kit.trackGeom(pb.build());
      const pm = kit.trackMat(new T.MeshLambertMaterial({ vertexColors: true }));
      const n = 9;
      const pen = makeInst(kit, pg, pm, n);
      const ib = new kit.Batch();
      ib.box(0, 0, 0, 3.2, 2.6, 3.2, 0, col(0xcdeeff));
      ib.box(0, 2.6, 0, 2.6, 0.5, 2.6, 0, col(0xffffff));
      ib.box(0, 0.6, 0, 3.3, 0.5, 3.3, 0, col(0x9fd2f5));
      const ig = kit.trackGeom(ib.build());
      const im = kit.trackMat(new T.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
      const nb = 6;
      const blk = makeInst(kit, ig, im, nb);

      // penguins glide in loops on the lake, a few on the late ice sheet and the cave floor
      const spec = [
        [dLake - 100, -3, 7.5, 0.95], [dLake - 40, 4, 7, -1.05], [dLake + 20, -2, 8, 0.9], [dLake + 85, 2, 7.2, -0.85],
        [dLake - 70, 1, 4.5, 1.3], [dLake + 50, -3, 4.2, -1.3], [dCave + 6, 0, 5.2, 1.1], [dCave - 12, 1, 4.6, -1.15],
        [dLake + 120, 0, 6, 1],
      ];
      const items = [];
      spec.forEach((s, i) => {
        const f = kit.frame(s[0]);
        const cx = f.x + f.rx * s[1], cz = f.z + f.rz * s[1];
        const hz = { x: cx, y: f.y, z: cz, radius: 1.9, hitKind: 'spin', vx: 0, vz: 0, active: true, ph: i * 1.7, c: [cx, cz, f.y, s[2], s[3]] };
        hz.update = function (dt, time) {
          const c = this.c, a = this.ph + time * c[4], r = c[3];
          this.x = c[0] + Math.cos(a) * r; this.z = c[1] + Math.sin(a) * r;
          this.vx = -Math.sin(a) * r * c[4]; this.vz = Math.cos(a) * r * c[4];
          pen.set(i, this.x, c[2] + 0.05, this.z, Math.atan2(this.vx, this.vz) * 1, 1.3, 1.3, 1.3);
          if (i === n - 1) pen.done();
        };
        hz.update(0, 0); items.push(hz); list.push(hz);
      });
      // sliding ice blocks that cross the road
      const bs = [[dLake - 120, 0.5], [dLake - 15, -1.6], [dLake + 60, 2.7], [dLake + 105, 0.9], [dCave + 30, 4.1], [dCave - 28, 5.2]];
      bs.forEach((s, i) => {
        const f = kit.frame(s[0]);
        const hz = { x: f.x, y: f.y, z: f.z, radius: 2.1, hitKind: 'spin', vx: 0, vz: 0, active: true };
        const amp = f.halfWidth - 3.2, w = 0.55 + (i % 3) * 0.12;
        hz.update = function (dt, time) {
          const a = s[1] + time * w, l = Math.sin(a) * amp;
          this.x = f.x + f.rx * l; this.z = f.z + f.rz * l;
          const lv = Math.cos(a) * amp * w;
          this.vx = f.rx * lv; this.vz = f.rz * lv;
          blk.set(i, this.x, f.y, this.z, a * 0.3);
          if (i === nb - 1) blk.done();
        };
        hz.update(0, 0); list.push(hz);
      });
      return list;
    };
  }

  // @@END
})();
