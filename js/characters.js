// Characters, karts, portraits. All geometry is merged per-model into vertex-colored
// BufferGeometries (cached), so a kart + 2 riders is only ~9 meshes.
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  // ---------------------------------------------------------------- data
  G.CHARACTERS = [
    { id: 'blaze', name: 'Blaze', weight: 'medium', special: 'fireball', partner: 'ember',
      colors: { primary: 0xe8512a, secondary: 0x3b4a6b, skin: 0xf2b58a, accent: 0xffc83a },
      tagline: 'Fiery-haired mechanic kid who never stops tinkering.' },
    { id: 'ember', name: 'Ember', weight: 'medium', special: 'fireball', partner: 'blaze',
      colors: { primary: 0xc4202f, secondary: 0x2e2a3a, skin: 0xe8a57c, accent: 0xf5b820 },
      tagline: "Blaze's cousin. Gold goggles, crimson scarf, zero brakes." },
    { id: 'rosa', name: 'Rosa', weight: 'light', special: 'heart', partner: 'lily',
      colors: { primary: 0xff7eb6, secondary: 0xfff0f5, skin: 0xffd0b0, accent: 0xffd84a },
      tagline: 'Blooms at full speed in her petal hat.' },
    { id: 'lily', name: 'Lily', weight: 'medium', special: 'heart', partner: 'rosa',
      colors: { primary: 0xa98be0, secondary: 0x5fae5a, skin: 0xf0c4a0, accent: 0x3f8f4a },
      tagline: 'Calm florist with a leaf scarf and a lead foot.' },
    { id: 'pip', name: 'Pip', weight: 'light', special: 'egg', partner: 'pop',
      colors: { primary: 0x25b8a8, secondary: 0xf4ecc8, skin: 0x35cdb8, accent: 0xff7a3a },
      tagline: 'Hoppy little critter with bug eyes and big ideas.' },
    { id: 'pop', name: 'Pop', weight: 'light', special: 'egg', partner: 'pip',
      colors: { primary: 0xffd23a, secondary: 0xfff1b0, skin: 0xffe05a, accent: 0xff8a2a },
      tagline: 'Bubbly, bouncy, and a little bit explosive.' },
    { id: 'grub', name: 'Grub', weight: 'heavy', special: 'giant_banana', partner: 'krag',
      colors: { primary: 0x7a4a2a, secondary: 0xc99a64, skin: 0xd9ad78, accent: 0xf4ecd0 },
      tagline: 'Furry bruiser with tusks. Loves bananas. Very big.' },
    { id: 'krag', name: 'Krag', weight: 'heavy', special: 'mega_shell', partner: 'grub',
      colors: { primary: 0x5b6b7a, secondary: 0x4f9a4a, skin: 0x8fa5a0, accent: 0xe6dcc0 },
      tagline: 'Spiky rock-turtle brute. Hits like a landslide.' },
  ];

  G.KARTS = [
    { id: 'bubble_buggy', name: 'Bubble Buggy', weight: 'light', speed: 2, accel: 5, handling: 5, mass: 1, color: 0xff7ac8 },
    { id: 'zip_scooter', name: 'Zip Scooter', weight: 'light', speed: 3, accel: 4, handling: 4, mass: 1, color: 0x35d3e6 },
    { id: 'jelly_jet', name: 'Jelly Jet', weight: 'light', speed: 2, accel: 4, handling: 5, mass: 2, color: 0xb28cff },
    { id: 'turbo_tub', name: 'Turbo Tub', weight: 'medium', speed: 3, accel: 3, handling: 3, mass: 3, color: 0xff8a1f },
    { id: 'comet_coupe', name: 'Comet Coupe', weight: 'medium', speed: 4, accel: 3, handling: 2, mass: 3, color: 0xe8352e },
    { id: 'rally_rover', name: 'Rally Rover', weight: 'medium', speed: 3, accel: 4, handling: 3, mass: 3, color: 0x3a9cff },
    { id: 'iron_hauler', name: 'Iron Hauler', weight: 'heavy', speed: 5, accel: 1, handling: 2, mass: 5, color: 0x8794a3 },
    { id: 'dino_dozer', name: 'Dino Dozer', weight: 'heavy', speed: 4, accel: 2, handling: 2, mass: 5, color: 0x5cb53c },
    { id: 'thunder_tank', name: 'Thunder Tank', weight: 'heavy', speed: 5, accel: 2, handling: 1, mass: 4, color: 0x4a5fb0 },
  ];

  const charById = {};
  G.CHARACTERS.forEach((c) => (charById[c.id] = c));
  const kartById = {};
  G.KARTS.forEach((k) => (kartById[k.id] = k));

  // ---------------------------------------------------------------- geometry helpers
  const geoCache = {};
  function baseGeo(t, a) {
    const key = t + ':' + a.join(',');
    if (geoCache[key]) return geoCache[key];
    let g;
    if (t === 'box') g = new THREE.BoxGeometry(a[0], a[1], a[2]);
    else if (t === 'sph') g = new THREE.SphereGeometry(a[0], a[1] || 10, a[2] || 8);
    else if (t === 'cyl') g = new THREE.CylinderGeometry(a[0], a[1], a[2], a[3] || 10, 1);
    else g = new THREE.ConeGeometry(a[0], a[1], a[2] || 6, 1);
    g = g.toNonIndexed();
    geoCache[key] = g;
    return g;
  }
  const P = (t, a, c, p, s, r) => ({ t, a, c, p: p || [0, 0, 0], s: s || [1, 1, 1], r: r || [0, 0, 0] });
  const HP = Math.PI / 2;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
  const _p = new THREE.Vector3(), _s = new THREE.Vector3();

  function merge(parts) {
    let n = 0;
    const gs = parts.map((pt) => baseGeo(pt.t, pt.a));
    gs.forEach((g) => (n += g.attributes.position.count));
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let o = 0;
    parts.forEach((pt, i) => {
      const g = gs[i].clone();
      _e.set(pt.r[0], pt.r[1], pt.r[2]);
      _q.setFromEuler(_e);
      _p.set(pt.p[0], pt.p[1], pt.p[2]);
      _s.set(pt.s[0], pt.s[1], pt.s[2]);
      _m.compose(_p, _q, _s);
      g.applyMatrix4(_m);
      const c = new THREE.Color(pt.c);
      const cnt = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      for (let k = 0; k < cnt; k++) { col[(o + k) * 3] = c.r; col[(o + k) * 3 + 1] = c.g; col[(o + k) * 3 + 2] = c.b; }
      o += cnt;
      g.dispose();
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }

  let sharedMat = null;
  function mat() {
    return sharedMat || (sharedMat = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 28, specular: 0x333333 }));
  }
  function shade(c, k) { const x = new THREE.Color(c); return k < 1 ? x.multiplyScalar(k) : x.lerp(new THREE.Color(0xffffff), k - 1); }

  // ---------------------------------------------------------------- riders
  const DARK = 0x1c1a24, WHITE = 0xffffff;
  const riderGeoCache = {};

  // cone lean helper: tilt outward in direction (dx,dz)
  const lean = (dx, dz, k) => [dz * k, 0, -dx * k];

  function eyes(h, x, y, z, r, spread) {
    for (const sd of [-1, 1]) {
      h.push(P('sph', [r, 8, 6], DARK, [sd * x, y, z]));
      h.push(P('sph', [r * 0.4, 6, 4], WHITE, [sd * (x - r * 0.25), y + r * 0.45, z + r * 0.8]));
    }
  }

  function riderParts(id) {
    const ch = charById[id], c = ch.colors;
    const b = [], h = [];
    let headR = 0.32;
    let headScale = [1, 1, 1];
    // default torso / limbs
    const torso = () => b.push(P('box', [0.5, 0.42, 0.4], c.primary, [0, 0.27, 0]));
    const limbs = (armCol, legCol, footCol, handCol, big) => {
      const k = big || 1;
      for (const sd of [-1, 1]) {
        b.push(P('box', [0.14 * k, 0.14 * k, 0.42], armCol, [sd * 0.32 * k, 0.32, 0.2], [1, 1, 1], [0.35, 0, 0]));
        b.push(P('sph', [0.09 * k, 6, 5], handCol, [sd * 0.32 * k, 0.28, 0.43]));
        b.push(P('box', [0.18, 0.17, 0.42], legCol, [sd * 0.14, 0.04, 0.27]));
        b.push(P('box', [0.2, 0.14, 0.2], footCol, [sd * 0.14, -0.04, 0.5]));
      }
    };
    switch (id) {
      case 'blaze': {
        torso(); b.push(P('box', [0.52, 0.14, 0.42], c.accent, [0, 0.1, 0])); // belt
        limbs(c.primary, c.secondary, DARK, c.skin);
        h.push(P('sph', [headR, 12, 9], c.skin));
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
          h.push(P('cone', [0.11, 0.42, 5], i % 2 ? 0xff9a2a : c.primary, [dx * 0.17, 0.33, dz * 0.17 - 0.04], [1, 1, 1], lean(dx, dz, 0.75)));
        }
        h.push(P('cone', [0.13, 0.55, 5], c.accent, [0, 0.38, 0.0], [1, 1, 1], [0.15, 0, 0]));
        h.push(P('cyl', [0.3, 0.3, 0.09, 12], DARK, [0, 0.14, 0]));
        for (const sd of [-1, 1]) h.push(P('cyl', [0.085, 0.085, 0.07, 10], c.accent, [sd * 0.12, 0.14, 0.3], [1, 1, 1], [HP, 0, 0]));
        eyes(h, 0.12, -0.04, 0.285, 0.06);
        break;
      }
      case 'ember': {
        torso(); b.push(P('box', [0.54, 0.12, 0.44], c.accent, [0, 0.47, 0.0])); // scarf
        b.push(P('box', [0.16, 0.4, 0.1], 0xe03a45, [0.12, 0.28, -0.22], [1, 1, 1], [0, 0, 0.2]));
        limbs(c.primary, c.secondary, 0x6a1a22, c.skin);
        h.push(P('sph', [headR, 12, 9], c.skin));
        h.push(P('sph', [0.355, 10, 8], 0xb81c2c, [0, 0.07, -0.09], [1, 0.95, 1]));
        h.push(P('sph', [0.13, 7, 6], 0xb81c2c, [0, -0.02, -0.4]));
        h.push(P('sph', [0.1, 7, 6], 0xd8283a, [0, -0.2, -0.5]));
        h.push(P('sph', [0.07, 7, 6], 0xd8283a, [0, -0.33, -0.55]));
        h.push(P('cyl', [0.33, 0.33, 0.07, 12], DARK, [0, 0.03, 0]));
        for (const sd of [-1, 1]) h.push(P('cyl', [0.115, 0.115, 0.07, 10], c.accent, [sd * 0.13, 0.03, 0.3], [1, 1, 1], [HP, 0, 0]));
        eyes(h, 0.13, 0.03, 0.29, 0.06);
        break;
      }
      case 'rosa': {
        torso(); b.push(P('cone', [0.42, 0.34, 8], c.primary, [0, 0.12, 0.0], [1, 1, 0.9], [Math.PI, 0, 0])); // skirt
        limbs(c.primary, c.secondary, 0xe0508c, c.skin);
        h.push(P('sph', [headR, 12, 9], c.skin));
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
          h.push(P('sph', [0.17, 8, 6], i % 2 ? 0xff8fc4 : c.primary, [dx * 0.24, 0.3, dz * 0.24], [1, 0.35, 1.35], lean(dx, dz, 0.8)));
        }
        h.push(P('sph', [0.12, 8, 6], c.accent, [0, 0.4, 0]));
        for (const sd of [-1, 1]) h.push(P('sph', [0.11, 7, 6], 0xff7eb6, [sd * 0.3, -0.12, -0.05]));
        for (const sd of [-1, 1]) h.push(P('sph', [0.07, 6, 5], 0xff9a9a, [sd * 0.2, -0.1, 0.24], [1, 0.6, 0.4]));
        eyes(h, 0.12, 0.03, 0.285, 0.06);
        break;
      }
      case 'lily': {
        torso();
        // leaf scarf
        b.push(P('cyl', [0.3, 0.3, 0.1, 10], c.secondary, [0, 0.5, 0]));
        for (const sd of [-1, 1]) b.push(P('sph', [0.14, 6, 5], 0x6fc06a, [sd * 0.2, 0.55, 0.22], [0.5, 1, 0.25], [0.2, 0, sd * 0.6]));
        b.push(P('sph', [0.16, 6, 5], 0x6fc06a, [0.1, 0.25, -0.24], [0.5, 1.5, 0.2], [0, 0, 0.2]));
        limbs(c.primary, 0x6a5aa8, 0x4a3a80, c.skin);
        h.push(P('sph', [headR, 12, 9], c.skin));
        h.push(P('sph', [0.35, 10, 8], 0x8a6fd0, [0, 0.07, -0.08], [1, 0.92, 1]));
        h.push(P('sph', [0.15, 8, 6], 0x8a6fd0, [0, 0.42, -0.08]));
        h.push(P('sph', [0.07, 6, 5], 0xff7eb6, [0.16, 0.34, 0.1]));
        h.push(P('sph', [0.05, 6, 5], 0xffe05a, [0.16, 0.34, 0.16]));
        for (const sd of [-1, 1]) h.push(P('sph', [0.09, 7, 6], 0x8a6fd0, [sd * 0.3, -0.12, -0.05]));
        eyes(h, 0.12, 0.0, 0.285, 0.06);
        break;
      }
      case 'pip': {
        headR = 0.3; headScale = [1.18, 0.88, 1.08];
        b.push(P('sph', [0.3, 9, 7], c.primary, [0, 0.24, 0], [1, 0.95, 0.95]));
        b.push(P('sph', [0.22, 8, 6], c.secondary, [0, 0.22, 0.14], [1, 1, 0.6]));
        for (const sd of [-1, 1]) {
          b.push(P('sph', [0.1, 6, 5], c.skin, [sd * 0.33, 0.28, 0.25]));
          b.push(P('sph', [0.12, 6, 5], c.skin, [sd * 0.17, 0.02, 0.36], [1, 0.6, 1.4]));
          b.push(P('sph', [0.12, 6, 5], c.primary, [sd * 0.2, 0.08, 0.2], [1, 0.8, 1.4]));
        }
        h.push(P('sph', [headR, 12, 9], c.skin, [0, 0, 0], headScale));
        h.push(P('sph', [0.17, 7, 6], c.secondary, [0, -0.1, 0.17], [1.5, 0.6, 1])); // snout/chin
        for (const sd of [-1, 1]) {
          h.push(P('sph', [0.13, 8, 6], WHITE, [sd * 0.2, 0.26, 0.12]));
          h.push(P('sph', [0.07, 7, 5], DARK, [sd * 0.2, 0.27, 0.23]));
          h.push(P('sph', [0.025, 5, 4], WHITE, [sd * 0.18, 0.31, 0.28]));
          h.push(P('sph', [0.06, 6, 5], 0xff8a8a, [sd * 0.22, -0.06, 0.26], [1, 0.6, 0.4]));
        }
        h.push(P('cyl', [0.02, 0.03, 0.34, 5], 0x137a70, [0, 0.46, 0.0]));
        h.push(P('sph', [0.075, 7, 5], c.accent, [0, 0.65, 0]));
        break;
      }
      case 'pop': {
        headR = 0.33;
        b.push(P('sph', [0.3, 9, 7], c.primary, [0, 0.25, 0]));
        b.push(P('sph', [0.2, 8, 6], c.secondary, [0, 0.22, 0.14], [1, 1, 0.6]));
        for (const sd of [-1, 1]) {
          b.push(P('sph', [0.1, 6, 5], c.skin, [sd * 0.32, 0.28, 0.25]));
          b.push(P('sph', [0.12, 6, 5], c.accent, [sd * 0.17, 0.05, 0.34], [1, 0.6, 1.4]));
          b.push(P('sph', [0.12, 6, 5], c.primary, [sd * 0.2, 0.08, 0.2], [1, 0.8, 1.4]));
        }
        h.push(P('sph', [headR, 12, 9], c.skin));
        for (const sd of [-1, 1]) {
          h.push(P('cyl', [0.02, 0.03, 0.34, 5], 0xd6a21a, [sd * 0.14, 0.45, 0], [1, 1, 1], [0, 0, -sd * 0.35]));
          h.push(P('sph', [0.085, 7, 5], c.accent, [sd * 0.22, 0.63, 0]));
          h.push(P('sph', [0.07, 6, 5], 0xff7a6a, [sd * 0.23, -0.09, 0.25], [1, 0.6, 0.4]));
        }
        [[0.0, 0.31, 0.1], [-0.15, 0.27, 0.12], [0.16, 0.26, 0.1]].forEach((q) => h.push(P('sph', [0.05, 6, 5], c.accent, [q[0], q[1], q[2]])));
        eyes(h, 0.12, 0.04, 0.29, 0.065);
        h.push(P('sph', [0.07, 7, 5], 0x8a2a1a, [0, -0.1, 0.3], [1.4, 0.6, 0.4]));
        break;
      }
      case 'grub': {
        headR = 0.34;
        b.push(P('sph', [0.38, 9, 7], c.primary, [0, 0.24, 0], [1.1, 0.9, 0.95]));
        b.push(P('sph', [0.27, 8, 6], c.secondary, [0, 0.2, 0.2], [1, 1, 0.55]));
        for (const sd of [-1, 1]) {
          b.push(P('box', [0.2, 0.2, 0.42], c.primary, [sd * 0.42, 0.32, 0.2], [1, 1, 1], [0.35, 0, 0]));
          b.push(P('sph', [0.14, 7, 6], c.skin, [sd * 0.42, 0.26, 0.45]));
          b.push(P('box', [0.22, 0.2, 0.42], c.primary, [sd * 0.17, 0.04, 0.27]));
          b.push(P('box', [0.24, 0.14, 0.22], DARK, [sd * 0.17, -0.04, 0.5]));
          b.push(P('cone', [0.07, 0.2, 4], c.secondary, [sd * 0.34, 0.6, -0.05], [1, 1, 1], [0, 0, -sd * 0.5]));
        }
        h.push(P('sph', [headR, 12, 9], c.primary, [0, 0, 0], [1.1, 1, 1.02]));
        h.push(P('sph', [0.19, 8, 6], c.skin, [0, -0.12, 0.25], [1.3, 0.85, 1]));
        h.push(P('sph', [0.06, 6, 5], DARK, [0, -0.04, 0.42], [1.4, 1, 1]));
        for (const sd of [-1, 1]) {
          h.push(P('cone', [0.055, 0.28, 5], c.accent, [sd * 0.15, -0.18, 0.4], [1, 1, 1], [0.7, 0, sd * 0.25]));
          h.push(P('sph', [0.13, 7, 5], c.primary, [sd * 0.34, 0.2, 0.0], [1, 1.4, 1])); // ear tufts
          h.push(P('box', [0.14, 0.04, 0.05], 0x2a1608, [sd * 0.12, 0.1, 0.32], [1, 1, 1], [0, 0, sd * 0.35]));
        }
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
          h.push(P('cone', [0.1, 0.3, 4], i % 2 ? 0x5a3418 : c.primary, [dx * 0.2, 0.34, dz * 0.2 - 0.03], [1, 1, 1], lean(dx, dz, 0.7)));
        }
        eyes(h, 0.12, 0.04, 0.3, 0.05);
        break;
      }
      case 'krag': {
        headR = 0.3;
        b.push(P('sph', [0.55, 9, 6], c.secondary, [0, 0.42, -0.2], [1, 0.75, 0.95])); // shell
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
          b.push(P('cone', [0.1, 0.34, 4], c.accent, [dx * 0.28, 0.68, -0.2 + dz * 0.28], [1, 1, 1], lean(dx, dz, 0.45)));
        }
        b.push(P('cone', [0.12, 0.4, 4], c.accent, [0, 0.82, -0.2]));
        b.push(P('box', [0.56, 0.42, 0.42], c.primary, [0, 0.26, 0.05]));
        b.push(P('box', [0.4, 0.3, 0.1], c.skin, [0, 0.26, 0.28]));
        for (const sd of [-1, 1]) {
          b.push(P('sph', [0.16, 6, 5], c.primary, [sd * 0.4, 0.46, 0.0]));
          b.push(P('cone', [0.07, 0.26, 4], c.accent, [sd * 0.5, 0.58, 0.0], [1, 1, 1], [0, 0, -sd * 0.9]));
          b.push(P('box', [0.2, 0.2, 0.42], c.primary, [sd * 0.4, 0.3, 0.22], [1, 1, 1], [0.35, 0, 0]));
          b.push(P('sph', [0.13, 6, 5], c.skin, [sd * 0.4, 0.26, 0.46]));
          b.push(P('box', [0.22, 0.2, 0.42], c.primary, [sd * 0.16, 0.04, 0.27]));
          b.push(P('box', [0.24, 0.14, 0.22], c.skin, [sd * 0.16, -0.04, 0.5]));
        }
        h.push(P('sph', [headR, 10, 8], c.skin, [0, 0, 0], [1, 0.95, 1.05]));
        h.push(P('box', [0.5, 0.09, 0.2], c.primary, [0, 0.12, 0.2], [1, 1, 1], [0.3, 0, 0])); // brow ridge
        h.push(P('box', [0.3, 0.07, 0.08], c.primary, [0, -0.15, 0.28]));
        for (const sd of [-1, 1]) {
          h.push(P('cone', [0.07, 0.24, 4], c.accent, [sd * 0.2, 0.3, -0.04], [1, 1, 1], [0, 0, -sd * 0.4]));
          h.push(P('cone', [0.04, 0.12, 4], c.accent, [sd * 0.1, -0.2, 0.3]));
        }
        eyes(h, 0.11, 0.0, 0.285, 0.05);
        break;
      }
    }
    return { body: b, head: h };
  }

  function buildRider(charId) {
    const ch = charById[charId] || G.CHARACTERS[0];
    let cache = riderGeoCache[ch.id];
    if (!cache) {
      const parts = riderParts(ch.id);
      cache = riderGeoCache[ch.id] = { body: merge(parts.body), head: merge(parts.head) };
    }
    const g = new THREE.Group();
    g.name = 'rider_' + ch.id;
    const body = new THREE.Mesh(cache.body, mat());
    body.name = 'riderBody';
    const head = new THREE.Mesh(cache.head, mat());
    head.name = 'riderHead';
    head.position.set(0, 0.78, 0);
    g.add(body, head);
    g.userData.head = head;
    g.userData.bodyMesh = body;
    if (ch.weight === 'heavy') g.scale.setScalar(1.2);
    return g;
  }

  // ---------------------------------------------------------------- karts
  const WHEEL = { light: [0.32, 0.3], medium: [0.35, 0.32], heavy: [0.4, 0.4] };
  const wheelGeoCache = {};
  function wheelGeo(r, w, hub) {
    const key = r + '_' + w + '_' + hub;
    if (wheelGeoCache[key]) return wheelGeoCache[key];
    const R = [0, 0, HP]; // cylinder axis along x
    const parts = [
      P('cyl', [r, r, w, 12], 0x23222b, [0, 0, 0], [1, 1, 1], R),
      P('cyl', [r * 0.58, r * 0.58, w + 0.04, 10], hub, [0, 0, 0], [1, 1, 1], R),
      P('box', [w + 0.08, r * 0.25, r * 0.9], shade(hub, 1.55), [0, 0, 0]),
      P('cyl', [r * 1.02, r * 1.02, w * 0.3, 12], 0x3a3944, [0, 0, 0], [1, 1, 1], R),
    ];
    return (wheelGeoCache[key] = merge(parts));
  }

  const SEAT_F = [0, 0.55, 0.2], SEAT_R = [0, 0.9, -0.55];

  function pipe(x, y, z, len, col) { return P('cyl', [0.07, 0.085, len, 8], col, [x, y, z], [1, 1, 1], [HP, 0, 0]); }

  // Returns { parts, exhausts:[[x,y,z]], hub }
  function kartParts(k) {
    const c = k.color, dk = shade(c, 0.6), lt = shade(c, 1.35), st = 0x3a3a46;
    const p = [], ex = [];
    const seatCush = (col) => {
      p.push(P('box', [0.62, 0.12, 0.52], col, [0, 0.42, 0.2]));
      p.push(P('box', [0.58, 0.5, 0.52], dk, [0, 0.55, -0.55]));
      p.push(P('box', [0.6, 0.1, 0.5], col, [0, 0.82, -0.55]));
      p.push(P('box', [0.6, 0.3, 0.1], col, [0, 1.0, -0.84], [1, 1, 1], [-0.15, 0, 0]));
    };
    const wheelCol = () => {
      p.push(P('cyl', [0.2, 0.2, 0.05, 10], 0x222230, [0, 0.9, 0.62], [1, 1, 1], [1.0, 0, 0]));
      p.push(P('cyl', [0.03, 0.03, 0.5, 5], 0x222230, [0, 0.72, 0.58], [1, 1, 1], [0.9, 0, 0]));
    };
    switch (k.id) {
      case 'bubble_buggy': {
        p.push(P('sph', [0.6, 12, 8], c, [0, 0.38, -0.05], [0.92, 0.5, 1.75]));
        p.push(P('sph', [0.42, 10, 7], lt, [0, 0.42, 0.55], [0.9, 0.5, 1.0]));
        p.push(P('sph', [0.2, 8, 6], 0xfff0a0, [0, 0.35, 1.05]));
        for (const sd of [-1, 1]) {
          p.push(P('box', [0.06, 0.45, 0.5], lt, [sd * 0.5, 0.7, -0.95], [1, 1, 1], [-0.4, 0, sd * 0.3]));
          p.push(P('sph', [0.1, 6, 5], 0xff4060, [sd * 0.4, 0.45, 1.0]));
          ex.push([sd * 0.28, 0.42, -1.1]);
          p.push(pipe(sd * 0.28, 0.42, -1.02, 0.3, st));
        }
        seatCush(lt); wheelCol();
        return { p, ex, hub: 0xfff0a0 };
      }
      case 'zip_scooter': {
        p.push(P('box', [0.78, 0.14, 2.1], c, [0, 0.3, 0]));
        p.push(P('box', [0.3, 0.14, 2.14], lt, [0, 0.38, 0]));
        p.push(P('cone', [0.36, 0.7, 4], c, [0, 0.38, 1.35], [1, 0.45, 1], [HP, Math.PI / 4, 0]));
        p.push(P('box', [1.3, 0.07, 0.34], dk, [0, 1.05, -1.0]));
        for (const sd of [-1, 1]) {
          p.push(P('box', [0.06, 0.55, 0.1], st, [sd * 0.3, 0.76, -1.0]));
          p.push(P('box', [0.06, 0.2, 0.4], c, [sd * 0.65, 1.1, -1.0]));
          p.push(P('cyl', [0.09, 0.1, 0.9, 8], st, [sd * 0.46, 0.42, -0.7], [1, 1, 1], [HP, 0, 0]));
          ex.push([sd * 0.46, 0.42, -1.16]);
        }
        p.push(P('box', [1.1, 0.08, 0.1], lt, [0, 0.45, 1.0]));
        seatCush(lt); wheelCol();
        return { p, ex, hub: 0xffffff };
      }
      case 'jelly_jet': {
        p.push(P('cyl', [0.5, 0.5, 1.5, 12], c, [0, 0.42, 0], [0.95, 0.72, 1], [HP, 0, 0]));
        p.push(P('sph', [0.5, 10, 8], c, [0, 0.42, 0.75], [0.95, 0.72, 0.9]));
        p.push(P('sph', [0.5, 10, 8], dk, [0, 0.42, -0.75], [0.95, 0.72, 0.9]));
        p.push(P('box', [0.07, 0.6, 0.8], lt, [0, 0.98, -0.95], [1, 1, 1], [-0.45, 0, 0]));
        for (const sd of [-1, 1]) {
          p.push(P('sph', [0.3, 8, 6], lt, [sd * 0.6, 0.55, 0.25], [0.5, 0.25, 1.6], [0, sd * -0.15, sd * 0.2]));
          p.push(P('sph', [0.12, 7, 5], 0xfff09a, [sd * 0.3, 0.45, 1.2]));
          ex.push([sd * 0.25, 0.4, -1.2]);
          p.push(pipe(sd * 0.25, 0.4, -1.12, 0.3, st));
        }
        seatCush(lt); wheelCol();
        return { p, ex, hub: 0xfff09a };
      }
      case 'turbo_tub': {
        p.push(P('box', [1.14, 0.12, 2.0], dk, [0, 0.24, 0]));
        for (const sd of [-1, 1]) {
          p.push(P('box', [0.12, 0.34, 1.95], c, [sd * 0.54, 0.44, 0]));
          p.push(P('box', [0.16, 0.06, 1.99], lt, [sd * 0.54, 0.63, 0]));
        }
        p.push(P('box', [1.14, 0.36, 0.14], c, [0, 0.44, 0.97], [1, 1, 1], [-0.2, 0, 0]));
        p.push(P('box', [1.14, 0.62, 0.14], c, [0, 0.55, -0.95]));
        p.push(P('box', [1.3, 0.1, 0.32], lt, [0, 1.35, -1.0]));
        for (const sd of [-1, 1]) {
          p.push(P('box', [0.08, 0.5, 0.1], st, [sd * 0.45, 1.1, -0.98]));
          p.push(P('box', [0.1, 0.3, 0.5], c, [sd * 0.68, 1.35, -1.0]));
          p.push(pipe(sd * 0.3, 0.62, -1.08, 0.3, st));
          ex.push([sd * 0.3, 0.62, -1.24]);
        }
        p.push(P('box', [0.8, 0.07, 0.12], 0xfff2b0, [0, 0.46, 1.08]));
        seatCush(0xffe3a0); wheelCol();
        return { p, ex, hub: 0xffc83a };
      }
      case 'comet_coupe': {
        p.push(P('box', [1.0, 0.16, 2.1], dk, [0, 0.25, 0]));
        p.push(P('cone', [0.55, 1.1, 4], c, [0, 0.38, 1.1], [1.0, 0.5, 1.0], [HP, Math.PI / 4, 0]));
        p.push(P('box', [0.34, 0.06, 1.1], 0xffffff, [0, 0.52, 0.7]));
        for (const sd of [-1, 1]) {
          p.push(P('box', [0.26, 0.3, 1.3], c, [sd * 0.5, 0.38, -0.3]));
          p.push(P('box', [0.12, 0.08, 0.9], lt, [sd * 0.5, 0.56, -0.3]));
          p.push(P('box', [0.06, 0.5, 0.7], c, [sd * 0.4, 1.0, -1.0], [1, 1, 1], [-0.3, 0, 0]));
          p.push(pipe(sd * 0.3, 0.45, -1.02, 0.34, st));
          ex.push([sd * 0.3, 0.45, -1.2]);
        }
        p.push(P('box', [1.1, 0.07, 0.3], 0xffffff, [0, 1.22, -1.05]));
        seatCush(0xffffff); wheelCol();
        return { p, ex, hub: 0xffffff };
      }
      case 'rally_rover': {
        p.push(P('box', [1.1, 0.26, 2.0], c, [0, 0.3, 0]));
        p.push(P('box', [0.9, 0.1, 0.9], lt, [0, 0.5, 0.65]));
        for (const sd of [-1, 1]) {
          p.push(P('box', [0.3, 0.1, 0.8], dk, [sd * 0.55, 0.78, 0.75]));
          p.push(P('box', [0.3, 0.1, 0.8], dk, [sd * 0.55, 0.8, -0.75]));
          p.push(P('cyl', [0.045, 0.045, 1.1, 6], st, [sd * 0.5, 0.95, -0.95]));
          p.push(P('cyl', [0.1, 0.1, 0.5, 8], 0xfff2b0, [sd * 0.35, 0.58, 1.0], [1, 1, 1], [HP, 0, 0]));
          p.push(pipe(sd * 0.6, 0.6, -0.15, 0.5, st));
          ex.push([sd * 0.6, 0.6, -0.4]);
        }
        p.push(P('cyl', [0.045, 0.045, 1.1, 6], st, [0, 1.5, -0.95], [1, 1, 1], [0, 0, HP]));
        p.push(P('box', [1.0, 0.1, 0.12], 0x222230, [0, 0.4, 1.12]));
        p.push(P('box', [0.1, 0.2, 0.1], st, [0.3, 0.32, 1.1]));
        p.push(P('box', [0.1, 0.2, 0.1], st, [-0.3, 0.32, 1.1]));
        seatCush(0x2a2a36); wheelCol();
        return { p, ex, hub: 0xffe14a };
      }
      case 'iron_hauler': {
        p.push(P('box', [1.2, 0.3, 2.1], dk, [0, 0.34, 0]));
        p.push(P('box', [1.2, 0.55, 0.3], c, [0, 0.55, 1.0]));
        p.push(P('box', [0.9, 0.12, 0.06], 0x222230, [0, 0.55, 1.17]));
        p.push(P('box', [1.3, 0.14, 0.14], 0x333340, [0, 0.35, 1.22]));
        p.push(P('box', [1.14, 0.7, 0.55], c, [0, 0.55, -0.55])); // chunky cab riser
        for (const sd of [-1, 1]) {
          p.push(P('box', [0.1, 0.34, 1.5], c, [sd * 0.55, 0.62, -0.1]));
          p.push(P('sph', [0.1, 6, 5], 0xfff2a0, [sd * 0.4, 0.62, 1.16]));
          p.push(P('cyl', [0.09, 0.1, 1.1, 8], 0x333340, [sd * 0.42, 1.0, -1.0]));
          p.push(P('cyl', [0.11, 0.09, 0.08, 8], 0x111118, [sd * 0.42, 1.58, -1.0]));
          ex.push([sd * 0.42, 1.62, -1.0]);
        }
        p.push(P('box', [0.6, 0.14, 0.4], lt, [0, 0.9, -0.55]));
        p.push(P('box', [0.6, 0.32, 0.1], dk, [0, 1.0, -0.84]));
        p.push(P('box', [0.6, 0.12, 0.5], 0x5a4a3a, [0, 0.46, 0.2]));
        wheelCol();
        return { p, ex, hub: 0xd9a21a };
      }
      case 'dino_dozer': {
        p.push(P('box', [1.15, 0.3, 2.0], dk, [0, 0.36, 0]));
        p.push(P('box', [1.0, 0.4, 0.6], c, [0, 0.55, 0.85]));
        p.push(P('box', [1.7, 0.55, 0.14], 0xf0c030, [0, 0.5, 1.28], [1, 1, 1], [-0.25, 0, 0]));
        p.push(P('box', [1.14, 0.7, 0.55], c, [0, 0.55, -0.55]));
        for (let i = 0; i < 5; i++) p.push(P('cone', [0.12 - i * 0.008, 0.36 - i * 0.03, 5], 0xe8dfa0, [0, 0.98 - i * 0.04, -0.9 + i * 0.4], [1, 1, 1], [-0.3, 0, 0]));
        for (const sd of [-1, 1]) {
          p.push(P('box', [0.1, 0.3, 1.5], c, [sd * 0.57, 0.6, -0.1]));
          p.push(P('sph', [0.1, 6, 5], 0xfff2a0, [sd * 0.3, 0.7, 1.12]));
          p.push(P('box', [0.1, 0.1, 0.5], 0xf0c030, [sd * 0.55, 0.45, 1.05]));
          p.push(pipe(sd * 0.4, 0.55, -1.05, 0.34, 0x333340));
          ex.push([sd * 0.4, 0.55, -1.24]);
          p.push(P('sph', [0.12, 6, 5], 0x222230, [sd * 0.2, 0.85, 0.9], [1, 0.6, 1]));
        }
        p.push(P('box', [0.6, 0.14, 0.4], lt, [0, 0.9, -0.55]));
        p.push(P('box', [0.6, 0.12, 0.5], 0x4a3a2a, [0, 0.46, 0.2]));
        wheelCol();
        return { p, ex, hub: 0xf0c030 };
      }
      case 'thunder_tank': {
        p.push(P('box', [1.1, 0.34, 2.0], c, [0, 0.4, 0]));
        p.push(P('box', [1.1, 0.14, 0.5], dk, [0, 0.3, 1.1], [1, 1, 1], [0.4, 0, 0]));
        p.push(P('box', [1.14, 0.7, 0.55], dk, [0, 0.55, -0.55]));
        for (const sd of [-1, 1]) {
          p.push(P('box', [0.1, 0.46, 1.6], lt, [sd * 0.56, 0.5, 0.0]));
          p.push(P('box', [0.1, 0.1, 0.1], 0xffe04a, [sd * 0.56, 0.7, 0.95]));
          p.push(pipe(sd * 0.38, 0.5, -1.04, 0.34, 0x333340));
          ex.push([sd * 0.38, 0.5, -1.22]);
        }
        p.push(P('cyl', [0.36, 0.42, 0.25, 8], lt, [0, 0.7, 0.95]));
        p.push(P('cyl', [0.07, 0.09, 0.95, 8], 0x333340, [0, 0.8, 1.55], [1, 1, 1], [HP, 0, 0]));
        p.push(P('cyl', [0.12, 0.12, 0.12, 8], 0x222230, [0, 0.8, 2.0], [1, 1, 1], [HP, 0, 0]));
        p.push(P('box', [0.1, 0.16, 0.9], 0xffe04a, [0, 0.97, 0.3])); // lightning stripe
        p.push(P('box', [0.6, 0.14, 0.4], lt, [0, 0.9, -0.55]));
        p.push(P('box', [0.6, 0.12, 0.5], 0x2a2a36, [0, 0.46, 0.2]));
        wheelCol();
        return { p, ex, hub: 0xffe04a };
      }
    }
    return { p, ex, hub: 0xffffff };
  }

  const kartGeoCache = {};

  function buildKart(kartId, frontId, rearId) {
    const k = kartById[kartId] || G.KARTS[0];
    let cache = kartGeoCache[k.id];
    if (!cache) {
      const kp = kartParts(k);
      cache = kartGeoCache[k.id] = { geo: merge(kp.p), ex: kp.ex, hub: kp.hub };
    }
    const group = new THREE.Group();
    group.name = 'kart_' + k.id;
    const body = new THREE.Mesh(cache.geo, mat());
    body.name = 'kartBody';
    group.add(body);

    const wr = WHEEL[k.weight];
    const wg = wheelGeo(wr[0], wr[1], cache.hub);
    const wx = 0.8 - wr[1] / 2;
    const wheels = [], pivots = [];
    const spots = [[-1, 0.75], [1, 0.75], [-1, -0.75], [1, -0.75]]; // fl, fr, rl, rr (x sign: +x is left when facing +Z)
    spots.forEach((s, i) => {
      const w = new THREE.Object3D();
      const m = new THREE.Mesh(wg, mat());
      w.add(m);
      if (i < 2) {
        const pv = new THREE.Object3D();
        pv.position.set(s[0] * wx, wr[0], s[1]);
        pv.add(w);
        group.add(pv);
        pivots.push(pv);
      } else {
        w.position.set(s[0] * (wx + 0.02), wr[0], s[1]);
        group.add(w);
      }
      wheels.push(w);
    });

    const frontSeat = new THREE.Object3D(); frontSeat.position.set(SEAT_F[0], SEAT_F[1], SEAT_F[2]);
    const rearSeat = new THREE.Object3D(); rearSeat.position.set(SEAT_R[0], SEAT_R[1], SEAT_R[2]);
    group.add(frontSeat, rearSeat);
    const front = buildRider(frontId);
    const rear = buildRider(rearId);
    frontSeat.add(front);
    rearSeat.add(rear);

    const exhausts = cache.ex.map((e) => {
      const o = new THREE.Object3D();
      o.position.set(e[0], e[1], e[2]);
      group.add(o);
      return o;
    });

    return { group, body, wheels, frontWheelPivots: pivots, frontSeat, rearSeat, front, rear, exhausts };
  }

  function kartWeight(frontId, rearId) {
    const rank = { light: 0, medium: 1, heavy: 2 };
    const a = charById[frontId], b = charById[rearId];
    const wa = a ? a.weight : 'medium', wb = b ? b.weight : 'medium';
    return rank[wa] >= rank[wb] ? wa : wb;
  }

  // ---------------------------------------------------------------- portraits
  const css = (n) => '#' + ('000000' + n.toString(16)).slice(-6);
  function ell(x, cx, cy, rx, ry, fill, stroke, rot) {
    x.beginPath(); x.ellipse(cx, cy, rx, ry, rot || 0, 0, Math.PI * 2);
    if (fill) { x.fillStyle = fill; x.fill(); }
    if (stroke) { x.lineWidth = 3; x.strokeStyle = stroke; x.stroke(); }
  }
  function poly(x, pts, fill, stroke) {
    x.beginPath(); x.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]);
    x.closePath();
    if (fill) { x.fillStyle = fill; x.fill(); }
    if (stroke) { x.lineWidth = 3; x.lineJoin = 'round'; x.strokeStyle = stroke; x.stroke(); }
  }
  function spike(x, cx, cy, ang, len, w, fill) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    poly(x, [cx - dy * w, cy + dx * w, cx + dx * len, cy + dy * len, cx + dy * w, cy - dx * w], fill, '#222');
  }
  function eyePair(x, cx, cy, gap, r) {
    for (const sd of [-1, 1]) {
      ell(x, cx + sd * gap, cy, r, r * 1.25, '#1c1a24');
      ell(x, cx + sd * gap - r * 0.3, cy - r * 0.45, r * 0.38, r * 0.38, '#fff');
    }
  }
  function smile(x, cx, cy, w, col) {
    x.beginPath(); x.arc(cx, cy, w, 0.15 * Math.PI, 0.85 * Math.PI);
    x.lineWidth = 3; x.lineCap = 'round'; x.strokeStyle = col || '#3a1a1a'; x.stroke();
  }

  function buildPortrait(charId) {
    const ch = charById[charId] || G.CHARACTERS[0], co = ch.colors;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const x = cv.getContext('2d');
    const P1 = css(co.primary), S1 = css(co.secondary), SK = css(co.skin), AC = css(co.accent);
    // diagonal two-tone background
    const bgA = css(shade(co.primary, 0.55).getHex()), bgB = css(shade(co.accent, 1.1).getHex());
    x.fillStyle = bgA; x.fillRect(0, 0, 128, 128);
    poly(x, [128, 0, 128, 128, 0, 128], css(shade(co.primary, 1.0).getHex()));
    poly(x, [128, 0, 128, 60, 60, 128, 0, 128, 0, 100, 100, 0], bgB);
    // shoulders
    const shoulders = (col, w) => { x.beginPath(); x.ellipse(64, 134, w || 50, 34, 0, 0, Math.PI * 2); x.fillStyle = col; x.fill(); x.lineWidth = 3; x.strokeStyle = '#222'; x.stroke(); };
    x.lineJoin = 'round';

    switch (ch.id) {
      case 'blaze': {
        shoulders(P1);
        for (let i = 0; i < 7; i++) spike(x, 64 + (i - 3) * 9, 44, -Math.PI / 2 + (i - 3) * 0.28, 36 - Math.abs(i - 3) * 4, 9, i % 2 ? '#ff9a2a' : P1);
        spike(x, 64, 42, -Math.PI / 2, 46, 10, AC);
        ell(x, 64, 68, 33, 32, SK, '#222');
        x.fillStyle = '#1c1a24'; x.fillRect(31, 46, 66, 9); x.strokeStyle = '#222'; x.lineWidth = 2; x.strokeRect(31, 46, 66, 9);
        ell(x, 48, 50, 10, 10, AC, '#222'); ell(x, 80, 50, 10, 10, AC, '#222');
        eyePair(x, 64, 68, 13, 4.5); smile(x, 64, 76, 12);
        ell(x, 44, 78, 5, 3, 'rgba(255,100,80,.5)'); ell(x, 84, 78, 5, 3, 'rgba(255,100,80,.5)');
        break;
      }
      case 'ember': {
        shoulders(P1);
        poly(x, [38, 100, 90, 100, 82, 112, 46, 112], AC, '#222');
        ell(x, 64, 62, 38, 36, '#b81c2c', '#222');
        ell(x, 100, 82, 12, 22, '#d8283a', '#222', 0.4); ell(x, 106, 104, 8, 12, '#d8283a', '#222', 0.4);
        ell(x, 64, 70, 32, 31, SK, '#222');
        poly(x, [32, 62, 40, 40, 64, 36, 88, 40, 96, 62, 80, 52, 64, 56, 48, 52], '#b81c2c', '#222');
        x.fillStyle = '#2a1a22'; x.fillRect(32, 62, 64, 8);
        for (const sd of [-1, 1]) { ell(x, 64 + sd * 14, 66, 12, 12, AC, '#222'); ell(x, 64 + sd * 14, 66, 7, 8, '#1c1a24'); ell(x, 64 + sd * 14 - 2, 63, 2.5, 2.5, '#fff'); }
        smile(x, 64, 82, 10);
        break;
      }
      case 'rosa': {
        shoulders(P1, 46);
        poly(x, [46, 120, 82, 120, 74, 104, 54, 104], S1, '#222');
        ell(x, 64, 74, 31, 30, SK, '#222');
        for (let i = 0; i < 7; i++) { const a = Math.PI + (i / 6) * Math.PI; ell(x, 64 + Math.cos(a) * 34, 50 + Math.sin(a) * 22, 15, 10, i % 2 ? '#ff8fc4' : P1, '#222', a + Math.PI / 2); }
        ell(x, 64, 38, 12, 8, AC, '#222');
        ell(x, 38, 84, 9, 9, '#ff7eb6', '#222'); ell(x, 90, 84, 9, 9, '#ff7eb6', '#222');
        ell(x, 64, 74, 28, 27, SK);
        eyePair(x, 64, 74, 12, 4.5); smile(x, 64, 82, 9);
        ell(x, 46, 84, 5, 3, 'rgba(255,90,120,.6)'); ell(x, 82, 84, 5, 3, 'rgba(255,90,120,.6)');
        break;
      }
      case 'lily': {
        shoulders(P1);
        ell(x, 64, 38, 15, 13, '#8a6fd0', '#222');
        ell(x, 64, 66, 36, 34, '#8a6fd0', '#222');
        ell(x, 64, 72, 30, 29, SK, '#222');
        poly(x, [34, 66, 44, 46, 64, 44, 84, 46, 94, 66, 82, 58, 64, 62, 46, 58], '#8a6fd0', '#222');
        ell(x, 90, 48, 6, 6, '#ff7eb6', '#222'); ell(x, 90, 48, 2.5, 2.5, '#ffe05a');
        eyePair(x, 64, 72, 12, 4.5); smile(x, 64, 82, 9);
        poly(x, [30, 102, 64, 118, 98, 102, 104, 118, 64, 128, 24, 118], '#5fae5a', '#222');
        ell(x, 32, 108, 14, 7, '#6fc06a', '#222', -0.5); ell(x, 96, 108, 14, 7, '#6fc06a', '#222', 0.5);
        break;
      }
      case 'pip': {
        shoulders(P1, 44);
        ell(x, 64, 112, 24, 18, S1, '#222');
        x.beginPath(); x.moveTo(64, 44); x.lineTo(64, 18); x.lineWidth = 4; x.strokeStyle = '#137a70'; x.stroke();
        ell(x, 64, 16, 8, 8, AC, '#222');
        ell(x, 64, 76, 42, 33, SK, '#222');
        ell(x, 64, 92, 26, 12, S1, '#222');
        for (const sd of [-1, 1]) {
          ell(x, 64 + sd * 24, 52, 17, 17, '#fff', '#222'); ell(x, 64 + sd * 24 + sd * 2, 54, 8, 9, '#1c1a24'); ell(x, 64 + sd * 24, 50, 3, 3, '#fff');
          ell(x, 64 + sd * 32, 84, 6, 4, 'rgba(255,110,110,.55)');
          ell(x, 64 + sd * 6, 80, 2, 1.5, '#137a70');
        }
        smile(x, 64, 88, 14, '#137a70');
        break;
      }
      case 'pop': {
        shoulders(P1, 44);
        for (const sd of [-1, 1]) { x.beginPath(); x.moveTo(64 + sd * 16, 40); x.lineTo(64 + sd * 32, 14); x.lineWidth = 4; x.strokeStyle = '#d6a21a'; x.stroke(); ell(x, 64 + sd * 34, 12, 9, 9, AC, '#222'); }
        ell(x, 64, 72, 40, 38, SK, '#222');
        ell(x, 64, 46, 5, 5, AC); ell(x, 50, 52, 4, 4, AC); ell(x, 80, 53, 4, 4, AC);
        eyePair(x, 64, 70, 14, 5.5);
        ell(x, 34, 82, 8, 6, 'rgba(255,110,90,.7)'); ell(x, 94, 82, 8, 6, 'rgba(255,110,90,.7)');
        x.beginPath(); x.ellipse(64, 86, 11, 8, 0, 0, Math.PI); x.fillStyle = '#8a2a1a'; x.fill(); x.lineWidth = 3; x.strokeStyle = '#222'; x.stroke();
        ell(x, 64, 92, 6, 3, '#ff7a6a');
        break;
      }
      case 'grub': {
        shoulders(P1, 56);
        ell(x, 64, 112, 28, 18, S1, '#222');
        for (let i = 0; i < 9; i++) spike(x, 64 + (i - 4) * 10, 52, -Math.PI / 2 + (i - 4) * 0.3, 24, 8, i % 2 ? '#5a3418' : P1);
        ell(x, 26, 66, 12, 18, P1, '#222'); ell(x, 102, 66, 12, 18, P1, '#222');
        ell(x, 64, 70, 40, 36, P1, '#222');
        ell(x, 64, 86, 25, 18, SK, '#222');
        ell(x, 64, 78, 7, 5, '#1c1a24');
        for (const sd of [-1, 1]) {
          poly(x, [64 + sd * 14, 96, 64 + sd * 22, 96, 64 + sd * 20, 70], AC, '#222');
          ell(x, 64 + sd * 18, 62, 5, 5.5, '#1c1a24'); ell(x, 64 + sd * 18 - 1.5, 60, 2, 2, '#fff');
          x.beginPath(); x.moveTo(64 + sd * 8, 52); x.lineTo(64 + sd * 28, 56); x.lineWidth = 5; x.strokeStyle = '#2a1608'; x.stroke();
        }
        break;
      }
      case 'krag': {
        shoulders(P1, 52);
        ell(x, 64, 62, 50, 44, S1, '#222');
        for (let i = 0; i < 7; i++) spike(x, 64 + (i - 3) * 14, 30 + Math.abs(i - 3) * 4, -Math.PI / 2 + (i - 3) * 0.3, 22, 7, AC);
        for (const sd of [-1, 1]) { ell(x, 64 + sd * 46, 104, 16, 14, P1, '#222'); spike(x, 64 + sd * 50, 96, -Math.PI / 2 + sd * 0.8, 20, 6, AC); }
        ell(x, 64, 74, 30, 28, SK, '#222');
        for (const sd of [-1, 1]) spike(x, 64 + sd * 22, 52, -Math.PI / 2 + sd * 0.45, 22, 6, AC);
        poly(x, [34, 62, 94, 62, 90, 52, 38, 52], P1, '#222');
        eyePair(x, 64, 70, 12, 4);
        x.fillStyle = P1; x.fillRect(46, 86, 36, 6); x.strokeStyle = '#222'; x.lineWidth = 2; x.strokeRect(46, 86, 36, 6);
        for (const sd of [-1, 1]) spike(x, 64 + sd * 12, 92, Math.PI / 2 + sd * 0.1, 10, 3, AC);
        break;
      }
    }
    // frame
    x.lineWidth = 6; x.strokeStyle = '#1c1a24'; x.strokeRect(0, 0, 128, 128);
    return cv;
  }

  G.Characters = {
    buildRider, buildKart, buildPortrait, kartWeight,
    getCharacter: (id) => charById[id],
    getKart: (id) => kartById[id],
  };
})();
