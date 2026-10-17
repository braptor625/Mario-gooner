// Characters, karts, portraits. All geometry is merged per-model into vertex-colored
// BufferGeometries (cached), so a kart + 2 riders is only ~9 meshes.
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  // ---------------------------------------------------------------- data
  G.CHARACTERS = [
    { id: 'blaze', name: 'Blaze', weight: 'medium', special: 'fireball', partner: 'ember', locked: false,
      colors: { primary: 0xe8512a, secondary: 0x3b4a6b, skin: 0xf2b58a, accent: 0xffc83a },
      tagline: 'Fiery-haired mechanic kid who never stops tinkering.' },
    { id: 'ember', name: 'Ember', weight: 'medium', special: 'fireball', partner: 'blaze', locked: false,
      colors: { primary: 0xc4202f, secondary: 0x2e2a3a, skin: 0xe8a57c, accent: 0xf5b820 },
      tagline: "Blaze's cousin. Gold goggles, crimson scarf, zero brakes." },
    { id: 'rosa', name: 'Rosa', weight: 'medium', special: 'heart', partner: 'lily', locked: false,
      colors: { primary: 0xff7eb6, secondary: 0xfff0f5, skin: 0xffd0b0, accent: 0xffd84a },
      tagline: 'Blooms at full speed in her petal hat.' },
    { id: 'lily', name: 'Lily', weight: 'medium', special: 'heart', partner: 'rosa', locked: false,
      colors: { primary: 0xa98be0, secondary: 0x5fae5a, skin: 0xf0c4a0, accent: 0x3f8f4a },
      tagline: 'Calm florist with a leaf scarf and a lead foot.' },
    { id: 'pip', name: 'Pip', weight: 'medium', special: 'egg', partner: 'pop', locked: false,
      colors: { primary: 0x25b8a8, secondary: 0xf4ecc8, skin: 0x35cdb8, accent: 0xff7a3a },
      tagline: 'Hoppy little critter with bug eyes and big ideas.' },
    { id: 'pop', name: 'Pop', weight: 'medium', special: 'egg', partner: 'pip', locked: false,
      colors: { primary: 0xffd23a, secondary: 0xfff1b0, skin: 0xffe05a, accent: 0xff8a2a },
      tagline: 'Bubbly, bouncy, and a little bit explosive.' },
    { id: 'grub', name: 'Grub', weight: 'heavy', special: 'giant_banana', partner: 'nib', locked: false,
      colors: { primary: 0x7a4a2a, secondary: 0xc99a64, skin: 0xd9ad78, accent: 0xf4ecd0 },
      tagline: 'Furry bruiser with tusks. Loves bananas. Very big.' },
    { id: 'nib', name: 'Nib', weight: 'light', special: 'giant_banana', partner: 'grub', locked: false,
      colors: { primary: 0xe0a030, secondary: 0x3f8a4a, skin: 0xb9b2a2, accent: 0xff6a2a },
      tagline: 'Scrappy jungle scamp in a leafy cap. Steals snacks, never stops.' },
    { id: 'krag', name: 'Krag', weight: 'heavy', special: 'mega_shell', partner: 'krik', locked: false,
      colors: { primary: 0x5b6b7a, secondary: 0x4f9a4a, skin: 0x8fa5a0, accent: 0xe6dcc0 },
      tagline: 'Spiky rock-turtle brute. Hits like a landslide.' },
    { id: 'krik', name: 'Krik', weight: 'light', special: 'mega_shell', partner: 'krag', locked: false,
      colors: { primary: 0x3a8ae0, secondary: 0x7a4fc0, skin: 0xe8c8a0, accent: 0xffd23a },
      tagline: 'Pint-sized shell kid in a bandana. Pokes first, asks later.' },
    { id: 'volt', name: 'Volt', weight: 'heavy', special: 'bomb', partner: 'vex', locked: false,
      colors: { primary: 0xffd21a, secondary: 0x2a2a3a, skin: 0xf0c09a, accent: 0x35e0ff },
      tagline: 'Lanky electrician with a bolt on his hard hat and a bomb in his bag.' },
    { id: 'vex', name: 'Vex', weight: 'heavy', special: 'bomb', partner: 'volt', locked: false,
      colors: { primary: 0x7a3ad0, secondary: 0x22222c, skin: 0xe0a880, accent: 0xb4ff3a },
      tagline: "Volt's stocky rival. Shorts out everything, including friendships." },
    { id: 'shelby', name: 'Shelby', weight: 'light', special: 'shell_triple', partner: 'swoop', locked: false,
      colors: { primary: 0x4a55c8, secondary: 0xd8f0f0, skin: 0xf08a7a, accent: 0xffb03a },
      tagline: 'Sturdy little shell-back with a polite honk and a mean slide.' },
    { id: 'swoop', name: 'Swoop', weight: 'light', special: 'shell_triple', partner: 'shelby', locked: false,
      colors: { primary: 0xc03a8a, secondary: 0xfff0f8, skin: 0x7ad0f0, accent: 0xffffff },
      tagline: 'Winged shell-back who hovers through corners.' },
    { id: 'bitsy', name: 'Bitsy', weight: 'light', special: 'chomp', partner: 'bop', locked: false,
      colors: { primary: 0xffb0d0, secondary: 0xfff4e0, skin: 0xffd8b8, accent: 0xff5a9a },
      tagline: 'Toddler in a bonnet. Her pet chomper is NOT a pet.' },
    { id: 'bop', name: 'Bop', weight: 'light', special: 'chomp', partner: 'bitsy', locked: false,
      colors: { primary: 0x7ad8c0, secondary: 0xffe070, skin: 0xffd0a8, accent: 0xff5a5a },
      tagline: 'Propeller-beanie toddler twin. Naps never, races always.' },
    { id: 'spud', name: 'Spud', weight: 'light', special: 'mushroom_gold', partner: 'sprout', locked: true,
      colors: { primary: 0x8a5a2a, secondary: 0xe8cc92, skin: 0xc8985a, accent: 0x5aa84a },
      tagline: 'Root-vegetable folk with a leaf tuft. Surprisingly fast underground.' },
    { id: 'sprout', name: 'Sprout', weight: 'light', special: 'mushroom_gold', partner: 'spud', locked: true,
      colors: { primary: 0x58b04a, secondary: 0xd04a8a, skin: 0xf6dcea, accent: 0x3f9a3a },
      tagline: 'Radish-cheeked racer with leafy pigtails and endless energy.' },
    { id: 'thorn', name: 'Thorn', weight: 'heavy', special: 'all', partner: 'wisp', locked: true,
      colors: { primary: 0x2f8a3a, secondary: 0xc02a4a, skin: 0x4faa4a, accent: 0xf0e8c0 },
      tagline: 'Carnivorous plant monster. Always hungry. Always.' },
    { id: 'wisp', name: 'Wisp', weight: 'heavy', special: 'all', partner: 'thorn', locked: true,
      colors: { primary: 0xe6e0ff, secondary: 0x8a7ad8, skin: 0xf4f0ff, accent: 0x6fe3ff },
      tagline: 'Big, round, friendly ghost wearing a crown of cold flame.' },
  ];

  // 21 karts. owner = signature rider; weight = owner's weight. 'parade' is weight 'any'.
  G.KARTS = [
    // light (8 signature)
    { id: 'bubble_buggy', name: 'Bubble Buggy', owner: 'bitsy', weight: 'light', speed: 2, accel: 5, handling: 5, mass: 1, color: 0xff7ac8, locked: false },
    { id: 'zip_scooter', name: 'Zip Scooter', owner: 'krik', weight: 'light', speed: 3, accel: 4, handling: 4, mass: 1, color: 0x35d3e6, locked: false },
    { id: 'jelly_jet', name: 'Jelly Jet', owner: 'bop', weight: 'light', speed: 2, accel: 4, handling: 5, mass: 2, color: 0xb28cff, locked: false },
    { id: 'vine_runner', name: 'Vine Runner', owner: 'nib', weight: 'light', speed: 3, accel: 4, handling: 3, mass: 2, color: 0x7fb23a, locked: false },
    { id: 'shell_skiff', name: 'Shell Skiff', owner: 'shelby', weight: 'light', speed: 3, accel: 3, handling: 4, mass: 2, color: 0x4a6fe0, locked: false },
    { id: 'wing_glider', name: 'Wing Glider', owner: 'swoop', weight: 'light', speed: 4, accel: 3, handling: 3, mass: 1, color: 0xe85aa8, locked: false },
    { id: 'tater_trolley', name: 'Tater Trolley', owner: 'spud', weight: 'light', speed: 2, accel: 5, handling: 4, mass: 2, color: 0xc8985a, locked: true },
    { id: 'leaf_lark', name: 'Leaf Lark', owner: 'sprout', weight: 'light', speed: 3, accel: 5, handling: 3, mass: 1, color: 0x6ad05a, locked: true },
    // medium (6 signature)
    { id: 'turbo_tub', name: 'Turbo Tub', owner: 'pip', weight: 'medium', speed: 3, accel: 3, handling: 3, mass: 3, color: 0xff8a1f, locked: false },
    { id: 'comet_coupe', name: 'Comet Coupe', owner: 'blaze', weight: 'medium', speed: 4, accel: 3, handling: 2, mass: 3, color: 0xe8352e, locked: false },
    { id: 'rally_rover', name: 'Rally Rover', owner: 'ember', weight: 'medium', speed: 3, accel: 4, handling: 3, mass: 3, color: 0x3a9cff, locked: false },
    { id: 'blossom_cruiser', name: 'Blossom Cruiser', owner: 'rosa', weight: 'medium', speed: 3, accel: 3, handling: 4, mass: 3, color: 0xff8cc0, locked: false },
    { id: 'garden_gig', name: 'Garden Gig', owner: 'lily', weight: 'medium', speed: 3, accel: 4, handling: 3, mass: 3, color: 0x9a7ae0, locked: false },
    { id: 'egg_racer', name: 'Egg Racer', owner: 'pop', weight: 'medium', speed: 4, accel: 2, handling: 3, mass: 3, color: 0xffc83a, locked: true },
    // heavy (6 signature)
    { id: 'iron_hauler', name: 'Iron Hauler', owner: 'grub', weight: 'heavy', speed: 5, accel: 1, handling: 2, mass: 5, color: 0x8794a3, locked: false },
    { id: 'dino_dozer', name: 'Dino Dozer', owner: 'krag', weight: 'heavy', speed: 4, accel: 2, handling: 2, mass: 5, color: 0x5cb53c, locked: false },
    { id: 'thunder_tank', name: 'Thunder Tank', owner: 'volt', weight: 'heavy', speed: 5, accel: 2, handling: 1, mass: 4, color: 0x4a5fb0, locked: false },
    { id: 'bolt_brute', name: 'Bolt Brute', owner: 'vex', weight: 'heavy', speed: 4, accel: 3, handling: 2, mass: 5, color: 0x7a3ac0, locked: true },
    { id: 'bramble_beast', name: 'Bramble Beast', owner: 'thorn', weight: 'heavy', speed: 4, accel: 2, handling: 3, mass: 5, color: 0x2f7a3a, locked: true },
    { id: 'specter_sedan', name: 'Specter Sedan', owner: 'wisp', weight: 'heavy', speed: 5, accel: 2, handling: 2, mass: 4, color: 0x8a7ad0, locked: true },
    // usable by every pair
    { id: 'parade_float', name: 'Parade Float', owner: null, weight: 'any', speed: 3, accel: 3, handling: 3, mass: 4, color: 0xffc83a, locked: true },
  ];

  const charById = {};
  G.CHARACTERS.forEach((c) => (charById[c.id] = c));
  const kartById = {};
  G.KARTS.forEach((k) => (kartById[k.id] = k));

  // ---------------------------------------------------------------- geometry helpers
  // Everything is built from smooth-shaded primitives (indexed -> non-indexed, smooth normals kept),
  // merged per material into vertex-coloured BufferGeometries and cached.
  const geoCache = {};
  const UV_WHITE = [0.0625, 0.9375]; // body atlas: solid white texel

  // Rounded box: 'true' (3 segments/axis, real bevel) or 'soft' (2 segments, pillow). Smooth normals.
  function rboxGeo(w, h, d, r, hard) {
    const hx = w / 2, hy = h / 2, hz = d / 2;
    r = Math.min(r, hx * 0.98, hy * 0.98, hz * 0.98);
    const ix = hx - r, iy = hy - r, iz = hz - r;
    const g = new THREE.BoxGeometry(1, 1, 1, hard ? 3 : 2, hard ? 3 : 2, hard ? 3 : 2);
    const pa = g.attributes.position, na = g.attributes.normal;
    const mapc = (v, hh, ii) => {
      if (!hard) return v * 2 * hh;
      const a = Math.abs(v);
      return Math.sign(v) * (a > 0.4 ? hh : ii);
    };
    for (let i = 0; i < pa.count; i++) {
      const px = mapc(pa.getX(i), hx, ix), py = mapc(pa.getY(i), hy, iy), pz = mapc(pa.getZ(i), hz, iz);
      const qx = Math.max(-ix, Math.min(ix, px)), qy = Math.max(-iy, Math.min(iy, py)), qz = Math.max(-iz, Math.min(iz, pz));
      let nx = px - qx, ny = py - qy, nz = pz - qz;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (l > 1e-6) { nx /= l; ny /= l; nz /= l; pa.setXYZ(i, qx + nx * r, qy + ny * r, qz + nz * r); na.setXYZ(i, nx, ny, nz); }
      else pa.setXYZ(i, px, py, pz);
    }
    return g;
  }

  function sphSegs(sz) {
    return sz > 0.45 ? [22, 16] : sz > 0.25 ? [18, 13] : sz > 0.13 ? [13, 9] : sz > 0.065 ? [10, 7] : [7, 5];
  }

  function baseGeo(t, a, sc) {
    const mx = Math.max(sc[0], sc[1], sc[2]);
    let key, g;
    if (t === 'sph') {
      const sg = sphSegs(a[0] * mx * (G.GFX_LOD || 1));
      key = 's:' + a[0] + ',' + sg;
      if (geoCache[key]) return geoCache[key];
      g = new THREE.SphereGeometry(a[0], sg[0], sg[1]);
    } else if (t === 'box') {
      const dims = [a[0] * sc[0], a[1] * sc[1], a[2] * sc[2]];
      const mn = Math.min(dims[0], dims[1], dims[2]), mxd = Math.max(dims[0], dims[1], dims[2]);
      const hard = mxd >= 0.55 && mn >= 0.09;
      const rr = a[3] !== undefined ? a[3] : Math.min(0.14, mn * 0.42);
      key = 'b:' + a.join(',') + (hard ? 'h' : 's') + rr;
      if (geoCache[key]) return geoCache[key];
      g = rboxGeo(a[0], a[1], a[2], rr / Math.max(1e-3, 1), hard);
    } else if (t === 'cyl') {
      const seg = a[0] * mx > 0.18 ? 18 : a[0] * mx > 0.07 ? 12 : 8;
      key = 'c:' + a.slice(0, 3).join(',') + ',' + seg;
      if (geoCache[key]) return geoCache[key];
      g = new THREE.CylinderGeometry(a[0], a[1], a[2], seg, 1);
    } else if (t === 'tor') {
      key = 't:' + a.join(',');
      if (geoCache[key]) return geoCache[key];
      g = new THREE.TorusGeometry(a[0], a[1], a[2] || 8, a[3] || 16);
    } else {
      const seg = a[0] * mx > 0.12 ? 14 : a[0] * mx > 0.05 ? 9 : 6;
      key = 'k:' + a[0] + ',' + a[1] + ',' + seg;
      if (geoCache[key]) return geoCache[key];
      g = new THREE.ConeGeometry(a[0], a[1], seg, 1);
    }
    g = g.toNonIndexed();
    geoCache[key] = g;
    return g;
  }
  const P = (t, a, c, p, s, r) => ({ t, a, c, p: p || [0, 0, 0], s: s || [1, 1, 1], r: r || [0, 0, 0] });
  const HP = Math.PI / 2;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
  const _p = new THREE.Vector3(), _s = new THREE.Vector3();

  // parts: primitives (t/a/c/p/s/r) or raw ({geo, c}) with optional uv:[u,v] override
  function merge(parts, defUV) {
    defUV = defUV || UV_WHITE;
    const gs = parts.map((pt) => pt.geo || baseGeo(pt.t, pt.a, pt.s));
    let n = 0;
    gs.forEach((g) => (n += g.attributes.position.count));
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0;
    parts.forEach((pt, i) => {
      let g = gs[i];
      if (!pt.geo) {
        g = g.clone();
        _e.set(pt.r[0], pt.r[1], pt.r[2]);
        _q.setFromEuler(_e);
        _p.set(pt.p[0], pt.p[1], pt.p[2]);
        _s.set(pt.s[0], pt.s[1], pt.s[2]);
        _m.compose(_p, _q, _s);
        g.applyMatrix4(_m);
      }
      const c = new THREE.Color(pt.c);
      const cnt = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      const guv = pt.geo && g.attributes.uv && !pt.uv ? g.attributes.uv.array : null;
      const u = pt.uv || defUV;
      for (let k = 0; k < cnt; k++) {
        col[(o + k) * 3] = c.r; col[(o + k) * 3 + 1] = c.g; col[(o + k) * 3 + 2] = c.b;
        uv[(o + k) * 2] = guv ? guv[k * 2] : u[0]; uv[(o + k) * 2 + 1] = guv ? guv[k * 2 + 1] : u[1];
      }
      o += cnt;
      if (!pt.geo) g.dispose();
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }

  // rider material: smooth Phong + soft fresnel rim
  let sharedMat = null;
  function mat() {
    if (sharedMat) return sharedMat;
    sharedMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 46, specular: 0x4a4a4a });
    if (G.GFX && G.GFX.patchRim) { try { G.GFX.patchRim(sharedMat, { color: 0xfff1dc, strength: 0.3, power: 2.4 }); } catch (e) {} }
    return sharedMat;
  }
  function shade(c, k) { const x = new THREE.Color(c); return k < 1 ? x.multiplyScalar(k) : x.lerp(new THREE.Color(0xffffff), k - 1); }

  // ---------------------------------------------------------------- riders
  const DARK = 0x1c1a24, WHITE = 0xffffff;
  const riderGeoCache = {};

  // cone lean helper: tilt outward in direction (dx,dz)
  const lean = (dx, dz, k) => [dz * k, 0, -dx * k];

  const IRIS = {
    blaze: 0x3a8ae0, ember: 0x2a9a5a, rosa: 0x8a4ad0, lily: 0x2fa89a, pip: 0xffb02a, pop: 0x2a6ad8, grub: 0x7a4a1a, nib: 0x4aa83a,
    krag: 0xe0a82a, krik: 0x3a6ad8, volt: 0x35c8e8, vex: 0xb43aff, shelby: 0x2a8ad0, swoop: 0x7a3ad0, bitsy: 0x7a4a2a, bop: 0x2a8a6a,
    spud: 0x4a2a12, sprout: 0x3a9a3a, thorn: 0xffd22a, wisp: 0x3a5ae0,
  };
  let irisCol = 0x4a8ae0;

  // proper eyes: white sclera, coloured iris, pupil, glint
  function eyes(h, x, y, z, r) {
    const R = r * 1.5;
    for (const sd of [-1, 1]) {
      const ex = sd * x;
      h.push(P('sph', [R], WHITE, [ex, y, z - R * 0.28], [1, 1.2, 0.72]));
      h.push(P('sph', [R * 0.78], irisCol, [ex - sd * R * 0.08, y - R * 0.04, z + R * 0.14], [1, 1.12, 0.42]));
      h.push(P('sph', [R * 0.44], 0x120f18, [ex - sd * R * 0.08, y - R * 0.05, z + R * 0.24], [1, 1.1, 0.4]));
      h.push(P('sph', [R * 0.2], WHITE, [ex - sd * R * 0.3, y + R * 0.3, z + R * 0.33], [1, 1, 0.5]));
    }
  }

  function riderParts(id) {
    const ch = charById[id], c = ch.colors;
    const b = [], h = [];
    let headR = 0.32;
    let headScale = [1, 1, 1];
    irisCol = IRIS[id] || 0x4a8ae0;
    // default torso / limbs (round, chunky, toy-like)
    const torso = () => b.push(P('sph', [0.27, 12, 9], c.primary, [0, 0.27, 0], [1.0, 0.98, 0.84]));
    const limbs = (armCol, legCol, footCol, handCol, big) => {
      const k = big || 1;
      for (const sd of [-1, 1]) {
        b.push(P('cyl', [0.078 * k, 0.07 * k, 0.44, 10], armCol, [sd * 0.32 * k, 0.32, 0.2], [1, 1, 1], [HP + 0.35, 0, 0]));
        b.push(P('sph', [0.1 * k], armCol, [sd * 0.32 * k, 0.38, 0.0]));
        b.push(P('cyl', [0.098 * k, 0.098 * k, 0.07, 10], shade(armCol, 1.28), [sd * 0.32 * k, 0.3, 0.37], [1, 1, 1], [HP + 0.35, 0, 0])); // cuff
        b.push(P('sph', [0.118 * k], handCol, [sd * 0.32 * k, 0.27, 0.44])); // glove / hand
        b.push(P('cyl', [0.09, 0.085, 0.42, 10], legCol, [sd * 0.14, 0.04, 0.27], [1, 1, 1], [HP, 0, 0]));
        b.push(P('sph', [0.115], footCol, [sd * 0.14, -0.035, 0.52], [1, 0.72, 1.45])); // shoe
        b.push(P('sph', [0.1], shade(footCol, 1.35), [sd * 0.14, -0.015, 0.6], [0.85, 0.6, 0.7])); // toe cap
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
      case 'nib': {
        headR = 0.3;
        b.push(P('box', [0.44, 0.38, 0.36], c.primary, [0, 0.25, 0]));
        b.push(P('box', [0.46, 0.09, 0.38], c.secondary, [0, 0.09, 0]));
        for (let i = 0; i < 5; i++) b.push(P('sph', [0.09 - i * 0.004, 6, 5], i % 2 ? 0x3a3a3a : c.skin, [0, 0.2 + i * 0.12, -0.3 - Math.sin(i * 0.7) * 0.1]));
        limbs(c.skin, c.skin, 0x6a4a2a, c.skin);
        h.push(P('sph', [headR, 12, 9], c.skin));
        h.push(P('sph', [0.17, 8, 6], 0xf2e8d0, [0, -0.1, 0.18], [1.2, 0.85, 1]));
        h.push(P('sph', [0.05, 6, 5], DARK, [0, -0.03, 0.33], [1.3, 1, 1]));
        for (const sd of [-1, 1]) {
          h.push(P('sph', [0.15, 8, 6], c.skin, [sd * 0.33, 0.02, -0.02], [0.45, 1, 1]));
          h.push(P('sph', [0.09, 7, 5], 0xf2c8b0, [sd * 0.36, 0.02, 0.0], [0.4, 1, 1]));
        }
        h.push(P('sph', [0.34, 10, 7], c.secondary, [0, 0.1, -0.04], [1, 0.62, 1.02]));
        h.push(P('box', [0.3, 0.04, 0.22], c.secondary, [0, 0.1, 0.32], [1, 1, 1], [-0.25, 0, 0]));
        h.push(P('sph', [0.07, 6, 5], c.accent, [0, 0.12, 0.2]));
        h.push(P('cone', [0.07, 0.3, 4], 0x7ad05a, [0.08, 0.36, -0.04], [1, 1, 1], [0, 0, -0.45]));
        h.push(P('cone', [0.06, 0.24, 4], 0xe8602a, [-0.05, 0.36, -0.06], [1, 1, 1], [0, 0, 0.5]));
        eyes(h, 0.11, 0.0, 0.27, 0.06);
        break;
      }
      case 'krik': {
        headR = 0.3;
        b.push(P('sph', [0.42, 9, 6], c.secondary, [0, 0.4, -0.22], [1, 0.8, 0.75]));
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
          b.push(P('cone', [0.09, 0.3, 4], c.accent, [dx * 0.26, 0.62, -0.22 + dz * 0.2], [1, 1, 1], lean(dx, dz, 0.5)));
        }
        b.push(P('box', [0.46, 0.38, 0.38], c.primary, [0, 0.26, 0.04]));
        b.push(P('box', [0.3, 0.26, 0.08], 0xf6e8c8, [0, 0.26, 0.25]));
        limbs(c.skin, 0x2a3a6a, DARK, c.skin);
        h.push(P('sph', [headR, 12, 9], c.skin));
        h.push(P('cyl', [0.31, 0.31, 0.1, 12], c.accent, [0, 0.13, 0]));
        for (const sd of [-1, 1]) h.push(P('cone', [0.06, 0.2, 4], 0xf6e8c8, [sd * 0.1, 0.33, -0.02], [1, 1, 1], [0, 0, -sd * 0.35]));
        h.push(P('cone', [0.07, 0.25, 4], c.accent, [0.05, 0.1, -0.4], [1, 1, 1], [-HP - 0.3, 0, 0.3]));
        h.push(P('cone', [0.07, 0.25, 4], c.accent, [-0.1, 0.0, -0.38], [1, 1, 1], [-HP - 0.1, 0, -0.5]));
        h.push(P('sph', [0.12, 7, 5], 0xf6e8c8, [0, -0.12, 0.22], [1.3, 0.7, 1]));
        eyes(h, 0.11, 0.0, 0.275, 0.06);
        break;
      }
      case 'volt': {
        headR = 0.28;
        b.push(P('cyl', [0.09, 0.09, 0.3, 6], c.skin, [0, 0.55, 0]));
        b.push(P('box', [0.38, 0.5, 0.32], c.primary, [0, 0.3, 0]));
        b.push(P('box', [0.4, 0.07, 0.34], c.secondary, [0, 0.07, 0]));
        b.push(P('box', [0.12, 0.05, 0.05], c.accent, [0.03, 0.4, 0.17], [1, 1, 1], [0, 0, -0.7]));
        b.push(P('box', [0.1, 0.05, 0.05], c.accent, [-0.03, 0.3, 0.17], [1, 1, 1], [0, 0, 0.7]));
        b.push(P('box', [0.12, 0.05, 0.05], c.accent, [0.03, 0.2, 0.17], [1, 1, 1], [0, 0, -0.7]));
        for (const sd of [-1, 1]) {
          b.push(P('box', [0.1, 0.1, 0.52], c.primary, [sd * 0.27, 0.34, 0.24], [1, 1, 1], [0.35, 0, 0]));
          b.push(P('sph', [0.1, 6, 5], c.secondary, [sd * 0.27, 0.29, 0.5]));
          b.push(P('box', [0.13, 0.13, 0.5], c.secondary, [sd * 0.12, 0.04, 0.3]));
          b.push(P('box', [0.17, 0.12, 0.2], DARK, [sd * 0.12, -0.04, 0.58]));
        }
        h.push(P('sph', [headR, 12, 9], c.skin, [0, -0.02, 0], [0.85, 1.12, 0.9]));
        h.push(P('cone', [0.1, 0.26, 5], c.skin, [0, -0.28, 0.12], [1, 1, 1], [HP * 0.2 + 3.14, 0, 0]));
        h.push(P('cone', [0.04, 0.2, 4], c.skin, [0, -0.03, 0.3], [1, 1, 1], [HP, 0, 0]));
        h.push(P('sph', [0.31, 10, 7], c.accent, [0, 0.15, 0.0], [0.9, 0.7, 1.0]));
        h.push(P('box', [0.42, 0.05, 0.4], c.accent, [0, 0.12, 0.0]));
        h.push(P('box', [0.07, 0.2, 0.04], c.primary, [0.03, 0.27, 0.27], [1, 1, 1], [0, 0, -0.5]));
        h.push(P('box', [0.07, 0.15, 0.04], c.primary, [-0.01, 0.2, 0.28], [1, 1, 1], [0, 0, 0.5]));
        h.push(P('box', [0.34, 0.1, 0.06], c.secondary, [0, 0.05, 0.25]));
        for (const sd of [-1, 1]) h.push(P('sph', [0.06, 7, 5], 0xc8f8ff, [sd * 0.085, 0.05, 0.27]));
        h.push(P('box', [0.1, 0.03, 0.05], 0x5a2a1a, [0, -0.17, 0.2]));
        break;
      }
      case 'vex': {
        headR = 0.33;
        b.push(P('box', [0.72, 0.46, 0.46], c.primary, [0, 0.27, 0]));
        b.push(P('box', [0.74, 0.1, 0.48], c.secondary, [0, 0.08, 0]));
        b.push(P('box', [0.16, 0.12, 0.05], c.accent, [0, 0.08, 0.25]));
        b.push(P('box', [0.08, 0.2, 0.05], c.accent, [0.1, 0.34, 0.25], [1, 1, 1], [0, 0, -0.5]));
        for (const sd of [-1, 1]) {
          b.push(P('sph', [0.2, 7, 5], c.secondary, [sd * 0.4, 0.46, -0.02]));
          b.push(P('cone', [0.07, 0.22, 4], c.accent, [sd * 0.46, 0.62, -0.02], [1, 1, 1], [0, 0, -sd * 0.8]));
          b.push(P('box', [0.24, 0.24, 0.42], c.primary, [sd * 0.46, 0.32, 0.2], [1, 1, 1], [0.35, 0, 0]));
          b.push(P('sph', [0.14, 7, 6], c.skin, [sd * 0.46, 0.26, 0.45]));
          b.push(P('box', [0.22, 0.2, 0.42], c.secondary, [sd * 0.17, 0.04, 0.27]));
          b.push(P('box', [0.24, 0.14, 0.22], DARK, [sd * 0.17, -0.04, 0.5]));
        }
        h.push(P('sph', [headR, 12, 9], c.skin, [0, 0, 0], [1.15, 0.92, 1.0]));
        h.push(P('box', [0.3, 0.22, 0.15], c.skin, [0, -0.14, 0.2]));
        for (let i = 0; i < 5; i++) h.push(P('cone', [0.07, 0.3, 4], c.accent, [0, 0.3 - Math.abs(i - 2) * 0.02, -0.14 + i * 0.1], [1, 1, 1], [i % 2 ? -0.4 : 0.4, 0, 0]));
        h.push(P('box', [0.56, 0.1, 0.14], c.secondary, [0, 0.11, 0.26]));
        for (const sd of [-1, 1]) {
          h.push(P('cyl', [0.09, 0.09, 0.06, 8], c.accent, [sd * 0.14, 0.12, 0.34], [1, 1, 1], [HP, 0, 0]));
          h.push(P('box', [0.17, 0.05, 0.05], 0x2a1a10, [sd * 0.13, 0.2, 0.32], [1, 1, 1], [0, 0, sd * 0.4]));
        }
        h.push(P('box', [0.3, 0.07, 0.06], 0xffffff, [0, -0.13, 0.28]));
        break;
      }
      case 'shelby':
      case 'swoop': {
        const sw = id === 'swoop';
        headR = 0.3;
        b.push(P('sph', [0.5, 9, 6], c.primary, [0, 0.42, -0.2], [1, 0.78, 0.9]));
        b.push(P('sph', [0.52, 9, 4], c.secondary, [0, 0.2, -0.2], [1, 0.2, 0.95]));
        for (let i = 0; i < 3; i++) b.push(P('box', [0.16, 0.05, 0.16], shade(c.primary, 1.4), [(i - 1) * 0.2, 0.7 - Math.abs(i - 1) * 0.05, -0.2]));
        b.push(P('box', [0.5, 0.4, 0.4], sw ? 0xfff0f8 : c.skin, [0, 0.26, 0.05]));
        b.push(P('box', [0.34, 0.3, 0.08], c.secondary, [0, 0.26, 0.26]));
        if (sw) for (const sd of [-1, 1]) {
          b.push(P('sph', [0.32, 8, 5], c.accent, [sd * 0.4, 0.66, -0.34], [0.9, 0.12, 0.45], [0, sd * 0.3, -sd * 0.55]));
          b.push(P('sph', [0.2, 8, 5], 0xffc8e0, [sd * 0.6, 0.78, -0.4], [0.8, 0.1, 0.4], [0, sd * 0.3, -sd * 0.55]));
          b.push(P('sph', [0.12, 6, 5], c.secondary, [sd * 0.2, 0.5, -0.3]));
        }
        limbs(c.skin, c.skin, c.secondary, c.skin);
        h.push(P('sph', [headR, 12, 9], c.skin));
        h.push(P('sph', [0.15, 8, 6], c.skin, [0, -0.08, 0.26], [1.3, 0.75, 1.0]));
        h.push(P('sph', [0.06, 6, 5], DARK, [0.05, -0.04, 0.37]));
        h.push(P('sph', [0.06, 6, 5], DARK, [-0.05, -0.04, 0.37]));
        for (const sd of [-1, 1]) h.push(P('box', [0.14, 0.04, 0.05], 0x3a2418, [sd * 0.11, 0.13, 0.27], [1, 1, 1], [0, 0, sd * 0.3]));
        if (sw) {
          h.push(P('cone', [0.09, 0.3, 4], c.accent, [0, 0.38, 0.04], [1, 1, 1], [0.2, 0, 0]));
          for (const sd of [-1, 1]) h.push(P('cone', [0.06, 0.22, 4], c.accent, [sd * 0.14, 0.34, 0.0], [1, 1, 1], [0.15, 0, -sd * 0.3]));
          for (const sd of [-1, 1]) h.push(P('cyl', [0.1, 0.1, 0.06, 8], 0x35e0ff, [sd * 0.12, 0.05, 0.28], [1, 1, 1], [HP, 0, 0]));
        } else {
          h.push(P('sph', [0.33, 10, 7], c.primary, [0, 0.1, -0.06], [1, 0.45, 1.0]));
          h.push(P('box', [0.5, 0.05, 0.1], c.secondary, [0, 0.14, 0.22]));
          for (const sd of [-1, 1]) h.push(P('cone', [0.06, 0.18, 4], c.secondary, [sd * 0.22, 0.28, -0.06], [1, 1, 1], [0, 0, -sd * 0.5]));
        }
        eyes(h, 0.11, 0.04, 0.265, 0.06);
        break;
      }
      case 'bitsy':
      case 'bop': {
        const bt = id === 'bitsy';
        headR = 0.37;
        b.push(P('sph', [0.27, 9, 7], c.primary, [0, 0.22, 0], [1.05, 1, 0.95]));
        b.push(P('sph', [0.2, 7, 5], c.secondary, [0, 0.2, 0.15], [1, 1, 0.5]));
        b.push(P('sph', [0.07, 6, 5], c.accent, [0, 0.36, 0.22]));
        limbs(c.primary, c.primary, 0xffffff, c.skin, 0.8);
        h.push(P('sph', [headR, 12, 9], c.skin, [0, 0, 0], [1.05, 0.98, 1]));
        for (const sd of [-1, 1]) h.push(P('sph', [0.08, 6, 5], 0xff9a9a, [sd * 0.24, -0.1, 0.28], [1, 0.6, 0.4]));
        h.push(P('sph', [0.07, 6, 5], c.accent, [0, -0.15, 0.34], [1, 0.7, 0.6]));
        if (bt) {
          h.push(P('sph', [0.41, 10, 8], c.secondary, [0, 0.08, -0.1], [1, 0.9, 0.95]));
          for (let i = 0; i < 7; i++) { const a = Math.PI * 0.15 + (i / 6) * Math.PI * 0.7; h.push(P('sph', [0.075, 6, 5], 0xffffff, [Math.cos(a) * 0.37, 0.2 + Math.sin(a) * 0.1, 0.22 - (i % 2) * 0.03], [1, 1, 0.8])); }
          for (const sd of [-1, 1]) h.push(P('sph', [0.07, 6, 5], 0xffffff, [sd * 0.38, -0.12, 0.0]));
          h.push(P('sph', [0.1, 7, 5], c.accent, [0.1, 0.4, 0.1], [1.4, 0.8, 0.8]));
          h.push(P('sph', [0.1, 7, 5], c.accent, [-0.1, 0.4, 0.1], [1.4, 0.8, 0.8]));
          h.push(P('sph', [0.05, 6, 5], 0xfff0a0, [0, 0.4, 0.1]));
          h.push(P('cyl', [0.05, 0.05, 0.04, 8], c.accent, [0, -0.15, 0.37], [1, 1, 1], [HP, 0, 0]));
        } else {
          h.push(P('sph', [0.385, 10, 7], c.secondary, [0, 0.1, -0.02], [1, 0.62, 1]));
          for (const sd of [-1, 0, 1]) h.push(P('box', [0.09, 0.02, 0.5], c.accent, [sd * 0.14, 0.34 - Math.abs(sd) * 0.03, -0.02], [1, 1, 1], [0, 0, -sd * 0.35]));
          h.push(P('cyl', [0.03, 0.03, 0.14, 5], DARK, [0, 0.48, 0]));
          h.push(P('box', [0.5, 0.03, 0.1], c.accent, [0, 0.56, 0], [1, 1, 1], [0, 0.5, 0.1]));
          h.push(P('box', [0.5, 0.03, 0.1], c.accent, [0, 0.56, 0], [1, 1, 1], [0, -0.9, -0.1]));
          h.push(P('sph', [0.1, 6, 5], 0xff9a8a, [0, -0.2, 0.3], [1.3, 0.5, 0.6]));
        }
        eyes(h, 0.13, 0.03, 0.335, 0.07);
        break;
      }
      case 'spud': {
        headR = 0.34;
        b.push(P('sph', [0.33, 9, 7], c.primary, [0, 0.24, 0], [1.05, 0.95, 0.95]));
        b.push(P('sph', [0.22, 8, 6], c.secondary, [0, 0.2, 0.16], [1, 1, 0.5]));
        for (const sd of [-1, 1]) {
          b.push(P('box', [0.17, 0.17, 0.42], c.skin, [sd * 0.38, 0.32, 0.2], [1, 1, 1], [0.35, 0, 0]));
          b.push(P('sph', [0.11, 6, 5], c.skin, [sd * 0.38, 0.27, 0.45]));
          b.push(P('box', [0.2, 0.18, 0.42], c.primary, [sd * 0.15, 0.04, 0.27]));
          b.push(P('sph', [0.15, 6, 5], 0x5a3a1a, [sd * 0.15, -0.02, 0.52], [1, 0.6, 1.4]));
        }
        h.push(P('sph', [headR, 12, 9], c.skin, [0, 0, 0], [1.12, 1.0, 0.98]));
        for (const q of [[0.22, 0.12, 0.22], [-0.24, -0.1, 0.2], [0.1, 0.24, 0.2], [-0.12, 0.2, 0.26], [0.27, -0.12, 0.14]])
          h.push(P('sph', [0.045, 5, 4], 0x8a5e2c, q, [1, 1, 0.5]));
        for (const sd of [-1, 1]) h.push(P('sph', [0.07, 6, 5], 0xff9a8a, [sd * 0.24, -0.1, 0.25], [1, 0.6, 0.4]));
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + 0.4, dx = Math.cos(a), dz = Math.sin(a);
          h.push(P('sph', [0.12, 7, 5], i % 2 ? 0x7ad05a : c.accent, [dx * 0.1, 0.42, dz * 0.1], [0.5, 1.3, 0.3], lean(dx, dz, 0.6)));
        }
        h.push(P('cone', [0.06, 0.22, 4], 0x4a8a3a, [0, 0.36, 0], [1, 1, 1], [0, 0, 0]));
        eyes(h, 0.12, 0.03, 0.31, 0.06);
        h.push(P('sph', [0.05, 6, 5], 0x6a3a1a, [0, -0.1, 0.33], [1.6, 0.6, 0.5]));
        break;
      }
      case 'sprout': {
        headR = 0.31;
        b.push(P('sph', [0.27, 9, 7], c.primary, [0, 0.24, 0]));
        b.push(P('box', [0.3, 0.22, 0.1], 0x3a8a3a, [0, 0.24, 0.22]));
        for (const sd of [-1, 1]) {
          b.push(P('box', [0.13, 0.13, 0.42], c.skin, [sd * 0.3, 0.32, 0.2], [1, 1, 1], [0.35, 0, 0]));
          b.push(P('sph', [0.09, 6, 5], c.skin, [sd * 0.3, 0.27, 0.45]));
          b.push(P('box', [0.16, 0.15, 0.42], c.skin, [sd * 0.12, 0.04, 0.27]));
          b.push(P('box', [0.2, 0.14, 0.22], c.secondary, [sd * 0.12, -0.04, 0.5]));
        }
        h.push(P('sph', [headR, 12, 9], c.skin, [0, 0, 0], [0.98, 1.1, 0.98]));
        h.push(P('sph', [0.3, 10, 7], c.secondary, [0, 0.12, 0.0], [1, 0.62, 1]));
        for (const sd of [-1, 1]) {
          h.push(P('sph', [0.07, 6, 5], 0xff7ab0, [sd * 0.24, -0.1, 0.22], [1, 0.6, 0.4]));
          for (let j = 0; j < 3; j++) h.push(P('sph', [0.1, 7, 5], j % 2 ? 0x7ad05a : c.accent, [sd * (0.32 + j * 0.06), 0.02 - j * 0.1, -0.02], [1.6, 0.35, 0.8], [0, 0, -sd * (0.35 + j * 0.55)]));
        }
        for (const lf of [[0, 0.4, 0, 0, 0], [0.1, 0.38, 0.02, 0, -0.5], [-0.1, 0.38, 0.02, 0, 0.5]])
          h.push(P('sph', [0.1, 7, 5], 0x58c04a, [lf[0], lf[1] + 0.06, lf[2]], [0.5, 1.7, 0.3], [0.1, 0, lf[4]]));
        eyes(h, 0.11, 0.0, 0.285, 0.06);
        h.push(P('sph', [0.05, 6, 5], 0x8a2a3a, [0, -0.1, 0.3], [1.4, 0.6, 0.4]));
        break;
      }
      case 'thorn': {
        headR = 0.34;
        b.push(P('sph', [0.46, 9, 7], c.primary, [0, 0.26, -0.02], [1.1, 0.9, 1]));
        b.push(P('sph', [0.3, 8, 6], 0x8fd070, [0, 0.2, 0.2], [1, 1, 0.5]));
        b.push(P('cyl', [0.42, 0.34, 0.1, 10], c.secondary, [0, 0.52, 0]));
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a); b.push(P('sph', [0.15, 6, 5], c.secondary, [dx * 0.4, 0.58, dz * 0.4], [1, 0.3, 1.5], lean(dx, dz, 0.7))); }
        for (const sd of [-1, 1]) {
          b.push(P('box', [0.2, 0.2, 0.44], c.primary, [sd * 0.44, 0.32, 0.2], [1, 1, 1], [0.35, 0, 0]));
          b.push(P('cone', [0.06, 0.2, 4], c.accent, [sd * 0.55, 0.38, 0.2], [1, 1, 1], [0, 0, -sd * 1.3]));
          b.push(P('sph', [0.14, 7, 6], c.skin, [sd * 0.44, 0.26, 0.46]));
          b.push(P('box', [0.22, 0.2, 0.42], c.primary, [sd * 0.17, 0.04, 0.27]));
          b.push(P('box', [0.24, 0.14, 0.22], 0x5a3a22, [sd * 0.17, -0.04, 0.5]));
        }
        h.push(P('sph', [headR, 12, 9], c.skin, [0, 0.07, 0], [1.2, 0.75, 1.05]));
        h.push(P('sph', [0.3, 10, 7], c.secondary, [0, -0.1, 0.06], [1.15, 0.5, 1.05]));
        h.push(P('sph', [0.2, 8, 6], 0x7a1428, [0, -0.04, 0.22], [1.3, 0.5, 0.7]));
        for (let i = 0; i < 6; i++) {
          const x = (i - 2.5) * 0.095;
          h.push(P('cone', [0.035, 0.12, 4], c.accent, [x, -0.01, 0.31], [1, 1, 1], [Math.PI, 0, 0]));
          h.push(P('cone', [0.035, 0.12, 4], c.accent, [x, -0.1, 0.31], [1, 1, 1], [0, 0, 0]));
        }
        for (const sd of [-1, 1]) {
          h.push(P('sph', [0.1, 8, 6], WHITE, [sd * 0.17, 0.26, 0.15]));
          h.push(P('sph', [0.055, 7, 5], DARK, [sd * 0.17, 0.26, 0.23]));
          h.push(P('box', [0.17, 0.04, 0.06], 0x1a4a22, [sd * 0.17, 0.36, 0.2], [1, 1, 1], [0, 0, sd * 0.4]));
          h.push(P('sph', [0.05, 6, 5], c.accent, [sd * 0.3, 0.16, 0.0]));
        }
        for (let i = 0; i < 5; i++) { const a = Math.PI * (0.15 + i * 0.175); h.push(P('cone', [0.07, 0.3, 4], c.secondary, [Math.cos(a) * 0.3, 0.12 + Math.sin(a) * 0.2, -0.28], [1, 1, 1], [-0.9, 0, -Math.cos(a) * 0.6])); }
        break;
      }
      case 'wisp': {
        headR = 0.34;
        b.push(P('sph', [0.46, 11, 8], c.primary, [0, 0.25, -0.02], [1.08, 0.92, 1]));
        b.push(P('sph', [0.3, 8, 6], 0xffffff, [0, 0.2, 0.2], [1, 1, 0.5]));
        for (let i = 0; i < 3; i++) b.push(P('cone', [0.17 - i * 0.03, 0.4, 6], c.primary, [0, 0.12 - i * 0.04, -0.4 - i * 0.18], [1, 1, 1], [-HP - 0.4 + i * 0.1, 0, 0]));
        for (const sd of [-1, 1]) {
          b.push(P('sph', [0.14, 7, 6], c.primary, [sd * 0.44, 0.3, 0.22], [0.9, 1, 1.4]));
          b.push(P('sph', [0.1, 7, 6], c.secondary, [sd * 0.44, 0.26, 0.42]));
          b.push(P('sph', [0.2, 7, 6], c.primary, [sd * 0.17, 0.02, 0.3], [1, 0.7, 1.4]));
        }
        h.push(P('sph', [headR, 12, 9], c.skin, [0, 0, 0], [1.2, 1.05, 1.05]));
        for (const sd of [-1, 1]) {
          h.push(P('sph', [0.07, 7, 5], 0xffa0c0, [sd * 0.25, -0.08, 0.27], [1, 0.6, 0.4]));
          h.push(P('sph', [0.075, 8, 6], DARK, [sd * 0.13, 0.05, 0.32], [1, 1.3, 0.8]));
          h.push(P('sph', [0.03, 5, 4], WHITE, [sd * 0.12, 0.09, 0.37]));
        }
        h.push(P('sph', [0.12, 8, 6], 0x5a2a6a, [0, -0.1, 0.3], [1.3, 0.8, 0.5]));
        h.push(P('sph', [0.06, 6, 5], 0xff7a9a, [0, -0.13, 0.33], [1.3, 0.8, 0.5]));
        h.push(P('cyl', [0.24, 0.27, 0.07, 10], c.secondary, [0, 0.31, 0]));
        const fl = [[0, 0.62, 0.3, 0xdffbff], [-0.16, 0.5, 0.22, c.accent], [0.16, 0.5, 0.22, c.accent], [-0.08, 0.57, 0.26, 0x9fefff], [0.08, 0.57, 0.26, 0x9fefff]];
        fl.forEach((f, i) => h.push(P('cone', [0.07 + (i < 1 ? 0.01 : 0), f[2], 6], f[3], [f[0], f[1] - 0.02, 0], [1, 1, 1], [0, 0, -f[0] * 1.6])));
        break;
      }
    }
    // shared face features (skip characters that already have snouts / beaks / custom mouths)
    const NOSE = { blaze: 1, ember: 1, rosa: 1, lily: 1, pop: 1 };
    const MOUTH = { blaze: 1, ember: 1, rosa: 1, lily: 1, nib: 1, krik: 1 };
    const surfZ = (y) => headR * Math.sqrt(Math.max(0.05, 1 - (y / headR) * (y / headR)));
    if (NOSE[id]) h.push(P('sph', [0.05], shade(c.skin, 0.9).lerp(new THREE.Color(0xff8a7a), 0.25), [0, -0.045, surfZ(-0.045) + 0.005], [1, 0.85, 0.8]));
    if (MOUTH[id]) {
      const my = id === 'nib' ? -0.22 : id === 'krik' ? -0.2 : -0.135, mz = surfZ(my) - 0.012;
      h.push(P('sph', [0.075], 0x4a1620, [0, my, mz], [1.25, 0.62, 0.38]));
      h.push(P('sph', [0.04], 0xff7a8a, [0, my - 0.012, mz + 0.004], [1.2, 0.5, 0.3]));
      h.push(P('sph', [0.058], 0xffffff, [0, my + 0.018, mz + 0.006], [1.3, 0.28, 0.22]));
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
    head.position.set(0, 0.8, 0);
    head.scale.setScalar(1.14);
    head.castShadow = true; body.castShadow = true;
    g.add(body, head);
    g.userData.head = head;
    g.userData.bodyMesh = body;
    if (ch.weight === 'heavy') g.scale.setScalar(1.2);
    return g;
  }

  // ---------------------------------------------------------------- karts
  const WHEEL = { light: [0.32, 0.3], medium: [0.35, 0.32], heavy: [0.4, 0.4], any: [0.38, 0.36] };
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
      case 'vine_runner': {
        p.push(P('cyl', [0.3, 0.3, 1.9, 10], 0x8a5a2a, [0, 0.38, 0], [1, 0.9, 1], [HP, 0, 0]));
        p.push(P('cyl', [0.31, 0.31, 0.06, 10], 0xc9a070, [0, 0.38, 0.96], [1, 0.9, 1], [HP, 0, 0]));
        p.push(P('cone', [0.3, 0.6, 5], c, [0, 0.4, 1.25], [1, 0.6, 1], [HP, 0, 0]));
        for (const sd of [-1, 1]) {
          p.push(P('sph', [0.45, 8, 5], c, [sd * 0.5, 0.56, 0.4], [0.6, 0.12, 1.3], [0, 0, sd * 0.35]));
          p.push(P('sph', [0.35, 8, 5], lt, [sd * 0.6, 0.62, -0.5], [0.5, 0.1, 1.1], [0, 0, sd * 0.45]));
          p.push(P('cyl', [0.035, 0.035, 1.0, 5], 0x4a7a2a, [sd * 0.34, 0.74, 0.9], [1, 1, 1], [HP, 0, sd * 0.2]));
          ex.push([sd * 0.25, 0.4, -1.0]); p.push(pipe(sd * 0.25, 0.4, -0.92, 0.3, st));
        }
        for (let i = -2; i <= 2; i++) p.push(P('sph', [0.45, 8, 5], i % 2 ? c : lt, [i * 0.22, 1.1 - Math.abs(i) * 0.06, -1.05], [0.28, 1.0, 0.1], [0, 0, i * 0.28]));
        seatCush(0xc9a070); wheelCol();
        return { p, ex, hub: 0xffd23a };
      }
      case 'shell_skiff': {
        p.push(P('sph', [0.7, 12, 8], c, [0, 0.4, 0.0], [0.82, 0.42, 1.5]));
        p.push(P('sph', [0.72, 12, 4], 0xe8f4f0, [0, 0.55, 0.0], [0.86, 0.1, 1.54]));
        p.push(P('cone', [0.3, 0.6, 5], 0xe8f4f0, [0, 0.5, 1.4], [1, 0.4, 1], [HP, Math.PI / 5, 0]));
        for (let i = 0; i < 3; i++) p.push(P('box', [0.5 - i * 0.05, 0.05, 0.22], lt, [0, 0.62, 0.9 - i * 0.35]));
        for (const sd of [-1, 1]) {
          p.push(P('box', [0.06, 0.4, 0.5], lt, [sd * 0.45, 0.82, -1.05], [1, 1, 1], [-0.3, 0, sd * 0.2]));
          p.push(P('sph', [0.1, 6, 5], 0xffb03a, [sd * 0.3, 0.45, 1.2]));
          ex.push([sd * 0.28, 0.4, -1.1]); p.push(pipe(sd * 0.28, 0.4, -1.02, 0.3, st));
        }
        seatCush(0xe8f4f0); wheelCol();
        return { p, ex, hub: 0xffb03a };
      }
      case 'wing_glider': {
        p.push(P('box', [0.5, 0.2, 2.1], c, [0, 0.34, 0]));
        p.push(P('cone', [0.26, 0.9, 5], lt, [0, 0.36, 1.45], [1, 0.6, 1], [HP, 0, 0]));
        for (const sd of [-1, 1]) {
          p.push(P('box', [1.0, 0.05, 0.62], lt, [sd * 0.95, 0.86, 0.25], [1, 1, 1], [0, sd * -0.12, sd * 0.12]));
          p.push(P('box', [0.5, 0.05, 0.5], 0xffffff, [sd * 1.5, 0.98, 0.3], [1, 1, 1], [0, sd * -0.12, sd * 0.2]));
          p.push(P('box', [0.06, 0.5, 0.08], st, [sd * 0.5, 0.62, 0.25]));
          p.push(P('box', [0.5, 0.05, 0.3], c, [sd * 0.5, 0.9, -1.1]));
          p.push(pipe(sd * 0.28, 0.4, -1.02, 0.3, st)); ex.push([sd * 0.28, 0.4, -1.2]);
        }
        p.push(P('box', [0.07, 0.7, 0.5], c, [0, 1.0, -1.1], [1, 1, 1], [-0.25, 0, 0]));
        p.push(P('box', [1.0, 0.05, 0.3], 0xffffff, [0, 0.55, 1.0]));
        seatCush(0xffffff); wheelCol();
        return { p, ex, hub: 0xffffff };
      }
      case 'tater_trolley': {
        p.push(P('sph', [0.6, 10, 7], c, [0, 0.42, 0.55], [1.0, 0.6, 1.1]));
        p.push(P('sph', [0.66, 10, 7], dk, [0, 0.42, -0.35], [0.95, 0.58, 1.15]));
        p.push(P('box', [1.0, 0.14, 1.9], 0x6a4a2a, [0, 0.26, 0]));
        for (const q of [[0.3, 0.62, 0.9], [-0.35, 0.58, 0.55], [0.1, 0.66, 0.2], [-0.2, 0.7, -0.4], [0.4, 0.64, -0.5], [-0.45, 0.55, -0.9]])
          p.push(P('sph', [0.07, 5, 4], 0x6a4a22, q, [1, 0.6, 1]));
        for (const sd of [-1, 1]) {
          p.push(P('sph', [0.22, 6, 5], 0x6ac04a, [sd * 0.3, 0.78, 1.0], [0.5, 1.4, 0.3], [0.3, 0, sd * 0.4]));
          p.push(P('sph', [0.12, 7, 5], 0xfff2a0, [sd * 0.35, 0.5, 1.05]));
          ex.push([sd * 0.3, 0.45, -1.2]); p.push(pipe(sd * 0.3, 0.45, -1.1, 0.34, st));
        }
        p.push(P('sph', [0.3, 7, 5], 0x6ac04a, [0, 1.15, -1.05], [0.3, 1.2, 0.1]));
        seatCush(0xe8cc92); wheelCol();
        return { p, ex, hub: 0x6ac04a };
      }
      case 'leaf_lark': {
        p.push(P('sph', [0.8, 12, 5], c, [0, 0.36, 0.0], [0.7, 0.15, 1.3]));
        p.push(P('box', [0.08, 0.06, 2.0], lt, [0, 0.5, 0.0]));
        p.push(P('cone', [0.25, 0.7, 4], lt, [0, 0.38, 1.4], [1, 0.3, 1], [HP, Math.PI / 4, 0]));
        p.push(P('sph', [0.9, 10, 5], 0x4aa84a, [0, 1.15, -1.0], [0.8, 0.05, 0.55], [-0.9, 0, 0]));
        p.push(P('box', [0.06, 0.6, 0.06], st, [0, 0.8, -0.95]));
        for (const sd of [-1, 1]) {
          p.push(P('sph', [0.3, 7, 4], lt, [sd * 0.55, 0.52, 0.5], [0.5, 0.1, 1.3], [0, sd * -0.15, sd * 0.25]));
          p.push(P('sph', [0.1, 6, 5], 0xfff0a0, [sd * 0.3, 0.42, 1.15]));
          p.push(P('cone', [0.04, 0.4, 4], 0x4aa84a, [sd * 0.2, 0.55, 1.45], [1, 1, 1], [HP - 0.3, 0, sd * 0.4]));
          ex.push([sd * 0.25, 0.4, -1.0]); p.push(pipe(sd * 0.25, 0.4, -0.95, 0.3, st));
        }
        seatCush(0xdff8c8); wheelCol();
        return { p, ex, hub: 0xffffff };
      }
      case 'blossom_cruiser': {
        p.push(P('box', [0.95, 0.2, 2.1], dk, [0, 0.28, 0]));
        p.push(P('box', [0.85, 0.3, 1.0], c, [0, 0.42, 0.7]));
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; p.push(P('sph', [0.22, 7, 5], i % 2 ? lt : 0xffffff, [Math.cos(a) * 0.26, 0.66 + Math.sin(a) * 0.04, 0.85 + Math.sin(a) * 0.26], [1, 0.3, 1], [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4])); }
        p.push(P('sph', [0.12, 7, 5], 0xffd84a, [0, 0.7, 0.85]));
        for (const sd of [-1, 1]) {
          p.push(P('sph', [0.35, 8, 5], c, [sd * 0.55, 0.45, -0.2], [0.35, 0.5, 1.7]));
          p.push(P('sph', [0.3, 8, 6], lt, [sd * 0.22, 1.2, -1.0], [0.55, 1.0, 0.18], [0, 0, sd * 0.5]));
          p.push(P('sph', [0.1, 6, 5], 0xfff2b0, [sd * 0.35, 0.5, 1.2]));
          p.push(pipe(sd * 0.3, 0.45, -1.02, 0.3, st)); ex.push([sd * 0.3, 0.45, -1.2]);
        }
        p.push(P('box', [0.8, 0.07, 0.1], 0xffffff, [0, 0.35, 1.25]));
        seatCush(0xfff0f5); wheelCol();
        return { p, ex, hub: 0xffd84a };
      }
      case 'garden_gig': {
        p.push(P('box', [1.0, 0.14, 2.0], 0x5a4a6a, [0, 0.26, 0]));
        p.push(P('box', [1.05, 0.3, 0.7], c, [0, 0.46, 0.8], [1, 1, 1], [-0.12, 0, 0]));
        p.push(P('box', [0.9, 0.06, 0.1], 0xfff0f5, [0, 0.64, 1.1]));
        for (const sd of [-1, 1]) {
          p.push(P('box', [0.07, 0.28, 1.5], c, [sd * 0.52, 0.5, -0.2]));
          for (let i = 0; i < 4; i++) p.push(P('box', [0.05, 0.4, 0.05], lt, [sd * 0.52, 0.8, -0.9 + i * 0.45]));
          p.push(P('box', [0.06, 1.0, 0.06], 0xffffff, [sd * 0.52, 1.0, -1.05]));
          p.push(P('sph', [0.14, 6, 5], 0x6fc06a, [sd * 0.52, 0.8, -0.5], [0.6, 1.2, 0.8]));
          p.push(P('sph', [0.14, 6, 5], 0x6fc06a, [sd * 0.5, 0.98, -1.05], [0.6, 1.2, 0.8]));
          p.push(P('sph', [0.12, 6, 5], 0x6fc06a, [sd * 0.3, 0.7, 0.9], [1.2, 0.5, 0.8]));
          p.push(P('sph', [0.07, 6, 5], 0xff7eb6, [sd * 0.54, 1.1, -1.05]));
          p.push(pipe(sd * 0.3, 0.4, -1.04, 0.3, st)); ex.push([sd * 0.3, 0.4, -1.2]);
        }
        p.push(P('box', [1.1, 0.08, 0.12], 0xffffff, [0, 1.5, -1.05]));
        p.push(P('sph', [0.5, 8, 4], lt, [0, 1.45, -1.05], [1.0, 0.45, 0.3]));
        p.push(P('sph', [0.1, 6, 5], 0xffe05a, [0, 1.6, -1.05]));
        seatCush(0xe8dcff); wheelCol();
        return { p, ex, hub: 0xffffff };
      }
      case 'egg_racer': {
        p.push(P('sph', [0.72, 12, 8], c, [0, 0.5, -0.1], [0.85, 0.5, 1.4]));
        for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; p.push(P('cone', [0.1, 0.22, 4], 0xfff1d0, [Math.sin(a) * 0.58, 0.82, -0.1 + Math.cos(a) * 1.0], [1, 1, 1], [0, 0, 0])); }
        p.push(P('sph', [0.5, 10, 7], lt, [0, 0.42, 0.9], [0.95, 0.6, 0.9]));
        for (const q of [[0.2, 0.62, 1.0], [-0.25, 0.6, 0.8], [0.0, 0.68, 0.6]]) p.push(P('sph', [0.1, 6, 5], 0xff5a3a, q, [1, 0.4, 1]));
        for (const sd of [-1, 1]) {
          p.push(P('box', [0.5, 0.05, 0.4], 0xfff1d0, [sd * 0.7, 0.9, -1.0], [1, 1, 1], [0, 0, sd * 0.4]));
          p.push(P('sph', [0.1, 6, 5], 0xfff09a, [sd * 0.32, 0.45, 1.3]));
          p.push(pipe(sd * 0.28, 0.4, -1.1, 0.3, st)); ex.push([sd * 0.28, 0.4, -1.28]);
        }
        seatCush(0xfff1d0); wheelCol();
        return { p, ex, hub: 0xff5a3a };
      }
      case 'bolt_brute': {
        p.push(P('box', [1.2, 0.3, 2.1], 0x2a2a38, [0, 0.34, 0]));
        p.push(P('box', [1.1, 0.62, 0.9], c, [0, 0.62, 0.8]));
        p.push(P('box', [1.14, 0.08, 0.96], lt, [0, 0.96, 0.8]));
        for (const sd of [-1, 1]) {
          p.push(P('cyl', [0.09, 0.09, 0.6, 6], 0x2a2a38, [sd * 0.36, 1.25, 0.8]));
          p.push(P('sph', [0.15, 7, 5], 0xb4ff3a, [sd * 0.36, 1.58, 0.8]));
          p.push(P('cone', [0.1, 0.34, 4], 0xb4ff3a, [sd * 0.64, 0.55, 1.35], [1, 1, 1], [HP, 0, 0]));
          p.push(P('box', [0.1, 0.34, 1.5], c, [sd * 0.58, 0.62, -0.2]));
          p.push(P('cyl', [0.06, 0.06, 0.9, 6], 0x2a2a38, [sd * 0.45, 0.82, -1.0]));
          p.push(P('sph', [0.12, 7, 5], 0xb4ff3a, [sd * 0.45, 1.3, -1.0]));
          p.push(pipe(sd * 0.3, 0.5, -1.06, 0.34, st)); ex.push([sd * 0.3, 0.5, -1.24]);
        }
        p.push(P('box', [0.2, 0.16, 0.06], 0xb4ff3a, [0.1, 0.72, 1.27], [1, 1, 1], [0, 0, -0.6]));
        p.push(P('box', [0.2, 0.16, 0.06], 0xb4ff3a, [-0.1, 0.56, 1.27], [1, 1, 1], [0, 0, -0.6]));
        p.push(P('box', [1.3, 0.14, 0.14], 0x3a3a48, [0, 0.32, 1.25]));
        p.push(P('box', [0.1, 0.3, 0.14], 0xb4ff3a, [0.4, 0.32, 1.25]));
        p.push(P('box', [0.1, 0.3, 0.14], 0xb4ff3a, [-0.4, 0.32, 1.25]));
        p.push(P('box', [1.14, 0.7, 0.4], dk, [0, 0.6, -0.65]));
        p.push(P('box', [0.1, 0.5, 0.5], 0xb4ff3a, [0, 1.2, -1.0], [1, 1, 1], [-0.3, 0, 0.3]));
        p.push(P('box', [0.6, 0.12, 0.5], 0x2a2a36, [0, 0.46, 0.15]));
        p.push(P('box', [0.6, 0.12, 0.4], lt, [0, 0.9, -0.55]));
        wheelCol();
        return { p, ex, hub: 0xb4ff3a };
      }
      case 'bramble_beast': {
        p.push(P('box', [1.15, 0.3, 2.0], 0x4a3220, [0, 0.36, 0]));
        p.push(P('sph', [0.62, 9, 6], c, [0, 0.52, 0.7], [0.95, 0.6, 1.0]));
        p.push(P('box', [1.14, 0.7, 0.5], 0x3a2a1a, [0, 0.55, -0.6]));
        for (let i = 0; i < 6; i++) for (const sd of [-1, 1]) p.push(P('cone', [0.07, 0.34, 4], 0xf0e8c0, [sd * 0.6, 0.6, -0.9 + i * 0.35], [1, 1, 1], [0, 0, -sd * HP * 0.9]));
        for (let i = 0; i < 4; i++) p.push(P('cone', [0.08, 0.3, 4], 0xf0e8c0, [(i - 1.5) * 0.24, 0.9, 0.7]));
        p.push(P('box', [1.2, 0.12, 0.3], 0x7a1428, [0, 0.45, 1.2]));
        for (let i = 0; i < 6; i++) { p.push(P('cone', [0.05, 0.2, 4], 0xf0e8c0, [(i - 2.5) * 0.2, 0.55, 1.34], [1, 1, 1], [Math.PI, 0, 0])); p.push(P('cone', [0.05, 0.2, 4], 0xf0e8c0, [(i - 2.5) * 0.2, 0.37, 1.34])); }
        for (let i = 0; i < 5; i++) { const a = -0.8 + i * 0.4; p.push(P('sph', [0.3, 7, 5], i % 2 ? 0xc02a4a : 0xe84a6a, [Math.sin(a) * 0.7, 1.15, -1.0], [0.4, 1.4, 0.1], [0, 0, -a * 0.9])); }
        for (const sd of [-1, 1]) {
          p.push(P('sph', [0.1, 6, 5], 0xffe04a, [sd * 0.3, 0.7, 1.05]));
          p.push(pipe(sd * 0.38, 0.5, -1.04, 0.34, 0x333340)); ex.push([sd * 0.38, 0.5, -1.22]);
        }
        p.push(P('box', [0.6, 0.12, 0.5], 0x3a2a1a, [0, 0.46, 0.2]));
        p.push(P('box', [0.6, 0.14, 0.4], lt, [0, 0.9, -0.55]));
        wheelCol();
        return { p, ex, hub: 0xc02a4a };
      }
      case 'specter_sedan': {
        p.push(P('sph', [0.8, 12, 8], c, [0, 0.52, 0.0], [0.72, 0.55, 1.35]));
        p.push(P('box', [1.0, 0.18, 1.9], dk, [0, 0.28, 0]));
        p.push(P('sph', [0.45, 10, 7], lt, [0, 0.6, 1.0], [1.0, 0.6, 0.9]));
        for (const sd of [-1, 1]) {
          p.push(P('box', [0.07, 1.1, 0.07], 0x2a2440, [sd * 0.5, 1.0, 0.5]));
          p.push(P('sph', [0.16, 8, 6], 0x6fe3ff, [sd * 0.5, 1.6, 0.5]));
          p.push(P('cone', [0.1, 0.2, 5], 0xdffbff, [sd * 0.5, 1.8, 0.5]));
          p.push(P('box', [0.07, 0.9, 0.07], 0x2a2440, [sd * 0.5, 1.0, -1.05]));
          p.push(P('cone', [0.2, 0.6, 5], dk, [sd * 0.62, 0.55, -0.4], [1, 1, 1], [HP + 0.2, 0, 0]));
          p.push(P('sph', [0.1, 7, 5], 0x6fe3ff, [sd * 0.32, 0.55, 1.25]));
          p.push(pipe(sd * 0.3, 0.5, -1.0, 0.3, 0x2a2440)); ex.push([sd * 0.3, 0.5, -1.2]);
        }
        p.push(P('box', [1.1, 0.1, 0.1], 0x2a2440, [0, 1.55, -1.05]));
        p.push(P('sph', [0.55, 8, 4], c, [0, 1.52, -1.05], [1.0, 0.4, 0.3]));
        for (let i = 0; i < 3; i++) p.push(P('cone', [0.14 - i * 0.03, 0.55, 5], 0xdffbff, [0, 0.4 - i * 0.04, -1.3 - i * 0.2], [1, 1, 1], [-HP - 0.2, 0, 0]));
        seatCush(0xe8e4ff); wheelCol();
        return { p, ex, hub: 0x6fe3ff };
      }
      case 'parade_float': {
        p.push(P('box', [1.3, 0.3, 2.2], 0xe8352e, [0, 0.34, 0]));
        p.push(P('box', [1.34, 0.08, 2.24], 0xffffff, [0, 0.52, 0]));
        p.push(P('box', [1.34, 0.1, 2.24], 0x35a0e8, [0, 0.2, 0]));
        p.push(P('box', [1.2, 0.5, 0.4], 0xff7ac8, [0, 0.8, -0.85]));
        p.push(P('box', [1.0, 0.35, 0.34], 0x7ad05a, [0, 1.25, -0.88]));
        p.push(P('box', [0.8, 0.3, 0.3], 0xffd23a, [0, 1.6, -0.9]));
        p.push(P('cyl', [0.4, 0.4, 0.5, 12], 0xe8352e, [0, 0.82, 1.0]));
        p.push(P('cyl', [0.41, 0.41, 0.06, 12], 0xffffff, [0, 1.08, 1.0]));
        p.push(P('cyl', [0.41, 0.41, 0.06, 12], 0xffd23a, [0, 0.56, 1.0]));
        const bal = [0xff4060, 0x35d3e6, 0xffd23a, 0x7ad05a];
        [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach((s, i) => {
          p.push(P('cyl', [0.03, 0.03, 1.3, 5], 0xf0f0f0, [s[0] * 0.66, 1.05, s[1] * 0.95]));
          p.push(P('sph', [0.22, 8, 6], bal[i], [s[0] * 0.66, 1.88, s[1] * 0.95], [1, 1.2, 1]));
          p.push(P('cone', [0.05, 0.1, 4], bal[i], [s[0] * 0.66, 1.62, s[1] * 0.95], [1, 1, 1], [Math.PI, 0, 0]));
        });
        for (let i = 0; i < 6; i++) p.push(P('cone', [0.1, 0.22, 4], i % 2 ? 0xffd23a : 0xff4060, [-0.66 + i * 0.264, 1.82, 0.95], [1, 1, 1], [Math.PI, 0, 0]));
        p.push(P('box', [0.5, 0.5, 0.08], 0xffd23a, [0, 2.0, -0.9], [1, 1, 1], [0, 0, 0.785]));
        p.push(P('box', [0.5, 0.5, 0.08], 0xffd23a, [0, 2.0, -0.9], [1, 1, 1], [0, 0, 0]));
        for (const sd of [-1, 1]) { p.push(pipe(sd * 0.45, 0.45, -1.08, 0.3, st)); ex.push([sd * 0.45, 0.45, -1.25]); }
        seatCush(0xfff0d0); wheelCol();
        return { p, ex, hub: 0xffd23a };
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
      case 'nib': {
        shoulders(P1, 44);
        for (const sd of [-1, 1]) { ell(x, 64 + sd * 38, 66, 15, 19, SK, '#222'); ell(x, 64 + sd * 38, 66, 8, 12, '#f2c8b0'); }
        ell(x, 64, 70, 34, 32, SK, '#222');
        ell(x, 64, 84, 20, 14, '#f2e8d0', '#222'); ell(x, 64, 78, 6, 4, '#1c1a24');
        eyePair(x, 64, 66, 13, 4.5); smile(x, 64, 86, 8);
        ell(x, 64, 46, 36, 20, S1, '#222'); x.fillStyle = S1; x.fillRect(28, 46, 72, 6);
        poly(x, [30, 54, 98, 54, 108, 60, 30, 60], S1, '#222');
        ell(x, 64, 50, 8, 8, AC, '#222');
        poly(x, [64, 30, 76, 6, 84, 24], '#7ad05a', '#222');
        break;
      }
      case 'krik': {
        shoulders(P1, 46);
        ell(x, 64, 56, 54, 40, S1, '#222');
        for (let i = 0; i < 6; i++) spike(x, 24 + i * 16, 28 + Math.abs(i - 2.5) * 5, -Math.PI / 2 + (i - 2.5) * 0.28, 22, 7, AC);
        ell(x, 64, 74, 31, 30, SK, '#222');
        x.fillStyle = AC; poly(x, [33, 60, 95, 60, 93, 50, 35, 50], AC, '#222');
        for (const q of [[44, 55], [64, 55], [84, 55]]) ell(x, q[0], q[1], 2.5, 2.5, '#fff');
        poly(x, [96, 56, 118, 46, 112, 62, 120, 72, 98, 64], AC, '#222');
        eyePair(x, 64, 72, 12, 4.5); smile(x, 64, 84, 9);
        break;
      }
      case 'volt': {
        shoulders(P1, 40);
        poly(x, [54, 98, 74, 98, 82, 128, 46, 128], P1, '#222');
        ell(x, 64, 74, 28, 36, SK, '#222');
        poly(x, [52, 100, 76, 100, 64, 118], SK, '#222');
        ell(x, 64, 42, 34, 22, AC, '#222'); x.fillStyle = AC; x.fillRect(26, 42, 76, 8); x.strokeStyle = '#222'; x.lineWidth = 2; x.strokeRect(26, 42, 76, 8);
        poly(x, [66, 24, 56, 42, 64, 42, 58, 56, 76, 38, 67, 38, 74, 24], P1, '#222');
        x.fillStyle = S1; x.fillRect(36, 62, 56, 16);
        for (const sd of [-1, 1]) { ell(x, 64 + sd * 12, 70, 9, 9, '#c8f8ff', '#222'); ell(x, 64 + sd * 12, 70, 3.5, 3.5, '#1c1a24'); }
        poly(x, [60, 80, 68, 80, 66, 92, 62, 92], SK, '#222');
        x.beginPath(); x.moveTo(52, 100); x.lineTo(76, 100); x.lineWidth = 3; x.strokeStyle = '#5a2a1a'; x.stroke();
        break;
      }
      case 'vex': {
        shoulders(P1, 58);
        for (let i = 0; i < 5; i++) spike(x, 44 + i * 10, 40, -Math.PI / 2 + (i - 2) * 0.22, 26, 7, AC);
        ell(x, 64, 72, 44, 34, SK, '#222');
        x.fillStyle = S1; x.fillRect(24, 58, 80, 14); x.strokeStyle = '#222'; x.lineWidth = 2; x.strokeRect(24, 58, 80, 14);
        for (const sd of [-1, 1]) { ell(x, 64 + sd * 16, 65, 10, 8, AC, '#222'); ell(x, 64 + sd * 16, 65, 3.5, 3.5, '#1c1a24'); x.beginPath(); x.moveTo(64 + sd * 6, 52); x.lineTo(64 + sd * 28, 56); x.lineWidth = 5; x.strokeStyle = '#2a1a10'; x.stroke(); }
        poly(x, [38, 86, 90, 86, 84, 104, 44, 104], SK, '#222');
        poly(x, [46, 90, 82, 90, 78, 98, 50, 98], '#fff', '#222');
        poly(x, [66, 76, 58, 90, 64, 90, 60, 100, 72, 86, 66, 86], AC, '#222');
        break;
      }
      case 'shelby': {
        shoulders(P1, 46);
        ell(x, 64, 66, 52, 44, P1, '#222'); ell(x, 64, 70, 48, 10, S1, '#222');
        for (let i = 0; i < 3; i++) poly(x, [44 + i * 20, 34, 52 + i * 20, 34, 52 + i * 20, 42, 44 + i * 20, 42], shade(co.primary, 1.4).getStyle(), '#222');
        ell(x, 64, 76, 30, 28, SK, '#222');
        ell(x, 64, 88, 16, 10, SK, '#222'); ell(x, 58, 86, 2.5, 2.5, '#222'); ell(x, 70, 86, 2.5, 2.5, '#222');
        ell(x, 64, 50, 30, 12, P1, '#222');
        eyePair(x, 64, 72, 12, 4.5); smile(x, 64, 96, 8);
        break;
      }
      case 'swoop': {
        shoulders(P1, 44);
        for (const sd of [-1, 1]) { ell(x, 64 + sd * 46, 52, 26, 10, '#fff', '#222', -sd * 0.7); ell(x, 64 + sd * 52, 44, 16, 6, '#ffc8e0', '#222', -sd * 0.7); }
        ell(x, 64, 66, 44, 38, P1, '#222');
        ell(x, 64, 76, 30, 28, SK, '#222');
        poly(x, [64, 30, 56, 52, 72, 52], AC, '#222'); poly(x, [50, 36, 50, 54, 58, 52], AC, '#222'); poly(x, [78, 36, 78, 54, 70, 52], AC, '#222');
        for (const sd of [-1, 1]) { ell(x, 64 + sd * 13, 72, 10, 10, '#35e0ff', '#222'); ell(x, 64 + sd * 13, 72, 4, 5, '#1c1a24'); }
        ell(x, 64, 88, 10, 7, SK, '#222'); smile(x, 64, 90, 6);
        break;
      }
      case 'bitsy': {
        shoulders(P1, 40);
        ell(x, 64, 72, 42, 40, SK, '#222');
        ell(x, 64, 54, 46, 36, S1, '#222');
        for (let i = 0; i < 8; i++) { const a = Math.PI * (0.95 + i * 0.1); ell(x, 64 + Math.cos(a) * 44, 64 + Math.sin(a) * 30, 7, 7, '#fff', '#222'); }
        ell(x, 64, 74, 34, 26, SK);
        ell(x, 90, 36, 11, 8, AC, '#222', 0.4); ell(x, 70, 30, 11, 8, AC, '#222', -0.4); ell(x, 80, 33, 5, 5, '#fff0a0', '#222');
        eyePair(x, 64, 74, 15, 5.5);
        ell(x, 36, 88, 7, 5, 'rgba(255,110,110,.6)'); ell(x, 92, 88, 7, 5, 'rgba(255,110,110,.6)');
        ell(x, 64, 94, 7, 7, AC, '#222'); ell(x, 64, 94, 3, 3, '#fff');
        break;
      }
      case 'bop': {
        shoulders(P1, 40);
        ell(x, 64, 74, 42, 40, SK, '#222');
        ell(x, 64, 54, 38, 24, S1, '#222');
        for (const sd of [-1, 0, 1]) { x.beginPath(); x.moveTo(64 + sd * 14, 32); x.lineTo(64 + sd * 28, 56); x.lineWidth = 4; x.strokeStyle = AC; x.stroke(); }
        x.beginPath(); x.moveTo(64, 32); x.lineTo(64, 20); x.lineWidth = 4; x.strokeStyle = '#222'; x.stroke();
        poly(x, [64, 20, 94, 12, 94, 22], AC, '#222'); poly(x, [64, 20, 34, 28, 34, 18], AC, '#222');
        eyePair(x, 64, 76, 15, 5.5);
        ell(x, 36, 88, 7, 5, 'rgba(255,110,110,.6)'); ell(x, 92, 88, 7, 5, 'rgba(255,110,110,.6)');
        x.beginPath(); x.ellipse(64, 94, 11, 8, 0, 0, Math.PI); x.fillStyle = '#8a2a1a'; x.fill(); x.lineWidth = 3; x.strokeStyle = '#222'; x.stroke();
        ell(x, 64, 98, 6, 3, '#ff8a8a');
        break;
      }
      case 'spud': {
        shoulders(P1, 46);
        for (let i = 0; i < 4; i++) { const a = -2.4 + i * 0.55; ell(x, 64 + Math.cos(a) * 14, 34 + Math.sin(a) * 6, 20, 7, i % 2 ? '#7ad05a' : AC, '#222', a * 0.6); }
        ell(x, 64, 72, 42, 38, SK, '#222');
        for (const q of [[38, 56], [92, 64], [48, 90], [86, 92], [64, 50]]) ell(x, q[0], q[1], 4, 3, '#8a5e2c');
        eyePair(x, 64, 70, 14, 5);
        ell(x, 38, 82, 7, 5, 'rgba(255,110,90,.55)'); ell(x, 90, 82, 7, 5, 'rgba(255,110,90,.55)');
        ell(x, 64, 82, 6, 3, '#6a3a1a'); smile(x, 64, 84, 10);
        break;
      }
      case 'sprout': {
        shoulders(P1, 42);
        for (const sd of [-1, 1]) for (let j = 0; j < 3; j++) ell(x, 64 + sd * (38 + j * 8), 66 + j * 14, 16, 6, j % 2 ? '#7ad05a' : AC, '#222', -sd * (0.4 + j * 0.5));
        for (let j = 0; j < 3; j++) ell(x, 64 + (j - 1) * 14, 22, 18, 6, j == 1 ? '#7ad05a' : AC, '#222', Math.PI / 2 + (j - 1) * 0.5);
        ell(x, 64, 72, 34, 38, SK, '#222');
        ell(x, 64, 48, 34, 16, S1, '#222');
        eyePair(x, 64, 72, 12, 4.5);
        ell(x, 42, 84, 6, 4, 'rgba(255,90,140,.6)'); ell(x, 86, 84, 6, 4, 'rgba(255,90,140,.6)');
        smile(x, 64, 84, 8);
        break;
      }
      case 'thorn': {
        shoulders(P1, 56);
        for (let i = 0; i < 6; i++) ell(x, 64 + Math.cos(Math.PI * (1.1 + i * 0.16)) * 50, 56 + Math.sin(Math.PI * (1.1 + i * 0.16)) * 40, 14, 22, i % 2 ? '#e84a6a' : S1, '#222', (i - 2.5) * 0.45);
        ell(x, 64, 66, 40, 32, SK, '#222');
        ell(x, 64, 88, 34, 20, S1, '#222');
        ell(x, 64, 84, 26, 11, '#7a1428');
        for (let i = 0; i < 6; i++) { poly(x, [40 + i * 9, 76, 49 + i * 9, 76, 44.5 + i * 9, 86], AC, '#222'); poly(x, [40 + i * 9, 98, 49 + i * 9, 98, 44.5 + i * 9, 88], AC, '#222'); }
        for (const sd of [-1, 1]) { ell(x, 64 + sd * 18, 52, 10, 11, '#fff', '#222'); ell(x, 64 + sd * 18, 54, 5, 6, '#1c1a24'); x.beginPath(); x.moveTo(64 + sd * 8, 38); x.lineTo(64 + sd * 28, 44); x.lineWidth = 5; x.strokeStyle = '#1a4a22'; x.stroke(); ell(x, 64 + sd * 34, 66, 3, 3, AC); }
        break;
      }
      case 'wisp': {
        shoulders(S1, 52);
        const fl = [[64, 4, 18, '#dffbff'], [42, 14, 14, AC], [86, 14, 14, AC], [53, 10, 14, '#9fefff'], [75, 10, 14, '#9fefff']];
        fl.forEach((f) => poly(x, [f[0] - 9, 40, f[0], f[1], f[0] + 9, 40], f[3], '#222'));
        ell(x, 64, 42, 24, 6, S1, '#222');
        ell(x, 64, 76, 46, 38, SK, '#222');
        for (const sd of [-1, 1]) { ell(x, 64 + sd * 18, 68, 7, 10, '#1c1a24'); ell(x, 64 + sd * 18 - 2, 63, 2.5, 2.5, '#fff'); ell(x, 64 + sd * 34, 82, 8, 5, 'rgba(255,120,160,.6)'); }
        x.beginPath(); x.ellipse(64, 88, 13, 9, 0, 0, Math.PI); x.fillStyle = '#5a2a6a'; x.fill(); x.lineWidth = 3; x.strokeStyle = '#222'; x.stroke();
        ell(x, 64, 94, 6, 3, '#ff7a9a');
        break;
      }
    }
    // frame
    x.lineWidth = 6; x.strokeStyle = '#1c1a24'; x.strokeRect(0, 0, 128, 128);
    return cv;
  }

  // ---------------------------------------------------------------- trophy
  const trophyMats = {};
  function trophyMat(kind) {
    if (trophyMats[kind]) return trophyMats[kind];
    const def = {
      gold: { color: 0xd9a21a, specular: 0xfff1a0, emissive: 0x2a1800, shininess: 120 },
      silver: { color: 0xd4dae2, specular: 0xffffff, emissive: 0x20242a, shininess: 140 },
      bronze: { color: 0xc27a3a, specular: 0xffc890, emissive: 0x2a1204, shininess: 90 },
    }[kind] || null;
    const d = def || { color: 0xffc21a, specular: 0xfff1a0, emissive: 0x3a2400, shininess: 120 };
    return (trophyMats[kind] = {
      metal: new THREE.MeshPhongMaterial({ color: d.color, specular: d.specular, emissive: d.emissive, shininess: d.shininess }),
      base: new THREE.MeshPhongMaterial({ color: 0x2a2230, specular: 0x665577, shininess: 60 }),
      gem: new THREE.MeshPhongMaterial({ color: kind === 'silver' ? 0x6ad0ff : kind === 'bronze' ? 0xff7a3a : 0xff3a5a, specular: 0xffffff, emissive: 0x220808, shininess: 160, flatShading: true }),
    });
  }
  function buildTrophy(kind) {
    const m = trophyMat(kind);
    const g = new THREE.Group();
    g.name = 'trophy_' + kind;
    const add = (geo, mt, x, y, z) => { const o = new THREE.Mesh(geo, mt); o.position.set(x, y, z); g.add(o); return o; };
    add(new THREE.BoxGeometry(0.62, 0.12, 0.62), m.base, 0, 0.06, 0);
    add(new THREE.BoxGeometry(0.48, 0.1, 0.48), m.base, 0, 0.17, 0);
    add(new THREE.CylinderGeometry(0.2, 0.26, 0.1, 20), m.metal, 0, 0.27, 0);
    add(new THREE.CylinderGeometry(0.07, 0.11, 0.3, 14), m.metal, 0, 0.47, 0);
    add(new THREE.SphereGeometry(0.12, 14, 10), m.metal, 0, 0.64, 0);
    // chunky cup (lathe profile, bottom -> rim)
    const prof = [[0.001, 0.0], [0.12, 0.02], [0.2, 0.1], [0.3, 0.26], [0.36, 0.42], [0.38, 0.5], [0.34, 0.5], [0.3, 0.42], [0.2, 0.2], [0.001, 0.08]]
      .map((p) => new THREE.Vector2(p[0], p[1]));
    const cup = add(new THREE.LatheGeometry(prof, 24), m.metal, 0, 0.68, 0);
    cup.material = m.metal; m.metal.side = THREE.DoubleSide;
    add(new THREE.TorusGeometry(0.37, 0.03, 8, 24), m.metal, 0, 1.18, 0).rotation.x = HP;
    for (const sd of [-1, 1]) {
      const h = add(new THREE.TorusGeometry(0.17, 0.05, 8, 16), m.metal, sd * 0.42, 0.98, 0);
      h.scale.set(0.8, 1.2, 1);
    }
    add(new THREE.SphereGeometry(0.1, 8, 6), m.gem, 0, 0.92, 0.35).scale.set(1, 1.2, 0.5);
    return g;
  }

  function kartsFor(frontId, rearId) {
    const w = kartWeight(frontId, rearId);
    return G.KARTS.filter((k) => k.weight === w || k.weight === 'any');
  }

  G.Characters = {
    buildRider, buildKart, buildPortrait, kartWeight, buildTrophy, kartsFor,
    getCharacter: (id) => charById[id],
    getKart: (id) => kartById[id],
  };
})();
