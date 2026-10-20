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
    const mat = matOpts && matOpts.water ? kit.waterMat({ color: matOpts.color, opacity: matOpts.water }) : kit.trackMat(new THREE.MeshPhongMaterial(Object.assign({ side: THREE.DoubleSide, transparent: true, shininess: 80 }, matOpts)));
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    kit.add(mesh);
    return mesh;
  }
  // opacity for both Phong and the animated GFX water shader
  function setOpacity(m, v) { if (m.uniforms && m.uniforms.opacity) m.uniforms.opacity.value = v; else m.opacity = v; }
  function discMesh(kit, x, y, z, r, matOpts, seg) {
    const g = new THREE.CircleGeometry(r, seg || 36); g.rotateX(-Math.PI / 2); kit.trackGeom(g);
    const mat = matOpts && matOpts.water ? kit.waterMat({ color: matOpts.color, opacity: matOpts.water }) : kit.trackMat(new THREE.MeshPhongMaterial(Object.assign({ transparent: true, shininess: 90 }, matOpts)));
    const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); kit.add(m); return m;
  }

  // ------------------------------------------------------------------ beauty-pass helpers (local; kit API only)
  const faceRoad = (f, s) => Math.atan2(-s * f.rx, -s * f.rz);
  const jit = (kit, hex, r, a) => kit.mul(kit.col(hex), 1 - (a || 0.12) + r() * (a || 0.12) * 2);
  // ellipsoid blob rotated about Y (kit blobs are axis-aligned)
  function blobR(b, kit, x, y, z, sx, sy, sz, ry, k, det) {
    const t = new kit.Batch(); t.blob(0, 0, 0, sx, sy, sz, k, det || 1);
    const c = Math.cos(ry), s = Math.sin(ry), p = t.p, n = t.n;
    const V = (i) => [x + p[i] * c + p[i + 2] * s, y + p[i + 1], z - p[i] * s + p[i + 2] * c];
    const N = (i) => [n[i] * c + n[i + 2] * s, n[i + 1], -n[i] * s + n[i + 2] * c];
    for (let i = 0; i < p.length; i += 9) b.triN(V(i), V(i + 3), V(i + 6), k, N(i), N(i + 3), N(i + 6));
  }
  // flat quad lying on the road surface (d0..d1 along, l0..l1 across)
  function roadQuad(b, kit, d0, d1, l0, l1, dy, c) {
    b.quad(kit.at(d0, l0, dy), kit.at(d0, l1, dy), kit.at(d1, l1, dy), kit.at(d1, l0, dy), c);
  }
  // soft additive glows: ground pools and crossed halos (one draw)
  function glowSet(kit) {
    const b = new kit.Batch(true), UV = [0, 0, 1, 0, 1, 1, 0, 1];
    const tex = hasDOM() ? kit.makeCanvasTexture(64, 64, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }) : null;
    return {
      pool(x, y, z, r, hex, k) { const c = kit.mul(kit.col(hex), k == null ? 1 : k), y0 = y + 0.08; b.quadUV([x - r, y0, z - r], [x + r, y0, z - r], [x + r, y0, z + r], [x - r, y0, z + r], c, UV); },
      halo(x, y, z, r, hex, k) {
        const c = kit.mul(kit.col(hex), k == null ? 1 : k);
        b.quadUV([x - r, y - r, z], [x + r, y - r, z], [x + r, y + r, z], [x - r, y + r, z], c, UV);
        b.quadUV([x, y - r, z - r], [x, y - r, z + r], [x, y + r, z + r], [x, y + r, z - r], c, UV);
      },
      done() {
        if (!tex || b.empty) return null;
        const m = kit.mesh(b, { map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }, true); m.renderOrder = 3; m.receiveShadow = false; return m;
      },
    };
  }
  // sign / texture atlas: draw(ctx, w, h, i) paints cell i; a white strip at the bottom keeps untextured triangles white
  function makeAtlas(kit, W, H, n, cols, draw) {
    const rows = Math.ceil(n / cols), cw = W / cols, ch = H / rows, TH = H + 8;
    const tex = hasDOM() ? kit.makeCanvasTexture(W, TH, (ctx) => {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, TH);
      for (let i = 0; i < n; i++) {
        ctx.save(); ctx.beginPath(); ctx.rect((i % cols) * cw, Math.floor(i / cols) * ch, cw, ch); ctx.clip();
        ctx.translate((i % cols) * cw, Math.floor(i / cols) * ch); draw(ctx, cw, ch, i); ctx.restore();
      }
    }) : null;
    if (tex) { tex.anisotropy = 4; }
    return {
      tex,
      mat() { return kit.mat(tex ? { map: tex, emissive: 0x444444, emissiveMap: tex } : {}); },
      uv(i) { const x = (i % cols) * cw, y = Math.floor(i / cols) * ch; return [(x + 1) / W, 1 - (y + ch - 1) / TH, (x + cw - 1) / W, 1 - (y + 1) / TH]; },
    };
  }
  // textured panel standing at (x,z), bottom y, width w, height h, facing (sin ry, cos ry); optional frame box behind
  function panelQ(b, at, i, x, y, z, w, h, ry, frame, kit) {
    const u = at.uv(i), c = Math.cos(ry), s = Math.sin(ry), hx = w / 2;
    if (frame) b.box(x - s * 0.04, y - 0.12, z - c * 0.04, w + 0.3, h + 0.24, 0.16, ry, frame);
    const ox = x + s * 0.06, oz = z + c * 0.06, W = [1, 1, 1];
    b.quadUV([ox - hx * c, y, oz + hx * s], [ox + hx * c, y, oz - hx * s], [ox + hx * c, y + h, oz - hx * s], [ox - hx * c, y + h, oz + hx * s], W, [u[0], u[1], u[2], u[1], u[2], u[3], u[0], u[3]]);
  }
  function sponsorCell(ctx, w, h, name, c1, c2, fg) {
    const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w * 0.45, 0); ctx.lineTo(w * 0.25, h); ctx.lineTo(0, h); ctx.fill();
    ctx.fillStyle = fg || '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = h * 0.07; ctx.lineJoin = 'round';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let fs = h * 0.5; ctx.font = '900 ' + fs + 'px Bungee, Rubik, Impact, sans-serif';
    while (ctx.measureText(name).width > w * 0.88 && fs > 8) { fs -= 3; ctx.font = '900 ' + fs + 'px Bungee, Rubik, Impact, sans-serif'; }
    ctx.strokeText(name, w / 2, h * 0.53); ctx.fillText(name, w / 2, h * 0.53);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3; ctx.strokeRect(5, 5, w - 10, h - 10);
  }
  // ---- small props (all write into a Batch; no per-frame cost)
  function rockCluster(b, kit, x, y, z, s, r, pal) {
    const n = 2 + ((r() * 3) | 0);
    for (let k = 0; k < n; k++) b.blob(x + (r() - 0.5) * s * 1.8, y + s * 0.25, z + (r() - 0.5) * s * 1.8, s * (0.6 + r() * 0.7), s * (0.4 + r() * 0.5), s * (0.6 + r() * 0.7), jit(kit, pal[(r() * pal.length) | 0], r, 0.1), 0);
  }
  function tireStack(b, kit, x, y, z, n, c1, c2) {
    for (let i = 0; i < n; i++) b.frustum(x, y + i * 0.5, z, 0.85, 0.85, 0.46, 10, i & 1 ? c1 : c2, 0);
  }
  function crate(b, kit, x, y, z, s, ry, c) { b.box(x, y, z, s, s, s, ry, c); b.box(x, y + s * 0.92, z, s * 1.04, s * 0.1, s * 1.04, ry, kit.mul(c, 0.8)); b.box(x, y + s * 0.4, z, s * 1.02, s * 0.14, s * 1.02, ry, kit.mul(c, 0.78)); }
  function barrel(b, kit, x, y, z, c, h) { h = h || 1.1; b.frustum(x, y, z, 0.48, 0.48, h, 9, c, 0); b.frustum(x, y + h * 0.3, z, 0.51, 0.51, 0.12, 9, kit.mul(c, 0.7), 0); b.frustum(x, y + h * 0.7, z, 0.51, 0.51, 0.12, 9, kit.mul(c, 0.7), 0); }
  function lampPost(b, kit, gl, x, y, z, h, hex, ry, glowK) {
    h = h || 6.5; const grey = kit.col(0x6a707c);
    b.frustum(x, y, z, 0.22, 0.14, h, 6, grey, 0);
    const ax = Math.sin(ry || 0) * 0.9, az = Math.cos(ry || 0) * 0.9;
    b.box(x + ax * 0.5, y + h - 0.08, z + az * 0.5, 0.16, 0.16, 1.0, ry || 0, grey);
    b.blob(x + ax, y + h - 0.2, z + az, 0.5, 0.28, 0.5, kit.col(hex || 0xfff2c0), 1);
    if (gl) { gl.halo(x + ax, y + h - 0.3, z + az, 1.8, hex || 0xfff2c0, 0.6); gl.pool(x + ax, y, z + az, 4.5, hex || 0xffe9a0, glowK == null ? 0.35 : glowK); }
  }
  function bench(b, kit, x, y, z, ry, c) {
    const wood = c || kit.col(0xb5763a), iron = kit.col(0x44464f);
    b.box(x, y + 0.45, z, 1.8, 0.1, 0.55, ry, wood); b.box(x, y + 0.75, z, 1.8, 0.4, 0.08, ry, wood);
    const cs = Math.cos(ry), sn = Math.sin(ry);
    for (let s = -1; s <= 1; s += 2) b.box(x + s * 0.75 * cs, y, z - s * 0.75 * sn, 0.1, 0.5, 0.5, ry, iron);
  }
  function bush(b, kit, x, y, z, s, r, c1, c2) {
    b.blob(x, y + 0.4 * s, z, 1.0 * s, 0.75 * s, 1.0 * s, jit(kit, c1, r, 0.1), 1);
    b.blob(x + 0.8 * s, y + 0.3 * s, z + 0.3 * s, 0.7 * s, 0.55 * s, 0.7 * s, jit(kit, c2 || c1, r, 0.1), 0);
    b.blob(x - 0.6 * s, y + 0.3 * s, z - 0.4 * s, 0.6 * s, 0.5 * s, 0.6 * s, jit(kit, c1, r, 0.14), 0);
  }
  // little flower heads on a stalk (cheap: tiny blobs)
  function flowerPatch(b, kit, x, y, z, rad, n, cols, r) {
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * rad, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, hh = 0.35 + r() * 0.35;
      b.box(px, y, pz, 0.05, hh, 0.05, 0, kit.col(0x3a9a3a));
      b.blob(px, y + hh + 0.06, pz, 0.17, 0.12, 0.17, kit.col(cols[(r() * cols.length) | 0]), 0);
    }
  }
  // striped hot-air balloon (envelope + basket), origin at the balloon's mouth; returns the mesh
  function balloonMesh(kit, cols, R, H) {
    const b = new kit.Batch(), ts = [0, 0.1, 0.28, 0.5, 0.72, 0.9, 1], rs = [0.28, 0.66, 0.95, 1, 0.9, 0.55, 0.0], G = 10;
    for (let g = 0; g < G; g++) {
      const a0 = (g / G) * TAU, a1 = ((g + 1) / G) * TAU, c = kit.col(cols[g % cols.length]);
      for (let j = 0; j < ts.length - 1; j++) {
        const y0 = 2.4 + ts[j] * H, y1 = 2.4 + ts[j + 1] * H, r0 = rs[j] * R, r1 = rs[j + 1] * R;
        b.quad([Math.cos(a0) * r0, y0, Math.sin(a0) * r0], [Math.cos(a1) * r0, y0, Math.sin(a1) * r0], [Math.cos(a1) * r1, y1, Math.sin(a1) * r1], [Math.cos(a0) * r1, y1, Math.sin(a0) * r1], c);
      }
    }
    const rope = kit.col(0x5a4630);
    for (let q = 0; q < 4; q++) { const a = (q / 4) * TAU + 0.78; beam(b, [Math.cos(a) * 0.28 * R, 2.4, Math.sin(a) * 0.28 * R], [Math.cos(a) * 0.55, 0.9, Math.sin(a) * 0.55], 0.03, rope); }
    b.box(0, 0, 0, 1.4, 1.0, 1.4, 0, kit.col(0xb8803f)); b.box(0, 0.9, 0, 1.55, 0.12, 1.55, 0, kit.col(0x8a5a2a));
    b.blob(0, 2.1, 0, 0.3, 0.3, 0.3, kit.col(0xffa030), 0);
    const m = kit.mesh(b); m.frustumCulled = false; return m;
  }

  // ---- Sunshine Circuit beauty pass: sponsors, pits, timing tower, tiled tunnel, balloons, flower hills
  function sunshineBeauty(track, kit, bb) {
    const L = kit.length, col = kit.col, rng = kit.rng, gy = kit.groundY, hwS = 17;
    const b = new kit.Batch(), fb = new kit.Batch(), sg = new kit.Batch(true), gl = glowSet(kit);
    const SP = [['SUNNY OIL', '#ff8a1a', '#ffc828'], ['TURBO COLA', '#e83a3a', '#9c1c2c'], ['PIXEL TIRE', '#2c6bff', '#1a3f9c'], ['ZIPPY LABS', '#3ac66a', '#1a8a48'],
      ['MELON MOTORS', '#ff5a8a', '#c82c64'], ['HAPPY HONEY', '#ffd23a', '#e8961a'], ['ROCKET SNACKS', '#8a4cff', '#5a2cc8'], ['BLUE BOLT', '#18b8e8', '#0c78b8']];
    const at = makeAtlas(kit, 1024, 512, 12, 4, (ctx, w, h, i) => {
      if (i < 8) sponsorCell(ctx, w, h, SP[i][0], SP[i][1], SP[i][2]);
      else if (i === 8) { // tower glass
        ctx.fillStyle = '#1c3a5c'; ctx.fillRect(0, 0, w, h);
        for (let x = 0; x < 8; x++) for (let y = 0; y < 2; y++) { ctx.fillStyle = (x + y) & 1 ? '#7fd0ff' : '#a8e4ff'; ctx.fillRect(x * w / 8 + 4, y * h / 2 + 6, w / 8 - 8, h / 2 - 12); }
      } else if (i === 9) { // tunnel tile
        ctx.fillStyle = '#9ec6d0'; ctx.fillRect(0, 0, w, h);
        for (let x = 0; x < 6; x++) for (let y = 0; y < 3; y++) { ctx.fillStyle = (x + y) & 1 ? '#8cc4d2' : '#bcdde6'; ctx.fillRect(x * w / 6 + 2, y * h / 3 + 2, w / 6 - 4, h / 3 - 4); }
        ctx.fillStyle = '#e83a3a'; ctx.fillRect(0, h * 0.82, w, h * 0.06);
      } else if (i === 10) { // roller door
        ctx.fillStyle = '#d8dde4'; ctx.fillRect(0, 0, w, h);
        for (let y = 0; y < 8; y++) { ctx.fillStyle = y & 1 ? '#c3cad4' : '#e6eaef'; ctx.fillRect(0, y * h / 8, w, h / 8 - 2); }
      } else sponsorCell(ctx, w, h, 'PIT ROW', '#222831', '#3c4656', '#ffd23a');
    });
    const quad = (i, x, y, z, w, h, ry) => panelQ(sg, at, i, x, y, z, w, h, ry, col(0x2b2f3a), kit);

    // ---- sponsor boards behind the barrier along the lap (skip tunnel / bridge / grandstand-front gaps)
    const t0 = L * 0.575, t1 = t0 + 66, br = L * 0.68;
    let si = 0;
    for (let d = 14; d < L - 20; d += 17) {
      if (d > t0 - 12 && d < t1 + 12) continue;
      if (Math.abs(d - br) < 14) continue;
      for (let s = -1; s <= 1; s += 2) {
        if (((d / 17) | 0) % 2 === (s < 0 ? 0 : 1) && d > 30 && d < 260) { /* stands sit behind: keep boards low and tight */ }
        const f = kit.frame(d), p = kit.at(d, s * (hwS + 1.9), 0);
        if (!kit.clear(p[0], p[2], 0) && false) continue;
        quad(si++ % 8, p[0], p[1], p[2], 8.5, 2.2, faceRoad(f, s));
        for (let k = -1; k <= 1; k += 2) b.box(p[0] + f.tx * k * 3.6, p[1], p[2] + f.tz * k * 3.6, 0.22, 2.4, 0.22, 0, col(0x59606e));
      }
    }
    // ---- overhead sponsor gantry + start-grid boxes + road decals
    {
      const d = L * 0.33, f = kit.frame(d), ry = Math.atan2(f.tx, f.tz);
      for (let s = -1; s <= 1; s += 2) { const p = kit.at(d, s * (hwS + 1.5), 0); b.box(p[0], p[1], p[2], 1.1, 9.5, 1.1, ry, col(0x59606e)); }
      rbox(b, kit, d, 0, 9.4, 2 * (hwS + 1.5) + 1.5, 0.8, 1.4, col(0x2b2f3a));
      for (let k = 0; k < 3; k++) { const p = kit.at(d, (k - 1) * 11, 8.4); panelQ(sg, at, 1 + k * 2, p[0], p[1] + 1.2, p[2], 10, 2.6, ry + Math.PI, col(0x2b2f3a), kit); panelQ(sg, at, 1 + k * 2, p[0], p[1] + 1.2, p[2], 10, 2.6, ry, col(0x2b2f3a), kit); }
    }
    const rd = new kit.Batch(), wh = col(0xf4f4f0), yl = col(0xffd23a);
    for (let k = 0; k < 8; k++) {   // grid slots behind the start line
      const d = L - 6 - k * 7.5;
      for (const l of [-4.6, 4.6]) { roadQuad(rd, kit, d - 4.4, d, l - 2.2, l + 2.2, 0.03, wh); roadQuad(rd, kit, d - 4.0, d - 0.5, l - 1.8, l + 1.8, 0.05, col(0x5a5e6c)); }
    }
    for (const d of [L * 0.2, L * 0.46, L * 0.72, L * 0.9]) {   // chevron arrows
      for (let k = 0; k < 3; k++) { const d0 = d + k * 4; rd.quad(kit.at(d0, -3.5, 0.04), kit.at(d0 + 2.2, 0, 0.04), kit.at(d0 + 1.0, 0, 0.04), kit.at(d0 - 1.2, -3.5, 0.04), yl); rd.quad(kit.at(d0 - 1.2, 3.5, 0.04), kit.at(d0 + 1.0, 0, 0.04), kit.at(d0 + 2.2, 0, 0.04), kit.at(d0, 3.5, 0.04), yl); }
    }
    kit.mesh(rd, { polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, detail: false });

    // ---- pit complex (infield side of the start straight): garages, awnings, tires, crates, lamps
    {
      const dA = L - 72, dB = L + 18, cols = [0xe83a3a, 0x2c6bff, 0xffd23a, 0x3ac66a, 0xff7a1a, 0x8a4cff], base = hwS + 9;
      roadQuad(b, kit, dA, dB, hwS + 0.9, hwS + 8, 0.05, col(0x8d909a));
      let gi = 0;
      for (let d = dA + 6; d < dB; d += 12, gi++) {
        const c = cols[gi % 6], f = kit.frame(d), ry = Math.atan2(f.tx, f.tz);
        rbox(b, kit, d, base + 4, 0, 9, 5.2, 11, col(0xf0eee6));
        rbox(b, kit, d, base + 4, 5.2, 9.4, 0.5, 11.4, c);
        rbox(b, kit, d, base - 0.2, 0, 0.3, 4.0, 8, col(0xcfd4dc));      // door slab (textured below)
        { const p = kit.at(d, base - 0.42, 0); panelQ(sg, at, 10, p[0], p[1], p[2], 8, 3.9, faceRoad(f, 1), null, kit); }
        rbox(b, kit, d, base - 1.4, 3.9, 3.2, 0.25, 12, c);                // awning
        for (let k = -1; k <= 1; k += 2) rbox(b, kit, d + k * 5.7, base - 2.6, 0, 0.2, 3.9, 0.2, col(0x6a707c));
        rbox(b, kit, d, base - 0.3, 4.2, 0.2, 0.9, 6, c);
        const p = kit.at(d + 4.5, base - 3.2, 0); tireStack(b, kit, p[0], p[1], p[2], 3 + (gi % 3), col(0x232830), col(0x34394a));
        const q = kit.at(d - 4.5, base - 3, 0); crate(b, kit, q[0], q[1], q[2], 0.9, ry, col(c)); barrel(b, kit, q[0] + 1.2, q[1], q[2] + 0.4, col(0xe83a3a));
        const lp = kit.at(d + 6, hwS + 2.2, 0); lampPost(b, kit, gl, lp[0], lp[1], lp[2], 6.2, 0xfff2c0, faceRoad(f, 1), 0.25);
      }
      // pit wall stripe
      for (let d = dA; d < dB; d += 4) rbox(b, kit, d + 2, hwS + 1.0, 0, 0.6, 0.9, 3.8, ((d / 4) | 0) & 1 ? col(0xffffff) : col(0xe83a3a));
      { const f = kit.frame(dB - 2), p = kit.at(dB - 40, base + 4, 6.2); panelQ(sg, at, 11, p[0], p[1], p[2], 14, 3.2, faceRoad(f, 1), col(0x222831), kit); }
    }
    // ---- timing tower
    {
      const d = L - 80, l = hwS + 26, f = kit.frame(d), ry = Math.atan2(f.tx, f.tz), c = col(0xf0eee6);
      rbox(b, kit, d, l, 0, 9, 24, 9, c); rbox(b, kit, d, l, 24, 12, 1.2, 12, col(0xe83a3a)); rbox(b, kit, d, l, 25.2, 8, 3, 8, col(0x2b2f3a));
      rbox(b, kit, d, l, 28.2, 9, 0.6, 9, col(0xffffff)); b.frustum(...kit.at(d, l, 28.8), 0.15, 0.1, 5, 6, col(0xcccccc), 0);
      for (const sd of [-1, 1]) { const p = kit.at(d, l + sd * 0, 0); void p; }
      { const p = kit.at(d, l - 4.6, 6); panelQ(sg, at, 8, p[0], p[1], p[2], 8.4, 16, faceRoad(f, 1), null, kit); }
      { const p = kit.at(d, l - 6.2, 25.4); panelQ(sg, at, 11, p[0], p[1], p[2], 9, 2.6, faceRoad(f, 1), null, kit); }
      kit.reserve(...[kit.at(d, l, 0)[0], kit.at(d, l, 0)[2], 18]);
    }
    // ---- tunnel: tiled interior, ceiling lamps, glow pools, grassy hill on top, sign over each mouth
    {
      const w = 17;
      for (let d = t0; d < t1; d += 6) {
        for (let s = -1; s <= 1; s += 2) {
          const f = kit.frame(d + 3), p = kit.at(d + 3, s * w, 0);
          panelQ(sg, at, 9, p[0], p[1] + 0.2, p[2], 6.1, 9.4, faceRoad(f, s), null, kit);
          // slight tilt trick: this quad's width runs along the road, so rotate 90deg
        }
      }
      for (let d = t0 + 3; d < t1; d += 12) {
        for (const l of [-9, 0, 9]) { const p = kit.at(d, l, 10.3); b.box(p[0], p[1], p[2], 1.2, 0.18, 3.6, Math.atan2(kit.frame(d).tx, kit.frame(d).tz), col(0xfffbe8)); gl.pool(p[0], kit.at(d, 0, 0)[1], p[2], 8, 0xfff0c0, 0.5); gl.halo(p[0], p[1] - 0.4, p[2], 2.6, 0xfff4d0, 0.5); }
      }
      const f0 = kit.frame(t0), ry = Math.atan2(f0.tx, f0.tz);
      for (const dm of [t0 - 0.5, t1 + 0.5]) { const f = kit.frame(dm), p = kit.at(dm, 0, 12.2); panelQ(sg, at, dm < t0 + 1 ? 0 : 7, p[0], p[1], p[2], 18, 2.4, ry + (dm < t0 + 1 ? Math.PI : 0), col(0x2b2f3a), kit); void f; }
      for (let d = t0; d < t1; d += 6) rbox(b, kit, d + 3, 0, 12.9, 2 * w - 1, 2.6, 6.2, col(0x5cba3e));   // grass crown on the roof
      for (const o of [-24, -8, 8, 24]) {
        const c = kit.at((t0 + t1) / 2 + o, 0, 0);
        blobR(b, kit, c[0], c[1] + 16.6, c[2], 18, 5, 21, ry, jit(kit, 0x5cba3e, rng, 0.08), 2);
      }
      for (let k = 0; k < 14; k++) { const c = kit.at(t0 + rng() * 66, (rng() < 0.5 ? -1 : 1) * rng() * 12, 0); flowerPatch(fb, kit, c[0], c[1] + 17, c[2], 6, 8, [0xffffff, 0xffd23a, 0xff6a8a], rng); }
      kit.reserve(kit.at((t0 + t1) / 2, 0, 0)[0], kit.at((t0 + t1) / 2, 0, 0)[2], 36);
    }
    // ---- roadside dressing: lamps, benches, bushes, tire/barrel clusters, flower beds along corners
    for (let d = 20; d < L - 10; d += 26) {
      if (d > t0 - 14 && d < t1 + 14) continue;
      const s = (d / 26) & 1 ? 1 : -1, f = kit.frame(d), p = kit.at(d + 7, s * (hwS + 6.5), 0);
      if (!kit.clear(p[0], p[2], 19)) continue;
      const r = rng();
      if (r < 0.34) { bench(b, kit, p[0], p[1], p[2], faceRoad(f, s), col(0xb5763a)); lampPost(b, kit, gl, p[0] + f.tx * 2.4, p[1], p[2] + f.tz * 2.4, 5.2, 0xfff2c0, faceRoad(f, s), 0.2); }
      else if (r < 0.66) { tireStack(b, kit, p[0], p[1], p[2], 4, col(0xe83a3a), col(0xf4f4f4)); tireStack(b, kit, p[0] + 1.8, p[1], p[2], 3, col(0xf4f4f4), col(0xe83a3a)); crate(b, kit, p[0] - 1.4, p[1], p[2] + 0.5, 1.1, rng(), col(0xd89a3a)); }
      else { for (let k = 0; k < 4; k++) barrel(b, kit, p[0] + (k % 2) * 1.1, p[1] + (k > 1 ? 1.1 : 0), p[2] + (k % 2) * 0.1, col([0xff7a1a, 0xe83a3a, 0x2c6bff, 0xffd23a][k])); }
    }
    for (let k = 0; k < 90; k++) {   // flower beds & hedges hugging the barrier
      const d = rng() * L, s = rng() < 0.5 ? -1 : 1, p = kit.at(d, s * (hwS + 3 + rng() * 6), 0);
      if (!kit.clear(p[0], p[2], 19)) continue;
      if (rng() < 0.45) bush(b, kit, p[0], p[1], p[2], 0.9 + rng() * 0.8, rng, 0x2f9a3e, 0x46b04a);
      flowerPatch(fb, kit, p[0] + 1.2, gy, p[2] + 1, 2 + rng() * 2, 18, [[0xff4d6d, 0xffd23a, 0xffffff], [0x3a8cff, 0xffffff, 0xff9ad8], [0xffe14a, 0xff8a1a, 0xffffff]][k % 3], rng);
    }
    // ---- rolling flowery hills + rocks + trees on slopes
    kit.farScatter(26, 60, (x, z, r) => {
      const s = 18 + r() * 22, ry = r() * 3;
      blobR(b, kit, x, gy - 2, z, s * 1.5, s * 0.6, s, ry, kit.mul(col(0x7ad04a), 0.88 + r() * 0.24), 2);
      for (let q = 0; q < 6; q++) { const a = r() * TAU, dd = r() * s * 0.8; flowerPatch(fb, kit, x + Math.cos(a) * dd, gy + s * 0.45, z + Math.sin(a) * dd, 3, 8, [0xffffff, 0xffd23a, 0xff6a8a, 0xb88aff], r); }
      for (let q = 0; q < 3; q++) { const a = r() * TAU, dd = r() * s * 0.9; roundTree(fb, kit, x + Math.cos(a) * dd, gy + 1 + s * 0.2, z + Math.sin(a) * dd, 0.9 + r() * 0.6, r); }
    });
    kit.scatter(60, 2, 60, 24, (x, z, i, r) => rockCluster(b, kit, x, gy, z, 0.8 + r() * 1.2, r, [0xb9b3a6, 0xa8a296, 0xcfc9bc]));
    kit.scatter(70, 1, 40, 22, (x, z, i, r) => bush(b, kit, x, gy, z, 0.8 + r() * 0.9, r, 0x2f9a3e, 0x57c24a));
    // ---- hot-air balloons
    {
      const sets = [[0xe83a3a, 0xffffff], [0xffd23a, 0x2c6bff], [0xff7a1a, 0xffffff, 0x3ac66a], [0x8a4cff, 0xffd23a], [0x18b8e8, 0xff5a8a]];
      const P = [[bb.cx - 60, 60, bb.cz + 30], [bb.cx + 130, 85, bb.cz + 80], [bb.cx - 170, 70, bb.cz - 30], [bb.cx + 40, 110, bb.cz + 150], [bb.cx + 260, 75, bb.cz - 40]];
      P.forEach((q, i) => { const m = balloonMesh(kit, sets[i], 6 + (i % 2) * 1.5, 11); m.position.set(q[0], q[1], q[2]); m.rotation.y = i; kit.bob(m, 1.4, 0.35 + i * 0.05, i * 1.3, 0.03); kit.spinner(m, 'y', 0.03 + i * 0.01); });
    }
    kit.mesh(b); kit.foliage(fb, { strength: 0.3 });
    kit.mesh(sg, at.tex ? { map: at.tex, emissive: 0x484848, emissiveMap: at.tex, detail: false } : {});
    gl.done();
  }

  // ---- Coral Coast beauty pass: reef, piers, beach huts, cliffs, island vista, signage
  function coralBeauty(track, kit, bb, st) {
    const L = kit.length, col = kit.col, rng = kit.rng, gy = kit.groundY, hwS = 17, seaZ = bb.minZ - 46;
    const b = new kit.Batch(), fb = new kit.Batch(), sg = new kit.Batch(true), gl = glowSet(kit), reef = new kit.Batch();
    const SP = [['COCO BAR', '#ff7a59', '#e8503a'], ['SURF SHOP', '#18b8e8', '#0c78b8'], ['SEA SNACKS', '#ffd23a', '#e8961a'], ['SCUBA CLUB', '#2c6bff', '#1a3f9c'],
      ['TIKI HUT', '#3ac66a', '#1a8a48'], ['SUN & SAND', '#ff5a8a', '#c82c64'], ['REEF TOURS', '#18c8b8', '#0c8a88'], ['GELATO', '#ffa0d0', '#e85aa8']];
    const at = makeAtlas(kit, 1024, 384, 8, 4, (ctx, w, h, i) => sponsorCell(ctx, w, h, SP[i][0], SP[i][1], SP[i][2]));
    const shoreL = -(hwS + 9);
    // ---- coral reef under the shallows (water made more transparent so it shows)
    if (st.sea) { setOpacity(st.sea[0].material, 0.58); }
    const cc = [0xff7a59, 0xff5a8a, 0xb86aff, 0xffd23a, 0xff9a3a, 0x59e0c8], x0 = bb.minX - 150, x1 = bb.maxX + 150;
    for (let q = 0; q < 70; q++) {   // dark lagoon-floor patches for depth
      const x = x0 + rng() * (x1 - x0), z = seaZ - 8 - rng() * 62, s = 5 + rng() * 10;
      reef.blob(x, gy + 0.03, z, s * 1.4, 0.04, s, kit.mix(col(0x2a9fb0), col(0x37b8a8), rng()), 1);
    }
    for (let q = 0; q < 95; q++) {
      const x = x0 + rng() * (x1 - x0), z = seaZ - 10 - rng() * 58, s = 0.8 + rng() * 1.3, c = cc[(rng() * cc.length) | 0];
      if (rng() < 0.3) { reef.blob(x, gy, z, 1.4 * s, 0.9 * s, 1.4 * s, kit.mul(col(c), 0.9), 1); continue; }
      const n = 4 + ((rng() * 4) | 0);
      for (let k = 0; k < n; k++) { const a = (k / n) * TAU + rng(), lean = 0.5 * s; reef.frustum(x + Math.cos(a) * 0.5 * s, gy - 0.1, z + Math.sin(a) * 0.5 * s, 0.32 * s, 0.1 * s, (1.2 + rng() * 1.3) * s, 5, kit.mul(col(c), 0.85 + rng() * 0.3), a); void lean; }
      reef.blob(x, gy, z, 0.6 * s, 0.4 * s, 0.6 * s, kit.mul(col(c), 0.8), 0);
    }
    for (let q = 0; q < 30; q++) { const x = x0 + rng() * (x1 - x0), z = seaZ - 8 - rng() * 60; rockCluster(reef, kit, x, gy - 0.1, z, 0.9 + rng(), rng, [0x6a7a8a, 0x8a9aa8, 0x7a8a7a]); }
    kit.mesh(reef);
    // ---- piers (deck, posts, lamps, boats)
    for (const d of [90, 175, 290]) {
      const f = kit.frame(d), ry = Math.atan2(f.tx, f.tz), l0 = -(hwS + 14), l1 = -(hwS + 70), len = l0 - l1, ctr = (l0 + l1) / 2;
      rbox(b, kit, d, ctr, 0.95, len, 0.25, 3.6, col(0xb98a52));
      for (let k = 0; k < len; k += 2) rbox(b, kit, d, l0 - k, 1.2, 0.18, 0.06, 3.7, col(0x946a3a));
      for (let k = 0; k <= len; k += 5) for (const sd of [-1.7, 1.7]) rbox(b, kit, d + sd, l0 - k, -0.6, 0.35, 1.95, 0.35, col(0x6a4a2a));
      for (let k = 6; k < len; k += 12) {
        const p = kit.at(d + 1.9, l0 - k, 1.2); lampPost(b, kit, gl, p[0], p[1], p[2], 3.2, 0xffe2a0, 0, 0.2);
        rbox(b, kit, d - 1.8, l0 - k, 1.2, 0.18, 0.8, 0.18, col(0x6a4a2a));
      }
      const pe = kit.at(d, l1 - 3, 1.2); b.box(pe[0], pe[1], pe[2], 6, 0.3, 6, ry, col(0xb98a52));
      rbox(b, kit, d, l1 - 3, 1.5, 3.4, 2.6, 3.4, col([0xfff3d6, 0xffb8a0, 0x9be3dc][(d / 90 | 0) % 3]));
      b.frustum(pe[0], pe[1] + 4.1, pe[2], 3.0, 0, 1.8, 4, col(0xe8503a), ry + Math.PI / 4);
      // moored rowboat + buoys
      const bp = kit.at(d + 4.5, l1 - 6, 0.2); b.blob(bp[0], bp[1] + 0.2, bp[2], 0.9, 0.35, 2.2, col(0xffffff), 1); b.blob(bp[0], bp[1] + 0.45, bp[2], 0.6, 0.12, 1.7, col(0xe8503a), 0);
    }
    // ---- beach huts, lifeguard tower, loungers, umbrellas with towels on the shore side
    const hutC = [0xff7a59, 0x35c0d9, 0xffd23a, 0xff7ad9, 0x59d66b, 0xffffff];
    for (let k = 0; k < 15; k++) {
      const d = 18 + k * 21 + rng() * 6, p = kit.at(d, shoreL - rng() * 6, 0), f = kit.frame(d), ry = faceRoad(f, -1);
      if (!kit.clear(p[0], p[2], 19)) continue;
      const c = col(hutC[k % 6]);
      b.box(p[0], gy, p[2], 3.6, 2.6, 3.0, ry, col(0xfff3d6));
      b.box(p[0], gy + 2.6, p[2], 4.1, 0.25, 3.5, ry, c); b.frustum(p[0], gy + 2.85, p[2], 2.9, 0, 1.3, 4, c, ry + Math.PI / 4);
      const cs = Math.cos(ry), sn = Math.sin(ry);
      b.box(p[0] + 1.5 * sn, gy, p[2] + 1.5 * cs, 1.1, 1.9, 0.18, ry, kit.mul(c, 0.85));   // door
      b.box(p[0] + 1.3 * sn - 1.1 * cs, gy + 1.3, p[2] + 1.3 * cs + 1.1 * sn, 0.8, 0.8, 0.14, ry, col(0x35a0c0));
      for (let s = 0; s < 3; s++) { const a = ry + (s - 1) * 0.35; const sx = p[0] + Math.sin(a) * 3.2 + cs * 2.4, sz = p[2] + Math.cos(a) * 3.2 - sn * 2.4; b.blob(sx, gy + 1.1, sz, 0.28, 1.0, 0.1, col([0xff5a6a, 0x35c0d9, 0xffd23a][s]), 0); }
      if (k % 2 === 0) { const q = kit.at(d + 7, shoreL - 4, 0); b.box(q[0], q[1], q[2], 1.1, 0.5, 2.0, ry, col(0xffffff)); b.box(q[0], q[1] + 0.5, q[2] - 0.7 * cs, 1.1, 0.6, 0.12, ry, col(0xffffff)); }
      else panelQ(sg, at, k % 8, p[0] + 2.4 * sn, gy + 3.5, p[2] + 2.4 * cs, 3.4, 1.0, ry, col(0x6a4a2a), kit);
    }
    {
      const d = 215, p = kit.at(d, shoreL - 3, 0), f = kit.frame(d), ry = faceRoad(f, -1);
      for (const [sx, sz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) b.box(p[0] + sx, gy, p[2] + sz, 0.2, 3.6, 0.2, 0, col(0xffffff));
      b.box(p[0], gy + 3.6, p[2], 3.4, 0.2, 3.4, ry, col(0xffffff)); b.box(p[0], gy + 4.5, p[2], 3.6, 1.7, 3.6, ry, col(0xff7a59)); b.frustum(p[0], gy + 6.2, p[2], 2.8, 0, 1.2, 4, col(0xfff3d6), ry + Math.PI / 4);
      b.box(p[0] + 1.6 * Math.sin(ry), gy + 4.2, p[2] + 1.6 * Math.cos(ry), 0.9, 0.5, 0.1, ry, col(0xffffff));
      kit.reserve(p[0], p[2], 6);
    }
    // ---- resort: tall pastel tower + cabanas with striped awnings, sign boards at hotel
    {
      const d = 395, p = kit.at(d, 60, 0), f = kit.frame(d), ry = Math.atan2(f.tx, f.tz);
      if (kit.clear(p[0], p[2], 20)) {
        b.box(p[0], gy, p[2], 16, 34, 16, ry, col(0xfff3d6)); b.box(p[0], gy + 34, p[2], 17, 1.4, 17, ry, col(0x35c0d9));
        for (let r = 0; r < 7; r++) for (let k = -2; k <= 2; k++) { const cs = Math.cos(ry), sn = Math.sin(ry); b.box(p[0] + k * 2.8 * cs + 8.05 * sn - 0.0, gy + 3 + r * 4.4, p[2] - k * 2.8 * sn + 8.05 * cs, 1.8, 2.2, 0.2, ry, col(0x2a8fc9)); b.box(p[0] + k * 2.8 * cs - 8.05 * sn, gy + 3 + r * 4.4, p[2] - k * 2.8 * sn - 8.05 * cs, 1.8, 2.2, 0.2, ry, col(0x2a8fc9)); }
        panelQ(sg, at, 0, p[0] + 8.2 * Math.sin(ry), gy + 26, p[2] + 8.2 * Math.cos(ry), 12, 3.4, ry, col(0xe8503a), kit);
        kit.reserve(p[0], p[2], 20);
      }
    }
    // ---- cliffs: layered limestone headlands at both ends of the beach + sea stacks + a rock arch
    const cl = [0xe8d6b0, 0xd9c08c, 0xc9a870, 0xeadcb8].map(col);
    const headland = (x, z, R, H, seed) => {
      for (let k = 0; k < 4; k++) b.frustum(x, gy + (k * H) / 4 - 1, z, R * (1 - k * 0.1), R * (1 - (k + 1) * 0.1 - 0.04), H / 4 + 0.4, 8, cl[k % 4], seed + k * 0.6);
      b.blob(x, gy + H - 1, z, R * 0.82, H * 0.14, R * 0.82, col(0x4cae4a), 1);
      for (let q = 0; q < 4; q++) { const a = rng() * TAU; roundTree(fb, kit, x + Math.cos(a) * R * 0.5, gy + H - 0.4, z + Math.sin(a) * R * 0.5, 0.7 + rng() * 0.4, rng, 0x3f9a4a, 0x57b85a); }
    };
    headland(bb.minX - 55, seaZ + 10, 22, 30, 0.2); headland(bb.minX - 85, seaZ - 30, 15, 22, 1.1); headland(bb.maxX + 40, seaZ + 6, 24, 34, 2.3); headland(bb.maxX + 80, seaZ - 28, 14, 20, 0.7);
    for (let k = 0; k < 7; k++) { const x = bb.minX + rng() * (bb.maxX - bb.minX), z = seaZ - 95 - rng() * 140; headland(x, z, 4 + rng() * 6, 9 + rng() * 14, rng() * 3); }
    {   // rock arch in the shallows
      const ax = bb.cx - 30, az = seaZ - 40;
      for (const s of [-1, 1]) { b.frustum(ax + s * 6, gy - 1, az, 3.4, 2.4, 11, 8, cl[1], 0); }
      b.box(ax, gy + 9.4, az, 17, 3.6, 5.2, 0.1, cl[0]); b.blob(ax, gy + 12.6, az, 7.6, 1.8, 3.2, col(0x4cae4a), 1);
    }
    // ---- inland hillside rocks and tropical vegetation
    kit.scatter(110, 2, 60, 24, (x, z, i, r) => rockCluster(b, kit, x, gy, z, 0.7 + r() * 1.5, r, [0xd9c9a0, 0xc2ae84, 0xe8dcc0]));
    kit.scatter(80, 3, 50, 22, (x, z, i, r) => { bush(fb, kit, x, gy, z, 0.8 + r() * 0.8, r, 0x2f9a3e, 0x4cae4a); flowerPatch(fb, kit, x + 1, gy, z, 1.8, 10, [0xff4d6d, 0xff9a3a, 0xff7ad9, 0xffffff], r); });
    kit.scatter(40, 4, 36, 22, (x, z, i, r) => {   // hibiscus / bird-of-paradise tufts
      for (let k = 0; k < 5; k++) { const a = k * 1.26, px = x + Math.cos(a) * 0.6, pz = z + Math.sin(a) * 0.6; fb.quad([px, gy, pz], [px + 0.3, gy + 1.5, pz], [px, gy + 2.2, pz + 0.3], [px - 0.3, gy + 1.5, pz], col(0x2f9a45)); }
      fb.blob(x, gy + 1.9, z, 0.35, 0.5, 0.35, col(0xff7a1a), 0);
    });
    kit.farScatter(16, 80, (x, z, r) => { if (z < seaZ + 20) return; const s = 24 + r() * 28; blobR(b, kit, x, gy - 3, z, s * 1.5, s * 0.6, s, r() * 3, kit.mul(col(0x4fb04a), 0.85 + r() * 0.25), 2); for (let q = 0; q < 4; q++) palm(fb, kit, x + (r() - 0.5) * s * 1.2, gy + s * 0.3, z + (r() - 0.5) * s, 1.2 + r() * 0.6, r); });
    // ---- far island with a volcano and palm stands on the horizon
    {
      const ix = bb.cx + 80, iz = seaZ - 520;
      blobR(b, kit, ix, gy - 2, iz, 110, 9, 55, 0.3, col(0xe8cf90), 2); blobR(b, kit, ix - 130, gy - 2, iz + 30, 60, 8, 35, 1, col(0xe8cf90), 1);
      b.frustum(ix + 10, gy, iz, 55, 14, 50, 9, col(0x6f8a58), 0); b.frustum(ix + 10, gy + 50, iz, 14, 7, 6, 9, col(0x8a5a3a), 0);
      for (let q = 0; q < 14; q++) palm(fb, kit, ix - 90 + q * 14, gy + 1, iz + 38 + (q % 3) * 6, 2.0 + rng(), rng);
      for (let q = 0; q < 6; q++) blobR(b, kit, bb.minX - 200 + q * 190, gy - 6, seaZ - 380 - rng() * 120, 28 + rng() * 30, 22 + rng() * 25, 20, rng() * 3, col(0xc7b48c), 1);
    }
    // ---- start-straight beach boardwalk lamps with glow, volleyball nets, sandcastles, starfish
    for (let d = 10; d < 330; d += 24) { const p = kit.at(d, shoreL + 2.5, 0), f = kit.frame(d); lampPost(b, kit, gl, p[0], p[1], p[2], 5.4, 0xfff0c0, faceRoad(f, -1), 0.22); }
    for (let k = 0; k < 4; k++) {
      const d = 60 + k * 70, p = kit.at(d, shoreL - 12, 0), f = kit.frame(d), ry = Math.atan2(f.tx, f.tz);
      if (k & 1) { rbox(b, kit, d, shoreL - 12, 0, 0.14, 2.4, 0.14, col(0xdddddd)); rbox(b, kit, d + 8, shoreL - 12, 0, 0.14, 2.4, 0.14, col(0xdddddd)); rbox(b, kit, d + 4, shoreL - 12, 1.7, 0.05, 0.8, 8, col(0xffffff)); }
      else { b.frustum(p[0], gy, p[2], 1.6, 1.2, 0.9, 10, col(0xe8cf90), 0); b.frustum(p[0], gy + 0.9, p[2], 0.8, 0.5, 1.0, 8, col(0xf0dca0), 0); b.box(p[0], gy + 1.9, p[2], 0.05, 1, 0.05, ry, col(0xdddddd)); b.tri([p[0], gy + 2.6, p[2]], [p[0] + 0.7, gy + 2.3, p[2]], [p[0], gy + 2.0, p[2]], col(0xff4d4d)); }
    }
    for (let k = 0; k < 40; k++) { const d = rng() * L, p = kit.at(d, shoreL - 2 - rng() * 22, 0); if (kit.clear(p[0], p[2], 19)) { if (k & 1) b.blob(p[0], gy + 0.05, p[2], 0.45, 0.06, 0.45, col(0xff7a59), 0); else b.box(p[0], gy + 0.03, p[2], 1.7, 0.04, 0.9, rng() * 3, col([0xff5a6a, 0x35c0d9, 0xffd23a, 0xffffff][k & 3])); } }
    // ---- big beach ball + inflatable ring props near the start
    { const p = kit.at(30, shoreL - 6, 0); b.blob(p[0], gy + 1.3, p[2], 1.3, 1.3, 1.3, col(0xff4d4d), 1); b.blob(p[0], gy + 1.3, p[2], 1.32, 0.5, 1.32, col(0xffffff), 1); }
    kit.mesh(b); kit.foliage(fb, { strength: 0.4, heightScale: 0.2 });
    kit.mesh(sg, at.tex ? { map: at.tex, emissive: 0x484848, emissiveMap: at.tex, detail: false } : {});
    gl.done();
  }

  // striped big-top tent (wedge cone) with pennant
  function bigTop(b, kit, x, y, z, R, H, c1, c2, wall) {
    const n = 12, wh = H * 0.38;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, c = i & 1 ? c1 : c2;
      b.quad([x + Math.cos(a0) * R, y, z + Math.sin(a0) * R], [x + Math.cos(a1) * R, y, z + Math.sin(a1) * R], [x + Math.cos(a1) * R, y + wh, z + Math.sin(a1) * R], [x + Math.cos(a0) * R, y + wh, z + Math.sin(a0) * R], c);
      b.tri([x + Math.cos(a0) * R * 1.08, y + wh, z + Math.sin(a0) * R * 1.08], [x + Math.cos(a1) * R * 1.08, y + wh, z + Math.sin(a1) * R * 1.08], [x, y + H, z], c);
    }
    b.frustum(x, y + H, z, 0.12, 0.05, 2.6, 5, kit.col(0xdddddd), 0);
    void wall;
  }
  function lollipop(b, kit, x, y, z, s, c1, c2) {
    b.frustum(x, y, z, 0.12 * s, 0.12 * s, 3.2 * s, 6, kit.col(0xf4f4f4), 0);
    for (let k = 0; k < 4; k++) b.frustum(x, y + 3.2 * s + k * 0.001, z + k * 0.002, (1.25 - k * 0.3) * s, (1.25 - k * 0.3) * s, 0.3 * s, 14, k & 1 ? c2 : c1, 0);
    b.frustum(x, y + 3.5 * s, z, 1.3 * s, 1.3 * s, 0.0, 14, c1, 0);
  }
  function iceCream(b, kit, x, y, z, s) {
    const col = kit.col;
    b.frustum(x, y, z, 0.2 * s, 2.2 * s, 6 * s, 10, col(0xe2a860), 0);
    b.blob(x, y + 6.6 * s, z, 2.5 * s, 1.9 * s, 2.5 * s, col(0xff9ac8), 1); b.blob(x, y + 8.5 * s, z, 2.1 * s, 1.7 * s, 2.1 * s, col(0xfff3d6), 1); b.blob(x, y + 10.2 * s, z, 1.7 * s, 1.5 * s, 1.7 * s, col(0x8a5a3a), 1);
    b.blob(x, y + 11.9 * s, z, 0.5 * s, 0.5 * s, 0.5 * s, col(0xe8283a), 1);
  }
  function tinyTotBeauty(track, kit, st) {
    const L = kit.length, col = kit.col, rng = kit.rng, gy = kit.groundY, hw = 10 + 3;
    const b = new kit.Batch(), fb = new kit.Batch(), sg = new kit.Batch(true), gl = glowSet(kit), bulbs = new kit.Batch(), bulbs2 = new kit.Batch();
    const SP = [['TINY TOT PARK', '#ff4d6d', '#ffa02a'], ['BUMPER CARS', '#2c6bff', '#18b8e8'], ['POPCORN', '#ffd23a', '#ff7a1a'], ['CANDY SHOP', '#ff7ad9', '#b86aff'],
      ['FUN HOUSE', '#3ac66a', '#18b8e8'], ['SPLASH!', '#18b8e8', '#2c6bff'], ['PRIZES', '#ff7a1a', '#e8283a'], ['TICKETS', '#8a4cff', '#ff4d6d']];
    const BL = ['A', 'B', 'C', '1', '2', '3'], BC = ['#ff4d6d', '#2c6bff', '#ffd23a', '#3ac66a', '#ff7a1a', '#b86aff'];
    const at = makeAtlas(kit, 1024, 640, 16, 4, (ctx, w, h, i) => {
      if (i < 8) sponsorCell(ctx, w, h, SP[i][0], SP[i][1], SP[i][2]);
      else if (i < 14) { const k = i - 8; ctx.fillStyle = BC[k]; ctx.fillRect(0, 0, w, h); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(w * 0.1, h * 0.1, w * 0.8, h * 0.8); ctx.fillStyle = BC[(k + 3) % 6]; ctx.font = '900 ' + h * 0.75 + 'px Bungee, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(BL[k], w / 2, h * 0.54); }
      else { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); for (let k = 0; k < 8; k++) { ctx.fillStyle = k & 1 ? '#ff4d6d' : '#ffffff'; ctx.fillRect(k * w / 8, 0, w / 8, h); } }
    });
    const pal = [0xff4d6d, 0xffd23a, 0x3aa0ff, 0x4ad64a, 0xff7ad8, 0xff9a2a, 0xb86aff];
    // ---- promenade: pastel checker paving on both sides of the oval + candy-cane picket fence
    {
      const pv = new kit.Batch(), pc = [col(0xffb8d4), col(0xa8dcff), col(0xffe48a), col(0xb4f0a0)];
      for (let d = 0; d < L; d += 4.6) for (const [l0, l1] of [[-(hw + 0.6), -(hw + 5.6)], [hw + 0.6, hw + 5.6]]) {
        roadQuad(pv, kit, d, d + 4.6, l0, l1, 0.03, pc[((d / 4.6) | 0) & 3]);
        roadQuad(pv, kit, d, d + 4.6, l0 < 0 ? l1 - 5 : l1, l0 < 0 ? l1 : l1 + 5, 0.02, pc[(((d / 4.6) | 0) + 2) & 3]);
      }
      kit.mesh(pv, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, detail: false });
      for (let d = 0; d < L; d += 13) for (const s of [-1, 1]) {
        const p = kit.at(d, s * (hw + 4.4), 0);
        for (let k = 0; k < 4; k++) b.frustum(p[0], p[1] + k * 0.55, p[2], 0.17, 0.17, 0.56, 6, k & 1 ? col(0xffffff) : col(0xff4d6d), 0);
        b.blob(p[0], p[1] + 2.35, p[2], 0.3, 0.3, 0.3, col(pal[((d / 13) | 0) % 7]), 0);
      }
    }
    // ---- big entrance sign + ice cream cone + gumball + giant lollipops at the start
    {
      const f = kit.frame(0), ry = Math.atan2(f.tx, f.tz), p = kit.at(-2, 0, 12.2);
      for (const s of [1, -1]) panelQ(sg, at, 0, p[0] + f.tx * s * 0.2, p[1] + 0.3, p[2] + f.tz * s * 0.2, 26, 2.8, ry + (s < 0 ? 0 : Math.PI), col(0x2b2f3a), kit);
      const q = kit.at(-8, hw + 12, 0); iceCream(b, kit, q[0], q[1], q[2], 1.1); kit.reserve(q[0], q[2], 5);
      const q2 = kit.at(-8, -(hw + 12), 0); iceCream(b, kit, q2[0], q2[1], q2[2], 0.9); kit.reserve(q2[0], q2[2], 5);
      for (let k = 0; k < 6; k++) { const a = kit.at(8 + k * 5, (k & 1 ? 1 : -1) * (hw + 9 + (k % 3) * 1.8), 0); lollipop(b, kit, a[0], a[1], a[2], 1.1, col(pal[k % 7]), col(0xffffff)); }
    }
    // ---- rides in the infield & outer ring
    // swing ride (turning) at the left infield
    {
      const x = -52, z = 30, sb = new kit.Batch();
      sb.frustum(0, 0, 0, 0.7, 0.7, 14, 8, col(0xffd23a), 0);
      sb.frustum(0, 14, 0, 7, 1.2, 2.2, 14, col(0xff4d6d), 0); sb.frustum(0, 14, 0, 7.4, 7.4, 0.4, 14, col(0xffffff), 0); sb.blob(0, 16.6, 0, 0.9, 1.1, 0.9, col(0x3aa0ff), 1);
      for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU, px = Math.cos(a) * 6.2, pz = Math.sin(a) * 6.2; beam(sb, [px, 14, pz], [px * 1.25, 9.4, pz * 1.25], 0.05, col(0xdddddd)); sb.box(px * 1.25 - 0.4, 8.8, pz * 1.25 - 0.4, 0.8, 0.6, 0.8, -a, col(pal[k % 7])); }
      kit.spinBatch(sb, { x, y: gy, z, axis: 'y', speed: 0.9 });
      b.frustum(x, gy, z, 8, 8.4, 0.5, 14, col(0xe8e2d2), 0); kit.reserve(x, z, 10);
    }
    // teacups, pirate ship, drop tower, big-top bumper tent & fun-house on the outer ring
    const ringPos = (frac, lat) => kit.at(L * frac, lat, 0);
    {
      const p = ringPos(0.12, -(hw + 56)); const cb = new kit.Batch();
      cb.frustum(0, 0, 0, 7, 7.4, 0.5, 16, col(0xffffff), 0);
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU, px = Math.cos(a) * 4.2, pz = Math.sin(a) * 4.2; cb.frustum(px, 0.5, pz, 1.5, 1.1, 1.3, 10, col(pal[k % 7]), 0); cb.frustum(px, 1.8, pz, 1.52, 1.52, 0.16, 10, col(0xffffff), 0); cb.blob(px, 0.7, pz, 0.7, 0.2, 0.7, col(0xffe9a8), 0); }
      cb.frustum(0, 0.5, 0, 0.9, 0.5, 2.6, 8, col(0xff4d6d), 0); cb.blob(0, 3.1, 0, 1.1, 0.8, 1.1, col(0xffd23a), 1);
      kit.spinBatch(cb, { x: p[0], y: gy + 0.4, z: p[2], axis: 'y', speed: 0.6 }); kit.reserve(p[0], p[2], 10);
    }
    {
      const p = ringPos(0.3, -(hw + 58)), f = kit.frame(L * 0.3), ry = Math.atan2(f.tx, f.tz), pb = new kit.Batch();
      for (const s of [-1, 1]) { beam(b, [p[0] + f.rx * s * 5, gy, p[2] + f.rz * s * 5 - 4], [p[0], gy + 15, p[2]], 0.35, col(0x4a6fd8)); beam(b, [p[0] + f.rx * s * 5, gy, p[2] + f.rz * s * 5 + 4], [p[0], gy + 15, p[2]], 0.35, col(0x4a6fd8)); }
      pb.blob(0, -9, 0, 1.8, 1.6, 7.6, col(0xff4d6d), 1); pb.box(-0.1, -7, -0.3, 0.2, 9, 0.2, 0, col(0xdddddd)); pb.blob(0, -7.2, 7.3, 0.7, 1.2, 1.0, col(0xffd23a), 1);
      pb.tri([0, 1, -0.3], [0, -6, 3.5], [0, -6, -3.8], col(0xffffff));
      const m = kit.mesh(pb); m.position.set(p[0], gy + 15, p[2]); m.rotation.y = ry; kit.sway(m, 'x', 0.55, 0.9, 0); kit.reserve(p[0], p[2], 12);
      b.box(p[0] - 5, gy, p[2] - 5, 10, 0.4, 10, 0, col(0xe8e2d2));
    }
    {
      const p = ringPos(0.52, -(hw + 56)), tb = new kit.Batch();
      for (let k = 0; k < 4; k++) b.box(p[0] - 1.1, gy + k * 9, p[2] - 1.1, 2.2, 9.05, 2.2, 0, col(k & 1 ? 0x3aa0ff : 0xffffff));
      b.blob(p[0], gy + 37, p[2], 2.2, 1.6, 2.2, col(0xff4d6d), 1);
      for (let k = 0; k < 10; k++) { const y = gy + 5 + k * 3.3; bulbs.blob(p[0] + 1.18, y, p[2], 0.2, 0.2, 0.2, col(pal[k % 7]), 0); bulbs2.blob(p[0] - 1.18, y, p[2], 0.2, 0.2, 0.2, col(pal[(k + 3) % 7]), 0); gl.halo(p[0] + 1.4, y, p[2], 0.9, pal[k % 7], 0.5); }
      tb.box(-2.4, 0, -2.4, 4.8, 1.4, 4.8, 0, col(0xffd23a)); tb.box(-2.6, 1.4, -2.6, 5.2, 0.4, 5.2, 0, col(0xff4d6d));
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) tb.box(sx * 2 - 0.3, 1.8, sz * 2 - 0.3, 0.6, 0.9, 0.6, 0, col(0x3aa0ff));
      const m = kit.mesh(tb); m.position.set(p[0], gy + 4, p[2]); kit.slide(m, 0, 11, 0, 0.7); kit.reserve(p[0], p[2], 9);
    }
    bigTop(b, kit, ...ringPos(0.7, -(hw + 58)), 11, 12, col(0xff4d6d), col(0xffffff)); { const p = ringPos(0.7, -(hw + 58)); kit.reserve(p[0], p[2], 13); const f = kit.frame(L * 0.7); panelQ(sg, at, 1, p[0] + f.rx * 0, gy + 5.5, p[2], 9, 2.4, faceRoad(f, -1) + Math.PI, col(0x2b2f3a), kit); }
    bigTop(b, kit, ...ringPos(0.9, -(hw + 56)), 9, 10, col(0x3aa0ff), col(0xffd23a)); { const p = ringPos(0.9, -(hw + 56)); kit.reserve(p[0], p[2], 11); }
    {   // fun house: clown face facade
      const p = ringPos(0.42, hw + 22), f = kit.frame(L * 0.42), ry = faceRoad(f, 1); void p; void ry;
    }
    {
      const p = ringPos(0.0, -(hw + 66)), ry = 0.0;
      b.box(p[0] - 10, gy, p[2], 20, 14, 5, ry, col(0xffe9a8));
      b.blob(p[0], gy + 8, p[2] + 2.8, 6, 5.2, 1.2, col(0xfff3d6), 1);
      b.blob(p[0] - 2.2, gy + 9.4, p[2] + 3.6, 1.2, 1.4, 0.6, col(0xffffff), 1); b.blob(p[0] + 2.2, gy + 9.4, p[2] + 3.6, 1.2, 1.4, 0.6, col(0xffffff), 1);
      b.blob(p[0] - 2.2, gy + 9.3, p[2] + 4.1, 0.5, 0.6, 0.3, col(0x222222), 0); b.blob(p[0] + 2.2, gy + 9.3, p[2] + 4.1, 0.5, 0.6, 0.3, col(0x222222), 0);
      b.blob(p[0], gy + 8, p[2] + 4.2, 0.9, 0.9, 0.7, col(0xe8283a), 1); b.blob(p[0], gy + 6.2, p[2] + 3.8, 3.0, 1.0, 0.5, col(0xe8283a), 1);
      b.blob(p[0], gy + 12.5, p[2] + 2.6, 5.2, 2.6, 2.2, col(0xff4d6d), 1); b.blob(p[0] - 5.2, gy + 11, p[2] + 2.6, 2.0, 2.0, 1.6, col(0xffd23a), 1); b.blob(p[0] + 5.2, gy + 11, p[2] + 2.6, 2.0, 2.0, 1.6, col(0x3aa0ff), 1);
      panelQ(sg, at, 4, p[0], gy + 0.5, p[2] + 2.6, 8, 2.0, 0, col(0x2b2f3a), kit);
      kit.reserve(p[0], p[2], 16);
    }
    // ---- food / game stalls in the band between the promenade and the coaster
    for (let k = 0; k < 26; k++) {
      const d = (k + 0.5) * (L / 26), s = k % 3 === 0 ? 1 : -1, p = kit.at(d, s * (hw + 17 + (k & 1) * 3), 0), f = kit.frame(d), ry = faceRoad(f, s), c = pal[k % 7];
      if (!kit.clear(p[0], p[2], 12)) continue;
      const cs = Math.cos(ry), sn = Math.sin(ry);
      b.box(p[0], gy, p[2], 4.2, 2.3, 2.6, ry, col(0xfff3d6));
      for (const sx of [-1, 1]) b.box(p[0] + sx * 1.9 * cs + 1.9 * sn, gy, p[2] - sx * 1.9 * sn + 1.9 * cs, 0.14, 2.7, 0.14, 0, col(0xffffff));
      b.box(p[0] + 1.9 * sn, gy + 2.5, p[2] + 1.9 * cs, 4.6, 0.14, 2.4, ry, c); b.box(p[0] + 1.9 * sn, gy + 2.62, p[2] + 1.9 * cs, 4.6, 0.12, 1.2, ry, col(0xffffff));
      b.box(p[0] + 1.3 * sn, gy + 1.0, p[2] + 1.3 * cs, 3.6, 0.2, 0.7, ry, kit.mul(c, 0.85));
      panelQ(sg, at, 2 + (k % 6), p[0] + 0.5 * sn, gy + 2.9, p[2] + 0.5 * cs, 3.6, 1.0, ry, col(0x2b2f3a), kit);
      for (let q = 0; q < 3; q++) fb.blob(p[0] + (q - 1) * 1.6 + 2.4 * sn, gy + 4.6 + q * 0.4, p[2] + 2.4 * cs, 0.55, 0.7, 0.55, col(pal[(k + q) % 7]), 1);
      kit.reserve(p[0], p[2], 3);
    }
    // ---- toy block stacks with letters + giant crayons + beach balls
    for (let k = 0; k < 14; k++) {
      const d = rng() * L, l = (rng() < 0.55 ? -1 : 1) * (hw + 10 + rng() * 14) * (1), p = kit.at(d, l, 0);
      if (l > 0 && Math.abs(l) > hw + 20) continue;
      if (!kit.clear(p[0], p[2], 14)) continue;
      let y = gy; const n = 1 + ((rng() * 3) | 0), r0 = rng() * 3;
      for (let q = 0; q < n; q++) {
        const s = 2.6 - q * 0.3, ry = r0 + q * 0.5 + (rng() - 0.5) * 0.4, c = col(pal[(k + q) % 7]);
        b.box(p[0], y, p[2], s, s, s, ry, c);
        const cs = Math.cos(ry), sn = Math.sin(ry), i0 = 8 + ((k + q) % 6);
        for (let fc = 0; fc < 4; fc++) { const a = ry + fc * Math.PI / 2; panelQ(sg, at, 8 + ((i0 - 8 + fc) % 6), p[0] + Math.sin(a) * (s / 2 + 0.01), y + 0.15, p[2] + Math.cos(a) * (s / 2 + 0.01), s * 0.86, s * 0.86, a, null, kit); }
        void cs; void sn; y += s;
      }
      kit.reserve(p[0], p[2], 4);
    }
    for (let k = 0; k < 9; k++) {   // balloon clusters tied to posts + big beach balls
      const d = rng() * L, p = kit.at(d, (k & 1 ? 1 : -1) * (hw + 8), 0);
      if (!kit.clear(p[0], p[2], 14)) continue;
      fb.box(p[0], gy, p[2], 0.08, 6, 0.08, 0, col(0xdddddd));
      for (let q = 0; q < 6; q++) fb.blob(p[0] + (rng() - 0.5) * 2, gy + 7 + rng() * 2.5, p[2] + (rng() - 0.5) * 2, 0.8, 1.0, 0.8, col(pal[(k + q) % 7]), 1);
    }
    // ---- lamp poles with colored globes (blinking) every 22 m both sides, plus string-light canopy over the straight
    for (let d = 4; d < L; d += 22) for (const s of [-1, 1]) {
      const p = kit.at(d, s * (hw + 7.2), 0);
      b.frustum(p[0], p[1], p[2], 0.16, 0.12, 6.2, 6, col(0x6a707c), 0);
      for (let q = 0; q < 3; q++) { const a = q * 2.1 + d, bx = p[0] + Math.cos(a) * 0.7, bz = p[2] + Math.sin(a) * 0.7, c = pal[(((d / 22) | 0) + q) % 7]; (q & 1 ? bulbs2 : bulbs).blob(bx, p[1] + 6.5 - q * 0.1, bz, 0.34, 0.34, 0.34, col(c), 1); }
      gl.halo(p[0], p[1] + 6.5, p[2], 2.0, pal[(d / 22 | 0) % 7], 0.55); gl.pool(p[0], p[1], p[2], 5, pal[((d / 22) | 0) % 7], 0.3);
    }
    { const m1 = kit.mesh(bulbs, {}, true), m2 = kit.mesh(bulbs2, {}, true); if (m1) kit.blinker(m1.material, 1.4, { mode: 'square', lo: 0.35, hi: 1 }); if (m2) kit.blinker(m2.material, 1.4, { mode: 'square', lo: 0.35, hi: 1, phase: 0.5 }); }
    // ---- hot-air balloons overhead, bobbing
    {
      const sets = [[0xff4d6d, 0xffffff], [0xffd23a, 0x3aa0ff, 0x4ad64a], [0xb86aff, 0xffffff]];
      [[-30, 52, 70], [70, 70, -10], [10, 90, 150]].forEach((q, i) => { const m = balloonMesh(kit, sets[i], 7, 12); m.position.set(q[0], q[1], q[2]); kit.bob(m, 1.2, 0.4 + i * 0.07, i * 1.7, 0.03); kit.spinner(m, 'y', 0.05); });
    }
    kit.particles({ x: 0, y: 34, z: 30, count: 110, vel: [0, -2.2, 0], spread: [70, 2, 50], life: 7, size: 0.35, grav: -0.1, alpha: 0.9, color: [0xff4d6d, 0xffd23a, 0x3aa0ff, 0x4ad64a, 0xff7ad8], tex: 'soft' });
    // ---- extra hedges/trees/flowers in the outskirts + far candy-colour hills
    kit.scatter(60, 2, 70, 16, (x, z, i, r) => { bush(fb, kit, x, gy, z, 0.9 + r() * 0.8, r, 0x2f9a3e, 0x57c24a); flowerPatch(fb, kit, x + 1, gy, z, 2, 12, [0xff4d6d, 0xffd23a, 0xffffff, 0xff7ad8], r); });
    kit.farScatter(14, 120, (x, z, r) => { const s = 26 + r() * 24; blobR(b, kit, x, gy - 4, z, s * 1.4, s * 0.55, s, r() * 3, kit.mix(col(0x7ad04a), col(0xb6e65a), r()), 2); });
    kit.mesh(b); kit.foliage(fb, { strength: 0.3 });
    kit.mesh(sg, at.tex ? { map: at.tex, emissive: 0x484848, emissiveMap: at.tex, detail: false } : {});
    gl.done();
    // ferris wheel rim lights (turn with the wheel)
    {
      const wl = new kit.Batch(), R0 = 14.6;
      for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; wl.blob(0, Math.cos(a) * R0, Math.sin(a) * R0, 0.32, 0.32, 0.32, col(pal[i % 7]), 1); }
      kit.spinBatch(wl, { x: 0, y: R0 + 3, z: 30, axis: 'x', speed: 0.28 });
    }
  }

  // face panel on a 4-sided pyramid (rot PI/4): face index f (0..3) normal angle f*PI/2; t = height fraction, u = -1..1 across
  function pyrFace(b, at, i, x, z, r, h, gy, f, t0, t1, u0, u1, out) {
    const a = f * Math.PI / 2, nx = Math.sin(a), nz = Math.cos(a), tx = nz, tz = -nx, k = r * Math.SQRT1_2, uv = at.uv(i);
    const P = (t, u) => { const e = k * (1 - t); return [x + nx * (e + out) + tx * u * e, gy + t * h, z + nz * (e + out) + tz * u * e]; };
    b.quadUV(P(t0, u0), P(t0, u1), P(t1, u1), P(t1, u0), [1, 1, 1], [uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]]);
  }
  function sphinx(b, kit, x, y, z, ry, s, c1, c2) {
    const col = kit.col, c = Math.cos(ry), sn = Math.sin(ry), W = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c];
    const bx = (lx, ly, lz, sx, sy, sz, k) => { const p = W(lx, lz); b.box(p[0], y + ly * s, p[1], sx * s, sy * s, sz * s, ry, k); };
    const bl = (lx, ly, lz, sx, sy, sz, k) => { const p = W(lx, lz * 1); b.blob(p[0], y + ly * s, p[1], sx * s, sy * s, sz * s, k, 1); };
    bx(-3.6, 0, -4, 7.2, 1.2, 15, c2);                       // plinth
    bl(0, 3.2, -3.5, 2.6, 2.4, 5.8, c1);                     // body
    bx(-1.1, 0.6, 3.2, 2.2, 2.6, 5, c1); bx(-1.1 + 2.5, 0.6, 3.2, 0.1, 0, 0, c1);   // forelegs
    bx(-2.9, 1.2, 3.4, 1.7, 2.4, 5.2, c1); bx(1.3, 1.2, 3.4, 1.7, 2.4, 5.2, c1);
    bl(0, 6.6, 3.6, 1.7, 1.9, 1.8, c1);                      // chest + neck
    bl(0, 8.8, 4.6, 2.2, 2.3, 2.1, c1);                      // head
    bx(-2.9, 8.9, 3.9, 5.8, 0.5, 1.2, col(0x2a8fc9)); bx(-2.7, 6.4, 3.0, 5.4, 4.8, 0.9, col(0x2a8fc9)); // striped head-cloth
    bx(-2.4, 8.2, 3.2, 0.7, 4.6, 0.8, col(0xffd23a)); bx(1.7, 8.2, 3.2, 0.7, 4.6, 0.8, col(0xffd23a));
    bl(-1.2, 11.2, 4.3, 0.55, 1.1, 0.4, c1); bl(1.2, 11.2, 4.3, 0.55, 1.1, 0.4, c1);   // jackal ears
    bl(0, 8.6, 6.5, 0.9, 0.8, 1.0, kit.mul(c1, 0.9));
    bl(-0.9, 9.4, 6.6, 0.3, 0.3, 0.2, col(0x222222)); bl(0.9, 9.4, 6.6, 0.3, 0.3, 0.2, col(0x222222));
    bl(0, 2.2, -9, 0.9, 0.5, 2.6, c1);                       // tail
  }
  function camel(b, kit, x, y, z, ry, s, c) {
    const col = kit.col, cs = Math.cos(ry), sn = Math.sin(ry), W = (lx, lz) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
    const bl = (lx, ly, lz, sx, sy, sz, k) => { const p = W(lx, lz); b.blob(p[0], y + ly * s, p[1], sx * s, sy * s, sz * s, k, 1); };
    bl(0, 1.2, 0, 0.7, 0.55, 1.4, c); bl(0, 1.95, 0.4, 0.4, 0.45, 0.4, kit.mul(c, 0.92)); bl(0, 1.9, -0.6, 0.36, 0.42, 0.36, kit.mul(c, 0.92));
    for (const [lx, lz] of [[-0.35, 0.9], [0.35, 0.9], [-0.35, -0.9], [0.35, -0.9]]) { const p = W(lx, lz); b.box(p[0] - 0.08 * s, y, p[1] - 0.08 * s, 0.16 * s, 0.9 * s, 0.16 * s, 0, kit.mul(c, 0.85)); }
    beam(b, [W(0, 1.1)[0], y + 1.5 * s, W(0, 1.1)[1]], [W(0, 1.6)[0], y + 2.5 * s, W(0, 1.6)[1]], 0.16 * s, c);
    bl(0, 2.65, 1.85, 0.24, 0.24, 0.42, kit.mul(c, 1.05)); bl(0, 2.55, 2.25, 0.14, 0.12, 0.2, col(0x3a2a1a));
    bl(0, 1.0, 0, 0.74, 0.1, 0.5, col(0xc8502d));            // saddle blanket
  }
  function desertBeauty(track, kit, bb, st) {
    const L = kit.length, col = kit.col, rng = kit.rng, gy = kit.groundY, hwS = 14 + 5;
    const b = new kit.Batch(), fb = new kit.Batch(), sg = new kit.Batch(true), gl = glowSet(kit);
    const sandL = col(0xf0cc7c), sandD = col(0xc9964a), stoneA = col(0xd2a05c), stoneB = col(0xc08a48), stoneC = col(0xe0b878);
    const SG = [['BAZAAR', '#c8502d', '#8a3418'], ['OASIS INN', '#2a8fc9', '#1a5a8a'], ['POTTERY', '#e8961a', '#a85a0c'], ['SPICES', '#c82c64', '#8a1840'], ['DUSTBOWL', '#8a5a2a', '#5a3818'], ['WELL', '#35a06a', '#1a6a40']];
    const at = makeAtlas(kit, 1024, 640, 12, 4, (ctx, w, h, i) => {
      if (i < 6) { sponsorCell(ctx, w, h, SG[i][0], SG[i][1], SG[i][2], '#fff3d0'); return; }
      ctx.fillStyle = i === 8 ? '#2a1a10' : ['#d9a95a', '#d2a05c', '#caa060'][(i - 6) % 3]; ctx.fillRect(0, 0, w, h);
      if (i === 8) { ctx.fillStyle = '#c8502d'; ctx.fillRect(0, 0, w, h * 0.12); ctx.fillStyle = '#ffd23a'; ctx.fillRect(0, h * 0.12, w, h * 0.04); ctx.strokeStyle = '#d9a95a'; ctx.lineWidth = 6; ctx.strokeRect(4, 4, w - 8, h - 8); return; }
      ctx.strokeStyle = '#4a2a14'; ctx.fillStyle = '#4a2a14'; ctx.lineWidth = Math.max(3, h * 0.025); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      const wide = i === 6 || i === 10, cols = wide ? 12 : 3, rows = wide ? 2 : 8, cw = w / cols, ch = h / rows;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const cx = c * cw + cw / 2, cy = r * ch + ch / 2, s = Math.min(cw, ch) * 0.34, k = (r * 7 + c * 3 + i) % 8;
        ctx.beginPath();
        if (k === 0) { ctx.arc(cx, cy, s * 0.5, 0, TAU); ctx.stroke(); for (let q = 0; q < 8; q++) { ctx.moveTo(cx + Math.cos(q * 0.785) * s * 0.7, cy + Math.sin(q * 0.785) * s * 0.7); ctx.lineTo(cx + Math.cos(q * 0.785) * s, cy + Math.sin(q * 0.785) * s); } ctx.stroke(); }
        else if (k === 1) { ctx.moveTo(cx - s, cy); ctx.quadraticCurveTo(cx, cy - s, cx + s, cy); ctx.quadraticCurveTo(cx, cy + s, cx - s, cy); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, s * 0.28, 0, TAU); ctx.fill(); }
        else if (k === 2) { for (let q = 0; q < 3; q++) { ctx.moveTo(cx - s, cy + (q - 1) * s * 0.5); ctx.bezierCurveTo(cx - s * 0.5, cy + (q - 1) * s * 0.5 - s * 0.4, cx + s * 0.5, cy + (q - 1) * s * 0.5 + s * 0.4, cx + s, cy + (q - 1) * s * 0.5); } ctx.stroke(); }
        else if (k === 3) { ctx.moveTo(cx - s, cy + s * 0.5); ctx.lineTo(cx - s * 0.3, cy - s * 0.5); ctx.lineTo(cx + s * 0.3, cy + s * 0.5); ctx.lineTo(cx + s, cy - s * 0.5); ctx.stroke(); }
        else if (k === 4) { ctx.ellipse(cx, cy, s * 0.55, s * 0.8, 0, 0, TAU); ctx.stroke(); ctx.moveTo(cx, cy - s * 0.8); ctx.lineTo(cx, cy + s * 0.8); ctx.moveTo(cx - s * 0.55, cy); ctx.lineTo(cx + s * 0.55, cy); ctx.stroke(); }
        else if (k === 5) { ctx.moveTo(cx - s, cy + s * 0.6); ctx.lineTo(cx, cy - s * 0.8); ctx.lineTo(cx + s, cy + s * 0.6); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy + s * 0.1, s * 0.2, 0, TAU); ctx.fill(); }
        else if (k === 6) { let a = 0, r0 = 0; ctx.moveTo(cx, cy); for (let q = 0; q < 40; q++) { a += 0.5; r0 += s * 0.025; ctx.lineTo(cx + Math.cos(a) * r0 * 1.8, cy + Math.sin(a) * r0 * 1.8); } ctx.stroke(); }
        else { ctx.moveTo(cx - s, cy - s * 0.6); ctx.lineTo(cx + s, cy - s * 0.6); ctx.moveTo(cx, cy - s * 0.6); ctx.lineTo(cx, cy + s * 0.8); ctx.moveTo(cx - s * 0.5, cy + s * 0.8); ctx.lineTo(cx + s * 0.5, cy + s * 0.8); ctx.stroke(); }
      }
      ctx.strokeStyle = '#7a4a24'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, w - 6, h - 6);
    });
    // ---- pyramids: carved friezes, glyph columns and doorways on every face
    for (const [x, z, r, h] of [[215, 115, 58, 52], [300, 80, 34, 30], [130, 130, 24, 21]]) {
      if (!kit.clear(x, z, r + 18) && false) continue;
      for (let f = 0; f < 4; f++) {
        pyrFace(sg, at, 6, x, z, r, h, gy, f, 0.17, 0.27, -0.85, 0.85, 0.25);
        pyrFace(sg, at, 7, x, z, r, h, gy, f, 0.34, 0.8, -0.16, 0.16, 0.25);
        pyrFace(sg, at, 8, x, z, r, h, gy, f, 0.02, 0.16, -0.22, 0.22, 0.25);
        pyrFace(sg, at, 10, x, z, r, h, gy, f, 0.5, 0.6, -0.5, 0.5, 0.25);
      }
      b.frustum(x, gy + h, z, 1.6, 0, 3.6, 4, col(0xffd23a), Math.PI / 4);   // golden capstone
      for (let s = -1; s <= 1; s += 2) { const q = [x + s * r * 0.9, z + r * 0.78]; b.frustum(q[0], gy, q[1], 1.1, 0.9, 7, 8, stoneC, 0); b.box(q[0] - 0.9, gy + 7, q[1] - 0.9, 1.8, 0.5, 1.8, 0, stoneB); }
    }
    // ---- guardian sphinx pair flanking the road (jackal-lion), steles and obelisk with glyphs
    {
      const d = 300, f = kit.frame(d);
      for (const s of [-1, 1]) { const p = kit.at(d, s * (hwS + 14), 0); sphinx(b, kit, p[0], p[1], p[2], faceRoad(f, s), 0.95, stoneA, stoneB); kit.reserve(p[0], p[2], 12); }
      for (const dd of [L * 0.04, 470, 970, 1180]) for (const s of [-1, 1]) {
        const ff = kit.frame(dd), p = kit.at(dd, s * (hwS + 3), 0);
        b.frustum(p[0], p[1], p[2], 1.3, 0.8, 7, 4, stoneC, Math.PI / 4 + ff.tx); b.box(p[0] - 0.4, p[1] + 7, p[2] - 0.4, 0.8, 0.8, 0.8, 0, col(0xffd23a));
        panelQ(sg, at, 7, p[0] + ff.rx * -s * 0.0, p[1] + 1.2, p[2], 1.5, 4.6, faceRoad(ff, s), null, kit);
      }
    }
    // ---- canyon: banded sandstone mesas, hoodoos and natural arches along the outside of the loop
    const band = [col(0xd98a4a), col(0xc9733f), col(0xe8b070), col(0xb85f35), col(0xdca060)];
    const mesa = (x, z, R, H, s) => {
      const n = 5, hh = H / n;
      for (let k = 0; k < n; k++) b.frustum(x + Math.sin(k + s) * R * 0.04, gy + k * hh - 1, z + Math.cos(k * 2 + s) * R * 0.04, R * (1 - k * 0.035 + Math.sin(k * 1.7 + s) * 0.05), R * (1 - (k + 1) * 0.035 + Math.sin((k + 1) * 1.7 + s) * 0.05), hh + 0.1, 9, band[(k + (s | 0)) % 5], s + k * 0.3);
      b.frustum(x, gy + H - 1, z, R * 0.86, R * 0.84, 0.7, 9, col(0xe8c88a), s);
    };
    for (let d = 20; d < L; d += 34) {
      for (const s of [-1, 1]) {
        if (s > 0 && rng() < 0.55) continue;
        const l = s * (hwS + 32 + rng() * 40), p = kit.at(d + rng() * 12, l, 0);
        if (!kit.clear(p[0], p[2], 30)) continue;
        const R = 7 + rng() * 11, H = 14 + rng() * 26;
        if (rng() < 0.3) { for (let q = 0; q < 3; q++) b.frustum(p[0] + q * 2.6 - 2.6, gy, p[2] + (q & 1) * 2, 1.6 - q * 0.2, 1.0, 9 + rng() * 8, 7, band[q % 5], rng()), b.blob(p[0] + q * 2.6 - 2.6, gy + 12 + q * 2, p[2] + (q & 1) * 2, 2.0, 1.3, 2.0, stoneC, 0); }
        else mesa(p[0], p[2], R, H, rng() * 6);
        kit.reserve(p[0], p[2], R);
      }
    }
    for (const [dd, side] of [[420, 1], [1010, -1]]) {   // natural stone arches
      const p = kit.at(dd, side * (hwS + 36), 0), f = kit.frame(dd), ry = Math.atan2(f.tx, f.tz);
      if (!kit.clear(p[0], p[2], 20)) continue;
      const R = 11;
      for (let k = 0; k <= 10; k++) { const a = (k / 10) * Math.PI, cx = Math.cos(a) * R, cy = Math.sin(a) * R * 0.95, q = [p[0] + cx * Math.cos(ry), p[2] - cx * Math.sin(ry)]; b.box(q[0], gy + cy - 0.6, q[1], 4.2 - Math.sin(a) * 1.1, 4.2, 5.5, ry, band[k % 5]); }
      for (const s of [-1, 1]) { const q = [p[0] + s * R * Math.cos(ry), p[2] - s * R * Math.sin(ry)]; b.frustum(q[0], gy - 1, q[1], 4.6, 4.2, 3, 8, band[0], 0); }
      b.blob(p[0], gy + R * 0.95 + 2.6, p[2], 4, 1.4, 3, stoneC, 1); kit.reserve(p[0], p[2], R + 6);
    }
    // ---- oasis village (mud-brick houses, domes, market stalls, camels, wells, torches)
    {
      const vx = 70, vz = 205, mudC = [col(0xe0b878), col(0xd2a368), col(0xe8c890), col(0xcf9a5e)], awn = [0xc8502d, 0x2a8fc9, 0xffd23a, 0x35a06a, 0xc82c64];
      let placed = 0;
      for (let tries = 0; tries < 90 && placed < 14; tries++) {
        const x = vx - 40 + rng() * 80, z = vz - 20 + rng() * 55;
        if (!kit.clear(x, z, 34) || Math.hypot(x - 70, z - 150) < 36) continue;
        const sx = 6 + rng() * 4, sz = 6 + rng() * 4, h = 3.8 + rng() * 2.4, ry = rng() * 1.2 - 0.6, c = mudC[placed % 4], cs = Math.cos(ry), sn = Math.sin(ry);
        b.box(x, gy, z, sx, h, sz, ry, c); b.box(x, gy + h, z, sx + 0.7, 0.45, sz + 0.7, ry, stoneC);
        b.box(x + 0.5 * sn * sz, gy, z + 0.5 * cs * sz + 0.0, 1.3, 2.3, 0.2, ry, col(0x3a2418));   // doorway
        b.box(x - sx * 0.3 * cs + sz * 0.5 * sn, gy + h * 0.55, z + sx * 0.3 * sn + sz * 0.5 * cs, 1.0, 1.0, 0.2, ry, col(0x2a8fc9));
        if (placed % 3 === 0) { b.blob(x, gy + h + 0.4, z, sx * 0.42, sx * 0.38, sx * 0.42, col(0xf3e2b8), 1); b.frustum(x, gy + h + sx * 0.38, z, 0.15, 0.05, 1.6, 5, col(0xffd23a), 0); }
        else b.box(x + sx * 0.25, gy + h + 0.45, z, 1.5, 1.4, 1.5, ry, c);
        if (placed % 2 === 0) { b.box(x + (sx / 2 + 1.3) * cs - 0.1 * sn, gy + 3.1, z - (sx / 2 + 1.3) * sn, 3.0, 0.14, sz * 0.7, ry, col(awn[placed % 5])); }
        const jp = [x + 2.5 * cs, z - 2.5 * sn]; b.blob(jp[0] + sn * (sz / 2 + 1), gy + 0.7, jp[1] + cs * (sz / 2 + 1), 0.55, 0.7, 0.55, col(0xc8502d), 1);
        kit.reserve(x, z, 8); placed++;
      }
      for (let k = 0; k < 6; k++) {   // market stalls with striped canopies
        const x = vx - 22 + k * 8 + rng() * 3, z = vz + 28 + rng() * 6;
        if (!kit.clear(x, z, 30)) continue;
        const c = awn[k % 5], ry = rng() * 0.6 - 0.3;
        for (const [px, pz] of [[-1.6, -1.2], [1.6, -1.2], [-1.6, 1.2], [1.6, 1.2]]) b.box(x + px, gy, z + pz, 0.14, 2.4, 0.14, 0, col(0x6a4a2a));
        b.box(x, gy + 2.4, z, 4.0, 0.14, 3.2, ry, c); b.box(x, gy + 2.55, z - 0.4, 4.0, 0.14, 2.4, ry, col(0xffffff)); b.box(x, gy, z, 3.0, 0.9, 1.0, ry, col(0xb5763a));
        for (let q = 0; q < 4; q++) b.blob(x - 1.1 + q * 0.75, gy + 1.15, z, 0.3, 0.26, 0.3, col([0xff7a1a, 0xe83a3a, 0xffd23a, 0x59b84a][q]), 0);
        panelQ(sg, at, k % 6, x, gy + 2.7, z + 1.8, 2.8, 0.9, 0, null, kit);
        kit.reserve(x, z, 5);
      }
      for (let k = 0; k < 5; k++) { const x = 50 + rng() * 50, z = 120 + rng() * 60; if (kit.clear(x, z, 24)) camel(b, kit, x, gy, z, rng() * TAU, 1.5, kit.mix(col(0xd2a368), col(0xb88a52), rng())); }
      const w = [vx - 8, vz + 20]; b.frustum(w[0], gy, w[1], 2.0, 2.0, 1.1, 10, col(0xcfc09a), 0); b.frustum(w[0], gy + 1.1, w[1], 1.6, 1.6, 0.1, 10, col(0x3fb8d8), 0);
      for (const s of [-1, 1]) b.box(w[0] + s * 1.7, gy, w[1] - 0.1, 0.22, 3.2, 0.22, 0, col(0x6a4a2a)); b.box(w[0], gy + 3.0, w[1] - 0.1, 3.8, 0.25, 0.25, 0, col(0x6a4a2a));
      for (let q = 0; q < 6; q++) { const x = vx - 36 + q * 14, z = vz + 14 + (q & 1) * 8; if (kit.clear(x, z, 22)) { lampPost(b, kit, gl, x, gy, z, 3.6, 0xffb040, 0, 0.35); kit.particles({ x, y: gy + 3.9, z, count: 6, vel: [0, 1.6, 0], spread: [0.15, 0.3, 0.15], life: 0.7, size: 0.7, grow: -0.5, alpha: 0.95, color: [0xffa030, 0xffd060], additive: true }); } }
      kit.particles({ x: vx + 2, y: gy + 7, z: vz - 6, count: 10, vel: [0.6, 1.4, 0.2], spread: [0.4, 0.3, 0.4], life: 4, size: 2.4, grow: 1.2, alpha: 0.22, color: 0xdddddd });
      if (kit.clear(vx, vz + 10, 30)) kit.bunting([vx - 20, gy + 5.2, vz + 6], [vx + 22, gy + 5.2, vz + 14], awn, 18, 0.9, 1.6);
    }
    // ---- road decoration: signposts, bones, broken columns, wagon wheels, bleached skulls, dry brush
    for (let d = 35; d < L - 10; d += 52) {
      const s = ((d / 52) | 0) & 1 ? 1 : -1, f = kit.frame(d), p = kit.at(d, s * (hwS + 2.6), 0);
      b.box(p[0] - 0.12, p[1], p[2] - 0.12, 0.24, 3.0, 0.24, 0, col(0x6a4a2a));
      panelQ(sg, at, 4 + ((d / 52 | 0) % 2) * 1, p[0], p[1] + 2.0, p[2], 3.0, 1.0, faceRoad(f, s), col(0x4a2a14), kit);
    }
    kit.scatter(80, 2, 60, 22, (x, z, i, r) => {
      const k = r();
      if (k < 0.3) { b.blob(x, gy + 0.3, z, 0.7, 0.4, 0.5, col(0xf3ecd8), 0); b.box(x + 0.6, gy, z, 0.9, 0.12, 0.12, r() * 3, col(0xf3ecd8)); beam(b, [x - 0.4, gy + 0.3, z], [x + 0.1, gy + 1.1, z + 0.4], 0.07, col(0xf3ecd8)); beam(b, [x + 0.1, gy + 1.1, z + 0.4], [x - 0.2, gy + 1.6, z + 1.0], 0.05, col(0xf3ecd8)); }
      else if (k < 0.55) { const L2 = 3 + r() * 3; b.frustum(x, gy, z, 1.0, 0.9, L2, 8, stoneC, 0); b.box(x - 1.2, gy + L2, z - 1.2, 2.4, 0.5, 2.4, 0, stoneB); beam(b, [x + 2, gy + 0.7, z], [x + 7, gy + 0.7, z + 1.5], 0.8, stoneC); }
      else if (k < 0.7) { for (let q = 0; q < 5; q++) { const a = q * 1.25; beam(fb, [x, gy + 0.1, z], [x + Math.cos(a) * 1.1, gy + 0.7, z + Math.sin(a) * 1.1], 0.03, col(0x8a6a3a)); } }
      else rockCluster(b, kit, x, gy, z, 0.8 + r() * 2.2, r, [0xb9885a, 0x9d7a5a, 0xc99a6a, 0xa08060]);
    });
    // ---- dunes: sunlit/shaded ellipsoid pairs in several depth rings, tinted with distance
    kit.farScatter(46, 38, (x, z, r) => {
      const s = 16 + r() * 36, ry = r() * 3;
      blobR(b, kit, x, gy - 3, z, s * 1.7, s * 0.34, s, ry, sandD, 2);
      blobR(b, kit, x + Math.sin(ry) * s * 0.18, gy - 2.8, z + Math.cos(ry) * s * 0.18, s * 1.6, s * 0.34, s * 0.85, ry, sandL, 2);
    });
    kit.farScatter(16, 190, (x, z, r) => { const s = 60 + r() * 70; blobR(b, kit, x, gy - 6, z, s * 1.9, s * 0.4, s, r() * 3, kit.mix(col(0xe0b070), col(0xd29a64), r()), 2); });
    kit.farScatter(10, 240, (x, z, r) => mesa(x, z, 20 + r() * 20, 30 + r() * 40, r() * 6));
    kit.scatter(70, 3, 60, 22, (x, z, i, r) => { const s = 0.9 + r() * 1.0; b.frustum(x, gy, z, 0.5 * s, 0.4 * s, 3.2 * s, 6, kit.mul(col(0x3f9a4a), 0.9 + r() * 0.2), 0); b.blob(x, gy + 3.2 * s, z, 0.45 * s, 0.35 * s, 0.45 * s, col(0xff7ab0), 0); });
    // ---- drifting dust over the road for heat haze
    kit.particles({ x: bb.cx, y: 2.5, z: bb.cz, count: 90, vel: [3.5, 0.1, 0.8], spread: [260, 2.2, 160], life: 6, size: 5, grow: 0.8, alpha: 0.1, color: [0xf5dba0, 0xeac88a], wob: 0.4 });
    kit.mesh(b); kit.foliage(fb, { strength: 0.2 });
    kit.mesh(sg, at.tex ? { map: at.tex, emissive: 0x404040, emissiveMap: at.tex, detail: false } : {});
    gl.done();
  }

  // ================================================================== 1. SUNSHINE CIRCUIT
  G.defineTrack({
    id: 'sunshine_circuit', name: 'Sunshine Circuit', cup: 'mushroom', order: 1, laps: 3, music: 'circuit',
    seed: 101, hw: 12, shoulder: 5, scale: 1, style: 'meadow',
    theme: {
      sky: [0x1f78e8, 0xa6dcff, 0x9ad46c], fog: [0xc8e6ff, 170, 650], ground: 0x6cc24a, shoulder: 0x58b03c,
      road: [0x5a5e6c, 0x535766], curb: [0xe83a3a, 0xffffff], hemi: [0xd6ecff, 0x7fb050, 1.0], sun: [0xfff1d0, 1.0],
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
      sunshineBeauty(track, kit, bb);

      // ---- grandstands (left of the main straight) with animated instanced crowd (bounce / wave / cheer)
      const fb = new kit.Batch();   // foliage (wind-swayed)
      const stand = (d0, d1, side, base, tiers) => {
        const crowd = [];
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
        for (let d = d0 + 0.7; d < d1; d += 2.1) for (let k = 0; k < tiers; k++) {
          if (rng() < 0.12) continue;
          const p = kit.at(d, side * (base + k * 2.6 + 1.6), (k + 1) * 1.3), f = kit.frame(d);
          crowd.push([p[0], p[1], p[2], Math.atan2(-side * f.rx, -side * f.rz), (d - d0) / (d1 - d0)]);
        }
        kit.crowd(crowd, { radius: 60, scale: 1.15 });
      };
      stand(24, 250, -1, hwS + 5, 6);
      stand(150, 290, 1, hwS + 7, 4);
      kit.reserve(kit.at(140, -1, 0)[0], kit.at(140, -1, 0)[2], 10);

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
        kit.blinker(pm, 2.2, { mode: 'sine', lo: 0.82, hi: 1 });
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
        // sun-ray halo behind the head: slowly rotating sunburst
        {
          const hb = new kit.Batch(), hc = P(0, 29, -3);
          for (let k = 0; k < 12; k++) {
            const an = (k / 12) * TAU, c = Math.cos(an), s = Math.sin(an), w = 0.16;
            hb.tri([c * 9, s * 9, 0], [Math.cos(an + w) * 9, Math.sin(an + w) * 9, 0], [c * 14.5, s * 14.5, 0], k & 1 ? org : yel);
          }
          kit.spinBatch(hb, { x: hc[0], y: hc[1], z: hc[2], ry: Math.atan2(-f.tz, f.tx), axis: 'z', speed: 0.35 });
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
        if (r() < 0.3) { fb.box(x, gy, z, 0.5 * s, 2 * s, 0.5 * s, r() * 3, col(0x7a4f2a)); for (let k = 0; k < 3; k++) fb.frustum(x, gy + (1.6 + k * 1.7) * s, z, (2.5 - k * 0.7) * s, 0, 2.6 * s, 7, kit.mul(col(0x2f8f46), 0.9 + r() * 0.2), r()); }
        else roundTree(fb, kit, x, gy, z, s, r);
      });
      kit.scatter(110, 1, 40, m0 - 4, (x, z, i, r) => b.blob(x, gy + 0.5, z, 1.2 + r(), 0.9 + r() * 0.5, 1.2 + r(), kit.mul(col(0x3f9f45), 0.9 + r() * 0.2), 0));
      kit.grassTufts(650, 0.4, 24, { flowers: 0.4, scale: [0.9, 1.7] });   // swaying grass + flowers
      kit.farScatter(30, 90, (x, z, r) => {
        const s = 28 + r() * 40;
        b.blob(x, gy - 4, z, s * 1.4, s * 0.55, s, kit.mul(col(0x69b848), 0.9 + r() * 0.2), 1);
      });
      // waving flags on the main straight + bunting strung across the road
      for (let d = 10; d < 300; d += 30) {
        const fc = [[0xe83a3a, 0xffffff], [0xffd23a, 0xe83a3a], [0x2c6bff, 0xffffff]][((d / 30) | 0) % 3];
        for (let s = -1; s <= 1; s += 2) kit.flagAt(d, s * (hwS + 1), 2.6, 1.5, fc, { pole: 7.5 });
      }
      for (let d = 40; d < 300; d += 60) kit.bunting(kit.at(d, -(hwS + 1), 7.6), kit.at(d, hwS + 1, 7.6), [0xe83a3a, 0xffd23a, 0x2c6bff, 0xffffff, 0x59d66b], 22, 1.1, 1.6);
      kit.birds({ cx: bb.cx, cz: bb.cz, y: 46, radius: 150, count: 7, speed: 0.1 });
      kit.birds({ cx: bb.cx + 60, cz: bb.cz + 40, y: 62, radius: 90, count: 5, speed: -0.13, size: 1.3 });
      kit.mesh(b);
      kit.foliage(fb);
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
      sky: [0x1a84f0, 0x8cdcff, 0xfff0c8], fog: [0xbde9ff, 200, 780], ground: 0xdcb872, shoulder: 0xd2ac66,
      road: [0x6f6c6a, 0x676462], curb: [0xff7a59, 0xfff3d6], hemi: [0xdff1ff, 0xb59d6a, 0.8], sun: [0xfff0d0, 0.82],
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
        kit.slide(kit.mesh(fb, { transparent: true, opacity: 0.92 }), 0, 0, 1.8, 0.55);   // surf washing up and back
        // little sailboats bobbing off the coast
        const hull = new kit.Batch(), sailC = [0xffffff, 0xff7a59, 0xffd23a, 0x35c0d9, 0xffffff];
        hull.box(0, 0, 0, 1.6, 0.7, 4.4, 0, col(0xb5703a)); hull.box(0, 0.7, 0.2, 1.2, 0.25, 3.2, 0, col(0xd9a066));
        hull.box(0, 0.7, 0, 0.12, 5.2, 0.12, 0, col(0x7a5a3a));
        hull.tri([0.04, 1.2, 0.1], [0.04, 5.6, 0.1], [0.04, 1.2, -1.9], col(0xffffff)); hull.tri([-0.04, 1.2, 0.1], [-0.04, 1.2, -1.9], [-0.04, 5.6, 0.1], col(0xffffff));
        const hg = kit.trackGeom(hull.build());
        for (let k = 0; k < 6; k++) {
          const sm = kit.mat({}), sc = new THREE.Color(sailC[k % 5]);
          const boat = new THREE.Mesh(hg, sm); boat.scale.setScalar(1.3 + (k % 3) * 0.25);
          boat.position.set(bb.minX + (bb.maxX - bb.minX) * (0.1 + k * 0.16), gy + 0.2, seaZ - 55 - (k % 3) * 40 - rng() * 20); boat.rotation.y = rng() * 6.28;
          kit.add(boat); kit.bob(boat, 0.18, 1.1 + k * 0.1, k * 1.7, 0.07); void sc;
        }
      }
      // ---- tide flood sheet
      {
        const d0 = 940, d1 = 1010, hw = 12 + 5;
        st.tide = roadRibbon(kit, d0, d1, -hw - 1, hw + 1, 0.13, { color: 0x49c0ee, opacity: 0, specular: 0xffffff, water: 0.8 }, 3);
        setOpacity(st.tide.material, 0); st.tideLevel = 0; st.tideOn = false;
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
        const mat = kit.waterMat({ color: 0x45c9d8, opacity: 0.88 });
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
        kit.lightBeam({ x, y: gy + 28.4, z, len: 100, width: 7, speed: 0.7, tilt: 0.05, count: 2 });
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
        kit.particles({ x, y: gy + 5.2, z, count: 46, vel: [0, 9.5, 0], spread: [1.9, 2.2, 1.9], life: 1.5, grav: -15, size: 0.5, alpha: 0.9, pow: 0.5, color: [0xcdf4ff, 0xffffff, 0x9fe6ff] });
        kit.particles({ x, y: gy + 1.2, z, count: 22, vel: [0, 0.2, 0], spread: [4.8, 0.2, 4.8], life: 1.1, grav: 0, size: 1.3, grow: 1.2, alpha: 0.35, color: 0xffffff });
        kit.reserve(x, z, 16);
      }

      coralBeauty(track, kit, bb, st);
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
      const pf = new kit.Batch();
      kit.scatter(150, 1, 60, m0 - 2, (x, z, i, r) => palm(pf, kit, x, gy, z, 0.8 + r() * 0.6, r));
      kit.foliage(pf, { strength: 0.45, heightScale: 0.2 });
      kit.grassTufts(260, 0.4, 22, { flowers: 0.3, colors: [0x6fc44a, 0x8ad45a, 0x5ab04a], scale: [0.9, 1.6] });
      kit.birds({ cx: bb.cx, cz: bb.minZ - 70, y: 30, radius: 120, count: 8, speed: 0.12, size: 1.2 });
      kit.birds({ cx: bb.cx + 90, cz: bb.minZ - 20, y: 40, radius: 70, count: 5, speed: -0.15 });
      for (let sd = -1; sd <= 1; sd += 2) kit.crowdStand({ d0: L - 45, d1: L + 70, side: sd, l0: 12 + 5 + 3.2, rows: 2, gap: 1.3, rise: 0, step: 2.3, scale: 1.1, radius: 55, colors: [0xff7a59, 0x35c0d9, 0xffd23a, 0xffffff, 0xff7ad9, 0x59d66b] });
      // pennants on the hotel roof + beach banners at the start straight
      { const hp = kit.at(310, 56, 0); kit.flag(hp[0], gy + 17.2, hp[2], 4, 2.2, 0.4, [0xff7a59, 0xfff3d6], { pole: 5 }); }
      for (let d = 15; d < 120; d += 35) for (let sd = -1; sd <= 1; sd += 2) { const p = kit.at(d, sd * 18.5, 0), f = kit.frame(d); kit.flag(p[0], p[1], p[2], 2.6, 1.5, Math.atan2(f.tx, f.tz) - Math.PI / 2, [[0xff7a59, 0xfff3d6], [0x35c0d9, 0xffffff]][((d / 35) | 0) & 1], { pole: 6.5 }); }
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
      setOpacity(s.tide.material, Math.min(0.8, s.tideLevel * 0.85));
      s.tide.position.y = Math.sin(time * 2.1) * 0.03 - (1 - s.tideLevel) * 0.12;
      s.tide.visible = s.tideLevel > 0.02;
      if (s.sea) { s.sea[0].position.y = Math.sin(time * 0.9) * 0.1; s.sea[1].position.y = Math.sin(time * 0.7 + 1) * 0.08; }
      if (s.jetMesh) { const k = 1 + Math.sin(time * 4) * 0.25; s.jetMesh.scale.set(1, k, 1); }
    },
  });
  // a big flat water slab: x0..x0+w, z from zFar to zFar+depth
  function discSlab(kit, x0, zFar, w, depth, y, color, opacity) {
    const g = kit.trackGeom(new THREE.PlaneGeometry(w, depth)); g.rotateX(-Math.PI / 2);
    const mat = kit.waterMat({ color, opacity });
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
      sky: [0x3a98f5, 0xc4e6ff, 0xffd8ec], fog: [0xe2ecff, 170, 560], ground: 0x78c85a, shoulder: 0x62b048,
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
        // the whole carousel (pole, mounts, canopy) turns on its platform
        const cb = new kit.Batch();
        cb.frustum(0, 0, 0, 0.9, 0.9, 6, 8, col(0xffd23a), 0);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU, px = Math.cos(a) * 5.2, pz = Math.sin(a) * 5.2;
          cb.box(px, 0, pz, 0.25, 4.5, 0.25, 0, col(0xffffff));
          cb.blob(px, 1.7, pz, 0.9, 0.7, 1.4, kit.hsl(k / 8, 0.7, 0.6), 0);
        }
        cb.frustum(0, 4.6, 0, 8, 0, 3.4, 16, cr, 0);
        cb.frustum(0, 4.6, 0, 8, 7.6, 0.5, 16, col(0xffffff), 0);
        kit.spinBatch(cb, { x, y: gy + 0.8, z, axis: 'y', speed: 0.8 });
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
        const bal = [0xff4d6d, 0xffd23a, 0x3aa0ff, 0x4ad64a, 0xff7ad8], bl = new kit.Batch();
        for (let k = 0; k < 40; k++) {
          const d = rng() * L, s = rng() < 0.5 ? -1 : 1, p = kit.at(d, s * (13 + 4 + rng() * 5), 0);
          if (!kit.clear(p[0], p[2], 13)) continue;
          const c = col(bal[k % 5]), hh = 4 + rng() * 3;
          bl.box(p[0], gy, p[2], 0.05, hh, 0.05, 0, col(0xdddddd));
          bl.blob(p[0], gy + hh + 1.2, p[2], 0.9, 1.1, 0.9, c, 1);
        }
        kit.foliage(bl, { strength: 0.7, heightScale: 0.25, speed: 1.3 });   // balloons bob on their strings
        for (let d = 8; d < L; d += 22) for (let s = -1; s <= 1; s += 2) kit.flagAt(d, s * (10 + 3 + 0.6), 1.9, 1.1, [[0xff4d6d, 0xffffff], [0xffd23a, 0x3aa0ff], [0x4ad64a, 0xffffff]][((d / 22) | 0) % 3], { pole: 4.4 });
        // entrance gate sign over the start line
        const f = kit.frame(0), ry = Math.atan2(f.tx, f.tz);
        for (let s = -1; s <= 1; s += 2) {
          const p = kit.at(0, s * (10 + 3 + 1.5), 0);
          b.box(p[0], p[1], p[2], 1.6, 12, 1.6, ry, s < 0 ? col(0xff4d6d) : col(0x3aa0ff));
        }
        for (let k = 0; k < 7; k++) rbox(b, kit, 0, -14.1 + (k + 0.5) * (28.2 / 7), 12, 28.2 / 7 + 0.1, 3, 1.6, kit.hsl(k / 7, 0.8, 0.6));
        for (let s = -1; s <= 1; s += 2) { const p = kit.at(0, s * (10 + 3 + 1.5), 12); kit.flag(p[0], p[1], p[2], 4, 2.2, ry - Math.PI / 2, s < 0 ? [0xff4d6d, 0xffffff] : [0x3aa0ff, 0xffffff], { pole: 3.5, pattern: 'check' }); }
        kit.bunting(kit.at(0, -16, 12.4), kit.at(-26, -16, 5), [0xff4d6d, 0xffd23a, 0x3aa0ff, 0x4ad64a], 14, 0.9, 1.2);
        kit.bunting(kit.at(0, 16, 12.4), kit.at(-26, 16, 5), [0xff4d6d, 0xffd23a, 0x3aa0ff, 0x4ad64a], 14, 0.9, 1.2);
        // cheering spectators fenced along the start straight
        kit.crowdStand({ d0: L - 55, d1: L + 70, side: -1, l0: 15.5, rows: 3, gap: 1.25, rise: 0, step: 1.9, scale: 1.1, radius: 55 });
        kit.crowdStand({ d0: L - 55, d1: L + 70, side: 1, l0: 15.5, rows: 2, gap: 1.25, rise: 0, step: 1.9, scale: 1.1, radius: 55 });
        kit.birds({ cx: 0, cz: 30, y: 50, radius: 90, count: 6, speed: 0.12 });
      }
      tinyTotBeauty(track, kit, st);
      // ---- trees and hedges outside the coaster ring
      const pf = new kit.Batch();
      kit.scatter(60, 40, 90, 70, (x, z, i, r) => roundTree(pf, kit, x, gy, z, 0.9 + r() * 0.7, r, 0x45b24a, 0x58c25a));
      kit.farScatter(16, 130, (x, z, r) => { const s = 30 + r() * 30; b.blob(x, gy - 4, z, s * 1.4, s * 0.5, s, kit.mul(col(0x69b848), 0.9 + r() * 0.2), 1); });
      kit.mesh(b); kit.foliage(pf);
      kit.grassTufts(300, 0.4, 14, { flowers: 0.4, scale: [0.9, 1.5] });
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
      sky: [0x2f86e0, 0xf9dca0, 0xf2c070], fog: [0xf4d098, 140, 560], ground: 0xd9a95a, shoulder: 0xcc9a4c,
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
        // tattered banners under the span + flaming braziers at the pillars
        for (let k = 0; k < 3; k++) { const l = (k - 1) * w * 0.55, p = kit.at(dd, l, 0); kit.banner(p[0], p[1] + 8.4, p[2], 4, 6, ry, [[0xc8502d, 0xf3e2b8], [0x2a8fc9, 0xffd23a], [0xc8502d, 0xf3e2b8]][k], { pattern: 'vstripes', amp: 0.4 }); }
        for (let s = -1; s <= 1; s += 2) { const p = kit.at(dd, s * (w - 3.4), 0); kit.particles({ x: p[0], y: p[1] + 1.6, z: p[2], count: 14, vel: [0, 2.4, 0], spread: [0.4, 0.8, 0.4], life: 0.9, size: 1.1, grow: -0.6, alpha: 0.95, color: [0xffa030, 0xffd060, 0xff6a20], additive: true }); }
      }

      // ---- oasis with pond and palms
      {
        const ox = 70, oz = 150;
        if (kit.clear(ox, oz, 36)) {
          const pond = discMesh(kit, ox, gy + 0.1, oz, 16, { color: 0x3fb8d8, opacity: 0.9, specular: 0xffffff, water: 0.9 }, 30); st.pond = pond;
          b.frustum(ox, gy, oz, 21, 21, 0.18, 24, col(0x5eaa4a), 0);
          const pf = new kit.Batch();
          for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU + rng() * 0.2; palm(pf, kit, ox + Math.cos(a) * (19 + rng() * 6), gy, oz + Math.sin(a) * (19 + rng() * 6), 0.9 + rng() * 0.7, rng); }
          kit.foliage(pf, { strength: 0.45, heightScale: 0.2 });
          kit.reserve(ox, oz, 28);
          // wind pump beside the pond: spinning fan
          const wx = ox - 26, wz = oz + 4, wy = gy + 11;
          b.box(wx, gy, wz, 0.5, 11, 0.5, 0, col(0x6a5a4a)); b.box(wx + 1.3, gy, wz + 1.3, 0.35, 10.6, 0.35, 0, col(0x6a5a4a)); b.box(wx - 1.3, gy, wz + 1.3, 0.35, 10.6, 0.35, 0, col(0x6a5a4a));
          const fan = new kit.Batch();
          for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; fan.tri([0, 0, 0], [Math.cos(a - 0.14) * 4.2, Math.sin(a - 0.14) * 4.2, 0], [Math.cos(a + 0.14) * 4.2, Math.sin(a + 0.14) * 4.2, 0], k & 1 ? col(0xe8e2d2) : col(0xc9733f)); }
          fan.blob(0, 0, 0.1, 0.5, 0.5, 0.5, col(0x3a3a44), 0);
          kit.spinBatch(fan, { x: wx, y: wy + 0.6, z: wz + 0.5, ry: 0.5, axis: 'z', speed: 1.7 });
        }
      }
      desertBeauty(track, kit, bb, st);
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
      kit.crowdStand({ d0: L - 45, d1: L + 60, side: -1, l0: 14 + 5 + 3, rows: 2, gap: 1.3, rise: 0, step: 2.2, scale: 1.1, skin: [0xe0a87c, 0xc08a58, 0x8a5a3a, 0xf6d2b0], colors: [0xc8502d, 0xf3e2b8, 0x2a8fc9, 0xffd23a, 0x35a06a], radius: 55 });
      kit.birds({ cx: bb.cx, cz: bb.cz, y: 55, radius: 120, count: 5, speed: 0.09, size: 1.6, body: 0x2a2a30, wing: 0x4a4a52 });   // circling vultures
      kit.grassTufts(160, 0.4, 18, { colors: [0xb8a24a, 0x9aa04a, 0xc8b060], flowers: 0.05, scale: [0.8, 1.4] });

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
