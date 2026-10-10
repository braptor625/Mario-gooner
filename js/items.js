// Items: item boxes, roulette, held/dragged/thrown items, projectiles, hazards, specials.
// Classic script; attaches G.ITEMS and G.ItemSystem. Requires THREE (r128) and G (util.js).
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  // ------------------------------------------------------------------ icons
  const svg = (inner) =>
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">' + inner + '</svg>';
  const ST = 'stroke="#1b1b2f" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"';

  function shellG(body, shade, tx, ty, s) {
    return '<g transform="translate(' + tx + ' ' + ty + ') scale(' + s + ')">' +
      '<path d="M8 38 A24 24 0 0 1 56 38 Z" fill="' + body + '" ' + ST + '/>' +
      '<path d="M22 38 Q32 14 42 38 Z" fill="' + shade + '" ' + ST + '/>' +
      '<rect x="5" y="36" width="54" height="13" rx="6.5" fill="#fff4d6" ' + ST + '/></g>';
  }
  function shellIcon(body, shade, n) {
    if (n === 1) return svg(shellG(body, shade, 0, 4, 1));
    return svg(shellG(body, shade, 0, 28, 0.55) + shellG(body, shade, 29, 28, 0.55) + shellG(body, shade, 14.5, 4, 0.55));
  }
  function shroomG(cap, spot, tx, ty, s) {
    return '<g transform="translate(' + tx + ' ' + ty + ') scale(' + s + ')">' +
      '<path d="M20 34 H44 V50 Q44 58 32 58 Q20 58 20 50 Z" fill="#fff1d0" ' + ST + '/>' +
      '<path d="M6 36 A26 26 0 0 1 58 36 Z" fill="' + cap + '" ' + ST + '/>' +
      '<circle cx="20" cy="26" r="5" fill="' + spot + '"/><circle cx="35" cy="17" r="5" fill="' + spot + '"/>' +
      '<circle cx="47" cy="29" r="4" fill="' + spot + '"/>' +
      '<ellipse cx="28" cy="47" rx="2" ry="3.5" fill="#1b1b2f"/><ellipse cx="36" cy="47" rx="2" ry="3.5" fill="#1b1b2f"/></g>';
  }
  function shroomIcon(cap, spot, n) {
    if (n === 1) return svg(shroomG(cap, spot, 0, 0, 1));
    return svg(shroomG(cap, spot, 0, 26, 0.55) + shroomG(cap, spot, 29, 26, 0.55) + shroomG(cap, spot, 14.5, 3, 0.55));
  }
  function bananaG(tx, ty, s, fill) {
    return '<g transform="translate(' + tx + ' ' + ty + ') scale(' + s + ')">' +
      '<path d="M10 14 C10 44 30 58 56 42 C58 40 56 36 53 37 C34 46 24 34 22 12 Z" fill="' + fill + '" ' + ST + '/>' +
      '<path d="M10 14 L22 12 L21 6 L11 7 Z" fill="#7a4a1d" ' + ST + '/>' +
      '<path d="M26 22 C28 34 36 40 48 40" fill="none" stroke="#fff3a0" stroke-width="3" stroke-linecap="round"/></g>';
  }
  const STAR_PTS = '32,4 40,23 61,25 45,39 50,60 32,49 14,60 19,39 3,25 24,23';

  G.ITEMS = {
    banana: { name: 'Peel', color: '#f7d51d', kind: 'hazard', icon: svg(bananaG(0, 0, 1, '#ffd92e')) },
    shell_green: { name: 'Green Shell', color: '#2fbf4a', kind: 'projectile', icon: shellIcon('#2fbf4a', '#1f8f37', 1) },
    shell_green3: { name: 'Triple Green Shell', color: '#2fbf4a', kind: 'projectile', icon: shellIcon('#2fbf4a', '#1f8f37', 3) },
    shell_red: { name: 'Seeker Shell', color: '#e63946', kind: 'projectile', icon: shellIcon('#e63946', '#b3202c', 1) },
    shell_red3: { name: 'Triple Seeker Shell', color: '#e63946', kind: 'projectile', icon: shellIcon('#e63946', '#b3202c', 3) },
    mushroom: { name: 'Turbo Shroom', color: '#ff7a1a', kind: 'boost', icon: shroomIcon('#ff5a36', '#ffffff', 1) },
    mushroom3: { name: 'Triple Shroom', color: '#ff7a1a', kind: 'boost', icon: shroomIcon('#ff5a36', '#ffffff', 3) },
    mushroom_gold: { name: 'Golden Shroom', color: '#ffc928', kind: 'boost', icon: shroomIcon('#ffc928', '#fff7c2', 1) },
    star: {
      name: 'Superstar', color: '#ffe14a', kind: 'boost',
      icon: svg('<polygon points="' + STAR_PTS + '" fill="#ffe14a" ' + ST + '/>' +
        '<circle cx="26" cy="32" r="2.6" fill="#1b1b2f"/><circle cx="38" cy="32" r="2.6" fill="#1b1b2f"/>' +
        '<path d="M26 40 Q32 45 38 40" fill="none" stroke="#1b1b2f" stroke-width="2.5" stroke-linecap="round"/>'),
    },
    lightning: {
      name: 'Thunderbolt', color: '#ffe14a', kind: 'special',
      icon: svg('<polygon points="40,3 12,37 29,37 21,61 52,25 34,25" fill="#ffe14a" ' + ST + '/>' +
        '<polygon points="38,12 24,31 34,31" fill="#fff7b0"/>'),
    },
    fake_box: {
      name: 'Decoy Box', color: '#ff8a2a', kind: 'hazard',
      icon: svg('<rect x="8" y="8" width="48" height="48" rx="8" fill="#ff8a2a" ' + ST + '/>' +
        '<rect x="14" y="14" width="36" height="36" rx="5" fill="#ffb24d"/>' +
        '<text x="32" y="43" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="30" text-anchor="middle" fill="#fff" transform="rotate(180 32 32)">?</text>'),
    },
    bomb: {
      name: 'Boom Bomb', color: '#3a3f5a', kind: 'hazard',
      icon: svg('<circle cx="29" cy="38" r="22" fill="#2b2f45" ' + ST + '/>' +
        '<path d="M16 32 A15 15 0 0 1 28 22" fill="none" stroke="#7f88b3" stroke-width="4" stroke-linecap="round"/>' +
        '<rect x="26" y="9" width="10" height="9" rx="2" fill="#8a8fa8" ' + ST + '/>' +
        '<path d="M34 11 Q44 4 50 10" fill="none" stroke="#d9a441" stroke-width="3" stroke-linecap="round"/>' +
        '<polygon points="52,3 54,9 60,8 55,12 59,17 53,14 50,20 49,13 43,12 49,9" fill="#ff7a1a"/>' +
        '<ellipse cx="22" cy="40" rx="3" ry="4.5" fill="#fff"/><ellipse cx="34" cy="40" rx="3" ry="4.5" fill="#fff"/>'),
    },
    spiny: {
      name: 'Spiked Shell', color: '#2f6fe0', kind: 'projectile',
      icon: svg('<g fill="#fff" ' + ST + '><polygon points="14,30 4,18 22,22"/><polygon points="24,22 22,6 34,20"/><polygon points="36,20 42,5 48,22"/><polygon points="46,24 60,16 54,34"/></g>' +
        '<path d="M8 44 A24 22 0 0 1 56 44 Z" fill="#2f6fe0" ' + ST + '/>' +
        '<path d="M22 44 Q32 22 42 44 Z" fill="#1d4bb0" ' + ST + '/>' +
        '<rect x="6" y="42" width="52" height="12" rx="6" fill="#fff4d6" ' + ST + '/>'),
    },
    fireball: {
      name: 'Fireballs', color: '#ff6a1a', kind: 'projectile',
      icon: svg('<path d="M32 4 C40 18 54 24 52 40 C50 54 40 60 32 60 C22 60 12 54 12 42 C12 32 20 28 22 18 C28 22 30 14 32 4 Z" fill="#ff6a1a" ' + ST + '/>' +
        '<path d="M32 28 C37 36 44 38 42 47 C41 54 36 56 32 56 C27 56 22 52 22 46 C22 40 28 38 32 28 Z" fill="#ffd23a"/>'),
    },
    heart: {
      name: 'Heart Shield', color: '#ff5b8a', kind: 'special',
      icon: svg('<path d="M32 57 C3 38 6 8 23 8 C28 8 31 11 32 15 C33 11 36 8 41 8 C58 8 61 38 32 57 Z" fill="#ff5b8a" ' + ST + '/>' +
        '<path d="M14 18 Q18 12 24 14" fill="none" stroke="#ffd1df" stroke-width="4" stroke-linecap="round"/>'),
    },
    egg: {
      name: 'Mystery Egg', color: '#fff0c2', kind: 'projectile',
      icon: svg('<path d="M32 4 C48 4 56 30 56 42 C56 54 46 60 32 60 C18 60 8 54 8 42 C8 30 16 4 32 4 Z" fill="#fff0c2" ' + ST + '/>' +
        '<circle cx="24" cy="26" r="5" fill="#59b8ff"/><circle cx="40" cy="34" r="6" fill="#ff7aa8"/>' +
        '<circle cx="26" cy="46" r="4.5" fill="#7bdc6a"/><circle cx="44" cy="50" r="3" fill="#59b8ff"/>'),
    },
    giant_banana: {
      name: 'Mega Peel', color: '#f7d51d', kind: 'hazard',
      icon: svg(bananaG(-2, 2, 1.0, '#ffcf1f') +
        '<polygon points="52,6 55,13 62,14 57,19 58,26 52,22 46,26 47,19 42,14 49,13" fill="#fff" ' + ST.replace('3', '2') + '/>'),
    },
    mega_shell: {
      name: 'Spiked Mega Shell', color: '#2fbf4a', kind: 'projectile',
      icon: svg('<g fill="#ffd23a" ' + ST + '><polygon points="12,30 6,16 22,22"/><polygon points="24,22 24,4 36,20"/><polygon points="38,20 46,6 50,24"/><polygon points="48,26 62,20 56,38"/></g>' +
        '<path d="M6 46 A26 24 0 0 1 58 46 Z" fill="#2fbf4a" ' + ST + '/>' +
        '<path d="M21 46 Q32 20 43 46 Z" fill="#1f8f37" ' + ST + '/>' +
        '<rect x="4" y="44" width="56" height="13" rx="6.5" fill="#fff4d6" ' + ST + '/>'),
    },
  };

  // ------------------------------------------------------------------ tables
  const COUNT = { shell_green3: 3, shell_red3: 3, mushroom3: 3 };
  const DRAGGABLE = {
    banana: 1, giant_banana: 1, fake_box: 1, bomb: 1, shell_green: 1, shell_red: 1, egg: 1, mega_shell: 1,
  };
  const ENT_OF = {
    banana: 'banana', giant_banana: 'giant_banana', fake_box: 'fake_box', bomb: 'bomb',
    shell_green: 'shell_green', shell_green3: 'shell_green', shell_red: 'shell_red', shell_red3: 'shell_red',
    egg: 'egg', mega_shell: 'mega_shell',
  };
  // pool size, collision radius (kart included)
  const ETYPE = {
    banana: { n: 20, r: 1.2, ground: true },
    giant_banana: { n: 3, r: 2.4, ground: true },
    fake_box: { n: 8, r: 1.5, ground: true },
    bomb: { n: 8, r: 1.8 },
    shell_green: { n: 16, r: 1.6 },
    shell_red: { n: 16, r: 1.6 },
    spiny: { n: 3, r: 1.6 },
    mega_shell: { n: 2, r: 2.7 },
    fireball: { n: 30, r: 1.5 },
    egg: { n: 6, r: 1.5 },
  };
  const ABSORB_GIVES = { banana: 'banana', giant_banana: 'banana', fake_box: 'fake_box', shell_green: 'shell_green', shell_red: 'shell_red' };
  const TEMP_BOXES = 12;
  const MAX_EXPL = 8;

  // distribution anchors (front / mid / back)
  const W_FRONT = { banana: 35, shell_green: 30, fake_box: 15, shell_red: 10, mushroom: 12, bomb: 3 };
  const W_MID = {
    banana: 12, shell_green: 12, fake_box: 6, shell_red: 18, shell_red3: 12, shell_green3: 12,
    mushroom: 16, mushroom3: 12, bomb: 8, star: 3,
  };
  const W_BACK = {
    mushroom: 18, mushroom3: 18, shell_red: 8, shell_red3: 10, bomb: 6, star: 14, mushroom_gold: 12,
    shell_green3: 4, banana: 3,
  };
  const ALL_KEYS = ['banana', 'shell_green', 'shell_green3', 'shell_red', 'shell_red3', 'mushroom', 'mushroom3',
    'mushroom_gold', 'star', 'fake_box', 'bomb'];

  function wrapLen(d, len) { d %= len; return d < 0 ? d + len : d; }

  // ------------------------------------------------------------------ system
  class ItemSystem {
    constructor(scene, track, karts) {
      this.scene = scene;
      this.track = track;
      this.karts = karts || [];
      this.t = 0;
      this.lightningTimer = 0;
      this.ents = [];
      this.pools = {};
      this.expl = [];
      this._hz = [];
      this._hzPool = [];
      this._w = {};
      this._specialOf = null;
      this._disposables = [];
      this._root = new THREE.Group();
      this._root.name = 'items';
      scene.add(this._root);

      this._buildAssets();
      this._buildBoxes();
      this._buildEntities();
      this._buildExplosions();
      for (let i = 0; i < this.karts.length; i++) this._initKart(this.karts[i]);
    }

    // ------------------------------------------------------------ assets
    _track(o) { this._disposables.push(o); return o; }
    _mat(color, opts) {
      const p = Object.assign({ color: color, flatShading: true }, opts || {});
      return this._track(new THREE.MeshLambertMaterial(p));
    }
    _basic(color, opts) {
      const p = Object.assign({ color: color }, opts || {});
      return this._track(new THREE.MeshBasicMaterial(p));
    }
    _geo(g) { return this._track(g); }

    _qTexture(flip, bg) {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 128;
      const x = c.getContext('2d');
      x.clearRect(0, 0, 128, 128);
      x.fillStyle = bg;
      x.fillRect(0, 0, 128, 128);
      x.save();
      if (flip) { x.translate(128, 128); x.rotate(Math.PI); }
      x.font = '900 100px "Arial Black", Arial, sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 10; x.strokeStyle = 'rgba(30,20,60,0.85)';
      x.strokeText('?', 64, 70);
      x.fillStyle = '#ffffff';
      x.fillText('?', 64, 70);
      x.restore();
      const t = new THREE.CanvasTexture(c);
      return this._track(t);
    }

    _cubeGeo(hueShift, rainbow) {
      const g = new THREE.BoxGeometry(1.3, 1.3, 1.3);
      const pos = g.attributes.position;
      const col = new Float32Array(pos.count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        if (rainbow) {
          const h = (((pos.getX(i) + pos.getY(i) * 1.1 + pos.getZ(i) * 0.7) / 3.0 + 0.5) % 1 + 1) % 1;
          c.setHSL(h, 0.9, 0.62);
        } else {
          c.setHSL(hueShift + (pos.getY(i) + 0.65) * 0.05, 0.9, 0.52);
        }
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return this._geo(g);
    }

    _buildAssets() {
      const A = (this.A = {});
      A.yellow = this._mat(0xffd92e);
      A.brown = this._mat(0x7a4a1d);
      A.cream = this._mat(0xfff4d6);
      A.green = this._mat(0x2fbf4a);
      A.red = this._mat(0xe63946);
      A.blue = this._mat(0x2f6fe0);
      A.white = this._mat(0xffffff);
      A.gold = this._mat(0xffd23a);
      A.black = this._mat(0x2b2f45);
      A.orange = this._basic(0xff6a1a);
      A.fireCore = this._basic(0xffe27a);
      A.egg = this._mat(0xfff0c2);
      A.spotA = this._mat(0x59b8ff);
      A.spotB = this._mat(0xff7aa8);
      A.pink = this._mat(0xff5b8a, { emissive: 0x551122 });
      A.spark = this._basic(0xff9a2a);

      const g = (A.g = {});
      g.dome = this._geo(new THREE.SphereGeometry(0.6, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2));
      g.base = this._geo(new THREE.CylinderGeometry(0.64, 0.64, 0.2, 10));
      g.spike = this._geo(new THREE.ConeGeometry(0.13, 0.4, 5));
      g.torus = this._geo(new THREE.TorusGeometry(0.4, 0.13, 6, 12, Math.PI));
      g.tip = this._geo(new THREE.SphereGeometry(0.14, 6, 5));
      g.sphere = this._geo(new THREE.SphereGeometry(0.5, 10, 8));
      g.small = this._geo(new THREE.SphereGeometry(0.1, 6, 5));
      g.fuse = this._geo(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 5));
      g.cap = this._geo(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 8));
      const hs = new THREE.Shape();
      hs.moveTo(0, -0.45);
      hs.bezierCurveTo(-0.7, 0.05, -0.45, 0.55, -0.2, 0.5);
      hs.bezierCurveTo(-0.08, 0.48, 0, 0.38, 0, 0.3);
      hs.bezierCurveTo(0, 0.38, 0.08, 0.48, 0.2, 0.5);
      hs.bezierCurveTo(0.45, 0.55, 0.7, 0.05, 0, -0.45);
      const hg = new THREE.ExtrudeGeometry(hs, { depth: 0.2, bevelEnabled: false });
      hg.translate(0, 0, -0.1);
      g.heart = this._geo(hg);
      g.cube = this._geo(new THREE.BoxGeometry(1.3, 1.3, 1.3));
      g.expl = this._geo(new THREE.SphereGeometry(1, 12, 8));
      g.cubeRainbow = this._cubeGeo(0, true);
      g.cubeFake = this._cubeGeo(0.02, false);
    }

    _shellMesh(bodyMat, scale, spikes, spikeMat) {
      const A = this.A, grp = new THREE.Group();
      const d = new THREE.Mesh(A.g.dome, bodyMat); d.position.y = 0.2; grp.add(d);
      const b = new THREE.Mesh(A.g.base, A.cream); b.position.y = 0.1; grp.add(b);
      if (spikes) {
        for (let i = 0; i < spikes; i++) {
          const a = (i / spikes) * Math.PI * 2;
          const s = new THREE.Mesh(A.g.spike, spikeMat || A.white);
          s.position.set(Math.cos(a) * 0.42, 0.52, Math.sin(a) * 0.42);
          s.rotation.z = -Math.cos(a) * 0.5; s.rotation.x = Math.sin(a) * 0.5;
          grp.add(s);
        }
        const c = new THREE.Mesh(A.g.spike, spikeMat || A.white); c.position.y = 0.85; grp.add(c);
      }
      grp.scale.setScalar(scale);
      return grp;
    }

    _makeMesh(type) {
      const A = this.A;
      let grp;
      switch (type) {
        case 'banana': case 'giant_banana': {
          grp = new THREE.Group();
          const inner = new THREE.Group();
          const t = new THREE.Mesh(A.g.torus, A.yellow);
          t.rotation.x = -Math.PI / 2; t.position.y = 0.16;
          inner.add(t);
          for (let s = -1; s <= 1; s += 2) {
            const tip = new THREE.Mesh(A.g.tip, A.brown); tip.position.set(s * 0.4, 0.16, 0); inner.add(tip);
          }
          if (type === 'giant_banana') inner.scale.setScalar(2.4);
          else inner.scale.setScalar(1.3);
          grp.add(inner);
          break;
        }
        case 'fake_box': {
          grp = new THREE.Group();
          const m = new THREE.Mesh(A.g.cubeFake, this.fakeMat);
          m.position.y = 0.9; grp.add(m);
          grp.userData.cube = m;
          break;
        }
        case 'bomb': {
          grp = new THREE.Group();
          const b = new THREE.Mesh(A.g.sphere, A.black); b.position.y = 0.55; b.scale.setScalar(1.1); grp.add(b);
          const c = new THREE.Mesh(A.g.cap, A.cream); c.position.y = 1.15; grp.add(c);
          const f = new THREE.Mesh(A.g.fuse, A.brown); f.position.y = 1.3; grp.add(f);
          const sp = new THREE.Mesh(A.g.tip, A.spark); sp.position.y = 1.5; sp.scale.setScalar(1.4); grp.add(sp);
          grp.userData.spark = sp;
          break;
        }
        case 'shell_green': grp = this._shellMesh(A.green, 1.2); break;
        case 'shell_red': grp = this._shellMesh(A.red, 1.2); break;
        case 'spiny': grp = this._shellMesh(A.blue, 1.5, 6, A.white); break;
        case 'mega_shell': grp = this._shellMesh(A.green, 3.2, 8, A.gold); break;
        case 'fireball': {
          grp = new THREE.Group();
          const o = new THREE.Mesh(A.g.sphere, A.orange); o.position.y = 0.4; o.scale.setScalar(0.8); grp.add(o);
          const c = new THREE.Mesh(A.g.sphere, A.fireCore); c.position.y = 0.4; c.scale.setScalar(0.45); grp.add(c);
          break;
        }
        case 'egg': {
          grp = new THREE.Group();
          const e = new THREE.Mesh(A.g.sphere, A.egg); e.position.y = 0.7; e.scale.set(0.85, 1.15, 0.85); grp.add(e);
          const s1 = new THREE.Mesh(A.g.tip, A.spotA); s1.position.set(0.3, 0.9, 0.3); s1.scale.setScalar(1.5); grp.add(s1);
          const s2 = new THREE.Mesh(A.g.tip, A.spotB); s2.position.set(-0.3, 0.6, 0.3); s2.scale.setScalar(1.7); grp.add(s2);
          const s3 = new THREE.Mesh(A.g.tip, A.spotA); s3.position.set(0.0, 0.5, -0.4); s3.scale.setScalar(1.4); grp.add(s3);
          break;
        }
        default: grp = new THREE.Group();
      }
      grp.visible = false;
      this._root.add(grp);
      return grp;
    }

    _buildBoxes() {
      const A = this.A;
      const mapA = this._qTexture(false, 'rgba(255,255,255,0.45)');
      const mapB = this._qTexture(true, 'rgba(255,255,255,0.5)');
      this.boxMat = this._track(new THREE.MeshBasicMaterial({
        map: mapA, vertexColors: true, transparent: true, opacity: 0.88, depthWrite: false,
      }));
      this.fakeMat = this._track(new THREE.MeshBasicMaterial({
        map: mapB, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false,
      }));
      const spots = (this.track && this.track.itemBoxSpots) || [];
      const n = spots.length;
      this.nSpots = n;
      const N = n + TEMP_BOXES;
      this.nBoxes = N;
      this.bx = new Float32Array(N); this.by = new Float32Array(N); this.bz = new Float32Array(N);
      this.bS = new Float32Array(N); this.bR = new Float32Array(N); this.bL = new Float32Array(N);
      this.bAct = new Uint8Array(N);
      for (let i = 0; i < n; i++) {
        this.bx[i] = spots[i].x; this.by[i] = spots[i].y || 0; this.bz[i] = spots[i].z;
      }
      this.boxMesh = new THREE.InstancedMesh(A.g.cubeRainbow, this.boxMat, N);
      this.boxMesh.frustumCulled = false;
      this.boxMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this._root.add(this.boxMesh);
      this._resetBoxes();
      this._writeBoxMatrices();
    }

    _resetBoxes() {
      for (let i = 0; i < this.nBoxes; i++) {
        const spot = i < this.nSpots;
        this.bAct[i] = spot ? 1 : 0;
        this.bS[i] = spot ? 1 : 0;
        this.bR[i] = 0; this.bL[i] = 0;
      }
    }

    _writeBoxMatrices() {
      const te = this.boxMesh.instanceMatrix.array, t = this.t;
      for (let i = 0; i < this.nBoxes; i++) {
        const s = this.bS[i], a = t * 1.6 + i * 0.7, c = Math.cos(a) * s, sn = Math.sin(a) * s, o = i * 16;
        te[o] = c; te[o + 1] = 0; te[o + 2] = -sn; te[o + 3] = 0;
        te[o + 4] = 0; te[o + 5] = s; te[o + 6] = 0; te[o + 7] = 0;
        te[o + 8] = sn; te[o + 9] = 0; te[o + 10] = c; te[o + 11] = 0;
        te[o + 12] = this.bx[i];
        te[o + 13] = this.by[i] + 1.15 + Math.sin(t * 2.2 + i) * 0.15;
        te[o + 14] = this.bz[i]; te[o + 15] = 1;
      }
      this.boxMesh.instanceMatrix.needsUpdate = true;
    }

    _buildEntities() {
      for (const type in ETYPE) {
        const arr = (this.pools[type] = []);
        for (let i = 0; i < ETYPE[type].n; i++) {
          const e = {
            active: false, kind: type, mesh: this._makeMesh(type), state: '', mode: '', owner: null,
            x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 10, radius: ETYPE[type].r, bounces: 0,
            maxBounce: 5, target: null, hint: -1, dist: 0, speed: 0, hover: 0.1, spin: 0, spinRate: 0,
            heldId: null, directR: 25, lastPick: 0, hitT: new Float32Array(Math.max(1, this.karts.length)),
            spark: null, hitKind: 'flip',
          };
          e.spark = e.mesh.userData.spark || null;
          arr.push(e); this.ents.push(e);
        }
      }
      const total = this.ents.length;
      for (let i = 0; i < total; i++) this._hzPool.push({ x: 0, z: 0, radius: 0, kind: '' });
    }

    _buildExplosions() {
      for (let i = 0; i < MAX_EXPL; i++) {
        const mat = this._basic(0xffa030, { transparent: true, opacity: 0, depthWrite: false });
        const mesh = new THREE.Mesh(this.A.g.expl, mat);
        mesh.visible = false;
        this._root.add(mesh);
        this.expl.push({ active: false, t: 0, dur: 0.5, r: 6, mesh: mesh, mat: mat });
      }
    }

    // ------------------------------------------------------------ kart state
    _initKart(k) {
      if (k._itm && k._itm.sys === this) return;
      const st = {
        sys: this, kart: k, pend: [null, null], pressed: false, pressId: null, holdT: 0, dragEnt: null,
        goldT: 0, goldCd: 0, heartT: 0, hearts: 0, src: '', orbG: null, orbR: null, heartM: null,
        orbShown: 0, orbType: '', hook: null,
      };
      const sys = this;
      st.hook = function (kind) {
        if (st.hearts <= 0 || st.src === 'lightning') return false;
        st.hearts--;
        if (st.hearts <= 0) st.heartT = 0;
        const give = ABSORB_GIVES[st.src];
        if (give) {
          if (k.heldItems[0] == null && !(k.roulette[0] > 0)) { k.heldItems[0] = give; k.itemCounts[0] = 1; }
          else if (k.heldItems[1] == null && !(k.roulette[1] > 0)) { k.heldItems[1] = give; k.itemCounts[1] = 1; }
        }
        sys._snd('heart', k);
        return true;
      };
      k._itm = st;
      k.onBeforeHit = st.hook;
    }

    _lazyOrbits(st) {
      if (st.orbG) return;
      const A = this.A;
      st.orbG = []; st.orbR = []; st.heartM = [];
      for (let i = 0; i < 3; i++) {
        st.orbG.push(this._shellMesh(A.green, 0.7));
        st.orbR.push(this._shellMesh(A.red, 0.7));
      }
      for (let i = 0; i < 2; i++) {
        const m = new THREE.Mesh(A.g.heart, A.pink);
        m.visible = false; this._root.add(m); st.heartM.push(m);
      }
    }

    // ------------------------------------------------------------ helpers
    _snd(name, k) {
      if (k && k.isPlayer && G.Sound && G.Sound.play) G.Sound.play(name);
    }
    _sndNear(name, x, z, r) {
      if (!(G.Sound && G.Sound.play)) return;
      const ks = this.karts;
      for (let i = 0; i < ks.length; i++) {
        const k = ks[i];
        if (!k.isPlayer) continue;
        const dx = k.pos.x - x, dz = k.pos.z - z;
        if (dx * dx + dz * dz < r * r) { G.Sound.play(name); return; }
      }
    }
    _kartY(k) { return k.y !== undefined ? k.y : k.pos.y; }

    _spawn(type) {
      const arr = this.pools[type];
      if (!arr) return null;
      let best = null, bestAge = -1;
      for (let i = 0; i < arr.length; i++) {
        const e = arr[i];
        if (!e.active) { best = e; break; }
        if (ETYPE[type].ground && e.state === 'ground' && e.age > bestAge) { bestAge = e.age; best = e; }
      }
      if (!best) return null;
      if (best.active) this._free(best);
      best.active = true;
      best.age = 0; best.state = ''; best.mode = ''; best.owner = null; best.target = null; best.bounces = 0;
      best.hint = -1; best.vx = best.vy = best.vz = 0; best.hover = 0.1; best.spin = 0; best.spinRate = 0;
      best.maxBounce = 5; best.life = 10; best.directR = 25; best.lastPick = 0; best.heldId = null;
      best.hitT.fill(-10); best.hitKind = 'flip';
      best.mesh.visible = true;
      return best;
    }

    _free(e) {
      if (!e.active) return;
      e.active = false; e.state = ''; e.mesh.visible = false;
      const o = e.owner;
      if (o && o._itm && o._itm.dragEnt === e) { o._itm.dragEnt = null; o.draggedItem = null; }
      e.owner = null; e.target = null;
    }

    _place(e, x, z, y) {
      e.x = x; e.z = z;
      const q = this.track.query(x, z, e.hint);
      e.hint = q.index; e.dist = q.dist;
      e.y = y !== undefined ? y : q.y;
    }

    _consume(k) {
      const c = (k.itemCounts[0] || 1) - 1;
      k.itemCounts[0] = c > 0 ? c : 0;
      if (c <= 0) k.heldItems[0] = null;
    }

    _inUse(id) {
      const ks = this.karts;
      for (let i = 0; i < ks.length; i++) {
        const k = ks[i], st = k._itm;
        for (let s = 0; s < 2; s++) {
          if (k.heldItems[s] === id) return true;
          if (st && k.roulette[s] > 0 && st.pend[s] === id) return true;
        }
      }
      if (id === 'lightning' && this.lightningTimer > 0) return true;
      if (id === 'spiny') {
        const arr = this.pools.spiny;
        for (let i = 0; i < arr.length; i++) if (arr[i].active) return true;
      }
      return false;
    }

    _specialFor(charId) {
      if (!this._specialOf) {
        this._specialOf = {};
        const cs = G.CHARACTERS || [];
        for (let i = 0; i < cs.length; i++) this._specialOf[cs[i].id] = cs[i].special;
      }
      return this._specialOf[charId] || null;
    }

    _decide(k, slot) {
      const n = Math.max(1, this.karts.length);
      const p = G.clamp(k.position || Math.ceil(n / 2), 1, n);
      const t = n > 1 ? (p - 1) / (n - 1) : 0;
      const w = this._w;
      for (const key in w) delete w[key];
      let A, B, f;
      if (t < 0.5) { A = W_FRONT; B = W_MID; f = t * 2; } else { A = W_MID; B = W_BACK; f = (t - 0.5) * 2; }
      for (let i = 0; i < ALL_KEYS.length; i++) {
        const key = ALL_KEYS[i];
        w[key] = (A[key] || 0) * (1 - f) + (B[key] || 0) * f;
      }
      if (n >= 4 && p >= n - 1) w.lightning = 5;
      if (n >= 6 && p >= 5) w.spiny = 6;
      if (w.lightning && this._inUse('lightning')) w.lightning = 0;
      if (w.spiny && this._inUse('spiny')) w.spiny = 0;
      const sp = this._specialFor(slot === 0 ? k.rear : k.front);
      if (sp && ITEMS_HAS(sp)) {
        w[sp] = (w[sp] || 0) + (t < 0.34 ? 8 : 18);
      }
      return G.weighted(w);
    }

    // ------------------------------------------------------------ public API
    giveItem(k, id, slot) {
      slot = slot || 0;
      k.heldItems[slot] = id; k.itemCounts[slot] = COUNT[id] || 1; k.roulette[slot] = 0;
      if (k._itm) k._itm.pend[slot] = null;
    }

    getHazards() {
      const out = this._hz, pool = this._hzPool, ents = this.ents;
      let n = 0;
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        if (!e.active || e.state === 'drag') continue;
        const h = pool[n++];
        h.x = e.x; h.z = e.z; h.radius = e.radius; h.kind = e.kind;
      }
      out.length = n;
      for (let i = 0; i < n; i++) out[i] = pool[i];
      return out;
    }

    reset() {
      for (let i = 0; i < this.ents.length; i++) this._free(this.ents[i]);
      for (let i = 0; i < this.expl.length; i++) { this.expl[i].active = false; this.expl[i].mesh.visible = false; }
      this._resetBoxes();
      this.lightningTimer = 0;
      this.t = 0;
      for (let i = 0; i < this.karts.length; i++) {
        const k = this.karts[i];
        this._initKart(k);
        const st = k._itm;
        st.pend[0] = st.pend[1] = null; st.pressed = false; st.dragEnt = null; st.goldT = 0; st.heartT = 0;
        st.hearts = 0; st.orbShown = 0; st.src = '';
        k.draggedItem = null;
        if (k.onBeforeHit == null) k.onBeforeHit = st.hook;
        if (st.orbG) {
          for (let j = 0; j < 3; j++) { st.orbG[j].visible = false; st.orbR[j].visible = false; }
          st.heartM[0].visible = false; st.heartM[1].visible = false;
        }
      }
      this._writeBoxMatrices();
    }

    dispose() {
      if (this._root.parent) this._root.parent.remove(this._root);
      for (let i = 0; i < this._disposables.length; i++) {
        const d = this._disposables[i];
        if (d && d.dispose) d.dispose();
      }
      this._disposables.length = 0;
      if (this.boxMesh && this.boxMesh.dispose) this.boxMesh.dispose();
      for (let i = 0; i < this.karts.length; i++) {
        const k = this.karts[i], st = k._itm;
        if (st && st.sys === this) {
          if (k.onBeforeHit === st.hook) k.onBeforeHit = null;
          k._itm = null; k.draggedItem = null;
        }
      }
      this.ents.length = 0;
    }

    // ------------------------------------------------------------ update
    update(dt, time) {
      this.t += dt;
      if (this.lightningTimer > 0) this.lightningTimer -= dt;
      this._updateBoxes(dt);
      const ks = this.karts;
      for (let i = 0; i < ks.length; i++) {
        const k = ks[i];
        if (!k._itm || k._itm.sys !== this) this._initKart(k);
        const st = k._itm;
        if (k.onBeforeHit !== st.hook && k.onBeforeHit == null) k.onBeforeHit = st.hook;
        this._tickRoulette(k, st, dt);
        this._tickInput(k, st, dt);
        this._tickTimers(k, st, dt);
      }
      this._updateEnts(dt);
      this._collide(dt);
      this._updateExplosions(dt);
      this._updateOrbits(dt);
    }

    // ---- boxes
    _updateBoxes(dt) {
      const N = this.nBoxes, n = this.nSpots;
      for (let i = 0; i < N; i++) {
        if (this.bAct[i]) {
          if (this.bS[i] < 1) this.bS[i] = Math.min(1, this.bS[i] + dt * 3);
          if (i >= n) { this.bL[i] -= dt; if (this.bL[i] <= 0) { this.bAct[i] = 0; this.bR[i] = -1; } }
        } else {
          if (this.bS[i] > 0) this.bS[i] = Math.max(0, this.bS[i] - dt * 8);
          if (this.bR[i] > 0) {
            this.bR[i] -= dt;
            if (this.bR[i] <= 0) { this.bAct[i] = 1; this.bS[i] = 0.001; }
          }
        }
      }
      const ks = this.karts;
      for (let ki = 0; ki < ks.length; ki++) {
        const k = ks[ki];
        if (k.finished || k.falling) continue;
        if (this._freeSlot(k) < 0) continue;
        const px = k.pos.x, pz = k.pos.z, py = this._kartY(k);
        for (let i = 0; i < N; i++) {
          if (!this.bAct[i] || this.bS[i] < 0.7) continue;
          const dx = this.bx[i] - px, dz = this.bz[i] - pz;
          if (dx * dx + dz * dz > 3.24) continue;
          if (Math.abs(this.by[i] - py) > 4) continue;
          this.bAct[i] = 0;
          this.bR[i] = i < n ? 3.0 : -1;
          this._pickup(k);
          if (this._freeSlot(k) < 0) break;
        }
      }
      this._writeBoxMatrices();
    }

    _freeSlot(k) {
      const st = k._itm;
      if (k.heldItems[0] == null && !(k.roulette[0] > 0)) return 0;
      if (k.heldItems[1] == null && !(k.roulette[1] > 0)) return 1;
      return -1;
    }

    _pickup(k) {
      const s = this._freeSlot(k);
      if (s < 0) return;
      const st = k._itm;
      st.pend[s] = this._decide(k, s);
      k.roulette[s] = 1.5;
      st.rouletteTick = 0;
      this._snd('item_box', k);
      this._snd('roulette', k);
    }

    _spawnTempBoxes(x, z, y) {
      const n = this.nSpots;
      let c = 0;
      for (let j = 0; j < TEMP_BOXES && c < 3; j++) {
        const i = n + j;
        if (this.bAct[i] || this.bS[i] > 0) continue;
        const a = (c / 3) * Math.PI * 2 + Math.random();
        this.bx[i] = x + Math.cos(a) * 2.8; this.bz[i] = z + Math.sin(a) * 2.8;
        this.by[i] = y;
        const q = this.track.query(this.bx[i], this.bz[i], -1);
        if (q.surface !== 'void') this.by[i] = q.y;
        this.bAct[i] = 1; this.bS[i] = 0.001; this.bL[i] = 25; this.bR[i] = -1;
        c++;
      }
    }

    // ---- roulette
    _tickRoulette(k, st, dt) {
      // handle swap moving roulette between slots
      for (let s = 0; s < 2; s++) {
        if (k.roulette[s] > 0 && st.pend[s] == null && st.pend[1 - s] != null && !(k.roulette[1 - s] > 0)) {
          st.pend[s] = st.pend[1 - s]; st.pend[1 - s] = null;
        }
      }
      for (let s = 0; s < 2; s++) {
        if (!(k.roulette[s] > 0)) continue;
        k.roulette[s] -= dt;
        if (s === 0 && k.isPlayer && k.input && k.input.itemPressed && 1.5 - k.roulette[s] > 0.5) {
          k.roulette[s] = 0;
          k.input.itemPressed = false;
        }
        if (k.roulette[s] <= 0) {
          k.roulette[s] = 0;
          const id = st.pend[s];
          st.pend[s] = null;
          if (id) {
            let slot = s;
            if (k.heldItems[slot] != null) slot = k.heldItems[1 - s] == null ? 1 - s : -1;
            if (slot >= 0) {
              k.heldItems[slot] = id; k.itemCounts[slot] = COUNT[id] || 1;
              this._snd('item_get', k);
            }
          }
        }
      }
    }

    // ---- input
    _tickInput(k, st, dt) {
      const inp = k.input;
      // consistency of dragged item
      if (st.dragEnt) {
        if (k.draggedItem !== st.dragEnt.heldId || k.heldItems[0] !== st.dragEnt.heldId) {
          const d = st.dragEnt; st.dragEnt = null; k.draggedItem = null; d.owner = null; this._free(d);
          st.pressed = false;
        }
      } else if (k.draggedItem) k.draggedItem = null;
      if (!inp) return;
      const id = k.heldItems[0];
      if (st.pressed && id !== st.pressId) st.pressed = false;
      if (k.finished || k.falling) { return; }
      if (k.roulette[0] > 0) return;
      if (inp.itemPressed && id && !st.pressed) {
        if (id === 'mushroom_gold' && st.goldT > 0) {
          this._useGoldTap(k, st);
        } else if (DRAGGABLE[id]) {
          st.pressed = true; st.holdT = 0; st.pressId = id;
        } else {
          this._useInstant(k, st, id, !!inp.throwBack);
        }
      } else if (inp.itemPressed && id === 'mushroom_gold' && st.goldT > 0) {
        this._useGoldTap(k, st);
      }
      if (st.pressed) {
        st.holdT += dt;
        const released = inp.itemReleased || !inp.item;
        if (released) {
          st.pressed = false;
          this._throwHeld(k, st, id, !!inp.throwBack);
        } else if (!st.dragEnt && st.holdT >= 0.15) {
          const e = this._spawn(ENT_OF[id]);
          if (e) {
            e.state = 'drag'; e.owner = k; e.heldId = id; e.life = 1e9;
            st.dragEnt = e; k.draggedItem = id;
            this._dragPos(e, k);
            e.mesh.position.set(e.x, e.y, e.z);
          }
        }
      }
    }

    _tickTimers(k, st, dt) {
      if (st.goldT > 0) {
        st.goldT -= dt;
        if (st.goldCd > 0) st.goldCd -= dt;
        if (st.goldT <= 0) {
          st.goldT = 0;
          if (k.heldItems[0] === 'mushroom_gold') { k.heldItems[0] = null; k.itemCounts[0] = 0; }
        }
      }
      if (st.heartT > 0) {
        st.heartT -= dt;
        if (st.heartT <= 0) { st.heartT = 0; st.hearts = 0; }
      }
    }

    _useGoldTap(k, st) {
      if (st.goldCd > 0) return;
      st.goldCd = 0.3;
      if (k.boost) k.boost(0.7);
      this._snd('boost', k);
    }

    _dragPos(e, k) {
      const back = e.kind === 'giant_banana' ? 3.0 : e.kind === 'mega_shell' ? 3.4 : 2.0;
      e.x = k.pos.x - Math.sin(k.heading) * back;
      e.z = k.pos.z - Math.cos(k.heading) * back;
      e.y = this._kartY(k);
    }

    _throwHeld(k, st, id, back) {
      if (!id) return;
      let e = st.dragEnt;
      if (e) { st.dragEnt = null; k.draggedItem = null; e.heldId = null; }
      else e = this._spawn(ENT_OF[id]);
      if (!e) { this._consume(k); return; }
      this._launch(k, id, e, back);
      this._consume(k);
    }

    _launch(k, id, e, back) {
      const h = k.heading, fx = Math.sin(h), fz = Math.cos(h);
      const spd = Math.max(0, k.speed || 0);
      const ky = this._kartY(k);
      e.owner = k; e.age = 0; e.bounces = 0; e.target = null; e.hint = k.trackIndex >= 0 ? k.trackIndex : -1;
      e.mesh.visible = true;
      const kind = e.kind;
      if (ETYPE[kind].ground || kind === 'bomb') {
        e.life = kind === 'bomb' ? 3 : 1e9;
        if (back) {
          this._place(e, k.pos.x - fx * 2.6, k.pos.z - fz * 2.6, undefined);
          e.state = 'ground'; e.vx = e.vz = 0;
          this._snd('drop', k);
        } else {
          const v = spd + (kind === 'bomb' ? 12 : kind === 'giant_banana' ? 10 : 16);
          e.x = k.pos.x + fx * 1.8; e.z = k.pos.z + fz * 1.8; e.y = ky + 0.6;
          e.vx = fx * v; e.vz = fz * v; e.vy = 10;
          e.state = 'air';
          this._snd('throw', k);
        }
        e.spinRate = kind === 'fake_box' ? 1.2 : 0.8;
        return;
      }
      // projectiles
      e.state = 'proj';
      e.mode = 'straight';
      e.life = 8; e.maxBounce = 5; e.hover = 0.1; e.hitKind = 'flip';
      const sx = back ? -1 : 1;
      this._place(e, k.pos.x + fx * 2.2 * sx, k.pos.z + fz * 2.2 * sx, ky);
      e.spinRate = 9;
      this._snd('throw', k);
      if (kind === 'shell_green') {
        const v = back ? 35 : spd + 45;
        e.vx = fx * v * sx; e.vz = fz * v * sx; e.speed = v;
      } else if (kind === 'shell_red' || kind === 'egg') {
        e.life = 12; e.speed = kind === 'egg' ? 46 : 52;
        e.vx = fx * e.speed * sx; e.vz = fz * e.speed * sx;
        if (!back) { e.mode = 'home'; e.target = this._pickTarget(k); }
        else e.speed = 40, e.vx = fx * -40, e.vz = fz * -40;
        if (kind === 'egg') e.spinRate = 5;
      } else if (kind === 'mega_shell') {
        e.life = 10; e.maxBounce = 9999; e.speed = 40; e.hover = 0.0; e.spinRate = 6;
        e.vx = fx * 40 * sx; e.vz = fz * 40 * sx;
      }
    }

    _pickTarget(k) {
      const ks = this.karts;
      let best = null, bd = 1e9;
      const my = k.raceDist || 0;
      for (let i = 0; i < ks.length; i++) {
        const o = ks[i];
        if (o === k || o.finished) continue;
        const d = (o.raceDist || 0) - my;
        if (d > 0 && d < bd) { bd = d; best = o; }
      }
      if (!best && k.position > 1) {
        for (let i = 0; i < ks.length; i++) if (ks[i].position === k.position - 1) best = ks[i];
      }
      return best;
    }

    _useInstant(k, st, id, back) {
      const h = k.heading, fx = Math.sin(h), fz = Math.cos(h);
      switch (id) {
        case 'mushroom': case 'mushroom3':
          if (k.boost) k.boost(1.0);
          this._snd('boost', k);
          this._consume(k);
          break;
        case 'mushroom_gold':
          st.goldT = 7; st.goldCd = 0.3;
          if (k.boost) k.boost(0.7);
          this._snd('boost', k);
          break;
        case 'star':
          k.starTimer = 8;
          this._snd('star', k);
          this._consume(k);
          break;
        case 'lightning':
          this._lightning(k);
          this._consume(k);
          break;
        case 'heart':
          st.hearts = 2; st.heartT = 12;
          this._snd('heart', k);
          this._consume(k);
          break;
        case 'fireball': {
          this._snd('fireball', k);
          const spd = Math.max(0, k.speed || 0);
          const ky = this._kartY(k);
          for (let i = 0; i < 5; i++) {
            const e = this._spawn('fireball');
            if (!e) break;
            const a = k.heading + (i - 2) * 0.22;
            const dx = Math.sin(a), dz = Math.cos(a), v = spd + 30;
            e.owner = k; e.state = 'proj'; e.mode = 'straight'; e.life = 4.5; e.maxBounce = 9999;
            e.hitKind = 'spin'; e.speed = v;
            this._place(e, k.pos.x + fx * 1.8, k.pos.z + fz * 1.8, ky + 0.3);
            e.vx = dx * v; e.vz = dz * v; e.vy = 5; e.spinRate = 10;
          }
          this._consume(k);
          break;
        }
        case 'shell_green3': case 'shell_red3': {
          const e = this._spawn(ENT_OF[id]);
          if (e) this._launch(k, id, e, back);
          this._consume(k);
          break;
        }
        case 'spiny': {
          const e = this._spawn('spiny');
          if (e) {
            const ky = this._kartY(k);
            e.owner = k; e.state = 'proj'; e.mode = 'home'; e.life = 16; e.speed = 62; e.directR = 38;
            e.hitKind = 'flip'; e.spinRate = 6; e.maxBounce = 9999;
            this._place(e, k.pos.x + fx * 1.5, k.pos.z + fz * 1.5, ky + 4);
            e.vx = fx * 62; e.vz = fz * 62; e.target = this._leader(k);
            this._snd('throw', k);
          }
          this._consume(k);
          break;
        }
        default:
          this._consume(k);
      }
    }

    _leader(except) {
      const ks = this.karts;
      let best = null;
      for (let i = 0; i < ks.length; i++) {
        const o = ks[i];
        if (o === except) continue;
        if (!best || (o.position || 99) < (best.position || 99)) best = o;
      }
      if (best && except && except.position === 1) return null;
      return best;
    }

    _lightning(owner) {
      const ks = this.karts, n = Math.max(2, ks.length);
      this.lightningTimer = 8;
      for (let i = 0; i < ks.length; i++) {
        const k = ks[i];
        if (k === owner) continue;
        if (k.isInvincible && k.isInvincible()) continue;
        const st = k._itm;
        if (st) st.src = 'lightning';
        k.hit && k.hit('squish');
        if (st) st.src = '';
        const t = G.clamp(((k.position || 1) - 1) / (n - 1), 0, 1);
        k.shrinkTimer = 4 + 4 * t;
        // drop items
        if (st) {
          if (st.dragEnt) { const d = st.dragEnt; st.dragEnt = null; d.owner = null; this._free(d); }
          st.pend[0] = st.pend[1] = null; st.pressed = false; st.goldT = 0;
        }
        k.draggedItem = null;
        k.heldItems[0] = k.heldItems[1] = null;
        k.itemCounts[0] = k.itemCounts[1] = 0;
        k.roulette[0] = k.roulette[1] = 0;
        G.events.emit('itemHit', { victim: k, kind: 'squish', attacker: owner, item: 'lightning' });
      }
      if (G.Sound && G.Sound.play) G.Sound.play('lightning');
      G.events.emit('lightning', { owner: owner });
    }

    // ---- entities
    _updateEnts(dt) {
      const ents = this.ents;
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        if (!e.active) continue;
        e.age += dt;
        e.spin += e.spinRate * dt;
        switch (e.state) {
          case 'drag': this._dragPos(e, e.owner); break;
          case 'air': this._stepAir(e, dt); break;
          case 'ground':
            if (e.kind === 'bomb' && e.age >= e.life) { this._detonate(e); }
            break;
          case 'proj': this._stepProj(e, dt); break;
        }
        if (!e.active) continue;
        const m = e.mesh;
        m.position.set(e.x, e.y, e.z);
        const kind = e.kind;
        if (kind === 'fake_box') { m.rotation.y = e.spin; m.userData.cube.position.y = 0.9 + Math.sin(this.t * 3 + i) * 0.1; }
        else if (kind === 'banana' || kind === 'giant_banana') m.rotation.y = (e.state === 'air' ? e.spin * 4 : e.heldId ? 0 : 0.6 + i);
        else if (kind === 'bomb') {
          if (e.state !== 'drag') {
            const rate = 8 + e.age * 6;
            e.spark.scale.setScalar(1.0 + 0.6 * Math.sin(e.age * rate));
          }
        } else m.rotation.y = e.spin;
      }
    }

    _stepAir(e, dt) {
      e.vy -= 24 * dt;
      e.x += e.vx * dt; e.z += e.vz * dt; e.y += e.vy * dt;
      const q = this.track.query(e.x, e.z, e.hint);
      e.hint = q.index;
      if (q.surface === 'void' && e.y < q.y - 10) { this._free(e); return; }
      const lim = (q.wallDist || q.halfWidth + 2) - 0.6;
      if (Math.abs(q.lateral) > lim) {
        const sgn = q.lateral > 0 ? 1 : -1, over = Math.abs(q.lateral) - lim;
        e.x -= q.rx * sgn * over; e.z -= q.rz * sgn * over;
        const vn = e.vx * q.rx + e.vz * q.rz;
        if (vn * sgn > 0) { e.vx -= 1.5 * vn * q.rx; e.vz -= 1.5 * vn * q.rz; }
      }
      if (e.y <= q.y) {
        e.y = q.y; e.state = 'ground'; e.vx = e.vz = e.vy = 0;
        if (e.kind !== 'bomb') e.age = 0.5;
      }
    }

    _steerHome(e, dt) {
      const T = e.target;
      let ax, az, rate = 8;
      const len = this.track.length;
      if (T && !T.finished && T.pos) {
        const dx = T.pos.x - e.x, dz = T.pos.z - e.z;
        if (dx * dx + dz * dz < e.directR * e.directR) { ax = T.pos.x; az = T.pos.z; rate = 14; }
      }
      if (ax === undefined) {
        const p = this.track.pointAt(wrapLen(e.dist + 18, len));
        let lat = 0;
        if (T && T.trackInfo) lat = G.clamp(T.trackInfo.lateral || 0, -p.halfWidth * 0.7, p.halfWidth * 0.7);
        ax = p.x + p.rx * lat; az = p.z + p.rz * lat;
      }
      let dx = ax - e.x, dz = az - e.z;
      const dl = Math.sqrt(dx * dx + dz * dz) || 1;
      dx /= dl; dz /= dl;
      let cl = Math.sqrt(e.vx * e.vx + e.vz * e.vz) || 1;
      let cx = e.vx / cl, cz = e.vz / cl;
      const f = Math.min(1, dt * rate);
      cx += (dx - cx) * f; cz += (dz - cz) * f;
      cl = Math.sqrt(cx * cx + cz * cz) || 1;
      e.vx = (cx / cl) * e.speed; e.vz = (cz / cl) * e.speed;
    }

    _stepProj(e, dt) {
      const kind = e.kind;
      if (e.mode === 'home') {
        if (kind === 'spiny' && e.age - e.lastPick > 0.5) { e.lastPick = e.age; e.target = this._leader(e.owner); }
        this._steerHome(e, dt);
      }
      e.x += e.vx * dt; e.z += e.vz * dt;
      const q = this.track.query(e.x, e.z, e.hint);
      e.hint = q.index; e.dist = q.dist;
      if (q.surface === 'void') {
        if (kind === 'spiny') { /* flies over */ } else { this._free(e); return; }
      }
      const gy = q.y;
      if (kind === 'fireball') {
        e.vy -= 34 * dt; e.y += e.vy * dt;
        if (e.y <= gy + 0.3) { e.y = gy + 0.3; e.vy = 6.5; }
      } else if (kind === 'spiny') {
        const T = e.target;
        let dive = false;
        if (T && T.pos) {
          const dx = T.pos.x - e.x, dz = T.pos.z - e.z, d2 = dx * dx + dz * dz;
          if (d2 < e.directR * e.directR) dive = true;
          if (d2 < 3.5 * 3.5) { this._detonate(e); return; }
        } else if (e.age > 5) { this._detonate(e); return; }
        const want = dive && T ? this._kartY(T) + 0.8 : gy + 7;
        e.y += (want - e.y) * Math.min(1, dt * (dive ? 5 : 3));
      } else {
        e.y = gy + e.hover;
      }
      // walls
      const lim = (q.wallDist || q.halfWidth + 2) - 0.7;
      if (Math.abs(q.lateral) > lim && kind !== 'spiny') {
        const sgn = q.lateral > 0 ? 1 : -1, over = Math.abs(q.lateral) - lim;
        e.x -= q.rx * sgn * over; e.z -= q.rz * sgn * over;
        const vn = e.vx * q.rx + e.vz * q.rz;
        if (vn * sgn > 0) {
          if (e.mode === 'home') { e.vx -= vn * q.rx; e.vz -= vn * q.rz; }
          else {
            e.vx -= 2 * vn * q.rx; e.vz -= 2 * vn * q.rz;
            e.bounces++;
            this._sndNear('wall', e.x, e.z, 25);
            if (e.bounces > e.maxBounce) { this._free(e); return; }
          }
        }
      }
      if (e.age > e.life) {
        if (kind === 'spiny') this._detonate(e); else this._free(e);
      }
    }

    // ---- collisions
    _hitKart(k, kind, attacker, src) {
      if (k.isInvincible && k.isInvincible()) return false;
      const st = k._itm;
      if (st) st.src = src;
      if (k.hit) k.hit(kind);
      if (st) st.src = '';
      G.events.emit('itemHit', { victim: k, kind: kind, attacker: attacker, item: src });
      return true;
    }

    _detonate(e) {
      const x = e.x, y = e.y, z = e.z, owner = e.owner;
      const spiny = e.kind === 'spiny';
      const src = e.kind;
      this._free(e);
      this._explode(x, y, z, spiny ? 6 : 7, owner, spiny, src);
    }

    _explode(x, y, z, r, owner, exemptOwner, src) {
      const ks = this.karts;
      for (let i = 0; i < ks.length; i++) {
        const k = ks[i];
        if (exemptOwner && k === owner) continue;
        const dx = k.pos.x - x, dz = k.pos.z - z, rr = r + 0.6;
        if (dx * dx + dz * dz > rr * rr) continue;
        if (Math.abs(this._kartY(k) - y) > r + 3) continue;
        if (this._hitKart(k, 'flip', owner, src)) this._snd('explosion', k);
      }
      // destroy nearby hazards / projectiles
      const ents = this.ents, lim = r * 0.8;
      for (let i = 0; i < ents.length; i++) {
        const h = ents[i];
        if (!h.active || h.state === 'drag' || h.kind === 'mega_shell') continue;
        const dx = h.x - x, dz = h.z - z;
        if (dx * dx + dz * dz < lim * lim) this._free(h);
      }
      for (let i = 0; i < this.expl.length; i++) {
        const ex = this.expl[i];
        if (ex.active) continue;
        ex.active = true; ex.t = 0; ex.r = r; ex.mesh.visible = true;
        ex.mesh.position.set(x, y + 0.8, z);
        break;
      }
      this._sndNear('explosion', x, z, 45);
    }

    _updateExplosions(dt) {
      for (let i = 0; i < this.expl.length; i++) {
        const ex = this.expl[i];
        if (!ex.active) continue;
        ex.t += dt;
        const f = ex.t / ex.dur;
        if (f >= 1) { ex.active = false; ex.mesh.visible = false; continue; }
        const s = ex.r * (0.25 + 0.75 * (1 - (1 - f) * (1 - f)));
        ex.mesh.scale.setScalar(s);
        ex.mat.opacity = 0.9 * (1 - f);
        ex.mat.color.setHex(f < 0.2 ? 0xffffff : f < 0.5 ? 0xffc040 : 0xff5a1a);
      }
    }

    _destroyDrag(k, explode) {
      const st = k._itm, d = st && st.dragEnt;
      if (!d) return;
      const x = d.x, y = d.y, z = d.z, kind = d.kind;
      st.dragEnt = null; k.draggedItem = null; d.owner = null;
      this._free(d);
      this._consume(k);
      if (explode && kind === 'bomb') this._explode(x, y, z, 7, k, false, 'bomb');
    }

    _collide(dt) {
      const ents = this.ents, karts = this.karts;
      const nE = ents.length;
      // entities vs karts
      for (let a = 0; a < nE; a++) {
        const e = ents[a];
        if (!e.active || e.state === 'drag') continue;
        const kind = e.kind;
        if (kind === 'spiny') continue;
        const r = e.radius, r2 = r * r;
        for (let i = 0; i < karts.length; i++) {
          const k = karts[i];
          if (k === e.owner && e.age < 0.4) continue;
          const dx = k.pos.x - e.x, dz = k.pos.z - e.z;
          if (dx * dx + dz * dz > r2) continue;
          if (Math.abs(this._kartY(k) - e.y) > 3.2) continue;
          if (kind === 'mega_shell' && e.age - e.hitT[i] < 2) continue;
          if (k.isInvincible && k.isInvincible()) {
            if (k.starTimer > 0 && kind !== 'mega_shell') {
              if (kind === 'bomb') this._detonate(e); else this._free(e);
              break;
            }
            continue;
          }
          const st = k._itm;
          // orbiting shell shield
          if (st && st.orbShown > 0 && (kind === 'shell_green' || kind === 'shell_red' || kind === 'fireball' || kind === 'egg')) {
            this._consume(k);
            this._free(e);
            this._snd('shell_hit', k);
            break;
          }
          this._onTouch(e, k, i);
          if (!e.active) break;
        }
      }
      // proj vs hazards / proj / dragged
      for (let a = 0; a < nE; a++) {
        const e = ents[a];
        if (!e.active || e.state !== 'proj' || e.kind === 'spiny') continue;
        const mega = e.kind === 'mega_shell';
        for (let b = 0; b < nE; b++) {
          const h = ents[b];
          if (h === e || !h.active) continue;
          if (h.state === 'drag' || h.kind === 'spiny') continue;
          if (h.state === 'proj') {
            if (b < a && !mega) continue;
            if (h.kind === 'mega_shell') continue;
            if (e.owner === h.owner && (e.age < 1 || h.age < 1)) continue;
          } else if (h.state !== 'ground') continue;
          const dx = h.x - e.x, dz = h.z - e.z;
          const rr = mega ? (e.radius + h.radius) * 0.6 : (e.radius + h.radius) * 0.5;
          if (dx * dx + dz * dz > rr * rr) continue;
          if (h.kind === 'bomb') this._detonate(h); else this._free(h);
          if (!mega) { this._free(e); break; }
        }
        if (!e.active || mega) continue;
        // dragged items block shells
        for (let i = 0; i < karts.length; i++) {
          const k = karts[i], st = k._itm, d = st && st.dragEnt;
          if (!d) continue;
          if (e.owner === k && e.age < 0.8) continue;
          const dx = d.x - e.x, dz = d.z - e.z;
          if (dx * dx + dz * dz > 1.8 * 1.8) continue;
          this._free(e);
          this._destroyDrag(k, true);
          this._sndNear('shell_hit', d.x, d.z, 30);
          break;
        }
      }
    }

    _onTouch(e, k, ki) {
      const kind = e.kind, att = e.owner;
      switch (kind) {
        case 'banana':
          this._hitKart(k, 'spin', att, kind); this._snd('banana_hit', k); this._free(e); break;
        case 'giant_banana': {
          this._hitKart(k, 'spin', att, kind); this._snd('banana_hit', k);
          const x = e.x, z = e.z, y = e.y;
          this._free(e);
          for (let j = 0; j < 3; j++) {
            const b = this._spawn('banana');
            if (!b) break;
            const a = (j / 3) * Math.PI * 2 + 0.5;
            b.state = 'ground'; b.owner = null; b.age = 0.5;
            this._place(b, x + Math.cos(a) * 2.4, z + Math.sin(a) * 2.4, undefined);
            b.mesh.position.set(b.x, b.y, b.z);
          }
          void y;
          break;
        }
        case 'fake_box':
          this._hitKart(k, 'flip', att, kind); this._snd('shell_hit', k); this._free(e); break;
        case 'bomb':
          this._detonate(e); break;
        case 'shell_green': case 'shell_red':
          this._hitKart(k, 'flip', att, kind); this._snd('shell_hit', k); this._free(e); break;
        case 'fireball':
          this._hitKart(k, 'spin', att, kind); this._snd('shell_hit', k); this._free(e); break;
        case 'egg': {
          this._hitKart(k, 'flip', att, kind); this._snd('egg', k);
          const x = e.x, z = e.z, y = e.y;
          this._free(e);
          this._spawnTempBoxes(x, z, y);
          break;
        }
        case 'mega_shell':
          e.hitT[ki] = e.age;
          this._hitKart(k, 'flip', att, kind); this._snd('shell_hit', k);
          break;
      }
    }

    // ---- orbit visuals (triple shells, hearts)
    _updateOrbits(dt) {
      const ks = this.karts, t = this.t;
      for (let i = 0; i < ks.length; i++) {
        const k = ks[i], st = k._itm;
        if (!st) continue;
        const id = k.heldItems[0];
        let n = 0, type = '';
        if ((id === 'shell_green3' || id === 'shell_red3') && !(k.roulette[0] > 0)) {
          n = Math.min(3, k.itemCounts[0] || 0); type = id;
        }
        if (n > 0 || st.hearts > 0 || st.orbShown > 0) this._lazyOrbits(st);
        if (st.orbG) {
          const kx = k.pos.x, kz = k.pos.z, ky = this._kartY(k);
          const setG = st.orbG, setR = st.orbR;
          for (let j = 0; j < 3; j++) {
            const mg = setG[j], mr = setR[j];
            const show = j < n;
            mg.visible = show && type === 'shell_green3';
            mr.visible = show && type === 'shell_red3';
            if (show) {
              const a = t * 4.5 + j * (Math.PI * 2 / n);
              const m = mg.visible ? mg : mr;
              m.position.set(kx + Math.cos(a) * 1.9, ky + 0.8, kz + Math.sin(a) * 1.9);
              m.rotation.y = -a;
            }
          }
          const hm = st.heartM;
          for (let j = 0; j < 2; j++) {
            const vis = j < st.hearts;
            hm[j].visible = vis;
            if (vis) {
              const a = t * 3.2 + j * Math.PI;
              const pul = 0.75 + Math.sin(t * 8 + j) * 0.08;
              hm[j].position.set(kx + Math.cos(a) * 2.0, ky + 1.5, kz + Math.sin(a) * 2.0);
              hm[j].rotation.y = -a + Math.PI / 2;
              hm[j].scale.setScalar(pul * (st.heartT < 2 && ((t * 8) | 0) % 2 ? 0.01 : 1));
            }
          }
        }
        st.orbShown = n; st.orbType = type;
      }
    }
  }

  function ITEMS_HAS(id) { return !!G.ITEMS[id]; }

  G.ItemSystem = ItemSystem;
})();
