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
    for (let k = 0; k < 70; k++) {
      const x = -500 + k * 22 + rng() * 10, z = -820 - rng() * 120, h = 40 + rng() * 120, w = 16 + rng() * 14;
      building(kit, b, x, gy, z, w, h, w, 0, c(bodyC[(rng() * bodyC.length) | 0]), roofC, glassD);
    }
    for (let k = 0; k < 24; k++) {
      const x = 700 + rng() * 500, z = -300 + rng() * 600, h = 12 + rng() * 40, w = 14 + rng() * 14;
      if (!kit.clear(x, z, 60) || inBay(x, z)) continue;
      building(kit, b, x, gy, z, w, h, w, rng() * 3, c(bodyC[(rng() * bodyC.length) | 0]), roofC, glassC);
    }
    kit.scatter(150, 4, 90, 30, (x, z, i, r) => {
      if (inBay(x, z) || (x > 200 && x < 560 && z > 100 && z < 160)) return;
      if (x > 215 && x < 560 && z > 85) { tree(fb, c, x, gy, z, 0.9 + r() * 0.8, r, 'round'); return; }
      const h = 10 + r() * 38, w = 11 + r() * 10, d = 11 + r() * 10;
      building(kit, b, x, gy, z, w, h, d, r() * 6.28, c(bodyC[(r() * bodyC.length) | 0]), roofC, r() < 0.5 ? glassC : glassD);
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
    // sea tweaks go in def.update
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
    polyMesh(kit, DC_HULL, [hole(dA0 - 2, dA1), hole(dB0, dB1 + 2)], DECK, plank);
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
      id: 'daydream_cruiser', name: 'Daydream Cruiser', order: 3, music: 'cruise', seed: 303, hw: 12, shoulder: 5, pts: DC_PTS, style: 'meadow', ground: false,
      theme: {
        sky: [0x2f86e0, 0xaedcff, 0xd9eefc], fog: [0xcfe8f8, 260, 1100], ground: 0x1b78bd, shoulder: 0x9a7d54,
        road: [0x6c747f, 0x646c77], curb: [0xf2c230, 0xffffff], hemi: [0xe6f2ff, 0x9a8a6a, 1.0], sun: [0xfff4dc, 0.9],
        emb: 0x8b6b45, bg: 0xcfe8f8,
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
        sky: [0x3a7fd8, 0xffe2b8, 0xf2b880], fog: [0xf0d2a8, 130, 600], ground: 0x8a6238, shoulder: 0x5a3b22,
        road: [0x9c7549, 0x946d42], curb: [0xd9482b, 0xf4f0e6], hemi: [0xffe9cf, 0x8a5a30, 1.0], sun: [0xffd9a0, 0.95],
        emb: 0x6f4b27, bg: 0xf0d2a8,
      },
      offroad: 'mud', walls: 'barrier', wallColors: [0x2a2c33, 0xf0e8d8],
      jumps: [{ d: 139, len: 14, l: 0, w: 18 }, { d: 444, len: 14, l: 0, w: 18 }, { d: 757, len: 16, l: 0, w: 18 }],
      pads: [{ d: 100, len: 10, l: -5, w: 6 }, { d: 100, len: 10, l: 5, w: 6 }, { d: 400, len: 10, l: 0, w: 8 }, { d: 712, len: 10, l: -5, w: 6 }, { d: 712, len: 10, l: 5, w: 6 }, { d: 1180, len: 10, l: 0, w: 8 }],
      zones: [{ d: 280, len: 26, l: 4, w: 10, surface: 'mud' }, { d: 612, len: 26, l: -4, w: 10, surface: 'mud' }, { d: 905, len: 30, l: 4, w: 10, surface: 'mud' }],
      itemRows: [{ d: 60, count: 5 }, { d: 330, count: 5 }, { d: 520, count: 5, double: true }, { d: 880, count: 5 }, { d: 1100, count: 4 }, { d: 1330, count: 5 }],
      decorate: msDecorate, hazards: msHazards, update: msUpdate,
    },
  ];
  defs.forEach((d) => G.defineTrack(Object.assign({ cup: 'flower', laps: 3, scale: 1, pads: [], jumps: [] }, d)));
})();
