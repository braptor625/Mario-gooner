// Mushroom Cup: Sunshine Circuit, Coral Coast, Tiny Tot Park, Dustbowl Desert.
// Layouts/themes follow the Double Dash!! originals; names, creatures and art are original.
(function () {
  'use strict';
  const G = (window.G = window.G || {});
  if (!G.defineTrack) return;

  // ------------------------------------------------------------------ shared helpers
  const TAU = Math.PI * 2;
  const hasDOM = () => {
    try { return typeof document !== 'undefined' && !!document.createElement('canvas').getContext('2d'); } catch (e) { return false; }
  };
  const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

  // box aligned with the road at distance d, lateral l (center), dy above road, sizes: sx across, sy up, sz along
  function rbox(b, kit, d, l, dy, sx, sy, sz, c) {
    const f = kit.frame(d), p = kit.at(d, l, dy);
    b.box(p[0], p[1], p[2], sx, sy, sz, Math.atan2(f.tx, f.tz), c);
  }
  // thin square beam between two 3D points (used for rails, wheel spokes, rims)
  function beam(b, a, c, w, k) {
    let dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2];
    const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    let ux = 0, uy = 1, uz = 0;
    if (Math.abs(dy) > 0.95) { ux = 1; uy = 0; }
    let n1x = dy * uz - dz * uy, n1y = dz * ux - dx * uz, n1z = dx * uy - dy * ux;
    let nl = Math.hypot(n1x, n1y, n1z) || 1; n1x /= nl; n1y /= nl; n1z /= nl;
    let n2x = dy * n1z - dz * n1y, n2y = dz * n1x - dx * n1z, n2z = dx * n1y - dy * n1x;
    nl = Math.hypot(n2x, n2y, n2z) || 1; n2x /= nl; n2y /= nl; n2z /= nl;
    const corner = (p, s1, s2) => [p[0] + (n1x * s1 + n2x * s2) * w, p[1] + (n1y * s1 + n2y * s2) * w, p[2] + (n1z * s1 + n2z * s2) * w];
    const A = [corner(a, -1, -1), corner(a, 1, -1), corner(a, 1, 1), corner(a, -1, 1)];
    const C = [corner(c, -1, -1), corner(c, 1, -1), corner(c, 1, 1), corner(c, -1, 1)];
    for (let i = 0; i < 4; i++) { const j = (i + 1) & 3; b.quad(A[i], A[j], C[j], C[i], k); }
  }
  function palm(b, kit, x, y, z, s, r) {
    const col = kit.col, lean = (r() - 0.5) * 2.2, a = r() * TAU;
    const t1 = col(0x9b7142), t2 = col(0x7d5731);
    let cx = x, cz = z, cy = y;
    const segs = 4, lx = Math.cos(a) * lean * s / segs, lz = Math.sin(a) * lean * s / segs;
    for (let k = 0; k < segs; k++) {
      b.frustum(cx, cy, cz, 0.42 * s * (1 - k * 0.12), 0.42 * s * (1 - (k + 1) * 0.12), 1.9 * s, 6, k & 1 ? t2 : t1, 0);
      cx += lx; cz += lz; cy += 1.9 * s;
    }
    const g1 = col(0x2f9a45), g2 = col(0x46b957), a2 = r() * TAU;
    for (let i = 0; i < 7; i++) {
      const an = a2 + (i / 7) * TAU, dx = Math.cos(an), dz = Math.sin(an), wx = -dz * 0.75 * s, wz = dx * 0.75 * s;
      const mid = [cx + dx * 2.4 * s, cy + 0.9 * s, cz + dz * 2.4 * s], tip = [cx + dx * 4.7 * s, cy - 0.8 * s, cz + dz * 4.7 * s];
      b.quad([cx, cy + 0.3 * s, cz], [mid[0] + wx, mid[1], mid[2] + wz], tip, [mid[0] - wx, mid[1], mid[2] - wz], i & 1 ? g1 : g2);
    }
    b.blob(cx, cy - 0.15 * s, cz, 0.5 * s, 0.5 * s, 0.5 * s, col(0x6b4a22), 0);
  }
  function roundTree(b, kit, x, y, z, s, r, c1, c2) {
    const col = kit.col;
    b.box(x, y, z, 0.6 * s, 2.4 * s, 0.6 * s, r() * 3, col(0x7a4f2a));
    b.blob(x, y + 3.7 * s, z, 2.6 * s, 2.3 * s, 2.6 * s, kit.mul(col(c1 || 0x45b24a), 0.88 + r() * 0.24), 0);
    b.blob(x + 1.1 * s, y + 3.1 * s, z + 0.5 * s, 1.6 * s, 1.5 * s, 1.6 * s, kit.mul(col(c2 || 0x58c25a), 0.88 + r() * 0.24), 0);
  }
  function house(b, kit, x, y, z, sx, sz, ry, wall, roof, h) {
    h = h || 4.2;
    b.box(x, y, z, sx, h, sz, ry, kit.col(wall));
    const r0 = Math.max(sx, sz) * 0.78;
    b.frustum(x, y + h, z, r0, 0, 2.6, 4, kit.col(roof), ry + Math.PI / 4);
    const c = Math.cos(ry), s = Math.sin(ry), dark = kit.col(0x2b3a4a);
    for (let k = -1; k <= 1; k += 2) {
      const lx = k * sx * 0.25, lz = sz * 0.5 + 0.05;
      b.box(x + lx * c + lz * s, y + 1.3, z - lx * s + lz * c, 0.9, 1.2, 0.2, ry, dark);
    }
  }
  // instanced colourful crowd blobs
  function makeCrowd(kit, spots, size) {
    const n = spots.length;
    if (!n) return null;
    const geo = kit.trackGeom(new THREE.IcosahedronGeometry(size, 0));
    const mat = kit.mat({ vertexColors: false });
    const im = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4(), c = new THREE.Color(), sc = new THREE.Vector3(1, 1.25, 1), q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      const s = spots[i];
      m.compose(new THREE.Vector3(s[0], s[1], s[2]), q, sc);
      im.setMatrixAt(i, m);
      c.setHSL(s[3], 0.75, 0.55); im.setColorAt(i, c);
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.frustumCulled = false;
    kit.add(im);
    return im;
  }
  // allocation-free road frame lookup into o ({x,y,z,rx,rz,tx,tz}) from centerline samples
  function frameInto(kit, d, o) {
    const N = kit.N; let i = Math.floor(d / kit.ds) % N; if (i < 0) i += N;
    const j = (i + 1) % N, k = (i + N - 1) % N;
    let tx = kit.px[j] - kit.px[k], tz = kit.pz[j] - kit.pz[k];
    const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    o.x = kit.px[i]; o.y = kit.py[i]; o.z = kit.pz[i]; o.tx = tx; o.tz = tz; o.rx = -tz; o.rz = tx; o.hw = kit.hw[i];
    return o;
  }
  function bounds(kit) {
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (let i = 0; i < kit.N; i += 4) {
      minX = Math.min(minX, kit.px[i]); maxX = Math.max(maxX, kit.px[i]);
      minZ = Math.min(minZ, kit.pz[i]); maxZ = Math.max(maxZ, kit.pz[i]);
    }
    return { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
  }
  // ribbon mesh over the road: d0..d1, lateral l0..l1, dy above road (single transparent mesh)
  function roadRibbon(kit, d0, d1, l0, l1, dy, matOpts, step) {
    step = step || 3;
    const n = Math.max(2, Math.ceil((d1 - d0) / step)), pos = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const d = d0 + ((d1 - d0) * i) / n;
      const a = kit.at(d, l0, dy), c = kit.at(d, l1, dy);
      pos.push(a[0], a[1], a[2], c[0], c[1], c[2]);
      if (i < n) { const q = i * 2; idx.push(q, q + 1, q + 3, q, q + 3, q + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    kit.trackGeom(g);
    const mat = kit.trackMat(new THREE.MeshPhongMaterial(Object.assign({ side: THREE.DoubleSide, transparent: true, shininess: 80 }, matOpts)));
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    kit.add(mesh);
    return mesh;
  }
  function discMesh(kit, x, y, z, r, matOpts, seg) {
    const g = new THREE.CircleGeometry(r, seg || 36); g.rotateX(-Math.PI / 2); kit.trackGeom(g);
    const mat = kit.trackMat(new THREE.MeshPhongMaterial(Object.assign({ transparent: true, shininess: 90 }, matOpts)));
    const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); kit.add(m); return m;
  }

  // ================================================================== 1. SUNSHINE CIRCUIT
  G.defineTrack({
    id: 'sunshine_circuit', name: 'Sunshine Circuit', cup: 'mushroom', order: 1, laps: 3, music: 'circuit',
    seed: 101, hw: 12, shoulder: 5, scale: 1, style: 'meadow',
    theme: {
      sky: [0x2f86e6, 0xbfe6ff, 0x9ad46c], fog: [0xcfe9ff, 170, 650], ground: 0x6cc24a, shoulder: 0x58b03c,
      road: [0x5a5e6c, 0x535766], curb: [0xe83a3a, 0xffffff], hemi: [0xd6ecff, 0x6fa850, 0.95], sun: [0xfff4dc, 0.9],
      emb: 0x58b03c, bg: 0xcfe9ff,
    },
    walls: 'barrier', wallColors: [0xffffff, 0xe83a3a],
    pts: [[0, 0, 0, 13], [110, 0], [220, 0], [320, 0], [390, 18], [430, 70], [425, 130], [385, 175], [320, 190],
      [230, 185], [130, 175], [30, 170], [-55, 168], [-100, 158], [-130, 130], [-132, 95], [-108, 66], [-68, 48], [-32, 20]],
    pads: [{ d: 60, len: 12, l: -5, w: 6 }, { d: 60, len: 12, l: 5, w: 6 }, { d: 700, len: 12, l: 0, w: 8 }],
    itemRows: [{ d: 160, count: 5 }, { d: 480, count: 5 }, { d: 620, count: 5 }, { d: 880, count: 5 }, { d: 1180, count: 5 }],
    decorate(track, kit) {
      const L = kit.length, b = new kit.Batch(), col = kit.col, rng = kit.rng, gy = kit.groundY, bb = bounds(kit);
      const hwS = 12 + 5;
      const state = (track._sc = {});

      // ---- grandstands (left of the main straight) with instanced crowd
      const crowd = [];
      const stand = (d0, d1, side, base, tiers) => {
        const c1 = col(0xe8e2d2), c2 = col(0xcfc7b4);
        for (let d = d0; d < d1; d += 8) {
          for (let k = 0; k < tiers; k++) rbox(b, kit, d + 4, side * (base + k * 2.6 + 1.3), 0, 2.6, (k + 1) * 1.3, 8.2, k & 1 ? c1 : c2);
        }
        const roofY = tiers * 1.3 + 4.2, roofW = tiers * 2.6 + 3, roofL = col(0xe83a3a), roofL2 = col(0xffffff);
        for (let d = d0; d < d1; d += 8) rbox(b, kit, d + 4, side * (base + roofW / 2 - 0.5), roofY, roofW, 0.6, 8.2, ((d / 8) | 0) & 1 ? roofL : roofL2);
        for (let d = d0; d <= d1; d += 16) {
          rbox(b, kit, d, side * (base + roofW - 1.2), 0, 0.6, roofY, 0.6, col(0x8a8f99));
          rbox(b, kit, d, side * (base + 0.6), tiers * 1.3, 0.5, 4.2, 0.5, col(0x8a8f99));
        }
        for (let d = d0 + 0.7; d < d1; d += 1.5) for (let k = 0; k < tiers; k++) {
          if (rng() < 0.12) continue;
          const p = kit.at(d, side * (base + k * 2.6 + 1.6), (k + 1) * 1.3 + 0.6);
          crowd.push([p[0], p[1], p[2], rng()]);
        }
      };
      stand(24, 250, -1, hwS + 5, 6);
      stand(150, 290, 1, hwS + 7, 4);
      kit.reserve(kit.at(140, -1, 0)[0], kit.at(140, -1, 0)[2], 10);
      makeCrowd(kit, crowd, 0.46);

      // ---- big video screen board in the infield facing the straight
      {
        const d = 175, l = hwS + 34, f = kit.frame(d), h = Math.atan2(f.tx, f.tz);
        for (let s = -1; s <= 1; s += 2) rbox(b, kit, d + s * 17, l, 0, 1.6, 16, 1.6, col(0x59606e));
        rbox(b, kit, d, l, 12, 1.2, 15.6, 40, col(0x20242c));
        const p = kit.at(d, l - 0.8, 19.8), pg = kit.trackGeom(new THREE.PlaneGeometry(37, 12.6));
        let pm;
        if (hasDOM()) {
          const tex = kit.makeCanvasTexture(512, 170, (ctx, w, hh) => {
            const g = ctx.createLinearGradient(0, 0, w, hh); g.addColorStop(0, '#ff7a1a'); g.addColorStop(1, '#ffd23a');
            ctx.fillStyle = g; ctx.fillRect(0, 0, w, hh);
            ctx.fillStyle = '#fff'; ctx.font = 'bold 70px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('SUNSHINE', w / 2, hh * 0.36); ctx.fillText('CIRCUIT', w / 2, hh * 0.76);
          });
          pm = kit.trackMat(new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
        } else pm = kit.trackMat(new THREE.MeshBasicMaterial({ color: 0xffb02a, side: THREE.DoubleSide }));
        const scr = new THREE.Mesh(pg, pm); scr.position.set(p[0], p[1], p[2]); scr.rotation.y = h + Math.PI / 2; kit.add(scr);
        kit.reserve(p[0], p[2], 22);
      }

      // ---- giant mascot statue ("Sunny Cub") in the infield
      {
        const d = 70, f = kit.frame(d), o = kit.at(d, hwS + 62, 0), rx = f.rx, rz = f.rz;
        const P = (a, u, c) => [o[0] + f.tx * a - rx * c, o[1] + u, o[2] + f.tz * a - rz * c];
        const sb = (a, u, c, sx, sy, sz, k, dt) => { const p = P(a, u, c); b.blob(p[0], p[1], p[2], sx, sy, sz, k, dt || 1); };
        const yel = col(0xffc828), org = col(0xff8a1a), wh = col(0xffffff), blk = col(0x2a1a10), red = col(0xe83a3a);
        const ped = P(0, 0, 0);
        b.frustum(ped[0], o[1], ped[2], 17, 14, 4, 12, col(0xd8d2c4), 0);
        b.frustum(ped[0], o[1] + 4, ped[2], 14, 13, 1.2, 12, red, 0);
        sb(0, 15, 0, 8.5, 9.5, 7.5, yel, 2);             // body
        sb(0, 12, 3.8, 5.5, 5.6, 3, col(0xfff0b0), 1);   // belly
        sb(-8.5, 15.5, 0, 2.6, 6.2, 2.6, yel, 1);        // arms
        sb(8.5, 21.5, 0, 2.6, 6, 2.6, yel, 1);           // waving arm
        sb(8.6, 28, 0, 3.3, 3.3, 3.3, org, 1);
        sb(-4, 3.5, 1.5, 3.2, 3.4, 5, org, 1); sb(4, 3.5, 1.5, 3.2, 3.4, 5, org, 1); // feet
        sb(0, 29, 0, 7.5, 7.2, 7, yel, 2);               // head
        sb(-5.7, 35, 0, 2.8, 2.8, 2.2, yel, 1); sb(5.7, 35, 0, 2.8, 2.8, 2.2, yel, 1); // ears
        sb(-5.7, 35, 1.2, 1.6, 1.6, 1, org, 1); sb(5.7, 35, 1.2, 1.6, 1.6, 1, org, 1);
        sb(0, 27.2, 5.6, 3.6, 2.6, 2.6, col(0xfff0b0), 1); // muzzle
        sb(0, 28.4, 7.6, 1.0, 0.8, 0.8, blk, 0);           // nose
        sb(-2.7, 31, 6.2, 1.2, 1.5, 0.9, wh, 1); sb(2.7, 31, 6.2, 1.2, 1.5, 0.9, wh, 1);
        sb(-2.7, 31, 6.9, 0.6, 0.8, 0.5, blk, 0); sb(2.7, 31, 6.9, 0.6, 0.8, 0.5, blk, 0);
        for (let k = -3; k <= 3; k++) { const p = P(k * 0.7, 26.2 - Math.abs(k) * -0.18 - 0.9 + 1.1, 7.2); b.box(p[0], p[1], p[2], 0.5, 0.4, 0.5, 0, red); }
        // sun-ray halo behind the head
        for (let k = 0; k < 12; k++) {
          const an = (k / 12) * TAU, c = Math.cos(an), s = Math.sin(an), w = 0.16;
          const a0 = P(c * 9, 29 + s * 9, -3), a1 = P(Math.cos(an + w) * 9, 29 + Math.sin(an + w) * 9, -3), tip = P(c * 14.5, 29 + s * 14.5, -3);
          b.tri(a0, a1, tip, org);
        }
        kit.reserve(ped[0], ped[2], 30);
      }

      // ---- tunnel on the back straight
      {
        const t0 = L * 0.575, t1 = t0 + 66, w = 12 + 5 + 1.8, rock = col(0xb9b3a6), dark = col(0x2c2f38);
        for (let d = t0; d < t1; d += 6) {
          for (let s = -1; s <= 1; s += 2) rbox(b, kit, d + 3, s * w, 0, 3.6, 10.5, 6.2, rock);
          rbox(b, kit, d + 3, 0, 10.5, 2 * w + 3.6, 2.4, 6.2, ((d / 6) | 0) & 1 ? col(0xcfc9bc) : rock);
          rbox(b, kit, d + 3, 0, 10.4, 2 * w - 3.6, 0.15, 6.2, dark);
        }
        for (let s = -1; s <= 1; s += 2) { const p = kit.at(t0, s * w, 0); b.box(p[0], p[1], p[2], 4.8, 13.4, 4.8, Math.atan2(kit.frame(t0).tx, kit.frame(t0).tz), col(0xe83a3a)); }
        for (let k = 0; k < 4; k++) {
          const p = kit.at(t0 + 10 + k * 16, 0, 0);
          b.blob(p[0], p[1] + 14.6, p[2], 13, 3.6, 13, kit.mul(col(0x58b03c), 0.9 + k * 0.04), 1);
        }
        state.tunnel = [t0, t1];
      }

      // ---- footbridge / overpass near the end of the lap
      {
        const d = L * 0.68, w = 12 + 5 + 4, c1 = col(0xffffff), c2 = col(0xe83a3a), f = kit.frame(d), h = Math.atan2(f.tx, f.tz);
        rbox(b, kit, d, 0, 8, 2 * w + 8, 1.6, 8, c1);
        rbox(b, kit, d, 0, 9.6, 2 * w + 8, 0.9, 0.5, c2);
        for (let s = -1; s <= 1; s += 2) {
          rbox(b, kit, d, s * w, 0, 2.2, 8, 7, c2);
          rbox(b, kit, d, s * (w + 5), 0, 2.2, 4, 7, c2);
          for (let k = -3; k <= 3; k++) rbox(b, kit, d + k * 1.1, s * (w + 2), 9.6, 0.3, 1.4, 0.3, c1);
        }
        void h;
      }

      // ---- blimp
      {
        const bl = new kit.Batch(), bc = col(0xffd23a), bs = col(0xe83a3a);
        bl.blob(0, 0, 0, 15, 5.4, 5.4, bc, 2);
        for (let k = -2; k <= 2; k++) bl.blob(k * 4.4, 0.3, 0, 1.2, 5.45, 5.45, bs, 1);
        bl.blob(-14, 0, 0, 4, 2.2, 1, bs, 0); bl.blob(-14, 0, 0, 4, 1, 2.2, bs, 0);
        bl.box(-3, -7, -1.4, 7, 1.8, 2.8, 0, col(0xf2f2f2));
        bl.box(-3, -5.8, -0.2, 0.3, 0.6, 0.3, 0, col(0x555555));
        const m = kit.mesh(bl); m.frustumCulled = false;
        state.blimp = m; state.bb = bb;
      }

      // ---- scenery: hills, trees, flowers
      const m0 = 12 + 5 + 10 + 4;
      kit.scatter(220, 2, 70, m0, (x, z, i, r) => {
        const s = 0.8 + r() * 0.9;
        if (r() < 0.3) { b.box(x, gy, z, 0.5 * s, 2 * s, 0.5 * s, r() * 3, col(0x7a4f2a)); for (let k = 0; k < 3; k++) b.frustum(x, gy + (1.6 + k * 1.7) * s, z, (2.5 - k * 0.7) * s, 0, 2.6 * s, 7, kit.mul(col(0x2f8f46), 0.9 + r() * 0.2), r()); }
        else roundTree(b, kit, x, gy, z, s, r);
      });
      kit.scatter(110, 1, 40, m0 - 4, (x, z, i, r) => b.blob(x, gy + 0.5, z, 1.2 + r(), 0.9 + r() * 0.5, 1.2 + r(), kit.mul(col(0x3f9f45), 0.9 + r() * 0.2), 0));
      const fl = [col(0xff5a6a), col(0xffe14a), col(0xffffff), col(0xff9ae0)];
      kit.scatter(240, 1, 40, m0 - 3, (x, z, i, r) => b.box(x, gy, z, 0.35, 0.5 + r() * 0.3, 0.35, r() * 3, fl[(r() * 4) | 0]));
      kit.farScatter(30, 90, (x, z, r) => {
        const s = 28 + r() * 40;
        b.blob(x, gy - 4, z, s * 1.4, s * 0.55, s, kit.mul(col(0x69b848), 0.9 + r() * 0.2), 1);
      });
      // flag bunting poles on the main straight
      for (let d = 10; d < 300; d += 30) {
        for (let s = -1; s <= 1; s += 2) rbox(b, kit, d, s * (hwS + 1), 0, 0.3, 7, 0.3, col(0xdddddd));
        const flag = [col(0xe83a3a), col(0xffd23a), col(0x2c6bff)][((d / 30) | 0) % 3];
        rbox(b, kit, d, -(hwS + 1.9), 5, 1.6, 1, 0.12, flag);
        rbox(b, kit, d, (hwS + 1.9), 5, 1.6, 1, 0.12, flag);
      }
      kit.mesh(b);
    },
    update(track, dt, time) {
      const s = track._sc; if (!s || !s.blimp) return;
      const bb = s.bb, a = time * 0.04 + 1, R = Math.max(bb.maxX - bb.minX, bb.maxZ - bb.minZ) * 0.42;
      s.blimp.position.set(bb.cx + Math.cos(a) * R, 75 + Math.sin(time * 0.3) * 2, bb.cz + Math.sin(a) * R * 0.6);
      s.blimp.rotation.y = -a - Math.PI / 2;
    },
  });

  // ================================================================== 2. CORAL COAST
  const CC = { tideD0: 0, tideD1: 0 };
  G.defineTrack({
    id: 'coral_coast', name: 'Coral Coast', cup: 'mushroom', order: 2, laps: 3, music: 'beach',
    seed: 202, hw: 12, shoulder: 5, scale: 1, style: 'meadow', offroad: 'sand',
    theme: {
      sky: [0x2a8fe8, 0xa9e3ff, 0xfff0c8], fog: [0xc6ecff, 200, 760], ground: 0xdcb872, shoulder: 0xd2ac66,
      road: [0x6f6c6a, 0x676462], curb: [0xff7a59, 0xfff3d6], hemi: [0xdff1ff, 0xb59d6a, 0.72], sun: [0xfff0d0, 0.7],
      emb: 0xd8b36c, bg: 0xc6ecff,
    },
    walls: 'fence', wallColors: [0xfff3d6, 0x3fb8c9],
    pts: [[0, 0, 0, 13], [120, 2], [240, -8], [340, -4], [415, 35], [430, 105], [400, 170], [340, 215],
      [260, 234, 1], [190, 237, 3], [130, 234, 3], [75, 226, 1.4], [10, 225, 0.4], [-65, 205], [-125, 160], [-142, 100],
      [-112, 45], [-55, 12]],
    pads: [{ d: 70, len: 12, l: 0, w: 8 }, { d: 766, len: 12, l: 0, w: 8 }],
    jumps: [{ d: 780, len: 10, l: 0, w: 10 }],
    zones: [{ id: 'tide', d: 940, len: 70, l: 0, w: 38, surface: 'water', offroad: true, active: false, decal: false }],
    itemRows: [{ d: 120, count: 5 }, { d: 420, count: 5 }, { d: 640, count: 5 }, { d: 900, count: 5 }, { d: 1100, count: 5 }],
    decorate(track, kit) {
      const L = kit.length, b = new kit.Batch(), col = kit.col, rng = kit.rng, gy = kit.groundY, bb = bounds(kit);
      const st = (track._cc = { birds: [] });
      const seaZ = bb.minZ - 46;

      // ---- sea (north of the coast road): shallow + deep bands, foam line
      {
        const w = 2600, x0 = bb.cx - w / 2;
        const shallow = discSlab(kit, x0, seaZ - 70, w, 70, gy + 0.12, 0x6fe3d6, 0.86);
        const deep = discSlab(kit, x0, seaZ - 900, w, 830, gy + 0.1, 0x1f93d8, 0.95);
        st.sea = [shallow, deep];
        // foam / wet-sand stripe
        const fb = new kit.Batch();
        for (let x = bb.minX - 200; x < bb.maxX + 200; x += 9) fb.blob(x + rng() * 4, gy + 0.22, seaZ + 0.5 + rng() * 2.5, 5 + rng() * 3, 0.15, 1.4 + rng(), col(0xffffff), 0);
        kit.mesh(fb);
      }
      // ---- tide flood sheet
      {
        const d0 = 940, d1 = 1010, hw = 12 + 5;
        st.tide = roadRibbon(kit, d0, d1, -hw - 1, hw + 1, 0.13, { color: 0x49c0ee, opacity: 0, specular: 0xffffff }, 3);
        st.tide.material.opacity = 0; st.tideLevel = 0; st.tideOn = false;
        CC.tideD0 = d0; CC.tideD1 = d1;
        const wb = new kit.Batch();   // little tide-marker buoys beside the tide area
        for (let s = -1; s <= 1; s += 2) for (let d = d0; d <= d1; d += 35) {
          const p = kit.at(d, s * (hw + 3.5), 0);
          wb.frustum(p[0], p[1], p[2], 0.35, 0.35, 2.2, 6, col(0x777777), 0);
          wb.blob(p[0], p[1] + 2.4, p[2], 0.6, 0.6, 0.6, d % 2 ? col(0xff5a3a) : col(0xffffff), 0);
        }
        kit.mesh(wb);
      }

      // ---- cove under the ramp bridge: water channel + bridge supports
      {
        const dc = 825, half = 50, hw = 12 + 5;
        const c = kit.at(dc, 0, 0), f = kit.frame(dc);
        const g = kit.trackGeom(new THREE.PlaneGeometry(2 * half, 330)); g.rotateX(-Math.PI / 2);
        const mat = kit.trackMat(new THREE.MeshPhongMaterial({ color: 0x45c9d8, transparent: true, opacity: 0.88, shininess: 100, specular: 0xffffff }));
        const wm = new THREE.Mesh(g, mat);
        const h = Math.atan2(f.tx, f.tz);
        wm.position.set(c[0], gy + 0.14, c[2]); wm.rotation.y = h + Math.PI / 2;
        kit.add(wm); st.cove = wm;
        const sb = new kit.Batch(), stone = col(0xd9cba8), stone2 = col(0xc2b38c);
        for (let d = dc - half + 8; d <= dc + half - 8; d += 12) {
          for (let s = -1; s <= 1; s += 2) {
            const p = kit.at(d, s * (12 - 1.2), 0), hh = p[1] - gy;
            sb.box(p[0], gy, p[2], 2.4, hh, 2.4, h, ((d / 12) | 0) & 1 ? stone : stone2);
          }
        }
        for (let d = dc - half + 4; d <= dc + half - 4; d += 4) rbox(sb, kit, d, 0, -0.9, 2 * 13.4, 0.9, 4.2, stone2);
        kit.mesh(sb);
        // rocks on cove banks
        for (let k = 0; k < 16; k++) {
          const s = k & 1 ? 1 : -1, p = kit.at(dc + (rng() - 0.5) * 80, s * (30 + rng() * 55), 0);
          b.blob(p[0], gy + 0.2, p[2], 1.5 + rng() * 2, 0.8 + rng(), 1.5 + rng() * 2, kit.mix(col(0x9a8f7a), col(0xb5a88c), rng()), 0);
        }
        kit.reserve(c[0], c[2], 55);
      }

      // ---- lighthouse on the shore near the start
      {
        const d = 250, o = kit.at(d, -34, 0), x = o[0], z = o[2];
        for (let k = 0; k < 5; k++) b.frustum(x, gy + k * 5.2, z, 4.2 - k * 0.4, 3.8 - k * 0.4, 5.2, 10, k & 1 ? col(0xffffff) : col(0xe8383d), 0);
        b.frustum(x, gy + 26, z, 4.6, 4.6, 0.8, 10, col(0x3a3f4a), 0);
        b.frustum(x, gy + 26.8, z, 2.6, 2.6, 3, 10, col(0xfff3a0), 0);
        b.frustum(x, gy + 29.8, z, 3.4, 0, 3.2, 10, col(0xe8383d), 0);
        b.blob(x, gy + 1.2, z, 7.5, 1.6, 7.5, col(0xd9cba8), 1);
        kit.reserve(x, z, 14);
      }
      // ---- fountain plaza (inland of the start)
      {
        const o = kit.at(60, 52, 0), x = o[0], z = o[2], stone = col(0xe6dcc0), tint = col(0x6ad9e6);
        b.frustum(x, gy, z, 9, 9, 1.0, 16, stone, 0);
        b.frustum(x, gy + 1.0, z, 8.2, 8.2, 0.2, 16, tint, 0);
        b.frustum(x, gy + 1, z, 1.2, 1.0, 3.5, 8, stone, 0);
        b.frustum(x, gy + 4.5, z, 4.2, 3.2, 0.6, 12, stone, 0);
        b.frustum(x, gy + 5.1, z, 3.6, 3.6, 0.15, 12, tint, 0);
        b.frustum(x, gy + 5.1, z, 0.8, 0.5, 3, 8, stone, 0);
        st.jet = new kit.Batch();
        st.jet.blob(0, 0, 0, 0.9, 2.2, 0.9, col(0xbff4ff), 1);
        const jm = kit.mesh(st.jet); jm.position.set(x, gy + 9, z); st.jetMesh = jm;
        kit.reserve(x, z, 16);
      }

      // ---- beach houses & hotel (inland side, south of the north straight)
      for (let k = 0; k < 11; k++) {
        const d = 40 + k * 28 + rng() * 10, side = 1, l = 12 + 5 + 16 + rng() * 6;
        const p = kit.at(d, side * l, 0), f = kit.frame(d);
        if (!kit.clear(p[0], p[2], 26)) continue;
        const walls = [0xfff3d6, 0xffb8a0, 0x9be3dc, 0xfff0a0, 0xf5c6e8][k % 5], roofs = [0xe8503a, 0x2fa8c9, 0xff9a3a][k % 3];
        house(b, kit, p[0], gy, p[2], 7 + rng() * 3, 7 + rng() * 2, Math.atan2(f.tx, f.tz), walls, roofs, 3.6 + rng() * 1.4);
      }
      {
        const p = kit.at(310, 56, 0), f = kit.frame(310), ry = Math.atan2(f.tx, f.tz);
        b.box(p[0], gy, p[2], 22, 16, 11, ry, col(0xfff3d6));
        b.box(p[0], gy + 16, p[2], 24, 1.2, 12.4, ry, col(0xff7a59));
        for (let k = 0; k < 6; k++) for (let r = 0; r < 3; r++) {
          const lx = -9 + k * 3.6, c = Math.cos(ry), s = Math.sin(ry);
          b.box(p[0] + lx * c + 5.55 * s * -1 * -1, gy + 2.5 + r * 4.4, p[2] - lx * s + 5.55 * c, 1.8, 2, 0.2, ry, col(0x35a0c0));
        }
        kit.reserve(p[0], p[2], 22);
      }
      // ---- beach umbrellas and sand castles on the shore side
      const ub = [0xff5a6a, 0xffd23a, 0x35c0d9, 0xffffff, 0xff9a3a];
      for (let k = 0; k < 26; k++) {
        const d = 20 + rng() * (L * 0.3), p = kit.at(d, -(12 + 5 + 8 + rng() * 22), 0);
        if (!kit.clear(p[0], p[2], 24)) continue;
        b.box(p[0], gy, p[2], 0.18, 2.6, 0.18, 0, col(0xdddddd));
        b.frustum(p[0], gy + 2.4, p[2], 1.9, 0, 0.9, 8, col(ub[k % 5]), rng());
        if (k % 3 === 0) b.box(p[0] + 2.2, gy, p[2] + 0.5, 2, 0.12, 1, rng(), col(ub[(k + 2) % 5]));
      }
      // ---- palm trees
      const m0 = 12 + 5 + 10 + 3;
      kit.scatter(150, 1, 60, m0 - 2, (x, z, i, r) => palm(b, kit, x, gy, z, 0.8 + r() * 0.6, r));
      kit.scatter(70, 1, 50, m0 - 4, (x, z, i, r) => b.blob(x, gy + 0.4, z, 1.2 + r(), 0.7 + r() * 0.5, 1.2 + r(), kit.mul(col(0x4cae4a), 0.85 + r() * 0.3), 0));
      kit.scatter(40, 2, 50, m0 - 4, (x, z, i, r) => b.blob(x, gy + 0.3, z, 0.9 + r() * 0.8, 0.5, 0.9 + r() * 0.8, kit.mix(col(0xf5b6c8), col(0xffd86a), r()), 0));
      kit.farScatter(24, 135, (x, z, r) => {
        const s = 26 + r() * 36;
        b.blob(x, gy - 4, z, s * 1.4, s * 0.5, s, kit.mul(col(0x7ac66a), 0.9 + r() * 0.2), 1);
      });
      kit.mesh(b);

      // ---- Squawkers: original hopping seabirds crossing the beach road (hazards built in hazards())
    },
    hazards(track, kit) {
      const out = [], bb = new kit.Batch(), col = kit.col;
      // bird body (faces +Z)
      bb.blob(0, 1.6, 0, 0.95, 1.1, 1.3, col(0xf7f3ea), 1);          // body
      bb.blob(0, 2.9, 0.65, 0.55, 0.6, 0.55, col(0xf7f3ea), 1);     // head
      bb.box(-0.12, 2.8, 1.15, 0.24, 0.2, 0.8, 0, col(0xff8a1a));    // beak
      bb.blob(-0.3, 3.05, 0.95, 0.12, 0.12, 0.12, col(0x222222), 0); bb.blob(0.3, 3.05, 0.95, 0.12, 0.12, 0.12, col(0x222222), 0);
      bb.blob(0, 3.5, 0.5, 0.25, 0.5, 0.3, col(0xff5a3a), 0);        // crest
      bb.blob(-0.95, 1.7, -0.1, 0.25, 0.7, 1.0, col(0x6fa8d8), 1); bb.blob(0.95, 1.7, -0.1, 0.25, 0.7, 1.0, col(0x6fa8d8), 1);
      bb.blob(0, 1.5, -1.2, 0.5, 0.35, 0.9, col(0x6fa8d8), 0);       // tail
      bb.box(-0.4, 0, 0, 0.12, 1.0, 0.12, 0, col(0xff8a1a)); bb.box(0.3, 0, 0, 0.12, 1.0, 0.12, 0, col(0xff8a1a));
      const geo = kit.trackGeom(bb.build()), mat = kit.mat({});
      const defs = [[140, 0, 'bump'], [190, 2.1, 'flip'], [240, 4.2, 'bump'], [290, 1.2, 'flip'], [340, 3.3, 'bump']];
      const o = { x: 0, y: 0, z: 0, tx: 0, tz: 1, rx: -1, rz: 0, hw: 12 };
      for (const [d, ph, kind] of defs) {
        frameInto(kit, d, o);
        const f = { x: o.x, y: o.y, z: o.z, rx: o.rx, rz: o.rz, tx: o.tx, tz: o.tz };
        const mesh = new THREE.Mesh(geo, mat), grp = new THREE.Group(); mesh.scale.setScalar(1.5); grp.add(mesh);
        const A = 15.5, w = 0.42, h = {
          x: f.x, y: f.y, z: f.z, radius: 1.7, hitKind: kind, vx: 0, vz: 0, active: true, object3D: grp,
          update(dt, time) {
            const a = time * w + ph, lat = Math.sin(a) * A, v = Math.cos(a) * A * w;
            h.x = f.x + f.rx * lat; h.z = f.z + f.rz * lat;
            h.y = f.y + Math.abs(Math.sin(time * 5.5 + ph * 3)) * 0.8;
            h.vx = f.rx * v; h.vz = f.rz * v;
            grp.position.set(h.x, h.y, h.z);
            grp.rotation.y = Math.atan2(h.vx, h.vz);
            mesh.rotation.z = Math.sin(time * 11 + ph) * 0.06;
          },
        };
        h.update(0, 0);
        out.push(h);
      }
      return out;
    },
    update(track, dt, time) {
      const s = track._cc; if (!s || !s.tide) return;
      // tide: floods for 8 s, recedes for 8 s
      const target = (time % 16) >= 8 ? 1 : 0;
      s.tideLevel += (target - s.tideLevel) * Math.min(1, dt * 1.6);
      const on = s.tideLevel > 0.5;
      if (on !== s.tideOn) { s.tideOn = on; track.setZoneActive('tide', on); }
      s.tide.material.opacity = Math.min(0.8, s.tideLevel * 0.85);
      s.tide.position.y = Math.sin(time * 2.1) * 0.03 - (1 - s.tideLevel) * 0.12;
      s.tide.visible = s.tideLevel > 0.02;
      if (s.sea) { s.sea[0].position.y = Math.sin(time * 0.9) * 0.1; s.sea[1].position.y = Math.sin(time * 0.7 + 1) * 0.08; }
      if (s.jetMesh) { const k = 1 + Math.sin(time * 4) * 0.25; s.jetMesh.scale.set(1, k, 1); }
    },
  });
  // a big flat water slab: x0..x0+w, z from zFar to zFar+depth
  function discSlab(kit, x0, zFar, w, depth, y, color, opacity) {
    const g = kit.trackGeom(new THREE.PlaneGeometry(w, depth)); g.rotateX(-Math.PI / 2);
    const mat = kit.trackMat(new THREE.MeshPhongMaterial({ color, transparent: true, opacity, shininess: 100, specular: 0xffffff }));
    const m = new THREE.Mesh(g, mat); m.position.set(x0 + w / 2, y, zFar + depth / 2); m.frustumCulled = false; kit.add(m); return m;
  }

  // ================================================================== 3. TINY TOT PARK
  const TT = (function () {
    const pts = [[0, 0, 0, 10]], R = 30, X = 40;
    for (let a = -90; a <= 90; a += 22.5) { const r = (a * Math.PI) / 180; pts.push([X + Math.cos(r) * R, 30 + Math.sin(r) * R, 0]); }
    pts.push([0, 60, 0]);
    for (let a = 90; a <= 270; a += 22.5) { const r = (a * Math.PI) / 180; pts.push([-X + Math.cos(r) * R, 30 + Math.sin(r) * R, 0]); }
    pts.pop();   // (-40,0): keep the closing straight smooth
    pts.push([-22, 0, 0]);
    return pts;
  })();
  G.defineTrack({
    id: 'tiny_tot_park', name: 'Tiny Tot Park', cup: 'mushroom', order: 3, laps: 7, music: 'park',
    seed: 303, hw: 10, shoulder: 3, scale: 1, style: 'meadow',
    theme: {
      sky: [0x4aa0f0, 0xcfeaff, 0xffe9b8], fog: [0xd8eeff, 160, 520], ground: 0x78c85a, shoulder: 0x62b048,
      road: [0x70747f, 0x686c78], curb: [0xff4d6d, 0xffffff], hemi: [0xe6f2ff, 0x84b864, 1.0], sun: [0xfff4d8, 0.9],
      emb: 0x62b048, bg: 0xd8eeff,
    },
    walls: 'fence', wallColors: [0xff4d6d, 0xffffff],
    pts: TT,
    pads: [],
    itemRows: [{ d: 87, count: 5 }, { d: 262, count: 5 }],
    decorate(track, kit) {
      const L = kit.length, b = new kit.Batch(), col = kit.col, rng = kit.rng, gy = kit.groundY;
      const st = (track._tt = {});
      const cx = 0, cz = 30;

      // ---- fairground plaza floor around the oval
      {
        const g = new kit.Batch(), plaza = col(0xe9d9b0), plaza2 = col(0xdfcc9c);
        for (let x = -150; x < 150; x += 20) for (let z = -90; z < 150; z += 20) {
          if ((x > -130 && x < 130 && z > -70 && z < 130) === false) continue;
          g.quad([x, gy + 0.03, z], [x + 20, gy + 0.03, z], [x + 20, gy + 0.03, z + 20], [x, gy + 0.03, z + 20], ((x + z) / 20) & 1 ? plaza : plaza2);
        }
        kit.mesh(g);
      }

      // ---- roller coaster ring around the oval
      const CN = 260, cpx = new Float32Array(CN + 1), cpy = new Float32Array(CN + 1), cpz = new Float32Array(CN + 1);
      let coasterLen = 0;
      {
        const rails = new kit.Batch(), supports = new kit.Batch(), railC = col(0xff4d6d), railC2 = col(0xffe14a), pil = col(0x4a6fd8), tie = col(0xe8e2d2);
        for (let k = 0; k <= CN; k++) {
          const u = (k % CN) / CN, d = u * L;
          const lat = -(10 + 3 + 30 + Math.sin(u * TAU * 5) * 4 + Math.sin(u * TAU * 2) * 3);
          const p = kit.at(d, lat, 0);
          cpx[k] = p[0]; cpz[k] = p[2];
          cpy[k] = 7 + (Math.sin(u * TAU * 4) * 0.5 + 0.5) * 9 + Math.max(0, Math.sin(u * TAU * 1 + 0.6)) * 8;
          if (k > 0) coasterLen += Math.hypot(cpx[k] - cpx[k - 1], cpz[k] - cpz[k - 1], cpy[k] - cpy[k - 1]);
        }
        for (let k = 0; k < CN; k++) {
          const k2 = k + 1, tx = cpx[k2] - cpx[k], tz = cpz[k2] - cpz[k], tl = Math.hypot(tx, tz) || 1, nx = -tz / tl, nz = tx / tl;
          for (let s = -1; s <= 1; s += 2) {
            beam(rails, [cpx[k] + nx * 0.8 * s, cpy[k], cpz[k] + nz * 0.8 * s], [cpx[k2] + nx * 0.8 * s, cpy[k2], cpz[k2] + nz * 0.8 * s], 0.16, (k >> 3) & 1 ? railC : railC2);
          }
          beam(rails, [cpx[k], cpy[k] - 0.5, cpz[k]], [cpx[k2], cpy[k2] - 0.5, cpz[k2]], 0.22, tie);
          if ((k & 3) === 0) beam(rails, [cpx[k] - nx * 0.9, cpy[k] - 0.2, cpz[k] - nz * 0.9], [cpx[k] + nx * 0.9, cpy[k] - 0.2, cpz[k] + nz * 0.9], 0.1, tie);
          if ((k % 6) === 0) supports.box(cpx[k], gy, cpz[k], 0.7, cpy[k] - gy - 0.6, 0.7, 0, pil);
          if ((k % 12) === 0) beam(supports, [cpx[k] - 2, gy, cpz[k] - 2], [cpx[k], cpy[k] - 0.8, cpz[k]], 0.14, pil);
        }
        kit.mesh(rails); kit.mesh(supports);
        // coaster cars: instanced
        const cars = 6, geo = kit.trackGeom(new THREE.BoxGeometry(1.7, 0.9, 2.3)), mat = kit.mat({ vertexColors: false });
        const im = new THREE.InstancedMesh(geo, mat, cars), cc = new THREE.Color();
        [0xff3a3a, 0xffd23a, 0x3aa0ff, 0x4ad64a, 0xff7ad8, 0xffffff].forEach((c, i) => { cc.setHex(c); im.setColorAt(i, cc); });
        im.frustumCulled = false; kit.add(im);
        st.cars = im; st.cpx = cpx; st.cpy = cpy; st.cpz = cpz; st.CN = CN; st.coasterLen = coasterLen;
        st.dummy = new THREE.Object3D();
        // lift hill + loop-de-loop style tower
        const towerP = kit.at(L * 0.5, -60, 0);
        b.box(towerP[0] - 1, gy, towerP[2], 2, 24, 2, 0, col(0xffd23a));
        kit.reserve(towerP[0], towerP[2], 6);
      }

      // ---- ferris wheel in the infield
      {
        const R0 = 14.5, cy = R0 + 3, X0 = 0, Z0 = cz;
        const wb = new kit.Batch(), rim = col(0xffffff), rim2 = col(0xff4d6d), sp = col(0xe8e2d2), SEG = 24;
        for (let i = 0; i < SEG; i++) {
          const a0 = (i / SEG) * TAU, a1 = ((i + 1) / SEG) * TAU;
          for (let s = -1; s <= 1; s += 2) {
            beam(wb, [s * 1.2, Math.cos(a0) * R0, Math.sin(a0) * R0], [s * 1.2, Math.cos(a1) * R0, Math.sin(a1) * R0], 0.28, i & 1 ? rim : rim2);
            if (i % 2 === 0) beam(wb, [s * 1.2, 0, 0], [s * 1.2, Math.cos(a0) * R0, Math.sin(a0) * R0], 0.14, sp);
          }
          if (i % 2 === 0) beam(wb, [-1.2, Math.cos(a0) * R0, Math.sin(a0) * R0], [1.2, Math.cos(a0) * R0, Math.sin(a0) * R0], 0.14, sp);
        }
        wb.blob(0, 0, 0, 2.2, 2.2, 2.2, col(0xffd23a), 1);
        const wheel = kit.mesh(wb); wheel.position.set(X0, cy, Z0); st.wheel = wheel;
        const sb = new kit.Batch(), leg = col(0x4a6fd8);
        for (let s = -1; s <= 1; s += 2) {
          beam(sb, [s * 1.6, gy, Z0 - 8], [s * 0.6, cy, Z0], 0.35, leg);
          beam(sb, [s * 1.6, gy, Z0 + 8], [s * 0.6, cy, Z0], 0.35, leg);
        }
        sb.box(-3, gy, Z0 - 10, 6, 0.8, 20, 0, col(0xcfc6a8));
        kit.mesh(sb);
        const gg = kit.trackGeom(new THREE.BoxGeometry(1.6, 1.5, 1.8)), gmat = kit.mat({ vertexColors: false });
        const gond = new THREE.InstancedMesh(gg, gmat, 12), cc = new THREE.Color();
        for (let i = 0; i < 12; i++) { cc.setHSL(i / 12, 0.85, 0.55); gond.setColorAt(i, cc); }
        gond.frustumCulled = false; kit.add(gond);
        st.gond = gond; st.wheelC = [X0, cy, Z0, R0];
        kit.reserve(X0, Z0, 18);
      }

      // ---- carousel in the infield corner, tents & stalls around the oval
      {
        const x = 52, z = 30, cr = col(0xff4d6d);
        b.frustum(x, gy, z, 7, 7, 0.8, 16, col(0xe8e2d2), 0);
        b.frustum(x, gy + 0.8, z, 0.9, 0.9, 6, 8, col(0xffd23a), 0);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU, px = x + Math.cos(a) * 5.2, pz = z + Math.sin(a) * 5.2;
          b.box(px, gy + 0.8, pz, 0.25, 4.5, 0.25, 0, col(0xffffff));
          b.blob(px, gy + 2.5, pz, 0.9, 0.7, 1.4, kit.hsl(k / 8, 0.7, 0.6), 0);
        }
        b.frustum(x, gy + 5.4, z, 8, 0, 3.4, 16, cr, 0);
        b.frustum(x, gy + 5.4, z, 8, 7.6, 0.5, 16, col(0xffffff), 0);
        kit.reserve(x, z, 10);
      }
      for (let k = 0; k < 14; k++) {
        const d = (k + 0.5) * (L / 14), l = 10 + 3 + 11 + (k & 1) * 0, p = kit.at(d, (k & 1 ? 1 : -1) * 0 + (k % 3 === 0 ? 1 : -1) * (13 + 9), 0);
        void l;
        if (!kit.clear(p[0], p[2], 14)) continue;
        const f = kit.frame(d), h = Math.atan2(f.tx, f.tz), c1 = kit.hsl(k / 14, 0.75, 0.6);
        b.box(p[0], gy, p[2], 4, 2.2, 4, h, col(0xf2ecdc));
        b.frustum(p[0], gy + 2.2, p[2], 3.6, 0, 2.4, 4, c1, h + Math.PI / 4);
        b.box(p[0] - 0.1, gy, p[2], 0.2, 5.2, 0.2, 0, col(0xffffff));
      }
      // ---- balloons & bunting
      {
        const bal = [0xff4d6d, 0xffd23a, 0x3aa0ff, 0x4ad64a, 0xff7ad8];
        for (let k = 0; k < 40; k++) {
          const d = rng() * L, s = rng() < 0.5 ? -1 : 1, p = kit.at(d, s * (13 + 4 + rng() * 5), 0);
          if (!kit.clear(p[0], p[2], 13)) continue;
          const c = col(bal[k % 5]);
          b.box(p[0], gy, p[2], 0.05, 4 + rng() * 3, 0.05, 0, col(0xdddddd));
          b.blob(p[0], gy + 6 + rng() * 3, p[2], 0.9, 1.1, 0.9, c, 1);
        }
        for (let d = 8; d < L; d += 22) for (let s = -1; s <= 1; s += 2) {
          rbox(b, kit, d, s * (10 + 3 + 0.6), 0, 0.3, 4.2, 0.3, col(0xffffff));
          rbox(b, kit, d, s * (10 + 3 + 0.6), 4.2, 0.5, 0.5, 0.5, col(kit.hsl(d / 90, 0.8, 0.6)));
        }
        // entrance gate sign over the start line
        const f = kit.frame(0), ry = Math.atan2(f.tx, f.tz);
        for (let s = -1; s <= 1; s += 2) {
          const p = kit.at(0, s * (10 + 3 + 1.5), 0);
          b.box(p[0], p[1], p[2], 1.6, 12, 1.6, ry, s < 0 ? col(0xff4d6d) : col(0x3aa0ff));
        }
        for (let k = 0; k < 7; k++) rbox(b, kit, 0, -14.1 + (k + 0.5) * (28.2 / 7), 12, 28.2 / 7 + 0.1, 3, 1.6, kit.hsl(k / 7, 0.8, 0.6));
        void ry;
      }
      // ---- trees and hedges outside the coaster ring
      kit.scatter(60, 40, 90, 70, (x, z, i, r) => roundTree(b, kit, x, gy, z, 0.9 + r() * 0.7, r, 0x45b24a, 0x58c25a));
      kit.farScatter(16, 130, (x, z, r) => { const s = 30 + r() * 30; b.blob(x, gy - 4, z, s * 1.4, s * 0.5, s, kit.mul(col(0x69b848), 0.9 + r() * 0.2), 1); });
      kit.mesh(b);
    },
    update(track, dt, time) {
      const s = track._tt; if (!s) return;
      if (s.wheel) {
        const a = time * 0.28; s.wheel.rotation.x = a;
        const w = s.wheelC, g = s.gond, d = s.dummy;
        for (let i = 0; i < 12; i++) {
          const an = a + (i / 12) * TAU;
          d.position.set(w[0], w[1] + Math.cos(an) * w[3] - 1.5, w[2] + Math.sin(an) * w[3]);
          d.rotation.set(0, 0, 0); d.updateMatrix(); g.setMatrixAt(i, d.matrix);
        }
        g.instanceMatrix.needsUpdate = true;
      }
      if (s.cars) {
        const n = s.CN, d = s.dummy, sp = 15, per = s.coasterLen;
        for (let i = 0; i < 6; i++) {
          let u = ((time * sp - i * 2.8 - Math.floor(i / 3) * per * 0.5) / per) % 1; if (u < 0) u += 1;
          const f = u * n, k = Math.floor(f) % n, t = f - Math.floor(f), k2 = k + 1;
          const x = s.cpx[k] + (s.cpx[k2] - s.cpx[k]) * t, y = s.cpy[k] + (s.cpy[k2] - s.cpy[k]) * t, z = s.cpz[k] + (s.cpz[k2] - s.cpz[k]) * t;
          const dx = s.cpx[k2] - s.cpx[k], dz = s.cpz[k2] - s.cpz[k], dy = s.cpy[k2] - s.cpy[k], hl = Math.hypot(dx, dz) || 1;
          d.position.set(x, y + 0.7, z);
          d.rotation.set(0, 0, 0); d.rotation.order = 'YXZ';
          d.rotation.y = Math.atan2(dx, dz); d.rotation.x = -Math.atan2(dy, hl);
          d.updateMatrix(); s.cars.setMatrixAt(i, d.matrix);
        }
        s.cars.instanceMatrix.needsUpdate = true;
      }
    },
  });

  // ================================================================== 4. DUSTBOWL DESERT
  G.defineTrack({
    id: 'dusty_desert', name: 'Dustbowl Desert', cup: 'mushroom', order: 4, laps: 3, music: 'desert',
    seed: 404, hw: 14, shoulder: 5, scale: 1, style: 'dunes', offroad: 'sand', walls: 'adobe',
    theme: {
      sky: [0x4c9be0, 0xf6d9a2, 0xeac47a], fog: [0xf1cf94, 130, 520], ground: 0xd9a95a, shoulder: 0xcc9a4c,
      road: [0x7c7064, 0x73675a], curb: [0xc8502d, 0xf3e2b8], hemi: [0xffe6c4, 0xb88a4c, 0.72], sun: [0xffe2b0, 0.75],
      emb: 0xd0a050, bg: 0xf1cf94,
    },
    pts: [[0, 0, 0, 14], [120, 0, 0.3], [250, -5, 1], [350, -25, 1.5], [430, 10, 2], [465, 80, 2, 15], [450, 150, 1.5, 15],
      [400, 205, 1], [330, 225, 0.8], [250, 230, 0.8], [170, 245, 1.5], [105, 290, 2.5], [30, 300, 2.5], [-40, 270, 1.5],
      [-68, 205, 1], [-52, 150, 0.5], [-62, 100, 0.3], [-55, 45, 0], [-30, 8, 0]],
    pads: [{ d: 110, len: 12, l: 0, w: 8 }, { d: 1300, len: 12, l: -4, w: 6 }],
    zones: [{ d: 540, len: 44, l: 14, w: 12, surface: 'void', offroad: true, color: 0x7a5a2a }],
    itemRows: [{ d: 150, count: 5 }, { d: 380, count: 5 }, { d: 700, count: 5 }, { d: 900, count: 5 }, { d: 1100, count: 5 }],
    decorate(track, kit) {
      const L = kit.length, b = new kit.Batch(), col = kit.col, rng = kit.rng, gy = kit.groundY, bb = bounds(kit);
      const st = (track._dd = {});
      const sand = col(0xe6bd6c), stoneA = col(0xd2a05c), stoneB = col(0xc08a48);

      // ---- sinkhole swirl on the inside of the sinkhole corner
      {
        const dc = 562, f = kit.frame(dc), c = kit.at(dc, f.halfWidth + 9, 0), sw = new kit.Batch();
        const R = 19;
        sw.frustum(0, 0, 0, R, R, 0.02, 28, col(0xd9b068), 0);
        for (let arm = 0; arm < 6; arm++) for (let k = 0; k < 14; k++) {
          const r0 = 2.5 + k * 1.15, r1 = r0 + 1.15, a0 = (arm / 6) * TAU + k * 0.30, a1 = a0 + 0.52, a2 = a0 + 0.30, a3 = a2 + 0.52;
          sw.quad([Math.cos(a0) * r0, 0.04, Math.sin(a0) * r0], [Math.cos(a1) * r0, 0.04, Math.sin(a1) * r0], [Math.cos(a3) * r1, 0.04, Math.sin(a3) * r1], [Math.cos(a2) * r1, 0.04, Math.sin(a2) * r1], (arm + k) & 1 ? col(0x5a3d1a) : col(0xb08848));
        }
        sw.frustum(0, 0.06, 0, 4, 4, 0.02, 16, col(0x2a1a0c), 0);
        const m = kit.mesh(sw); m.position.set(c[0], c[1] + 0.12, c[2]); st.swirl = m;
        kit.reserve(c[0], c[2], 22);
        // warning posts at the pit lip
        for (let k = -2; k <= 2; k++) { const p = kit.at(dc + k * 11, f.halfWidth - 8, 0); b.box(p[0], p[1], p[2], 0.3, 1.6, 0.3, 0, k & 1 ? col(0xe83a3a) : col(0xffffff)); }
      }

      // ---- Prickle Pillars: static caterpillar-cactus creatures (hazards drawn here, collided in hazards())
      st.pillarSpots = [];
      {
        const spots = [[230, 1], [330, -1], [450, 1], [700, -1], [780, 1], [880, -1], [1000, 1], [1130, -1]];
        const green = col(0x3f9a4a), green2 = col(0x56b25a), spike = col(0xfff3c0), eyeW = col(0xffffff), blk = col(0x222222), pink = col(0xff7ab0);
        for (const [d, s] of spots) {
          const f = kit.frame(d), p = kit.at(d, s * (f.halfWidth - 3.4), 0);
          st.pillarSpots.push([p[0], p[1], p[2]]);
          const fx = -f.rx * s * -1; void fx;
          // face looks toward the road centre
          const fdx = -f.rx * s, fdz = -f.rz * s;
          for (let k = 0; k < 6; k++) {
            const r = 1.9 - k * 0.12, y = p[1] + 1.0 + k * 1.55, sway = Math.sin(k * 0.9) * 0.35 * (k > 2 ? 1 : 0.4);
            b.blob(p[0] + f.tx * sway, y, p[2] + f.tz * sway, r, 1.0, r, k & 1 ? green : green2, 1);
            if (k < 5) for (let q = 0; q < 6; q++) {
              const an = (q / 6) * TAU + k, sx = Math.cos(an) * r * 0.92, sz = Math.sin(an) * r * 0.92;
              b.frustum(p[0] + f.tx * sway + sx, y - 0.1, p[2] + f.tz * sway + sz, 0.14, 0, 0.7, 4, spike, an);
            }
          }
          const hy = p[1] + 1.0 + 5 * 1.55, sw = Math.sin(5 * 0.9) * 0.35;
          const hx = p[0] + f.tx * sw, hz = p[2] + f.tz * sw;
          b.blob(hx, hy + 0.9, hz, 1.5, 1.35, 1.5, green2, 1);   // head
          for (let e = -1; e <= 1; e += 2) {
            const ex = hx + fdx * 1.05 + f.tx * e * 0.55, ez = hz + fdz * 1.05 + f.tz * e * 0.55;
            b.blob(ex, hy + 1.25, ez, 0.42, 0.5, 0.42, eyeW, 1);
            b.blob(ex + fdx * 0.3, hy + 1.25, ez + fdz * 0.3, 0.2, 0.25, 0.2, blk, 0);
          }
          b.blob(hx + fdx * 1.2, hy + 0.35, hz + fdz * 1.2, 0.45, 0.28, 0.45, pink, 0);
          b.blob(hx, hy + 2.35, hz, 0.45, 0.6, 0.45, pink, 0);   // flower bud on top
          for (let a = -1; a <= 1; a += 2) {                    // little arms
            const ax = p[0] + f.tx * a * 2.1, az = p[2] + f.tz * a * 2.1;
            b.blob(ax, p[1] + 3.6, az, 0.55, 1.3, 0.55, green, 1);
            b.blob(ax, p[1] + 5.0, az, 0.45, 0.7, 0.45, green2, 0);
          }
        }
      }

      // ---- pyramids and ruins in the infield
      const pyr = (x, z, r, h, c) => {
        if (!kit.clear(x, z, r + 18)) return;
        b.frustum(x, gy, z, r, 0, h, 4, c, Math.PI / 4);
        b.frustum(x, gy, z, r * 1.04, r * 0.7, 2.2, 4, stoneB, Math.PI / 4);
        kit.reserve(x, z, r * 0.9);
      };
      pyr(215, 115, 58, 52, col(0xe2b46a)); pyr(300, 80, 34, 30, col(0xd9a85e)); pyr(130, 130, 24, 21, col(0xd5a058));
      // obelisks + ruined colonnade
      for (let k = 0; k < 7; k++) {
        const x = 270 + k * 11, z = 160 + Math.sin(k) * 2, h = k === 3 ? 4 : 9 + (k & 1) * 2;
        if (!kit.clear(x, z, 20)) continue;
        b.frustum(x, gy, z, 1.3, 1.1, h, 8, stoneA, 0);
        b.box(x, gy + h, z, 2.8, 0.7, 2.8, 0, stoneB);
      }
      {
        const x = 335, z = 130;
        if (kit.clear(x, z, 20)) { b.frustum(x, gy, z, 3.4, 2.6, 22, 4, col(0xb89058), Math.PI / 4); b.frustum(x, gy + 22, z, 2.6, 0, 3.4, 4, col(0xffd23a), Math.PI / 4); }
      }
      // arch ruins over the road
      for (const dd of [L * 0.16, 800]) {
        const f = kit.frame(dd), w = f.halfWidth + 5 + 3, ry = Math.atan2(f.tx, f.tz);
        for (let s = -1; s <= 1; s += 2) {
          const p = kit.at(dd, s * w, 0);
          b.box(p[0], p[1], p[2], 5, 14, 5, ry, stoneA); b.box(p[0], p[1] + 14, p[2], 6, 2, 6, ry, stoneB);
        }
        for (let k = 0; k < 7; k++) {
          const l = -w + (k / 6) * 2 * w, yy = 14 + Math.sin((k / 6) * Math.PI) * 2.6, p = kit.at(dd, l, 0);
          b.box(p[0], p[1] + yy, p[2], (2 * w) / 6 + 1.2, 2.6, 5, ry, k & 1 ? stoneA : stoneB);
        }
      }

      // ---- oasis with pond and palms
      {
        const ox = 70, oz = 150;
        if (kit.clear(ox, oz, 36)) {
          const pond = discMesh(kit, ox, gy + 0.1, oz, 16, { color: 0x3fb8d8, opacity: 0.9, specular: 0xffffff }, 30); st.pond = pond;
          b.frustum(ox, gy, oz, 21, 21, 0.18, 24, col(0x5eaa4a), 0);
          for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU + rng() * 0.2; palm(b, kit, ox + Math.cos(a) * (19 + rng() * 6), gy, oz + Math.sin(a) * (19 + rng() * 6), 0.9 + rng() * 0.7, rng); }
          kit.reserve(ox, oz, 28);
        }
      }
      // ---- cacti, rocks, dunes
      const m0 = 14 + 5 + 10 + 4;
      kit.scatter(110, 2, 70, m0, (x, z, i, r) => {
        const s = 0.8 + r() * 1.0, c = kit.mul(col(0x3f9a4a), 0.9 + r() * 0.2);
        b.frustum(x, gy, z, 0.55 * s, 0.45 * s, 3.8 * s, 6, c, 0);
        b.blob(x, gy + 3.8 * s, z, 0.5 * s, 0.4 * s, 0.5 * s, c, 0);
        const side = r() < 0.5 ? -1 : 1;
        b.box(x + side * 0.7 * s, gy + 1.5 * s, z, 0.9 * s, 0.4 * s, 0.4 * s, 0, c); b.box(x + side * 1.05 * s, gy + 1.5 * s, z, 0.4 * s, 1.3 * s, 0.4 * s, 0, c);
      });
      kit.scatter(110, 2, 80, m0 - 3, (x, z, i, r) => { const s = 0.8 + r() * 2.2; b.blob(x, gy + 0.3 * s, z, 1.6 * s, 1.0 * s, 1.3 * s, kit.mul(r() < 0.5 ? col(0xb9885a) : col(0x9d7a5a), 0.9 + r() * 0.2), 0); });
      kit.farScatter(30, 80, (x, z, r) => { const s = 30 + r() * 44; b.blob(x, gy - 3, z, s * 1.6, s * 0.33, s, kit.mix(col(0xe8c070), col(0xd9a85c), r()), 1); });
      kit.farScatter(12, 95, (x, z, r) => {
        const R0 = 14 + r() * 14, h = 14 + r() * 22, rock = [col(0xc9733f), col(0xd98a4a), col(0xb85f35)];
        for (let k = 0; k < 3; k++) b.frustum(x, gy + (k * h) / 3, z, R0 * (1 - k * 0.06), R0 * (1 - (k + 1) * 0.06 - 0.1), h / 3, 8, rock[k], r());
      });
      kit.mesh(b);

      // ---- tornado visuals are in hazards(); bones/skull decor
      void bb; void sand;
    },
    hazards(track, kit) {
      const out = [], col = kit.col, L = kit.length;
      // Prickle Pillars: static bump hazards
      const spots = track._dd.pillarSpots;
      for (const p of spots) out.push({ x: p[0], y: p[1], z: p[2], radius: 2.3, hitKind: 'bump', vx: 0, vz: 0, active: true, launchable: false });
      // dust devils
      const tb = new kit.Batch();
      for (let k = 0; k < 9; k++) {
        const r0 = 0.7 + k * 0.55, r1 = 0.7 + (k + 1) * 0.55, y = k * 1.7;
        tb.frustum(0, y, 0, r0, r1, 1.7, 9, k & 1 ? col(0xc9a068) : col(0xdcb77c), k * 0.4);
      }
      for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; tb.blob(Math.cos(a) * 3.4, 3 + k * 1.3, Math.sin(a) * 3.4, 0.45, 0.35, 0.45, col(0x8a6a3a), 0); }
      const geo = kit.trackGeom(tb.build());
      const mat = kit.trackMat(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.82, side: THREE.DoubleSide }));
      const o = { x: 0, y: 0, z: 0, tx: 0, tz: 1, rx: -1, rz: 0, hw: 14 };
      const devils = [[330, 70, 0.11, 0.35, 0], [830, 90, 0.09, 0.29, 2], [1060, 60, 0.12, 0.4, 4]];
      for (const [d0, A, w1, w2, ph] of devils) {
        const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false;
        let px = 0, pz = 0, first = true;
        const h = {
          x: 0, y: 0, z: 0, radius: 3.0, hitKind: 'flip', vx: 0, vz: 0, active: true, launchable: false, object3D: mesh,
          update(dt, time) {
            const d = d0 + Math.sin(time * w1 + ph) * A;
            frameInto(kit, ((d % L) + L) % L, o);
            const lat = Math.sin(time * w2 + ph * 1.7) * (o.hw + 4);
            const x = o.x + o.rx * lat, z = o.z + o.rz * lat;
            if (!first && dt > 0) { h.vx = (x - px) / dt; h.vz = (z - pz) / dt; }
            first = false; px = x; pz = z;
            h.x = x; h.z = z; h.y = o.y;
            mesh.position.set(x, o.y, z);
            mesh.rotation.y = time * 5 + ph;
            mesh.scale.set(1 + Math.sin(time * 3 + ph) * 0.06, 1, 1 + Math.cos(time * 2.4 + ph) * 0.06);
          },
        };
        h.update(0, 0);
        out.push(h);
      }
      return out;
    },
    update(track, dt, time) {
      const s = track._dd; if (!s) return;
      if (s.swirl) s.swirl.rotation.y = -time * 0.45;
      if (s.pond) s.pond.position.y = track.groundY + 0.1 + Math.sin(time * 1.2) * 0.02;
    },
  });
})();
