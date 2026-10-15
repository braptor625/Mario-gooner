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
  const NOHIT = 0;
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
    const m = kit.trackMat(new THREE.MeshPhongMaterial({ color, shininess: 80, specular: 0xaaccee, transparent: opacity < 1, opacity: opacity, side: THREE.DoubleSide }));
    const mesh = new THREE.Mesh(g, m); mesh.position.y = y;
    kit.add(mesh); return mesh;
  }
  function discMesh(kit, x, z, r, y, color, opacity) {
    const g = new THREE.CircleGeometry(r, 40); g.rotateX(-PI / 2); kit.trackGeom(g);
    const m = kit.trackMat(new THREE.MeshPhongMaterial({ color, shininess: 90, specular: 0xffffff, transparent: true, opacity: opacity || 0.9 }));
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
      g.position.set(fr.x + fr.rx * edge, fr.y, fr.z + fr.rz * edge);
      g.rotation.y = Math.atan2(-fr.rx * sp.side, -fr.rz * sp.side);   // faces the road centre
      head.position.set(0, 3.1, 0.2);
      const period = opts.period || 3.2;
      const h = {
        x: g.position.x, y: fr.y + 1.5, z: g.position.z, radius: 1.5, hitKind: 'spin', vx: 0, vz: 0, active: true, object3D: g,
        update(dt, time) {
          const ph = (((time + sp.phase) % period) + period) % period / period;
          // idle 0..0.55 (head bobs), lunge 0.55..0.8, snap back 0.8..1
          let ext = 0, open = 0.2 + 0.1 * Math.sin(time * 3 + sp.phase);
          if (ph > 0.55 && ph < 0.8) { const u = (ph - 0.55) / 0.25; ext = Math.sin(u * PI * 0.5); open = 1; }
          else if (ph >= 0.8 && ph < 0.92) { const u = (ph - 0.8) / 0.12; ext = 1 - u; open = 1 - u; }
          const reach = ext * (opts.reach || 5.5);
          head.position.set(0, 3.1 - ext * 0.8, 0.2 + reach);
          head.scale.set(1, 1 + open * 0.15, 1);
          head.rotation.x = -0.25 * ext;
          const dx = fr.rx * -sp.side, dz = fr.rz * -sp.side;
          this.x = g.position.x + dx * (0.2 + reach); this.z = g.position.z + dz * (0.2 + reach);
          this.radius = 1.4 + ext * 0.9;
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
    part(hill(100, 160, 1, 4.6));
    arc(220, 200, 40, -PI / 2, PI / 2, 4, 0).forEach((p, i) => { if (i > 0 && i < 4) a.push(p); });
    a.push([220, 240, 0], [140, 240, 0], [60, 240, 0], [-10, 240, 0], [-60, 215, 0], [-90, 160, 0], [-92, 90, 0], [-70, 30, 0]);
    return a;
  })();


  // ===================================================================== 1 BAYSIDE BRIDGE decor
  const BB_BAY = [[-1500, -1500], [2600, -1500], [2600, -60], [540, -60], [540, 125], [225, 125], [225, -130], [-1500, -130]];
  const inBay = (x, z) => (x > 225 && x < 540 && z < 125 && z > -1500) || (x >= 540 && z < -60) || (z < -130);
  function bbDecorate(track, kit) {
    const c = kit.col, rng = kit.rng, L = kit.length, ds = kit.ds, N = kit.N, gy = kit.groundY;
    const b = new kit.Batch(), lamps = new kit.Batch();
    const hwT = 12 + 5;                                   // road half width + shoulder
    // ---- sea
    const sea = waterPoly(kit, BB_BAY, null, gy + 0.25, 0x2c8fd0, 0.92);
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
      lamps.box(q[0] - 1, q[1], q[2] - 1, 2, 2, 2, 0, c(0xff5040));
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
      b.blob(p[0], p[1] + 10 + rng() * 1.5, p[2], 3 + rng() * 2, 2 + rng(), 3 + rng() * 2, c(0x3e9a44), 0);
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
      if (x > 215 && x < 560 && z > 85) { tree(b, c, x, gy, z, 0.9 + r() * 0.8, r, 'round'); return; }
      const h = 10 + r() * 38, w = 11 + r() * 10, d = 11 + r() * 10;
      building(kit, b, x, gy, z, w, h, d, r() * 6.28, c(bodyC[(r() * bodyC.length) | 0]), roofC, r() < 0.5 ? glassC : glassD);
    });
    kit.scatter(90, 2, 60, 24, (x, z, i, r) => { if (!inBay(x, z)) tree(b, c, x, gy, z, 0.8 + r() * 0.7, r, r() < 0.3 ? 'pine' : 'round'); });
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
    }
    // far hills and sun glow on the horizon
    kit.farScatter(16, 160, (x, z, r) => {
      if (inBay(x, z) && z > -600) return;
      const s = 30 + r() * 40; b.blob(x, gy - 4, z, s * 1.5, s * 0.6, s, c(0x6fae6a), 1);
    });
    kit.mesh(b); kit.mesh(lamps, {}, true);
    // sea tweaks go in def.update
  }
  function bbHazards(track, kit) {
    const L = kit.length, T = track._tun || [0, 0];
    const same = [[0xc1, 'c1', 3.8, 12], [0xc2, 't1', 8.6, 13], [0xc3, 'c3', 3.8, 14], [0xc4, 't2', 8.6, 12]];
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

  const defs = [
    {
      id: 'bayside_bridge', name: 'Bayside Bridge', order: 1, music: 'bridge', seed: 101, hw: 12, shoulder: 5, scale: 0.93, pts: BB_PTS,
      theme: {
        sky: [0x2f86e0, 0x9fd3ff, 0xd8ecf8], fog: [0xbfdcf0, 200, 820], ground: 0x8c9a86, shoulder: 0x7d8590,
        road: [0x5f6672, 0x575e6a], curb: [0xf2f2f2, 0xd9482b], hemi: [0xdff0ff, 0x8a9a8a, 1.0], sun: [0xfff4dc, 0.9],
        emb: 0xa9b1ba, bg: 0xbfdcf0,
      },
      walls: 'barrier', wallColors: [0xf2f2f2, 0xcfd8e0],
      pads: [{ d: 170, len: 10, l: -5, w: 6 }, { d: 170, len: 10, l: 5, w: 6 }, { d: 330, len: 10, l: 0, w: 8 }, { d: 640, len: 10, l: 0, w: 8 },
        { d: 925, len: 10, l: 0, w: 8 }, { d: 1135, len: 10, l: -5, w: 6 }, { d: 1135, len: 10, l: 5, w: 6 }],
      itemRows: [{ d: 90, count: 5 }, { d: 260, count: 5 }, { d: 470, count: 5 }, { d: 720, count: 5 }, { d: 1030, count: 4, double: true }, { d: 1300, count: 5 }],
      decorate: bbDecorate, hazards: bbHazards, update: bbUpdate,
    },
  ];
  defs.forEach((d) => G.defineTrack(Object.assign({ cup: 'flower', laps: 3, scale: 1, pads: [], jumps: [] }, d)));
})();
