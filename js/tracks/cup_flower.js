// Flower Cup: Bayside Bridge, Castle Circuit, Daydream Cruiser, Mudslide Stadium.
(function () {
  'use strict';
  const G = (window.G = window.G || {});
  const PI = Math.PI;
  function arc(cx, cz, r, a0, a1, n, y, hw) {
    const out = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r, y, hw]); }
    return out;
  }

  // ------------------------------------------------------------------ shared helpers
  function rod(b, p, q, r, c) {
    const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], dl = Math.hypot(dx, dy, dz) || 1;
    let ux = 0, uy = 1, uz = 0;
    if (Math.abs(dy) > 0.95 * dl) { ux = 1; uy = 0; }
    let ax = dy * uz - dz * uy, ay = dz * ux - dx * uz, az = dx * uy - dy * ux;
    let al = Math.hypot(ax, ay, az) || 1; ax *= r / al; ay *= r / al; az *= r / al;
    let bx = dy * az - dz * ay, by = dz * ax - dx * az, bz = dx * ay - dy * ax;
    let bl = Math.hypot(bx, by, bz) || 1; bx *= r / bl; by *= r / bl; bz *= r / bl;
    const o = [[ax, ay, az], [bx, by, bz], [-ax, -ay, -az], [-bx, -by, -bz]];
    for (let i = 0; i < 4; i++) {
      const u = o[i], v = o[(i + 1) % 4];
      b.quad([p[0] + u[0], p[1] + u[1], p[2] + u[2]], [q[0] + u[0], q[1] + u[1], q[2] + u[2]],
        [q[0] + v[0], q[1] + v[1], q[2] + v[2]], [p[0] + v[0], p[1] + v[1], p[2] + v[2]], c);
    }
  }
  // flat ribbon along the road between laterals l0..l1, heights dy0 (at l0) / dy1 (at l1) relative to the road
  function strip(kit, b, d0, d1, step, l0, l1, dy0, dy1, c, c2) {
    const n = Math.max(1, Math.ceil((d1 - d0) / step));
    for (let i = 0; i < n; i++) {
      const a = d0 + ((d1 - d0) * i) / n, z = d0 + ((d1 - d0) * (i + 1)) / n;
      b.quad(kit.at(a, l0, dy0), kit.at(a, l1, dy1), kit.at(z, l1, dy1), kit.at(z, l0, dy0), c2 && (i & 1) ? c2 : c);
    }
  }
  // vertical wall along the road at lateral l from dyA to dyB
  function vwall(kit, b, d0, d1, step, l, dyA, dyB, c, c2) { strip(kit, b, d0, d1, step, l, l, dyA, dyB, c, c2); }
  function polyMesh(kit, pts, holes, y, color, opts) {
    const V = (p) => new THREE.Vector2(p[0], -p[1]);
    const sh = new THREE.Shape(pts.map(V));
    (holes || []).forEach((h) => sh.holes.push(new THREE.Path(h.map(V))));
    const g = new THREE.ShapeGeometry(sh); g.rotateX(-PI / 2);
    kit.trackGeom(g);
    const m = kit.trackMat(new THREE.MeshLambertMaterial(Object.assign({ color, side: THREE.DoubleSide }, opts || {})));
    const mesh = new THREE.Mesh(g, m); mesh.position.y = y;
    kit.add(mesh); return mesh;
  }
  function waterPoly(kit, pts, holes, y, color, opacity) {
    const V = (p) => new THREE.Vector2(p[0], -p[1]);
    const sh = new THREE.Shape(pts.map(V));
    (holes || []).forEach((h) => sh.holes.push(new THREE.Path(h.map(V))));
    const g = new THREE.ShapeGeometry(sh); g.rotateX(-PI / 2);
    kit.trackGeom(g);
    const m = kit.waterMat({ color, opacity });
    const mesh = new THREE.Mesh(g, m); mesh.position.y = y;
    kit.add(mesh); return mesh;
  }
  function discMesh(kit, x, z, r, y, color, opacity) {
    const g = new THREE.CircleGeometry(r, 40); g.rotateX(-PI / 2); kit.trackGeom(g);
    const m = kit.waterMat({ color, opacity: opacity || 0.9 });
    const mesh = new THREE.Mesh(g, m); mesh.position.set(x, y, z); kit.add(mesh); return mesh;
  }
  // unparented mesh from a batch (for hazards)
  function mk(kit, b, basic) {
    const g = kit.trackGeom(b.build());
    return new THREE.Mesh(g, kit.mat({}, basic));
  }
  function frameInto(track, d, o) { return track._frame(d, o); }
  const newF = () => ({ x: 0, y: 0, z: 0, tx: 0, tz: 1, rx: -1, rz: 0, halfWidth: 12 });
  // find the first/last distance where pred(index) holds in [d0,d1]
  function scanD(kit, d0, d1, pred) {
    let a = -1, z = -1;
    for (let d = d0; d <= d1; d += kit.ds) {
      const i = Math.min(kit.N - 1, Math.round(d / kit.ds));
      if (pred(i, d)) { if (a < 0) a = d; z = d; }
    }
    return [a, z];
  }
  // best open circle inside the loop (max clearance), away from reserved spots
  function openSpot(kit, minR, avoid) {
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (let i = 0; i < kit.N; i += 6) { minX = Math.min(minX, kit.px[i]); maxX = Math.max(maxX, kit.px[i]); minZ = Math.min(minZ, kit.pz[i]); maxZ = Math.max(maxZ, kit.pz[i]); }
    let best = null, bd = -1;
    for (let x = minX; x <= maxX; x += 10) for (let z = minZ; z <= maxZ; z += 10) {
      let d = 1e9;
      for (let i = 0; i < kit.N; i += 3) { const dd = Math.hypot(x - kit.px[i], z - kit.pz[i]); if (dd < d) d = dd; }
      if (avoid) for (const a of avoid) d = Math.min(d, Math.hypot(x - a.x, z - a.z) - a.r);
      if (d > bd) { bd = d; best = { x, z }; }
    }
    return best && bd > minR ? { x: best.x, z: best.z, clear: bd } : best && { x: best.x, z: best.z, clear: bd };
  }
  function tree(b, c, x, y, z, s, r, kind) {
    b.box(x, y, z, 0.6 * s, 2.4 * s, 0.6 * s, r() * 3, c(0x7a4f2a));
    if (kind === 'pine') for (let k = 0; k < 3; k++) b.frustum(x, y + (1.6 + k * 1.7) * s, z, (2.5 - k * 0.7) * s, 0, 2.6 * s, 7, c(0x2f8f46), r());
    else {
      b.blob(x, y + 3.7 * s, z, 2.6 * s, 2.3 * s, 2.6 * s, c(0x45b24a), 0);
      b.blob(x + 1.1 * s, y + 3.1 * s, z + 0.5 * s, 1.6 * s, 1.5 * s, 1.6 * s, c(0x58c25a), 0);
    }
  }
  // building with window bands
  function building(kit, b, x, y0, z, w, h, d, ry, body, roof, glass) {
    const c = kit.col;
    b.box(x, y0, z, w, h, d, ry, body);
    const floors = Math.floor(h / 3.2);
    for (let f = 0; f < floors; f++) b.box(x, y0 + 1.6 + f * 3.2, z, w + 0.12, 1.3, d + 0.12, ry, glass);
    b.box(x, y0 + h, z, w + 0.5, 0.6, d + 0.5, ry, roof);
  }
  // roll of a tunnel shell + hill over it
  function tunnel(kit, b, lamps, d0, d1, o) {
    const c = kit.col, w = o.w, h = o.h, step = 4;
    const stone = c(o.stone), inner = c(o.inner), hill = c(o.hill), ceil = c(o.ceil || o.inner);
    strip(kit, b, d0, d1, step, -w, -w, 0, h, inner, mulK(inner, 0.9));
    strip(kit, b, d0, d1, step, w, w, 0, h, inner, mulK(inner, 0.9));
    strip(kit, b, d0, d1, step, -w, w, h, h, ceil);
    // hill
    strip(kit, b, d0, d1, step, -w - 18, -w - 4, -3, h + 1.5, hill, mulK(hill, 0.93));
    strip(kit, b, d0, d1, step, -w - 4, w + 4, h + 1.5, h + 1.5, mulK(hill, 1.05));
    strip(kit, b, d0, d1, step, w + 4, w + 18, h + 1.5, -3, hill, mulK(hill, 0.93));
    for (const dd of [d0, d1]) {
      const f = kit.frame(dd), hd = Math.atan2(f.tx, f.tz);
      for (let s = -1; s <= 1; s += 2) { const p = kit.at(dd, s * (w + 1.2), 0); b.box(p[0], p[1] - 1, p[2], 2.6, h + 3, 2.6, hd, stone); }
      const p = kit.at(dd, 0, h + 0.1);
      b.box(p[0], p[1], p[2], 2 * w + 5.5, 2.8, 2.6, hd, stone);
      const q = kit.at(dd, 0, h + 2.8); b.box(q[0], q[1], q[2], 2 * w + 7, 0.8, 3.2, hd, mulK(stone, 0.8));
    }
    for (let d = d0 + 6; d < d1; d += 12) for (let s = -1; s <= 1; s += 2) {
      const p = kit.at(d, s * (w - 0.6), h - 1.3); lamps.box(p[0], p[1], p[2], 0.9, 0.35, 0.9, 0, c(0xfff0b0));
    }
  }
  const mulK = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  // distance to the centerline (cheap, uses the kit samples)
  function roadDist(kit, x, z) {
    let best = 1e9;
    for (let i = 0; i < kit.N; i += 2) { const dx = x - kit.px[i], dz = z - kit.pz[i]; const d = dx * dx + dz * dz; if (d < best) best = d; }
    return Math.sqrt(best);
  }

  // ------------------------------------------------------------------ vehicles (hazard models)
  function vehicleTemplate(kit, kind, body, accent) {
    const c = kit.col, b = new kit.Batch(), dark = c(0x1c1c22), glass = c(0x27384a), lamp = c(0xfff2a0), tail = c(0xd81e1e);
    if (kind === 'car') {
      b.box(0, 0.35, 0, 2.0, 0.85, 4.4, 0, c(body));
      b.box(0, 1.2, -0.3, 1.8, 0.75, 2.3, 0, glass);
      b.box(0, 1.95, -0.3, 1.75, 0.14, 2.1, 0, c(accent));
      for (let sx = -1; sx <= 1; sx += 2) for (let sz = -1; sz <= 1; sz += 2) b.box(sx * 1.0, 0, sz * 1.45, 0.4, 0.85, 0.95, 0, dark);
      b.box(-0.7, 0.7, 2.22, 0.45, 0.25, 0.1, 0, lamp); b.box(0.7, 0.7, 2.22, 0.45, 0.25, 0.1, 0, lamp);
      b.box(-0.7, 0.7, -2.22, 0.45, 0.25, 0.1, 0, tail); b.box(0.7, 0.7, -2.22, 0.45, 0.25, 0.1, 0, tail);
    } else {
      b.box(0, 0.5, 3.2, 2.6, 2.4, 2.3, 0, c(accent));
      b.box(0, 1.9, 4.32, 2.3, 0.9, 0.12, 0, glass);
      b.box(0, 0.7, -0.9, 2.9, 3.0, 7.0, 0, c(body));
      b.box(0, 0.3, 1.2, 2.5, 0.5, 2.2, 0, dark);
      for (let sx = -1; sx <= 1; sx += 2) for (const sz of [-3.2, -1.6, 3.2]) b.box(sx * 1.25, 0, sz, 0.45, 1.0, 1.1, 0, dark);
      b.box(-0.9, 0.9, 4.37, 0.5, 0.3, 0.1, 0, lamp); b.box(0.9, 0.9, 4.37, 0.5, 0.3, 0.1, 0, lamp);
      b.box(-0.9, 1.0, -4.42, 0.5, 0.3, 0.1, 0, tail); b.box(0.9, 1.0, -4.42, 0.5, 0.3, 0.1, 0, tail);
    }
    const m = kit.mesh(b); m.visible = false; return m;
  }
  function makeTraffic(track, kit, specs) {
    const out = [], L = kit.length;
    const tpl = {
      c1: vehicleTemplate(kit, 'car', 0xd94a3a, 0xf4f0e6), c2: vehicleTemplate(kit, 'car', 0x2f78d0, 0x1d3f7a),
      c3: vehicleTemplate(kit, 'car', 0xf2c230, 0x222222), c4: vehicleTemplate(kit, 'car', 0x3fae5c, 0xe8f0e0),
      t1: vehicleTemplate(kit, 'truck', 0xf2f2f2, 0xd2542f), t2: vehicleTemplate(kit, 'truck', 0xe0b040, 0x2d5aa0),
    };
    specs.forEach((sp) => {
      const mesh = tpl[sp.t].clone(); mesh.visible = true;
      const f = newF(), dir = sp.dir, big = sp.t[0] === 't';
      const h = {
        x: 0, y: 0, z: 0, radius: big ? 2.7 : 1.75, hitKind: 'flip', vx: 0, vz: 0, active: true, object3D: mesh, d: sp.d, speed: sp.speed,
        update(dt) {
          this.d += dir * this.speed * dt; if (this.d >= L) this.d -= L; else if (this.d < 0) this.d += L;
          frameInto(track, this.d, f);
          this.x = f.x + f.rx * sp.lane; this.z = f.z + f.rz * sp.lane; this.y = f.y + 0.9;
          this.vx = f.tx * dir * this.speed; this.vz = f.tz * dir * this.speed;
          mesh.position.set(this.x, f.y, this.z);
          mesh.rotation.y = Math.atan2(this.vx, this.vz);
        },
      };
      h.update(0); out.push(h);
    });
    return out;
  }
  // lunging plant / pot hazard: base static at lateral lat, head lunges toward the road centre
  function snapperTemplate(kit, pal) {
    const c = kit.col, pot = new kit.Batch(), head = new kit.Batch();
    pot.frustum(0, 0, 0, 1.5, 1.2, 1.5, 10, c(pal.pot), 0.3); pot.frustum(0, 1.4, 0, 1.7, 1.55, 0.35, 10, c(pal.rim), 0);
    pot.frustum(0, 1.7, 0, 0.35, 0.28, 1.4, 6, c(pal.stem), 0);
    pot.blob(0.9, 2.3, 0, 1.0, 0.3, 0.55, c(pal.leaf), 0); pot.blob(-0.9, 2.1, 0.2, 1.0, 0.3, 0.55, c(pal.leaf), 0);
    // head: upper jaw + lower jaw with teeth, facing +z
    head.blob(0, 0.55, 0, 1.45, 0.8, 1.35, c(pal.head), 1);
    head.blob(0, -0.45, 0.05, 1.3, 0.55, 1.2, c(pal.head2), 1);
    head.blob(0, -0.05, 0.1, 1.15, 0.28, 1.1, c(pal.mouth), 0);
    for (let i = 0; i < 7; i++) { const a = -1.1 + i * 0.37; head.frustum(Math.sin(a) * 1.15, 0.0, Math.cos(a) * 1.15 * 0.9, 0.16, 0, 0.5, 4, c(0xffffff), 0); }
    for (let i = 0; i < 5; i++) { const a = -0.75 + i * 0.37; head.frustum(Math.sin(a) * 1.05, -0.5, Math.cos(a) * 1.05 * 0.9, 0.16, 0, 0.45, 4, c(0xffffff), 0); }
    head.blob(0.55, 1.15, 0.65, 0.34, 0.3, 0.3, c(0xffffff), 0); head.blob(-0.55, 1.15, 0.65, 0.34, 0.3, 0.3, c(0xffffff), 0);
    head.blob(0.55, 1.17, 0.9, 0.14, 0.14, 0.14, c(0x111111), 0); head.blob(-0.55, 1.17, 0.9, 0.14, 0.14, 0.14, c(0x111111), 0);
    return { pot: mk(kit, pot), head: mk(kit, head) };
  }
  // specs: [{d, lat (side: +/-1 meaning toward that edge), phase}]
  function makeSnappers(track, kit, pal, specs, opts) {
    opts = opts || {};
    const tp = snapperTemplate(kit, pal), out = [], f = newF();
    specs.forEach((sp) => {
      const fr = frameInto(track, sp.d, newF());
      const edge = (fr.halfWidth + (opts.out !== undefined ? opts.out : 2.4)) * sp.side;   // pot sits just off the road edge
      const g = new THREE.Group(), pot = tp.pot.clone(), head = tp.head.clone();
      g.add(pot); g.add(head);
      const SC = opts.scale || 1.35; g.scale.setScalar(SC);
      g.position.set(fr.x + fr.rx * edge, fr.y, fr.z + fr.rz * edge);
      g.rotation.y = Math.atan2(-fr.rx * sp.side, -fr.rz * sp.side);   // faces the road centre
      head.position.set(0, 3.1, 0.2);
      const period = opts.period || 3.2;
      const h = {
        x: g.position.x, y: fr.y + 1.5, z: g.position.z, radius: 1.5 * SC, hitKind: 'spin', vx: 0, vz: 0, active: true, launchable: false, object3D: g,
        update(dt, time) {
          const ph = (((time + sp.phase) % period) + period) % period / period;
          // idle 0..0.55 (head bobs), lunge 0.55..0.8, snap back 0.8..1
          let ext = 0, open = 0.2 + 0.1 * Math.sin(time * 3 + sp.phase);
          if (ph > 0.55 && ph < 0.8) { const u = (ph - 0.55) / 0.25; ext = Math.sin(u * PI * 0.5); open = 1; }
          else if (ph >= 0.8 && ph < 0.92) { const u = (ph - 0.8) / 0.12; ext = 1 - u; open = 1 - u; }
          const reach = ext * (opts.reach || 5.5);
          head.position.set(0, 3.1 - ext * 0.8, (0.2 + reach) / SC);
          head.scale.set(1, 1 + open * 0.15, 1);
          head.rotation.x = -0.25 * ext;
          const dx = fr.rx * -sp.side, dz = fr.rz * -sp.side;
          this.x = g.position.x + dx * (0.2 + reach); this.z = g.position.z + dz * (0.2 + reach);
          this.radius = (1.4 + ext * 0.9) * SC * 0.9;
          this.vx = ext > 0.1 && ph < 0.8 ? dx * 6 : 0; this.vz = ext > 0.1 && ph < 0.8 ? dz * 6 : 0;
        },
      };
      h.update(0, 0); out.push(h);
    });
    return out;
  }

  // ===================================================================== 1 BAYSIDE BRIDGE
  const BB_PTS = [
    [0, 0, 0, 12], [70, 0, 0], [140, 0, 2.5], [215, 0, 6], [270, 0, 8.5], [370, 0, 9.5], [450, 0, 9.5], [520, 0, 9],
    [565, 8, 7.2], [610, 35, 4], [640, 85, 1], [635, 140, 0], [600, 185, 0], [540, 205, 0], [470, 190, 0], [400, 215, 0],
    [330, 230, 0], [260, 205, 0], [190, 215, 0], [120, 250, 0], [60, 235, 0], [10, 185, 0], [-35, 120, 0], [-40, 55, 0], [-25, 15, 0],
  ];
  // ===================================================================== 2 CASTLE CIRCUIT
  const CC_PTS = (function () {
    const a = [[0, 0, 0, 12], [100, 0, 0], [200, 5, 0], [280, 30, 0], [330, 80, 0], [345, 150, 0], [320, 215, 0], [270, 262, 0], [225, 272, 0, 11]];
    for (let x = 190; x >= 40; x -= 30) a.push([x, 272 + 26 * Math.sin(((220 - x) / 180) * PI * 2), 0, 9.5]);
    a.push([5, 262, 0, 11], [-45, 215, 0], [-68, 145, 0], [-70, 75, 0], [-48, 20, 0]);
    return a;
  })();
  // ===================================================================== 3 DAYDREAM CRUISER
  const DC_PTS = (function () {
    const R = 70, Y = 8.5, a = [];
    a.push([60, -R, Y, 12], [130, -R + 8, Y], [200, -R - 4, Y], [270, -R, Y], [340, -R, Y]);
    arc(400, 0, R, -PI / 2, PI / 2, 6, Y).forEach((p, i) => { if (i > 0 && i < 6) a.push(p); });
    a.push([400, R, Y]);
    a.push([345, R, 4.3], [290, R, 0.2], [235, R, 0], [180, R, 0], [125, R, 0.2], [70, R, 4.3], [10, R, Y]);
    arc(-20, 0, R, PI / 2, PI * 1.5, 6, Y).forEach((p, i) => { if (i > 0 && i < 6) a.push(p); });
    a.push([-5, -R, Y]);
    return a;
  })();
  // ===================================================================== 4 MUDSLIDE STADIUM
  const MS_PTS = (function () {
    const a = [], hw = 11;
    const hill = (x0, z, dir, h) => [[x0, z, 0.3], [x0 + dir * 30, z, h * 0.3], [x0 + dir * 55, z, h * 0.9], [x0 + dir * 68, z, h], [x0 + dir * 100, z, 0.4]];
    const part = (arr) => arr.forEach((p) => a.push(p));
    a.push([0, 0, 0, hw], [60, 0, 0]);
    part(hill(90, 0, 1, 3.2));
    arc(220, 40, 40, -PI / 2, PI / 2, 4, 0).slice(0, 4).forEach((p, i) => { if (i > 0) a.push(p); });
    a.push([220, 80, 0], [190, 80, 0]);
    part(hill(170, 80, -1, 3));
    a.push([60, 80, 0]);
    arc(40, 120, 40, -PI / 2, -3 * PI / 2, 4, 0).forEach((p, i) => { if (i > 0 && i < 4) a.push(p); });
    a.push([40, 160, 0], [70, 160, 0.3]);
    part(hill(100, 160, 1, 4.1));
    arc(220, 200, 40, -PI / 2, PI / 2, 4, 0).forEach((p, i) => { if (i > 0 && i < 4) a.push(p); });
    a.push([220, 240, 0], [140, 240, 0], [60, 240, 0], [-10, 240, 0], [-60, 215, 0], [-90, 160, 0], [-92, 90, 0], [-70, 30, 0]);
    return a;
  })();


  // ===================================================================== 1 BAYSIDE BRIDGE decor
  const BB_BAY = [[-1500, -1500], [2600, -1500], [2600, -60], [540, -60], [540, 125], [225, 125], [225, -130], [-1500, -130]];
  const inBay = (x, z) => (x > 225 && x < 540 && z < 125 && z > -1500) || (x >= 540 && z < -60) || (z < -130);
  function bbDecorate(track, kit) {
    const c = kit.col, rng = kit.rng, L = kit.length, ds = kit.ds, N = kit.N, gy = kit.groundY;
    const b = new kit.Batch(), lamps = new kit.Batch(), fb = new kit.Batch(), bec = new kit.Batch();
    const hwT = 12 + 5;                                   // road half width + shoulder
    // ---- sea
    const sea = waterPoly(kit, BB_BAY, null, gy + 0.25, 0x1f7fc0, 0.93);
    track._fl = { sea, boats: [] };
    // quays / sea walls and beach
    const qc = c(0xb9bfc6), qc2 = c(0x9aa2ab);
    const wallSeg = (x0, z0, x1, z1) => {
      const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 8);
      for (let i = 0; i < n; i++) {
        const a = i / n, z = (i + 1) / n;
        const ax = x0 + (x1 - x0) * a, az = z0 + (z1 - z0) * a, bx = x0 + (x1 - x0) * z, bz = z0 + (z1 - z0) * z;
        b.quad([ax, gy + 0.9, az], [bx, gy + 0.9, bz], [bx, gy - 0.5, bz], [ax, gy - 0.5, az], i & 1 ? qc : qc2);
      }
    };
    b.box(0, 0, 0, 0.01, 0.01, 0.01, 0, qc);
    // west quay of the bay and the north shore (thick walls)
    for (let z = -130; z < 125; z += 12) b.box(225 - 1.5, gy - 0.5, z + 6, 3, 2.1, 12, 0, (z / 12) & 1 ? qc : qc2);
    for (let x = -400; x < 225; x += 12) b.box(x + 6, gy - 0.5, -130 + 1.5, 12, 2.1, 3, 0, (x / 12) & 1 ? qc : qc2);
    // beach along the south of the bay
    b.quad([225, gy + 0.06, 125], [540, gy + 0.06, 125], [540, gy + 0.06, 150], [225, gy + 0.06, 150], c(0xe8d9a8));
    b.quad([225, gy + 0.07, 120], [540, gy + 0.07, 120], [540, gy + 0.07, 128], [225, gy + 0.07, 128], c(0xf6efd0));
    b.quad([540, gy + 0.06, -60], [560, gy + 0.06, -60], [560, gy + 0.06, 125], [540, gy + 0.06, 125], c(0xe8d9a8));

    // ---- bridge structure
    const high = scanD(kit, 0, L * 0.5, (i) => kit.py[i] > 8.6);
    const rng0 = scanD(kit, 0, L * 0.5, (i) => kit.py[i] > 1.5);
    const dT1 = high[0] + 14, dT2 = high[1] - 14;
    const steel = c(0xd9573a), steel2 = c(0xb8452c), cable = c(0xf1ece0), concrete = c(0xa9b1ba);
    const yAtD = (d) => kit.py[Math.min(N - 1, Math.max(0, Math.round(d / ds)))];
    // deck girders
    for (let s = -1; s <= 1; s += 2) {
      vwall(kit, b, rng0[0], rng0[1], 4, s * (hwT + 0.6), -2.4, 0.9, steel, steel2);
      strip(kit, b, rng0[0], rng0[1], 4, s * (hwT + 0.6), s * (hwT + 1.6), 0.9, 0.9, steel2);
    }
    strip(kit, b, rng0[0], rng0[1], 4, -hwT - 0.6, hwT + 0.6, -2.4, -2.4, c(0x6c747d));
    // piers (over water, outside the tower zones)
    for (let d = rng0[0] + 20; d < rng0[1]; d += 34) {
      const f = kit.frame(d);
      if (!inBay(f.x, f.z) || Math.abs(d - dT1) < 22 || Math.abs(d - dT2) < 22) continue;
      const h = f.y - gy + 0.5, hd = Math.atan2(f.tx, f.tz);
      b.box(f.x, gy - 1, f.z, 2 * hwT + 1, h + 1 - 2.4, 4.5, hd, concrete);
      b.box(f.x, f.y - 3.6, f.z, 2 * hwT + 3, 1.2, 6.5, hd, mulK(concrete, 0.85));
    }
    // towers
    const towerTop = 44;
    [dT1, dT2].forEach((dT) => {
      const f = kit.frame(dT), hd = Math.atan2(f.tx, f.tz), base = gy - 1.5;
      for (let s = -1; s <= 1; s += 2) {
        const p = kit.at(dT, s * (hwT + 2.4), 0);
        b.box(p[0], base, p[2], 4.2, f.y - base + towerTop, 4.6, hd, steel);
        b.box(p[0], f.y + towerTop, p[2], 5.0, 1.0, 5.4, hd, steel2);
      }
      for (const hh of [towerTop, towerTop * 0.55, 8]) {
        const p = kit.at(dT, 0, hh - 1.4);
        b.box(p[0], p[1], p[2], 2 * (hwT + 2.4) + 3, 2.6, 3.4, hd, steel2);
      }
      const q = kit.at(dT, 0, towerTop + 1.2);
      bec.box(q[0] - 1, q[1], q[2] - 1, 2, 2, 2, 0, c(0xff5040));
      for (let s = -1; s <= 1; s += 2) { const tp = kit.at(dT, s * (hwT + 2.4), towerTop + 1.6); kit.flag(tp[0], tp[1], tp[2], 7, 3.6, Math.atan2(f.tx, f.tz) - Math.PI / 2, s < 0 ? [0xd9482b, 0xf6f2ea] : [0x2f78d0, 0xf6f2ea], { pole: 6 }); }
      // pier base
      b.box(f.x, base, f.z, 2 * hwT + 7, 5.5, 9, hd, concrete);
    });
    // main cables + hangers
    const cableY = (d, sl) => {
      // piecewise: backspan (anchor -> t1), main (t1 -> t2), frontspan (t2 -> anchor)
      const a1 = dT1 - 80, a2 = dT2 + 80;
      const topY1 = yAtD(dT1) + towerTop - 1.2, topY2 = yAtD(dT2) + towerTop - 1.2;
      if (d <= dT1) { const u = (d - a1) / (dT1 - a1); return yAtD(a1) + 1.4 + (topY1 - yAtD(a1) - 1.4) * Math.pow(Math.max(0, u), 1.6); }
      if (d >= dT2) { const u = (a2 - d) / (a2 - dT2); return yAtD(a2) + 1.4 + (topY2 - yAtD(a2) - 1.4) * Math.pow(Math.max(0, u), 1.6); }
      const u = (d - dT1) / (dT2 - dT1), mid = yAtD((dT1 + dT2) / 2) + 6;
      const yEnd = (a) => a; // parabola through the two tops and the mid dip
      const t0 = topY1, t1 = topY2;
      const base = t0 + (t1 - t0) * u, sag = (base - mid) * 4 * u * (1 - u) * 1.0;
      return base - sag;
    };
    for (let s = -1; s <= 1; s += 2) {
      const lat = s * (hwT + 2.4);
      let prev = null;
      for (let d = dT1 - 80; d <= dT2 + 80; d += 8) {
        const y = cableY(d), f = kit.frame(d);
        const p = [f.x + f.rx * lat, y, f.z + f.rz * lat];
        if (prev) rod(b, prev, p, 0.32, cable);
        prev = p;
        if (((d - (dT1 - 80)) % 16) < 0.01 && d > dT1 - 70 && d < dT2 + 70 && !(Math.abs(d - dT1) < 6 || Math.abs(d - dT2) < 6)) {
          rod(b, p, [p[0], f.y + 0.9, p[2]], 0.08, cable);
        }
      }
      // backstays to the ground
    }
    // street lamps on the bridge and along the city
    for (let d = 20; d < L - 10; d += 30) {
      const f = kit.frame(d), s = ((d / 30) | 0) & 1 ? 1 : -1;
      if (f.x > 240 && f.x < 520 && f.z < 60 && f.y > 1) { // on the bridge: lamps outside the girder
        const p = kit.at(d, s * (hwT + 1.2), 0);
        b.box(p[0], p[1], p[2], 0.25, 5.2, 0.25, 0, c(0xe8e8e8)); lamps.box(p[0] - 0.4, p[1] + 5.2, p[2] - 0.4, 0.8, 0.35, 0.8, 0, c(0xfff3b8));
      } else if (kit.py[Math.round(d / ds)] < 1.2) {
        const p = kit.at(d, s * (hwT + 1.0), 0);
        if (!kit.clear(p[0], p[2], 0)) { /* ok */ }
        b.box(p[0], p[1], p[2], 0.25, 5.6, 0.25, 0, c(0x3a4048));
        lamps.box(p[0] - 0.5, p[1] + 5.5, p[2] - 0.5, 1.0, 0.4, 1.0, 0, c(0xfff3b8));
      }
    }

    // ---- tunnel through a headland on the south shore
    const ret = scanD(kit, L * 0.5, L, (i) => kit.px[i] < 345);
    const tD0 = ret[0], tD1 = tD0 + 120;
    track._tun = [tD0, tD1];
    tunnel(kit, b, lamps, tD0, tD1, { w: 17.4, h: 8.5, stone: 0x8f8a80, inner: 0x4d4a47, ceil: 0x3a3836, hill: 0x4c9a45 });
    // trees on the headland
    for (let k = 0; k < 40; k++) {
      const d = tD0 + rng() * 120, l = (rng() < 0.5 ? -1 : 1) * (3 + rng() * 12), p = kit.at(d, l, 0);
      b.blob(p[0], p[1] + 12.8 + rng() * 1.5, p[2], 3 + rng() * 2, 2 + rng(), 3 + rng() * 2, c(0x3e9a44), 0);
    }

    // ---- skyline across the bay + city blocks
    const bodyC = [0xcfd6de, 0xb6c3d1, 0xe7dccb, 0xaab4c2, 0xd9c7b0, 0x9fb1c6, 0xe3e6ea];
    const roofC = c(0x6b7580), glassC = c(0x4b6f93), glassD = c(0x2f4c6c);
    kit.scatter(150, 4, 90, 30, (x, z, i, r) => {
      if (inBay(x, z) || (x > 200 && x < 560 && z > 100 && z < 160)) return;
      if (x > 215 && x < 560 && z > 85) { tree(fb, c, x, gy, z, 0.9 + r() * 0.8, r, 'round'); return; }
    });
    kit.scatter(90, 2, 60, 24, (x, z, i, r) => { if (!inBay(x, z)) tree(fb, c, x, gy, z, 0.8 + r() * 0.7, r, r() < 0.3 ? 'pine' : 'round'); });
    // cargo cranes + containers on the west quay
    for (let k = 0; k < 2; k++) {
      const z = -75 + k * 120, x = 205;
      b.box(x, gy, z, 3, 30, 3, 0, c(0xe9a21c)); b.box(x - 22, gy + 30, z - 1.5, 52, 2.2, 3, 0, c(0xe9a21c)); b.box(x - 6, gy + 18, z, 14, 12, 8, 0, c(0x4a5560));
      for (let q = 0; q < 6; q++) b.box(x - 22 - (q % 3) * 7, gy + Math.floor(q / 3) * 2.6, z + 12, 6.4, 2.6, 2.6, 0, c([0xd9482b, 0x2f78d0, 0xf2c230, 0x3fae5c][q % 4]));
    }
    // lighthouse on a rocky islet
    {
      const x = 380, z = -250;
      b.blob(x, gy - 1, z, 34, 6, 30, c(0x8e8a84), 1); b.blob(x + 10, gy, z + 6, 16, 5, 14, c(0x7d7a74), 1);
      for (let k = 0; k < 5; k++) b.frustum(x, gy + 3 + k * 6, z, 4.2 - k * 0.35, 3.85 - k * 0.35, 6, 10, k & 1 ? c(0xd9482b) : c(0xf6f2ea), 0);
      b.frustum(x, gy + 33, z, 4.6, 4.6, 0.8, 10, c(0x333a42), 0); lamps.blob(x, gy + 35.5, z, 2.2, 2.2, 2.2, c(0xffe58a), 1);
      b.frustum(x, gy + 36.6, z, 3.3, 0, 3, 10, c(0xd9482b), 0);
      kit.lightBeam({ x, y: gy + 35.5, z, len: 130, width: 9, speed: 0.6, tilt: 0.04, count: 2, color: 0xfff0b0 });
    }
    // sailboats
    for (let k = 0; k < 9; k++) {
      const x = 270 + rng() * 250, z = -90 - rng() * 400, s = 0.8 + rng() * 0.7, hd = rng() * 6.28;
      if (Math.abs(z) < 55 && x > 200) continue;
      const bb = new kit.Batch(), hullC = [0xf2f2f2, 0xd9482b, 0x2f78d0, 0xf2c230][k & 3], sailC = c([0xffffff, 0xfff3d0, 0xffe0e0][k % 3]);
      bb.box(0, 0, 0, 2.4 * s, 1.0 * s, 8 * s, 0, c(hullC)); bb.box(0, 1.0 * s, 0, 1.2 * s, 0.5 * s, 3 * s, 0, c(0x7a5a3a));
      bb.box(0, 0.5 * s, 0.4 * s, 0.2, 9 * s, 0.2, 0, c(0xdddddd));
      bb.tri([0, 1.5 * s, 0.5 * s], [0, 9 * s, 0.3 * s], [0, 1.5 * s, -3.4 * s], sailC); bb.tri([0, 1.5 * s, 0.5 * s], [0, 1.5 * s, -3.4 * s], [0, 9 * s, 0.3 * s], sailC);
      bb.tri([0, 1.5 * s, 0.9 * s], [0, 8 * s, 0.9 * s], [0, 1.5 * s, 3.8 * s], sailC); bb.tri([0, 1.5 * s, 0.9 * s], [0, 1.5 * s, 3.8 * s], [0, 8 * s, 0.9 * s], sailC);
      const m = mk(kit, bb); m.position.set(x, gy + 0.2, z); m.rotation.y = hd; kit.add(m); track._fl.boats.push({ m, ph: k * 1.3, y0: gy + 0.2 });
    }
    // a ferry-boat docked at the beach
    {
      const bb = new kit.Batch();
      bb.box(0, 0, 0, 9, 3, 26, 0, c(0xf4f0e6)); bb.box(0, 3, -2, 8, 3, 16, 0, c(0x2f78d0)); bb.box(0, 3.1, 0, 8.2, 1.2, 12, 0, c(0xcfe6f7)); bb.box(0, 6, 0, 7, 2.2, 8, 0, c(0xf4f0e6));
      bb.frustum(0, 8.2, -3, 1.6, 1.4, 3.2, 8, c(0xd9482b), 0);
      const m = mk(kit, bb); m.position.set(420, gy + 0.2, 100); m.rotation.y = 0.1; kit.add(m);
      kit.bob(m, 0.1, 0.8, 0.5, 0.012);
      kit.particles({ x: 420, y: gy + 12.6, z: 97, count: 18, vel: [1.2, 3.2, 0.2], spread: [0.4, 0.6, 0.4], life: 4, size: 2.6, grow: 2.5, alpha: 0.55, pow: 1.2, wob: 0.8, color: [0xe8e8ee, 0xd0d0d8] });   // funnel smoke
    }
    // far hills and sun glow on the horizon
    kit.farScatter(16, 160, (x, z, r) => {
      if (inBay(x, z) && z > -600) return;
      const s = 30 + r() * 40; b.blob(x, gy - 4, z, s * 1.5, s * 0.6, s, c(0x6fae6a), 1);
    });
    kit.mesh(b); kit.mesh(lamps, {}, true); kit.foliage(fb);
    { const bm = kit.mesh(bec, {}, true); if (bm) kit.blinker(bm.material, 1.5, { duty: 0.3, lo: 0.08 }); }   // tower warning lights
    kit.crowdStand({ d0: L - 60, d1: L + 80, side: -1, l0: hwT + 3, rows: 2, gap: 1.3, rise: 0, step: 2.2, radius: 55 });
    kit.crowdStand({ d0: L - 60, d1: L + 80, side: 1, l0: hwT + 3, rows: 2, gap: 1.3, rise: 0, step: 2.2, radius: 55 });
    kit.birds({ cx: 400, cz: -120, y: 42, radius: 140, count: 9, speed: 0.1, size: 1.3 });
    kit.birds({ cx: 330, cz: -260, y: 30, radius: 80, count: 6, speed: -0.14 });
    kit.grassTufts(220, 0.4, 14, { flowers: 0.25 });
    bbBeauty(track, kit);
  }
  function bbHazards(track, kit) {
    const L = kit.length, T = track._tun || [0, 0];
    const specs = [];
    // same-direction lanes (+3.8, +8.6) and oncoming lanes (-3.8, -8.6)
    const kinds = ['c1', 'c2', 'c3', 'c4', 't1', 't2'];
    let k = 0;
    const put = (lane, dir, speed, ds) => ds.forEach((d) => { specs.push({ t: kinds[k++ % 6], lane, dir, speed, d: (d + L) % L }); });
    put(3.8, 1, 12, [220, 780, 1290]);
    put(8.6, 1, 14.5, [420, 1010]);
    put(-3.8, -1, 16, [140, 620, 1100]);
    put(-8.6, -1, 18, [330, 900, 1350]);
    return makeTraffic(track, kit, specs);
  }
  function bbUpdate(track, dt, time) {
    const f = track._fl; if (!f) return;
    f.sea.position.y = track.groundY + 0.25 + Math.sin(time * 0.9) * 0.05;
    for (const bt of f.boats) { bt.m.position.y = bt.y0 + Math.sin(time * 0.8 + bt.ph) * 0.12; bt.m.rotation.z = Math.sin(time * 0.7 + bt.ph) * 0.04; }
  }

  // ===================================================================== 2 CASTLE CIRCUIT decor
  function roundTower(b, c, x, y0, z, r, h, stoneC, roofC, roofH) {
    b.frustum(x, y0, z, r, r * 0.92, h, 14, stoneC, 0);
    b.frustum(x, y0 + h, z, r * 1.2, r * 1.2, 1.0, 14, mulK(stoneC, 0.85), 0);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * PI * 2; b.box(x + Math.cos(a) * r * 1.1, y0 + h + 1, z + Math.sin(a) * r * 1.1, 1.2, 1.0, 1.2, 0, stoneC); }
    b.frustum(x, y0 + h + 1.0, z, r * 1.15, 0, roofH, 14, roofC, 0);
    b.box(x - 0.1, y0 + h + 1 + roofH, z - 0.1, 0.2, 3.2, 0.2, 0, c(0xe8e0d0));
    roundTower.flags.push([x, y0 + h + 1 + roofH + 3.4, z, roofC]);   // waving pennant added by the course (kit.flag)
  }
  roundTower.flags = [];
  function crenel(kit, b, d0, d1, l, y, h, stoneC, step) {
    for (let d = d0; d < d1; d += step) {
      const p = kit.at(d, l, y), f = kit.frame(d);
      b.box(p[0], p[1], p[2], 1.4, 1.1, 1.6, Math.atan2(f.tx, f.tz), stoneC);
    }
  }
  function ccDecorate(track, kit) {
    const c = kit.col, rng = kit.rng, L = kit.length, ds = kit.ds, gy = kit.groundY;
    const b = new kit.Batch(), lamps = new kit.Batch(), fb = new kit.Batch();
    roundTower.flags.length = 0;
    const stone = c(0xd3cab6), stone2 = c(0xb7ad98), dark = c(0x8a8070), red = c(0xb23a3e), blue = c(0x3a58b0), gold = c(0xe8b830);
    const hwT = 17;
    const G0 = 92, G1 = 226, WL = 40;               // courtyard: gatehouse distances, wall lateral
    // --- castle: gatehouses
    [G0, G1].forEach((dg, gi) => {
      const f = kit.frame(dg), hd = Math.atan2(f.tx, f.tz);
      for (let s = -1; s <= 1; s += 2) {
        const p = kit.at(dg, s * (hwT + 5), 0);
        roundTower(b, c, p[0], p[1] - 0.5, p[2], 6, 24, stone, gi ? blue : red, 11);
        const q = kit.at(dg, s * (hwT + 5), 0); b.box(q[0], q[1] + 8, q[2], 0.3, 2.2, 0.3, 0, dark);
      }
      const p = kit.at(dg, 0, 13.5);
      b.box(p[0], p[1], p[2], 2 * (hwT + 5) + 2, 7.5, 7, hd, stone);
      const q = kit.at(dg, 0, 21);
      b.box(q[0], q[1], q[2], 2 * (hwT + 5) + 4, 1.0, 8, hd, stone2);
      for (let l = -hwT - 6; l <= hwT + 6; l += 3.4) { const r = kit.at(dg, l, 22); b.box(r[0], r[1], r[2], 1.8, 1.3, 1.8, hd, stone); }
      for (let l = -hwT + 2; l <= hwT - 2; l += 3) { const r = kit.at(dg, l, 10.6); b.box(r[0], r[1], r[2], 0.35, 2.9, 0.35, hd, dark); }
      const pr = kit.at(dg, 0, 10.5); b.box(pr[0], pr[1], pr[2], 2 * hwT - 3, 0.3, 0.5, hd, dark);
      // crest above the arch
      const cr = kit.at(dg + (gi ? 3.6 : -3.6), 0, 15.3);
      b.frustum(cr[0], cr[1], cr[2], 2.6, 0, 0.1, 10, gold, 0);
      for (let k = 0; k < 8; k++) { const a = (k / 8) * PI * 2; b.tri([cr[0], cr[1] + 0.6, cr[2]], [cr[0] + Math.cos(a) * 3.2 * f.rx, cr[1] + 0.6 + Math.sin(a) * 3.2, cr[2] + Math.cos(a) * 3.2 * f.rz], [cr[0] + Math.cos(a + 0.35) * 3.2 * f.rx, cr[1] + 0.6 + Math.sin(a + 0.35) * 3.2, cr[2] + Math.cos(a + 0.35) * 3.2 * f.rz], gold); }
    });
    // --- courtyard walls
    for (let s = -1; s <= 1; s += 2) {
      vwall(kit, b, G0, G1, 6, s * WL, 0, 11, stone, stone2);
      strip(kit, b, G0, G1, 6, s * WL, s * (WL + 2.4), 11, 11, stone2);
      vwall(kit, b, G0, G1, 6, s * (WL + 2.4), 11, 0, stone2, dark);
      crenel(kit, b, G0 + 2, G1, s * (WL + 0.6), 11, 1.1, stone, 4);
      crenel(kit, b, G0 + 2, G1, s * (WL + 1.8), 11, 1.1, stone, 4);
      for (const dd of [G0 + 2, (G0 + G1) / 2, G1 - 2]) {
        const p = kit.at(dd, s * (WL + 1.2), -0.5);
        roundTower(b, c, p[0], p[1], p[2], 5.2, 17, stone, ((dd | 0) & 1) ? red : blue, 9);
      }
    }
    // keep + great hall behind the north wall (left side, negative lateral)
    {
      const dm = (G0 + G1) / 2, f = kit.frame(dm), hd = Math.atan2(f.tx, f.tz);
      const hall = kit.at(dm, -(WL + 24), 0);
      b.box(hall[0], hall[1] - 0.5, hall[2], 30, 20, 76, hd, stone);
      for (let k = 0; k < 6; k++) for (let r = 0; r < 2; r++) { const w = kit.at(dm - 30 + k * 12, -(WL + 8.6), 8 + r * 6); b.box(w[0], w[1], w[2], 1.4, 3.2, 3.0, hd, c(0x3d5f8a)); }
      const roofP = kit.at(dm, -(WL + 24), 19.5); b.box(roofP[0], roofP[1], roofP[2], 32, 1.0, 78, hd, red);
      const ridge = kit.at(dm, -(WL + 24), 20.5); b.box(ridge[0], ridge[1], ridge[2], 20, 3.0, 76, hd, mulK(red, 0.9));
      const keep = kit.at(dm, -(WL + 28), 0);
      b.box(keep[0], keep[1] - 0.5, keep[2], 24, 52, 24, hd, stone);
      b.box(keep[0], keep[1] + 52, keep[2], 28, 2.2, 28, hd, stone2);
      for (let a = 0; a < 16; a++) { const l = -12 + a * 1.6; b.box(keep[0] + f.tx * -13.4 + f.rx * l * 1.0, keep[1] + 54.2, keep[2] + f.tz * -13.4 + f.rz * l, 1.4, 1.4, 1.4, hd, stone); b.box(keep[0] + f.tx * 13.4 + f.rx * l, keep[1] + 54.2, keep[2] + f.tz * 13.4 + f.rz * l, 1.4, 1.4, 1.4, hd, stone); }
      for (let k = 0; k < 3; k++) { const w = kit.at(dm, -(WL + 28 - 12.1) , 12 + k * 12); b.box(w[0], w[1], w[2], 0.6, 5, 3, hd, c(0x3d5f8a)); }
      // keep roof + flags
      b.frustum(keep[0], keep[1] + 54.4, keep[2], 19, 0, 18, 4, blue, PI / 4);
      for (let k = 0; k < 4; k++) {
        const sx = k & 1 ? 1 : -1, sz = k & 2 ? 1 : -1;
        const t = [keep[0] + f.tx * sz * 15 + f.rx * sx * 15, keep[1], keep[2] + f.tz * sz * 15 + f.rz * sx * 15];
        roundTower(b, c, t[0], t[1] - 0.5, t[2], 5, 44, stone, red, 12);
      }
      // main flag
      const fp = [keep[0], keep[1] + 72, keep[2]];
      rod(b, fp, [fp[0], fp[1] + 9, fp[2]], 0.18, c(0xe8e0d0));
      kit.flag(fp[0], fp[1] + 9, fp[2], 10, 4.4, hd - PI / 2, [0xe8b830, 0xb23a3e], { pole: 0.01, pattern: 'stripes' });
    }
    // courtyard: flower beds, trees, banners, fountain
    const beds = [c(0xff5a6a), c(0xffe14a), c(0xff9ae0), c(0xffffff)];
    for (let d = G0 + 14; d < G1 - 10; d += 14) for (let s = -1; s <= 1; s += 2) {
      const p = kit.at(d + (s > 0 ? 7 : 0), s * (hwT + 9), 0);
      b.box(p[0], p[1], p[2], 7, 0.6, 3.2, Math.atan2(kit.frame(d).tx, kit.frame(d).tz), c(0x4f9a3a));
      for (let k = 0; k < 6; k++) b.blob(p[0] + (rng() - 0.5) * 5, p[1] + 0.9, p[2] + (rng() - 0.5) * 2, 0.5, 0.4, 0.5, beds[(rng() * 4) | 0], 0);
      if (((d / 14) | 0) % 3 === 0) { const q = kit.at(d, s * (hwT + 17), 0); tree(fb, c, q[0], q[1], q[2], 1.2, rng, 'round'); }
    }
    {
      const p = kit.at((G0 + G1) / 2 + 22, hwT + 17, 0);
      b.frustum(p[0], p[1], p[2], 6, 6, 1.0, 14, stone, 0); b.frustum(p[0], p[1] + 1.0, p[2], 4, 3.4, 0.6, 14, c(0x3aa7e0), 0);
      b.frustum(p[0], p[1], p[2], 1.2, 0.9, 5, 8, stone2, 0); b.blob(p[0], p[1] + 5.6, p[2], 2.2, 0.6, 2.2, c(0x7ccdf0), 0);
      kit.particles({ x: p[0], y: p[1] + 5.8, z: p[2], count: 40, vel: [0, 8, 0], spread: [1.7, 2, 1.7], life: 1.4, grav: -14, size: 0.5, alpha: 0.9, pow: 0.5, color: [0xcdf4ff, 0xffffff, 0x9fe6ff] });
    }
    for (let d = 30; d < L - 30; d += 52) {
      if (d > G0 - 12 && d < G1 + 12) continue;
      const s = ((d / 52) | 0) & 1 ? 1 : -1;
      kit.flagAt(d, s * (hwT + 0.8), 3.4, 1.8, (d / 52 | 0) % 2 ? [0xb23a3e, 0xe8b830] : [0x3a58b0, 0xffffff], { pole: 7 });
    }

    // --- tunnel under a grassy ruin hill + dash panels before it
    const tD0 = 945, tD1 = 1055;
    tunnel(kit, b, lamps, tD0, tD1, { w: 17.4, h: 8.5, stone: 0xb7ad98, inner: 0x5a5448, ceil: 0x423e36, hill: 0x58a846 });
    { const p = kit.at((tD0 + tD1) / 2, 0, 10.5); roundTower(b, c, p[0], p[1], p[2], 5.5, 14, stone2, blue, 8); b.box(p[0] + 9, p[1], p[2] + 3, 3, 6, 3, 0.4, stone2); }

    // --- lake with an island (largest open area in the loop)
    const cs = [{ x: kit.at((G0 + G1) / 2, -(WL + 30), 0)[0], z: kit.at((G0 + G1) / 2, -(WL + 30), 0)[2], r: 70 }];
    const spot = openSpot(kit, 40, cs);
    if (spot) {
      const R = Math.min(62, spot.clear - 26);
      kit.reserve(spot.x, spot.z, R + 8);
      const lake = discMesh(kit, spot.x, spot.z, R, gy + 0.12, 0x34a4de, 0.9);
      track._fl = { lake, R };
      const ib = new kit.Batch();
      ib.frustum(spot.x + R * 0.12, gy - 0.5, spot.z, R * 0.34, R * 0.2, 3.2, 18, c(0xd8cf93), 0);
      ib.frustum(spot.x + R * 0.12, gy + 2.7, spot.z, R * 0.2, R * 0.12, 3, 14, c(0x5fb04c), 0);
      const ix = spot.x + R * 0.12, iz = spot.z;
      // gazebo
      for (let k = 0; k < 6; k++) { const a = (k / 6) * PI * 2; ib.frustum(ix + Math.cos(a) * 4, gy + 5.6, iz + Math.sin(a) * 4, 0.35, 0.3, 4, 6, stone, 0); }
      ib.frustum(ix, gy + 5.5, iz, 5, 5, 0.4, 12, stone2, 0); ib.frustum(ix, gy + 9.6, iz, 5.6, 0, 3.6, 12, red, 0);
      for (let k = 0; k < 7; k++) { const a = rng() * PI * 2, rr = R * 0.12 + rng() * R * 0.1; tree(ib, c, ix + Math.cos(a) * rr + 6, gy + 5.6, iz + Math.sin(a) * rr, 0.9 + rng() * 0.5, rng, 'round'); }
      ib.box(ix - 8, gy + 5.6, iz + 6, 2, 0.5, 6, 0.3, c(0x8a5a2b));
      kit.mesh(ib);
      for (let a = 0; a < 30; a++) {
        const an = (a / 30) * PI * 2, rr = R + 1 + rng() * 2;
        b.blob(spot.x + Math.cos(an) * rr, gy, spot.z + Math.sin(an) * rr, 2.4 + rng() * 2, 0.7, 2.4 + rng() * 2, c(0xd8cf93), 0);
        if (rng() < 0.5) b.frustum(spot.x + Math.cos(an) * (rr - 1), gy, spot.z + Math.sin(an) * (rr - 1), 0.25, 0, 2.2, 4, c(0x3f8f3a), 0);
      }
      // little rowing boats
      const rbt = new kit.Batch(); rbt.box(0, 0, 0, 1.6, 0.7, 4, 0, c(0x8a5a2b)); rbt.box(0, 0.5, 0, 1.2, 0.15, 3.2, 0, c(0xd9a066));
      const rbg = kit.trackGeom(rbt.build());
      for (let k = 0; k < 2; k++) { const an = k * 2.6 + 0.8, m = new THREE.Mesh(rbg, kit.mat({})); m.position.set(spot.x + Math.cos(an) * R * 0.62, gy + 0.2, spot.z + Math.sin(an) * R * 0.62); m.rotation.y = an; kit.add(m); kit.bob(m, 0.08, 1.2, k * 2, 0.05); }
      // windmill on the shore
      const wxm = spot.x + R + 12, wzm = spot.z;
      if (kit.clear(wxm, wzm, 6)) {
        b.frustum(wxm, gy, wzm, 3.6, 2.4, 11, 8, c(0xe9dcc0), 0); b.frustum(wxm, gy + 11, wzm, 3.2, 0, 3.4, 8, red, 0);
        const bl = new kit.Batch();
        for (let k = 0; k < 4; k++) { const a = (k / 4) * PI * 2; bl.quad([0, 0, 0], [Math.cos(a) * 9 - Math.sin(a) * 0.9, Math.sin(a) * 9 + Math.cos(a) * 0.9, 0], [Math.cos(a) * 9 + Math.sin(a) * 0.9, Math.sin(a) * 9 - Math.cos(a) * 0.9, 0], [Math.cos(a) * 1.2, Math.sin(a) * 1.2, 0], k & 1 ? c(0xf6f2ea) : c(0xe0483c)); bl.quad([Math.cos(a) * 3, Math.sin(a) * 3, 0.05], [Math.cos(a) * 9 - Math.sin(a) * 2.2, Math.sin(a) * 9 + Math.cos(a) * 2.2, 0.05], [Math.cos(a) * 9 - Math.sin(a) * 0.9, Math.sin(a) * 9 + Math.cos(a) * 0.9, 0.05], [Math.cos(a) * 3 - Math.sin(a) * 0.3, Math.sin(a) * 3 + Math.cos(a) * 0.3, 0.05], c(0xf6f2ea)); }
        bl.blob(0, 0, 0.3, 0.9, 0.9, 0.9, c(0x6a4a2a), 0);
        kit.spinBatch(bl, { x: wxm - 3.6, y: gy + 10, z: wzm, ry: -PI / 2, axis: 'z', speed: 0.9 });
      }
    }

    // --- scenery
    const m0 = 32;
    kit.scatter(240, 2, 80, m0, (x, z, i, r) => tree(fb, c, x, gy, z, 0.9 + r() * 0.9, r, r() < 0.35 ? 'pine' : 'round'));
    kit.scatter(120, 1, 50, m0 - 4, (x, z, i, r) => b.blob(x, gy + 0.5, z, 1.2 + r(), 0.9 + r() * 0.5, 1.2 + r(), c(0x3f9f45), 0));
    kit.grassTufts(600, 0.4, 24, { flowers: 0.4, scale: [0.9, 1.7] });
    kit.scatter(18, 6, 50, m0, (x, z, i, r) => { const s = 1 + r() * 0.8; b.frustum(x, gy, z, 0.6 * s, 0.5 * s, 1.6 * s, 6, c(0xf2ecd8), 0); b.blob(x, gy + 1.6 * s, z, 1.9 * s, 1.1 * s, 1.9 * s, c(0xe0483c), 1); b.blob(x - 0.7 * s, gy + 2.2 * s, z + 0.5 * s, 0.4, 0.2, 0.4, c(0xffffff), 0); });
    kit.farScatter(26, 100, (x, z, r) => { const s = 25 + r() * 35; b.blob(x, gy - 4, z, s * 1.3, s * 0.55, s, mix3(c(0x69b848), c(0x4f9a3a), r()), 1); });
    kit.mesh(b); kit.mesh(lamps, {}, true); kit.foliage(fb);
    // waving pennants on every tower, torches at the gatehouses, cheering courtyard crowd, birds
    roundTower.flags.forEach((t, i) => kit.flag(t[0], t[1], t[2], 3.2, 1.7, (i * 1.9) % 6.28, i & 1 ? [0xf2c230, 0xb23a3e] : [0x3a58b0, 0xf2c230], { pole: 0.01 }));
    [G0, G1].forEach((dg) => { const em = []; for (let s = -1; s <= 1; s += 2) for (let k = 0; k < 2; k++) { const q = kit.at(dg + (k ? 4 : -4), s * (hwT - 1.2), 4.4); em.push([q[0], q[1], q[2]]); } kit.particles({ emitters: em, count: 9, vel: [0, 1.8, 0], spread: [0.25, 0.5, 0.25], life: 0.8, size: 0.9, grow: -0.5, alpha: 0.95, color: [0xffa030, 0xffd060, 0xff6a20], additive: true }); });
    kit.crowdStand({ d0: G0 + 8, d1: G1 - 8, side: -1, l0: hwT + 2.8, rows: 2, gap: 1.3, rise: 0, step: 2.3, radius: 60 });
    kit.crowdStand({ d0: G0 + 8, d1: G1 - 8, side: 1, l0: hwT + 2.8, rows: 2, gap: 1.3, rise: 0, step: 2.3, radius: 60 });
    kit.birds({ cx: 150, cz: 140, y: 52, radius: 120, count: 7, speed: 0.1 });
    ccBeauty(track, kit);
  }
  const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  function stompkinTemplate(kit) {
    const c = kit.col, b = new kit.Batch();
    b.frustum(0, 0.5, 0, 0.62, 0.55, 1.0, 10, c(0xf3e3c0), 0);
    b.blob(0, 1.9, 0, 1.55, 0.95, 1.55, c(0xd8362e), 1);
    b.blob(0.55, 2.6, 0.5, 0.4, 0.2, 0.4, c(0xffffff), 0); b.blob(-0.6, 2.5, -0.4, 0.45, 0.2, 0.45, c(0xffffff), 0); b.blob(0.1, 2.8, -0.7, 0.3, 0.15, 0.3, c(0xffffff), 0);
    b.box(-0.22, 1.05, 0.52, 0.16, 0.34, 0.1, 0, c(0x222222)); b.box(0.22, 1.05, 0.52, 0.16, 0.34, 0.1, 0, c(0x222222));
    b.box(-0.45, 0, 0.1, 0.5, 0.5, 0.9, 0, c(0x7a4a2a)); b.box(0.45, 0, 0.1, 0.5, 0.5, 0.9, 0, c(0x7a4a2a));
    b.box(0, 0.78, 0.55, 0.5, 0.08, 0.1, 0, c(0x5a2a1a));
    return mk(kit, b);
  }
  function ccHazards(track, kit) {
    const out = [], tp = stompkinTemplate(kit), f0 = newF();
    // Stompkins pacing across the road
    const groups = [[372, 3], [452, 3], [1090, 2]];
    groups.forEach(([d0, n], gi) => {
      for (let k = 0; k < n; k++) {
        const d = d0 + k * 14, ph = k * 2.1 + gi, fr = frameInto(track, d, newF());
        const A = fr.halfWidth - 2.2, w = 0.4 + 0.04 * k;
        const m = tp.clone();
        const h = {
          x: 0, y: 0, z: 0, radius: 1.5, hitKind: 'spin', vx: 0, vz: 0, active: true, object3D: m,
          update(dt, time) {
            const l = A * Math.sin(w * time + ph), vl = A * w * Math.cos(w * time + ph);
            this.x = fr.x + fr.rx * l; this.z = fr.z + fr.rz * l; this.y = fr.y + 1;
            this.vx = fr.rx * vl; this.vz = fr.rz * vl;
            const step = Math.abs(Math.sin(time * 5 + ph));
            m.position.set(this.x, fr.y + step * 0.3, this.z);
            m.rotation.set(0, Math.atan2(this.vx, this.vz), Math.sin(time * 5 + ph) * 0.12);
          },
        };
        h.update(0, 0); out.push(h);
      }
    });
    // Chompy Pots at the right-hand corner
    const pal = { pot: 0xc4622b, rim: 0xdc7a3a, stem: 0x2e8f3e, leaf: 0x2e8f3e, head: 0x3aa24a, head2: 0x2e8f3e, mouth: 0xb01c3a };
    const corner = scanD(kit, 450, 650, (i) => kit.curv[i] < -0.0085);
    const dc = corner[0] > 0 ? (corner[0] + corner[1]) / 2 : 560;
    const specs = [{ d: dc - 18, side: 1, phase: 0 }, { d: dc, side: 1, phase: 1.07 }, { d: dc + 18, side: 1, phase: 2.13 }, { d: dc - 9, side: -1, phase: 0.5 }];
    return out.concat(makeSnappers(track, kit, pal, specs, { period: 3.2, reach: 7, out: 2.6 }));
  }
  function ccUpdate(track, dt, time) {
    const f = track._fl; if (!f) return;
    f.lake.position.y = track.groundY + 0.12 + Math.sin(time * 1.1) * 0.03;
  }

  // ===================================================================== 3 DAYDREAM CRUISER decor
  const DC_HULL = [[-150, -45], [-135, -95], [-95, -118], [0, -122], [300, -122], [430, -112], [520, -70], [610, 0], [520, 70], [430, 112], [300, 122], [0, 122], [-95, 118], [-135, 95], [-150, 45]];
  const DECK = 8.4, SEA = -6.5, CEIL = 7.4;
  function absStrip(kit, b, d0, d1, step, l0, l1, y0, y1, c, c2) {
    const n = Math.max(1, Math.ceil((d1 - d0) / step));
    const P = (d, l, y) => { const p = kit.at(d, l, 0); p[1] = y; return p; };
    for (let i = 0; i < n; i++) {
      const a = d0 + ((d1 - d0) * i) / n, z = d0 + ((d1 - d0) * (i + 1)) / n;
      b.quad(P(a, l0, y0), P(a, l1, y1), P(z, l1, y1), P(z, l0, y0), c2 && (i & 1) ? c2 : c);
    }
  }
  function funnel(b, c, x, y0, z, r, h) {
    b.frustum(x, y0, z, r, r * 0.8, h * 0.62, 18, c(0xd9482b), 0);
    b.frustum(x, y0 + h * 0.62, z, r * 0.8, r * 0.72, h * 0.14, 18, c(0xf4f0e6), 0);
    b.frustum(x, y0 + h * 0.76, z, r * 0.72, r * 0.7, h * 0.24, 18, c(0x2a2d33), 0);
    b.frustum(x, y0, z, r * 1.25, r, 1.0, 18, c(0x8a2a2a), 0);
  }
  function dcDecorate(track, kit) {
    const c = kit.col, rng = kit.rng, L = kit.length, ds = kit.ds, N = kit.N, gy = kit.groundY;
    const b = new kit.Batch(), lamps = new kit.Batch();
    const hwT = 17, W = c(0xf4f0e6), blueC = c(0x2f6fb0), redC = c(0x8a2a2a), plank = 0xa88a5c;
    const yR = (d) => kit.py[Math.min(N - 1, Math.max(0, Math.round(d / ds)))];
    track._fl = { puffs: [], boats: [] };
    // ---- ocean
    {
      const g = new THREE.PlaneGeometry(9000, 9000, 1, 1); g.rotateX(-PI / 2); kit.trackGeom(g);
      const m = kit.waterMat({ color: 0x2a8ad0, deep: 0x0a4a88, opacity: 0.96 });
      const sea = new THREE.Mesh(g, m); sea.position.set(200, SEA, 0); sea.frustumCulled = false; kit.add(sea); track._fl.sea = sea;
    }
    // ---- ranges
    const dA0 = scanD(kit, 300, L, (i) => kit.py[i] < 8.3)[0];
    const dA1 = scanD(kit, dA0, L, (i) => kit.py[i] < 3.2)[0];
    const dB0 = scanD(kit, dA1, L, (i) => kit.py[i] > 3.2 && i * ds > dA1 + 40)[0];
    const dB1 = scanD(kit, dB0, L, (i) => kit.py[i] > 8.3)[0];
    track._hall = [dA1, dB0];
    // ---- deck plane with holes for the two ramp trenches
    const hole = (d0, d1) => {
      const pts = []; const lw = hwT + 1.8;
      for (let d = d0; d <= d1; d += 5) { const p = kit.at(d, -lw, 0); pts.push([p[0], p[2]]); }
      for (let d = d1; d >= d0; d -= 5) { const p = kit.at(d, lw, 0); pts.push([p[0], p[2]]); }
      return pts;
    };
    const plankTex = ctex(kit, 128, 128, (g, w, h) => { g.fillStyle = '#a89070'; g.fillRect(0, 0, w, h); for (let r = 0; r < 4; r++) { g.fillStyle = r & 1 ? '#9c8264' : '#b49a78'; g.fillRect(0, r * h / 4 + 1, w, h / 4 - 2); g.fillStyle = '#5a4630'; g.fillRect((r * 37) % w, r * h / 4, 2, h / 4); } g.fillStyle = '#7a6448'; g.fillRect(0, 0, w, 2); });
    plankTex.repeat.set(0.2, 0.2); plankTex.needsUpdate = true;
    polyMesh(kit, DC_HULL, [hole(dA0 - 2, dA1), hole(dB0, dB1 + 2)], DECK, 0xffffff, { map: plankTex });
    // trench walls + hall shell
    const tw = hwT + 1.8;
    const trench = (d0, d1) => {
      for (let s = -1; s <= 1; s += 2) for (let d = d0; d < d1; d += 5) {
        const d2 = Math.min(d1, d + 5);
        const A = kit.at(d, s * tw, -1.5), B = kit.at(d2, s * tw, -1.5), A2 = kit.at(d, s * tw, 0), B2 = kit.at(d2, s * tw, 0);
        A2[1] = DECK; B2[1] = DECK;
        b.quad(A, B, B2, A2, ((d / 5) | 0) & 1 ? c(0xe9e2d2) : c(0xded6c4));
      }
    };
    trench(dA0 - 2, dB1 + 2);
    absStrip(kit, b, dA1, dB0, 5, -tw, tw, CEIL, CEIL, c(0xefe6d2), c(0xe6dcc6));
    absStrip(kit, b, dA1, dB0, 5, -tw, -tw + 1.2, CEIL, CEIL - 0.9, c(0x7a5230));
    absStrip(kit, b, dA1, dB0, 5, tw - 1.2, tw, CEIL - 0.9, CEIL, c(0x7a5230));
    // wood wainscot + windows + pilasters in hall
    for (let s = -1; s <= 1; s += 2) {
      for (let d = dA1; d < dB0; d += 12) {
        const f = kit.frame(d), hd = Math.atan2(f.tx, f.tz), y = f.y;
        const p = kit.at(d, s * (tw - 0.5), 0);
        b.box(p[0], p[1], p[2], 1.2, CEIL - y, 1.2, hd, c(0xa27545));
        const pm = kit.at(d + 6, s * (tw - 0.25), 0);
        b.box(pm[0], pm[1] + 2.6, pm[2], 0.3, 2.6, 6.4, hd, c(0x6fb8e8));
        b.box(pm[0], pm[1] + 2.3, pm[2], 0.4, 0.3, 6.8, hd, c(0xd9b26a)); b.box(pm[0], pm[1] + 5.2, pm[2], 0.4, 0.3, 6.8, hd, c(0xd9b26a));
        b.box(pm[0], pm[1] - 0.2, pm[2], 0.4, 2.4, 11.2, hd, c(0x8a5a2b));
      }
    }
    // chandeliers
    for (let d = dA1 + 14; d < dB0 - 6; d += 24) {
      const p = kit.at(d, 0, 0), top = CEIL - 0.9;
      rod(b, [p[0], top, p[2]], [p[0], top - 1.6, p[2]], 0.08, c(0xd9b26a));
      lamps.blob(p[0], top - 2.2, p[2], 0.8, 0.6, 0.8, c(0xfff0b8), 1);
      b.frustum(p[0], top - 1.6, p[2], 1.5, 0.3, 0.3, 10, c(0xd9b26a), 0);
    }
    // ---- hull
    const cen = DC_HULL.reduce((a, p) => [a[0] + p[0] / DC_HULL.length, a[1] + p[1] / DC_HULL.length], [0, 0]);
    const inset = (p, k) => { const dx = cen[0] - p[0], dz = cen[1] - p[1], l = Math.hypot(dx, dz) || 1; return [p[0] + (dx / l) * k, p[1] + (dz / l) * k]; };
    const H = DC_HULL;
    const subdiv = [];
    for (let i = 0; i < H.length; i++) {
      const a = H[i], z = H[(i + 1) % H.length], n = Math.ceil(Math.hypot(z[0] - a[0], z[1] - a[1]) / 14);
      for (let k = 0; k < n; k++) subdiv.push([a[0] + (z[0] - a[0]) * (k / n), a[1] + (z[1] - a[1]) * (k / n)]);
    }
    const bands = [[DECK, DECK - 3.4, W, 0], [DECK - 3.4, DECK - 5.6, blueC, 1.2], [DECK - 5.6, SEA, redC, 4.2]];
    for (let i = 0; i < subdiv.length; i++) {
      const a = subdiv[i], z = subdiv[(i + 1) % subdiv.length];
      bands.forEach((bd, bi) => {
        const a0 = inset(a, bd[3]), z0 = inset(z, bd[3]);
        const bnext = bands[bi + 1] ? bands[bi + 1][3] : 5.4;
        const a1 = inset(a, bnext), z1 = inset(z, bnext);
        b.quad([a0[0], bd[0], a0[1]], [z0[0], bd[0], z0[1]], [z1[0], bd[1], z1[1]], [a1[0], bd[1], a1[1]], bd[2]);
      });
      // portholes
      const mx = (a[0] + z[0]) / 2, mz = (a[1] + z[1]) / 2, ex = z[0] - a[0], ez = z[1] - a[1], el = Math.hypot(ex, ez) || 1;
      const hd = Math.atan2(ex, ez), q = inset([mx, mz], 0.15);
      for (let k = -1; k <= 1; k += 2) b.box(q[0] + (ex / el) * k * 3.4, DECK - 2.4, q[1] + (ez / el) * k * 3.4, 1.5, 1.4, 1.5, hd, c(0x27384a));
      const fo = inset(a, -3.2), fo2 = inset(z, -3.2), fi = inset(a, 4.6), fi2 = inset(z, 4.6);
      b.quad([fo[0], SEA + 0.1, fo[1]], [fo2[0], SEA + 0.1, fo2[1]], [fi2[0], SEA + 0.1, fi2[1]], [fi[0], SEA + 0.1, fi[1]], c(0xe6f6ff));
      // rails
      const ra = inset(a, -0.2), rz = inset(z, -0.2);
      rod(b, [ra[0], DECK + 1.15, ra[1]], [rz[0], DECK + 1.15, rz[1]], 0.09, W);
      b.box(ra[0], DECK, ra[1], 0.14, 1.15, 0.14, 0, W);
    }
    // bow & stern details
    {
      const tip = H[7];
      rod(b, [tip[0] - 10, DECK, tip[1]], [tip[0] - 10, DECK + 18, tip[1]], 0.25, W);
      kit.flag(tip[0] - 10, DECK + 18, tip[1], 9, 4.2, 0, [0xf2c230, 0xd9482b], { pole: 0.01 });
      b.box(tip[0] - 40, DECK, tip[1] - 3, 8, 1.6, 6, 0, c(0x4a5560)); b.box(tip[0] - 40, DECK + 1.6, tip[1] - 3, 3.6, 1.2, 3.6, 0, c(0x6a7582));
    }
    // ---- superstructure: stern cabin tower, bow bridge-house, funnels
    {
      const cx = -20, cz = 0;
      for (let k = 0; k < 3; k++) {
        const r = 30 - k * 5, y = DECK + k * 5;
        b.frustum(cx, y, cz, r, r - 0.3, 5, 28, W, 0);
        b.frustum(cx, y + 1.6, cz, r + 0.06, r + 0.06, 1.5, 28, c(0x27384a), 0.1);
        b.frustum(cx, y + 3.7, cz, r + 0.06, r + 0.06, 0.9, 28, c(0x27384a), 0.1);
        b.frustum(cx, y + 5, cz, r + 0.5, r + 0.5, 0.5, 28, blueC, 0);
      }
      funnel(b, c, cx, DECK + 15.5, cz, 9, 20);
      const bx = 405, bz = 0;
      b.frustum(bx, DECK, bz, 22, 21, 7, 20, W, 0); b.frustum(bx, DECK + 2.4, bz, 22.06, 22.06, 1.6, 20, c(0x27384a), 0.1);
      b.frustum(bx, DECK + 7, bz, 17, 16, 5, 20, W, 0); b.frustum(bx, DECK + 8.6, bz, 17.06, 17.06, 1.6, 20, c(0x27384a), 0.1);
      b.frustum(bx, DECK + 12, bz, 18, 18, 0.6, 20, blueC, 0);
      rod(b, [bx, DECK + 12, bz], [bx, DECK + 30, bz], 0.4, c(0xdddddd));
      b.box(bx - 3, DECK + 24, bz - 0.2, 6, 0.4, 0.4, 0, c(0xdddddd)); b.box(bx - 0.5, DECK + 29, bz - 3, 1, 0.3, 6, 0, c(0xd9482b));
      for (const fx of [110, 335]) { funnel(b, c, fx, DECK, 6, 8, 24); }
    }
    // ---- pool deck (north deck, inner/right side)
    {
      const dp0 = 158, dp1 = 300, l0 = hwT + 0.95, l1 = 47;
      // tiles around the pool
      absStrip(kit, b, dp0 - 8, dp1 + 8, 6, l0, l1 + 9, DECK + 0.03, DECK + 0.03, c(0x8fd6e6), c(0x7cc8dc));
      // pool basin
      const pts = [];
      for (let d = dp0; d <= dp1; d += 6) { const p = kit.at(d, l0, 0); pts.push([p[0], p[2]]); }
      for (let d = dp1; d >= dp0; d -= 6) { const p = kit.at(d, l1, 0); pts.push([p[0], p[2]]); }
      const w = waterPoly(kit, pts, null, DECK + 0.14, 0x37b9f0, 0.9); track._fl.pool = w;
      for (const e of [l1, l1 + 0.7]) absStrip(kit, b, dp0, dp1, 6, e, e + 0.7, DECK + 0.22, DECK + 0.22, c(0xffffff));
      absStrip(kit, b, dp0 - 0.7, dp0, 2, l0, l1 + 0.7, DECK + 0.22, DECK + 0.22, c(0xffffff));
      absStrip(kit, b, dp1, dp1 + 0.7, 2, l0, l1 + 0.7, DECK + 0.22, DECK + 0.22, c(0xffffff));
      // loungers + umbrellas
      for (let d = dp0 + 6; d < dp1; d += 16) {
        const f = kit.frame(d), hd = Math.atan2(f.tx, f.tz);
        for (let k = 0; k < 2; k++) {
          const p = kit.at(d + k * 3.4, l1 + 6.5, 0);
          b.box(p[0], DECK, p[2], 1.1, 0.5, 2.4, hd, c(k ? 0xffffff : 0xffe14a)); b.box(p[0] + f.tx * -1.2, DECK + 0.4, p[2] + f.tz * -1.2, 1.1, 0.35, 0.3, hd, c(0xffffff));
        }
        if ((d / 16 | 0) % 2 === 0) {
          const q = kit.at(d + 1.7, l1 + 10.5, 0), uc = ((d / 16) | 0) % 4 ? c(0xd9482b) : c(0x2f78d0);
          rod(b, [q[0], DECK, q[2]], [q[0], DECK + 3.6, q[2]], 0.07, c(0xeeeeee));
          b.frustum(q[0], DECK + 3.2, q[2], 2.6, 0, 0.8, 8, uc, rng() * 3);
        }
      }
      // slide
      const s0 = kit.at(dp1 - 20, l1 + 18, 0);
      for (let k = 0; k < 14; k++) { const a = k * 0.55, a2 = (k + 1) * 0.55; rod(b, [s0[0] + Math.cos(a) * 3.6, DECK + 11 - k * 0.7, s0[2] + Math.sin(a) * 3.6], [s0[0] + Math.cos(a2) * 3.6, DECK + 11 - (k + 1) * 0.7, s0[2] + Math.sin(a2) * 3.6], 0.5, c(k & 1 ? 0xffe14a : 0xff6a3a)); }
      rod(b, [s0[0], DECK, s0[2]], [s0[0], DECK + 11.5, s0[2]], 0.35, c(0xdddddd));
    }
    // ---- lifeboats on the outer decks (boats sway)
    for (let s = -1; s <= 1; s += 2) {
      const bb = new kit.Batch();
      for (let x = -40; x <= 420; x += 46) {
        bb.blob(x, 1.4, 0, 4.2, 1.5, 1.8, c(0xff7a1a), 1); bb.box(x, 0, 0, 7.6, 0.5, 2.6, 0, c(0xffffff)); bb.box(x, 2.2, 0, 7, 0.25, 2.5, 0, c(0xf4f0e6));
        bb.box(x - 3.4, 0, 0, 0.3, 3.2, 0.3, 0, c(0x6a7582)); bb.box(x + 3.4, 0, 0, 0.3, 3.2, 0.3, 0, c(0x6a7582));
      }
      const m = mk(kit, bb); m.position.set(0, DECK, s * 103); kit.add(m); track._fl.boats.push({ m, s });
    }
    // ---- tidy deck props (crates, bollards, bunting) outside the roads
    kit.scatter(80, 1, 14, 20, (x, z, i, r) => { if (Math.abs(z) < 100 && x > -100 && x < 480 && yR(i * ds) > 8) { const d = Math.hypot(x - cen[0], z - cen[1]); b.box(x, DECK, z, 1.2, 1.0, 1.2, r() * 3, c(0xd9b26a)); } });
    // ---- far scenery: islands & a second ship
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * PI * 2 + rng() * 0.3, r = 650 + rng() * 350, s = 40 + rng() * 80;
      b.blob(200 + Math.cos(a) * r, SEA - 4, Math.sin(a) * r, s * 1.6, s * 0.35 + 8, s, mix3(c(0x4f9a5a), c(0x6fae6a), rng()), 1);
      if (rng() < 0.5) b.blob(200 + Math.cos(a) * r, SEA + 8, Math.sin(a) * r, s * 0.9, s * 0.22, s * 0.6, c(0x8a8a7a), 1);
    }
    // gulls over the sea are left to the sky; sun deck flags
    for (let x = 0; x < 420; x += 70) for (let s = -1; s <= 1; s += 2) {
      const p = [x, DECK, s * 112];
      kit.flag(p[0], p[1], p[2], 3.6, 2, 0, ((x / 70) | 0) & 1 ? [0xd9482b, 0xffffff] : [0x2f78d0, 0xffffff], { pole: 9 });
    }
    // bunting along the pool deck
    for (let s = -1; s <= 1; s += 2) for (let x = 0; x < 350; x += 70) kit.bunting([x, DECK + 8.8, s * 112], [x + 70, DECK + 8.8, s * 112], [0xd9482b, 0xf4f0e6, 0x2f78d0, 0xf2c230], 12, 1.0, 1.4);
    { const lm = kit.mesh(lamps, {}, true); if (lm) kit.blinker(lm.material, 3.4, { mode: 'sine', lo: 0.72 }); }   // chandeliers shimmer
    kit.mesh(b);
    // sea life + sky: far ship sliding along the horizon, sailboats bobbing, gulls, fireworks at sunset
    {
      const sh = new kit.Batch();
      sh.box(0, 0, 0, 14, 5, 70, 0, c(0xf4f0e6)); sh.box(0, 5, -6, 11, 4, 36, 0, c(0x2f6fb0)); sh.box(0, 9, -6, 9, 3, 20, 0, c(0xf4f0e6));
      sh.frustum(0, 12, -10, 2.2, 2, 6, 10, c(0xd9482b), 0);
      const far = kit.mesh(sh); far.position.set(-300, SEA + 0.5, 520); far.rotation.y = PI / 2; far.frustumCulled = false;
      kit.slide(far, 380, 0, 0, 0.012, 0);
      kit.bob(far, 0.25, 0.7, 1, 0.01);
      const hb = new kit.Batch(); hb.box(0, 0, 0, 2.4, 1.0, 8, 0, c(0xf2f2f2)); hb.box(0, 0.5, 0.4, 0.2, 9, 0.2, 0, c(0xdddddd));
      hb.tri([0, 1.5, 0.5], [0, 9, 0.3], [0, 1.5, -3.4], c(0xffffff)); hb.tri([0, 1.5, 0.5], [0, 1.5, -3.4], [0, 9, 0.3], c(0xffffff));
      const hg = kit.trackGeom(hb.build());
      for (let k = 0; k < 7; k++) { const m = new THREE.Mesh(hg, kit.mat({})), a = k * 0.9 + 0.3, r = 280 + (k % 3) * 70; m.position.set(200 + Math.cos(a) * r, SEA + 0.3, Math.sin(a) * r * 0.8); m.rotation.y = a * 2; m.scale.setScalar(1.6); kit.add(m); kit.bob(m, 0.2, 1 + k * 0.07, k, 0.06); }
      kit.birds({ cx: 200, cz: 0, y: 40, radius: 190, count: 9, speed: 0.08, size: 1.5 });
      kit.birds({ cx: 320, cz: 60, y: 26, radius: 90, count: 6, speed: -0.12 });
    dcBeauty(track, kit);
      const em = []; for (let k = 0; k < 6; k++) { const a = k * 1.05 + 0.4; em.push([200 + Math.cos(a) * 330, 70 + (k % 3) * 18, Math.sin(a) * 260]); }
      kit.particles({ emitters: em, count: 60, sphere: 22, life: 6.5, win: 0.32, grav: -9, size: 2.2, grow: -0.5, alpha: 1, pow: 0.6, fadeIn: 0.04, color: [0xff4060, 0x40d0ff, 0xffe040, 0x70ff70, 0xff80ff, 0xffa030], burst: true, tex: 'spark', additive: true });
    }
    kit.crowdStand({ d0: L - 60, d1: L + 90, side: -1, l0: hwT + 3.5, rows: 2, gap: 1.3, rise: 0, step: 2.2, radius: 60 });
    kit.crowdStand({ d0: 150, d1: 310, side: 1, l0: 50 + 8, rows: 2, gap: 1.5, rise: 0, step: 3.2, radius: 60, colors: [0xff7ab0, 0x35c0d9, 0xffe14a, 0xffffff] });
    // smoke puffs (6 meshes sharing one geometry)
    const pg = kit.trackGeom(new THREE.IcosahedronGeometry(1, 1)), pm = kit.trackMat(new THREE.MeshLambertMaterial({ color: 0xe8e8ee, transparent: true, opacity: 0.8 }));
    for (const fx of [-20, 110, 335]) for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(pg, pm); kit.add(m);
      const fy = fx === -20 ? DECK + 35.5 : DECK + 24;
      track._fl.puffs.push({ m, x: fx, y0: fy, z: fx === -20 ? 0 : 6, k });
    }
  }
  function dcHazards(track, kit) {
    const out = [], c = kit.col;
    // sliding dining tables in the hall
    const tb = new kit.Batch();
    tb.frustum(0, 0, 0, 0.7, 0.5, 0.9, 10, c(0x6a4a2a), 0); tb.frustum(0, 0, 0, 1.1, 0.9, 0.1, 10, c(0x6a4a2a), 0);
    tb.frustum(0, 0.9, 0, 2.2, 2.2, 0.18, 14, c(0xf8f4ea), 0); tb.frustum(0, 0.6, 0, 2.3, 2.3, 0.35, 14, c(0xe8e0d0), 0);
    tb.frustum(0, 1.08, 0, 2.0, 2.0, 0.08, 14, c(0xd8483a), 0);
    for (let k = 0; k < 4; k++) { const a = k * PI / 2 + 0.4; tb.box(Math.cos(a) * 1.3, 1.08, Math.sin(a) * 1.3, 0.7, 0.1, 0.7, a, c(0xffffff)); tb.box(Math.cos(a) * 3.0, 0, Math.sin(a) * 3.0, 0.9, 0.5, 0.9, a, c(0x8a2a2a)); tb.box(Math.cos(a) * 3.35, 0.5, Math.sin(a) * 3.35, 0.9, 1.1, 0.14, a + PI / 2, c(0x8a2a2a)); }
    tb.frustum(0, 1.1, 0, 0.12, 0.12, 0.6, 6, c(0xfff2a0), 0); tb.blob(0.9, 1.3, 0.4, 0.28, 0.35, 0.28, c(0xf4c040), 0);
    const tpl = mk(kit, tb), hall = track._hall || [680, 840];
    let k = 0;
    for (let d = hall[0] + 14; d < hall[1] - 10; d += 22, k++) {
      const fr = frameInto(track, d, newF()), A = fr.halfWidth - 3.8, w = 0.9 + 0.06 * (k % 3), ph = k * 1.7, m = tpl.clone();
      const h = {
        x: 0, y: 0, z: 0, radius: 2.5, hitKind: 'bump', vx: 0, vz: 0, active: true, object3D: m,
        update(dt, time) {
          const l = A * Math.sin(w * time + ph), vl = A * w * Math.cos(w * time + ph);
          this.x = fr.x + fr.rx * l; this.z = fr.z + fr.rz * l; this.y = fr.y + 0.8;
          this.vx = fr.rx * vl; this.vz = fr.rz * vl;
          m.position.set(this.x, fr.y, this.z); m.rotation.y = Math.atan2(fr.tx, fr.tz) + Math.sin(time * 0.6 + ph) * 0.25;
        },
      };
      h.update(0, 0); out.push(h);
    }
    return out;
  }
  function dcUpdate(track, dt, time) {
    const f = track._fl; if (!f) return;
    f.sea.position.y = SEA + Math.sin(time * 0.7) * 0.25; f.sea.rotation.z = Math.sin(time * 0.45) * 0.004; f.sea.rotation.x = Math.sin(time * 0.37) * 0.003;
    for (const bt of f.boats) { bt.m.rotation.x = Math.sin(time * 0.6 + bt.s) * 0.012; bt.m.position.y = DECK + Math.sin(time * 0.6 + bt.s) * 0.1; }
    if (f.pool) f.pool.position.y = DECK + 0.14 + Math.sin(time * 1.8) * 0.02;
    for (const p of f.puffs) {
      const u = ((time * 0.22 + p.k * 0.25) % 1 + 1) % 1;
      p.m.position.set(p.x + u * 30, p.y0 + u * 14, p.z + Math.sin(time + p.k) * 2);
      const s = 2.4 + u * 6; p.m.scale.set(s, s * 0.8, s);
    }
  }

  // ===================================================================== 4 MUDSLIDE STADIUM decor
  function msDecorate(track, kit) {
    const c = kit.col, rng = kit.rng, L = kit.length, ds = kit.ds, N = kit.N, gy = kit.groundY;
    const b = new kit.Batch(), lamps = new kit.Batch();
    track._fl = { rings: [] };
    // ---- arena bowl (superellipse) around the whole course
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (let i = 0; i < N; i += 4) { minX = Math.min(minX, kit.px[i]); maxX = Math.max(maxX, kit.px[i]); minZ = Math.min(minZ, kit.pz[i]); maxZ = Math.max(maxZ, kit.pz[i]); }
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, hx = (maxX - minX) / 2, hz = (maxZ - minZ) / 2;
    const Fn = (x, z, a, bb) => Math.pow(Math.abs(x - cx) / a, 4) + Math.pow(Math.abs(z - cz) / bb, 4);
    let mF = 0; for (let i = 0; i < N; i += 3) mF = Math.max(mF, Fn(kit.px[i], kit.pz[i], hx, hz));
    const k = Math.pow(mF / 0.42, 0.25), A = hx * k + 8, B = hz * k + 8;
    const NS = 200, sx = (t) => Math.sign(Math.cos(t)) * Math.sqrt(Math.abs(Math.cos(t))), sz = (t) => Math.sign(Math.sin(t)) * Math.sqrt(Math.abs(Math.sin(t)));
    const ring = (o, t) => [cx + (A + o) * sx(t), cz + (B + o) * sz(t)];
    const crowd = [0xe8483c, 0x2f78d0, 0xf2c230, 0xffffff, 0x3fae5c, 0xff8ad0, 0x7a5cf0, 0xff9a3a].map(c);
    const concrete = c(0x8d8f96), concrete2 = c(0x7a7c84);
    const TIERS = 9;
    track._ms = { cx, cz, ring, o: TIERS * 3.2, yt: TIERS * 1.9 };
    for (let j = 0; j < TIERS; j++) {
      const o0 = j * 3.2, o1 = o0 + 3.2, y0 = j * 1.9, y1 = y0 + 1.9;
      for (let i = 0; i < NS; i++) {
        const t0 = (i / NS) * PI * 2, t1 = ((i + 1) / NS) * PI * 2;
        const a0 = ring(o0, t0), a1 = ring(o0, t1), b0 = ring(o1, t0), b1 = ring(o1, t1);
        const cc = crowd[((i * 7 + j * 13 + ((rng() * 3) | 0)) >>> 0) % crowd.length];
        // riser
        b.quad([a0[0], gy + y0, a0[1]], [a1[0], gy + y0, a1[1]], [a1[0], gy + y1, a1[1]], [a0[0], gy + y1, a0[1]], (i & 1) ? cc : mulK(cc, 0.82));
        // seat tread
        b.quad([a0[0], gy + y1, a0[1]], [a1[0], gy + y1, a1[1]], [b1[0], gy + y1, b1[1]], [b0[0], gy + y1, b0[1]], (i + j) & 1 ? concrete : concrete2);
      }
    }
    // back wall + roof ring
    {
      const o = TIERS * 3.2, yt = TIERS * 1.9;
      for (let i = 0; i < NS; i++) {
        const t0 = (i / NS) * PI * 2, t1 = ((i + 1) / NS) * PI * 2, a0 = ring(o, t0), a1 = ring(o, t1), r0 = ring(o - 12, t0), r1 = ring(o - 12, t1);
        b.quad([a0[0], gy + yt, a0[1]], [a1[0], gy + yt, a1[1]], [a1[0], gy - 1, a1[1]], [a0[0], gy - 1, a0[1]], (i >> 2) & 1 ? c(0xc9c2b4) : c(0xb7afa0));
        b.quad([a0[0], gy + yt + 6, a0[1]], [a1[0], gy + yt + 6, a1[1]], [r1[0], gy + yt + 3.2, r1[1]], [r0[0], gy + yt + 3.2, r0[1]], (i >> 3) & 1 ? c(0xd9482b) : c(0xf4f0e6));
        b.quad([a0[0], gy + yt + 6, a0[1]], [a0[0], gy + yt, a0[1]], [a1[0], gy + yt, a1[1]], [a1[0], gy + yt + 6, a1[1]], (i >> 3) & 1 ? c(0xb83a22) : c(0xdcd6c8));
        // ad boards at the arena floor
        const f0 = ring(-1.0, t0), f1 = ring(-1.0, t1);
        b.quad([f0[0], gy, f0[1]], [f1[0], gy, f1[1]], [f1[0], gy + 1.8, f1[1]], [f0[0], gy + 1.8, f0[1]], [c(0xd9482b), c(0xf2c230), c(0x2f78d0), c(0xffffff)][(i >> 2) & 3]);
      }
      // floodlight towers
      for (let q = 0; q < 8; q++) {
        const t = (q / 8) * PI * 2 + PI / 8, p = ring(o - 2, t);
        b.box(p[0], gy, p[1], 2.4, 40, 2.4, 0, c(0x505560));
        const hd = Math.atan2(cx - p[0], cz - p[1]);
        b.box(p[0], gy + 38, p[1], 11, 5, 1.2, hd, c(0x2a2d33));
        for (let r = 0; r < 3; r++) for (let s = 0; s < 4; s++) lamps.box(p[0] + Math.cos(hd) * (s - 1.5) * 2.4, gy + 38.4 + r * 1.4, p[1] - Math.sin(hd) * (s - 1.5) * 2.4 + Math.cos(hd) * 0.8 * 0 + Math.sin(hd) * 0.7, 1.9, 1.0, 0.3, hd, c(0xfff6d0));
      }
      // scoreboard on the far end
      const sp = ring(o - 8, 0), shd = Math.atan2(cx - sp[0], cz - sp[1]);
      b.box(sp[0], gy + yt + 6, sp[1], 36, 16, 3, shd, c(0x2a2d33));
      lamps.box(sp[0] + Math.sin(shd) * -1.7, gy + yt + 7.5, sp[1] + Math.cos(shd) * 1.7, 31, 12, 0.4, shd, c(0x1f9ad9));
      for (let s = 0; s < 5; s++) lamps.box(sp[0] + Math.cos(shd) * (s - 2) * 6 + Math.sin(shd) * 1.9, gy + yt + 11, sp[1] - Math.sin(shd) * (s - 2) * 6 + Math.cos(shd) * 1.9, 3.2, 4, 0.2, shd, c([0xffe14a, 0xff6a3a, 0x7cf27c, 0xffffff, 0xff8ad0][s]));
      b.box(sp[0] - 14, gy + yt, sp[1], 2, 6, 2, 0, c(0x505560)); b.box(sp[0] + 14, gy + yt, sp[1], 2, 6, 2, 0, c(0x505560));
    }
    // animated crowd on four seat tiers, one group per quadrant sharing one stadium wave
    {
      const groups = [[], [], [], []], NT = 360;
      for (const j of [1, 3, 5, 7]) for (let i = 0; i < NT; i++) {
        const t = (i / NT) * PI * 2, p = ring(j * 3.2 + 1.6, t + (j & 2 ? 0.0087 : 0));
        groups[Math.min(3, (i / (NT / 4)) | 0)].push([p[0], gy + (j + 1) * 1.9, p[1], Math.atan2(cx - p[0], cz - p[1]), t / (PI * 2)]);
      }
      groups.forEach((g) => kit.crowd(g, { scale: 1.6, radius: 70, period: 17, woff: 3, waveTime: 9, colors: [0xe8483c, 0x2f78d0, 0xf2c230, 0xffffff, 0x3fae5c, 0xff8ad0, 0x7a5cf0, 0xff9a3a] }));
      // pennants around the roof rim + sweeping searchlights + fireworks over the bowl
      const o = TIERS * 3.2, yt = TIERS * 1.9;
      for (let q = 0; q < 26; q++) { const p = ring(o - 1.5, (q / 26) * PI * 2); kit.flag(p[0], gy + yt + 6, p[1], 4, 2.2, (q * 0.7) % 6.28, q & 1 ? [0xd9482b, 0xffffff] : [0x2f78d0, 0xf2c230], { pole: 4 }); }
      for (let q = 0; q < 4; q++) { const t = (q / 4) * PI * 2 + PI / 8, p = ring(o - 2, t); kit.lightBeam({ x: p[0], y: gy + 40, z: p[1], len: 120, width: 4, speed: 0.5 * (q & 1 ? 1 : -1), phase: q, tilt: 0.7, count: 1, color: 0xfff2c8, opacity: 0.4 }); }
      const em = []; for (let k = 0; k < 5; k++) { const a = k * 1.3; em.push([cx + Math.cos(a) * 70, 70 + (k % 3) * 14, cz + Math.sin(a) * 50]); }
      kit.particles({ emitters: em, count: 55, sphere: 20, life: 7, win: 0.3, grav: -8, size: 2.0, grow: -0.5, alpha: 1, pow: 0.6, fadeIn: 0.04, color: [0xff4060, 0x40d0ff, 0xffe040, 0x70ff70, 0xff80ff, 0xffa030], burst: true, tex: 'spark', additive: true });
    }
    // ---- infield dressing: dirt mounds, tyre stacks, hay bales, cones
    const m0 = 20;
    kit.scatter(90, 3, 45, m0 + 4, (x, z, i, r) => { const s = 2 + r() * 4; b.blob(x, gy - 0.4, z, s * 2, s * 0.6, s * 1.4, mix3(c(0x8a6238), c(0x6f4b27), r()), 0); });
    kit.scatter(70, 0.5, 8, m0, (x, z, i, r) => {
      const n = 2 + ((r() * 3) | 0);
      for (let q = 0; q < n; q++) b.frustum(x, gy + q * 0.75, z, 0.95, 0.95, 0.75, 8, q & 1 ? c(0xf0eadc) : c(0x23252b), 0);
    });
    kit.scatter(50, 0.5, 9, m0, (x, z, i, r) => { b.box(x, gy, z, 2.2, 1.1, 1.1, r() * 3, c(0xe8c25a)); b.box(x, gy + 1.1, z, 2.1, 1.0, 1.0, r() * 3, c(0xdcb24a)); });
    kit.scatter(26, 6, 30, m0 + 3, (x, z, i, r) => { const s = 2 + r() * 2; b.frustum(x, gy, z, s, s * 0.3, s * 1.2, 8, c(0x6f4b27), 0); });
    // lip markers (cones) at the three hill starts
    [[118, 14], [419, 14], [736, 14]].forEach(([d0]) => {
      for (let q = 0; q < 6; q++) for (let s = -1; s <= 1; s += 2) {
        const p = kit.at(d0 + q * 6, s * (11 + 1.2), 0);
        b.frustum(p[0], p[1], p[2], 0.55, 0.12, 1.4, 6, q & 1 ? c(0xff7a1a) : c(0xffffff), 0);
      }
    });
    // sponsor arches over the road (at the foot of each jump)
    [[92, 0xd9482b], [395, 0x2f78d0], [706, 0xf2c230]].forEach(([d, col]) => {
      const f = kit.frame(d), hd = Math.atan2(f.tx, f.tz), hwT = f.halfWidth + 5.5;
      for (let s = -1; s <= 1; s += 2) { const p = kit.at(d, s * hwT, 0); b.box(p[0], p[1], p[2], 1.8, 11, 1.8, hd, c(0x2a2d33)); }
      const q = kit.at(d, 0, 10.2); b.box(q[0], q[1], q[2], 2 * hwT + 2, 2.6, 1.4, hd, c(col));
      for (let l = -hwT; l <= hwT; l += 3) { const r = kit.at(d, l, 12.9); b.box(r[0], r[1], r[2], 1.1, 1.1, 1.0, hd, ((l / 3) | 0) & 1 ? c(0x23252b) : c(0xf4f0e6)); }
    });
    // ---- flaming rings above the big jump
    {
      const ringsD = [792, 809, 826];
      ringsD.forEach((d, ri) => {
        const f = kit.frame(d), hd = Math.atan2(f.tx, f.tz), R = 7.5 + ri * 0.9, cyy = 8.5 + ri * 1.4;
        const fb = new kit.Batch();
        for (let a = 0; a < 22; a++) {
          const an = (a / 22) * PI * 2, s = 1.4 + ((a * 7) % 5) * 0.12;
          const col2 = [c(0xffd23a), c(0xff8a1a), c(0xff4a1a)][a % 3];
          fb.blob(Math.cos(an) * R, Math.sin(an) * R, 0, s, s * 1.15, s * 0.9, col2, 0);
          fb.blob(Math.cos(an + 0.14) * (R + 0.9), Math.sin(an + 0.14) * (R + 0.9), 0, s * 0.6, s * 0.8, s * 0.5, c(0xfff0a0), 0);
        }
        const m = mk(kit, fb, true);
        m.position.set(f.x, f.y + cyy, f.z); m.rotation.y = hd; kit.add(m);
        track._fl.rings.push({ m, ph: ri * 1.3 });
        // support gantry
        for (let s = -1; s <= 1; s += 2) { const p = kit.at(d, s * (R + 7), 0); b.box(p[0], p[1], p[2], 1.4, cyy + 1.5, 1.4, hd, c(0x23252b)); const q = kit.at(d, s * (R + 4.5), cyy); rod(b, [p[0], p[1] + cyy, p[2]], [f.x + f.rx * s * (R + 0.4), f.y + cyy, f.z + f.rz * s * (R + 0.4)], 0.22, c(0x23252b)); }
      });
    }
    // ---- outside the bowl: far hills
    for (let q = 0; q < 24; q++) {
      const a = (q / 24) * PI * 2 + rng() * 0.2, r = Math.max(A, B) + 140 + rng() * 140, s = 50 + rng() * 60;
      b.blob(cx + Math.cos(a) * r, gy - 6, cz + Math.sin(a) * r, s * 1.4, s * 0.6, s, mix3(c(0x9c7a4a), c(0x7e6a3a), rng()), 1);
    }
    kit.mesh(b); { const lm = kit.mesh(lamps, {}, true); if (lm) kit.blinker(lm.material, 1.4, { mode: 'sine', lo: 0.7 }); }
    msBeauty(track, kit);
  }
  function msHazards(track, kit) {
    const pal = { pot: 0x4a4f5c, rim: 0xcfd2d8, stem: 0x2e8f3e, leaf: 0x3aa24a, head: 0xc23aa0, head2: 0x8f2a7a, mouth: 0x3a0a2a };
    const corner = scanD(kit, 480, 700, (i) => kit.curv[i] > 0.0125);
    const dc = corner[0] > 0 ? (corner[0] + corner[1]) / 2 : 575;
    const specs = [{ d: dc - 22, side: -1, phase: 0 }, { d: dc, side: -1, phase: 1.0 }, { d: dc + 22, side: -1, phase: 2.0 }];
    return makeSnappers(track, kit, pal, specs, { period: 3.0, reach: 7, out: 3 });
  }
  function msUpdate(track, dt, time) {
    const f = track._fl; if (!f) return;
    for (const r of f.rings) { r.m.rotation.z = time * 0.9 + r.ph; const s = 1 + Math.sin(time * 9 + r.ph) * 0.03; r.m.scale.set(s, s, s); }
  }

  // ===================================================================== BEAUTY PASS: shared helpers
  const css = (n) => '#' + ('000000' + (n >>> 0).toString(16)).slice(-6);
  function ctex(kit, w, h, draw) {
    const t = kit.makeCanvasTexture(w, h, draw);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
  }
  // textured batch (tiled facade boxes); bottom-left texel of each texture must be plain wall colour (used for roofs)
  function texBatch(kit, tex) {
    const b = new kit.Batch(true);
    const T = {
      b,
      q(p0, p1, p2, p3, k, u, v) { b.quadUV(p0, p1, p2, p3, k, [0, 0, u, 0, u, v, 0, v]); },
      flat(p0, p1, p2, p3, k) { b.quadUV(p0, p1, p2, p3, k, [0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03]); },
      box(cx, y0, cz, sx, sy, sz, ry, k, tw, th) {
        const c = Math.cos(ry), s = Math.sin(ry), hx = sx / 2, hz = sz / 2, y1 = y0 + sy;
        const v = (lx, lz, y) => [cx + lx * c + lz * s, y, cz - lx * s + lz * c];
        const a0 = v(-hx, -hz, y0), b0 = v(hx, -hz, y0), c0 = v(hx, hz, y0), d0 = v(-hx, hz, y0);
        const a1 = v(-hx, -hz, y1), b1 = v(hx, -hz, y1), c1 = v(hx, hz, y1), d1 = v(-hx, hz, y1);
        const U = Math.max(1, Math.round(sx / tw)), W = Math.max(1, Math.round(sz / tw)), H = Math.max(1, Math.round(sy / th));
        T.flat(a1, b1, c1, d1, k);
        T.q(a0, b0, b1, a1, k, U, H); T.q(b0, c0, c1, b1, k, W, H); T.q(c0, d0, d1, c1, k, U, H); T.q(d0, a0, a1, d1, k, W, H);
      },
      done(o, basic) { return kit.mesh(b, Object.assign({ map: tex }, o || {}), basic); },
    };
    return T;
  }
  // facade tile drawers (tile = one bay x one floor). bottom-left stays plain.
  function drawFacade(kind) {
    return (g, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      if (kind === 'glass') {
        g.fillStyle = '#e9eef3'; g.fillRect(0, h * 0.7, w, h * 0.3);
        const gr = g.createLinearGradient(0, 0, w, h * 0.7); gr.addColorStop(0, '#bfe4ff'); gr.addColorStop(0.5, '#5a9ad8'); gr.addColorStop(1, '#2d68ad');
        g.fillStyle = gr; g.fillRect(w * 0.04, h * 0.04, w * 0.92, h * 0.62);
        g.fillStyle = 'rgba(255,255,255,0.32)'; g.beginPath(); g.moveTo(w * 0.1, h * 0.62); g.lineTo(w * 0.5, h * 0.06); g.lineTo(w * 0.68, h * 0.06); g.lineTo(w * 0.28, h * 0.62); g.fill();
        g.fillStyle = '#f4f7fa'; g.fillRect(w * 0.48, h * 0.04, w * 0.04, h * 0.62);
      } else if (kind === 'apt') {
        g.fillStyle = '#cfc6b6'; g.fillRect(0, h * 0.9, w, h * 0.1);
        g.fillStyle = '#f6f1e6'; g.fillRect(w * 0.12, h * 0.2, w * 0.76, h * 0.62);
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#7fb2e0'); gr.addColorStop(1, '#2f5d8f');
        g.fillStyle = gr; g.fillRect(w * 0.17, h * 0.25, w * 0.66, h * 0.52);
        g.fillStyle = '#f6f1e6'; g.fillRect(w * 0.48, h * 0.25, w * 0.04, h * 0.52); g.fillRect(w * 0.17, h * 0.48, w * 0.66, h * 0.04);
        g.fillStyle = '#e0483c'; g.fillRect(w * 0.06, h * 0.25, w * 0.07, h * 0.52); g.fillRect(w * 0.87, h * 0.25, w * 0.07, h * 0.52);
        g.fillStyle = '#d65a7a'; g.fillRect(w * 0.15, h * 0.8, w * 0.7, h * 0.07);
        g.fillStyle = '#3f9a45'; for (let i = 0; i < 7; i++) g.fillRect(w * (0.17 + i * 0.1), h * 0.77, w * 0.05, h * 0.05);
      } else if (kind === 'shop') {
        g.fillStyle = '#d9d2c4'; g.fillRect(0, h * 0.88, w, h * 0.12);
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#a9d4f2'); gr.addColorStop(1, '#4a82b8');
        g.fillStyle = gr; g.fillRect(w * 0.06, h * 0.34, w * 0.88, h * 0.52);
        for (let i = 0; i < 8; i++) { g.fillStyle = i & 1 ? '#e0483c' : '#ffffff'; g.fillRect(w * (0.02 + i * 0.12), h * 0.1, w * 0.12, h * 0.22); }
        g.fillStyle = '#ffe9a0'; g.fillRect(w * 0.14, h * 0.62, w * 0.2, h * 0.22); g.fillRect(w * 0.6, h * 0.58, w * 0.22, h * 0.26);
        g.fillStyle = '#7a5a3a'; g.fillRect(w * 0.44, h * 0.34, w * 0.06, h * 0.52);
      } else if (kind === 'stone') {
        g.fillStyle = '#d9d9d9'; g.fillRect(0, 0, w, h);
        let seed = 7; const rn = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        for (let r = 0; r < 8; r++) { let x = (r & 1) * -w * 0.06; while (x < w) { const bw = w * (0.12 + rn() * 0.08), sh = 190 + rn() * 50 | 0; g.fillStyle = `rgb(${sh},${sh - 4},${sh - 10})`; g.fillRect(x + 1, r * h / 8 + 1, bw - 2, h / 8 - 2); x += bw; } }
        g.fillStyle = '#ffffff'; g.fillRect(0, h * 0.875, 8, h * 0.125);
      } else if (kind === 'tudor') {
        g.fillStyle = '#f7f0e0'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#5a3a26'; g.fillRect(0, h * 0.9, w, h * 0.1); g.fillRect(0, 0, w, h * 0.06); g.fillRect(w * 0.92, 0, w * 0.08, h); g.fillRect(w * 0.44, 0, w * 0.04, h * 0.2);
        g.strokeStyle = '#5a3a26'; g.lineWidth = w * 0.035; g.beginPath(); g.moveTo(w * 0.02, h * 0.9); g.lineTo(w * 0.34, h * 0.5); g.moveTo(w * 0.98, h * 0.9); g.lineTo(w * 0.7, h * 0.5); g.stroke();
        g.fillStyle = '#5a3a26'; g.fillRect(w * 0.3, h * 0.2, w * 0.4, h * 0.5);
        g.fillStyle = '#8fc0e0'; g.fillRect(w * 0.33, h * 0.24, w * 0.15, h * 0.18); g.fillRect(w * 0.52, h * 0.24, w * 0.15, h * 0.18); g.fillRect(w * 0.33, h * 0.46, w * 0.15, h * 0.18); g.fillRect(w * 0.52, h * 0.46, w * 0.15, h * 0.18);
        g.fillStyle = '#e0483c'; g.fillRect(w * 0.28, h * 0.7, w * 0.44, h * 0.08);
      } else if (kind === 'cabin') {
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = '#2f6fb0'; g.fillRect(0, h * 0.72, w, h * 0.1); g.fillStyle = '#e9d9a8'; g.fillRect(0, h * 0.82, w, h * 0.18);
        g.fillStyle = '#ffffff'; g.fillRect(w * 0.2, h * 0.14, w * 0.3, h * 0.46); g.beginPath(); g.arc(w * 0.78, h * 0.38, w * 0.15, 0, 7); g.fill();
        g.fillStyle = '#c8a050'; g.beginPath(); g.arc(w * 0.78, h * 0.38, w * 0.13, 0, 7); g.fill();
        const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#9fd8ff'); gr.addColorStop(1, '#2d68ad'); g.fillStyle = gr; g.beginPath(); g.arc(w * 0.78, h * 0.38, w * 0.1, 0, 7); g.fill(); g.fillRect(w * 0.23, h * 0.18, w * 0.24, h * 0.38);
        g.fillStyle = '#ffd890'; g.fillRect(w * 0.23, h * 0.18, w * 0.05, h * 0.38);
      } else if (kind === 'brick') {
        g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, w, h);
        for (let r = 0; r < 12; r++) for (let k = 0; k < 6; k++) { g.fillStyle = (r * 3 + k) % 3 ? '#f4f4f4' : '#dcdcdc'; g.fillRect((k + (r & 1) * 0.5) * w / 6 + 1, r * h / 12 + 1, w / 6 - 2, h / 12 - 2); }
        g.fillStyle = '#7d8fa0'; g.fillRect(w * 0.3, h * 0.25, w * 0.4, h * 0.5);
        g.fillStyle = '#ffffff'; g.fillRect(0, h * 0.9, 8, h * 0.1);
      }
    };
  }
  // sign atlas: 4 cols x 4 rows of 256x128 cells. specs: [[text, bg, fg, accent]]
  function signAtlas(kit, specs) {
    const tex = ctex(kit, 1024, 512, (g, w, h) => {
      g.fillStyle = '#222'; g.fillRect(0, 0, w, h);
      specs.forEach((s, i) => {
        const x = (i % 4) * 256, y = ((i / 4) | 0) * 128;
        g.fillStyle = s[1]; g.fillRect(x + 3, y + 3, 250, 122);
        g.fillStyle = s[3] || s[2]; g.fillRect(x + 3, y + 3, 250, 14); g.fillRect(x + 3, y + 111, 250, 14);
        g.fillStyle = s[2]; g.textAlign = 'center'; g.textBaseline = 'middle';
        const lines = s[0].split('\n'); const fs = lines.length > 1 ? 36 : 44;
        g.font = `900 ${fs}px Bungee, Impact, "Arial Black", sans-serif`;
        lines.forEach((ln, k) => g.fillText(ln, x + 128, y + 64 + (k - (lines.length - 1) / 2) * (fs + 2), 238));
      });
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return { tex, uv(i) { const x = (i % 4) / 4, y = 1 - (((i / 4) | 0) + 1) / 4; return [x + 0.004, y + 0.008, x + 0.246, y + 0.242]; } };
  }
  // sign panel facing direction ry (normal = (sin ry, cos ry)); bottom-centre (x,y,z), w x h, atlas cell i
  function signQuad(tb, at, i, x, y, z, w, h, ry, tint) {
    const c = Math.cos(ry), s = Math.sin(ry), hx = w / 2, k = tint || [1, 1, 1], u = at.uv(i);
    tb.b.quadUV([x - hx * c, y, z + hx * s], [x + hx * c, y, z - hx * s], [x + hx * c, y + h, z - hx * s], [x - hx * c, y + h, z + hx * s], k, [u[0], u[1], u[2], u[1], u[2], u[3], u[0], u[3]]);
  }
  // road decals: atlas cells 256x256 (up = driving direction). draws: [fn(g,w,h)]
  function decalSet(kit, draws) {
    const tex = ctex(kit, 1024, 1024, (g) => { draws.forEach((fn, i) => { g.save(); g.translate((i % 4) * 256, ((i / 4) | 0) * 256); g.beginPath(); g.rect(0, 0, 256, 256); g.clip(); fn(g, 256, 256); g.restore(); }); });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const b = new kit.Batch(true);
    return {
      add(d, l, len, wid, i, tint) {
        const n = Math.max(1, Math.ceil(len / 3)), u0 = (i % 4) / 4, v1 = 1 - ((i / 4) | 0) / 4, v0 = v1 - 0.25, k = tint || [1, 1, 1];
        for (let q = 0; q < n; q++) {
          const da = d + (len * q) / n, db = d + (len * (q + 1)) / n, va = v0 + 0.25 * (q / n), vb = v0 + 0.25 * ((q + 1) / n);
          b.quadUV(kit.at(da, l - wid / 2, 0.05), kit.at(da, l + wid / 2, 0.05), kit.at(db, l + wid / 2, 0.05), kit.at(db, l - wid / 2, 0.05), k, [u0, va, u0 + 0.25, va, u0 + 0.25, vb, u0, vb]);
        }
      },
      done() { const m = kit.mesh(b, { map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }); if (m) m.renderOrder = 2; return m; },
    };
  }
  const arrowDraw = (col) => (g, w, h) => { g.fillStyle = col; g.beginPath(); g.moveTo(w * 0.5, h * 0.04); g.lineTo(w * 0.86, h * 0.5); g.lineTo(w * 0.62, h * 0.5); g.lineTo(w * 0.62, h * 0.96); g.lineTo(w * 0.38, h * 0.96); g.lineTo(w * 0.38, h * 0.5); g.lineTo(w * 0.14, h * 0.5); g.fill(); };
  const chevDraw = (col) => (g, w, h) => { g.fillStyle = col; for (let k = 0; k < 3; k++) { const y = h * (0.62 - k * 0.24); g.beginPath(); g.moveTo(w * 0.5, y - h * 0.2); g.lineTo(w * 0.95, y + h * 0.08); g.lineTo(w * 0.95, y + h * 0.22); g.lineTo(w * 0.5, y); g.lineTo(w * 0.05, y + h * 0.22); g.lineTo(w * 0.05, y + h * 0.08); g.fill(); } };
  const logoDraw = (text, bg, fg) => (g, w, h) => {
    g.fillStyle = bg; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.46, h * 0.46, 0, 0, 7); g.fill();
    g.strokeStyle = fg; g.lineWidth = 8; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.4, h * 0.4, 0, 0, 7); g.stroke();
    g.save(); g.translate(w / 2, h / 2); g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 54px Bungee, Impact, "Arial Black", sans-serif';
    const ls = text.split('\n'); ls.forEach((t, i) => g.fillText(t, 0, (i - (ls.length - 1) / 2) * 56, 200)); g.restore();
  };
  // soft additive glow pools / halos (one mesh). pool: horizontal disc; halo: crossed vertical quads
  function glowSet(kit) {
    const b = new kit.Batch(true), soft = G.GFX && G.GFX.tex && G.GFX.tex.soft;
    const U = [0, 0, 1, 0, 1, 1, 0, 1];
    return {
      pool(x, y, z, r, k) { b.quadUV([x - r, y, z - r], [x + r, y, z - r], [x + r, y, z + r], [x - r, y, z + r], k, U); },
      cross(x, y, z, r, k) { b.quadUV([x - r, y - r, z], [x + r, y - r, z], [x + r, y + r, z], [x - r, y + r, z], k, U); b.quadUV([x, y - r, z - r], [x, y - r, z + r], [x, y + r, z + r], [x, y + r, z - r], k, U); },
      done() { if (!soft || b.empty) return null; const m = kit.mesh(b, { map: soft, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }, true); if (m) { m.renderOrder = 7; m.receiveShadow = false; } return m; },
    };
  }
  // lamp post (arm toward -side lateral direction at frame f). returns head position
  function lampPost(b, lamps, x, y, z, h, ry, arm, c, lc) {
    const s = Math.sin(ry), co = Math.cos(ry);
    b.frustum(x, y, z, 0.28, 0.2, 0.5, 8, mulK(c, 0.8), 0); b.frustum(x, y + 0.5, z, 0.16, 0.11, h - 0.5, 8, c, 0);
    const hx = x + s * arm, hz = z + co * arm;
    rod(b, [x, y + h - 0.2, z], [hx, y + h + 0.15, hz], 0.07, c);
    lamps.box(hx - 0.45, y + h - 0.12, hz - 0.45, 0.9, 0.2, 0.9, 0, lc); b.box(hx - 0.55, y + h + 0.08, hz - 0.55, 1.1, 0.12, 1.1, 0, mulK(c, 0.9));
    return [hx, y + h - 0.2, hz];
  }
  function bench(b, x, y, z, ry, wood, metal) {
    b.box(x, y + 0.45, z, 1.8, 0.1, 0.5, ry, wood); const s = Math.sin(ry), c = Math.cos(ry);
    b.box(x - s * 0.22, y + 0.7, z - c * 0.22, 1.8, 0.4, 0.08, ry, wood); b.box(x + c * 0.8, y, z - s * 0.8, 0.1, 0.45, 0.45, ry, metal); b.box(x - c * 0.8, y, z + s * 0.8, 0.1, 0.45, 0.45, ry, metal);
  }
  function barrel(b, x, y, z, r, c, c2) { b.frustum(x, y, z, r, r, r * 1.5, 8, c, 0); b.frustum(x, y + r * 0.5, z, r * 1.06, r * 1.06, 0.08, 8, c2, 0); b.frustum(x, y + r * 1.1, z, r * 1.06, r * 1.06, 0.08, 8, c2, 0); }
  function rocks(b, c, x, y, z, s, r, cols) {
    const n = 2 + ((r() * 3) | 0);
    for (let i = 0; i < n; i++) b.blob(x + (r() - 0.5) * s * 2, y + s * 0.25, z + (r() - 0.5) * s * 2, s * (0.5 + r() * 0.6), s * (0.35 + r() * 0.4), s * (0.5 + r() * 0.6), mix3(c(cols[0]), c(cols[1]), r()), 0);
  }
  function tireStack(b, c, x, y, z, n, c1, c2) { for (let q = 0; q < n; q++) b.frustum(x, y + q * 0.62, z, 0.85, 0.85, 0.62, 10, q & 1 ? c1 : c2, 0); }
  // props along the road: iterate d at step with lateral side, cb(d, side, frame)
  function along(kit, d0, d1, step, cb) { const f = {}; for (let d = d0; d < d1; d += step) { kit._fr = kit.frameInto ? kit.frameInto(d, f) : kit.frame(d); cb(d, kit._fr); } }
  function palm(b, c, x, y, z, s, r) {
    const lean = (r() - 0.5) * 1.2, top = [x + lean * s, y + 5.4 * s, z + (r() - 0.5) * s];
    rod(b, [x, y, z], top, 0.22 * s, c(0x9a7248));
    for (let k = 0; k < 8; k++) { const a = (k / 8) * PI * 2 + r(), L = 3.2 * s; b.tri(top, [top[0] + Math.cos(a) * L, top[1] - 1.1 * s, top[2] + Math.sin(a) * L], [top[0] + Math.cos(a + 0.45) * L * 0.55, top[1] + 0.2, top[2] + Math.sin(a + 0.45) * L * 0.55], k & 1 ? c(0x3f9f45) : c(0x56b84e)); }
    b.blob(top[0], top[1] - 0.2, top[2], 0.3 * s, 0.3 * s, 0.3 * s, c(0x6a4a2a), 0);
  }

  // ===================================================================== 1 BAYSIDE BRIDGE beauty
  function bbBeauty(track, kit) {
    const c = kit.col, rng = kit.rng, L = kit.length, gy = kit.groundY;
    const glassT = texBatch(kit, ctex(kit, 128, 128, drawFacade('glass'))), aptT = texBatch(kit, ctex(kit, 128, 128, drawFacade('apt')));
    const pl = new kit.Batch(), lamps = new kit.Batch(), fb = new kit.Batch(), glow = glowSet(kit);
    const SG = signAtlas(kit, [['SPLASH\nCOLA', '#d9332b', '#ffffff', '#ffd23a'], ['BAYCAST\nNEWS', '#1f5fb0', '#ffffff', '#ffd23a'], ['TURBO\nTIRES', '#222831', '#ffd23a', '#d9332b'], ['MARINA\nBANK', '#0e7a5a', '#ffffff', '#c8f0e0'],
      ['SUNNY TOURS', '#ffcf3a', '#1b4f9a', '#ff7a1a'], ['SEAGULL AIR', '#35a8e0', '#ffffff', '#ffffff'], ['HARBOR HOTEL', '#7a2a5a', '#ffe9a0', '#ffe9a0'], ['KART KING', '#f06a1a', '#ffffff', '#222222'],
      ['BAYSIDE\nBRIDGE', '#2a6a3a', '#ffffff', '#ffffff'], ['TOLL\nPLAZA', '#1f5fb0', '#ffffff', '#ffd23a'], ['FRESH FISH', '#1a8aa0', '#ffffff', '#ffffff'], ['PIER 9', '#444a55', '#ffd23a', '#ffd23a'],
      ['LIGHTHOUSE\nCAFE', '#c04a2a', '#fff4d0', '#fff4d0'], ['CITY BUS', '#2a8a3a', '#ffffff', '#ffffff'], ['COAST\nMOTORS', '#3a3a8a', '#ffffff', '#ff4a4a'], ['SKY HIGH', '#222', '#6ad0ff', '#6ad0ff']]);
    const sg = texBatch(kit, SG.tex);
    const hwT = 17;
    // ---- sunny facade city: dense block of textured buildings along the south side and across the bay
    const pastel = [0xf2e3c8, 0xf3c9b0, 0xdfeaf2, 0xf5e9a8, 0xcfe6d8, 0xf0d0d8, 0xe6e6ea, 0xb9d3ee];
    const tower = (x, z, w, h, d, ry, kind) => {
      const T = kind === 'glass' ? glassT : kind === 'shop' ? aptT : aptT, k = c(kind === 'glass' ? [0xdbe8f5, 0xbfd6ea, 0xe6f0f8, 0xa9c8e4][(rng() * 4) | 0] : pastel[(rng() * pastel.length) | 0]);
      const tiers = h > 60 ? 3 : h > 30 ? 2 : 1; let y = gy, ww = w, dd = d, hh = h;
      for (let t = 0; t < tiers; t++) {
        const ht = t === tiers - 1 ? hh : hh * 0.55;
        T.box(x, y, z, ww, ht, dd, ry, k, 4, 3.6);
        pl.box(x, y + ht, z, ww + 0.5, 0.5, dd + 0.5, ry, c(0x7a828c));
        y += ht + 0.5; hh -= ht; ww *= 0.72; dd *= 0.72;
      }
      if (h > 50) { rod(pl, [x, y, z], [x, y + 10 + rng() * 8, z], 0.12, c(0xcfd4da)); lamps.box(x - 0.3, y + 12, z - 0.3, 0.6, 0.6, 0.6, 0, c(0xff4a3a)); }
      else { pl.box(x - ww * 0.2, y, z, 2.4, 1.4, 2.4, ry, c(0xaab0b8)); pl.frustum(x + ww * 0.2, y, z + dd * 0.15, 1.3, 1.3, 1.8, 8, c(0x8a6a4a), 0); }
    };
    // skyline across the bay (far shore), two ranks
    for (let k = 0; k < 34; k++) { const x = -420 + k * 30 + rng() * 10, z = -560 - rng() * 70; tower(x, z, 18 + rng() * 10, 50 + rng() * 90, 18 + rng() * 10, 0, rng() < 0.7 ? 'glass' : 'apt'); }
    for (let k = 0; k < 26; k++) { const x = -380 + k * 36 + rng() * 14, z = -330 - rng() * 60; if (x > 150 && x < 600) continue; tower(x, z, 14 + rng() * 8, 22 + rng() * 40, 14 + rng() * 8, 0, 'apt'); }
    // waterfront district on the north quay (between road and quay)
    for (let x = -330; x < 200; x += 22 + rng() * 6) { const h = 10 + rng() * 22; tower(x, -112 - rng() * 12, 16 + rng() * 6, h, 12 + rng() * 5, 0, rng() < 0.4 ? 'glass' : 'apt'); }
    // city blocks south of the start straight and along the home stretch
    kit.scatter(170, 5, 90, 16, (x, z, i, r) => {
      if (inBay(x, z) || (x > 200 && x < 560 && z > 90) || kit.px[i] > 560) return;
      tower(x, z, 9 + r() * 7, 8 + r() * 28, 9 + r() * 7, ((r() * 4) | 0) * 1.5708, r() < 0.3 ? 'glass' : 'apt');
    });
    // billboards + shop awnings along the first straight and near the tunnel
    const bbSpots = [[45, 1, 8], [150, -1, 9], [290, -1, 13], [60, -1, 1], [1330, 1, 14], [1230, -1, 15], [1440, 1, 0]];
    bbSpots.forEach(([d, s, i]) => {
      const p = kit.at(d, s * (hwT + 7), 0), f = kit.frame(d), ry = Math.atan2(-s * f.rx, -s * f.rz);
      if (inBay(p[0], p[2]) || p[1] > 3) return;
      pl.box(p[0] - 5, p[1], p[2], 0.4, 7, 0.4, 0, c(0x6a727c)); pl.box(p[0] + 5, p[1], p[2], 0.4, 7, 0.4, 0, c(0x6a727c));
      const cc = Math.cos(ry), ss = Math.sin(ry);
      signQuad(sg, SG, i, p[0], p[1] + 7, p[2], 12, 4.6, ry); void cc; void ss;
    });
    // road signs gantry before the bridge (overhead sign over the road)
    {
      const d = 128, f = kit.frame(d), hd = Math.atan2(f.tx, f.tz), ry = hd + PI;
      for (let s = -1; s <= 1; s += 2) { const p = kit.at(d, s * (hwT + 1.2), 0); pl.box(p[0] - 0.4, p[1], p[2] - 0.4, 0.8, 9.5, 0.8, hd, c(0x4a525c)); }
      const q = kit.at(d, 0, 8.4); pl.box(q[0] - 0.4, q[1], q[2], 2 * hwT + 3, 0.7, 0.7, hd, c(0x4a525c));
      const sp = kit.at(d, 0, 8.9); signQuad(sg, SG, 8, sp[0], sp[1], sp[2], 16, 4.2, ry);
      void q;
    }
    // toll plaza canopy at the bridge approach
    {
      const d = 62, f = kit.frame(d), hd = Math.atan2(f.tx, f.tz);
      for (let s = -1; s <= 1; s += 2) { const p = kit.at(d, s * (hwT + 4), 0); pl.box(p[0] - 1, p[1], p[2] - 1, 2, 9, 2, hd, c(0xf2f2f2)); pl.box(p[0] - 1.6, p[1], p[2] - 4, 3.2, 1.8, 8, hd, c(0xd9482b)); pl.box(p[0] - 1.2, p[1] + 1.8, p[2] - 3.8, 2.4, 1.6, 7.6, hd, c(0x6fb8e8)); }
      const q = kit.at(d, 0, 9); pl.box(q[0], q[1], q[2], 2 * (hwT + 5), 1.4, 7, hd, c(0xf2f2f2)); const q2 = kit.at(d, 0, 10.4); pl.box(q2[0], q2[1], q2[2], 2 * (hwT + 5) + 1, 0.5, 7.6, hd, c(0xd9482b));
      for (let l = -hwT + 3; l <= hwT - 2; l += 8.5) { const g = kit.at(d - 3.6, l, 8.4); lamps.box(g[0] - 0.7, g[1], g[2] - 0.7, 1.4, 0.4, 1.4, 0, c(0x40ff70)); glow.cross(g[0], g[1] + 0.2, g[2], 1.6, mulK(c(0x30a050), 0.7)); }
      signQuad(sg, SG, 9, q[0] - f.tx * 3.6, q[1] + 1.4, q[2] - f.tz * 3.6, 12, 3, hd + PI);
    }
    // ---- harbor: cranes, containers, cargo ships on the north quay and warehouses
    const cont = [0xd9482b, 0x2f78d0, 0xf2c230, 0x3fae5c, 0xe8e8e8, 0xff7a1a, 0x7a4ab0];
    const containerStack = (x, y, z, ry, nx, nz, hgt) => { for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) for (let k = 0; k < hgt; k++) pl.box(x + Math.cos(ry) * i * 2.6 + Math.sin(ry) * j * 6.4, y + k * 2.7, z - Math.sin(ry) * i * 2.6 + Math.cos(ry) * j * 6.4, 2.4, 2.6, 6.1, ry, c(cont[((i * 3 + j * 5 + k * 2) | 0) % cont.length])); };
    for (let k = 0; k < 6; k++) containerStack(-290 + k * 50 + rng() * 10, gy, -118 - rng() * 6, 0, 6, 1, 1 + ((rng() * 3) | 0));
    for (let k = 0; k < 4; k++) { // gantry cranes
      const x = -260 + k * 90, z = -128;
      for (const dx of [-7, 7]) { pl.box(x + dx - 0.6, gy, z - 0.6, 1.2, 28, 1.2, 0, c(0xe9a21c)); }
      pl.box(x - 8, gy + 26, z - 0.8, 16, 1.6, 1.6, 0, c(0xe9a21c)); pl.box(x - 1.2, gy + 26, z - 24, 2.4, 1.6, 40, 0, c(0xe9a21c)); pl.box(x - 1, gy + 16, z - 12, 2, 10, 2, 0, c(0x4a5560));
      for (let t = 0; t < 4; t++) rod(pl, [x, gy + 27.5, z - 22 + t * 3], [x, gy + 27.5, z - 22 + t * 3 + 6], 0.08, c(0xcccccc));
    }
    for (let k = 0; k < 3; k++) { // cargo ships moored at the quay
      const x = -230 + k * 150, z = -158, bb = new kit.Batch(), hull = c([0x2a3a5a, 0x7a1f1f, 0x1f5a4a][k]);
      bb.box(0, -1, 0, 70, 7, 17, 0, hull); bb.box(0, 4, 0, 70.4, 1.4, 17.4, 0, c(0xcfd4da)); bb.box(-24, 5.4, 0, 14, 11, 14, 0, c(0xf4f0e6)); bb.box(-24, 16.4, 0, 12, 1.2, 12, 0, c(0x2f4a6a)); bb.box(-24, 8, 0, 14.2, 1.6, 14.2, 0, c(0x27384a));
      bb.frustum(-30, 16.4, 0, 2.4, 2.1, 5, 10, c(0xd9482b), 0);
      for (let q = 0; q < 5; q++) for (let r2 = 0; r2 < 2; r2++) for (let h = 0; h < 2; h++) bb.box(-8 + q * 8, 5.4 + h * 2.7, -4.4 + r2 * 5.6, 7.6, 2.6, 2.6, 0, c(cont[(q + r2 * 3 + h) % cont.length]));
      const m = kit.mesh(bb); if (m) { m.position.set(x, gy + 0.1, z); kit.bob(m, 0.12, 0.7, k, 0.01); }
    }
    for (let k = 0; k < 7; k++) { const x = -330 + k * 52; tower(x + 20, -104, 20, 9, 10, 0, 'apt'); }
    // ---- beach life: umbrellas, palms, lifeguard hut, volleyball
    for (let k = 0; k < 26; k++) {
      const x = 240 + rng() * 290, z = 130 + rng() * 14, uc = [0xd9482b, 0x2f78d0, 0xf2c230, 0xffffff, 0x3fae5c][k % 5];
      rod(pl, [x, gy, z], [x, gy + 3, z], 0.05, c(0xdddddd)); pl.frustum(x, gy + 2.5, z, 2, 0, 0.8, 8, c(uc), k);
      pl.box(x + 1.2, gy, z + 1.4, 1.6, 0.1, 0.8, k * 0.7, c([0xff7ab0, 0x35c0d9, 0xffe14a][k % 3]));
    }
    for (let k = 0; k < 18; k++) { const x = 236 + k * 18 + rng() * 6; palm(fb, c, x, gy, 146 + rng() * 8, 1 + rng() * 0.5, rng); }
    pl.box(380, gy, 140, 3, 3.4, 3, 0, c(0xf2f2f2)); pl.box(379, gy + 3.4, 139, 5, 0.5, 5, 0, c(0xd9482b)); pl.box(400, gy, 136, 0.15, 3, 0.15, 0, c(0xcccccc)); pl.box(408, gy, 136, 0.15, 3, 0.15, 0, c(0xcccccc)); pl.box(400, gy + 2.2, 136, 8, 0.8, 0.08, 0, c(0xffffff));
    // ---- bridge details: cross-bracing, deck lamps in pairs, nav lights, tower plaques
    const high = scanD(kit, 0, L * 0.5, (i) => kit.py[i] > 8.6), dT1 = high[0] + 14, dT2 = high[1] - 14;
    [dT1, dT2].forEach((dT) => {
      const f = kit.frame(dT), hd = Math.atan2(f.tx, f.tz), lat = hwT + 2.4;
      for (const [h0, h1] of [[6, 24], [24, 44]]) { const p = kit.at(dT, -lat, h0), q2 = kit.at(dT, lat, h1), p2 = kit.at(dT, lat, h0), q3 = kit.at(dT, -lat, h1); rod(pl, p, q2, 0.28, c(0xb8452c)); rod(pl, p2, q3, 0.28, c(0xb8452c)); }
      for (let s = -1; s <= 1; s += 2) { const p = kit.at(dT, s * (hwT + 2.4), 46); pl.box(p[0] - 1.8, p[1], p[2] - 1.8, 3.6, 2.4, 3.6, hd, c(0xb8452c)); lamps.box(p[0] - 0.5, p[1] + 2.4, p[2] - 0.5, 1, 1, 1, 0, c(0xff5040)); glow.cross(p[0], p[1] + 2.9, p[2], 1.8, mulK(c(0xff3020), 0.6)); }
    });
    for (let d = dT1 - 40; d < dT2 + 40; d += 24) for (let s = -1; s <= 1; s += 2) {
      const p = kit.at(d, s * (hwT + 0.8), 0), f = kit.frame(d), ry = Math.atan2(-s * f.rx, -s * f.rz);
      const head = lampPost(pl, lamps, p[0], p[1] + 0.9, p[2], 6, ry, 1.5, c(0xe8e8e8), c(0xfff3b8));
      glow.cross(head[0], head[1] - 0.2, head[2], 1.2, mulK(c(0xffe9a0), 0.55)); glow.pool(head[0] + (kit.at(d, 0, 0)[0] - p[0]) * 0.2, p[1] + 1.0, head[2] + (kit.at(d, 0, 0)[2] - p[2]) * 0.2, 6, [0.28, 0.24, 0.12]);
    }
    // pier foam rings
    // ---- road decals
    {
      const D = decalSet(kit, [arrowDraw('rgba(255,255,255,0.92)'), chevDraw('rgba(255,235,120,0.9)'), logoDraw('SPLASH\nCOLA', '#d9332b', '#ffffff'), logoDraw('TURBO\nTIRES', '#202630', '#ffd23a'), logoDraw('BAYCAST', '#1f5fb0', '#ffffff'), logoDraw('KART\nKING', '#f06a1a', '#ffffff')]);
      for (let d = 190; d < L - 120; d += 95) { const lane = (((d / 95) | 0) & 1) ? 6 : -6; if (d > 430 && d < 560) continue; D.add(d, lane, 11, 4.2, 0); }
      [[170, 2], [330, 3], [480, 4], [760, 5], [900, 2], [1030, 3], [1250, 4]].forEach(([d, i]) => D.add(d, ((d / 10) | 0) & 1 ? -5 : 5, 8, 8, i));
      for (let d = 20; d < L - 40; d += 130) D.add(d + 40, 0, 8, 3.2, 1, [0.9, 0.9, 0.7]);
      D.done();
    }
    // lamp posts / benches / bollards / flower planters along the city roadside
    along(kit, 14, L - 20, 26, (d, f) => {
      if (f.y > 1.2 || inBay(f.x, f.z) || (d > 880 && d < 1010)) return;
      const s = ((d / 26) | 0) & 1 ? 1 : -1, p = kit.at(d, s * (hwT + 2.4), 0), ry = Math.atan2(-s * f.rx, -s * f.rz);
      const head = lampPost(pl, lamps, p[0], p[1], p[2], 6.4, ry, 1.8, c(0x35404a), c(0xfff3b8));
      glow.cross(head[0], head[1] - 0.2, head[2], 1.3, mulK(c(0xffe9a0), 0.55)); glow.pool(p[0] + f.rx * -s * 1.8, p[1] + 0.1, p[2] + f.rz * -s * 1.8, 6.5, [0.3, 0.26, 0.12]);
      const q = kit.at(d + 9, s * (hwT + 3.2), 0); bench(pl, q[0], q[1], q[2], Math.atan2(f.tx, f.tz), c(0x9a6a3a), c(0x35404a));
      const w = kit.at(d + 15, s * (hwT + 3.6), 0); pl.box(w[0] - 1.2, w[1], w[2] - 0.5, 2.4, 0.7, 1, Math.atan2(f.tx, f.tz), c(0xb9aea0));
      for (let k = 0; k < 5; k++) pl.blob(w[0] + (rng() - 0.5) * 2, w[1] + 0.8, w[2] + (rng() - 0.5) * 0.6, 0.4, 0.3, 0.4, c([0xff5a6a, 0xffe14a, 0xff9ae0, 0xffffff][k % 4]), 0);
    });
    // rocks + shrubs + flowers on the headland and quays
    kit.scatter(80, 3, 26, 22, (x, z, i, r) => { if (inBay(x, z)) return; if (r() < 0.5) rocks(pl, c, x, gy, z, 1 + r() * 2, r, [0x8e8a84, 0xa5a198]); else fb.blob(x, gy + 0.5, z, 1.4 + r(), 1 + r() * 0.5, 1.4 + r(), mix3(c(0x3f9f45), c(0x58c25a), r()), 0); });
    // sun-bleached hills on the horizon behind the city
    kit.farScatter(10, 220, (x, z, r) => { if (inBay(x, z)) return; const s = 50 + r() * 60; pl.blob(x, gy - 8, z, s * 1.6, s * 0.7, s, mix3(c(0x5fa65a), c(0x7cc070), r()), 1); });
    // seagulls + sailboat sparkle
    kit.birds({ cx: 120, cz: 40, y: 30, radius: 70, count: 5, speed: 0.12, size: 1.2 });
    kit.mesh(pl); kit.mesh(lamps, {}, true);
    glassT.done(); aptT.done(); sg.done(); kit.foliage(fb); glow.done();
  }
  // ===================================================================== 2 CASTLE CIRCUIT beauty
  function gableHouse(T, pl, c, x, z, w, d, floors, ry, wall, roof, th) {
    const hgt = floors * th, co = Math.cos(ry), si = Math.sin(ry), V = (lx, lz, y) => [x + lx * co + lz * si, y, z - lx * si + lz * co];
    const y0 = T.y0 || 0, hx = w / 2, hz = d / 2, ox = hx * 1.12, oz = hz * 1.14, rh = Math.min(hx, hz) * 0.95 + 1.2;
    T.box(x, y0, z, w, hgt, d, ry, wall, 3.5, th);
    const L0 = V(-ox, -oz, y0 + hgt), L1 = V(ox, -oz, y0 + hgt), R0 = V(-ox, oz, y0 + hgt), R1 = V(ox, oz, y0 + hgt), M0 = V(-ox, 0, y0 + hgt + rh), M1 = V(ox, 0, y0 + hgt + rh);
    pl.quad(L0, L1, M1, M0, roof); pl.quad(R1, R0, M0, M1, roof);
    pl.tri(V(-hx, -hz, y0 + hgt), V(-hx, hz, y0 + hgt), V(-hx, 0, y0 + hgt + rh * 0.92), c(0xf0e6d0)); pl.tri(V(hx, hz, y0 + hgt), V(hx, -hz, y0 + hgt), V(hx, 0, y0 + hgt + rh * 0.92), c(0xf0e6d0));
    const ch = V(hx * 0.5, hz * 0.2, y0 + hgt + rh * 0.4); pl.box(ch[0] - 0.5, ch[1], ch[2] - 0.5, 1, rh * 0.8 + 1.6, 1, 0, c(0x8a5a48));
    const dr = V(0, -hz - 0.05, y0); pl.box(dr[0] - 0.55, dr[1], dr[2] - 0.55, 1.1, 2.2, 1.1, ry, c(0x5a3a26));
    return ch;
  }
  function ccBeauty(track, kit) {
    const c = kit.col, rng = kit.rng, L = kit.length, gy = kit.groundY, hwT = 17;
    const tudorT = texBatch(kit, ctex(kit, 128, 128, drawFacade('tudor'))), stoneT = texBatch(kit, ctex(kit, 128, 128, drawFacade('stone')));
    const pl = new kit.Batch(), lamps = new kit.Batch(), fb = new kit.Batch(), glow = glowSet(kit);
    const roofs = [c(0xb23a3e), c(0x3a58b0), c(0xc4622b), c(0x4a8a6a)];
    const G0 = 92, G1 = 226, WL = 40;
    const gateZone = (d) => d > G0 - 70 && d < G1 + 40, tunZone = (d) => d > 920 && d < 1070;
    const smokeEm = [];
    // ---- village clusters along the road (outside the castle and tunnel)
    const clusters = [[300, 1], [345, -1], [420, 1], [470, -1], [640, 1], [690, -1], [760, 1], [810, -1], [1120, 1], [1170, -1], [1250, 1], [1300, -1], [1380, 1]];
    clusters.forEach(([d0, s], ci) => {
      let off = 0;
      for (let k = 0; k < 3; k++) {
        const d = d0 + k * 13 + rng() * 4, f = kit.frame(d), l = s * (hwT + 12 + rng() * 10 + (k & 1) * 8), p = kit.at(d, l, 0);
        if (!kit.clear(p[0], p[2], 22) && !kit.clear(p[0], p[2], 16)) continue;
        const ry = Math.atan2(f.tx, f.tz) + (rng() < 0.5 ? 0 : PI / 2) * 0, w = 7 + rng() * 4, dd = 6 + rng() * 3, fl = rng() < 0.4 ? 3 : 2;
        const ch = gableHouse(tudorT, pl, c, p[0], p[2], w, dd, fl, Math.atan2(-s * f.rx, -s * f.rz) + PI / 2 * ((k + ci) & 1) * 0, c([0xfff4e0, 0xf6e4c8, 0xf2efe6][(rng() * 3) | 0]), roofs[(rng() * 4) | 0], 3);
        if (rng() < 0.5) smokeEm.push([ch[0], ch[1] + 4, ch[2]]);
        // garden fence + flowers
        for (let q = 0; q < 6; q++) { const a = kit.at(d - 6 + q * 2.4, l - s * 6, 0); pl.box(a[0] - 0.05, a[1], a[2] - 0.05, 0.1, 1.0, 0.1, 0, c(0xf6f2ea)); pl.box(a[0] - 1.2, a[1] + 0.6, a[2], 2.4, 0.1, 0.1, Math.atan2(f.tx, f.tz), c(0xf6f2ea)); }
        for (let q = 0; q < 7; q++) { const a = kit.at(d - 5 + rng() * 10, l - s * (4 + rng() * 1.6), 0); fb.blob(a[0], a[1] + 0.3, a[2], 0.45, 0.35, 0.45, c([0xff5a6a, 0xffe14a, 0xff9ae0, 0xffffff, 0xb08cff][q % 5]), 0); }
      }
    });
    // market stalls + well + hay + barrels + carts near villages
    [[320, -1], [660, 1], [1140, -1]].forEach(([d, s], k) => {
      const f = kit.frame(d), hd = Math.atan2(f.tx, f.tz);
      for (let q = 0; q < 3; q++) {
        const p = kit.at(d + q * 7, s * (hwT + 6), 0), st = [0xe0483c, 0x3a58b0, 0xf2c230][(q + k) % 3];
        for (const dx of [-1.6, 1.6]) for (const dz of [-1, 1]) pl.box(p[0] + Math.cos(hd) * dz * 1.0 + Math.sin(hd) * dx - 0.07, p[1], p[2] - Math.sin(hd) * dz * 1.0 + Math.cos(hd) * dx - 0.07, 0.14, 2.4, 0.14, 0, c(0x8a5a2b));
        pl.box(p[0] - 1.8, p[1] + 0.9, p[2] - 1.1, 3.6, 0.15, 2.2, hd, c(0x9a6a3a));
        for (let a = 0; a < 6; a++) pl.box(p[0] + Math.sin(hd) * (-1.75 + a * 0.7) - 0.35, p[1] + 2.4, p[2] + Math.cos(hd) * (-1.75 + a * 0.7) - 0.35, 0.7, 0.14, 2.6, hd, a & 1 ? c(st) : c(0xffffff));
        for (let a = 0; a < 5; a++) pl.blob(p[0] + (rng() - 0.5) * 2.4, p[1] + 1.15, p[2] + (rng() - 0.5), 0.22, 0.2, 0.22, c([0xe0483c, 0xf2c230, 0x3fae5c][a % 3]), 0);
      }
      const w = kit.at(d + 26, s * (hwT + 8), 0); pl.frustum(w[0], w[1], w[2], 1.5, 1.4, 1.2, 10, c(0x9a9484), 0); pl.box(w[0] - 1.7, w[1] + 1.2, w[2] - 0.1, 0.2, 2.2, 0.2, 0, c(0x6a4a2a)); pl.box(w[0] + 1.5, w[1] + 1.2, w[2] - 0.1, 0.2, 2.2, 0.2, 0, c(0x6a4a2a)); pl.box(w[0] - 2, w[1] + 3.3, w[2] - 0.6, 4, 0.3, 1.2, 0, c(0xb23a3e));
      for (let q = 0; q < 3; q++) { const h = kit.at(d - 6 - q * 3, s * (hwT + 9 + q), 0); pl.frustum(h[0], h[1], h[2], 1.5, 0.2, 2.4, 8, c(0xe0c060), 0); barrel(pl, h[0] + 2, h[1], h[2] + 1.5, 0.55, c(0x8a5a2b), c(0x3a2a1a)); }
    });
    // ---- hedges, topiary and flower beds hugging the road
    const hedgeC = [c(0x2f7a3a), c(0x3a8a42)];
    const hedge = (d0, d1, s, lat, h) => { for (let d = d0; d < d1; d += 3) { const p = kit.at(d, s * lat, 0), f = kit.frame(d), hd = Math.atan2(f.tx, f.tz), hh = h * (0.9 + 0.2 * Math.sin(d * 0.7)); pl.box(p[0] - 0.9, p[1], p[2] - 0.9, 1.8, hh, 3.2, hd, hedgeC[((d / 3) | 0) & 1]); pl.blob(p[0], p[1] + hh, p[2], 1.2, 0.5, 1.8, hedgeC[1], 0); if (((d / 3) | 0) % 5 === 0) { pl.frustum(p[0], p[1] + hh, p[2], 0.8, 0.8, 0.5, 8, c(0xb7ad98), 0); pl.blob(p[0], p[1] + hh + 1.3, p[2], 0.9, 1.0, 0.9, c(0x3a9a46), 0); } } };
    const bedsC = [0xff5a6a, 0xffe14a, 0xff9ae0, 0xffffff, 0xb08cff, 0xff9a3a];
    const flowerBed = (d0, d1, s, lat) => { for (let d = d0; d < d1; d += 2.2) { const p = kit.at(d, s * lat, 0), f = kit.frame(d); pl.box(p[0] - 0.8, p[1], p[2] - 0.8, 1.6, 0.35, 2.2, Math.atan2(f.tx, f.tz), c(0x6a4a2a)); for (let k = 0; k < 4; k++) fb.blob(p[0] + (rng() - 0.5) * 1.2, p[1] + 0.5, p[2] + (rng() - 0.5) * 1.6, 0.34, 0.3, 0.34, c(bedsC[(((d / 2.2) | 0) + k) % 6]), 0); } };
    [[10, 80], [250, 300], [480, 600], [700, 900], [1070, 1110], [1130, 1200], [1260, 1330]].forEach(([a, b], i) => { hedge(a, b, i & 1 ? -1 : 1, hwT + 3.6, 1.6); flowerBed(a + 4, b - 4, i & 1 ? -1 : 1, hwT + 6); });
    [[300, 400], [800, 920], [1200, 1300]].forEach(([a, b], i) => { hedge(a, b, i & 1 ? 1 : -1, hwT + 3.6, 1.6); flowerBed(a + 4, b - 4, i & 1 ? 1 : -1, hwT + 6); });
    // picket fence along gate approach
    // ---- moat water + drawbridge approaches, castle wall stone detail
    {
      const mw = kit.waterMat({ color: 0x3aa7e0, deep: 0x1a5a9a, opacity: 0.92 });
      for (const s of [-1, 1]) { kit.ribbon(G0 - 46, G0 - 2, s * (hwT + 4.2), s * (hwT + 22), gy + 0.15, mw, { step: 6 }); kit.ribbon(G1 + 2, G1 + 40, s * (hwT + 4.2), s * (hwT + 22), gy + 0.15, mw, { step: 6 }); kit.ribbon(G0 + 8, G1 - 6, s * (WL + 3), s * (WL + 10), gy + 0.15, mw, { step: 6 }); }
      for (const dg of [G0, G1]) { const f = kit.frame(dg), hd = Math.atan2(f.tx, f.tz); for (let s = -1; s <= 1; s += 2) for (let k = 0; k < 2; k++) { const p = kit.at(dg + (dg === G0 ? -1 : 1) * (6 + k * 18), s * (hwT + 0.2), 0); pl.box(p[0] - 0.3, p[1], p[2] - 0.3, 0.6, 1.4, 0.6, hd, c(0x6a4a2a)); } }
      // stone abutments of the gate bridges
      for (const dg of [G0, G1]) { const sgn = dg === G0 ? -1 : 1; for (let s = -1; s <= 1; s += 2) { const p = kit.at(dg + sgn * 24, s * (hwT + 12), 0), f = kit.frame(dg); stoneT.box(p[0], gy - 0.5, p[2], 3, 3.2, 40, Math.atan2(f.tx, f.tz), c(0xd3cab6), 4, 4); } }
    }
    // stone buttresses + arrow slits on courtyard walls
    for (let s = -1; s <= 1; s += 2) for (let d = G0 + 12; d < G1 - 8; d += 14) { const p = kit.at(d, s * (WL + 1.2), 0), f = kit.frame(d), hd = Math.atan2(f.tx, f.tz); stoneT.box(p[0] - 1, p[1], p[2] - 1.5, 2, 12.2, 3, hd, c(0xc9bfa8), 4, 4); const q = kit.at(d + 7, s * (WL - 0.1), 6); pl.box(q[0] - 0.1, q[1], q[2] - 0.5, 0.35, 2.2, 0.5, hd, c(0x2a2622)); }
    // banners + torches + heraldic poles through the courtyard & gate approaches
    for (let d = G0 - 40; d < G1 + 40; d += 16) for (let s = -1; s <= 1; s += 2) {
      if (d > G0 - 6 && d < G0 + 6) continue; if (d > G1 - 6 && d < G1 + 6) continue;
      const p = kit.at(d, s * (hwT + 1.0), 0), f = kit.frame(d), ry = Math.atan2(f.tx, f.tz) + PI / 2;
      rod(pl, [p[0], p[1], p[2]], [p[0], p[1] + 7.5, p[2]], 0.12, c(0x4a3a2a));
      kit.banner(p[0], p[1] + 2.4, p[2], 1.8, 4.6, ry, (((d / 16) | 0) + (s > 0 ? 1 : 0)) & 1 ? [0xb23a3e, 0xe8b830] : [0x3a58b0, 0xffffff], { pattern: 'vstripes', amp: 0.2 });
      const t = kit.at(d + 8, s * (hwT + 0.8), 0); pl.box(t[0] - 0.1, t[1], t[2] - 0.1, 0.2, 2.8, 0.2, 0, c(0x35302a)); lamps.blob(t[0], t[1] + 3.0, t[2], 0.35, 0.5, 0.35, c(0xffb040), 0); glow.cross(t[0], t[1] + 3.0, t[2], 1.7, mulK(c(0xff9a30), 0.75)); glow.pool(t[0], t[1] + 0.12, t[2], 4.5, [0.28, 0.17, 0.05]);
    }
    // iron lantern posts along the whole road
    along(kit, 20, L - 20, 38, (d, f) => { if (gateZone(d) || tunZone(d)) return; const s = ((d / 38) | 0) & 1 ? 1 : -1, p = kit.at(d, s * (hwT + 2.2), 0), ry = Math.atan2(-s * f.rx, -s * f.rz); const h = lampPost(pl, lamps, p[0], p[1], p[2], 5, ry, 1.4, c(0x2a2d33), c(0xfff0c0)); glow.cross(h[0], h[1] - 0.2, h[2], 1.2, mulK(c(0xffe0a0), 0.5)); });
    // ---- landscape: rolling hills with trees, big rocks, far snowy mountains
    kit.scatter(70, 24, 140, 26, (x, z, i, r) => { const sz = 14 + r() * 20; pl.blob(x, gy - sz * 0.25, z, sz * 1.5, sz * 0.55, sz * 1.1, mix3(c(0x5cb04a), c(0x4a9a3e), r()), 1); for (let k = 0; k < 4; k++) { const a = r() * 6.28, rr = r() * sz * 0.7; tree(fb, c, x + Math.cos(a) * rr, gy + sz * 0.3 - rr * 0.1, z + Math.sin(a) * rr, 0.9 + r() * 0.6, r, r() < 0.4 ? 'pine' : 'round'); } });
    kit.scatter(70, 3, 30, 22, (x, z, i, r) => { if (r() < 0.55) rocks(pl, c, x, gy, z, 0.8 + r() * 1.6, r, [0x8a8a86, 0xa8a8a0]); else for (let k = 0; k < 5; k++) fb.blob(x + (r() - 0.5) * 3, gy + 0.3, z + (r() - 0.5) * 3, 0.4, 0.3, 0.4, c(bedsC[(r() * 6) | 0]), 0); });
    // road decals
    {
      const crest = (g, w, h) => { g.fillStyle = '#e8b830'; g.beginPath(); g.moveTo(w * 0.12, h * 0.08); g.lineTo(w * 0.88, h * 0.08); g.lineTo(w * 0.88, h * 0.5); g.quadraticCurveTo(w * 0.88, h * 0.85, w * 0.5, h * 0.95); g.quadraticCurveTo(w * 0.12, h * 0.85, w * 0.12, h * 0.5); g.fill(); g.fillStyle = '#b23a3e'; g.fillRect(w * 0.2, h * 0.16, w * 0.6, h * 0.34); g.fillStyle = '#3a58b0'; g.beginPath(); g.moveTo(w * 0.2, h * 0.5); g.lineTo(w * 0.8, h * 0.5); g.quadraticCurveTo(w * 0.8, h * 0.78, w * 0.5, h * 0.86); g.quadraticCurveTo(w * 0.2, h * 0.78, w * 0.2, h * 0.5); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(w * 0.5, h * 0.5, w * 0.09, 0, 7); g.fill(); };
      const D = decalSet(kit, [arrowDraw('rgba(255,255,255,0.9)'), crest, logoDraw('ROYAL\nCOLA', '#3a58b0', '#ffe9a0'), chevDraw('rgba(255,235,120,0.9)')]);
      for (let d = 60; d < L - 60; d += 85) { if (d > G0 - 3 && d < G1 + 3) continue; D.add(d, ((d / 85) | 0) & 1 ? 6 : -6, 11, 4.2, 0); }
      D.add(G0 - 20, 0, 12, 12, 1); D.add(G1 + 20, 0, 12, 12, 1); D.add(540, 0, 10, 10, 2); D.add(1000 - 140, 0, 10, 10, 2);
      D.done();
    }
    if (smokeEm.length) kit.particles({ emitters: smokeEm, count: 5, vel: [0.5, 2.2, 0.2], spread: [0.2, 0.4, 0.2], life: 4, size: 2.2, grow: 2.2, alpha: 0.45, pow: 1.2, wob: 0.6, color: [0xf0f0f4, 0xd8d8e0] });
    kit.mesh(pl); kit.mesh(lamps, {}, true); tudorT.done(); stoneT.done(); kit.foliage(fb); glow.done();
  }
  // ===================================================================== 3 DAYDREAM CRUISER beauty
  function dcBeauty(track, kit) {
    const c = kit.col, rng = kit.rng, L = kit.length, N = kit.N, ds = kit.ds, hwT = 17;
    const pl = new kit.Batch(), lamps = new kit.Batch(), fb = new kit.Batch(), glow = glowSet(kit);
    const cabT = texBatch(kit, ctex(kit, 128, 128, drawFacade('cabin')));
    const SG = signAtlas(kit, [['DAYDREAM\nCRUISER', '#0f4a8a', '#ffe9a0', '#f2c230'], ['SUNSET BAR', '#c8402a', '#fff4d0', '#fff4d0'], ['POOL DECK', '#1a8aa0', '#ffffff', '#ffffff'], ['SPLASH\nCOLA', '#d9332b', '#ffffff', '#ffd23a'],
      ['GRAND\nSALON', '#5a2a1a', '#ffd890', '#ffd890'], ['LIDO CAFE', '#3a8a5a', '#ffffff', '#ffffff'], ['SKY LOUNGE', '#2a2a6a', '#ffd23a', '#ffd23a'], ['WELCOME\nABOARD', '#1f5fb0', '#ffffff', '#ffd23a']]);
    const sg = texBatch(kit, SG.tex);
    const gold = c(0xe2b04a), white = c(0xf4f0e6);
    const Y = DECK + 0.05;
    const dA = track._hall || [680, 840];
    // ---- lounger rows, umbrellas, palms on the two outer deck strips
    for (let s = -1; s <= 1; s += 2) for (let x = 10; x < 400; x += 6) {
      if (x > 340 || (x % 12) > 6.1) continue;
      const z = s * (96 + (x % 24 < 12 ? 0 : 6)), ry = s > 0 ? PI : 0;
      pl.box(x - 0.55, DECK, z - 1.1, 1.1, 0.4, 2.2, ry, c(((x / 6) | 0) & 1 ? 0xffe14a : 0xffffff)); pl.box(x - 0.55, DECK + 0.3, z + (s > 0 ? 1.0 : -1.0) - 0.15, 1.1, 0.7, 0.3, ry, c(0xffffff));
      if (((x / 12) | 0) % 2 === 0) { rod(pl, [x + 2, DECK, z], [x + 2, DECK + 3.3, z], 0.06, c(0xeeeeee)); pl.frustum(x + 2, DECK + 2.9, z, 2.3, 0, 0.9, 8, c([0xd9482b, 0x2f78d0, 0xf2c230, 0x3fae5c][((x / 12) | 0) % 4]), x); }
    }
    // potted palms and planters along both road edges
    for (let s = -1; s <= 1; s += 2) for (let x = 20; x < 380; x += 30) { const z = s * 90; pl.frustum(x, DECK, z, 0.8, 0.65, 0.9, 8, c(0xc4622b), 0); palm(fb, c, x, DECK + 0.8, z, 0.7, rng); }
    // ---- sports court + helipad + bar + cabins in the open centre deck
    {
      const cx = 140, cz = 0, court = c(0x2f78d0), line = c(0xffffff);
      pl.box(cx - 20, DECK, cz - 14, 40, 0.25, 28, 0, c(0x1f6a52)); pl.box(cx - 17, DECK + 0.25, cz - 11, 34, 0.1, 22, 0, court);
      for (const [x0, z0, w, d] of [[-17, -11, 34, 0.25], [-17, 10.75, 34, 0.25], [-17, -11, 0.25, 22], [16.75, -11, 0.25, 22], [-0.1, -11, 0.25, 22]]) pl.box(cx + x0, DECK + 0.35, cz + z0, w, 0.05, d, 0, line);
      pl.box(cx - 0.1, DECK, cz - 11.1, 0.2, 1.2, 0.2, 0, c(0xdddddd)); pl.box(cx - 0.1, DECK, cz + 10.9, 0.2, 1.2, 0.2, 0, c(0xdddddd)); pl.box(cx - 0.05, DECK + 0.6, cz - 11, 0.1, 0.6, 22, 0, c(0xffffff));
      for (let k = 0; k <= 8; k++) for (const sz of [-14, 14]) rod(pl, [cx - 20 + k * 5, DECK, cz + sz], [cx - 20 + k * 5, DECK + 4, cz + sz], 0.07, c(0x4a525c));
      for (const sx of [-20, 20]) for (let k = 0; k <= 5; k++) rod(pl, [cx + sx, DECK, cz - 14 + k * 5.6], [cx + sx, DECK + 4, cz - 14 + k * 5.6], 0.07, c(0x4a525c));
      // helipad
      const hx = 292, hz = 6; pl.frustum(hx, DECK, hz, 11, 11, 0.18, 24, c(0x4a525c), 0); pl.frustum(hx, DECK + 0.18, hz, 9.4, 9.4, 0.02, 24, c(0xf2c230), 0); pl.frustum(hx, DECK + 0.2, hz, 8.8, 8.8, 0.02, 24, c(0x4a525c), 0);
      pl.box(hx - 3, DECK + 0.22, hz - 4, 1.2, 0.02, 8, 0, white); pl.box(hx + 1.8, DECK + 0.22, hz - 4, 1.2, 0.02, 8, 0, white); pl.box(hx - 3, DECK + 0.22, hz - 0.6, 6, 0.02, 1.2, 0, white);
      for (let a = 0; a < 12; a++) { const an = a / 12 * PI * 2; lamps.box(hx + Math.cos(an) * 10.4 - 0.2, DECK + 0.2, hz + Math.sin(an) * 10.4 - 0.2, 0.4, 0.2, 0.4, 0, c(0xffe9a0)); }
      // sunset bar kiosk
      const bx = 210, bz = 36; pl.box(bx - 5, DECK, bz - 3, 10, 3.4, 6, 0, c(0xf4e2b8)); pl.box(bx - 5.6, DECK + 3.4, bz - 3.6, 11.2, 0.4, 7.2, 0, c(0xc8402a));
      for (let k = 0; k < 8; k++) pl.box(bx - 5.4 + k * 1.4, DECK + 3.8, bz - 3.6, 0.7, 0.25, 7.2, 0, c(0xffffff));
      pl.box(bx - 4.5, DECK + 1.1, bz - 3.2, 9, 0.2, 0.9, 0, c(0x6a4a2a));
      for (let k = 0; k < 6; k++) { pl.frustum(bx - 4 + k * 1.6, DECK, bz - 4.6, 0.35, 0.35, 0.9, 8, c(0xc8402a), 0); }
      signQuad(sg, SG, 1, bx, DECK + 4.4, bz - 3.7, 6, 1.9, PI);
      // cabin blocks
      for (let k = 0; k < 3; k++) for (const sz of [-1, 1]) { const x = 62 + k * 15, z = sz * 36; cabT.box(x, DECK, z - 3, 12, 6.4, 7, 0, c([0xfff4e0, 0xf6e4c8, 0xe8f2f8][k]), 3, 3.2); pl.box(x - 6.3, DECK + 6.4, z - 3.3, 12.6, 0.5, 7.6, 0, c(0x2f6fb0)); pl.box(x - 2.5, DECK + 6.9, z - 1, 5, 1.4, 3, 0, white); }
    }
    // umbrella table sets + loungers scattered over the open lido deck
    [[135, 34], [152, 40], [170, 32], [240, 26], [258, 40], [276, 28], [300, 36], [318, 30], [80, -42], [100, -34], [122, -44], [330, -34], [345, -26], [60, -10], [62, 12]].forEach(([x, z], i) => {
      pl.frustum(x, DECK, z, 0.9, 0.9, 0.9, 10, white, 0); pl.frustum(x, DECK + 0.9, z, 1.5, 1.5, 0.12, 10, c(0xe8dcc0), 0); rod(pl, [x, DECK, z], [x, DECK + 4.2, z], 0.08, c(0xeeeeee));
      pl.frustum(x, DECK + 3.6, z, 3.4, 0, 1.2, 10, c([0xd9482b, 0x2f78d0, 0xf2c230, 0x3fae5c, 0xff7ab0][i % 5]), i); for (let q = 0; q < 4; q++) { const a = q * PI / 2 + i; pl.box(x + Math.cos(a) * 1.9 - 0.3, DECK, z + Math.sin(a) * 1.9 - 0.3, 0.6, 0.9, 0.6, 0, c(0x2f6fb0)); }
    });
    for (let k = 0; k < 10; k++) { const x = 160 + k * 15, z = -57.5; pl.box(x - 0.6, DECK, z - 1.1, 1.2, 0.45, 2.2, 0, c(k & 1 ? 0xffe14a : 0xffffff)); }
    // ---- stern/bow house signage, funnel stripes lights and hull name
    { const f = kit.frame(0); void f; signQuad(sg, SG, 0, -20, DECK + 18, -31.2, 18, 5.6, PI); signQuad(sg, SG, 7, 405, DECK + 6, -22.2, 10, 3, PI); }
    // ---- deck lamps with golden glow along both road edges (outside the hall)
    along(kit, 8, L - 8, 24, (d, f) => {
      if (d > dA[0] - 10 && d < dA[1] + 10) return; if (f.y < 7) return;
      const s = ((d / 24) | 0) & 1 ? 1 : -1, p = kit.at(d, s * (hwT + 2.2), 0), ry = Math.atan2(-s * f.rx, -s * f.rz);
      const h = lampPost(pl, lamps, p[0], p[1], p[2], 5.4, ry, 1.6, gold, c(0xfff0c0));
      glow.cross(h[0], h[1] - 0.2, h[2], 1.3, mulK(c(0xffd890), 0.65)); glow.pool(p[0] - f.rx * s * 1.6 * 0 + Math.sin(ry) * 1.6, p[1] + 0.12, p[2] + Math.cos(ry) * 1.6, 6.5, [0.32, 0.22, 0.1]);
    });
    // ---- hall dressing: sconces + warm halos on chandeliers, gold trim, hanging banners, planters
    for (let d = dA[0] + 14; d < dA[1] - 6; d += 24) { const p = kit.at(d, 0, 0), top = CEIL - 0.9; glow.cross(p[0], top - 2.2, p[2], 1.8, mulK(c(0xffe2a0), 0.22)); glow.pool(p[0], yRfast(kit, d), p[2], 8, [0.07, 0.05, 0.025]); }
    for (let s = -1; s <= 1; s += 2) for (let d = dA[0] + 6; d < dA[1] - 4; d += 12) {
      const p = kit.at(d, s * (hwT + 1.1), 0), f = kit.frame(d); lamps.box(p[0] - 0.25, p[1] + 4.2, p[2] - 0.25, 0.5, 0.7, 0.5, 0, c(0xfff0c0)); glow.cross(p[0] - s * f.rx * 0.5, p[1] + 4.6, p[2] - s * f.rz * 0.5, 0.9, mulK(c(0xffd890), 0.25));
      const q = kit.at(d + 6, s * (hwT + 0.8), 0); pl.box(q[0] - 0.3, q[1], q[2] - 0.3, 0.6, 1.1, 0.6, 0, c(0x8a5a2b)); pl.blob(q[0], q[1] + 1.5, q[2], 0.7, 0.8, 0.7, c(0x3a9a46), 0);
    }
    for (let d = dA[0] + 20; d < dA[1] - 12; d += 36) { const f = kit.frame(d), p = kit.at(d, 0, 4.6); kit.banner(p[0], p[1], p[2], 6, 2.4, Math.atan2(f.tx, f.tz) + PI / 2, [0x8a2a2a, 0xe2b04a], { pattern: 'stripes', amp: 0.15 }); }
    // ---- road decals
    {
      const anchor = (g, w, h) => { g.strokeStyle = '#ffffff'; g.fillStyle = '#ffffff'; g.lineWidth = 16; g.beginPath(); g.arc(w / 2, h * 0.7, w * 0.22, 0, Math.PI); g.stroke(); g.beginPath(); g.moveTo(w / 2, h * 0.2); g.lineTo(w / 2, h * 0.9); g.moveTo(w * 0.3, h * 0.38); g.lineTo(w * 0.7, h * 0.38); g.stroke(); g.beginPath(); g.arc(w / 2, h * 0.14, w * 0.07, 0, 7); g.stroke(); };
      const D = decalSet(kit, [arrowDraw('rgba(255,255,255,0.9)'), anchor, logoDraw('SPLASH\nCOLA', '#d9332b', '#ffffff'), chevDraw('rgba(255,235,120,0.9)')]);
      for (let d = 30; d < L - 30; d += 80) D.add(d, ((d / 80) | 0) & 1 ? 6 : -6, 11, 4.2, 0);
      [150, 420, 700, 1000].forEach((d, i) => D.add(d, 0, 10, 10, i & 1 ? 1 : 2)); D.done();
    }
    // ---- sea: golden islands with palms, far ships and sailboats
    for (let k = 0; k < 8; k++) { const a = (k / 8) * PI * 2 + 0.3, r = 700 + rng() * 260, x = 200 + Math.cos(a) * r, z = Math.sin(a) * r; pl.blob(x, SEA + 0.5, z, 70 + rng() * 40, 3, 60, c(0xf0dca0), 0); for (let q = 0; q < 6; q++) palm(fb, c, x + (rng() - 0.5) * 60, SEA + 2, z + (rng() - 0.5) * 40, 3 + rng() * 2, rng); }
    for (let k = 0; k < 2; k++) {
      const sh = new kit.Batch(); sh.box(0, 0, 0, 12, 4, 56, 0, c([0x7a1f1f, 0x2a3a5a][k])); sh.box(0, 4, 0, 12.2, 1.2, 56.2, 0, white); sh.box(0, 5.2, -8, 9, 4, 22, 0, white); sh.box(0, 7, -8, 9.1, 1, 22.1, 0, c(0x27384a)); sh.frustum(0, 9.2, -10, 1.8, 1.6, 5, 10, c(0xd9482b), 0);
      for (let q = 0; q < 4; q++) for (let h = 0; h < 2; h++) sh.box(-2.5 + (q & 1) * 3, 5.2 + h * 2.6, 6 + q * 5, 2.4, 2.5, 4.6, 0, c([0xd9482b, 0x2f78d0, 0xf2c230][(q + h) % 3]));
      const m = kit.mesh(sh); if (m) { m.position.set(-420 + k * 120, SEA + 0.5, -560 - k * 150); m.rotation.y = PI / 2; m.frustumCulled = false; kit.slide(m, 700, 0, 0, 0.006 + k * 0.002, k); kit.bob(m, 0.2, 0.6, k, 0.01); }
    }
    // soft god-ray style sun glow disc low on the horizon
    glow.pool(0, 0, 0, 0.001, [0, 0, 0]);
    kit.mesh(pl); kit.mesh(lamps, {}, true); cabT.done(); sg.done(); kit.foliage(fb); glow.done();
  }
  const yRfast = (kit, d) => kit.py[Math.min(kit.N - 1, Math.max(0, Math.round(d / kit.ds)))] + 0.1;
  // ===================================================================== 4 MUDSLIDE STADIUM beauty
  function msBeauty(track, kit) {
    const M = track._ms; if (!M) return;
    const c = kit.col, rng = kit.rng, L = kit.length, gy = kit.groundY, { cx, cz, ring, o, yt } = M;
    const pl = new kit.Batch(), lamps = new kit.Batch(), glow = glowSet(kit);
    const SG = signAtlas(kit, [['MUDSLIDE\nMOTO', '#d9332b', '#ffffff', '#ffd23a'], ['TURBO\nTIRES', '#202630', '#ffd23a', '#ffd23a'], ['SPLASH\nCOLA', '#1f5fb0', '#ffffff', '#ffd23a'], ['GRIP\nGEAR', '#f06a1a', '#ffffff', '#222222'],
      ['NITRO\nFUEL', '#2a8a3a', '#ffffff', '#ffd23a'], ['DIRT KING', '#5a2a1a', '#ffe9a0', '#ffe9a0'], ['KART KING', '#7a2a8a', '#ffffff', '#ffd23a'], ['MEGA\nVOLT', '#ffd23a', '#202630', '#202630']]);
    const sg = texBatch(kit, SG.tex);
    // ---- ad boards along the bowl wall base (textured)
    for (let i = 0; i < 80; i++) {
      const t0 = (i / 80) * PI * 2, t1 = ((i + 1) / 80) * PI * 2, a = ring(-1.1, t0), b = ring(-1.1, t1), u = SG.uv(i % 8), k = [1, 1, 1];
      sg.b.quadUV([a[0], gy + 0.1, a[1]], [b[0], gy + 0.1, b[1]], [b[0], gy + 2.3, b[1]], [a[0], gy + 2.3, a[1]], k, [u[0], u[1], u[2], u[1], u[2], u[3], u[0], u[3]]);
    }
    // jumbotron screen on the scoreboard (unlit canvas)
    const screen = texBatch(kit, ctex(kit, 512, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#102a6a'); gr.addColorStop(1, '#6a1a7a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffd23a'; g.textAlign = 'center'; g.font = '900 64px Bungee, Impact, "Arial Black", sans-serif'; g.fillText('MUDSLIDE', w / 2, 90); g.fillStyle = '#ffffff'; g.font = '900 44px Bungee, Impact, "Arial Black", sans-serif'; g.fillText('STADIUM  GP', w / 2, 150);
      g.fillStyle = '#ff5a3a'; for (let i = 0; i < 12; i++) g.fillRect(14 + i * 41, 190, 28, 12); g.fillStyle = '#7cf27c'; g.font = '900 30px Bungee, Impact, sans-serif'; g.fillText('LAP 1 / 3', w / 2, 238);
    }));
    {
      const sp = ring(o - 8, 0), shd = Math.atan2(cx - sp[0], cz - sp[1]), px = sp[0] + Math.sin(shd) * 1.9, pz = sp[1] + Math.cos(shd) * 1.9, ry = shd, hx = 15.5, cs = Math.cos(ry), sn = Math.sin(ry), y0 = gy + yt + 7.4;
      screen.b.quadUV([px - hx * cs, y0, pz + hx * sn], [px + hx * cs, y0, pz - hx * sn], [px + hx * cs, y0 + 12, pz - hx * sn], [px - hx * cs, y0 + 12, pz + hx * sn], [1, 1, 1], [0, 0, 1, 0, 1, 1, 0, 1]);
    }
    // ---- floodlight halos + giant light pools on the arena floor
    for (let q = 0; q < 8; q++) {
      const t = (q / 8) * PI * 2 + PI / 8, p = ring(o - 2, t), hd = Math.atan2(cx - p[0], cz - p[1]);
      glow.cross(p[0] + Math.sin(hd) * 0.8, gy + 40, p[1] + Math.cos(hd) * 0.8, 9, [0.75, 0.7, 0.55]);
      const f = ring(o - 90, t); glow.pool(f[0], gy + 0.35, f[1], 75, [0.2, 0.18, 0.12]);
    }
    glow.pool(cx, gy + 0.33, cz, 120, [0.12, 0.11, 0.08]);
    // ---- tyre walls on outside of corners, painted red/white; and around jump landings
    {
      const f = {}; let n = 0;
      for (let d = 6; d < L - 6; d += 3.2) {
        const i = Math.min(kit.N - 1, Math.round(d / kit.ds)), cv = kit.curv[i];
        if (Math.abs(cv) < 0.006 || n > 220) continue;
        const side = cv > 0 ? -1 : 1; kit.frameInto ? kit.frameInto(d, f) : Object.assign(f, kit.frame(d));
        const p = kit.at(d, side * (f.halfWidth + 6.2), 0);
        if (!kit.clear || true) tireStack(pl, c, p[0], p[1], p[2], 3, c(0x1c1d22), (((d / 3.2) | 0) % 3) ? c(0x2a2c33) : c(0xd9332b)); n++;
      }
      // tyre-wall start line pits
      for (let d = 20; d < 60; d += 3.2) for (const s of [-1, 1]) { const p = kit.at(d, s * 19.5, 0); tireStack(pl, c, p[0], p[1], p[2], 2, c(0xf4f0e6), c(0x2a2c33)); }
    }
    // ---- scaffolding camera towers + lighting trusses around the track
    [[210, 1], [520, -1], [840, 1], [1060, -1], [1250, 1]].forEach(([d, s]) => {
      const p = kit.at(d, s * 24, 0), hd = Math.atan2(kit.frame(d).tx, kit.frame(d).tz), h = 9;
      for (const dx of [-1.4, 1.4]) for (const dz of [-1.4, 1.4]) rod(pl, [p[0] + dx, p[1], p[2] + dz], [p[0] + dx, p[1] + h, p[2] + dz], 0.09, c(0xb8bcc4));
      for (let y = 2; y <= h; y += 3) { rod(pl, [p[0] - 1.4, p[1] + y, p[2] - 1.4], [p[0] + 1.4, p[1] + y, p[2] - 1.4], 0.06, c(0xb8bcc4)); rod(pl, [p[0] - 1.4, p[1] + y, p[2] + 1.4], [p[0] + 1.4, p[1] + y, p[2] + 1.4], 0.06, c(0xb8bcc4)); rod(pl, [p[0] - 1.4, p[1] + y - 3, p[2] - 1.4], [p[0] + 1.4, p[1] + y, p[2] - 1.4], 0.05, c(0xb8bcc4)); }
      pl.box(p[0] - 2, p[1] + h, p[2] - 2, 4, 0.2, 4, 0, c(0x4a525c)); pl.box(p[0] - 0.6, p[1] + h + 0.2, p[2] - 0.6, 1.2, 1.0, 1.2, hd, c(0x2a2d33)); lamps.box(p[0] - 0.5, p[1] + h + 0.5, p[2] - 0.9, 1, 0.5, 0.2, hd, c(0xfff6d0));
      glow.cross(p[0], p[1] + h + 0.8, p[2], 3, [0.5, 0.48, 0.38]); glow.pool(p[0], p[1] + 0.35, p[2], 14, [0.15, 0.14, 0.1]);
    });
    // ---- pit area behind the south stands: striped tents, trucks, port-a-loos
    for (let k = 0; k < 6; k++) {
      const a = ring(-14, 3.6 + k * 0.1), x = cx + (rng() - 0.5) * 20 - 60 + k * 24, z = cz + 10 + rng() * 6; void a;
      if (!kit.clear(x, z, 26)) continue;
      const col2 = [0xd9332b, 0x1f5fb0, 0xf2c230, 0x2a8a3a][k % 4];
      pl.box(x - 4, gy, z - 3, 8, 3.2, 6, 0, c(0xf4f0e6)); pl.frustum(x, gy + 3.2, z, 6.2, 0, 2.4, 4, c(col2), PI / 4);
      for (let q = 0; q < 4; q++) pl.box(x - 4.2 + q * 2.1, gy + 0.9, z - 3.1, 1.05, 2.2, 0.1, 0, q & 1 ? c(col2) : c(0xffffff));
    }
    // moto trucks (box trailers) parked inside the infield edges
    kit.scatter(10, 22, 60, 24, (x, z, i, r) => { const ry = r() * 6.28, col2 = [0xd9332b, 0x1f5fb0, 0xf2c230, 0xe8e8e8][(r() * 4) | 0]; pl.box(x, gy, z, 3.4, 3.4, 9, ry, c(col2)); pl.box(x + Math.sin(ry) * 5.8 - 1.4, gy, z + Math.cos(ry) * 5.8 - 1.4, 2.8, 2.4, 2.8, ry, c(0x2a2d33)); });
    // mud: glossy dark ruts + puddles (decals) and start grid + sponsor logos + arrows on the dirt
    {
      const puddle = (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.46); gr.addColorStop(0, 'rgba(20,12,6,0.85)'); gr.addColorStop(0.7, 'rgba(40,26,14,0.7)'); gr.addColorStop(1, 'rgba(40,26,14,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.46, h * 0.36, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(255,200,140,0.18)'; g.beginPath(); g.ellipse(w * 0.4, h * 0.42, w * 0.18, h * 0.07, -0.2, 0, 7); g.fill(); };
      const box = (g, w, h) => { g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 12; g.strokeRect(w * 0.16, h * 0.12, w * 0.68, h * 0.76); };
      const D = decalSet(kit, [arrowDraw('rgba(255,235,200,0.85)'), chevDraw('rgba(255,210,70,0.9)'), puddle, box, logoDraw('MUDSLIDE', '#d9332b', '#ffffff'), logoDraw('GRIP\nGEAR', '#f06a1a', '#ffffff')]);
      [[270, 6], [602, -6], [895, 6], [350, -5], [1020, 7], [1210, -6], [1290, 4]].forEach(([d, l]) => D.add(d, l, 24, 20, 2));
      for (let d = 160; d < L - 100; d += 150) D.add(d, ((d / 150) | 0) & 1 ? 5 : -5, 11, 4.2, 0);
      [95, 398, 709].forEach((d) => D.add(d - 10, 0, 12, 12, 1)); [60, 200, 640, 1100].forEach((d, i) => D.add(d, 0, 10, 10, 4 + (i & 1)));
      for (let r = 0; r < 4; r++) for (const l of [-4.5, 4.5]) D.add(-4 - r * 7 + (L), l, 5, 4, 3);
      D.done();
    }
    // spotlit banners hanging from the roof ring over the arena
    for (let q = 0; q < 20; q++) { const t = (q / 20) * PI * 2 + 0.15, p = ring(o - 14, t), hd = Math.atan2(cx - p[0], cz - p[1]); kit.banner(p[0], gy + yt - 1, p[1], 5, 7, hd + PI / 2, q & 1 ? [0xd9332b, 0xffffff] : [0x1f5fb0, 0xffd23a], { pattern: q % 3 ? 'vstripes' : 'check', amp: 0.18 }); }
    // lamp posts with orange sodium glow along the pit road
    along(kit, 12, L - 12, 46, (d, f) => { const s = ((d / 46) | 0) & 1 ? 1 : -1, p = kit.at(d, s * 22, 0), ry = Math.atan2(-s * f.rx, -s * f.rz); const h = lampPost(pl, lamps, p[0], p[1], p[2], 6.5, ry, 1.6, c(0x3a3d46), c(0xffe0a0)); glow.cross(h[0], h[1] - 0.2, h[2], 1.8, [0.55, 0.42, 0.2]); glow.pool(p[0] + Math.sin(ry) * 1.6, p[1] + 0.35, p[2] + Math.cos(ry) * 1.6, 7, [0.2, 0.15, 0.07]); });
    // dirt rocks and mud mounds with grass tufts on the infield
    kit.scatter(60, 4, 60, 22, (x, z, i, r) => rocks(pl, c, x, gy, z, 0.8 + r() * 1.4, r, [0x5a4a3a, 0x7a6a5a]));
    kit.mesh(pl); kit.mesh(lamps, {}, true); sg.done(); screen.done({}, true); glow.done();
  }

  const defs = [
    {
      id: 'bayside_bridge', name: 'Bayside Bridge', order: 1, music: 'bridge', seed: 101, hw: 12, shoulder: 5, scale: 0.93, pts: BB_PTS,
      theme: {
        sky: [0x2f86e0, 0x9fd3ff, 0xd8ecf8], fog: [0xbfdcf0, 200, 820], ground: 0x6aa05a, shoulder: 0x7d8590,
        road: [0x5f6672, 0x575e6a], curb: [0xf2f2f2, 0xd9482b], hemi: [0xdff0ff, 0x7a9a6a, 0.95], sun: [0xfff4dc, 0.9],
        emb: 0xa9b1ba, bg: 0xbfdcf0,
      },
      style: 'meadow', walls: 'barrier', wallColors: [0xf2f2f2, 0xcfd8e0],
      pads: [{ d: 170, len: 10, l: -5, w: 6 }, { d: 170, len: 10, l: 5, w: 6 }, { d: 330, len: 10, l: 0, w: 8 }, { d: 640, len: 10, l: 0, w: 8 },
        { d: 925, len: 10, l: 0, w: 8 }, { d: 1135, len: 10, l: -5, w: 6 }, { d: 1135, len: 10, l: 5, w: 6 }],
      itemRows: [{ d: 90, count: 5 }, { d: 260, count: 5 }, { d: 470, count: 5 }, { d: 720, count: 5 }, { d: 1030, count: 4, double: true }, { d: 1300, count: 5 }],
      decorate: bbDecorate, hazards: bbHazards, update: bbUpdate,
    },
    {
      id: 'castle_circuit', name: 'Castle Circuit', order: 2, music: 'classic', seed: 202, hw: 12, shoulder: 5, pts: CC_PTS, style: 'meadow',
      theme: {
        sky: [0x3b8fe8, 0xbfe4ff, 0x8ac96a], fog: [0xc6e6ff, 150, 560], ground: 0x62b04e, shoulder: 0x4e9a3a,
        road: [0x7b7e86, 0x73767e], curb: [0xb23a3e, 0xf0e6d0], hemi: [0xcfe8ff, 0x6a9a50, 0.95], sun: [0xfff2d8, 0.9],
        emb: 0x5cae3e, bg: 0xc6e6ff,
      },
      offroad: 'grass', walls: 'barrier', wallColors: [0xd6cdb8, 0xb5ab94],
      pads: [{ d: 60, len: 10, l: -5, w: 6 }, { d: 60, len: 10, l: 5, w: 6 }, { d: 470, len: 10, l: 0, w: 8 }, { d: 885, len: 10, l: -5, w: 6 }, { d: 885, len: 10, l: 5, w: 6 }, { d: 915, len: 10, l: 0, w: 8 }],
      itemRows: [{ d: 120, count: 5 }, { d: 300, count: 5 }, { d: 520, count: 5, double: true }, { d: 700, count: 4 }, { d: 1000, count: 5 }, { d: 1120, count: 5 }],
      decorate: ccDecorate, hazards: ccHazards, update: ccUpdate,
    },
    {
      id: 'daydream_cruiser', name: 'Daydream Cruiser', order: 3, music: 'cruise', seed: 303, hw: 12, shoulder: 5, pts: DC_PTS, style: 'meadow', ground: false, sky: 'sunset',
      theme: {
        sky: [0x3a72d0, 0xffc890, 0xffe6bc], fog: [0xf6d4a8, 260, 1250], ground: 0x1b78bd, shoulder: 0x9a7d54,
        road: [0x6c747f, 0x646c77], curb: [0xf2c230, 0xffffff], hemi: [0xffe6c8, 0xa08a66, 1.0], sun: [0xffb866, 1.05],
        emb: 0x8b6b45, bg: 0xf6d4a8,
      },
      walls: 'barrier', wallColors: [0xf4f0e6, 0xdfeaf4],
      zones: [{ d: 158, len: 142, l: 14.5, w: 5, surface: 'water', offroad: true, color: 0x37b9f0 }],
      pads: [{ d: 80, len: 10, l: -5, w: 6 }, { d: 80, len: 10, l: 5, w: 6 }, { d: 440, len: 10, l: 0, w: 8 }, { d: 720, len: 10, l: -5, w: 6 }, { d: 720, len: 10, l: 5, w: 6 }, { d: 1110, len: 10, l: 0, w: 8 }],
      itemRows: [{ d: 110, count: 5 }, { d: 330, count: 5 }, { d: 520, count: 5, double: true }, { d: 760, count: 4 }, { d: 1030, count: 5 }, { d: 1190, count: 5 }],
      decorate: dcDecorate, hazards: dcHazards, update: dcUpdate,
    },
    {
      id: 'mudslide_stadium', name: 'Mudslide Stadium', order: 4, music: 'stadium', seed: 404, hw: 11, shoulder: 5, pts: MS_PTS, style: 'meadow',
      theme: {
        sky: [0x04081c, 0x142450, 0x34305a], fog: [0x1a2244, 140, 640], ground: 0x8a6238, shoulder: 0x5a3b22,
        road: [0x9c7549, 0x946d42], curb: [0xd9482b, 0xf4f0e6], hemi: [0x8a98d8, 0x6a4a30, 1.0], sun: [0xfff0d8, 1.0],
        emb: 0x6f4b27, bg: 0x1a2244,
      },
      offroad: 'mud', sky: 'night', walls: 'barrier', wallColors: [0x2a2c33, 0xf0e8d8],
      jumps: [{ d: 139, len: 14, l: 0, w: 18 }, { d: 444, len: 14, l: 0, w: 18 }, { d: 757, len: 16, l: 0, w: 18 }],
      pads: [{ d: 100, len: 10, l: -5, w: 6 }, { d: 100, len: 10, l: 5, w: 6 }, { d: 400, len: 10, l: 0, w: 8 }, { d: 712, len: 10, l: -5, w: 6 }, { d: 712, len: 10, l: 5, w: 6 }, { d: 1180, len: 10, l: 0, w: 8 }],
      zones: [{ d: 280, len: 26, l: 4, w: 10, surface: 'mud' }, { d: 612, len: 26, l: -4, w: 10, surface: 'mud' }, { d: 905, len: 30, l: 4, w: 10, surface: 'mud' }],
      itemRows: [{ d: 60, count: 5 }, { d: 330, count: 5 }, { d: 520, count: 5, double: true }, { d: 880, count: 5 }, { d: 1100, count: 4 }, { d: 1330, count: 5 }],
      decorate: msDecorate, hazards: msHazards, update: msUpdate,
    },
  ];
  defs.forEach((d) => G.defineTrack(Object.assign({ cup: 'flower', laps: 3, scale: 1, pads: [], jumps: [] }, d)));
})();
