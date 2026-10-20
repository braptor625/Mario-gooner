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
  const poseE = new T.Euler(), poseQ = new T.Quaternion(), poseV = new T.Vector3(), poseS = new T.Vector3();
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
      // full pose (launched hazards): position, euler rotation, uniform scale
      pose(i, x, y, z, rx, ry, rz, sc) {
        poseE.set(rx, ry, rz); poseQ.setFromEuler(poseE);
        const k = Math.max(0.0001, sc);
        m4.compose(poseV.set(x, y, z), poseQ, poseS.set(k, k, k));
        mesh.setMatrixAt(i, m4);
      },
      done() { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; },
    };
  }
  // arch / tunnel shell over the road between d0..d1
  function tunnel(kit, b, o) {
    const step = o.step || 5, na = o.na || 12, y0 = o.y0 === undefined ? -3 : o.y0;
    const ringPts = (d, rx, h) => {
      if (o.hf) h = o.hf(d) + (h - o.h);
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
    const sh = o.shoulder || 0, under = o.under === undefined ? 1.5 : o.under;
    const h = (x, z) => {
      if (o.direct) return o.height(x, z, -1, 0, 0);
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
  // SHARED BEAUTY HELPERS (kit API only): glow sprites, painted signage atlases, props
  // ====================================================================================================
  const ADD = T.AdditiveBlending;
  const _nr = { i: 0, dist: 0, ang: 0 };
  // nearest centreline sample to (x,z): index, distance, and the heading that faces the road from there
  function nearRoad(kit, x, z) {
    let bi = 0, bd = 1e18;
    for (let i = 0; i < kit.N; i += 2) { const dx = kit.px[i] - x, dz = kit.pz[i] - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; bi = i; } }
    _nr.i = bi; _nr.dist = Math.sqrt(bd); _nr.ang = Math.atan2(kit.px[bi] - x, kit.pz[bi] - z);
    return _nr;
  }
  function softMap(kit) {
    if (G.GFX && G.GFX.tex && G.GFX.tex.soft) return G.GFX.tex.soft;
    return tex(kit, 64, 64, (c) => {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    });
  }
  // camera-facing soft glow sprites (one Points draw). pts: [[x,y,z,hex?]]. o: {size, alpha, color, normal, fog}
  function halos(kit, pts, o) {
    if (!pts.length) return null;
    o = o || {};
    const pos = new Float32Array(pts.length * 3), cc = new Float32Array(pts.length * 3);
    pts.forEach((p, i) => {
      pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2];
      const c = kit.col(p[3] !== undefined ? p[3] : (o.color !== undefined ? o.color : 0xffffff));
      cc[i * 3] = c[0]; cc[i * 3 + 1] = c[1]; cc[i * 3 + 2] = c[2];
    });
    const g = kit.trackGeom(new T.BufferGeometry());
    g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(cc, 3));
    const m = kit.trackMat(new T.PointsMaterial({
      size: o.size || 4, sizeAttenuation: true, map: softMap(kit), vertexColors: true, transparent: true, opacity: o.alpha !== undefined ? o.alpha : 0.8,
      depthWrite: false, blending: o.normal ? T.NormalBlending : ADD, fog: o.fog !== false,
    }));
    const pt = new T.Points(g, m); pt.frustumCulled = false; pt.renderOrder = 7; kit.add(pt);
    return m;
  }
  // flat soft light pools on the ground (one mesh). spots: [[x,y,z,radius,hex]]
  function pools(kit, spots, o) {
    if (!spots.length) return null;
    o = o || {};
    const b = new kit.Batch(true), col = kit.col;
    for (const s of spots) {
      const k = col(s[4]), r = s[3], y = s[1] + 0.09;
      b.quadUV([s[0] - r, y, s[2] - r], [s[0] + r, y, s[2] - r], [s[0] + r, y, s[2] + r], [s[0] - r, y, s[2] + r], k, [0, 0, 1, 0, 1, 1, 0, 1]);
    }
    const mo = { map: softMap(kit), transparent: true, depthWrite: false, opacity: o.alpha !== undefined ? o.alpha : 0.75, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 };
    if (!o.normal) mo.blending = ADD;
    const m = kit.mesh(b, mo, true); if (m) m.renderOrder = 3;
    return m;
  }
  // painted rounded-rect brand plate (original brands) into a canvas cell
  function rrect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  function logo(c, kind, cx, cy, s, fg, bg) {
    c.save(); c.translate(cx, cy); c.fillStyle = fg; c.strokeStyle = fg; c.lineWidth = s * 0.14; c.lineJoin = 'round';
    if (kind === 'circle') { c.beginPath(); c.arc(0, 0, s * 0.8, 0, TAU); c.fill(); c.fillStyle = bg; c.beginPath(); c.arc(0, 0, s * 0.42, 0, TAU); c.fill(); }
    else if (kind === 'star') { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i & 1 ? s * 0.38 : s * 0.95; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill(); }
    else if (kind === 'bolt') { c.beginPath(); c.moveTo(s * 0.2, -s); c.lineTo(-s * 0.6, s * 0.1); c.lineTo(-s * 0.05, s * 0.1); c.lineTo(-s * 0.3, s); c.lineTo(s * 0.65, -s * 0.2); c.lineTo(s * 0.05, -s * 0.2); c.closePath(); c.fill(); }
    else if (kind === 'flake') { for (let i = 0; i < 3; i++) { c.rotate(Math.PI / 3); c.beginPath(); c.moveTo(0, -s * 0.9); c.lineTo(0, s * 0.9); c.stroke(); } }
    else if (kind === 'wave') { c.beginPath(); c.moveTo(-s, 0); c.bezierCurveTo(-s * 0.5, -s * 0.9, 0, s * 0.9, s * 0.5, -s * 0.1); c.bezierCurveTo(s * 0.7, -s * 0.5, s * 0.9, -s * 0.3, s, 0); c.stroke(); }
    else if (kind === 'diamond') { c.beginPath(); c.moveTo(0, -s); c.lineTo(s * 0.8, 0); c.lineTo(0, s); c.lineTo(-s * 0.8, 0); c.closePath(); c.fill(); }
    else if (kind === 'flame') { c.beginPath(); c.moveTo(0, -s); c.bezierCurveTo(s * 0.9, -s * 0.2, s * 0.8, s * 0.9, 0, s); c.bezierCurveTo(-s * 0.8, s * 0.9, -s * 0.9, -s * 0.1, 0, -s); c.fill(); }
    else if (kind === 'leaf') { c.beginPath(); c.moveTo(-s, s * 0.6); c.quadraticCurveTo(-s * 0.6, -s, s, -s * 0.7); c.quadraticCurveTo(s * 0.7, s * 0.6, -s, s * 0.6); c.fill(); }
    else if (kind === 'ring') { c.beginPath(); c.arc(0, 0, s * 0.7, 0, TAU); c.stroke(); c.beginPath(); c.arc(0, 0, s * 0.25, 0, TAU); c.fill(); }
    c.restore();
  }
  // atlas of brand plates: items [{t, sub, fg, bg, ic}], 2 columns x rows, cell 512x128 (4:1) -> texture
  function brandAtlas(kit, items, rows) {
    const cw = 512, ch = 128, cols = 2;
    return tex(kit, cols * cw, rows * ch, (c, w, h) => {
      c.fillStyle = '#10121c'; c.fillRect(0, 0, w, h);
      items.forEach((it, i) => {
        const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
        const g = c.createLinearGradient(0, y, 0, y + ch); g.addColorStop(0, it.bg); g.addColorStop(1, it.bg2 || it.bg);
        c.fillStyle = g; rrect(c, x + 4, y + 4, cw - 8, ch - 8, 16); c.fill();
        c.strokeStyle = it.fg; c.lineWidth = 6; rrect(c, x + 10, y + 10, cw - 20, ch - 20, 12); c.stroke();
        logo(c, it.ic || 'circle', x + 62, y + ch / 2, 34, it.fg, it.bg);
        c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = it.tc || '#ffffff';
        let fs = it.sub ? 50 : 60; c.font = '900 ' + fs + 'px "Trebuchet MS", Arial Black, Arial, sans-serif';
        while (c.measureText(it.t).width > 360 && fs > 20) { fs -= 2; c.font = '900 ' + fs + 'px "Trebuchet MS", Arial Black, Arial, sans-serif'; }
        c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 6; c.fillText(it.t, x + 112, y + ch / 2 - (it.sub ? 13 : 0)); c.shadowBlur = 0;
        if (it.sub) { c.font = '700 26px "Trebuchet MS", Arial, sans-serif'; c.fillStyle = it.fg; c.fillText(it.sub, x + 114, y + ch / 2 + 28); }
      });
    });
  }
  // advert boards / road-side signs sharing one brand atlas (2 draws: frames + painted plates)
  function Ads(kit, items) {
    const rows = Math.ceil(items.length / 2), map = brandAtlas(kit, items, rows), solid = new kit.Batch(), plates = new kit.Batch(true), col = kit.col;
    const uv = (i) => { const u0 = (i % 2) * 0.5, v1 = 1 - Math.floor(i / 2) / rows; return [u0, v1 - 1 / rows, u0 + 0.5, v1]; };
    const api = {
      map, rows,
      // a plate on a frame: centre-bottom (x,y0,z), faces heading ry (front = +z local), w x h metres
      board(x, y0, z, ry, w, h, idx, frame, legs) {
        const c = Math.cos(ry), s = Math.sin(ry), P = (l, y, f) => [x + l * c + (f || 0) * s, y, z - l * s + (f || 0) * c], k = col(frame !== undefined ? frame : 0x2a2f3a);
        solid.box(x, y0 + (legs || 0), z, w + 0.5, h + 0.5, 0.25, ry, k);
        if (legs) for (const sd of [-1, 1]) { const q = P(sd * (w / 2 - 0.2), 0); solid.box(q[0], y0, q[2], 0.22, legs, 0.22, ry, k); }
        const t = uv(idx), yb = y0 + (legs || 0) + 0.25, yt = yb + h - 0.0;
        plates.quadUV(P(-w / 2, yb, 0.14), P(w / 2, yb, 0.14), P(w / 2, yt, 0.14), P(-w / 2, yt, 0.14), [1, 1, 1], [t[0], t[1], t[2], t[1], t[2], t[3], t[0], t[3]]);
      },
      // painted plate lying on the road (reads forward), at distance d, lateral l
      road(d, l, w, len, idx) {
        const t = uv(idx), y = 0.075;
        plates.quadUV(kit.at(d, l - w / 2, y), kit.at(d, l + w / 2, y), kit.at(d + len, l + w / 2, y), kit.at(d + len, l - w / 2, y), [0.95, 0.95, 0.95], [t[0], t[1], t[2], t[1], t[2], t[3], t[0], t[3]]);
      },
      finish(opts) {
        kit.mesh(solid, {}, false);
        kit.mesh(plates, Object.assign(map ? { map } : { color: 0xffffff }, opts || {}), true);
      },
    };
    return api;
  }
  // flat painted road decal from a brand atlas cell (reads forward along the road). returns nothing; pass a uvMode Batch
  function roadPlate(kit, plates, d, l, w, len, idx, rows, dy) {
    const u0 = (idx % 2) * 0.5, v1 = 1 - Math.floor(idx / 2) / rows, v0 = v1 - 1 / rows, y = dy || 0.07;
    plates.quadUV(kit.at(d, l - w / 2, y), kit.at(d, l + w / 2, y), kit.at(d + len, l + w / 2, y), kit.at(d + len, l - w / 2, y), [1, 1, 1], [u0, v0, u0 + 0.5, v0, u0 + 0.5, v1, u0, v1]);
  }
  // white painted start-grid boxes behind the line (matches getStartGrid layout)
  function gridBoxes(kit, b, hex) {
    const k = kit.col(hex === undefined ? 0xffffff : hex), L = kit.length;
    for (let n = 0; n < 8; n++) {
      const row = n >> 1, side = n & 1 ? 1 : -1, d = L - 8 - row * 6 - (n & 1 ? 3 : 0), l = side * 4;
      const q = (dd, ll) => kit.at(dd, ll, 0.075);
      const bar = (a0, a1, l0, l1) => b.quad(q(a0, l0), q(a0, l1), q(a1, l1), q(a1, l0), k);
      bar(d - 2.6, d - 2.45, l - 1.4, l + 1.4);      // rear edge
      bar(d - 2.6, d + 0.4, l - 1.4, l - 1.25); bar(d - 2.6, d + 0.4, l + 1.25, l + 1.4);
    }
  }
  // small helper: rotate a local (lx, lz) offset by heading ry (matches Batch.box convention)
  const rotX = (lx, lz, ry) => lx * Math.cos(ry) + lz * Math.sin(ry);
  const rotZ = (lx, lz, ry) => -lx * Math.sin(ry) + lz * Math.cos(ry);
  // wooden lamp post with lantern head; lights are pushed into `lights` for halos/pools
  function lampPost(b, x, y, z, ry, h, post, glow, lights, side) {
    b.box(x, y, z, 0.3, h, 0.3, ry, post);
    b.box(x, y, z, 0.7, 0.35, 0.7, ry, post);
    const ax = x + rotX(0, side * 0.9, ry), az = z + rotZ(0, side * 0.9, ry);
    b.box(x + (ax - x) * 0.5, y + h - 0.1, z + (az - z) * 0.5, 0.18, 0.18, 0.18 + Math.abs(side) * 0.9, ry, post);
    b.box(ax, y + h - 0.55, az, 0.5, 0.55, 0.5, ry, glow);
    b.box(ax, y + h - 0.0, az, 0.7, 0.14, 0.7, ry, post);
    if (lights) lights.push([ax, y + h - 0.3, az]);
  }

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
        sky: [0x2a5fc8, 0x8cc2f4, 0xf2e6f6], fog: [0xd6e6f8, 100, 520], ground: 0xc9dff0, shoulder: 0xeef6fd,
        road: [0x5d6880, 0x555f77], curb: [0x2c7ed6, 0xffffff], hemi: [0xdbeaff, 0x9db4d0, 0.8], sun: [0xfff4e4, 0.6],
        emb: 0xd8e8f6, bg: 0xd2e8f8,
      },
      pts,
      pads: [{ d: 40, len: 10, l: -4.5, w: 6 }, { d: 40, len: 10, l: 4.5, w: 6 }, { d: S.dOf(-120, 150) + 10, len: 10, l: 0, w: 8 }],
      jumps: [],
      zones: [
        { d: dLake - 135, len: 270, l: 0, w: 2 * (HW + 7), surface: 'ice', offroad: true, color: 0xd2f0ff },
        { d: dCave - 40, len: 90, l: 0, w: 2 * (HW + 7), surface: 'ice', offroad: true, color: 0xc4e8ff },
        { d: dLake2 - 25, len: 90, l: 0, w: 2 * (HW + 7), surface: 'ice', offroad: true, color: 0xd2f0ff },
      ],
      itemRows: [0.07, 0.2, 0.36, 0.52, 0.68, 0.84].map((f, i) => ({ d: f * L, count: 5, double: i === 4 })),
      decorate: frostyDecor(dLake, dCave, dLake2),
      hazards: frostyHazards(dLake, dCave),
    });
  })();

  function frostyDecor(dLake, dCave, dLake2) {
    return function (track, kit) {
      const rng = kit.rng, col = kit.col, gy = kit.groundY, L = kit.length;
      const b = new kit.Batch(), pf = new kit.Batch();   // pf: pines (wind-swayed)
      const white = [1, 1, 1];
      // ---- big frozen lake discs (glossy) under the ice zones
      const lakeMat = kit.waterMat({ color: 0x9fd6ff, deep: 0x5aa8e0, opacity: 0.93, waveScale: 0.25 });   // glossy ice, faint glints
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
        pf.box(x, gy, z, 0.5 * s, 1.6 * s, 0.5 * s, 0, col(0x5a3d2a));
        const g = colj(kit, col(0x1f6b57), r, 0.12);
        for (let k = 0; k < 4; k++) {
          const r0 = (2.9 - k * 0.65) * s, hh = 2.9 * s, yy = gy + (1.3 + k * 1.7) * s;
          pf.frustum(x, yy, z, r0, 0, hh, 7, g, r());
          pf.frustum(x, yy + hh * 0.36, z, r0 * 0.64, 0, hh * 0.64, 7, white, 0);
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
      kit.foliage(pf, { strength: 0.3, heightScale: 0.16 });
      kit.crowdStand({ d0: L - 50, d1: L + 70, side: -1, l0: 11 + 5 + 3.5, rows: 2, gap: 1.3, rise: 0, step: 2.3, scale: 1.1, radius: 55, colors: [0x2c7ed6, 0xe8383d, 0xffd23a, 0xffffff, 0x35c0d9, 0xff8ad0] });
      kit.crowdStand({ d0: L - 50, d1: L + 70, side: 1, l0: 11 + 5 + 3.5, rows: 2, gap: 1.3, rise: 0, step: 2.3, scale: 1.1, radius: 55, colors: [0x2c7ed6, 0xe8383d, 0xffd23a, 0xffffff, 0x35c0d9, 0xff8ad0] });
      for (let d = 10; d < 160; d += 30) for (let sd = -1; sd <= 1; sd += 2) kit.flagAt(d, sd * (11 + 5 + 1.2), 2.4, 1.4, [[0x2c7ed6, 0xffffff], [0xe8383d, 0xffffff]][((d / 30) | 0) & 1], { pole: 6.5 });
      kit.birds({ cx: 150, cz: 120, y: 48, radius: 130, count: 7, speed: 0.1, body: 0x808890, wing: 0xffffff });

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
      { const lm = kit.mesh(lb, {}, true); if (lm) kit.blinker(lm.material, 3.0, { mode: 'sine', lo: 0.55 }); }
      // dripping meltwater under the cave roof
      { const em = []; for (let d = d0 + 8; d < d1 - 6; d += 7) { const l = (rng() - 0.5) * 18, f = kit.frame(d); em.push([f.x + f.rx * l, f.y + 11.5 - Math.abs(l) * 0.32, f.z + f.rz * l]); }
        kit.particles({ emitters: em, count: 2, vel: [0, 0, 0], spread: [0.05, 0, 0.05], life: 1.3, grav: -16, size: 0.32, alpha: 0.9, pow: 0.4, fadeIn: 0.02, color: [0xcdf0ff, 0xffffff] }); }
      frostyExtra(kit, dLake, dCave, dLake2);
    };
  }

  // ---- Frosty Floes beauty pass: aurora, chalets, snowmen, ice sculptures, lake cracks, adverts, lamps
  function frostyExtra(kit, dLake, dCave, dLake2) {
    const rng = kit.rng, col = kit.col, gy = kit.groundY, L = kit.length, white = [1, 1, 1];
    // ---------------- aurora curtains (camera-locked, additive)
    {
      const at = tex(kit, 512, 128, (c, w, h) => {
        c.clearRect(0, 0, w, h);
        for (let x = 0; x < w; x += 2) {
          const a = 0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.sin(x * 0.05 + Math.sin(x * 0.013) * 3), 2), hh = h * (0.55 + 0.45 * Math.sin(x * 0.021 + 1));
          const g = c.createLinearGradient(0, h, 0, h - hh);
          g.addColorStop(0, 'rgba(60,255,170,0)'); g.addColorStop(0.2, 'rgba(90,255,190,' + (0.7 * a) + ')'); g.addColorStop(0.65, 'rgba(70,200,255,' + (0.45 * a) + ')'); g.addColorStop(1, 'rgba(190,110,255,0)');
          c.fillStyle = g; c.fillRect(x, h - hh, 2, hh);
        }
      });
      if (at) {
        at.wrapS = T.RepeatWrapping;
        for (let k = 0; k < 2; k++) {
          const segs = 48, a0 = k ? 3.6 : 0.4, span = k ? 1.9 : 2.5, R = k ? 285 : 275, P = [], U = [], I = [];
          for (let i = 0; i <= segs; i++) {
            const u = i / segs, a = a0 + u * span, sw = Math.sin(u * 9 + k * 2) * 14, y0 = (k ? 70 : 82) + sw, y1 = y0 + 62 + Math.sin(u * 5 + k) * 18;
            P.push(Math.cos(a) * R, y0, Math.sin(a) * R, Math.cos(a) * R, y1, Math.sin(a) * R); U.push(u * 2, 0, u * 2, 1);
            if (i < segs) { const q = i * 2; I.push(q, q + 1, q + 3, q, q + 3, q + 2); }
          }
          const g = kit.trackGeom(new T.BufferGeometry());
          g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(U, 2)); g.setIndex(I);
          const m = new T.Mesh(g, kit.trackMat(new T.MeshBasicMaterial({ map: at, transparent: true, blending: ADD, depthWrite: false, fog: false, side: T.DoubleSide, opacity: 0.95, color: k ? 0xd8a8ff : 0xffffff })));
          m.renderOrder = -996; kit.follow(m); kit.add(m);
        }
        kit.scroll(at, 0.012, 0);
      }
    }
    const b = new kit.Batch(), pf = new kit.Batch(), wb = new kit.Batch(true), lights = [], smoke = [];
    const wood = [col(0x8a5a34), col(0x7a4c2a)], roofSnow = col(0xf6fbff), eave = col(0x5a3a22), stone = col(0x8a8f9a);
    const edgeOK = (x, z, m) => kit.clear(x, z, m);
    // ---------------- chalets with lit windows
    const chalet = (x, y, z, ry, s) => {
      const R = (lx, lz) => [x + rotX(lx * s, lz * s, ry), z + rotZ(lx * s, lz * s, ry)];
      for (let k = 0; k < 4; k++) b.box(x, y + k * 0.85 * s, z, 7 * s, 0.85 * s, 5.5 * s, ry, wood[k & 1]);
      const ys = y + 3.4 * s, ry0 = y + 5.7 * s;
      for (const sd of [-1, 1]) {
        const e0 = R(-4 * s / s * 1, sd * 3.1), e1 = R(4, sd * 3.1), r0 = R(-4, 0), r1 = R(4, 0);
        b.quad([e0[0], ys, e0[1]], [e1[0], ys, e1[1]], [r1[0], ry0, r1[1]], [r0[0], ry0, r0[1]], roofSnow);
        const o0 = R(-4, sd * 3.5), o1 = R(4, sd * 3.5);
        b.quad([o0[0], ys - 0.25 * s, o0[1]], [o1[0], ys - 0.25 * s, o1[1]], [e1[0], ys, e1[1]], [e0[0], ys, e0[1]], eave);
      }
      for (const sd of [-1, 1]) { const a = R(sd * 3.5, -2.75), c = R(sd * 3.5, 2.75), t = R(sd * 3.5, 0); b.tri([a[0], ys, a[1]], [c[0], ys, c[1]], [t[0], ry0 - 0.1, t[1]], wood[0]); }
      const ch = R(2.2, -1.2); b.box(ch[0], y + 3 * s, ch[1], 1 * s, 3.4 * s, 1 * s, ry, stone); b.box(ch[0], y + 6.3 * s, ch[1], 1.3 * s, 0.35 * s, 1.3 * s, ry, roofSnow);
      if (smoke.length < 8) smoke.push([ch[0], y + 6.7 * s, ch[1]]);
      const dr = R(-1.5, 2.8); b.box(dr[0], y, dr[1], 1.3 * s, 2.2 * s, 0.14, ry, col(0xa83a2a));
      const win = (lx, lz, nrm) => {
        const p = R(lx, lz), wy = y + 1.5 * s, hr = ry + nrm;
        b.box(p[0], wy - 0.1, p[1], 1.8 * s, 1.5 * s, 0.1, hr, col(0xf4efe6));
        const q = [p[0] + Math.sin(hr) * 0.08, p[1] + Math.cos(hr) * 0.08];
        wb.box(q[0], wy + 0.1, q[1], 1.35 * s, 1.1 * s, 0.1, hr, [1, 0.78, 0.35]);
        lights.push([q[0] + Math.sin(hr) * 0.4, wy + 0.6 * s, q[1] + Math.cos(hr) * 0.4, 0xffb858]);
      };
      win(1.6, 2.78, 0); win(-4, 0.8 * 0, 0);
      const side = R(3.52, 0); b.box(side[0], y + 1.4 * s, side[1], 0.2, 1.4 * s, 1.5 * s, ry + Math.PI / 2, col(0xf4efe6));
      wb.box(side[0] + Math.sin(ry + Math.PI / 2) * 0.15, y + 1.55 * s, side[1] + Math.cos(ry + Math.PI / 2) * 0.15, 0.1, 1.05 * s, 1.2 * s, ry + Math.PI / 2, [1, 0.78, 0.35]);
      b.blob(x, y + 0.1, z, 4.6 * s, 0.9 * s, 3.6 * s, white, 0);
    };
    let placed = 0;
    kit.scatter(120, 14, 60, 22, (x, z, i, r) => {
      if (placed >= 12) return;
      const nr = nearRoad(kit, x, z);
      if (nr.dist < 26) return;
      placed++;
      chalet(x, gy, z, nr.ang + (r() - 0.5) * 0.7, 1 + r() * 0.5);
      // picket fence + snow-covered shrubs around
      for (let k = 0; k < 6; k++) { const a = r() * TAU, px = x + Math.cos(a) * 7, pz = z + Math.sin(a) * 7; b.blob(px, gy + 0.4, pz, 1.2, 0.8, 1.2, col(0x2f7a60), 0); b.blob(px, gy + 0.9, pz, 1.1, 0.5, 1.1, white, 0); }
      lampPost(b, x + Math.cos(nr.ang) * 6, gy, z + Math.sin(nr.ang) * 6, nr.ang, 3.2, col(0x3a2a1e), col(0xffd080), lights, 1);
    });
    // ---------------- snowman families
    const snowman = (x, z, ry, s, scarf) => {
      b.blob(x, gy + 0.9 * s, z, 1.25 * s, 1.0 * s, 1.25 * s, white, 1); b.blob(x, gy + 2.1 * s, z, 0.95 * s, 0.8 * s, 0.95 * s, white, 1); b.blob(x, gy + 3.0 * s, z, 0.7 * s, 0.62 * s, 0.7 * s, white, 1);
      const f = (lx, lz) => [x + rotX(lx * s, lz * s, ry), z + rotZ(lx * s, lz * s, ry)];
      const n = f(0, 0.75); b.box(n[0], gy + 2.95 * s, n[1], 0.14 * s, 0.14 * s, 0.7 * s, ry, col(0xff7a1a));
      for (const sd of [-1, 1]) { const e = f(sd * 0.25, 0.6); b.box(e[0], gy + 3.2 * s, e[1], 0.1 * s, 0.1 * s, 0.1 * s, ry, [0.05, 0.05, 0.08]); const a = f(sd * 1.3, 0); b.box(a[0], gy + 2.3 * s, a[1], 1.2 * s, 0.09 * s, 0.09 * s, ry + sd * 0.5, col(0x5a3a22)); }
      for (let k = 0; k < 3; k++) { const bt = f(0, 0.93 - k * 0.05); b.box(bt[0], gy + (2.3 - k * 0.45) * s, bt[1], 0.14 * s, 0.14 * s, 0.1, ry, [0.05, 0.05, 0.08]); }
      b.box(x, gy + 2.55 * s, z, 1.2 * s, 0.28 * s, 1.2 * s, ry, scarf);
      b.box(x, gy + 3.5 * s, z, 0.95 * s, 0.14 * s, 0.95 * s, ry, col(0x2a2a40)); b.box(x, gy + 3.55 * s, z, 0.6 * s, 0.7 * s, 0.6 * s, ry, col(0x2a2a40));
    };
    { const sc = [col(0xe8383d), col(0x2c7ed6), col(0xffc21a), col(0x35c0d9)]; let n = 0;
      kit.scatter(40, 4, 34, 22, (x, z, i, r) => { if (n >= 14) return; n++; const nr = nearRoad(kit, x, z); const s = 0.8 + r() * 0.5; snowman(x, z, nr.ang + (r() - 0.5), s, sc[n & 3]); if (r() < 0.6) snowman(x + 2.4, z + 0.6, nr.ang + 0.3, s * 0.6, sc[(n + 1) & 3]); }); }
    // ---------------- ice sculptures: crystal clusters, ice penguins on pedestals, spires
    const ib = new kit.Batch();
    const crystal = (x, z, s, r) => {
      for (let k = 0; k < 5; k++) {
        const a = r() * TAU, d = k ? (1 + r() * 2.2) * s : 0, h = (k ? 4 + r() * 6 : 14 + r() * 8) * s, w = (k ? 0.9 : 1.8) * s;
        const c = kit.mix(col(0x9fe0ff), col(0xe6f8ff), r());
        ib.frustum(x + Math.cos(a) * d, gy - 0.3, z + Math.sin(a) * d, w, w * 0.15, h, 6, c, r() * 3);
        ib.frustum(x + Math.cos(a) * d, gy - 0.3 + h, z + Math.sin(a) * d, w * 0.15, 0, w * 1.6, 6, [1, 1, 1], 0);
      }
    };
    const iceBird = (x, z, ry, s) => {
      const c = col(0xcfeeff), c2 = col(0xeaf8ff), f = (lx, lz) => [x + rotX(lx * s, lz * s, ry), z + rotZ(lx * s, lz * s, ry)];
      ib.box(x, gy, z, 3 * s, 1 * s, 3 * s, ry, c2); ib.box(x, gy + 0.9 * s, z, 2.2 * s, 0.4 * s, 2.2 * s, ry, c);
      ib.blob(x, gy + 3.2 * s, z, 1.1 * s, 1.8 * s, 0.9 * s, c, 1); ib.blob(x, gy + 5.2 * s, z, 0.62 * s, 0.6 * s, 0.6 * s, c2, 1);
      const bk = f(0, 0.7); ib.box(bk[0], gy + 5.1 * s, bk[1], 0.18 * s, 0.18 * s, 0.6 * s, ry, col(0xffd9a0));
      for (const sd of [-1, 1]) { const w = f(sd * 1.0, 0); ib.box(w[0], gy + 3.3 * s, w[1], 0.2 * s, 1.5 * s, 0.9 * s, ry + sd * 0.3, c); }
    };
    let ic = 0;
    kit.scatter(30, 2, 110, 26, (x, z, i, r) => {
      if (ic >= 18) return; if (!edgeOK(x, z, 26)) return; ic++;
      const nr = nearRoad(kit, x, z);
      if (ic % 3 === 0) iceBird(x, z, nr.ang, 1 + r() * 0.5); else crystal(x, z, 0.7 + r() * 0.9, r);
    });
    // twin crystal gates framing the start straight
    for (const sd of [-1, 1]) { const p = kit.at(L - 40, sd * 33, 0); crystal(p[0], p[2], 1.3, rng); const q = kit.at(L - 14, sd * 27, 0); iceBird(q[0], q[2], Math.atan2(-sd, 0), 1.2); }
    // ---------------- extra pines (dense forest bands), snow berms, boulders
    kit.scatter(380, 3, 130, 22, (x, z, i, r) => {
      const s = 0.8 + r() * 1.5, g = kit.mix(col(0x1f6b57), col(0x2a7d6e), r()), n = 3;
      pf.box(x, gy, z, 0.5 * s, 1.4 * s, 0.5 * s, 0, col(0x5a3d2a));
      for (let k = 0; k < n; k++) { const r0 = (3.0 - k * 0.8) * s, hh = 3.0 * s, yy = gy + (1.2 + k * 1.8) * s; pf.frustum(x, yy, z, r0, 0, hh, 6, g, r()); pf.frustum(x, yy + hh * 0.38, z, r0 * 0.62, 0, hh * 0.62, 6, white, 0); }
    });
    for (let d = 4; d < L - 4; d += 5 + rng() * 5) for (const sd of [-1, 1]) {
      const p = kit.at(d, sd * (21 + rng() * 5), 0), s = 1 + rng() * 1.6;
      if (rng() < 0.7) b.blob(p[0], p[1] - 0.4, p[2], 2.6 * s, 0.9 * s, 1.8 * s, kit.mix(white, col(0xd6ecfa), rng()), 1);
      else b.blob(p[0], p[1] + 0.2, p[2], 0.9 * s, 0.7 * s, 0.9 * s, kit.mul(col(0x7b8696), 0.8 + rng() * 0.3), 0);
    }
    // ---------------- lake: cracks, floes, frost sheen
    const cb = new kit.Batch(true), cr = col(0xf2fbff), sheen = [];
    for (const lk of [{ d: dLake, r: 118, n: 34 }, { d: dLake2, r: 58, n: 12 }]) {
      const f = kit.frame(lk.d), cx = f.x + f.rx * 8, cz = f.z + f.rz * 8;
      for (let n = 0; n < lk.n; n++) {
        let a = rng() * TAU, rr = 4 + rng() * lk.r * 0.85, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr, h = rng() * TAU;
        for (let sgm = 0; sgm < 4 + (rng() * 5 | 0); sgm++) {
          const len = 4 + rng() * 9, nx = x + Math.cos(h) * len, nz = z + Math.sin(h) * len;
          if (Math.hypot(nx - cx, nz - cz) < lk.r - 4 && kit.clear(x, z, 17) && kit.clear(nx, nz, 17)) {
            const w = 0.13 + rng() * 0.12, px = -Math.sin(h) * w, pz = Math.cos(h) * w, y = gy + 0.12;
            cb.quad([x - px, y, z - pz], [x + px, y, z + pz], [nx + px, y, nz + pz], [nx - px, y, nz - pz], [0.82, 0.95, 1]);
          }
          x = nx; z = nz; h += (rng() - 0.5) * 1.1;
        }
      }
      // broken ice floes near the rim
      for (let n = 0; n < 16; n++) {
        const a = rng() * TAU, rr = lk.r * (0.8 + rng() * 0.17), x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
        if (!kit.clear(x, z, 19)) continue; const s = 2 + rng() * 4;
        ib.frustum(x, gy + 0.05, z, s, s * 0.9, 0.5 + rng() * 0.5, 6, kit.mix(col(0xe8f6ff), col(0xbfe4fa), rng()), rng() * 3);
      }
      for (let n = 0; n < 5; n++) { const a = rng() * TAU, rr = rng() * lk.r * 0.7, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr; if (kit.clear(x, z, 19)) sheen.push([x, gy, z, 5 + rng() * 6, 0xffffff]); }
    }
    kit.mesh(cb, { transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }, true);
    pools(kit, sheen, { alpha: 0.5 });
    { const f = kit.frame(dLake); kit.particles({ x: f.x, y: gy + 0.5, z: f.z, count: 220, vel: [0, 0.05, 0], spread: [0.1, 0.05, 0.1], jitter: [90, 0.4, 90], life: 1.6, size: 0.9, alpha: 1, pow: 0.5, fadeIn: 0.3, color: [0xffffff, 0xcdf0ff], tex: 'spark', additive: true }); }
    // ---------------- adverts along the road
    {
      const ads = Ads(kit, [
        { t: 'FROSTBITE', sub: 'ICE-COLD COLA', fg: '#ffffff', bg: '#d6283a', bg2: '#8a1020', ic: 'flake' }, { t: "POLAR PETE'S", sub: 'SNOW GEAR', fg: '#ffd23a', bg: '#1d4fa8', bg2: '#102a66', ic: 'star' },
        { t: 'SNOWCAT', sub: 'WINTER TIRES', fg: '#35e0ff', bg: '#1b1f2e', bg2: '#0a0c14', ic: 'ring' }, { t: 'ICEBERG BANK', sub: 'SAVE COOL', fg: '#ffffff', bg: '#17806a', bg2: '#0d4a3e', ic: 'diamond' },
        { t: 'MINT-O-FRESH', sub: 'GUM', fg: '#ffffff', bg: '#2fb08a', bg2: '#157a5c', ic: 'leaf' }, { t: 'AURORA AIR', sub: 'FLY NORTH', fg: '#b8ffea', bg: '#4a2a8a', bg2: '#241050', ic: 'wave' },
        { t: 'SLEDWORKS', sub: 'RACE TO WIN', fg: '#ffffff', bg: '#ff8a1a', bg2: '#b34a00', ic: 'bolt' }, { t: 'COCOA CABIN', sub: 'HOT & SWEET', fg: '#ffe6c0', bg: '#6a3a22', bg2: '#3a1c0e', ic: 'flame' },
      ]);
      let n = 0;
      for (let d = 30; d < L - 30; d += 44) for (const sd of [-1, 1]) { const f = kit.frame(d), p = kit.at(d, sd * 20.2, 0); ads.board(p[0], p[1], p[2], Math.atan2(f.tx, f.tz) + (sd > 0 ? Math.PI / 2 : -Math.PI / 2), 6, 1.6, (n++) % 8, 0x2a2f3a, 0.9); }
      ads.finish();
      // road paint: start-grid boxes, sponsor logos on the tarmac
      const gb = new kit.Batch(); gridBoxes(kit, gb);
      kit.mesh(gb, {}, true);
    }
    // ---------------- lamp posts along the road
    for (let d = 20; d < L - 10; d += 52) for (const sd of [-1, 1]) {
      const f = kit.frame(d), p = kit.at(d, sd * 19.5, 0);
      lampPost(b, p[0], p[1], p[2], Math.atan2(f.tx, f.tz), 4.6, col(0x2c3646), col(0xfff0c0), lights, -sd);
    }
    // ---------------- far mountain range (layered, tinted by distance)
    kit.farScatter(16, 150, (x, z, r) => {
      const s = 36 + r() * 46, h = s * (1.6 + r() * 1.0), c = kit.mix(col(0x7f9bcb), col(0xb7cdea), r());
      b.frustum(x, gy - 3, z, s, s * 0.35, h * 0.55, 7, c, r() * 3); b.frustum(x, gy - 3 + h * 0.55, z, s * 0.35, 0, h * 0.5, 7, kit.mix(c, white, 0.35), 0);
      b.frustum(x, gy - 3 + h * 0.62, z, s * 0.22, 0, h * 0.4, 7, white, 0);
    });
    kit.mesh(b, {}, false);
    kit.mesh(ib, { emissive: 0x2a6aa0, transparent: true, opacity: 0.93 }, false);
    kit.foliage(pf, { strength: 0.3, heightScale: 0.16 });
    { const wm = kit.mesh(wb, {}, true); if (wm) kit.blinker(wm.material, 7, { mode: 'sine', lo: 0.82 }); }
    halos(kit, lights.map((p) => [p[0], p[1], p[2], p[3] !== undefined ? p[3] : 0xffe2a0]), { size: 5, alpha: 0.7 });
    pools(kit, lights.filter((p) => p[3] === undefined).map((p) => [p[0], gy, p[2], 5, 0xffd9a0]), { normal: true, alpha: 0.25 });
    if (smoke.length) kit.particles({ emitters: smoke, count: 8, vel: [0.5, 1.6, 0.2], spread: [0.3, 0.3, 0.3], life: 4, size: 2.4, grow: 2.4, alpha: 0.5, pow: 1.2, wob: 0.8, color: [0xffffff, 0xdde8f2] });
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
      const im = kit.trackMat(new T.MeshLambertMaterial({ vertexColors: true, emissive: 0x2a4a66, transparent: true, opacity: 0.92 }));
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
        const hz = { x: cx, y: f.y, z: cz, radius: 2.1, hitKind: 'spin', vx: 0, vz: 0, active: true, ph: i * 1.7, c: [cx, cz, f.y, s[2], s[3]] };
        hz.update = function (dt, time) {
          const c = this.c, a = this.ph + time * c[4], r = c[3];
          this.x = c[0] + Math.cos(a) * r; this.z = c[1] + Math.sin(a) * r;
          this.vx = -Math.sin(a) * r * c[4]; this.vz = Math.cos(a) * r * c[4];
          pen.set(i, this.x, c[2] + 0.05, this.z, Math.atan2(this.vx, this.vz) * 1, 1.7, 1.7, 1.7);
          if (i === n - 1) pen.done();
        };
        hz.launchPose = function (L) { pen.pose(i, L.x, L.y, L.z, L.rx, L.ry, L.rz, 1.7 * L.s); pen.done(); };
        hz.popScale = function (k) { pen.pose(i, this.x, this.c[2] + 0.05, this.z, 0, Math.atan2(this.vx, this.vz), 0, 1.7 * k); pen.done(); };
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
        hz.launchPose = function (L) { blk.pose(i, L.x, L.y, L.z, L.rx, L.ry, L.rz, L.s); blk.done(); };
        hz.popScale = function (k) { blk.pose(i, this.x, f.y, this.z, 0, 0, 0, k); blk.done(); };
        hz.update(0, 0); list.push(hz);
      });
      return list;
    };
  }


  // ====================================================================================================
  // COURSE 2 — NEON METRO  (night city: boulevards, traffic, neon signs, a canal bridge, building gate)
  // ====================================================================================================
  const METRO_HW = 14;
  (function metro() {
    const corners = [[380, 0, 80], [380, 250, 70], [250, 250, 45], [250, 150, 45], [130, 150, 45], [130, 260, 60], [-50, 260, 60], [-50, 0, 70]];
    const pts = polyPts(corners, {
      step: 45, startT: 0.55,
      y: (s, x, z) => (z < 100 ? 5.5 * Math.exp(-Math.pow((x - 315) / 55, 2)) : 0) + (x > 100 && x < 260 && z > 200 ? 0 : 0),
      hw: () => METRO_HW,
    });
    const S = sampler(pts), L = S.L;
    const dGate = S.dOf(40, 260);
    G.defineTrack({
      id: 'neon_metro', name: 'Neon Metro', cup: 'star', order: 2, laps: 3, music: 'city', seed: 5202,
      hw: METRO_HW, shoulder: 4, scale: 1, offroad: 'offroad',
      walls: 'barrier', wallColors: [0x3df2ff, 0xff3df0],
      theme: {
        sky: [0x02030f, 0x151a44, 0x4a2a6a], fog: [0x1a1a40, 90, 430], ground: 0x0d0f24, shoulder: 0x1b1e3c,
        road: [0x2d3044, 0x292c40], curb: [0xff3df0, 0x3df2ff], hemi: [0x7f8cff, 0x241a50, 0.95], sun: [0x9aa8ff, 0.45],
        emb: 0x14163a, bg: 0x1a1a40,
      },
      pts,
      pads: [{ d: 50, len: 10, l: -6, w: 7 }, { d: 50, len: 10, l: 6, w: 7 }, { d: S.dOf(380, 150), len: 10, l: 0, w: 9 }, { d: S.dOf(120, 200) - 10, len: 10, l: -7, w: 8 }, { d: S.dOf(-50, 100), len: 10, l: 6, w: 8 }],
      jumps: [], zones: [],
      itemRows: [0.06, 0.2, 0.34, 0.5, 0.66, 0.82].map((f, i) => ({ d: f * L, count: 5, double: i === 2 || i === 5 })),
      decorate: metroDecor(S, dGate),
      hazards: metroHazards(S),
    });
  })();

  function metroDecor(S, dGate) {
    return function (track, kit) {
      const rng = kit.rng, col = kit.col, gy = kit.groundY, L = kit.length, HW = METRO_HW;
      const WT = 18;   // road + shoulder
      // ---------------- own night sky dome (covers the default backdrop), stars, moon, skyline ring
      {
        const geo = kit.trackGeom(new T.SphereGeometry(280, 24, 16));
        const pos = geo.attributes.position, cc = new Float32Array(pos.count * 3);
        const top = col(0x02030f), mid = col(0x1a1650), hor = col(0x7a2a8a), bot = col(0x1a1a40);
        for (let i = 0; i < pos.count; i++) {
          const v = pos.getY(i) / 280;
          const c = v > 0.35 ? kit.mix(mid, top, (v - 0.35) / 0.65) : v > 0 ? kit.mix(hor, mid, v / 0.35) : kit.mix(hor, bot, Math.min(1, -v * 4));
          cc[i * 3] = c[0]; cc[i * 3 + 1] = c[1]; cc[i * 3 + 2] = c[2];
        }
        geo.setAttribute('color', new T.BufferAttribute(cc, 3));
        const m = new T.Mesh(geo, kit.trackMat(new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false, depthTest: false })));
        m.renderOrder = -998; kit.follow(m); kit.add(m);
        const sb = new kit.Batch();
        sb.blob(-130, 150, -200, 14, 14, 14, col(0xfff4d8), 1);
        for (let i = 0; i < 34; i++) {
          const a = rng() * TAU, h = 160 + rng() * 80, x = Math.cos(a) * 250, z = Math.sin(a) * 250;
          const w = 8 + rng() * 14, ht = 20 + rng() * 80;
          sb.box(x, -10, z, w, ht + 10, w, -a, col(0x0b0b22));
          const lit = [col(0xffd36f), col(0x6fe6ff), col(0xff6ad5)];
          for (let k = 0; k < 6; k++) sb.box(x - Math.sin(a) * 0, -10 + 6 + rng() * ht, z, 1.6, 1.4, w + 0.4, -a, lit[(rng() * 3) | 0]);
        }
        const stars = [];
        for (let i = 0; i < 160; i++) { const a = rng() * TAU, e = 0.25 + rng() * 1.1, r = 270; sb.box(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r, 1.3, 1.3, 1.3, a, [0.9, 0.9, 1]); }
        const sm = kit.mesh(sb, { fog: false, depthWrite: false }, true); sm.renderOrder = -997; kit.follow(sm);
      }
      // ---------------- textured buildings
      const wt = tex(kit, 128, 256, (c, w, h) => {
        c.fillStyle = '#16182e'; c.fillRect(0, 0, w, h);
        for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) {
          const r = rng();
          if (r < 0.58) { const k = 150 + Math.floor(rng() * 105); c.fillStyle = `rgb(${k},${Math.min(255, k + 10)},${Math.min(255, k - (rng() < 0.3 ? 70 : 20))})`; }
          else c.fillStyle = '#23264a';
          c.fillRect(x * 16 + 3, y * 16 + 4, 10, 9);
        }
      });
      if (wt) { wt.wrapS = wt.wrapT = T.RepeatWrapping; wt.anisotropy = 4; }
      const P = [], U = [], C = [];
      const tq = (a, b, c, d, ua, ub, uc, ud, k) => {
        for (const [p, u] of [[a, ua], [b, ub], [c, uc], [a, ua], [c, uc], [d, ud]]) { P.push(p[0], p[1], p[2]); U.push(u[0], u[1]); C.push(k[0], k[1], k[2]); }
      };
      const tbox = (cx, y0, cz, sx, sy, sz, ry, k) => {
        const c = Math.cos(ry), s = Math.sin(ry), hx = sx / 2, hz = sz / 2, y1 = y0 + sy;
        const v = (lx, lz, y) => [cx + lx * c + lz * s, y, cz - lx * s + lz * c];
        const cs = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
        const off = rng();
        for (let i = 0; i < 4; i++) {
          const a = cs[i], b = cs[(i + 1) % 4], len = Math.hypot(b[0] - a[0], b[1] - a[1]) / 24, hh = sy / 56;
          tq(v(a[0], a[1], y0), v(b[0], b[1], y0), v(b[0], b[1], y1), v(a[0], a[1], y1), [off, 0], [off + len, 0], [off + len, hh], [off, hh], k);
        }
        const z0 = [0.01, 0.002];
        tq(v(-hx, -hz, y1), v(hx, -hz, y1), v(hx, hz, y1), v(-hx, hz, y1), z0, z0, z0, z0, mul3(k, 0.35));
      };
      const mul3 = (k, f) => [k[0] * f, k[1] * f, k[2] * f];
      const tints = [col(0xffb0e8), col(0x9ff0ff), col(0xffd98a), col(0xb9a8ff), col(0xa8ffd0), col(0xff9a9a)];
      const nb = new kit.Batch();  // neon trims / signs poles / lamps (unlit)
      const roofCols = [col(0xff3df0), col(0x3df2ff), col(0xffe14a), col(0x8f6bff)];
      const rb = roofCols.map(() => new kit.Batch());   // roof neon per colour: each blinks on its own phase
      const bldgs = [];
      const place = (x, z, w, dp, h, ry) => {
        const k = tints[(rng() * tints.length) | 0];
        tbox(x, gy - 1, z, w, h + 1, dp, ry, k);
        // roof neon trim + antenna
        const ri = (rng() * roofCols.length) | 0, rc = roofCols[ri];
        for (const e of [[w / 2, 0, 0.5, dp], [-w / 2, 0, 0.5, dp], [0, dp / 2, w, 0.5], [0, -dp / 2, w, 0.5]]) {
          const c0 = Math.cos(ry), s0 = Math.sin(ry);
          rb[ri].box(x + e[0] * c0 + e[1] * s0, gy + h, z - e[0] * s0 + e[1] * c0, e[2], 0.6, e[3], ry, rc);
        }
        if (h > 55 && rng() < 0.7) { nb.box(x, gy + h, z, 0.4, 10, 0.4, 0, [0.9, 0.9, 1]); nb.box(x, gy + h + 10, z, 0.8, 0.8, 0.8, 0, [1, 0.2, 0.2]); }
        bldgs.push({ x, z, w, dp, h, ry });
      };
      const inCanal = (x, z) => x > 285 && x < 345 && z > -80 && z < 150;
      for (let gx = -190; gx < 560; gx += 34) for (let gz = -150; gz < 430; gz += 34) {
        const x = gx + (rng() - 0.5) * 8, z = gz + (rng() - 0.5) * 8;
        const w = 14 + rng() * 14, dp = 14 + rng() * 14, sz = Math.max(w, dp) * 0.75;
        if (!kit.clear(x, z, WT + sz + 8)) continue;
        if (inCanal(x, z) || inCanal(x + 20, z) || inCanal(x - 20, z)) continue;
        const near = !kit.clear(x, z, WT + sz + 40);
        const h = near ? 22 + rng() * 40 : 45 + rng() * 95;
        place(x, z, w, dp, h, 0);
      }
      kit.farScatter(40, 60, (x, z, r) => place(x, z, 20 + r() * 24, 20 + r() * 24, 70 + r() * 150, 0));
      // ---- gate building over the road (rectangular underpass)
      {
        const f = kit.frame(dGate), hy = Math.atan2(f.tx, f.tz), k = col(0xd8c8ff);
        const wx = HW + 4 + 9;
        for (const sd of [-1, 1]) {
          const px = f.x + f.rx * sd * wx, pz = f.z + f.rz * sd * wx;
          tbox(px, gy - 1, pz, 16, 41 + (f.y - gy), 22, hy, k);
          nb.box(px, f.y + 12, pz, 16.6, 0.7, 22.6, hy, sd < 0 ? col(0xff3df0) : col(0x3df2ff));
        }
        const hx = f.x, hz = f.z;
        tbox(hx, f.y + 12, hz, 2 * wx + 14, 26, 22, hy, k);
        nb.box(hx, f.y + 11.4, hz, 2 * wx + 14.6, 0.6, 22.6, hy, col(0xffe14a));
        for (let i = -4; i <= 4; i++) { const p = kit.at(dGate - 11.2, i * 4.2, 11.6); nb.box(p[0], p[1], p[2], 1.6, 0.35, 0.4, hy, i & 1 ? col(0xff3df0) : col(0x3df2ff)); }
      }
      // ---- elevated pedestrian skywalks across the boulevard
      for (const d of [L * 0.1, L * 0.45, L * 0.7, L * 0.9]) {
        const f = kit.frame(d), hy = Math.atan2(f.tx, f.tz);
        const wx = HW + 5;
        for (const sd of [-1, 1]) { const p = kit.at(d, sd * wx, 0); nb.box(p[0], p[1], p[2], 1.4, 9, 1.4, hy, col(0x6a6ab0)); }
        nb.box(f.x, f.y + 8.6, f.z, 2.8, 1.8, 2 * wx + 2, hy + Math.PI / 2 * 0 + Math.PI / 2, col(0x8f8fd8));
        nb.box(f.x, f.y + 8.2, f.z, 3.2, 0.35, 2 * wx + 2.4, hy + Math.PI / 2, col(0x3df2ff));
        nb.box(f.x, f.y + 10.3, f.z, 3.2, 0.35, 2 * wx + 2.4, hy + Math.PI / 2, col(0xff3df0));
      }
      // ---- street lamps
      for (let d = 20; d < L - 10; d += 38) for (const sd of [-1, 1]) {
        const f = kit.frame(d), hy = Math.atan2(f.tx, f.tz), l = sd * (HW + 4 + 2.2);
        const p = [f.x + f.rx * l, f.y, f.z + f.rz * l];
        nb.box(p[0], p[1], p[2], 0.45, 9.5, 0.45, hy, col(0x5a5a80));
        const q = [p[0] - f.rx * sd * 1.6, f.y + 9.4, p[2] - f.rz * sd * 1.6];
        nb.box(q[0], q[1], q[2], 0.5, 0.5, 0.5, hy, col(0xfff0c0));
        nb.box(p[0] - f.rx * sd * 0.8, f.y + 9.4, p[2] - f.rz * sd * 0.8, 0.3, 0.3, 1.8, hy + Math.PI / 2 * (Math.abs(f.rx) > 0.5 ? 0 : 1) * 0, col(0x5a5a80));
      }
      // ---- painted lane lines & zebra crossings (decals just above the road)
      for (const lat of [-7, 7]) for (let d = 6; d < L - 6; d += 9) {
        const a = kit.at(d, lat - 0.12, 0.05), b = kit.at(d + 4.5, lat - 0.12, 0.05), c = kit.at(d + 4.5, lat + 0.12, 0.05), e = kit.at(d, lat + 0.12, 0.05);
        nb.quad(a, b, c, e, [0.85, 0.85, 0.9]);
      }
      for (const d of [L * 0.15, L * 0.38, L * 0.6, L * 0.78]) for (let l = -HW + 1; l < HW - 1; l += 2.2) {
        const a = kit.at(d, l, 0.06), b = kit.at(d + 4, l, 0.06), c = kit.at(d + 4, l + 1.1, 0.06), e = kit.at(d, l + 1.1, 0.06);
        nb.quad(a, b, c, e, [0.9, 0.9, 0.95]);
      }
      // ---- overhead gantries with neon + canal bridge arches
      for (const d of [L * 0.03, L * 0.27, L * 0.55, L * 0.88]) {
        const f = kit.frame(d), hy = Math.atan2(f.tx, f.tz), wx = HW + 4.6;
        for (const sd of [-1, 1]) { const p = kit.at(d, sd * wx, 0); nb.box(p[0], p[1], p[2], 1.0, 8.5, 1.0, hy, col(0x7a7ab8)); }
        nb.box(f.x, f.y + 8.5, f.z, 1.2, 1.2, 2 * wx + 1, hy + Math.PI / 2, col(0x7a7ab8));
      }
      {
        const dB = S.dOf(315, 0);
        for (const sd of [-1, 1]) for (let d = dB - 34; d <= dB + 34; d += 4) {
          const a = kit.at(d, sd * (HW + 0.6), 0), b = kit.at(d + 4, sd * (HW + 0.6), 0), hh = 1.5;
          nb.quad(a, [a[0], a[1] + hh, a[2]], [b[0], b[1] + hh, b[2]], b, col(0x3df2ff));
        }
        for (const sd of [-1, 1]) for (let k = 0; k <= 8; k++) {
          const u = k / 8, d = dB - 34 + u * 68, hh = 8 * Math.sin(u * Math.PI), p = kit.at(d, sd * (HW + 0.6), 1.5 + hh);
          nb.box(p[0], p[1], p[2], 0.5, 0.5, 0.5, 0, col(0xff3df0));
        }
        // canal water
        const wm = kit.waterMat({ color: 0x1a5a9a, deep: 0x061830, opacity: 0.93 });
        const wg = kit.trackGeom(new T.PlaneGeometry(40, 210)); wg.rotateX(-Math.PI / 2);
        const wmesh = new T.Mesh(wg, wm); wmesh.position.set(315, gy + 0.12, 35); kit.add(wmesh);
        for (const x of [293.5, 336.5]) nb.box(x, gy, 35, 3, 1.4, 210, 0, col(0x59a0b8));
        for (let z = -60; z < 140; z += 18) for (const x of [296, 334]) nb.box(x, gy + 1.4, z, 0.7, 4, 0.7, 0, col(0xffe14a));
      }
      // ---- signs from a canvas atlas
      const names = ['NEON METRO', 'RAMEN', 'ARCADE', 'HOTEL ZENITH', 'CINEMA', 'BUBBLE TEA', 'KARAOKE', 'MOTOR CLUB'];
      const sc = [['#ff3df0', '#3a0a38'], ['#3df2ff', '#06303a'], ['#ffe14a', '#3a3206'], ['#8f6bff', '#1a0f3a']];
      const at = tex(kit, 512, 256, (c, w, h) => {
        c.fillStyle = '#05060f'; c.fillRect(0, 0, w, h);
        names.forEach((nm, i) => {
          const x = (i % 2) * 256, y = Math.floor(i / 2) * 64, [fg, bg] = sc[i % 4];
          c.fillStyle = bg; c.fillRect(x + 3, y + 3, 250, 58);
          c.strokeStyle = fg; c.lineWidth = 4; c.strokeRect(x + 5, y + 5, 246, 54);
          c.font = '900 30px "Trebuchet MS", Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.shadowColor = fg; c.shadowBlur = 12; c.fillStyle = '#ffffff'; c.fillText(nm, x + 128, y + 34); c.shadowBlur = 0;
        });
      });
      const SP = [], SU = [], SP2 = [], SU2 = [];
      const sign = (p, hy, w, h, idx) => {
        const SPx = idx & 1 ? SP2 : SP, SUx = idx & 1 ? SU2 : SU;
        const cx = Math.cos(hy), sx = Math.sin(hy), u0 = (idx % 2) * 0.5, v1 = 1 - Math.floor(idx / 2) * 0.25, v0 = v1 - 0.25;
        const q = (l, y) => [p[0] + cx * l, p[1] + y, p[2] - sx * l];
        const a = q(-w / 2, 0), b = q(w / 2, 0), c = q(w / 2, h), d = q(-w / 2, h);
        const uu = [[u0, v0], [u0 + 0.5, v0], [u0 + 0.5, v1], [u0, v1]];
        for (const [pp, u] of [[a, uu[0]], [b, uu[1]], [c, uu[2]], [a, uu[0]], [c, uu[2]], [d, uu[3]]]) { SPx.push(pp[0], pp[1], pp[2]); SUx.push(u[0], u[1]); }
      };
      // billboards on stilts facing the road, and flush signs on nearby buildings
      let si = 0;
      for (let d = 70; d < L - 40; d += 85 + rng() * 40) {
        const sd = rng() < 0.5 ? -1 : 1, f = kit.frame(d), hy = Math.atan2(f.tx, f.tz) + (sd > 0 ? Math.PI / 2 : -Math.PI / 2);
        const p = kit.at(d, sd * (HW + 4 + 9), 0);
        nb.box(p[0], p[1], p[2], 0.8, 13, 0.8, 0, col(0x6a6ab0));
        sign([p[0], p[1] + 12, p[2]], hy, 22, 5.5, (si++) % names.length);
        nb.box(p[0], p[1] + 11.6, p[2], 22.6, 0.4, 0.4, hy - Math.PI / 2 + Math.PI / 2 * 0, col(0xffffff));
      }
      for (const bd of bldgs) {
        if (bd.h < 40 || rng() < 0.45) continue;
        if (kit.clear(bd.x, bd.z, 70)) continue;
        // face the nearest road sample
        let bi = 0, bdm = 1e9;
        for (let i = 0; i < kit.N; i += 6) { const dm = Math.hypot(kit.px[i] - bd.x, kit.pz[i] - bd.z); if (dm < bdm) { bdm = dm; bi = i; } }
        const ang = Math.atan2(kit.px[bi] - bd.x, kit.pz[bi] - bd.z);
        const ex = Math.max(bd.w, bd.dp) / 2 + 0.3;
        const p = [bd.x + Math.sin(ang) * ex, gy + 14 + rng() * (bd.h - 24), bd.z + Math.cos(ang) * ex];
        sign(p, ang + Math.PI, 11, 2.8, (si++) % names.length);
      }
      // build meshes
      const bg = new T.BufferGeometry();
      bg.setAttribute('position', new T.Float32BufferAttribute(P, 3)); bg.setAttribute('uv', new T.Float32BufferAttribute(U, 2)); bg.setAttribute('color', new T.Float32BufferAttribute(C, 3));
      bg.computeBoundingSphere(); kit.trackGeom(bg);
      const bm = kit.trackMat(new T.MeshBasicMaterial(wt ? { map: wt, vertexColors: true } : { vertexColors: true, color: 0x555577 }));
      const bmesh = new T.Mesh(bg, bm); bmesh.frustumCulled = false; kit.add(bmesh);
      kit.mesh(nb, {}, true);
      rb.forEach((bt, i) => { const m = kit.mesh(bt, {}, true); if (m) kit.blinker(m.material, 2.1 + i * 0.55, { duty: 0.72, phase: i * 0.27, lo: 0.3 }); });   // roof neon flickers
      [[SP, SU, 0], [SP2, SU2, 1]].forEach(([SPx, SUx, k]) => {
        if (!SPx.length) return;
        const sg = new T.BufferGeometry();
        sg.setAttribute('position', new T.Float32BufferAttribute(SPx, 3)); sg.setAttribute('uv', new T.Float32BufferAttribute(SUx, 2));
        sg.computeBoundingSphere(); kit.trackGeom(sg);
        const sm = kit.trackMat(new T.MeshBasicMaterial(at ? { map: at, side: T.DoubleSide } : { color: 0xff3df0, side: T.DoubleSide }));
        kit.blinker(sm, 3.3 + k * 1.1, { duty: 0.86, phase: k * 0.45, lo: 0.4 });   // sign boards buzz on and off
        const smesh = new T.Mesh(sg, sm); smesh.frustumCulled = false; kit.add(smesh);
      });
      // ---- traffic lights cycling red -> green -> yellow at the crossings
      {
        const lamp = [new kit.Batch(), new kit.Batch(), new kit.Batch()], lc = [[1, 0.15, 0.15], [1, 0.85, 0.1], [0.2, 1, 0.35]], pole = new kit.Batch();
        for (const d of [L * 0.15, L * 0.38, L * 0.6, L * 0.78]) for (const sd of [-1, 1]) {
          const f = kit.frame(d - 3), hy = Math.atan2(f.tx, f.tz), l = sd * (HW + 3.2), p = kit.at(d - 3, l, 0);
          pole.box(p[0], p[1], p[2], 0.35, 6.3, 0.35, hy, [0.35, 0.35, 0.5]); pole.box(p[0], p[1] + 4.2, p[2], 0.9, 2.6, 0.7, hy, [0.08, 0.08, 0.12]);
          for (let k = 0; k < 3; k++) { const q = kit.at(d - 3, l - sd * 0.01, 6.4 - k * 0.85); lamp[k].box(q[0] - f.tx * 0.4, q[1] - 0.25, q[2] - f.tz * 0.4, 0.55, 0.55, 0.2, hy, lc[k]); }
        }
        kit.mesh(pole, {}, false);
        lamp.forEach((bt, k) => { const m = kit.mesh(bt, {}, true); if (m) kit.blinker(m.material, 8, { duty: [0.45, 0.1, 0.4][k], phase: [0.5, 0.4, 0.0][k], lo: 0.1 }); });
      }
      // ---- sweeping searchlights from the tallest towers, fireworks above the skyline, steam vents, start-straight crowd, neon banners
      {
        const tall = bldgs.filter((q) => q.h > 90).slice(0, 5);
        tall.forEach((q, i) => kit.lightBeam({ x: q.x, y: gy + q.h + 1, z: q.z, len: 150, width: 5, speed: (i & 1 ? 0.35 : -0.42), phase: i * 1.4, tilt: 0.8, count: 1, color: i & 1 ? 0xff7af5 : 0x7af2ff, opacity: 0.5 }));
        const em = []; for (let k = 0; k < 6; k++) { const a = k * 1.1 + 0.3; em.push([140 + Math.cos(a) * 230, 120 + (k % 3) * 20, 130 + Math.sin(a) * 180]); }
        kit.particles({ emitters: em, count: 60, sphere: 24, life: 6.5, win: 0.32, grav: -9, size: 2.4, grow: -0.5, alpha: 1, pow: 0.6, fadeIn: 0.04, color: [0xff4060, 0x40d0ff, 0xffe040, 0x70ff70, 0xff80ff, 0xffa030], burst: true, tex: 'spark', additive: true });
        const vents = []; for (let d = 40; d < L - 20; d += 95) vents.push(kit.at(d, (rng() < 0.5 ? -1 : 1) * (HW - 0.6), 0.1));
        kit.particles({ emitters: vents, count: 7, vel: [0, 2.2, 0], spread: [0.5, 0.6, 0.5], life: 2.6, size: 2.6, grow: 2.2, alpha: 0.35, pow: 1.2, wob: 0.6, color: [0xc8d0ff, 0xffffff] });
        for (const sd of [-1, 1]) kit.crowdStand({ d0: L - 50, d1: L + 70, side: sd, l0: HW + 4 + 3.2, rows: 2, gap: 1.3, rise: 0, step: 2.4, scale: 1.1, radius: 55, colors: [0xff3df0, 0x3df2ff, 0xffe14a, 0x8f6bff, 0xffffff] });
        for (const d of [L * 0.03, L * 0.27, L * 0.55, L * 0.88]) { const f = kit.frame(d), hy = Math.atan2(f.tx, f.tz); kit.banner(f.x, f.y + 4.2, f.z, 5, 4, hy, d % 2 ? [0xff3df0, 0x3df2ff] : [0x3df2ff, 0xff3df0], { pattern: 'vstripes' }); }
      }
      metroExtra(kit, bldgs);
    };
  }

  // ---- Neon Metro beauty pass: billboards, rooftop crowns, viaduct, wet-road glow, street furniture, blimp
  function metroExtra(kit, bldgs) {
    const rng = kit.rng, col = kit.col, gy = kit.groundY, L = kit.length, HW = METRO_HW;
    const neon = [0xff3df0, 0x3df2ff, 0xffe14a, 0x8f6bff];
    const ads = Ads(kit, [
      { t: 'NEONCOLA', sub: 'TASTE THE VOLT', fg: '#ffffff', bg: '#e0208a', bg2: '#6a0a4a', ic: 'bolt' }, { t: 'RAMEN-YA', sub: 'OPEN 24H', fg: '#ffe14a', bg: '#d6322a', bg2: '#7a1410', ic: 'flame' },
      { t: 'ZENITH HOTEL', sub: 'SKY SUITES', fg: '#9ff6ff', bg: '#1a2a6a', bg2: '#0a1038', ic: 'diamond' }, { t: 'TURBO TUNES', sub: 'LIVE MUSIC', fg: '#ffffff', bg: '#7a3af0', bg2: '#341080', ic: 'wave' },
      { t: 'GLITCH GAMES', sub: 'PLAY LOUD', fg: '#3dff9a', bg: '#10202a', bg2: '#050a10', ic: 'star' }, { t: 'MOTOR CLUB', sub: 'EST. 2099', fg: '#ffe14a', bg: '#2a2a34', bg2: '#101014', ic: 'ring' },
      { t: 'SKYLINE BANK', sub: 'RISE ABOVE', fg: '#ffffff', bg: '#127a8a', bg2: '#08404a', ic: 'diamond' }, { t: 'BUBBLE POP', sub: 'TEA & MORE', fg: '#ffffff', bg: '#ff7ab8', bg2: '#b83a7a', ic: 'circle' },
      { t: 'HYPERLINK', sub: 'FIBER CITY', fg: '#ffffff', bg: '#2a6af0', bg2: '#0a2a80', ic: 'ring' }, { t: 'NIGHT OWL', sub: 'COFFEE BAR', fg: '#ffd9a0', bg: '#3a2a1e', bg2: '#1a100a', ic: 'leaf' },
      { t: 'VOLT ENERGY', sub: 'CHARGE UP', fg: '#10202a', bg: '#c8ff3a', bg2: '#7ab800', ic: 'bolt' }, { t: 'KARAOKE KING', sub: 'SING ALL NIGHT', fg: '#ffffff', bg: '#a02ad0', bg2: '#501070', ic: 'star' },
    ]);
    const halo = [], lamps = [], streak = new kit.Batch(true);
    // giant stilt billboards facing the road + rooftop boards on near towers
    let n = 0;
    for (let d = 52; d < L - 40; d += 96 + rng() * 30) {
      const sd = (n & 1) ? -1 : 1, f = kit.frame(d), p = kit.at(d, sd * (HW + 4 + 17), 0), hy = Math.atan2(f.tx, f.tz) + (sd > 0 ? Math.PI / 2 : -Math.PI / 2);
      ads.board(p[0], p[1], p[2], hy, 18, 5.6, n % 12, 0x20222e, 15);
      halo.push([p[0] - Math.sin(hy) * 0.5, p[1] + 17.6, p[2] - Math.cos(hy) * 0.5, neon[n & 3]]); n++;
    }
    for (const bd of bldgs) {
      if (bd.h < 45 || kit.clear(bd.x, bd.z, 80) || rng() < 0.4) continue;
      const nr = nearRoad(kit, bd.x, bd.z), ex = Math.max(bd.w, bd.dp) / 2 + 0.4;
      const px = bd.x + Math.sin(nr.ang) * ex, pz = bd.z + Math.cos(nr.ang) * ex;
      ads.board(px, gy + bd.h - 6, pz, nr.ang, Math.min(13, bd.w * 0.8), 3.2, (n++) % 12, 0x20222e, 0);
    }
    for (let d = 20; d < L - 20; d += 41) for (const sd of [-1, 1]) {
      const f = kit.frame(d), p = kit.at(d, sd * (HW + 4.6), 0);
      ads.board(p[0], p[1], p[2], Math.atan2(f.tx, f.tz) + (sd > 0 ? Math.PI / 2 : -Math.PI / 2), 6.4, 1.6, (n++) % 12, 0x2a2f44, 1.0);
    }
    ads.finish();
    // rooftop crowns: setbacks, tanks, neon rings
    const rb = new kit.Batch(), rn = new kit.Batch();
    for (const bd of bldgs) {
      if (bd.h < 50 || rng() < 0.5) continue;
      const k = kit.mix(col(0x1c2040), col(0x2a2a5a), rng()), cw = bd.w * (0.45 + rng() * 0.2), cd = bd.dp * (0.45 + rng() * 0.2), ch = 5 + rng() * 9, y = gy + bd.h;
      rb.box(bd.x, y, bd.z, cw, ch, cd, 0, k);
      rn.box(bd.x, y + ch, bd.z, cw + 0.3, 0.5, cd + 0.3, 0, col(neon[(rng() * 4) | 0]));
      if (rng() < 0.4) rb.box(bd.x + bd.w * 0.25, y, bd.z - bd.dp * 0.25, 2.4, 3.6, 2.4, 0, col(0x5a5a74));
      if (bd.h > 70 && rng() < 0.6) halo.push([bd.x, y + ch + 1, bd.z, neon[(rng() * 4) | 0]]);
    }
    kit.mesh(rb, {}, false);
    { const m = kit.mesh(rn, {}, true); if (m) kit.blinker(m.material, 3.4, { mode: 'sine', lo: 0.55 }); }
    // elevated rail viaduct parallel to the boulevard (deck, pillars, glowing rails)
    {
      const vb = new kit.Batch(), vn = new kit.Batch(), dk = col(0x34385a), dk2 = col(0x2a2e4a);
      for (const [d0, d1, sd] of [[L * 0.05, L * 0.2, 1], [L * 0.52, L * 0.66, -1]]) {
        const lat = sd * 31;
        for (let d = d0; d < d1; d += 4) {
          const a = kit.at(d, lat - 2.6, 10), b2 = kit.at(d + 4, lat - 2.6, 10), c = kit.at(d + 4, lat + 2.6, 10), e = kit.at(d, lat + 2.6, 10);
          vb.quad(a, b2, c, e, dk);
          const a2 = kit.at(d, lat - 2.6, 8.8), b3 = kit.at(d + 4, lat - 2.6, 8.8), c3 = kit.at(d + 4, lat + 2.6, 8.8), e3 = kit.at(d, lat + 2.6, 8.8);
          vb.quad(a2, a, b2, b3, dk2); vb.quad(c3, c, e, e3, dk2); vb.quad(e3, e, a, a2, dk2);
          for (const o of [-1.1, 1.1]) { const r0 = kit.at(d, lat + o, 10.1), r1 = kit.at(d + 4, lat + o, 10.1); vn.quad([r0[0], r0[1], r0[2]], [r1[0], r1[1], r1[2]], [r1[0], r1[1] + 0.15, r1[2]], [r0[0], r0[1] + 0.15, r0[2]], col(0x7af2ff)); }
          const w0 = kit.at(d, lat - 2.7, 10), w1 = kit.at(d + 4, lat - 2.7, 10); vn.quad(w0, w1, [w1[0], w1[1] + 0.35, w1[2]], [w0[0], w0[1] + 0.35, w0[2]], col(0xff3df0));
        }
        for (let d = d0 + 6; d < d1; d += 14) { const p = kit.at(d, lat, -1), q = kit.at(d, lat, 8.8), f = kit.frame(d); vb.box(p[0], p[1], p[2], 2.2, q[1] - p[1], 2.2, Math.atan2(f.tx, f.tz), col(0x3c4068)); vb.box(q[0], q[1] - 0.8, q[2], 7, 0.8, 2.4, Math.atan2(f.tx, f.tz) + Math.PI / 2, dk); }
        // train that shuttles along the viaduct
        const tb = new kit.Batch(), cols = [0xe8e8f4, 0xff3df0, 0x3df2ff];
        for (let c = 0; c < 3; c++) { tb.box(0, 0, c * 9.4, 3.2, 3, 9, 0, col(0xdfe3f2)); tb.box(0, 1.0, c * 9.4, 3.3, 0.8, 8, 0, [1, 0.9, 0.55]); tb.box(0, 2.9, c * 9.4, 3.4, 0.2, 9, 0, col(cols[c])); }
        const tm = new T.Mesh(kit.trackGeom(tb.build()), kit.mat({}, true)); const f0 = kit.frame((d0 + d1) / 2); tm.position.set(f0.x + f0.rx * lat, f0.y + 10.2, f0.z + f0.rz * lat); tm.rotation.y = Math.atan2(f0.tx, f0.tz); tm.frustumCulled = false; kit.add(tm);
        kit.slide(tm, f0.tx * (d1 - d0) * 0.35, 0, f0.tz * (d1 - d0) * 0.35, 0.18);
      }
      kit.mesh(vb, {}, false); kit.mesh(vn, {}, true);
    }
    // street furniture beyond the barrier: bus shelters, benches, bins, hydrants, phone booths
    const fb = new kit.Batch(), fg = new kit.Batch(), gl = [];
    for (let d = 14; d < L - 10; d += 23 + rng() * 10) for (const sd of [-1, 1]) {
      if (rng() < 0.35) continue;
      const f = kit.frame(d), hy = Math.atan2(f.tx, f.tz), p = kit.at(d, sd * (HW + 4 + 2.4 + rng() * 1.5), 0), face = hy + (sd > 0 ? Math.PI / 2 : -Math.PI / 2), r = rng();
      if (r < 0.3) { // bus shelter with lit ad
        fb.box(p[0], p[1], p[2], 4.4, 0.2, 1.8, hy, col(0x30344c)); fb.box(p[0], p[1] + 2.5, p[2], 4.6, 0.2, 2.0, hy, col(0x4a4f78));
        for (const o of [-2, 2]) { const q = [p[0] + Math.sin(hy) * 0, p[1], p[2]]; fb.box(q[0] + Math.cos(hy) * o, p[1], q[2] - Math.sin(hy) * o, 0.14, 2.5, 0.14, hy, col(0x30344c)); }
        const bk = [p[0] + Math.sin(face) * -0.8, p[2] + Math.cos(face) * -0.8]; fg.box(bk[0], p[1] + 0.5, bk[1], 3.6, 1.8, 0.1, face, [0.45, 0.95, 1]);
        gl.push([p[0], p[1] + 1.5, p[2], 0x3df2ff]);
      } else if (r < 0.55) { fb.box(p[0], p[1] + 0.5, p[2], 2.2, 0.16, 0.7, hy, col(0x6a4a2e)); fb.box(p[0], p[1] + 0.9, p[2] + 0, 2.2, 0.5, 0.12, hy, col(0x6a4a2e)); for (const o of [-0.9, 0.9]) fb.box(p[0] + Math.cos(hy) * o, p[1], p[2] - Math.sin(hy) * o, 0.14, 0.55, 0.5, hy, col(0x30344c)); }
      else if (r < 0.75) { fb.frustum(p[0], p[1], p[2], 0.42, 0.42, 1.0, 8, col(0x3c5a4a), 0); fb.frustum(p[0], p[1] + 1.0, p[2], 0.5, 0.35, 0.2, 8, col(0x20302a), 0); }
      else if (r < 0.9) { fb.box(p[0], p[1], p[2], 1.3, 2.7, 1.3, hy, col(0x2a3a8a)); fg.box(p[0] + Math.sin(face) * 0.66, p[1] + 0.9, p[2] + Math.cos(face) * 0.66, 0.9, 1.4, 0.08, face, [0.6, 1, 1]); gl.push([p[0], p[1] + 1.6, p[2], 0x7af2ff]); }
      else { fb.frustum(p[0], p[1], p[2], 0.22, 0.26, 0.8, 8, col(0xe8383d), 0); fb.blob(p[0], p[1] + 0.85, p[2], 0.26, 0.22, 0.26, col(0xe8383d), 0); }
    }
    kit.mesh(fb, {}, false); kit.mesh(fg, {}, true);
    // wet-road reflections: stretched neon glints on the tarmac + lamp pools
    for (let d = 8, i = 0; d < L - 12; d += 8.5, i++) {
      const l = (((i * 7) % 5) - 2) * 4.6 + (rng() - 0.5) * 2, c = col(neon[(i * 3 + ((rng() * 2) | 0)) & 3]), w = 1.3 + rng() * 1.6, len = 8 + rng() * 6, y = 0.1;
      const k = [c[0] * 0.5, c[1] * 0.5, c[2] * 0.5];
      streak.quadUV(kit.at(d, l - w, y), kit.at(d, l + w, y), kit.at(d + len, l + w, y), kit.at(d + len, l - w, y), k, [0, 0, 1, 0, 1, 1, 0, 1]);
    }
    { const m = kit.mesh(streak, { map: softMap(kit), transparent: true, blending: ADD, depthWrite: false, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }, true); if (m) { m.renderOrder = 3; kit.blinker(m.material, 5, { mode: 'sine', lo: 0.6 }); } }
    for (let d = 20; d < L - 10; d += 38) for (const sd of [-1, 1]) { const f = kit.frame(d), l = sd * (HW + 4 + 2.2); lamps.push([f.x + f.rx * (l - sd * 1.6), f.y + 9.4, f.z + f.rz * (l - sd * 1.6), 0xffe6b0]); }
    halos(kit, lamps, { size: 8, alpha: 0.7, fog: false });
    pools(kit, lamps.map((p) => [p[0], p[1] - 9.4, p[2], 9, 0xffd890]), { alpha: 0.5 });
    halos(kit, halo, { size: 26, alpha: 0.55, fog: false });
    halos(kit, gl, { size: 6, alpha: 0.6, fog: false });
    // blimp with a brand plate drifting over the skyline
    {
      const bb = new kit.Batch(); bb.blob(0, 0, 0, 7, 6, 22, col(0xdfe3f2), 1);
      for (const a of [0, 1.5708, 3.1416, 4.712]) bb.box(Math.cos(a) * 3, Math.sin(a) * 3 - 0.3, -20, 0.3, 0.3, 0, 0, col(0x3df2ff)), bb.box(Math.cos(a) * 3.2, Math.sin(a) * 3.2, -19, a & 1 ? 0.3 : 5, a & 1 ? 5 : 0.3, 5, 0, col(0xff3df0));
      bb.box(0, -6.6, 2, 2.2, 1.2, 5, 0, col(0x2a2a3a));
      const grp = new T.Group(), body = new T.Mesh(kit.trackGeom(bb.build()), kit.mat({})); grp.add(body);
      if (ads.map) {
        for (const sd of [-1, 1]) {
          const pg = kit.trackGeom(new T.PlaneGeometry(22, 5.5)), u0 = 0.5, v1 = 1 - 2 / ads.rows, uv = pg.attributes.uv;
          for (let q = 0; q < 4; q++) uv.setXY(q, u0 + (q & 1) * 0.5, v1 - (1 / ads.rows) * (q < 2 ? 1 : 0));
          const pm = new T.Mesh(pg, kit.trackMat(new T.MeshBasicMaterial({ map: ads.map, side: T.DoubleSide }))); pm.rotation.y = sd * Math.PI / 2; pm.position.set(sd * 6.4, 0.3, 0); grp.add(pm);
        }
      }
      grp.position.set(120, 120, 120); kit.add(grp); kit.bob(grp, 2.5, 0.3, 0, 0.02);
      kit.slide(grp, 90, 0, 40, 0.03);
    }
  }

  function metroHazards(S) {
    return function (track, kit) {
      const col = kit.col, L = kit.length, list = [];
      const mats = [];
      const carGeo = (len, wid, ht, cab, cabLen, kind) => {
        const b = new kit.Batch(), body = [1, 1, 1], glass = [0.08, 0.1, 0.16], tire = [0.05, 0.05, 0.06];
        b.box(0, 0.35, 0, wid, ht * 0.5, len, 0, body);
        b.box(0, 0.35 + ht * 0.5, -len * 0.05, wid * 0.88, cab, cabLen, 0, glass);
        b.box(0, 0.35 + ht * 0.5 + cab, -len * 0.05, wid * 0.9, 0.12, cabLen + 0.1, 0, body);
        b.box(-wid * 0.34, 0.3, len / 2 + 0.01, wid * 0.22, 0.28, 0.1, 0, [1, 1, 0.8]); b.box(wid * 0.34, 0.3 + 0.35, len / 2 + 0.01, wid * 0.22, 0.28, 0.1, 0, [1, 1, 0.8]);
        b.box(-wid * 0.34, 0.65, -len / 2 - 0.01, wid * 0.22, 0.24, 0.1, 0, [1, 0.1, 0.1]); b.box(wid * 0.34, 0.65, -len / 2 - 0.01, wid * 0.22, 0.24, 0.1, 0, [1, 0.1, 0.1]);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * wid / 2, 0, sz * len * 0.32, 0.25, 0.7, 0.8, 0, tire);
        if (kind === 'bus') for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) b.box(sx * (wid / 2 + 0.01), 1.5, -len * 0.4 + i * len * 0.16, 0.05, 0.9, len * 0.1, 0, [1, 0.95, 0.6]);
        if (kind === 'truck') { b.box(0, 0.5, -len * 0.18, wid * 1.0, ht * 1.2, len * 0.62, 0, [0.9, 0.9, 0.95]); }
        return kit.trackGeom(b.build());
      };
      const types = [
        { name: 'car', geo: carGeo(4.4, 2.1, 1.0, 0.75, 2.2), n: 12, r: 2.3 },
        { name: 'van', geo: carGeo(5.2, 2.3, 1.5, 0.9, 3.0), n: 4, r: 2.6 },
        { name: 'bus', geo: carGeo(11, 2.7, 2.2, 0.9, 9, 'bus'), n: 3, r: 4.2 },
      ];
      const palette = [0xff3d6a, 0x3dd4ff, 0xffd93d, 0x9d6bff, 0x4dffa0, 0xff8a3d, 0xe8e8f4, 0x3d6bff];
      const laneLat = [-10.5, -3.5, 3.5, 10.5];
      let ci = 0;
      types.forEach((ty) => {
        const mat = kit.trackMat(new T.MeshBasicMaterial({ vertexColors: true }));
        const inst = makeInst(kit, ty.geo, mat, ty.n);
        ty.inst = inst;
        for (let i = 0; i < ty.n; i++) {
          const lane = ty.name === 'bus' ? [1, 3, 0][i % 3] : (i * 3 + ci) % 4;
          const dir = laneLat[lane] < 0 ? -1 : 1;
          const v = (ty.name === 'bus' ? 11 : 13) + ((i * 5 + lane * 3) % 7) * 0.9;
          const d0 = (L * ((i + 0.3 + lane * 0.21 + ci * 0.07) % ty.n)) / ty.n + 140;
          const hz = { x: 0, y: 0, z: 0, radius: ty.r, hitKind: 'flip', vx: 0, vz: 0, active: true };
          const f = { x: 0, y: 0, z: 0, tx: 0, tz: 1, rx: -1, rz: 0, halfWidth: 12 };
          const lat = laneLat[lane], speed = v;
          inst.color(i, palette[(i * 3 + ci * 5) % palette.length]);
          const lastIdx = ty.n - 1;
          hz.update = function (dt, time) {
            let d = d0 + dir * speed * time; d = ((d % L) + L) % L;
            track._frame(d, f);
            this.x = f.x + f.rx * lat; this.z = f.z + f.rz * lat; this.y = f.y;
            this.vx = f.tx * speed * dir; this.vz = f.tz * speed * dir;
            inst.set(i, this.x, f.y, this.z, Math.atan2(f.tx * dir, f.tz * dir));
            if (i === lastIdx) inst.done();
          };
          hz.launchPose = function (L) { inst.pose(i, L.x, L.y, L.z, L.rx, L.ry, L.rz, L.s); inst.done(); };
          hz.popScale = function (k) { inst.pose(i, this.x, this.y, this.z, 0, Math.atan2(this.vx * dir, this.vz * dir) * dir, 0, k); inst.done(); };
          hz.update(0, 0);
          list.push(hz);
        }
        ci++;
      });
      return list;
    };
  }


  // ====================================================================================================
  // COURSE 3 — SERPENT COAST  (the road outlines a giant sea-serpent seen from above: head, S-coils, tail)
  // ====================================================================================================
  const SERP_HW = 10.5, SERP_SH = 4.5;
  const SERP = (function () {
    // spine (turtle) from snout to tail tip
    const segs = [['L', 112], ['A', -1, 64, Math.PI], ['L', 8], ['A', 1, 64, Math.PI], ['L', 30], ['A', -1, 52, Math.PI * 0.9]];
    let x = 0, z = 0, phi = 0, u = 0;
    const sx = [], sz = [], sp = [], su = [];
    const push = () => { sx.push(x); sz.push(z); sp.push(phi); su.push(u); };
    push();
    const st = 2;
    for (const sg of segs) {
      if (sg[0] === 'L') {
        const n = Math.round(sg[1] / st);
        for (let i = 0; i < n; i++) { x += Math.cos(phi) * st; z += Math.sin(phi) * st; u += st; push(); }
      } else {
        const R = sg[2], n = Math.round((R * sg[3]) / st), dphi = (sg[1] * st) / R;
        for (let i = 0; i < n; i++) {
          const pm = phi + dphi / 2;
          x += Math.cos(pm) * st; z += Math.sin(pm) * st; phi += dphi; u += st; push();
        }
      }
    }
    const U = u;
    const wf = (uu) => {
      let w;
      if (uu < 54) w = lerp(26, 50, sstep(0, 56, uu));
      else if (uu < 124) w = lerp(50, 26, sstep(56, 124, uu));
      else w = lerp(26, 32, sstep(124, 300, uu));
      const tt = sstep(U - 330, U, uu);
      return lerp(w, 21.5, tt);
    };
    const yf = (uu) => 4.2 + 4.2 * (0.5 + 0.5 * Math.sin(uu * 0.011 + 1.0)) + 6.5 * Math.exp(-Math.pow(uu / 62, 2));
    const sw = sx.map((_, i) => wf(su[i]));
    return { sx, sz, sp, su, sw, U, wf, yf, n: sx.length };
  })();

  function serpentPts() {
    const S = SERP, n = S.n, out = [];
    const L = (i) => [S.sx[i] - Math.sin(S.sp[i]) * S.sw[i], S.sz[i] + Math.cos(S.sp[i]) * S.sw[i]];
    const R = (i) => [S.sx[i] + Math.sin(S.sp[i]) * S.sw[i], S.sz[i] - Math.cos(S.sp[i]) * S.sw[i]];
    const iStart = Math.round(84 / 2);
    // path: left side tail-ward, tail cap, right side head-ward, head cap, back to start
    const dense = [];
    for (let i = iStart; i < n; i++) dense.push(L(i).concat([S.su[i]]));
    { const i = n - 1, w = S.sw[i], ph = S.sp[i];
      for (let k = 1; k < 24; k++) { const a = ph + Math.PI / 2 - (Math.PI * k) / 24; dense.push([S.sx[i] + Math.cos(a) * w, S.sz[i] + Math.sin(a) * w, S.su[i]]); } }
    for (let i = n - 1; i >= 0; i--) dense.push(R(i).concat([S.su[i]]));
    { const w = S.sw[0], ph = S.sp[0];
      for (let k = 1; k < 24; k++) { const a = ph - Math.PI / 2 - (Math.PI * k) / 24; dense.push([S.sx[0] + Math.cos(a) * w, S.sz[0] + Math.sin(a) * w, 0]); } }
    for (let i = 0; i < iStart; i++) dense.push(L(i).concat([S.su[i]]));
    // resample by arclength
    const cum = [0];
    for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
    const total = cum[cum.length - 1] + Math.hypot(dense[0][0] - dense[dense.length - 1][0], dense[0][1] - dense[dense.length - 1][1]);
    const m = Math.round(total / 11), step = total / m;
    let j = 0;
    for (let k = 0; k < m; k++) {
      const s = k * step;
      while (j < cum.length - 2 && cum[j + 1] < s) j++;
      const f = (s - cum[j]) / ((cum[j + 1] - cum[j]) || 1);
      const a = dense[j], b = dense[j + 1];
      const uu = a[2] + (b[2] - a[2]) * f;
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, S.yf(uu), SERP_HW + 0.4 * Math.sin(k * 0.5)]);
    }
    return out;
  }
  const SERP_PTS = serpentPts();
  // outline point at spine parameter u: side +1 = left outline, -1 = right outline, extra = outward metres
  function serpOutline(u, side, extra) {
    const i = clamp(Math.round(u / 2), 0, SERP.n - 1), ph = SERP.sp[i], w = SERP.sw[i] + (extra || 0);
    return [SERP.sx[i] - Math.sin(ph) * w * side, SERP.sz[i] + Math.cos(ph) * w * side, ph];
  }
  (function serpent() {
    const S = sampler(SERP_PTS), L = S.L;
    const dAt = (u, side) => { const p = serpOutline(u, side); return S.dOf(p[0], p[1]); };
    const dStart = dAt(84, 1);                      // pts[0] is the left outline at u=84 -> d=0
    const rel = (d) => { let r = d - dStart; return ((r % L) + L) % L; };
    const dJumpA = rel(dAt(104, -1)), dJumpB = rel(dAt(514, 1));
    const dTun = rel(dAt(226, 1)), dFall = rel(dAt(396, -1));
    SERP.marks = { dJumpA, dJumpB, dTun, dFall };
    G.defineTrack({
      id: 'serpent_coast', name: 'Serpent Coast', cup: 'star', order: 3, laps: 3, music: 'serpent', seed: 5303,
      hw: SERP_HW, shoulder: SERP_SH, scale: 1, style: 'meadow', ground: false, offroad: 'grass',
      walls: 'fence', wallColors: [0xf4efe0, 0xd9cfae],
      theme: {
        sky: [0x2f8fe8, 0x9fdcf8, 0xcff1f6], fog: [0xbfe9f4, 160, 640], ground: 0x087096, shoulder: 0x77c35a,
        road: [0x7f766a, 0x776e62], curb: [0xff6a5a, 0xfff6e0], hemi: [0xdff4ff, 0x7fbf8a, 1.0], sun: [0xfff0d0, 0.9],
        emb: 0xe6d49a, bg: 0xbfe9f4,
      },
      pts: SERP_PTS,
      pads: [
        { d: 40, len: 10, l: -4, w: 6 }, { d: 40, len: 10, l: 4, w: 6 },
        { d: rel(dAt(300, 1)), len: 10, l: 0, w: 9 }, { d: rel(dAt(300, -1)) - 5, len: 10, l: 0, w: 9 },
        { d: rel(dAt(560, -1)), len: 10, l: 0, w: 9 },
      ],
      jumps: [{ d: dJumpA, len: 10, l: 0, w: 2 * SERP_HW + 2 }, { d: dJumpB, len: 10, l: 0, w: 13 }],
      zones: [
        { d: dJumpA + 11, len: 9, l: 0, w: 2 * (SERP_HW + SERP_SH), surface: 'void', offroad: true, color: 0x14688c },
        { d: dFall - 11, len: 22, l: 0, w: 2 * (SERP_HW + SERP_SH), surface: 'water', offroad: true, color: 0x62d0f2 },
      ],
      itemRows: [0.05, 0.19, 0.34, 0.5, 0.66, 0.83].map((f, i) => ({ d: f * L, count: 5, double: i === 3 || i === 5 })),
      decorate: serpentDecor(S, { dJumpA, dJumpB, dTun, dFall, rel, dAt }),
      hazards: () => [],
    });
  })();

  function serpentDecor(Sm, M) {
    return function (track, kit) {
      const rng = kit.rng, col = kit.col, SP = SERP, n = SP.n, hw = SERP_HW, edge = SERP_HW + SERP_SH;
      const nr = { i: 0, dist: 0, lat: 0 };
      const nearSp = (x, z) => {
        let bi = 0, bd = 1e18;
        for (let i = 0; i < n; i++) { const dx = x - SP.sx[i], dz = z - SP.sz[i], d = dx * dx + dz * dz; if (d < bd) { bd = d; bi = i; } }
        const ph = SP.sp[bi];
        nr.i = bi; nr.dist = Math.sqrt(bd); nr.lat = -(x - SP.sx[bi]) * Math.sin(ph) + (z - SP.sz[bi]) * Math.cos(ph);
        return nr;
      };
      const terrH = (x, z) => {
        nearSp(x, z);
        const i = nr.i, w = SP.sw[i], roadH = SP.yf(SP.su[i]) - 0.8, dist = nr.dist;
        if (dist <= w) return roadH + 8 * sstep(edge, edge + 22, w - dist);
        const dd = dist - w;
        if (dd <= 23) return roadH;
        return Math.max(0.04, roadH - (dd - 23) * 0.3);
      };
      const seaC = col(0x087096);
      const sand = col(0xe4d092), foam = col(0xcdeee8), shallow = col(0x3fc2b4);
      const terr = makeTerrain(kit, {
        direct: true, cell: 7, pad: 150,
        height: (x, z) => terrH(x, z),
        color: (x, z, h) => {
          nearSp(x, z);
          const i = nr.i, w = SP.sw[i], u = SP.su[i], dist = nr.dist, lat = nr.lat, nz = (rng() - 0.5) * 0.08;
          if (dist <= w) {
            const din = w - dist;
            if (din > edge - 1) {
              const dia = (Math.floor(u / 9) + Math.floor((lat + 120) / 8)) & 1;
              let c = u < 124 ? (dia ? 0xa8d94c : 0x93c63f) : (dia ? 0x43a64b : 0x359340);
              if (Math.abs(lat) < 2.8) c = u < 124 ? 0xe8e86a : 0xc4e65c;
              return kit.mul(col(c), 1 + nz);
            }
            return kit.mul(col(0x6cc452), 1 + nz);
          }
          if (h <= 0.06) {
            const dd = dist - w;
            if (dd < 40) return dd < 30 ? foam : shallow;
            return kit.mix(shallow, seaC, sstep(40, 150, dd));
          }
          if (h < 1.3) return kit.mul(sand, 1 + nz);
          return kit.mul(col((Math.floor(x / 11) + Math.floor(z / 11)) & 1 ? 0x62bd4a : 0x58b043), 1 + nz);
        },
      });
      kit.mesh(terr.mesh, {}, false);
      // sea plane (same lambert colour as the far shelf)
      {
        const g = kit.trackGeom(new T.PlaneGeometry(7000, 7000)); g.rotateX(-Math.PI / 2);
        const m = new T.Mesh(g, kit.waterMat({ color: 0x3fc2b4, deep: 0x087096, opacity: 0.84 }));   // animated sea over the baked shallows
        m.position.set(0, 0.1, 0); m.frustumCulled = false; kit.add(m);
      }
      // random point helper (accepts via cb returning true)
      let bbx0 = 1e9, bbx1 = -1e9, bbz0 = 1e9, bbz1 = -1e9;
      for (let i = 0; i < n; i++) { bbx0 = Math.min(bbx0, SP.sx[i]); bbx1 = Math.max(bbx1, SP.sx[i]); bbz0 = Math.min(bbz0, SP.sz[i]); bbz1 = Math.max(bbz1, SP.sz[i]); }
      const sprinkle = (count, tries, cb) => {
        let k = 0;
        for (let t = 0; t < tries && k < count; t++) {
          const x = bbx0 - 70 + rng() * (bbx1 - bbx0 + 140), z = bbz0 - 70 + rng() * (bbz1 - bbz0 + 140);
          if (!kit.clear(x, z, 19)) continue;
          if (cb(x, z)) k++;
        }
      };
      const b = new kit.Batch(), pbat = new kit.Batch();   // pbat: palms (wind-swayed)
      // ---- palms
      const trunk = col(0x9a6a3a), frond = [col(0x2f9a3a), col(0x3fb04a), col(0x58c25a)];
      const palm = (x, y, z, s, r) => {
        const lean = (r() - 0.5) * 2.2, ang = r() * TAU;
        const dx = Math.cos(ang) * lean * s, dz = Math.sin(ang) * lean * s;
        const p0 = [x, y, z], p1 = [x + dx * 0.5, y + 3.2 * s, z + dz * 0.5], p2 = [x + dx, y + 6.6 * s, z + dz];
        tube(pbat, p0, p1, 0.38 * s, 0.3 * s, 5, trunk); tube(pbat, p1, p2, 0.3 * s, 0.24 * s, 5, trunk);
        for (let f = 0; f < 7; f++) {
          const a = (f / 7) * TAU + r(), c = Math.cos(a), sn = Math.sin(a), len = 3.4 * s;
          const tip = [p2[0] + c * len, p2[1] - 1.5 * s, p2[2] + sn * len], mid = [p2[0] + c * len * 0.5, p2[1] + 0.9 * s, p2[2] + sn * len * 0.5];
          const px = -sn * 0.55 * s, pz = c * 0.55 * s, k = frond[f % 3];
          pbat.tri([p2[0], p2[1], p2[2]], [mid[0] + px, mid[1], mid[2] + pz], [mid[0] - px, mid[1], mid[2] - pz], k);
          pbat.tri([mid[0] + px, mid[1], mid[2] + pz], tip, [mid[0] - px, mid[1], mid[2] - pz], k);
        }
        pbat.blob(p2[0], p2[1] - 0.2, p2[2], 0.35 * s, 0.35 * s, 0.35 * s, col(0x6a4a2a), 0);
      };
      sprinkle(190, 3000, (x, z) => {
        const h = terrH(x, z); nearSp(x, z);
        if (h < 1.0 || nr.dist < SP.sw[nr.i] + 3) return false;
        palm(x, h, z, 0.8 + rng() * 0.7, rng); return true;
      });
      // ---- flowers (hibiscus clusters) and bushes
      const fl = [col(0xff4f7a), col(0xff9a3d), col(0xffe14a), col(0xffffff), col(0xff6ad5)];
      sprinkle(360, 5000, (x, z) => {
        const h = terrH(x, z); nearSp(x, z);
        if (h < 1.3 || nr.dist < SP.sw[nr.i] + 1) return false;
        if (!kit.clear(x, z, 17.5)) return false;
        const c = fl[(rng() * fl.length) | 0];
        b.blob(x, h + 0.4, z, 0.9 + rng() * 0.5, 0.55, 0.9 + rng() * 0.5, col(0x2f8f3a), 0);
        for (let k = 0; k < 4; k++) b.blob(x + (rng() - 0.5) * 1.6, h + 0.85 + rng() * 0.3, z + (rng() - 0.5) * 1.6, 0.34, 0.26, 0.34, c, 0);
        return true;
      });
      // roadside flower strips right outside the fence
      for (let d = 6; d < kit.length - 6; d += 7 + rng() * 6) for (const sd of [-1, 1]) {
        const p = kit.at(d, sd * (edge + 2.2 + rng() * 2), 0);
        if (rng() < 0.55) continue;
        const h = terrH(p[0], p[2]); if (h < 1.3) continue;
        const c = fl[(rng() * fl.length) | 0];
        for (let k = 0; k < 3; k++) b.blob(p[0] + (rng() - 0.5) * 2, p[1] - 0.6 + rng() * 0.3, p[2] + (rng() - 0.5) * 2, 0.4, 0.3, 0.4, c, 0);
      }
      // rocks on beaches
      sprinkle(60, 4000, (x, z) => {
        const h = terrH(x, z); if (h > 1.8 || h < 0.04) return false;
        const s = 0.8 + rng() * 2.2; b.blob(x, h, z, 1.6 * s, 0.9 * s, 1.3 * s, kit.mul(col(0x9a9a96), 0.9 + rng() * 0.2), 0); return true;
      });
      // far tropical islets
      for (let k = 0; k < 14; k++) {
        const a = rng() * TAU, r = 420 + rng() * 520, cx = (bbx0 + bbx1) / 2 + Math.cos(a) * r, cz = (bbz0 + bbz1) / 2 + Math.sin(a) * r;
        const s = 14 + rng() * 26;
        b.blob(cx, -1.5, cz, s, 3 + s * 0.12, s * 0.8, col(0xe8d59a), 1);
        b.blob(cx, 1.5, cz, s * 0.7, 2.4 + s * 0.1, s * 0.6, col(0x4ab048), 1);
        for (let q = 0; q < 4; q++) palm(cx + (rng() - 0.5) * s * 0.6, 3.5, cz + (rng() - 0.5) * s * 0.5, 1.2 + rng() * 0.8, rng);
      }
      // sailboats bobbing on the swell
      {
        const hb = new kit.Batch(); hb.box(0, 0, 0, 2.2, 1.0, 7, 0, col(0xf4efe0)); tube(hb, [0, 0.9, 0], [0, 9, 0], 0.15, 0.1, 4, col(0x6a4a2a));
        hb.tri([0.05, 8.6, 0], [0.05, 1.6, 0], [0.05, 1.6, 3.2], col(0xffffff)); hb.tri([-0.05, 8.6, 0], [-0.05, 1.6, 3.2], [-0.05, 1.6, 0], col(0xffffff));
        hb.tri([0.05, 8.6, 0], [0.05, 1.6, -2.4], [0.05, 1.6, 0], [1, 0.45, 0.4]); hb.tri([-0.05, 8.6, 0], [-0.05, 1.6, 0], [-0.05, 1.6, -2.4], [1, 0.45, 0.4]);
        const hg = kit.trackGeom(hb.build());
        let placed = 0;
        for (let k = 0; k < 40 && placed < 9; k++) {
          const x = bbx0 - 250 + rng() * (bbx1 - bbx0 + 500), z = bbz0 - 250 + rng() * (bbz1 - bbz0 + 500);
          if (terrH(x, z) > 0.05) continue;
          const m = new T.Mesh(hg, kit.mat({})); m.position.set(x, 0.1, z); m.rotation.y = rng() * TAU; kit.add(m); kit.bob(m, 0.22, 1 + rng() * 0.4, rng() * 6, 0.05); placed++;
        }
      }
      kit.birds({ cx: (bbx0 + bbx1) / 2, cz: (bbz0 + bbz1) / 2, y: 40, radius: 200, count: 10, speed: 0.08, size: 1.4 });
      kit.birds({ cx: bbx0 + 60, cz: bbz0 + 40, y: 28, radius: 90, count: 6, speed: -0.12 });
      // ---- serpent landmarks: eyes, brow, nostrils, forked tongue, dorsal spines
      {
        const i0 = Math.round(34 / 2);
        for (const sd of [-1, 1]) {
          const w = SP.sw[i0], ph = SP.sp[i0];
          const ex = SP.sx[i0] - Math.sin(ph) * w * 0.5 * sd, ez = SP.sz[i0] + Math.cos(ph) * w * 0.5 * sd, eh = terrH(ex, ez);
          b.blob(ex, eh + 4.2, ez, 5.6, 5.2, 5.6, [1, 0.98, 0.9], 1);
          const fx = Math.cos(ph) * -1, fz = Math.sin(ph) * -1;
          b.blob(ex + fx * 3.2, eh + 4.4, ez + fz * 3.2, 3.0, 3.4, 3.0, col(0xffc21a), 1);
          b.blob(ex + fx * 4.6, eh + 4.4, ez + fz * 4.6, 1.2, 2.8, 1.2, col(0x101010), 0);
          b.box(ex + fx * 0.5, eh + 8.2, ez + fz * 0.5, 8, 1.6, 3, -ph, col(0x2c7a34));
        }
        // nostrils
        for (const sd of [-1, 1]) {
          const i1 = 1, ph = SP.sp[i1], w = SP.sw[i1];
          const nx = SP.sx[i1] - Math.sin(ph) * w * 0.28 * sd - Math.cos(ph) * 10, nz = SP.sz[i1] + Math.cos(ph) * w * 0.28 * sd - Math.sin(ph) * 10;
          b.blob(nx, terrH(nx, nz) + 1.3, nz, 1.8, 1.0, 1.8, col(0x2c6a30), 0);
        }
        // forked tongue lying on the headland / beach
        const ph = SP.sp[0], tx = -Math.cos(ph), tz = -Math.sin(ph), nxl = -Math.sin(ph), nzl = Math.cos(ph), red = col(0xe8283c);
        const tone = (d0, d1, w0, w1, off) => {
          const q = (d, w) => { const x = SP.sx[0] + tx * d + nxl * (off + 0) , z = SP.sz[0] + tz * d + nzl * off; return [x + nxl * w, z + nzl * w, x, z]; };
          for (let d = d0; d < d1; d += 3) {
            const wa = lerp(w0, w1, (d - d0) / (d1 - d0)), wb = lerp(w0, w1, (d + 3 - d0) / (d1 - d0));
            const ax = SP.sx[0] + tx * d + nxl * off, az = SP.sz[0] + tz * d + nzl * off, bx = SP.sx[0] + tx * (d + 3) + nxl * off, bz = SP.sz[0] + tz * (d + 3) + nzl * off;
            const ya = Math.max(terrH(ax, az), 0.3) + 0.25, yb = Math.max(terrH(bx, bz), 0.3) + 0.25;
            b.quad([ax - nxl * wa, ya, az - nzl * wa], [ax + nxl * wa, ya, az + nzl * wa], [bx + nxl * wb, yb, bz + nzl * wb], [bx - nxl * wb, yb, bz - nzl * wb], red);
          }
        };
        tone(46, 78, 2.2, 1.6, 0);
        for (const sd of [-1, 1]) {
          for (let d = 78; d < 98; d += 3) {
            const off = sd * (1.6 + (d - 78) * 0.42), ax = SP.sx[0] + tx * d + nxl * off, az = SP.sz[0] + tz * d + nzl * off;
            const bx = SP.sx[0] + tx * (d + 3) + nxl * (off + sd * 1.25), bz = SP.sz[0] + tz * (d + 3) + nzl * (off + sd * 1.25);
            const wd = 1.3 - (d - 78) * 0.045, ya = Math.max(terrH(ax, az), 0.3) + 0.25, yb = Math.max(terrH(bx, bz), 0.3) + 0.25;
            b.quad([ax - nxl * wd, ya, az - nzl * wd], [ax + nxl * wd, ya, az + nzl * wd], [bx + nxl * wd, yb, bz + nzl * wd], [bx - nxl * wd, yb, bz - nzl * wd], red);
          }
        }
        // dorsal spines along the spine
        for (let u = 70; u < SP.U - 24; u += 7) {
          const i = Math.round(u / 2), x = SP.sx[i], z = SP.sz[i], h = terrH(x, z), s = 0.8 + 0.9 * (SP.sw[i] / 32);
          const c = (Math.floor(u / 7) & 1) ? col(0x2fa86a) : col(0xffd23d);
          b.frustum(x, h - 0.2, z, 1.0 * s, 0, 3.8 * s, 6, c, u);
        }
      }
      kit.mesh(b, {}, false);
      { const pm = kit.mesh(pbat, { wind: { strength: 0.45, heightScale: 0.2 } }, false); void pm; }
      for (const sd of [-1, 1]) kit.crowdStand({ d0: kit.length - 50, d1: kit.length + 70, side: sd, l0: edge + 2.6, rows: 2, gap: 1.3, rise: 0, step: 2.4, scale: 1.1, radius: 55, dy: -0.8 });
      for (let d = 10; d < 160; d += 32) for (let sd = -1; sd <= 1; sd += 2) kit.flagAt(d, sd * (edge + 1), 2.6, 1.5, [[0xff6a5a, 0xfff6e0], [0x2c9ad6, 0xffffff]][((d / 32) | 0) & 1], { pole: 6.5 });

      // ---- hill tunnel
      {
        const tb = new kit.Batch(), d0 = M.dTun - 28, d1 = M.dTun + 42;
        const r1 = col(0x8a7a66), r2 = col(0x7a6a58), g1 = col(0x3f9a46), g2 = col(0x57b34f);
        tunnel(kit, tb, {
          d0, d1, step: 5, na: 12, rx: edge + 2, h: 12.5, thick: 8, y0: -3,
          color: (k, j, inner) => (inner ? ((k + j) & 1 ? col(0x5e5446) : col(0x6a5f50)) : (j > 3 && j < 11 ? ((k + j) & 1 ? g1 : g2) : ((k + j) & 1 ? r1 : r2))),
          rim: (j) => (j & 1 ? col(0xd9cbb0) : col(0xc9b999)),
        });
        for (let d = d0 + 6; d < d1 - 2; d += 10) for (const sd of [-1, 1]) {
          const p = kit.at(d, sd * (edge + 1.2), 4.5); tb.box(p[0], p[1], p[2], 0.8, 0.8, 0.8, 0, col(0xffe9a0));
        }
        kit.mesh(tb, {}, false);
      }
      // ---- waterfall cliff beside the road
      {
        const fb = new kit.Batch(), wb = new kit.Batch(), dF = M.dFall;
        // outward side = the one farther from the spine
        const f0 = kit.frame(dF), pa = kit.at(dF, 30, 0), pb = kit.at(dF, -30, 0);
        nearSp(pa[0], pa[2]); const da = nr.dist; nearSp(pb[0], pb[2]); const db = nr.dist;
        const sd = da > db ? 1 : -1;
        const hy = Math.atan2(f0.tx, f0.tz);
        const rock = [col(0x8a7a66), col(0x7a6a58), col(0x9a8a74)];
        for (let k = 0; k < 9; k++) {
          const dd = dF - 22 + k * 5.5, off = sd * (edge + 6 + rng() * 3), p = kit.at(dd, off, 0), hgt = 16 + rng() * 8;
          fb.frustum(p[0], p[1] - 2, p[2], 6 + rng() * 2, 4 + rng() * 2, hgt, 7, rock[k % 3], rng());
          fb.blob(p[0], p[1] + hgt - 2.5, p[2], 5.5, 3, 5.5, col(0x3f9a46), 1);
        }
        const top = kit.at(dF, sd * (edge + 3.4), 18), base = kit.at(dF, sd * (edge + 3.4), 0.2);
        {   // flowing water sheet: scrolling texture panel down the cliff face
          const fm = kit.flowMat('water', { speed: [0, 1.5], repeat: [2, 4], fallback: 0xbfeaff });
          kit.panel([kit.at(dF - 8, sd * (edge + 1.6), 0.3), kit.at(dF + 8, sd * (edge + 1.6), 0.3), kit.at(dF + 8, sd * (edge + 1.6), 17.4), kit.at(dF - 8, sd * (edge + 1.6), 17.4)], fm, [1, 1]);
        }
        const pool = kit.at(dF, sd * (edge + 1), 0.3);
        wb.blob(pool[0], pool[1], pool[2], 9, 0.5, 9, col(0xcdf2ff), 1);
        for (let k = 0; k < 6; k++) wb.blob(pool[0] + (rng() - 0.5) * 7, pool[1] + 1 + rng() * 2, pool[2] + (rng() - 0.5) * 7, 1.8, 1.8, 1.8, [1, 1, 1], 0);
        kit.mesh(fb, {}, false);
        kit.mesh(wb, { transparent: true, opacity: 0.86 }, false);
        kit.particles({ x: pool[0], y: pool[1] + 1.2, z: pool[2], count: 30, vel: [0, 2.4, 0], spread: [2.4, 1, 2.4], jitter: [3, 0.5, 3], life: 2.2, size: 3.2, grow: 1.6, alpha: 0.4, pow: 1.1, color: [0xffffff, 0xdff6ff] });   // spray + mist
        // cascade across the road: pale stripes (decal-like) flowing from the pool
        const sb = new kit.Batch();
        for (let k = 0; k < 6; k++) {
          const l = sd * (edge - 2 - k * 4.2);
          const a = kit.at(dF - 10, l, 0.14), c = kit.at(dF + 10, l, 0.14), a2 = kit.at(dF - 10, l + 1.2, 0.14), c2 = kit.at(dF + 10, l + 1.2, 0.14);
          sb.quad(a, c, c2, a2, col(0xe6fbff));
        }
        kit.mesh(sb, {}, true);
      }
      // ---- cliff-jump set dressing: ramp banners and chevron signs
      {
        const jb = new kit.Batch();
        for (const dj of [M.dJumpA, M.dJumpB]) {
          for (const sd of [-1, 1]) {
            const p = kit.at(dj - 2, sd * (hw + 1.8), 0), q = kit.at(dj - 2, sd * (hw + 1.8), 5.5);
            tube(jb, p, q, 0.22, 0.22, 5, col(0xf4efe0));
            const f = kit.frame(dj - 2), hy = Math.atan2(f.tx, f.tz);
            jb.box(q[0], q[1] - 1.4, q[2], 0.2, 1.4, 3.0, hy, col(0xff6a5a));
          }
        }
        for (let k = 0; k < 4; k++) for (const sd of [-1, 1]) {
          const p = kit.at(M.dJumpA - 50 + k * 10, sd * (hw + 1.4), 0), q = kit.at(M.dJumpA - 50 + k * 10, sd * (hw + 1.4), 2.2);
          tube(jb, p, q, 0.12, 0.12, 4, col(0xcccccc));
          const f = kit.frame(M.dJumpA - 50 + k * 10), hy = Math.atan2(f.tx, f.tz);
          jb.box(q[0], q[1] - 0.8, q[2], 0.1, 0.9, 1.6, hy, k & 1 ? col(0xffe14a) : col(0x2a2a2a));
        }
        kit.mesh(jb, {}, false);
      }
      serpentExtra(kit, { terrH, nearSp, nr, sprinkle, bbx0, bbx1, bbz0, bbz1 });
    };
  }

  // ---- Serpent Coast beauty pass: jungle canopy, beach huts, sea arches, islands, torches, adverts, bunting
  function serpentExtra(kit, X) {
    const rng = kit.rng, col = kit.col, SP = SERP, edge = SERP_HW + SERP_SH, L = kit.length, { terrH, nearSp, nr, sprinkle } = X;
    const cx = (X.bbx0 + X.bbx1) / 2, cz = (X.bbz0 + X.bbz1) / 2;
    const b = new kit.Batch(), fb = new kit.Batch(), tk = [], halo = [];
    const trunk = col(0x8a5a30), leaf = [col(0x1f8a3a), col(0x2fa84a), col(0x46c25a), col(0x1a7a4a)], pet = [col(0xff4f7a), col(0xffd23a), col(0xff8a3d), col(0xffffff)];
    // broadleaf jungle canopy with blossoms
    sprinkle(170, 4000, (x, z) => {
      const h = terrH(x, z); nearSp(x, z);
      if (h < 1.4 || nr.dist < SP.sw[nr.i] + 4 || !kit.clear(x, z, 18.5)) return false;
      const s = 0.8 + rng() * 0.9, lean = (rng() - 0.5) * 1.4, ht = (6 + rng() * 4) * s;
      tube(fb, [x, h - 0.5, z], [x + lean, h + ht, z], 0.5 * s, 0.3 * s, 5, trunk);
      for (let k = 0; k < 3; k++) fb.blob(x + lean + (rng() - 0.5) * 3.6 * s, h + ht + (rng() - 0.2) * s, z + (rng() - 0.5) * 3.6 * s, 3.4 * s, 1.7 * s, 3.4 * s, leaf[(rng() * 4) | 0], 0);
      if (rng() < 0.35) for (let k = 0; k < 4; k++) fb.blob(x + lean + (rng() - 0.5) * 5 * s, h + ht + 1.3 * s, z + (rng() - 0.5) * 5 * s, 0.5, 0.4, 0.5, pet[(rng() * 4) | 0], 0);
      return true;
    });
    // flowering hedges hugging the fence line
    for (let d = 5, i = 0; d < L - 5; d += 13 + rng() * 6, i++) for (const sd of [-1, 1]) {
      const p = kit.at(d, sd * (edge + 4.5 + rng() * 2), 0), h = terrH(p[0], p[2]); if (h < 1.3) continue;
      const c = pet[(rng() * 4) | 0];
      fb.blob(p[0], h + 0.5, p[2], 1.6, 0.9, 1.4, leaf[i & 3], 0);
      for (let k = 0; k < 3; k++) fb.blob(p[0] + (rng() - 0.5) * 2.2, h + 1.0 + rng() * 0.4, p[2] + (rng() - 0.5) * 1.6, 0.42, 0.34, 0.42, c, 0);
    }
    // beach: tiki huts, umbrellas, towels
    let huts = 0, umb = 0;
    sprinkle(26, 6000, (x, z) => {
      const h = terrH(x, z); nearSp(x, z);
      if (h < 0.25 || h > 1.1 || nr.dist < SP.sw[nr.i] + 9 || !kit.clear(x, z, 21)) return false;
      if (huts < 7 && rng() < 0.4) {
        huts++; const ry = rng() * TAU;
        b.box(x, h - 0.2, z, 4.4, 0.4, 4.4, ry, col(0xb08a5a));
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(x + rotX(sx * 1.9, sz * 1.9, ry), h, z + rotZ(sx * 1.9, sz * 1.9, ry), 0.22, 2.3, 0.22, ry, trunk);
        b.frustum(x, h + 2.2, z, 3.6, 0, 2.2, 8, col(0xd9b45a), 0); b.frustum(x, h + 2.2, z, 3.8, 3.4, 0.3, 8, col(0xb08a3a), 0);
        b.box(x + 2.6, h, z, 0.14, 1.5, 0.14, 0, trunk); tk.push([x + 2.6, h + 1.7, z]);
      } else {
        umb++; const c = [col(0xff4f4f), col(0xffd23a), col(0x3da8ff), col(0xffffff)][umb & 3];
        b.box(x, h, z, 0.1, 2.6, 0.1, 0, col(0xf4efe0)); b.frustum(x, h + 2.4, z, 1.9, 0, 0.8, 8, c, 0);
        b.box(x + 1.3, h + 0.02, z + 0.6, 1.0, 0.06, 2.0, rng() * 1.5, col(0x3da8ff)); b.box(x - 1.6, h + 0.02, z - 0.4, 1.0, 0.06, 2.0, rng() * 1.5, col(0xff9a3d));
      }
      return true;
    });
    // rock arches and sea stacks in the shallows
    let arches = 0, stacks = 0;
    for (let t = 0; t < 400 && (arches < 4 || stacks < 9); t++) {
      const x = X.bbx0 - 120 + rng() * (X.bbx1 - X.bbx0 + 240), z = X.bbz0 - 120 + rng() * (X.bbz1 - X.bbz0 + 240);
      if (terrH(x, z) > 0.05) continue; nearSp(x, z);
      const dd = nr.dist - SP.sw[nr.i]; if (dd < 32 || dd > 110) continue;
      const rk = [col(0xb09a78), col(0x9a8664), col(0xc4ae8a)];
      if (arches < 4 && rng() < 0.4) {
        arches++; const a = rng() * TAU, sp = 7;
        for (const sg of [-1, 1]) { const px = x + Math.cos(a) * sp * sg, pz = z + Math.sin(a) * sp * sg; b.frustum(px, -1.5, pz, 5.2, 3.2, 12, 8, rk[0], 0); b.blob(px, 10.5, pz, 4.2, 2.4, 4.2, col(0x3fa050), 0); }
        b.blob(x, 9.5, z, 8.5, 2.2, 3.4, rk[1], 0);
      } else if (stacks < 9) { stacks++; const h = 6 + rng() * 10; b.frustum(x, -1.5, z, 3.4 + rng() * 2, 1.8, h, 7, rk[(rng() * 3) | 0], rng()); b.blob(x, h - 1.5, z, 2.6, 1.2, 2.6, col(0x3fa050), 0); }
    }
    // far volcanic islands with falls
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * TAU + rng() * 0.4, r = 480 + rng() * 380, ix = cx + Math.cos(a) * r, iz = cz + Math.sin(a) * r, s = 40 + rng() * 40, hh = 40 + rng() * 60;
      b.blob(ix, -3, iz, s * 1.5, 7, s * 1.2, col(0xe8d59a), 1);
      b.frustum(ix, 0, iz, s, s * 0.22, hh, 9, kit.mix(col(0x2f8f4a), col(0x6aa05a), rng()), rng() * 3);
      b.frustum(ix, hh * 0.7, iz, s * 0.45, 0, hh * 0.45, 9, col(0x7a7a6a), 0);
      b.box(ix + s * 0.3, 2, iz - s * 0.2, 3, hh * 0.7, 1.2, a, col(0xdff6ff));
      for (let q = 0; q < 6; q++) b.blob(ix + (rng() - 0.5) * s * 1.1, 6, iz + (rng() - 0.5) * s, 6, 4, 6, col(0x2f9a3a), 0);
    }
    kit.mesh(b, {}, false); kit.foliage(fb, { strength: 0.4, heightScale: 0.18 });
    // tiki torches along the roadside + lanterns on huts
    for (let d = 20; d < L - 10; d += 30) for (const sd of [-1, 1]) {
      const p = kit.at(d, sd * (edge + 1.8), 0); if (terrH(p[0], p[2]) < 1.2) continue;
      tk.push([p[0], p[1] + 2.2, p[2]]);
    }
    {
      const tb = new kit.Batch();
      for (const q of tk) { const h = terrH(q[0], q[2]); tb.box(q[0], q[1] - 1.7, q[2], 0.14, 1.7, 0.14, 0, trunk); tb.box(q[0], q[1] - 0.1, q[2], 0.4, 0.2, 0.4, 0, col(0x4a3a2a)); halo.push([q[0], q[1] + 0.4, q[2], 0xffa040]); }
      kit.mesh(tb, {}, false);
      if (tk.length) kit.particles({ emitters: tk.map((q) => [q[0], q[1] + 0.1, q[2]]), count: 5, vel: [0, 1.6, 0], spread: [0.15, 0.4, 0.15], life: 0.7, size: 0.8, grow: -0.5, alpha: 0.95, color: [0xffa030, 0xffd060, 0xff6a20], additive: true });
      halos(kit, halo, { size: 5, alpha: 0.55 });
    }
    // sparkling sea
    kit.particles({ x: cx, y: 0.5, z: cz, count: 420, vel: [0, 0.05, 0], spread: [0.1, 0.05, 0.1], jitter: [380, 0.2, 330], life: 1.5, size: 1.3, alpha: 1, pow: 0.5, fadeIn: 0.3, color: [0xffffff, 0xbff4ff], tex: 'spark', additive: true });
    // adverts along the fence, bunting along the start straight, road paint
    {
      const ads = Ads(kit, [
        { t: 'COCO COAST', sub: 'RESORT & SPA', fg: '#ffffff', bg: '#16a0b8', bg2: '#0a5a78', ic: 'wave' }, { t: 'SERPENT SODA', sub: 'BITE OF FIZZ', fg: '#ffe14a', bg: '#2a9a3a', bg2: '#145a22', ic: 'flame' },
        { t: 'TIKI TAN', sub: 'SUN LOTION', fg: '#ffffff', bg: '#f0822a', bg2: '#a04a0a', ic: 'circle' }, { t: 'REEF RIDERS', sub: 'SURF CLUB', fg: '#9ff6ff', bg: '#1a3a8a', bg2: '#0a1a50', ic: 'wave' },
        { t: 'MANGO MAX', sub: 'JUICE BAR', fg: '#ffffff', bg: '#ff9a1a', bg2: '#c45a00', ic: 'leaf' }, { t: 'ISLAND AIR', sub: 'FLY THE COAST', fg: '#ffffff', bg: '#3a6ae0', bg2: '#1a2a90', ic: 'diamond' },
        { t: 'BAIT & TACKLE', sub: 'FRESH CATCH', fg: '#ffe6c0', bg: '#6a3a22', bg2: '#3a1c0e', ic: 'ring' }, { t: 'SURF SHACK', sub: 'BOARDS', fg: '#ffffff', bg: '#e0388a', bg2: '#8a1050', ic: 'star' },
      ]);
      let n = 0;
      for (let d = 26; d < L - 30; d += 56) { const sd = (n & 1) ? -1 : 1, f = kit.frame(d), p = kit.at(d, sd * (edge + 3.4), 0); ads.board(p[0], p[1] - 0.6, p[2], Math.atan2(f.tx, f.tz) + (sd > 0 ? Math.PI / 2 : -Math.PI / 2), 6, 1.6, (n++) % 8, 0x7a4a26, 0.9); }
      ads.road(L - 62, 0, 9, 2.6, 0); ads.road(L - 118, 0, 9, 2.6, 1); ads.road(36, 0, 9, 2.6, 5);
      ads.finish();
      const gb = new kit.Batch(); gridBoxes(kit, gb); kit.mesh(gb, {}, true);
      const bc = [[0xff4f7a, 0xffe14a, 0x3da8ff, 0xffffff]];
      for (let d = 10; d < 130; d += 32) for (const sd of [-1, 1]) kit.bunting(kit.at(d, sd * (edge + 1), 6.0), kit.at(d + 32, sd * (edge + 1), 6.0), bc[0], 9, 0.9, 1.0);
    }
  }

  // ====================================================================================================
  // COURSE 4 — BOULDER PEAK  (jungle valley -> barrel cannon -> summit road with rolling boulders -> rope bridge)
  // ====================================================================================================
  const PEAK_HW = 12, PEAK_SH = 4;
  const PEAK = (function () {
    const corners = [[120, 0, 60], [215, 75, 60], [420, 75, 80], [410, 335, 100], [170, 342, 60], [55, 240, 30], [240, 238, 38], [225, 150, 38], [-20, 150, 50], [-35, 0, 60]];
    const base = polyPts(corners, { step: 40, startT: 0.3 });
    const S0 = sampler(base), L = S0.L;
    const dCan = S0.dOf(292, 75), canLen = 22, climb = 300, dTo = dCan + canLen + climb;
    const dSumEnd = dTo + 70;
    const H = 30;
    const dBr = S0.dOf(105, 150), brHalf = 38;
    const dBr0 = dBr - brHalf, dBr1 = dBr + brHalf;
    const yAt = (d) => {
      if (d < dCan + canLen) return 0;
      if (d < dTo) return H * ((d - dCan - canLen) / climb);
      if (d < dSumEnd) return H;
      const t = clamp((d - dSumEnd) / (L - dSumEnd), 0, 1);
      return H * (1 - sstep(0, 1, t));
    };
    const hwAt = (d) => {
      const k = 1 - sstep(0, 14, Math.max(0, Math.max(dBr0 + 12 - d, d - (dBr1 - 12))));
      return PEAK_HW - 5 * k;
    };
    const pts = base.map((p) => { const d = S0.dOf(p[0], p[1]); return [p[0], p[1], yAt(d), hwAt(d)]; });
    return { pts, S: sampler(pts), dCan, canLen, dTo, dSumEnd, dBr0, dBr1, L, H, yAt };
  })();

  (function boulderPeak() {
    const P = PEAK, L = P.L, S = P.S, dB = P.dBr0 + 12, dBe = P.dBr1 - 12;
    G.defineTrack({
      id: 'boulder_peak', name: 'Boulder Peak', cup: 'star', order: 4, laps: 3, music: 'mountain', seed: 5404,
      hw: PEAK_HW, shoulder: PEAK_SH, scale: 1, style: 'meadow', offroad: 'grass', walls: 'none',
      theme: {
        sky: [0x2a74d0, 0x8fc8ec, 0xf0f0c8], fog: [0xc8e0c4, 120, 580], ground: 0x2f7a35, shoulder: 0x6a8a3c,
        road: [0x7c6b52, 0x74644c], curb: [0xd9c9a0, 0x8a6a3c], hemi: [0xe4f3ff, 0x6a8a50, 0.95], sun: [0xfff0d0, 0.9],
        emb: 0x7a6040, bg: 0xc6e2dc,
      },
      pts: P.pts,
      pads: [
        { d: 36, len: 10, l: -5, w: 6 }, { d: 36, len: 10, l: 5, w: 6 },
        { d: P.dTo + 160, len: 10, l: 0, w: 9 }, { d: P.dTo + 380, len: 10, l: -5, w: 7 }, { d: P.dBr1 + 80, len: 10, l: 0, w: 8 },
      ],
      jumps: [],
      cannons: [{ d: P.dCan, len: P.canLen, l: 0, w: 2 * PEAK_HW, to: P.dTo, height: 42 }],
      zones: [
        // the climb is a hanging rope-and-plank causeway the karts fly over: stepping on it drops them back to the cannon
        { d: P.dCan + P.canLen + 1, len: P.dTo - P.dCan - P.canLen - 8, l: 0, w: 2 * (PEAK_HW + PEAK_SH), surface: 'void', offroad: true, color: 0x7a5a32 },
        // rope bridge: planks + open void on both sides
        { d: dB, len: dBe - dB, l: 0, w: 14, surface: 'road', color: 0x9a6b3a },
        { d: dB, len: dBe - dB, l: -(7 + 3.2), w: 6.4, surface: 'void', offroad: true, decal: false },
        { d: dB, len: dBe - dB, l: 7 + 3.2, w: 6.4, surface: 'void', offroad: true, decal: false },
      ],
      itemRows: [
        { d: P.dCan - 150, count: 5 }, { d: P.dCan - 80, count: 5, double: true },
        { d: P.dTo + 60, count: 5 }, { d: P.dTo + 250, count: 5 }, { d: P.dTo + 470, count: 5, double: true },
        { d: P.dBr1 + 60, count: 5 }, { d: L - 90, count: 5, double: true },
      ],
      decorate: peakDecor(P),
      hazards: peakHazards(P),
    });
  })();

  function peakDecor(P) {
    return function (track, kit) {
      const rng = kit.rng, col = kit.col, L = kit.length, HW = PEAK_HW, edge = PEAK_HW + PEAK_SH;
      const ds = kit.ds;
      const dClimb0 = P.dCan + P.canLen, dClimb1 = P.dTo;
      const dBr0 = P.dBr0, dBr1 = P.dBr1;
      const Mtn = (x, z) => 10 + 40 * Math.exp(-(Math.pow(x - 180, 2) + Math.pow(z - 255, 2)) / (2 * 170 * 170)) + 5 * Math.sin(x * 0.021) * Math.cos(z * 0.017);
      const brG = (d) => Math.max(
        1 - sstep(0, 6, Math.max(0, dBr0 + 10 - d, d - (dBr1 - 10))),
        1 - sstep(0, 12, Math.max(0, dClimb0 + 24 - d, d - (dClimb1 - 16))));
      const terr = makeTerrain(kit, {
        cell: 6, pad: 150, shoulder: PEAK_SH, under: 0.9,
        height: (x, z, i, dd, roadH) => {
          if (i < 0) return Mtn(x, z);
          const d = i * ds;
          let n = dd <= 10 ? roadH : lerp(roadH, Mtn(x, z), sstep(10, 55, dd));
          const g = brG(d);
          if (g > 0) n = lerp(n, lerp(0.15, n, sstep(24, 44, dd)), g);
          return n;
        },
        color: (x, z, h) => {
          const nz = 1 + (rng() - 0.5) * 0.12;
          if (h > 0 && h < 0.3) return kit.mul(col(0x2a2438), nz);              // ravine floor
          if (h < 6) return kit.mul(col(((Math.floor(x / 9) + Math.floor(z / 9)) & 1) ? 0x2f8236 : 0x287530), nz);
          if (h < 16) return kit.mul(col(((Math.floor(x / 7) + Math.floor(z / 7)) & 1) ? 0x4f7f34 : 0x5a8438), nz);
          if (h < 27) return kit.mul(col(Math.floor(h / 3) & 1 ? 0x8a6c48 : 0x7e6140), nz);
          return kit.mul(col(Math.floor(h / 3) & 1 ? 0x8f8070 : 0x7f7262), nz);
        },
      });
      kit.mesh(terr.mesh, {}, false);
      const th = terr.h;

      const b = new kit.Batch(), jt = new kit.Batch();   // jt: jungle foliage (wind-swayed)
      // ---- jungle trees, ferns, rocks
      const trunk = col(0x6a4a2a), gr = [col(0x2f8f3a), col(0x3fa645), col(0x24762f)], vine = col(0x2a6a2a);
      const jtree = (x, y, z, s, r) => {
        const lean = (r() - 0.5) * 1.2, h = (7 + r() * 4) * s;
        tube(jt, [x, y - 1, z], [x + lean, y + h, z], 0.9 * s, 0.55 * s, 6, trunk);
        const c = gr[(r() * 3) | 0];
        jt.blob(x + lean, y + h + 1.5 * s, z, 5.6 * s, 3.4 * s, 5.6 * s, c, 0);
        jt.blob(x + lean + 2.8 * s, y + h - 0.4 * s, z + 1.4 * s, 4 * s, 2.6 * s, 4 * s, gr[(r() * 3) | 0], 0);
        jt.blob(x + lean - 2.4 * s, y + h - 0.6 * s, z - 1.8 * s, 3.8 * s, 2.4 * s, 3.8 * s, gr[(r() * 3) | 0], 0);
        for (let k = 0; k < 2; k++) {
          const a = r() * TAU, vx = x + lean + Math.cos(a) * 3 * s, vz = z + Math.sin(a) * 3 * s;
          tube(jt, [vx, y + h - 0.6 * s, vz], [vx, y + h - (3 + r() * 3) * s, vz], 0.1 * s, 0.07 * s, 3, vine);
        }
      };
      kit.scatter(300, 2, 80, edge + 12, (x, z, i, r) => {
        const h = th(x, z);
        if (h > 17 || h < 0.5) return;
        jtree(x, h, z, 0.8 + r() * 0.8, r);
      });
      kit.scatter(160, 1, 60, edge + 8, (x, z, i, r) => {
        const h = th(x, z); if (h < 0.5) return;
        const s = 0.8 + r() * 1.4;
        for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU + r(); jt.tri([x, h + 0.2, z], [x + Math.cos(a) * 2.8 * s, h + 1.7 * s, z + Math.sin(a) * 2.8 * s], [x + Math.cos(a + 0.5) * 1.6 * s, h + 0.4 * s, z + Math.sin(a + 0.5) * 1.6 * s], gr[k % 3]); }
      });
      kit.scatter(150, 2, 90, edge + 8, (x, z, i, r) => {
        const h = th(x, z); if (h < 0.5) return;
        const s = 0.8 + r() * 2.6;
        b.blob(x, h + 0.2 * s, z, 1.7 * s, 1.1 * s, 1.5 * s, kit.mul(col(0x8a7c6c), 0.85 + r() * 0.3), 1);
      });
      // ---- volcano backdrop
      {
        const vx = 165, vz = 585, cols = [col(0x5a4a40), col(0x6a584a), col(0x4a3c34), col(0x7a6656)];
        let y = -2;
        const rr = [175, 140, 105, 72, 46, 26], hh = [34, 38, 44, 44, 36, 20];
        for (let k = 0; k < rr.length; k++) {
          b.frustum(vx, y, vz, rr[k], k + 1 < rr.length ? rr[k + 1] * 1.02 : 18, hh[k], 11, cols[k % 4], k * 0.3);
          y += hh[k] - 1;
        }
        // crater rim + glow
        const lb = new kit.Batch();
        lb.frustum(vx, y - 3, vz, 19, 15, 3.5, 11, col(0xff7a1a), 0.2);
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * TAU + 0.4, r0 = 20 + rng() * 4;
          const top = [vx + Math.cos(a) * r0, y - 2, vz + Math.sin(a) * r0], bot = [vx + Math.cos(a) * (r0 + 60 + rng() * 60), y - 150 + rng() * 40, vz + Math.sin(a) * (r0 + 60 + rng() * 60)];
          tube(lb, top, bot, 2.2, 3.4, 4, k & 1 ? col(0xff5a1a) : col(0xffa31a));
        }
        { const lm = kit.mesh(lb, {}, true); if (lm) kit.blinker(lm.material, 2.6, { mode: 'sine', lo: 0.7 }); }
        // smoke plume drifting off the crater + lava embers leaping out of it
        kit.particles({ x: vx, y: y + 2, z: vz, count: 44, vel: [6, 14, 2], spread: [3, 3, 3], jitter: [8, 1, 8], life: 11, size: 26, grow: 2.4, alpha: 0.5, pow: 0.9, wob: 6, color: [0x5a5560, 0x7a747c, 0x3a3640] });
        kit.particles({ x: vx, y: y - 2, z: vz, count: 26, vel: [0, 30, 0], spread: [10, 9, 10], jitter: [8, 0, 8], life: 3.2, grav: -14, size: 5.5, grow: -0.4, alpha: 1, pow: 0.7, color: [0xff7a1a, 0xffc040, 0xff4a10], additive: true });
        for (let k = 0; k < 9; k++) b.blob(vx + (rng() - 0.5) * 30 + k * 6, y + 14 + k * 11, vz + (rng() - 0.5) * 30, 14 + k * 1.6, 9 + k, 14 + k * 1.6, kit.mix(col(0x6a6a72), col(0xb8b8c0), k / 9), 0);
      }
      // far hills
      kit.farScatter(22, 120, (x, z, r) => { const s = 40 + r() * 50; b.blob(x, -4, z, s * 1.4, s * 0.55, s, kit.mix(col(0x3f8a3a), col(0x6aa04a), r()), 1); });

      // ---- rock walls along the road (not on the climb or bridge)
      const rock = [col(0x8a7c6c), col(0x7a6c5c), col(0x988a78)];
      const rockWall = (d0, d1) => {
        for (const sd of [-1, 1]) for (let d = d0, k = 0; d < d1 - 0.1; d += 3.2, k++) {
          const e = Math.min(d1, d + 3.2), f0 = kit.frame(d), f1 = kit.frame(e);
          const l0 = sd * (f0.halfWidth + PEAK_SH + 0.1), l1 = sd * (f1.halfWidth + PEAK_SH + 0.1), tk = sd * 1.1, hgt = 1.3 + ((k * 37) % 5) * 0.12, c = rock[k % 3];
          const A = kit.at(d, l0, 0), B = kit.at(e, l1, 0), A2 = kit.at(d, l0 + tk, 0), B2 = kit.at(e, l1 + tk, 0);
          const up = (p) => [p[0], p[1] + hgt, p[2]];
          b.quad(A, up(A), up(B), B, c); b.quad(up(A), up(A2), up(B2), up(B), kit.mul(c, 1.15)); b.quad(A2, B2, up(B2), up(A2), kit.mul(c, 0.9));
        }
      };
      rockWall(8, P.dCan - 6); rockWall(P.dCan + P.canLen + 6, P.dCan + P.canLen + 30);
      rockWall(P.dTo + 6, dBr0 + 6); rockWall(dBr1 - 6, L - 8);

      const torches = [];
      // ---- climb: rope causeway (posts, ropes, torches) — the kart flies over it
      {
        const rope = col(0xcdb27a);
        for (let d = dClimb0 + 8; d < dClimb1 - 4; d += 9) for (const sd of [-1, 1]) {
          const f = kit.frame(d), l = sd * (f.halfWidth + 1.2);
          const p = kit.at(d, l, 0), q = kit.at(d, l, 3.4);
          tube(b, p, q, 0.28, 0.22, 5, trunk);
          const n = kit.at(d + 9, l, 3.0);
          tube(b, q, n, 0.07, 0.07, 3, rope);
          if (((d / 9) | 0) % 3 === 0) { b.blob(q[0], q[1] + 0.6, q[2], 0.45, 0.6, 0.45, col(0xff9a1a), 0); torches.push([q[0], q[1] + 1.0, q[2]]); }
        }
      }
      // trestle legs holding the causeway up
      for (let d = dClimb0 + 30; d < dClimb1 - 18; d += 22) {
        const f = kit.frame(d);
        if (f.y < 4) continue;
        for (const sd of [-1, 1]) {
          const p = kit.at(d, sd * (HW - 1), -0.4), q = kit.at(d, sd * (HW - 1), -f.y - 1);
          tube(b, q, p, 0.7, 0.55, 6, trunk);
        }
        const a = kit.at(d, -(HW - 1), -f.y * 0.5), c = kit.at(d, HW - 1, -f.y * 0.5);
        tube(b, a, c, 0.28, 0.28, 4, col(0x7a5230));
        const a2 = kit.at(d, -(HW - 1), -0.5), c2 = kit.at(d, HW - 1, -f.y * 0.5);
        tube(b, a2, c2, 0.2, 0.2, 4, col(0x7a5230));
        const a3 = kit.at(d, HW - 1, -0.5), c3 = kit.at(d, -(HW - 1), -f.y * 0.5);
        tube(b, a3, c3, 0.2, 0.2, 4, col(0x7a5230));
      }
      // ---- landing plaza + summit gate
      {
        const f = kit.frame(P.dTo + 10), hy = Math.atan2(f.tx, f.tz), stone = col(0x9a8c7a), st2 = col(0x7e725f);
        for (const sd of [-1, 1]) {
          const p = kit.at(P.dTo + 10, sd * (edge + 3), 0);
          b.box(p[0], p[1] - 1, p[2], 4, 13, 4, hy, stone); b.box(p[0], p[1] + 11, p[2], 5, 1.6, 5, hy, st2);
          b.blob(p[0], p[1] + 13.5, p[2], 1.2, 1.8, 1.2, col(0xff7a1a), 0);
          torches.push([p[0], p[1] + 14.2, p[2]]);
        }
        const c = kit.at(P.dTo + 10, 0, 12.4);
        b.box(c[0], c[1], c[2], 2 * (edge + 3) + 5, 2.2, 3.4, hy, stone);
        for (let k = -3; k <= 3; k++) { const q = kit.at(P.dTo + 10, k * 4.4, 12.4); b.box(q[0], q[1] + 2.2, q[2], 1.6, 1.8, 3.6, hy, k & 1 ? col(0xd24a3a) : col(0xf0c030)); }
      }
      // ---- boulder cave arch where the boulders emerge
      {
        const dA = P.dTo + 85;
        tunnel(kit, b, { d0: dA - 6, d1: dA + 6, step: 3, na: 12, rx: edge + 1, h: 10, thick: 5, y0: -1, color: (k, j, inner) => (inner ? col(0x4a4036) : rock[(k + j) % 3]), rim: (j) => (j & 1 ? col(0xb0a08a) : col(0x8a7c6c)) });
      }
      // ---- start line totems + jungle gate
      for (const dd of [-18, 22]) for (const sd of [-1, 1]) {
        const d = (dd + L) % L, p = kit.at(d, sd * (edge + 4.5), 0), f = kit.frame(d), hy = Math.atan2(f.tx, f.tz);
        const cs = [col(0xd24a3a), col(0xf0c030), col(0x2f8fd0), col(0x2fa04a)];
        for (let k = 0; k < 4; k++) {
          b.box(p[0], p[1] + k * 2.6, p[2], 2.6, 2.6, 2.6, hy, kit.mul(cs[(k + (sd > 0 ? 1 : 0)) % 4], 0.9));
          b.box(p[0] - f.tx * 1.31, p[1] + k * 2.6 + 0.7, p[2] - f.tz * 1.31, 1.9, 0.5, 0.2, hy, [0.1, 0.1, 0.1]);
          b.box(p[0] - f.tx * 1.31, p[1] + k * 2.6 + 1.7, p[2] - f.tz * 1.31, 0.6, 0.6, 0.2, hy, [1, 1, 1]);
        }
        b.box(p[0], p[1] + 10.4, p[2], 3.6, 0.8, 3.6, hy, col(0x6a4a2a));
      }
      kit.mesh(b, {}, false);
      kit.foliage(jt, { strength: 0.4, heightScale: 0.14 });
      if (torches.length) kit.particles({ emitters: torches, count: 9, vel: [0, 1.8, 0], spread: [0.25, 0.5, 0.25], life: 0.8, size: 1.0, grow: -0.5, alpha: 0.95, color: [0xffa030, 0xffd060, 0xff6a20], additive: true });
      for (const sd of [-1, 1]) kit.crowdStand({ d0: L - 40, d1: L + 55, side: sd, l0: edge + 8, rows: 2, gap: 1.3, rise: 0, step: 2.6, scale: 1.1, radius: 50, dy: 0, colors: [0xd24a3a, 0xf0c030, 0x2f8fd0, 0x2fa04a, 0xffffff] });
      kit.birds({ cx: 180, cz: 200, y: 62, radius: 150, count: 6, speed: 0.1, body: 0xd8383d, wing: 0x2f9a3a });
      for (const dd of [-18, 22]) for (const sd of [-1, 1]) { const d = (dd + L) % L, p = kit.at(d, sd * (edge + 4.5), 10.8), f = kit.frame(d); kit.flag(p[0], p[1], p[2], 3.6, 2, Math.atan2(f.tx, f.tz) - Math.PI / 2, [[0xd24a3a, 0xf0c030], [0x2f8fd0, 0xffffff]][(sd + 1) / 2], { pole: 2.6 }); }

      // ---- giant barrel cannon
      {
        const cb = new kit.Batch(), d0 = P.dCan - 3, d1 = P.dCan + P.canLen + 3;
        const w1 = col(0xa8743a), w2 = col(0x92602c), band = col(0x4a4a52);
        tunnel(kit, cb, {
          d0, d1, step: 2.2, na: 14, rx: edge + 1.6, h: 6.5, thick: 1.0, y0: -1.5,
          hf: (d) => 6.5 + (d - d0) * 0.28,
          color: (k, j, inner) => (inner ? col(0x4a2e18) : (Math.floor(k / 3) % 3 === 0 ? band : (j & 1 ? w1 : w2))),
          rim: (j) => (j & 1 ? band : col(0x6a6a74)),
        });
        for (const dd of [d0 + 1, d1 - 1]) for (let k = -3; k <= 3; k++) { const p = kit.at(dd, k * 4.2, 0.1); cb.box(p[0], p[1] + 0.2, p[2], 0.9, 0.6, 0.9, 0, col(0xff9a1a)); }
        kit.mesh(cb, {}, false);
        // chevron arrow sign above the exit
        const f = kit.frame(d1 + 1), hy = Math.atan2(f.tx, f.tz), sb = new kit.Batch();
        for (const sd of [-1, 1]) { const p = kit.at(d1 + 6, sd * (edge + 3), 0); tube(sb, p, [p[0], p[1] + 7, p[2]], 0.3, 0.3, 5, trunk); sb.box(p[0], p[1] + 7, p[2], 0.3, 2.4, 2.4, hy, col(0xf0c030)); }
        kit.mesh(sb, {}, false);
      }
      // ---- rope bridge: planks edge, posts, ropes, towers, mist
      {
        const bb = new kit.Batch(), rope = col(0xcdb27a), wood = col(0x7a5230);
        const dA = dBr0 + 12, dB = dBr1 - 12;
        for (let d = dA; d <= dB + 0.1; d += 4) for (const sd of [-1, 1]) {
          const l = sd * 7.6, p = kit.at(d, l, 0), q = kit.at(d, l, 2.5);
          tube(bb, p, q, 0.2, 0.2, 5, wood);
          if (d + 4 <= dB + 0.1) {
            const n = kit.at(d + 4, l, 2.5), sag = 0.25;
            tube(bb, q, [(q[0] + n[0]) / 2, q[1] - sag, (q[2] + n[2]) / 2], 0.09, 0.09, 3, rope);
            tube(bb, [(q[0] + n[0]) / 2, q[1] - sag, (q[2] + n[2]) / 2], n, 0.09, 0.09, 3, rope);
            const q2 = kit.at(d, l, 1.0), n2 = kit.at(d + 4, l, 1.0);
            tube(bb, q2, n2, 0.07, 0.07, 3, rope);
          }
        }
        for (const [dd, sg] of [[dA, -1], [dB, 1]]) for (const sd of [-1, 1]) {
          const p = kit.at(dd + sg * 0.5, sd * 8.6, -1), q = kit.at(dd + sg * 0.5, sd * 8.6, 7.5);
          tube(bb, p, q, 0.55, 0.45, 6, wood);
          const r = kit.at(dd + sg * 0.5, sd * 8.6, 7.7); bb.blob(r[0], r[1], r[2], 0.9, 0.9, 0.9, col(0xd24a3a), 0);
        }
        // hanging plank undersides (reads as a sagging deck)
        for (let d = dA; d < dB; d += 3) { const a = kit.at(d, -6.6, -0.35), c = kit.at(d + 3, -6.6, -0.35), a2 = kit.at(d, 6.6, -0.35), c2 = kit.at(d + 3, 6.6, -0.35); bb.quad(a, c, c2, a2, ((d / 3) | 0) & 1 ? col(0x6a4426) : col(0x58381e)); }
        kit.mesh(bb, { wind: { strength: 0.2, heightScale: 0.5, groundY: P.H, speed: 1.1 } }, false);   // ropes & posts sway over the ravine
        const mf = kit.frame((dBr0 + dBr1) / 2);
        kit.particles({ x: mf.x, y: 6, z: mf.z, count: 28, vel: [1.4, 0.15, 0.6], spread: [0.4, 0.1, 0.4], jitter: [45, 2.5, 50], life: 16, size: 24, grow: 0.8, alpha: 0.22, pow: 0.8, fadeIn: 0.3, color: [0xffffff, 0xdfeaf4] });
        const mg = kit.trackGeom(new T.PlaneGeometry(110, 150)); mg.rotateX(-Math.PI / 2);
        const mm = new T.Mesh(mg, kit.trackMat(new T.MeshBasicMaterial({ color: 0xc8d6e0, transparent: true, opacity: 0.45, depthWrite: false })));
        mm.position.set(mf.x, 3.4, mf.z); kit.add(mm);
      }
      peakExtra(kit, P, th);
    };
  }

  // ---- Boulder Peak beauty pass: tiki totems, scaffolds, cannon frame, waterfalls, volcano glow, jungle detail
  function peakExtra(kit, P, th) {
    const rng = kit.rng, col = kit.col, L = kit.length, HW = PEAK_HW, edge = PEAK_HW + PEAK_SH;
    const dC0 = P.dCan + P.canLen, dC1 = P.dTo;
    const b = new kit.Batch(), jt = new kit.Batch(), glow = new kit.Batch(), tk = [], halo = [], wood = [col(0x8a5a30), col(0x6a4424), col(0xa4703c)], rope = col(0xcdb27a);
    const tcols = [[0xd24a3a, 0xf0c030, 0x2f8fd0, 0x2fa04a], [0x2f8fd0, 0xd24a3a, 0x2fa04a, 0xf0c030], [0xf0c030, 0x2fa04a, 0xd24a3a, 0x2f8fd0]];
    // ---- original tiki-style totems: stacked carved blocks with eyes, teeth, wings and feather crowns
    const totem = (x, y, z, ry, s, v) => {
      const cs = tcols[v % 3], segs = 3 + (v & 1), R = (lx, lz) => [x + rotX(lx * s, lz * s, ry), z + rotZ(lx * s, lz * s, ry)];
      for (let k = 0; k < segs; k++) {
        const yk = y + k * 2.4 * s;
        b.box(x, yk, z, 2.2 * s, 2.4 * s, 2.2 * s, ry, col(cs[(k + v) & 3]));
        b.box(x, yk + 2.3 * s, z, 2.5 * s, 0.22 * s, 2.5 * s, ry, col(0x3a2a1e));
        if ((k + v) & 1) {
          for (const sg of [-1, 1]) { const w = R(sg * 2.0, 0); b.box(w[0], yk + 0.6 * s, w[1], 1.7 * s, 0.42 * s, 0.5 * s, ry + sg * 0.25, col(cs[(k + 2) & 3])); b.box(w[0], yk + 1.2 * s, w[1], 1.4 * s, 0.34 * s, 0.4 * s, ry + sg * 0.4, col(cs[(k + 1) & 3])); }
        } else {
          for (const sg of [-1, 1]) {
            const e = R(sg * 0.55, 1.13), q = R(sg * 0.55, 1.2);
            b.box(e[0], yk + 1.3 * s, e[1], 0.62 * s, 0.5 * s, 0.14, ry, [1, 1, 1]); b.box(q[0], yk + 1.38 * s, q[1], 0.26 * s, 0.3 * s, 0.12, ry, [0.05, 0.05, 0.08]);
            const br = R(sg * 0.55, 1.15); b.box(br[0], yk + 1.85 * s, br[1], 0.8 * s, 0.14 * s, 0.14, ry + sg * 0.15, col(0x2a1a10));
          }
          const nz = R(0, 1.25); b.box(nz[0], yk + 0.75 * s, nz[1], 0.4 * s, 0.7 * s, 0.4 * s, ry, col(0xb04a2a));
          const mo = R(0, 1.16); b.box(mo[0], yk + 0.12 * s, mo[1], 1.3 * s, 0.4 * s, 0.14, ry, col(0xc02a2a));
          for (let t = -1; t <= 1; t++) { const tt = R(t * 0.4, 1.2); b.box(tt[0], yk + 0.3 * s, tt[1], 0.24 * s, 0.3 * s, 0.1, ry, [1, 1, 1]); }
        }
      }
      const yt = y + segs * 2.4 * s;
      for (let f = -2; f <= 2; f++) { const p = R(f * 0.45, 0); b.frustum(p[0], yt + 0.1, p[1], 0.32 * s, 0, (1.6 + (2 - Math.abs(f)) * 0.5) * s, 5, col(cs[(f + 6) & 3]), 0); }
    };
    // two big totems flanking the start, then pairs along the lowlands and the summit road
    const tpos = [[-6, 0], [14, 1], [60, 2], [150, 0], [P.dCan - 120, 1], [P.dCan - 60, 2], [dC1 + 40, 0], [dC1 + 160, 1], [dC1 + 330, 2], [dC1 + 470, 0], [P.dBr1 + 70, 1], [L - 130, 2]];
    tpos.forEach(([d0, v], i) => {
      const d = (d0 + L) % L, sd = i & 1 ? 1 : -1, f = kit.frame(d), p = kit.at(d, sd * (edge + 3.2 + (i % 3)), 0), ry = Math.atan2(f.tx, f.tz) + (sd > 0 ? Math.PI / 2 : -Math.PI / 2);
      totem(p[0], p[1] - 0.2, p[2], ry, (i < 4 ? 1.7 : 1.25) + (i % 3) * 0.15, v + i);
    });
    // ---- wooden scaffolds: tall support towers under the hanging causeway and viewing platforms
    const scaffold = (x, y, z, ry, w, h, lev) => {
      const R = (lx, lz) => [x + rotX(lx, lz, ry), z + rotZ(lx, lz, ry)], hw = w / 2;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const c = R(sx * hw, sz * hw); b.box(c[0], y - 0.5, c[1], 0.45, h + 0.5, 0.45, ry, wood[0]); }
      for (let l = 1; l <= lev; l++) {
        const yy = y + (h * l) / lev - 0.3;
        b.box(x, yy, z, w + 0.8, 0.28, w + 0.8, ry, wood[2]);
        for (const sg of [-1, 1]) { const c0 = R(-hw, sg * hw), c1 = R(hw, sg * hw); b.box((c0[0] + c1[0]) / 2, yy + 0.3, (c0[1] + c1[1]) / 2, w, 0.14, 0.14, ry, wood[1]); b.box((c0[0] + c1[0]) / 2, yy + 1.0, (c0[1] + c1[1]) / 2, w, 0.14, 0.14, ry, wood[1]); }
        if (l > 1 || lev === 1) {
          const y0 = y + (h * (l - 1)) / lev, ya = R(-hw, -hw), yb = R(hw, -hw), yc = R(hw, hw), yd = R(-hw, hw);
          tube(b, [ya[0], y0, ya[1]], [yb[0], yy, yb[1]], 0.1, 0.1, 4, wood[1]); tube(b, [yb[0], y0, yb[1]], [ya[0], yy, ya[1]], 0.1, 0.1, 4, wood[1]);
          tube(b, [yc[0], y0, yc[1]], [yd[0], yy, yd[1]], 0.1, 0.1, 4, wood[1]); tube(b, [yd[0], y0, yd[1]], [yc[0], yy, yc[1]], 0.1, 0.1, 4, wood[1]);
        }
      }
      const lad = R(hw + 0.45, 0);
      for (let r = 0; r < h; r += 0.7) b.box(lad[0], y + r, lad[1], 0.1, 0.1, 1.0, ry + Math.PI / 2, wood[1]);
      const tp = R(hw, hw); tk.push([tp[0], y + h + 1.8, tp[1]]); b.box(tp[0], y + h + 0.3, tp[1], 0.12, 1.5, 0.12, ry, wood[1]);
    };
    for (let d = dC0 + 36; d < dC1 - 20; d += 52) for (const sd of [-1, 1]) {
      const f = kit.frame(d), p = kit.at(d, sd * (edge + 1.8), 0), gy = th(p[0], p[2]), hgt = Math.max(5, f.y - gy - 0.6);
      scaffold(p[0], gy, p[2], Math.atan2(f.tx, f.tz), 3.2, hgt, Math.max(2, Math.round(hgt / 7)));
    }
    for (const [d, sd] of [[P.dCan - 100, 1], [P.dCan - 40, -1], [dC1 + 260, 1], [dC1 + 420, -1], [P.dBr1 + 40, 1]]) {
      const f = kit.frame(d), p = kit.at(d, sd * (edge + 7), 0), gy = th(p[0], p[2]);
      scaffold(p[0], gy, p[2], Math.atan2(f.tx, f.tz), 4, 8, 2);
    }
    // ---- giant cannon: spoked wheels, iron muzzle ring, fuse
    {
      const dW = P.dCan + 11, ir = col(0x4a4a52), rim = col(0x6a4424);
      for (const sd of [-1, 1]) {
        const cen = kit.at(dW, sd * (edge + 3.4), 6.6), pt = (a, r) => kit.at(dW + Math.cos(a) * r, sd * (edge + 3.4), 6.6 + Math.sin(a) * r);
        for (let k = 0; k < 18; k++) { const a0 = (k / 18) * TAU, a1 = ((k + 1) / 18) * TAU; tube(b, pt(a0, 6.4), pt(a1, 6.4), 0.55, 0.55, 5, k & 1 ? rim : wood[0]); }
        for (let k = 0; k < 8; k++) tube(b, cen, pt((k / 8) * TAU, 6.2), 0.32, 0.26, 4, wood[2]);
        tube(b, kit.at(dW, sd * (edge + 3.0), 6.6), kit.at(dW, sd * (edge + 4.4), 6.6), 1.1, 1.1, 8, ir, true);
      }
      const gp = kit.at(P.dCan - 4, edge + 4, 0.2); tk.push([gp[0], gp[1] + 0.8, gp[2]]);
      kit.particles({ x: gp[0], y: gp[1] + 0.6, z: gp[2], count: 14, vel: [0, 2.2, 0], spread: [0.8, 0.6, 0.8], life: 0.6, size: 0.6, grow: -0.4, alpha: 1, color: [0xffe060, 0xffffff, 0xff9030], tex: 'spark', additive: true });
      const mz = kit.at(dC0 + 3, 0, 8); halo.push([mz[0], mz[1], mz[2], 0xffb050]);
    }
    // ---- waterfalls pouring down the slopes (merged flowing ribbons) + plunge pools
    const falls = [[P.dTo + 120, 0], [P.dTo + 300, 0], [P.dBr1 + 110, 0], [P.dCan - 90, 0]];
    for (const [d, _s] of falls) {
      const f = kit.frame(d);
      let best = -1, bl = 0;
      for (const sd of [-1, 1]) { const q = kit.at(d, sd * 70, 0); const rise = th(q[0], q[2]) - f.y; if (rise > best) { best = rise; bl = sd; } }
      if (best < 8) continue;
      let l1 = edge + 10; while (l1 < 90 && th(kit.at(d, bl * l1, 0)[0], kit.at(d, bl * l1, 0)[2]) < f.y + 4) l1 += 3;
      let l2 = l1; while (l2 < 110 && th(kit.at(d, bl * l2, 0)[0], kit.at(d, bl * l2, 0)[2]) < f.y + 26) l2 += 3;
      const n = Math.max(3, Math.round((l2 - l1) / 4)), P3 = [], UV = [], I = [];
      for (let i = 0; i <= n; i++) {
        const l = lerp(l1, l2, i / n), c = kit.at(d, bl * l, 0), t = kit.frame(d), y = th(c[0], c[2]) + 0.7;
        for (const w of [-3.6, 3.6]) P3.push(c[0] + t.tx * w, y, c[2] + t.tz * w);
        UV.push(0, i / n, 1, i / n); if (i < n) { const q = i * 2; I.push(q, q + 1, q + 3, q, q + 3, q + 2); }
      }
      const g = kit.trackGeom(new T.BufferGeometry()); g.setAttribute('position', new T.Float32BufferAttribute(P3, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(UV, 2)); g.setIndex(I);
      const m = new T.Mesh(g, kit.flowMat('water', { speed: [0, 1.4], repeat: [1.5, 2.5], fallback: 0xbfeaff })); m.frustumCulled = false; kit.add(m);
      const pc = kit.at(d, bl * (l1 - 2), 0), py = th(pc[0], pc[2]);
      b.blob(pc[0], py + 0.2, pc[2], 6, 0.7, 6, col(0xcdf2ff), 1);
      for (let k = 0; k < 5; k++) b.blob(pc[0] + (rng() - 0.5) * 6, py + 0.8, pc[2] + (rng() - 0.5) * 6, 1.6, 1.4, 1.6, [1, 1, 1], 0);
      kit.particles({ x: pc[0], y: py + 1.2, z: pc[2], count: 22, vel: [0, 2.2, 0], spread: [2, 1, 2], jitter: [3, 0.4, 3], life: 2, size: 3.2, grow: 1.4, alpha: 0.35, pow: 1.1, color: [0xffffff, 0xdff6ff] });
    }
    // ---- rock spires and stratified cliffs on the slopes
    kit.scatter(30, 26, 110, edge + 8, (x, z, i, r) => {
      const h = th(x, z); if (h < 0.5) return;
      const s = 1.2 + r() * 1.8, c = [col(0x8a7c6c), col(0x6a5c4c), col(0xa08a68), col(0x7a6a58)];
      let y = h - 1; const segs = 2 + ((r() * 3) | 0);
      for (let k = 0; k < segs; k++) { const hh = (4 + r() * 5) * s, r0 = (5.2 - k * 1.2) * s; b.frustum(x + (r() - 0.5) * s, y, z + (r() - 0.5) * s, r0, r0 * 0.55, hh, 7, c[(k + (r() * 2 | 0)) & 3], r() * 3); y += hh - 0.4; }
      b.blob(x, y + 0.2, z, 2.4 * s, 1.0 * s, 2.4 * s, col(0x2f8a3a), 0);
    });
    // ---- extra jungle: banana plants, bamboo, flowering shrubs
    kit.scatter(110, 2, 60, edge + 6, (x, z, i, r) => {
      const h = th(x, z); if (h < 0.5 || h > 22) return;
      const s = 0.9 + r() * 0.8, gcol = [col(0x2f9a3a), col(0x46b04a), col(0x1f7a3a)];
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU + r(), c = Math.cos(a), sn = Math.sin(a), px = -sn * 0.7 * s, pz = c * 0.7 * s, k2 = gcol[k % 3];
        const tip = [x + c * 3.4 * s, h + 1.4 * s, z + sn * 3.4 * s], mid = [x + c * 1.7 * s, h + 2.5 * s, z + sn * 1.7 * s];
        jt.tri([x, h + 0.3, z], [mid[0] + px, mid[1], mid[2] + pz], [mid[0] - px, mid[1], mid[2] - pz], k2); jt.tri([mid[0] + px, mid[1], mid[2] + pz], tip, [mid[0] - px, mid[1], mid[2] - pz], k2);
      }
      if (r() < 0.45) { const fc = [col(0xff4f7a), col(0xffd23a), col(0xff8a3d)][(r() * 3) | 0]; for (let k = 0; k < 3; k++) jt.blob(x + (r() - 0.5) * 2, h + 0.9 + r() * 0.4, z + (r() - 0.5) * 2, 0.4, 0.3, 0.4, fc, 0); }
    });
    kit.scatter(34, 2, 50, edge + 8, (x, z, i, r) => {
      const h = th(x, z); if (h < 0.5 || h > 20) return;
      for (let k = 0; k < 5; k++) { const bx = x + (r() - 0.5) * 2.4, bz = z + (r() - 0.5) * 2.4, hh = 8 + r() * 5; tube(jt, [bx, h - 0.3, bz], [bx + (r() - 0.5) * 0.8, h + hh, bz], 0.16, 0.1, 4, kit.mix(col(0x8ac04a), col(0xc4d86a), r())); }
    });
    // ---- adverts + road paint
    {
      const ads = Ads(kit, [
        { t: 'BOULDER BRAND', sub: 'ROCK SOLID ENERGY', fg: '#ffe14a', bg: '#8a4a22', bg2: '#4a2410', ic: 'diamond' }, { t: 'TIKI TREATS', sub: 'JUNGLE SNACKS', fg: '#ffffff', bg: '#2fa04a', bg2: '#145a22', ic: 'leaf' },
        { t: 'CANNON CO.', sub: 'LAUNCH DAY EVERY DAY', fg: '#ffffff', bg: '#3a3a46', bg2: '#16161c', ic: 'ring' }, { t: 'PEAK CLIMBERS', sub: 'ROPES & GEAR', fg: '#ffffff', bg: '#d24a3a', bg2: '#7a1a14', ic: 'star' },
        { t: 'LAVA LAMPS', sub: 'GLOW AT HOME', fg: '#ffe14a', bg: '#e8581a', bg2: '#8a2a00', ic: 'flame' }, { t: 'MONKEY MIX', sub: 'TROPICAL TRAIL MIX', fg: '#ffffff', bg: '#2f8fd0', bg2: '#12508a', ic: 'circle' },
      ]);
      let n = 0;
      for (const d of [30, 90, 150, P.dCan - 150, P.dCan - 100, P.dTo + 30, P.dTo + 240, P.dBr1 + 150, L - 80, L - 30]) {
        const sd = (n & 1) ? -1 : 1, f = kit.frame(d), p = kit.at(d, sd * (edge + 2.2), 0);
        ads.board(p[0], p[1] - 0.2, p[2], Math.atan2(f.tx, f.tz) + (sd > 0 ? Math.PI / 2 : -Math.PI / 2), 6, 1.6, (n++) % 6, 0x6a4424, 0.9);
      }
      ads.road(L - 60, 0, 10, 2.8, 0); ads.road(P.dCan - 60, 0, 10, 2.8, 2);
      ads.finish();
      const gb = new kit.Batch(); gridBoxes(kit, gb); kit.mesh(gb, {}, true);
    }
    // ---- volcano glow, torch light
    halo.push([165, 206, 585, 0xff7a2a]);
    kit.mesh(b, {}, false); kit.foliage(jt, { strength: 0.4, heightScale: 0.14 });
    if (tk.length) {
      kit.particles({ emitters: tk, count: 8, vel: [0, 1.8, 0], spread: [0.25, 0.5, 0.25], life: 0.8, size: 1.0, grow: -0.5, alpha: 0.95, color: [0xffa030, 0xffd060, 0xff6a20], additive: true });
      halos(kit, tk.map((q) => [q[0], q[1], q[2], 0xff9a40]), { size: 6, alpha: 0.55 });
    }
    halos(kit, halo.slice(-1), { size: 170, alpha: 0.5, fog: false });
    halos(kit, halo.slice(0, -1), { size: 20, alpha: 0.5 });
  }

  // rolling boulders: one instanced mesh, no per-frame allocation
  function peakHazards(P) {
    return function (track, kit) {
      const col = kit.col, list = [], HW = PEAK_HW;
      const bg = new kit.Batch();
      bg.blob(0, 0, 0, 1, 1, 1, col(0x8a7a68), 1);
      bg.blob(0.55, 0.35, 0.3, 0.55, 0.5, 0.55, col(0x6a5c4c), 0);
      bg.blob(-0.5, -0.1, 0.55, 0.5, 0.5, 0.5, col(0x9a8a76), 0);
      bg.blob(0.1, 0.55, -0.6, 0.5, 0.45, 0.5, col(0x7a6a58), 0);
      bg.blob(-0.4, -0.5, -0.4, 0.5, 0.5, 0.5, col(0x5e5242), 0);
      const geo = kit.trackGeom(bg.build()), mat = kit.trackMat(new T.MeshLambertMaterial({ vertexColors: true }));
      const lanes = [-6, 4, -2, 7, -7.5, 1, 6, -4];
      const nLane = lanes.length, nCross = 4, total = nLane + nCross;
      const mesh = new T.InstancedMesh(geo, mat, total);
      mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); kit.add(mesh);
      const dummy = new T.Object3D(); dummy.rotation.order = 'YXZ';
      const R = 3.1;
      const put = (i, x, y, z, ry, spin, sc) => {
        dummy.position.set(x, y, z); dummy.rotation.set(spin, ry, 0); dummy.scale.set(sc * R, sc * R, sc * R);
        dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
      };
      const launchPose = (i) => function (L) {
        dummy.position.set(L.x, L.y + R * 0.5, L.z); dummy.rotation.set(L.rx, L.ry, L.rz);
        const k = Math.max(0.001, L.s) * R; dummy.scale.set(k, k, k);
        dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); mesh.instanceMatrix.needsUpdate = true;
      };
      const popScale = (i) => function (k) {
        put(i, this.x, this.y + R, this.z, Math.atan2(this.vx, this.vz), 0, k); mesh.instanceMatrix.needsUpdate = true;
      };
      const dA = P.dTo + 90, dZ = P.dBr0 - 25, f = { x: 0, y: 0, z: 0, tx: 0, tz: 1, rx: -1, rz: 0, halfWidth: 12 };
      for (let i = 0; i < nLane; i++) {
        const v = 13 + (i % 4) * 2.2, travel = (dZ - dA) / v, T0 = travel + 2.5 + (i % 3) * 1.3, off = (i / nLane) * T0, lat0 = lanes[i];
        const hz = { x: 0, y: 0, z: 0, radius: R, hitKind: 'flip', vx: 0, vz: 0, active: true };
        hz.update = function (dt, time) {
          const tt = (time + off) % T0;
          if (tt > travel) { this.active = false; put(i, 0, -50, 0, 0, 0, 0.001); return; }
          const d = dA + v * tt;
          track._frame(d, f);
          const l = lat0 + Math.sin(tt * 0.9 + i) * 2.2;
          this.active = true;
          this.x = f.x + f.rx * l; this.z = f.z + f.rz * l; this.y = f.y;
          this.vx = f.tx * v; this.vz = f.tz * v;
          const sc = Math.min(1, tt * 1.2);
          put(i, this.x, f.y + R * sc, this.z, Math.atan2(f.tx, f.tz), -(v * tt) / R, sc);
          if (i === nLane - 1) mesh.instanceMatrix.needsUpdate = true;
        };
        hz.launchPose = launchPose(i); hz.popScale = popScale(i);
        hz.update(0, 0); list.push(hz);
      }
      const crossD = [P.dTo + 190, P.dTo + 330, P.dTo + 520, P.dBr0 - 110];
      for (let j = 0; j < nCross; j++) {
        const i = nLane + j, sd = j & 1 ? 1 : -1, fr = kit.frame(crossD[j]), v = 11.5, span = 2 * (fr.halfWidth + 9);
        const travel = span / v, T0 = travel + 3.2 + j * 0.9, off = j * 2.1;
        const hz = { x: 0, y: 0, z: 0, radius: R, hitKind: 'flip', vx: 0, vz: 0, active: true };
        hz.update = function (dt, time) {
          const tt = (time + off) % T0;
          if (tt > travel) { this.active = false; put(i, 0, -50, 0, 0, 0, 0.001); if (i === total - 1) mesh.instanceMatrix.needsUpdate = true; return; }
          const l = sd * (fr.halfWidth + 9) - sd * v * tt;
          this.active = true;
          this.x = fr.x + fr.rx * l; this.z = fr.z + fr.rz * l; this.y = fr.y;
          this.vx = -sd * v * fr.rx; this.vz = -sd * v * fr.rz;
          put(i, this.x, fr.y + R, this.z, Math.atan2(this.vx, this.vz), (v * tt) / R, 1);
          if (i === total - 1) mesh.instanceMatrix.needsUpdate = true;
        };
        hz.launchPose = launchPose(i); hz.popScale = popScale(i);
        hz.update(0, 0); list.push(hz);
      }
      return list;
    };
  }

  // @@END
})();
