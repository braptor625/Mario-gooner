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
    shell_triple: {
      name: 'Triple Shell', color: '#2fbf4a', kind: 'projectile', icon: shellIcon('#2fbf4a', '#1f8f37', 3),
    },
    chomp: {
      name: 'Chain Biter', color: '#2b2f45', kind: 'special',
      icon: svg('<circle cx="30" cy="34" r="22" fill="#20222f" ' + ST + '/>' +
        '<path d="M14 26 A18 18 0 0 1 26 15" fill="none" stroke="#8d96c4" stroke-width="4" stroke-linecap="round"/>' +
        '<ellipse cx="22" cy="28" rx="5" ry="6.5" fill="#fff"/><ellipse cx="37" cy="28" rx="5" ry="6.5" fill="#fff"/>' +
        '<circle cx="23" cy="30" r="2.4" fill="#1b1b2f"/><circle cx="36" cy="30" r="2.4" fill="#1b1b2f"/>' +
        '<path d="M13 41 Q30 56 47 41 Z" fill="#fff" ' + ST + '/>' +
        '<polygon points="18,43 21,50 24,44" fill="#fff" ' + ST.replace('3', '1.5') + '/>' +
        '<g fill="none" stroke="#9aa0b8" stroke-width="3"><ellipse cx="55" cy="13" rx="5" ry="3"/><ellipse cx="59" cy="22" rx="3" ry="5"/></g>'),
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
  function resolveId(id) { return id === 'shell_triple' ? (Math.random() < 0.5 ? 'shell_green3' : 'shell_red3') : id; }
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
    bomb: { n: 16, r: 1.8 },
    shell_green: { n: 16, r: 1.6 },
    shell_red: { n: 16, r: 1.6 },
    spiny: { n: 3, r: 1.6 },
    mega_shell: { n: 2, r: 2.7 },
    fireball: { n: 30, r: 1.5 },
    egg: { n: 6, r: 1.5 },
  };
  const ABSORB_GIVES = { banana: 'banana', giant_banana: 'banana', fake_box: 'fake_box', shell_green: 'shell_green', shell_red: 'shell_red' };
  const TEMP_BOXES = 12;
  const BOLT_N = 7;
  const BOX_RESPAWN = 1.5;

  // DD-style distribution anchors (front / mid / back). Specials are added per slot owner.
  const W_FRONT = { banana: 30, shell_green: 28, fake_box: 16, mushroom: 8, shell_red: 6 };
  const W_MID = { shell_red: 22, mushroom: 22, shell_green: 14, banana: 10, fake_box: 8, star: 3 };
  const W_BACK = { mushroom: 22, star: 18, shell_red: 14, shell_green: 6, banana: 3, fake_box: 3 };
  const W_BATTLE = { shell_green: 20, shell_red: 20, banana: 18, mushroom: 14, fake_box: 8, star: 8 };
  const ALL_KEYS = ['banana', 'shell_green', 'shell_red', 'mushroom', 'fake_box', 'star'];
  const SPECIALS = ['fireball', 'heart', 'egg', 'giant_banana', 'mega_shell', 'bomb', 'shell_triple', 'chomp', 'mushroom_gold'];
  const DROP_LIFE = 15;
  const MAX_DROPS = 32;
  const MAX_CHOMPS = 8;
  const CHOMP_TIME = 6;

  const RGBm = new Float32Array(3);
  function hsv(h, sat, v) {
    const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - sat), q = v * (1 - f * sat), t = v * (1 - (1 - f) * sat);
    switch (i % 6) {
      case 0: RGBm[0] = v; RGBm[1] = t; RGBm[2] = p; break;
      case 1: RGBm[0] = q; RGBm[1] = v; RGBm[2] = p; break;
      case 2: RGBm[0] = p; RGBm[1] = v; RGBm[2] = t; break;
      case 3: RGBm[0] = p; RGBm[1] = q; RGBm[2] = v; break;
      case 4: RGBm[0] = t; RGBm[1] = p; RGBm[2] = v; break;
      default: RGBm[0] = v; RGBm[1] = p; RGBm[2] = q; break;
    }
  }
  // glassy iridescent item box (instanced); mode 1 = fake box (red/orange, mirrored "?")
  const BOX_VERT = [
    'attribute vec2 aInfo;',
    'varying vec3 vN; varying vec3 vW; varying vec3 vL; varying vec2 vI; varying vec2 vUv;',
    'void main(){',
    '  mat4 m = modelMatrix;',
    '#ifdef USE_INSTANCING',
    '  m = modelMatrix * instanceMatrix;',
    '#endif',
    '  vec4 wp = m * vec4(position, 1.0);',
    '  vW = wp.xyz; vN = normalize(mat3(m[0].xyz, m[1].xyz, m[2].xyz) * normal);',
    '  vL = position / 0.65; vI = aInfo; vUv = uv;',
    '  gl_Position = projectionMatrix * viewMatrix * wp;',
    '}'].join('\n');
  const BOX_FRAG = [
    'uniform float uTime; uniform float uMode; uniform sampler2D uMap;',
    'varying vec3 vN; varying vec3 vW; varying vec3 vL; varying vec2 vI; varying vec2 vUv;',
    'void main(){',
    '  vec3 n = normalize(vN); vec3 v = normalize(cameraPosition - vW);',
    '  if (!gl_FrontFacing) n = -n;',
    '  float nv = abs(dot(n, v));',
    '  float fres = pow(1.0 - nv, 2.2);',
    '  float h = fract(dot(vL, vec3(0.30, 0.52, 0.27)) + uTime * 0.16 + (1.0 - nv) * 0.8 + vI.x * 0.13);',
    '  vec3 rb = 0.55 + 0.45 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67)));',
    '  if (vI.y > 0.5) rb = mix(rb, vec3(1.0, 0.78, 0.2), 0.5 + 0.12 * sin(uTime * 4.0));',
    '  if (uMode > 0.5) rb = mix(vec3(0.85, 0.05, 0.16), vec3(1.0, 0.5, 0.06), h);',
    '  vec3 a = abs(vL);',
    '  float e = max(max(min(a.x, a.y), min(a.y, a.z)), min(a.x, a.z));',
    '  float edge = smoothstep(0.80, 0.97, e);',
    '  vec3 L = normalize(vec3(0.4, 0.8, 0.45)); vec3 r = reflect(-L, n);',
    '  float spec = pow(max(dot(r, v), 0.0), 36.0);',
    '  vec3 col = mix(rb, vec3(1.0), fres * 0.5) + vec3(edge * 0.5) + vec3(spec * 0.9);',
    '  float alpha = 0.34 + fres * 0.45 + edge * 0.45 + spec * 0.6;',
    '  if (uMode > 0.5) { vec4 t = texture2D(uMap, vUv); col = mix(col, t.rgb, t.a); alpha = mix(alpha + 0.25, 1.0, t.a); }',
    '  if (!gl_FrontFacing) alpha *= 0.6;',
    '  gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.95));',
    '}'].join('\n');
  function wrapLen(d, len) { d %= len; return d < 0 ? d + len : d; }

  // ------------------------------------------------------------------ system
  class ItemSystem {
    constructor(scene, track, karts, opts) {
      opts = opts || {};
      this.mode = opts.mode || 'race';
      this.boxesOn = opts.boxes !== false;
      this.isArena = !!(track && track.isArena);
      this._disposed = false;
      this.scene = scene;
      this.track = track;
      this.karts = karts || [];
      this.t = 0;
      this.lightningTimer = 0;
      this.ents = [];
      this.pools = {};
      this.expl = [];
      this._bolts = [];
      for (let i = 0; i < 6; i++) this._bolts.push({ life: 0, max: 1, p: new Float32Array((BOLT_N + 1) * 3) });
      this.hub = G.Particles && scene ? G.Particles.hub(scene, this) : null;
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
      this._buildDrops();
      this._buildChomps();
      for (let i = 0; i < this.karts.length; i++) this._initKart(this.karts[i]);
      this._onLost = (d) => this._handleLost(d);
      G.events.on('kartLostItems', this._onLost);
    }

    // ------------------------------------------------------------ assets
    _track(o) { this._disposables.push(o); return o; }
    _mat(color, opts) {
      const p = Object.assign({ color: color }, opts || {});
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
      if (bg) { x.fillStyle = bg; x.fillRect(0, 0, 128, 128); }
      x.save();
      if (flip) { x.translate(128, 0); x.scale(-1, 1); }
      x.font = '900 100px "Arial Black", Arial, sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineJoin = 'round';
      x.lineWidth = 12; x.strokeStyle = 'rgba(40,10,50,0.9)';
      x.strokeText('?', 64, 70);
      const g = x.createLinearGradient(0, 20, 0, 110);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#ffe27a');
      x.fillStyle = g;
      x.fillText('?', 64, 70);
      x.restore();
      return this._track(new THREE.CanvasTexture(c));
    }

    // glossy toy-paint material (G.GFX.shiny when present)
    _shiny(color, opts) {
      opts = opts || {};
      const p = { color: color };
      if (opts.vertexColors) p.vertexColors = true;
      if (opts.emissive !== undefined) p.emissive = opts.emissive;
      const rim = { color: opts.rimColor !== undefined ? opts.rimColor : 0xffffff, strength: opts.rim !== undefined ? opts.rim : 0.55, power: 2.4 };
      let m;
      if (G.GFX && G.GFX.shiny) { p.rim = rim; m = G.GFX.shiny(p); }
      else m = new THREE.MeshPhongMaterial(Object.assign({ shininess: 85, specular: 0x666666 }, p));
      return this._track(m);
    }

    // merge parts [{g, c, x,y,z, rx,ry,rz, sx,sy,sz}] into one vertex-colored geometry
    _merge(parts) {
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      const v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
      const P = [], N = [], C = [], U = [];
      for (let i = 0; i < parts.length; i++) {
        const pt = parts[i];
        const g = pt.g.index ? pt.g.toNonIndexed() : pt.g.clone();
        e.set(pt.rx || 0, pt.ry || 0, pt.rz || 0);
        q.setFromEuler(e);
        m4.compose(v.set(pt.x || 0, pt.y || 0, pt.z || 0), q, sc.set(pt.sx === undefined ? 1 : pt.sx, pt.sy === undefined ? 1 : pt.sy, pt.sz === undefined ? 1 : pt.sz));
        g.applyMatrix4(m4);
        col.setHex(pt.c);
        const pa = g.attributes.position.array, na = g.attributes.normal.array, ua = g.attributes.uv ? g.attributes.uv.array : null;
        const cnt = g.attributes.position.count;
        for (let j = 0; j < pa.length; j++) { P.push(pa[j]); N.push(na[j]); }
        for (let j = 0; j < cnt; j++) { C.push(col.r, col.g, col.b); U.push(ua ? ua[j * 2] : 0, ua ? ua[j * 2 + 1] : 0); }
        g.dispose();
      }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      out.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      return this._geo(out);
    }

    _boxGeo(n, perInstance) {
      const g = new THREE.BoxGeometry(1.3, 1.3, 1.3);
      const cnt = g.attributes.position.count;
      if (perInstance) {
        const at = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2);
        g.setAttribute('aInfo', at);
      } else g.setAttribute('aInfo', new THREE.BufferAttribute(new Float32Array(cnt * 2), 2));
      return this._geo(g);
    }

    _boxMat(fake, map) {
      return this._track(new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uMode: { value: fake ? 1 : 0 }, uMap: { value: map } },
        vertexShader: BOX_VERT, fragmentShader: BOX_FRAG,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
      }));
    }

    _buildAssets() {
      const A = (this.A = {});
      A.mShiny = this._shiny(0xffffff, { vertexColors: true });
      A.mFlash = this._shiny(0xffffff, { vertexColors: true, emissive: 0xff2a10 });
      A.pink = this._shiny(0xff5b8a, { emissive: 0x7a1236, rimColor: 0xffb0c8 });
      A.chomp = this._shiny(0xffffff, { vertexColors: true, rimColor: 0x8899ff, rim: 0.8 });

      const g = (A.g = {});
      g.dome = new THREE.SphereGeometry(0.6, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
      g.base = new THREE.CylinderGeometry(0.66, 0.6, 0.2, 28);
      g.band = new THREE.TorusGeometry(0.62, 0.075, 10, 32);
      g.ridge = new THREE.TorusGeometry(0.6, 0.032, 6, 20, Math.PI);
      g.spike = new THREE.ConeGeometry(0.13, 0.42, 10);
      g.sphere = new THREE.SphereGeometry(0.5, 24, 18);
      g.tip = new THREE.SphereGeometry(0.14, 10, 8);
      g.fuse = new THREE.CylinderGeometry(0.06, 0.06, 0.34, 8);
      g.cap = new THREE.CylinderGeometry(0.2, 0.24, 0.16, 12);
      g.tooth = new THREE.ConeGeometry(0.17, 0.5, 8);
      const hs = new THREE.Shape();
      hs.moveTo(0, -0.45);
      hs.bezierCurveTo(-0.7, 0.05, -0.45, 0.55, -0.2, 0.5);
      hs.bezierCurveTo(-0.08, 0.48, 0, 0.38, 0, 0.3);
      hs.bezierCurveTo(0, 0.38, 0.08, 0.48, 0.2, 0.5);
      hs.bezierCurveTo(0.45, 0.55, 0.7, 0.05, 0, -0.45);
      const hg = new THREE.ExtrudeGeometry(hs, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 4, curveSegments: 14 });
      hg.translate(0, 0, -0.07);
      hg.computeVertexNormals();
      g.heart = this._geo(hg);
      this._shellGeos = {};
      this._bananaGeo = null; this._bombGeo = null; this._eggGeo = null; this._chompGeo = null;
    }

    _shellGeo(kind) {
      let geo = this._shellGeos[kind];
      if (geo) return geo;
      const g = this.A.g;
      const pal = {
        green: [0x18c648, 0x7cf08e, 0],
        red: [0xe5202c, 0xff8a7a, 0],
        spiny: [0x2457e6, 0x8fb0ff, 6],
        mega: [0x18c648, 0x7cf08e, 8],
      }[kind];
      const parts = [
        { g: g.dome, c: pal[0], y: 0.2, sy: 0.85 },
        { g: g.base, c: 0xfff1c9, y: 0.1 },
        { g: g.band, c: 0xffffff, y: 0.22, rx: Math.PI / 2, sy: 1, sz: 1.0 },
      ];
      for (let i = 0; i < 3; i++) parts.push({ g: g.ridge, c: pal[1], y: 0.2, ry: (i / 3) * Math.PI, sy: 0.88, sz: 1.0 });
      const n = pal[2], spk = kind === 'mega' ? 0xffd23a : 0xffffff;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        parts.push({ g: g.spike, c: spk, x: Math.cos(a) * 0.42, y: 0.5, z: Math.sin(a) * 0.42, rz: -Math.cos(a) * 0.55, rx: Math.sin(a) * 0.55 });
      }
      if (n) parts.push({ g: g.spike, c: spk, y: 0.85 });
      geo = this._shellGeos[kind] = this._merge(parts);
      return geo;
    }

    _getBananaGeo() {
      if (this._bananaGeo) return this._bananaGeo;
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const a = (-1 + i / 4) * 1.15;
        pts.push(new THREE.Vector3(Math.sin(a) * 0.5, (1 - Math.cos(a)) * 0.5 - 0.0, 0));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const SEG = 28, RAD = 12;
      const tube = new THREE.TubeGeometry(curve, SEG, 0.15, RAD, false);
      const pa = tube.attributes.position;
      const c = new THREE.Vector3();
      for (let i = 0; i <= SEG; i++) {
        const u = i / SEG;
        curve.getPointAt(u, c);
        const tp = 0.45 + 0.55 * Math.pow(Math.sin(u * Math.PI), 0.55);
        for (let j = 0; j <= RAD; j++) {
          const idx = i * (RAD + 1) + j;
          pa.setXYZ(idx, c.x + (pa.getX(idx) - c.x) * tp, c.y + (pa.getY(idx) - c.y) * tp, c.z + (pa.getZ(idx) - c.z) * tp);
        }
      }
      tube.computeVertexNormals();
      const g = this.A.g, e0 = pts[0], e1 = pts[8];
      this._bananaGeo = this._merge([
        { g: tube, c: 0xffd81e },
        { g: g.tip, c: 0x6b3a14, x: e0.x, y: e0.y, z: e0.z, sx: 0.8, sy: 0.8, sz: 0.8 },
        { g: g.tip, c: 0x6b3a14, x: e1.x, y: e1.y, z: e1.z, sx: 0.8, sy: 1.2, sz: 0.8 },
        { g: g.fuse, c: 0x8a5a24, x: e1.x + 0.03, y: e1.y + 0.1, z: e1.z, sx: 0.9, sy: 0.55, sz: 0.9, rz: -0.35 },
      ]);
      tube.dispose();
      return this._bananaGeo;
    }

    _getBombGeo() {
      if (this._bombGeo) return this._bombGeo;
      const g = this.A.g;
      this._bombGeo = this._merge([
        { g: g.sphere, c: 0x14141f, y: 0.62, sx: 1.2, sy: 1.15, sz: 1.2 },
        { g: g.cap, c: 0x9aa0b4, y: 1.24 },
        { g: g.fuse, c: 0x8a5a24, y: 1.4, sx: 1, sy: 0.9, sz: 1 },
        { g: g.sphere, c: 0xffffff, x: -0.24, y: 0.78, z: 0.5, sx: 0.3, sy: 0.42, sz: 0.2 },
        { g: g.sphere, c: 0xffffff, x: 0.24, y: 0.78, z: 0.5, sx: 0.3, sy: 0.42, sz: 0.2 },
        { g: g.sphere, c: 0x0a0a20, x: -0.24, y: 0.76, z: 0.58, sx: 0.14, sy: 0.22, sz: 0.1 },
        { g: g.sphere, c: 0x0a0a20, x: 0.24, y: 0.76, z: 0.58, sx: 0.14, sy: 0.22, sz: 0.1 },
        { g: g.sphere, c: 0xffb21a, x: -0.3, y: 0.08, z: 0.2, sx: 0.5, sy: 0.3, sz: 0.7 },
        { g: g.sphere, c: 0xffb21a, x: 0.3, y: 0.08, z: 0.2, sx: 0.5, sy: 0.3, sz: 0.7 },
      ]);
      return this._bombGeo;
    }

    _getEggGeo() {
      if (this._eggGeo) return this._eggGeo;
      const g = this.A.g, CY = 0.7;
      const parts = [{ g: g.sphere, c: 0xfff0c2, y: CY, sx: 0.85, sy: 1.15, sz: 0.85 }];
      const spots = [[0.6, 0.45, 0.65, 0x59b8ff, 1], [-0.65, 0.05, 0.7, 0xff7aa8, 1.2], [0, -0.1, -0.95, 0x59b8ff, 1.1], [0.1, 0.9, -0.3, 0xff7aa8, 0.8], [-0.7, 0.5, -0.5, 0x59b8ff, 0.9], [0.8, -0.2, -0.3, 0xff7aa8, 0.9]];
      for (let i = 0; i < spots.length; i++) {
        const s = spots[i], l = Math.hypot(s[0], s[1], s[2]);
        const dx = s[0] / l, dy = s[1] / l, dz = s[2] / l;
        parts.push({ g: g.sphere, c: s[3], x: dx * 0.425 * 0.96, y: CY + dy * 0.575 * 0.96, z: dz * 0.425 * 0.96, sx: 0.3 * s[4], sy: 0.3 * s[4], sz: 0.3 * s[4] });
      }
      this._eggGeo = this._merge(parts);
      return this._eggGeo;
    }

    _getChompGeo() {
      if (this._chompGeo) return this._chompGeo;
      const g = this.A.g, parts = [{ g: g.sphere, c: 0x0b0b12, sx: 3, sy: 3, sz: 3 }];
      for (let s = -1; s <= 1; s += 2) {
        parts.push({ g: g.sphere, c: 0xffffff, x: s * 0.6, y: 0.65, z: 1.05, sx: 0.85, sy: 0.85, sz: 0.85 });
        parts.push({ g: g.sphere, c: 0x0a0a30, x: s * 0.6, y: 0.65, z: 1.42, sx: 0.4, sy: 0.4, sz: 0.4 });
      }
      parts.push({ g: new THREE.CircleGeometry(0.85, 20), c: 0x7a0f1e, y: -0.35, z: 1.47, sy: 0.55 });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        parts.push({ g: g.tooth, c: 0xffffff, x: Math.cos(a) * 0.82, y: -0.35 + Math.sin(a) * 0.46, z: 1.5, rx: Math.PI / 2 });
      }
      this._chompGeo = this._merge(parts);
      return this._chompGeo;
    }

    _shellMesh(kind, scale) {
      const m = new THREE.Mesh(this._shellGeo(kind), this.A.mShiny);
      m.scale.setScalar(scale);
      m.castShadow = true;
      return m;
    }

    _makeMesh(type) {
      const A = this.A;
      let grp;
      switch (type) {
        case 'banana': case 'giant_banana': {
          grp = new THREE.Group();
          const inner = new THREE.Mesh(this._getBananaGeo(), A.mShiny);
          inner.rotation.x = -Math.PI / 2; inner.position.y = 0.34;
          inner.scale.setScalar(type === 'giant_banana' ? 2.4 : 1.3);
          inner.castShadow = true;
          grp.add(inner);
          break;
        }
        case 'fake_box': {
          grp = new THREE.Group();
          const m = new THREE.Mesh(this._fakeGeo, this.fakeMat);
          m.position.y = 0.9; m.renderOrder = 3; grp.add(m);
          grp.userData.cube = m;
          break;
        }
        case 'bomb': {
          grp = new THREE.Group();
          const b = new THREE.Mesh(this._getBombGeo(), A.mShiny);
          b.castShadow = true; grp.add(b);
          grp.userData.body = b;
          break;
        }
        case 'shell_green': grp = this._shellMesh('green', 1.2); break;
        case 'shell_red': grp = this._shellMesh('red', 1.2); break;
        case 'spiny': grp = this._shellMesh('spiny', 1.5); break;
        case 'mega_shell': grp = this._shellMesh('mega', 3.2); break;
        case 'fireball': grp = new THREE.Group(); break; // sprites only
        case 'egg': {
          grp = new THREE.Mesh(this._getEggGeo(), A.mShiny);
          grp.castShadow = true;
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
      const spots = (this.boxesOn && this.track && this.track.itemBoxSpots) || [];
      let n = 0;
      for (let i = 0; i < spots.length; i++) n += spots[i].double ? 2 : 1;
      this.nSpots = n;
      const N = n + TEMP_BOXES;
      this.nBoxes = N;
      const mapB = this._qTexture(true, null);
      const mapA = this._qTexture(false, null);
      this.fakeMat = this._boxMat(true, mapB);
      this._fakeGeo = this._boxGeo(0, false);
      this.boxMat = this._boxMat(false, mapB);
      const bg = this._boxGeo(N, true);
      this.bx = new Float32Array(N); this.by = new Float32Array(N); this.bz = new Float32Array(N);
      this.bS = new Float32Array(N); this.bR = new Float32Array(N); this.bL = new Float32Array(N);
      this.bAct = new Uint8Array(N);
      this.bPair = new Int16Array(N).fill(-1);
      this.bDbl = new Uint8Array(N);
      let j = 0;
      for (let i = 0; i < spots.length; i++) {
        const sp = spots[i], y = sp.y || 0;
        if (sp.double) {
          let rx = 1, rz = 0;
          const q = this.track.query && this.track.query(sp.x, sp.z, -1, y);
          if (q && isFinite(q.rx) && isFinite(q.rz) && (q.rx || q.rz)) { rx = q.rx; rz = q.rz; }
          for (let s = 0; s < 2; s++) {
            const o = s ? 1.15 : -1.15;
            this.bx[j + s] = sp.x + rx * o; this.bz[j + s] = sp.z + rz * o; this.by[j + s] = y;
            this.bPair[j + s] = j + 1 - s; this.bDbl[j + s] = 1;
          }
          j += 2;
        } else {
          this.bx[j] = sp.x; this.by[j] = y; this.bz[j] = sp.z; j++;
        }
      }
      const info = bg.attributes.aInfo.array;
      for (let i = 0; i < N; i++) { info[i * 2] = (i * 0.618) % 1; info[i * 2 + 1] = this.bDbl[i]; }
      this.boxMesh = new THREE.InstancedMesh(bg, this.boxMat, N);
      this.boxMesh.frustumCulled = false;
      this.boxMesh.renderOrder = 4;
      this.boxMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this._root.add(this.boxMesh);
      // inner rotating "?" : a thin stack of alpha-tested slices (reads as a slab), one draw call
      const slices = [];
      const pg = new THREE.PlaneGeometry(0.9, 0.9);
      for (let s = 0; s < 5; s++) {
        const z = (s - 2) * 0.035, sh = s === 2 ? 1 : (s === 0 || s === 4) ? 0.5 : 0.75;
        slices.push({ g: pg, c: new THREE.Color(sh, sh, sh).getHex(), z: z });
      }
      const qg = this._merge(slices);
      pg.dispose();
      this.qMat = this._track(new THREE.MeshBasicMaterial({ map: mapA, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide }));
      this.qMesh = new THREE.InstancedMesh(qg, this.qMat, N);
      this.qMesh.frustumCulled = false;
      this.qMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const cc = new THREE.Color();
      for (let i = 0; i < N; i++) {
        if (this.bDbl[i]) cc.setRGB(1, 0.82, 0.25); else cc.setRGB(0.9, 1, 1);
        this.qMesh.setColorAt(i, cc);
      }
      this.qMesh.instanceColor.needsUpdate = true;
      this._root.add(this.qMesh);
      this._resetBoxes();
      this._writeBoxMatrices();
      void A;
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
      const te = this.boxMesh.instanceMatrix.array, qe = this.qMesh.instanceMatrix.array, t = this.t;
      const hub = this.hub, A = hub ? hub.add : null;
      this.boxMat.uniforms.uTime.value = t;
      this.fakeMat.uniforms.uTime.value = t;
      let halos = 0;
      for (let i = 0; i < this.nBoxes; i++) {
        const s = this.bS[i], a = t * 1.6 + i * 0.7, c = Math.cos(a) * s, sn = Math.sin(a) * s, o = i * 16;
        const bob = this.by[i] + 1.15 + Math.sin(t * 2.2 + (this.bDbl[i] ? 0 : i)) * 0.15;
        te[o] = c; te[o + 1] = 0; te[o + 2] = -sn; te[o + 3] = 0;
        te[o + 4] = 0; te[o + 5] = s; te[o + 6] = 0; te[o + 7] = 0;
        te[o + 8] = sn; te[o + 9] = 0; te[o + 10] = c; te[o + 11] = 0;
        te[o + 12] = this.bx[i]; te[o + 13] = bob; te[o + 14] = this.bz[i]; te[o + 15] = 1;
        // inner "?" spins the other way, tilts and bobs a little inside the cube
        const b = -t * 2.6 + i * 1.3, qc = Math.cos(b) * s, qs = Math.sin(b) * s;
        qe[o] = qc; qe[o + 1] = 0; qe[o + 2] = -qs; qe[o + 3] = 0;
        qe[o + 4] = 0; qe[o + 5] = s; qe[o + 6] = 0; qe[o + 7] = 0;
        qe[o + 8] = qs; qe[o + 9] = 0; qe[o + 10] = qc; qe[o + 11] = 0;
        qe[o + 12] = this.bx[i]; qe[o + 13] = bob + Math.sin(t * 3.1 + i) * 0.04; qe[o + 14] = this.bz[i]; qe[o + 15] = 1;
        if (A && s > 0.05 && halos < 180) {
          halos++;
          const dbl = this.bDbl[i];
          const pul = 0.9 + 0.1 * Math.sin(t * 3 + i * 1.7);
          hsv((t * 0.18 + i * 0.13) % 1, dbl ? 0.45 : 0.55, 1);
          if (dbl) { RGBm[0] = 1; RGBm[1] = 0.8 - 0.1 * Math.sin(t * 4); RGBm[2] = 0.25; }
          A.put(0, 0, this.bx[i], bob, this.bz[i], (dbl ? 3.7 : 3.1) * s * pul, RGBm[0], RGBm[1], RGBm[2], dbl ? 0.4 : 0.3, 0, 0, 0, 0);
          const tw = Math.sin(t * 2.3 + i * 2.1);
          if (tw > 0.2) A.put(1, 0, this.bx[i] + 0.55, bob + 0.5, this.bz[i] + 0.2, (tw - 0.2) * 1.2 * s, 1, 1, 1, 0.9, 0, 0, 0, t * 0.6 + i);
          if (dbl) A.put(1, 0, this.bx[i] - 0.5, bob - 0.4, this.bz[i], 0.5 * s * (0.6 + 0.4 * Math.sin(t * 5 + i)), 1, 0.9, 0.4, 0.9, 0, 0, 0, -t);
        }
      }
      this.boxMesh.instanceMatrix.needsUpdate = true;
      this.qMesh.instanceMatrix.needsUpdate = true;
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
      for (let i = 0; i < total + MAX_CHOMPS; i++) this._hzPool.push({ x: 0, z: 0, radius: 0, kind: '' });
    }

    _buildExplosions() { /* explosions are particle bursts on the shared FX hub */ }

    // ------------------------------------------------------------ visual effects (pooled, hub-based)
    _fxBoxBreak(i) {
      const hub = this.hub;
      if (!hub) return;
      const A = hub.add, rnd = Math.random;
      const x = this.bx[i], y = this.by[i] + 1.15, z = this.bz[i], dbl = this.bDbl[i];
      A.spawn(0, 0, x, y, z, 0, 0, 0, 0.3, 2.4, 6.5, 1, 1, 0.95, 0.9, 0, 0);
      A.endColor(0.4, 0.7, 1);
      A.spawn(2, 0, x, y, z, 0, 0, 0, 0.4, 1.2, 5.2, 1, 1, 1, 0.8, 0, 0);
      const n = dbl ? 22 : 16;
      for (let j = 0; j < n; j++) {
        hsv(rnd(), 0.65, 1);
        const a = rnd() * 6.283, b = (rnd() - 0.4) * 2.4, sp = 3 + rnd() * 7;
        A.endColor(RGBm[0], RGBm[1], RGBm[2]);
        A.spawn(1, 0, x, y, z, Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp + 2, Math.sin(a) * Math.cos(b) * sp, 0.5 + rnd() * 0.5, 0.7, 0.12, 1, 1, 1, 1, 6, 2.2);
      }
      for (let j = 0; j < 14; j++) {
        hsv(rnd(), 0.8, 1);
        const a = rnd() * 6.283, sp = 5 + rnd() * 9;
        A.endColor(RGBm[0] * 0.6, RGBm[1] * 0.6, RGBm[2] * 0.6);
        A.spawn(0, 1, x, y, z, Math.cos(a) * sp, 2 + rnd() * 8, Math.sin(a) * sp, 0.55 + rnd() * 0.35, 0.2, 0.12, RGBm[0], RGBm[1], RGBm[2], 1, 24, 0.5);
      }
    }

    _fxExplosion(x, y, z, r) {
      const hub = this.hub;
      if (!hub) return;
      const A = hub.add, S = hub.alpha, rnd = Math.random, k = r / 7;
      y += 0.8;
      A.spawn(0, 0, x, y, z, 0, 0, 0, 0.22, r * 0.7, r * 1.9, 1, 0.95, 0.8, 1, 0, 0);
      for (let j = 0; j < 18; j++) {
        const a = rnd() * 6.283, b = rnd() * 1.4, sp = r * (1.0 + rnd() * 2.2);
        A.endColor(0.85, 0.1, 0.02);
        A.spawn(0, 0, x, y, z, Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp * 0.9 + r * 0.6, Math.sin(a) * Math.cos(b) * sp, 0.5 + rnd() * 0.4, r * 0.4, r * 1.05, 1, 0.82, 0.3, 0.95, -2.5, 2.6);
      }
      for (let j = 0; j < 26; j++) {
        const a = rnd() * 6.283, b = rnd() * 1.5, sp = (13 + rnd() * 18) * (0.6 + k * 0.4);
        A.endColor(1, 0.3, 0.05);
        A.spawn(0, 1, x, y, z, Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp + 4, Math.sin(a) * Math.cos(b) * sp, 0.45 + rnd() * 0.5, 0.17, 0.07, 1, 0.85, 0.35, 1, 26, 0.5);
      }
      for (let j = 0; j < 6; j++) {
        const a = rnd() * 6.283, sp = 6 + rnd() * 6;
        A.spawn(1, 0, x, y, z, Math.cos(a) * sp, 3 + rnd() * 6, Math.sin(a) * sp, 0.5, 1.2, 0.2, 1, 0.95, 0.7, 1, 10, 1.5);
      }
      A.endColor(1, 0.35, 0.08);
      A.spawn(2, 2, x, y - 0.6, z, 0, 0, 0, 0.55, r * 0.5, r * 3.4, 1, 0.9, 0.6, 0.95, 0, 0);
      A.endColor(0.6, 0.8, 1);
      A.spawn(2, 0, x, y, z, 0, 0, 0, 0.35, r * 0.4, r * 2.2, 1, 1, 1, 0.7, 0, 0);
      for (let j = 0; j < 12; j++) {
        const a = rnd() * 6.283, sp = r * (0.3 + rnd() * 0.8);
        S.endColor(0.5, 0.47, 0.45);
        S.spawn(3, 0, x + Math.cos(a) * r * 0.2, y, z + Math.sin(a) * r * 0.2, Math.cos(a) * sp, 2 + rnd() * 4, Math.sin(a) * sp, 1.1 + rnd() * 0.7, r * 0.4, r * 1.5, 0.16, 0.14, 0.13, 0.6, -0.6, 1.4);
      }
    }

    _fxHit(k, src) {
      const hub = this.hub;
      if (!hub || src === 'bomb' || src === 'spiny') return;
      const A = hub.add, rnd = Math.random;
      const x = k.pos.x, y = this._kartY(k) + 1.1, z = k.pos.z;
      let r = 1, g = 0.85, b = 0.3, er = 1, eg = 0.35, eb = 0.05;
      if (src === 'banana' || src === 'giant_banana') { r = 1; g = 0.95; b = 0.3; er = 1; eg = 0.7; eb = 0.1; }
      else if (src === 'fake_box') { r = 1; g = 0.3; b = 0.5; er = 0.7; eg = 0.1; eb = 0.9; }
      else if (src === 'shell_green') { r = 0.6; g = 1; b = 0.5; er = 0.2; eg = 0.8; eb = 0.3; }
      else if (src === 'shell_red' || src === 'fireball') { r = 1; g = 0.6; b = 0.3; er = 1; eg = 0.15; eb = 0.05; }
      else if (src === 'egg') { r = 1; g = 0.7; b = 0.9; er = 0.5; eg = 0.8; eb = 1; }
      else if (src === 'chomp') { r = 1; g = 1; b = 1; er = 0.6; eg = 0.4; eb = 1; }
      A.spawn(0, 0, x, y, z, 0, 0, 0, 0.28, 1.6, 4.4, 1, 1, 0.9, 0.9, 0, 0);
      A.endColor(er, eg, eb);
      A.spawn(2, 0, x, y, z, 0, 0, 0, 0.35, 0.8, 5.2, r, g, b, 0.85, 0, 0);
      for (let j = 0; j < 8; j++) {
        const a = (j / 8) * 6.283 + rnd() * 0.5, sp = 5 + rnd() * 5;
        A.endColor(er, eg, eb);
        A.spawn(1, 0, x, y, z, Math.cos(a) * sp, 2 + rnd() * 5, Math.sin(a) * sp, 0.5 + rnd() * 0.2, 1.4, 0.3, r, g, b, 1, 8, 2);
      }
      for (let j = 0; j < 10; j++) {
        const a = rnd() * 6.283, sp = 8 + rnd() * 10;
        A.endColor(er, eg, eb);
        A.spawn(0, 1, x, y, z, Math.cos(a) * sp, 3 + rnd() * 7, Math.sin(a) * sp, 0.35 + rnd() * 0.3, 0.14, 0.05, 1, 1, 0.8, 1, 24, 0.6);
      }
    }

    _fxBolt(k) {
      let b = null;
      for (let i = 0; i < this._bolts.length; i++) if (this._bolts[i].life <= 0) { b = this._bolts[i]; break; }
      if (!b) b = this._bolts[0];
      b.life = 0.55; b.max = 0.55;
      const x = k.pos.x, z = k.pos.z, y = this._kartY(k), n = BOLT_N;
      let ox = 0, oz = 0;
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        const sway = (i === 0 || i === n) ? 0 : 1;
        ox = ox * 0.4 + (Math.random() - 0.5) * 3.6 * sway; oz = oz * 0.4 + (Math.random() - 0.5) * 3.6 * sway;
        b.p[i * 3] = x + ox; b.p[i * 3 + 1] = y + 60 * (1 - f) + 0.6; b.p[i * 3 + 2] = z + oz;
      }
      b.p[n * 3] = x; b.p[n * 3 + 2] = z;
      const hub = this.hub;
      if (hub) {
        const A = hub.add;
        A.endColor(0.5, 0.6, 1);
        A.spawn(0, 0, x, y + 1.2, z, 0, 0, 0, 0.45, 5, 11, 1, 1, 0.85, 1, 0, 0);
        A.endColor(0.4, 0.6, 1);
        A.spawn(2, 2, x, y + 0.1, z, 0, 0, 0, 0.5, 1.5, 9, 1, 1, 0.8, 0.9, 0, 0);
        for (let j = 0; j < 12; j++) {
          const a = Math.random() * 6.283, sp = 6 + Math.random() * 9;
          A.endColor(0.5, 0.6, 1);
          A.spawn(0, 1, x, y + 1, z, Math.cos(a) * sp, 3 + Math.random() * 6, Math.sin(a) * sp, 0.4 + Math.random() * 0.3, 0.14, 0.05, 1, 1, 0.6, 1, 22, 0.6);
        }
      }
    }

    _fxBolts(dt) {
      const hub = this.hub;
      for (let i = 0; i < this._bolts.length; i++) {
        const b = this._bolts[i];
        if (b.life <= 0) continue;
        b.life -= dt;
        if (!hub || b.life <= 0) continue;
        const A = hub.add, f = b.life / b.max, p = b.p;
        const fl = (Math.sin(this.t * 90 + i) > -0.3 ? 1 : 0.35) * Math.min(1, f * 3);
        for (let j = 0; j < BOLT_N; j++) {
          const x0 = p[j * 3], y0 = p[j * 3 + 1], z0 = p[j * 3 + 2], x1 = p[j * 3 + 3], y1 = p[j * 3 + 4], z1 = p[j * 3 + 5];
          const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.hypot(dx, dy, dz), s = L / 0.045 / L;
          A.put(0, 1, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, 0.22, 1, 1, 0.9, fl, dx * s, dy * s, dz * s, 0);
          A.put(0, 1, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, 1.3, 0.45, 0.6, 1, 0.5 * fl, dx * s, dy * s, dz * s, 0);
        }
      }
    }

    // per-frame glow / trails / twinkles for live entities
    _fxEnt(e, i, dt) {
      const A = this.hub.add, S = this.hub.alpha, t = this.t, rnd = Math.random;
      const kind = e.kind, x = e.x, y = e.y, z = e.z, held = e.state === 'drag';
      const tick = ((t * 60) | 0);
      switch (kind) {
        case 'fireball': {
          const fl = 0.85 + 0.25 * Math.sin(t * 40 + i);
          A.put(0, 0, x, y + 0.4, z, 2.6 * fl, 1, 0.35, 0.05, 0.55, 0, 0, 0, 0);
          A.put(0, 0, x, y + 0.4, z, 1.5 * fl, 1, 0.65, 0.15, 0.85, 0, 0, 0, 0);
          A.put(0, 0, x, y + 0.4, z, 0.8 * fl, 1, 0.97, 0.7, 1, 0, 0, 0, 0);
          A.endColor(0.9, 0.12, 0.02);
          A.spawn(0, 0, x + (rnd() - 0.5) * 0.4, y + 0.4 + (rnd() - 0.5) * 0.4, z + (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 1.5, 1 + rnd(), (rnd() - 0.5) * 1.5, 0.35, 0.9, 0.15, 1, 0.65, 0.15, 0.7, -3, 1);
          if ((tick & 3) === 0) { S.endColor(0.35, 0.33, 0.32); S.spawn(3, 0, x, y + 0.5, z, 0, 1.2, 0, 0.6, 0.4, 1.1, 0.25, 0.22, 0.2, 0.3, -0.5, 1); }
          break;
        }
        case 'bomb': {
          const tipY = y + 1.62, fl = 0.8 + 0.4 * Math.sin(t * 50 + i);
          A.put(0, 0, x, tipY, z, 0.9 * fl, 1, 0.55, 0.1, 0.9, 0, 0, 0, 0);
          A.put(1, 0, x, tipY, z, 0.8 * fl, 1, 1, 0.8, 1, 0, 0, 0, t * 6);
          if ((tick & 1) === 0) A.spawn(0, 1, x, tipY, z, (rnd() - 0.5) * 4, 2 + rnd() * 3, (rnd() - 0.5) * 4, 0.3, 0.12, 0.04, 1, 0.75, 0.2, 1, 12, 0.4);
          if (!held && e.state === 'ground') {
            const rate = 8 + e.age * 6, on = Math.sin(e.age * rate) > 0.2;
            e.mesh.userData.body.material = on ? this.A.mFlash : this.A.mShiny;
            if (on) A.put(0, 0, x, y + 0.65, z, 2.6, 1, 0.2, 0.1, 0.35, 0, 0, 0, 0);
          } else if (e.mesh.userData.body.material !== this.A.mShiny) e.mesh.userData.body.material = this.A.mShiny;
          break;
        }
        case 'shell_red':
          if (held) { A.put(0, 0, x, y + 0.5, z, 1.5, 1, 0.2, 0.1, 0.18, 0, 0, 0, 0); break; }
          A.put(0, 0, x, y + 0.5, z, 2.3, 1, 0.2, 0.1, 0.4, 0, 0, 0, 0);
          A.endColor(1, 0.1, 0.05);
          A.spawn(0, 0, x + (rnd() - 0.5) * 0.3, y + 0.45, z + (rnd() - 0.5) * 0.3, (rnd() - 0.5), 0.2, (rnd() - 0.5), 0.45, 0.8, 0.12, 1, 0.55, 0.35, 0.75, 0, 1.5);
          if ((tick & 1) === 0) A.spawn(1, 0, x, y + 0.5, z, (rnd() - 0.5) * 2, 0.5 + rnd(), (rnd() - 0.5) * 2, 0.4, 0.5, 0.1, 1, 0.8, 0.7, 0.9, 0, 1);
          break;
        case 'shell_green':
          if (held) break;
          A.put(0, 0, x, y + 0.5, z, 1.7, 0.4, 1, 0.5, 0.2, 0, 0, 0, 0);
          if ((tick & 1) === 0) { A.endColor(0.2, 0.9, 0.3); A.spawn(0, 0, x, y + 0.4, z, (rnd() - 0.5), 0.2, (rnd() - 0.5), 0.3, 0.5, 0.1, 0.7, 1, 0.8, 0.5, 0, 1); }
          break;
        case 'spiny':
          A.put(0, 0, x, y + 0.7, z, 2.8, 0.2, 0.45, 1, 0.4, 0, 0, 0, 0);
          A.endColor(0.1, 0.3, 1);
          A.spawn(0, 0, x + (rnd() - 0.5) * 0.4, y + 0.6, z + (rnd() - 0.5) * 0.4, (rnd() - 0.5), 0.3, (rnd() - 0.5), 0.45, 0.8, 0.12, 0.5, 0.75, 1, 0.8, 0, 1.5);
          break;
        case 'mega_shell':
          A.put(0, 0, x, y + 1.2, z, 6.5, 1, 0.85, 0.3, 0.3, 0, 0, 0, 0);
          if ((tick & 1) === 0) {
            A.endColor(1, 0.55, 0.1);
            A.spawn(1, 0, x + (rnd() - 0.5) * 3, y + 0.8 + rnd() * 1.5, z + (rnd() - 0.5) * 3, (rnd() - 0.5) * 2, 1 + rnd() * 2, (rnd() - 0.5) * 2, 0.6, 0.9, 0.15, 1, 0.9, 0.4, 1, 3, 1);
            S.endColor(0.7, 0.62, 0.45);
            S.spawn(3, 0, x + (rnd() - 0.5) * 2, y + 0.3, z + (rnd() - 0.5) * 2, (rnd() - 0.5) * 2, 0.8, (rnd() - 0.5) * 2, 0.7, 1.0, 3.0, 0.65, 0.58, 0.42, 0.4, -0.3, 1);
          }
          break;
        case 'egg':
          if (!held) {
            A.put(0, 0, x, y + 0.7, z, 2.0, 1, 0.75, 0.95, 0.25, 0, 0, 0, 0);
            if ((tick & 1) === 0) {
              hsv(rnd(), 0.5, 1);
              A.endColor(RGBm[0], RGBm[1], RGBm[2]);
              A.spawn(1, 0, x + (rnd() - 0.5) * 0.4, y + 0.6, z + (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 1.5, 0.5 + rnd(), (rnd() - 0.5) * 1.5, 0.5, 0.5, 0.1, 1, 1, 1, 1, 0, 1);
            }
          }
          break;
        case 'banana': case 'giant_banana': {
          const big = kind === 'giant_banana' ? 2 : 1;
          const tw = Math.sin(t * 2.4 + i * 1.9);
          if (tw > 0.75) A.put(1, 0, x + 0.25 * big, y + 0.6 * big, z + 0.1, (tw - 0.75) * 4 * big, 1, 1, 0.8, 1, 0, 0, 0, t);
          break;
        }
        case 'fake_box': {
          const pul = 0.9 + 0.12 * Math.sin(t * 5 + i);
          A.put(0, 0, x, y + 0.9, z, 3.0 * pul, 1, 0.2, 0.2, 0.28, 0, 0, 0, 0);
          break;
        }
      }
      void dt;
    }

    // ------------------------------------------------------------ dropped-item pickups
    _dropTexture(id) {
      this._dropMats = this._dropMats || {};
      let m = this._dropMats[id];
      if (m) return m;
      const c = document.createElement('canvas');
      c.width = 128; c.height = 128;
      const ctx = c.getContext('2d');
      const tex = this._track(new THREE.CanvasTexture(c));
      // backing disc so the icon reads against any ground
      ctx.fillStyle = 'rgba(20,22,40,0.55)';
      ctx.beginPath(); ctx.arc(64, 64, 60, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 5; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      const def = G.ITEMS[id];
      if (def && def.icon && typeof Image !== 'undefined') {
        const img = new Image();
        img.onload = () => { ctx.drawImage(img, 20, 20, 88, 88); tex.needsUpdate = true; };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(def.icon);
      }
      m = this._track(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      this._dropMats[id] = m;
      return m;
    }

    _buildDrops() {
      this.drops = [];
      for (let i = 0; i < MAX_DROPS; i++) {
        const spr = new THREE.Sprite(this._dropTexture('banana'));
        spr.visible = false;
        this._root.add(spr);
        this.drops.push({ active: false, id: null, spr: spr, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, hint: -1, from: null, base: 0 });
      }
    }

    _spawnDrop(id, x, y, z, vx, vz, from) {
      let d = null, oldest = null;
      for (let i = 0; i < this.drops.length; i++) {
        const c = this.drops[i];
        if (!c.active) { d = c; break; }
        if (!oldest || c.age > oldest.age) oldest = c;
      }
      if (!d) d = oldest;
      d.active = true; d.id = id; d.x = x; d.y = y; d.z = z; d.vx = vx; d.vz = vz; d.vy = 9;
      d.age = 0; d.hint = -1; d.from = from || null;
      d.spr.material = this._dropTexture(id);
      d.spr.visible = true;
      d.spr.position.set(x, y + 1.5, z);
      return d;
    }

    _scatterDrops(k, ids) {
      const m = ids.length;
      const h = k.heading, ky = this._kartY(k);
      for (let i = 0; i < m; i++) {
        const a = h + Math.PI + (i - (m - 1) / 2) * 0.8 + (Math.random() - 0.5) * 0.4;
        const sp = 7 + Math.random() * 5;
        const sx = Math.sin(a), sz = Math.cos(a);
        this._spawnDrop(ids[i], k.pos.x + sx * 1.5, ky + 0.8, k.pos.z + sz * 1.5, sx * sp + (k.vel ? k.vel.x * 0.3 : 0), sz * sp + (k.vel ? k.vel.z * 0.3 : 0), k);
      }
    }

    _updateDrops(dt) {
      const ds = this.drops, ks = this.karts, t = this.t;
      for (let i = 0; i < ds.length; i++) {
        const d = ds[i];
        if (!d.active) continue;
        d.age += dt;
        if (d.age >= DROP_LIFE) { d.active = false; d.spr.visible = false; continue; }
        const q = this.track.query(d.x, d.z, d.hint);
        d.hint = q.index;
        const gy = q.surface === 'void' ? d.y - 1 : q.y;
        if (d.vy !== 0 || d.age < 1) {
          d.vy -= 26 * dt;
          d.x += d.vx * dt; d.z += d.vz * dt; d.y += d.vy * dt;
          d.vx *= 1 - Math.min(1, dt * 1.5); d.vz *= 1 - Math.min(1, dt * 1.5);
          const lim = (q.wallDist || q.halfWidth + 2) - 0.8;
          if (Math.abs(q.lateral) > lim) {
            const sgn = q.lateral > 0 ? 1 : -1, over = Math.abs(q.lateral) - lim;
            d.x -= q.rx * sgn * over; d.z -= q.rz * sgn * over;
            d.vx *= 0.3; d.vz *= 0.3;
          }
          if (d.y <= gy + 0.8 && d.vy < 0) {
            d.y = gy + 0.8;
            if (d.vy < -4) d.vy = -d.vy * 0.4; else { d.vy = 0; d.vx = d.vz = 0; }
          }
        }
        // pickup
        if (d.age > 0.6) {
          for (let ki = 0; ki < ks.length; ki++) {
            const k = ks[ki];
            if (k.finished || k.falling) continue;
            if (k === d.from && d.age < 2) continue;
            const slot = this._freeSlot(k);
            if (slot < 0) continue;
            if (this.mode === 'bomb' && d.id !== 'bomb') continue;
            const dx = k.pos.x - d.x, dz = k.pos.z - d.z;
            if (dx * dx + dz * dz > 5.0 || Math.abs(this._kartY(k) - d.y) > 4) continue;
            k.heldItems[slot] = d.id; k.itemCounts[slot] = COUNT[d.id] || 1; k.roulette[slot] = 0;
            if (k._itm) k._itm.pend[slot] = null;
            this._snd('item_get', k);
            d.active = false; d.spr.visible = false;
            break;
          }
          if (!d.active) continue;
        }
        const spin = Math.abs(Math.cos(t * 3 + i));
        const blink = d.age > DROP_LIFE - 3 && ((t * 8) | 0) % 2 === 0;
        const sc = blink ? 0.001 : 2.4;
        d.spr.scale.set(Math.max(0.35, spin) * sc, sc, 1);
        d.spr.position.set(d.x, d.y + 0.7 + (d.vy === 0 ? Math.sin(t * 3 + i) * 0.2 : 0), d.z);
      }
    }

    _handleLost(data) {
      if (this._disposed || !data) return;
      const k = data.kart || data;
      if (!k || !k.heldItems || this.karts.indexOf(k) < 0) return;
      const st = k._itm;
      let ids = data.items;
      if (!ids || !ids.length) {
        ids = [];
        if (st && st.snap) { if (st.snap[0]) ids.push(st.snap[0]); if (st.snap[1]) ids.push(st.snap[1]); }
      }
      if (st) {
        if (st.dragEnt) { const e = st.dragEnt; st.dragEnt = null; e.owner = null; this._free(e); }
        st.pend[0] = st.pend[1] = null; st.pressed = false; st.goldT = 0;
        st.snap[0] = st.snap[1] = null;
      }
      k.draggedItem = null;
      const out = [];
      for (let i = 0; i < ids.length; i++) if (ids[i] && G.ITEMS[ids[i]]) out.push(resolveId(ids[i]));
      if (out.length) this._scatterDrops(k, out);
    }

    // ------------------------------------------------------------ chomp
    _buildChomps() {
      this.chomps = [];
      for (let i = 0; i < MAX_CHOMPS; i++) this.chomps.push({ active: false, idx: i, grp: null, links: null, owner: null, hitT: new Float32Array(Math.max(1, this.karts.length)), t: 0 });
    }

    _makeChompMesh(c) {
      const g = new THREE.Mesh(this._getChompGeo(), this.A.chomp);
      g.castShadow = true;
      g.visible = false;
      this._root.add(g);
      c.grp = g;
      if (!this.linkMesh) {
        const lg = this._geo(new THREE.SphereGeometry(0.2, 14, 10));
        this.linkMesh = new THREE.InstancedMesh(lg, this._shiny(0x5a6080, { rimColor: 0xaab4ff }), MAX_CHOMPS * 7);
        this.linkMesh.frustumCulled = false;
        this.linkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this._root.add(this.linkMesh);
      }
    }

    _setLink(c, i, x, y, z) {
      const te = this.linkMesh.instanceMatrix.array, o = (c.idx * 7 + i) * 16;
      te[o] = 1; te[o + 5] = 1; te[o + 10] = 1; te[o + 15] = x === null ? 0 : 1;
      te[o + 12] = x || 0; te[o + 13] = y || 0; te[o + 14] = z || 0;
      this.linkMesh.instanceMatrix.needsUpdate = true;
    }

    _startChomp(k, st) {
      let c = null;
      for (let i = 0; i < this.chomps.length; i++) if (!this.chomps[i].active) { c = this.chomps[i]; break; }
      if (!c) return;
      if (!c.grp) this._makeChompMesh(c);
      c.active = true; c.owner = k; c.t = 0; c.hitT.fill(-10);
      st.chompT = CHOMP_TIME; st.chompE = c;
      st.chompDirect = !('autoSteer' in k);
      k.chompTimer = CHOMP_TIME;
      c.grp.visible = true;
      this._snd('boost', k);
    }

    _stopChomp(k, st) {
      const c = st.chompE;
      if (c) {
        c.active = false; c.owner = null;
        if (c.grp) c.grp.visible = false;
        if (this.linkMesh) for (let i = 0; i < 7; i++) this._setLink(c, i, null, 0, 0);
      }
      st.chompE = null; st.chompT = 0;
      k.chompTimer = 0;
      if ('autoSteer' in k) k.autoSteer = null;
    }

    _tickChomp(k, st, dt) {
      if (st.chompT <= 0) return;
      st.chompT -= dt;
      const c = st.chompE;
      if (st.chompT <= 0 || k.finished || k.falling || !c) { this._stopChomp(k, st); return; }
      k.chompTimer = st.chompT;
      c.t += dt;
      // steering target
      let tx = 0, tz = 0, have = false;
      if (this.isArena) {
        let best = null, bd = 1e9;
        for (let i = 0; i < this.karts.length; i++) {
          const o = this.karts[i];
          if (o === k || o.finished) continue;
          const dx = o.pos.x - k.pos.x, dz = o.pos.z - k.pos.z, d2 = dx * dx + dz * dz;
          if (d2 < bd) { bd = d2; best = o; }
        }
        if (best) { tx = best.pos.x; tz = best.pos.z; have = true; }
      } else {
        const ti = k.trackInfo;
        const dist = ti && ti.dist !== undefined ? ti.dist : 0;
        const p = this.track.pointAt(wrapLen(dist + 20, this.track.length));
        tx = p.x; tz = p.z; have = true;
      }
      let steer = 0;
      if (have) {
        const want = Math.atan2(tx - k.pos.x, tz - k.pos.z);
        const err = G.wrapAngle(want - k.heading);
        steer = G.clamp(-err * 2.2, -1, 1);
        if (st.chompDirect) k.heading += G.clamp(err, -2.6 * dt, 2.6 * dt);
      }
      if (!st.chompDirect) k.autoSteer = steer;
      // forward speed ~1.4x top, invulnerable while chomping
      if (k._boost) k._boost(0.12, 1.15, false); else if (k.boost) k.boost(0.12, 1.15);
      if (k.invulnTimer < 0.25) k.invulnTimer = 0.25;
      // visuals
      const fx = Math.sin(k.heading), fz = Math.cos(k.heading), ky = this._kartY(k);
      const lunge = 5.2 + Math.sin(c.t * 7) * 0.7;
      const hop = 1.5 + Math.abs(Math.sin(c.t * 5)) * 0.8;
      const cx = k.pos.x + fx * lunge, cz = k.pos.z + fz * lunge, cy = ky + hop;
      c.grp.position.set(cx, cy, cz);
      c.grp.rotation.y = k.heading;
      c.grp.rotation.x = Math.sin(c.t * 5) * 0.12;
      if (this.hub) {
        const A = this.hub.add, S = this.hub.alpha;
        A.put(0, 0, cx, cy, cz, 6.5, 0.45, 0.35, 1, 0.22, 0, 0, 0, 0);
        if (((c.t * 60) | 0) % 3 === 0) { S.endColor(0.55, 0.5, 0.45); S.spawn(3, 0, cx - fx * 1.5, ky + 0.3, cz - fz * 1.5, (Math.random() - 0.5) * 2, 0.8, (Math.random() - 0.5) * 2, 0.6, 0.9, 2.6, 0.5, 0.45, 0.4, 0.35, -0.3, 1); }
      }
      const sx = k.pos.x + fx * 1.3, sz = k.pos.z + fz * 1.3, sy = ky + 0.6, n = 7;
      for (let i = 0; i < n; i++) {
        const f = (i + 1) / (n + 1);
        this._setLink(c, i, sx + (cx - fx * 1.3 - sx) * f, sy + (cy - sy) * f - Math.sin(f * Math.PI) * 0.5, sz + (cz - fz * 1.3 - sz) * f);
      }
      // collisions: flip karts, destroy items
      for (let i = 0; i < this.karts.length; i++) {
        const o = this.karts[i];
        if (o === k) continue;
        const dx = o.pos.x - cx, dz = o.pos.z - cz;
        if (dx * dx + dz * dz > 3.6 * 3.6 || Math.abs(this._kartY(o) - ky) > 3.5) continue;
        if (c.t - c.hitT[i] < 1.5) continue;
        if (o.isInvincible && o.isInvincible()) continue;
        c.hitT[i] = c.t;
        this._hitKart(o, 'flip', k, 'chomp');
        this._snd('shell_hit', o);
      }
      const ents = this.ents;
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        if (!e.active || e.state === 'drag' || e.owner === k) continue;
        const dx = e.x - cx, dz = e.z - cz, rr = 3.4 + e.radius;
        if (dx * dx + dz * dz > rr * rr) continue;
        if (e.kind === 'bomb') this._detonate(e); else if (e.kind !== 'mega_shell') this._free(e);
      }
    }

    // ------------------------------------------------------------ kart state
    _initKart(k) {
      if (k._itm && k._itm.sys === this) return;
      const st = {
        sys: this, kart: k, pend: [null, null], pressed: false, pressId: null, holdT: 0, dragEnt: null,
        goldT: 0, goldCd: 0, heartT: 0, hearts: 0, src: '', orbG: null, orbR: null, heartM: null,
        orbShown: 0, orbType: '', hook: null, snap: [null, null], chompT: 0, chompE: null, chompDirect: false,
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
        st.orbG.push(this._shellMesh('green', 0.7));
        st.orbR.push(this._shellMesh('red', 0.7));
      }
      for (let i = 0; i < 2; i++) {
        const m = new THREE.Mesh(A.g.heart, A.pink);
        m.castShadow = true;
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
      if (this.mode === 'bomb') return 'bomb';
      const n = Math.max(1, this.karts.length);
      const p = G.clamp(k.position || Math.ceil(n / 2), 1, n);
      const t = n > 1 ? (p - 1) / (n - 1) : 0;
      const w = this._w;
      for (const key in w) delete w[key];
      const battle = this.mode === 'balloon' || this.mode === 'shine';
      let total = 0;
      if (battle) {
        for (let i = 0; i < ALL_KEYS.length; i++) { const key = ALL_KEYS[i]; w[key] = W_BATTLE[key] || 0; total += w[key]; }
      } else {
        let A, B, f;
        if (t < 0.5) { A = W_FRONT; B = W_MID; f = t * 2; } else { A = W_MID; B = W_BACK; f = (t - 0.5) * 2; }
        for (let i = 0; i < ALL_KEYS.length; i++) {
          const key = ALL_KEYS[i];
          w[key] = (A[key] || 0) * (1 - f) + (B[key] || 0) * f;
          total += w[key];
        }
        // rare, last-places-only items
        if (n >= 4 && p >= n - 2 && !this._inUse('lightning')) { w.lightning = 4; total += 4; }
        if (n >= 4 && p >= n - 3 && !this._inUse('spiny')) { w.spiny = 3; total += 3; }
      }
      let sp = this._specialFor(slot === 0 ? k.rear : k.front);
      if (sp === 'all') sp = SPECIALS[(Math.random() * SPECIALS.length) | 0];
      if (sp && ITEMS_HAS(sp)) w[sp] = (w[sp] || 0) + total * (t < 0.34 && !battle ? 0.22 : 0.27);
      return resolveId(G.weighted(w));
    }

    // ------------------------------------------------------------ public API
    giveItem(k, id, slot) {
      slot = slot || 0;
      id = resolveId(id);
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
      for (let i = 0; i < this.chomps.length; i++) {
        const c = this.chomps[i];
        if (!c.active || !c.grp) continue;
        const h = pool[n++];
        h.x = c.grp.position.x; h.z = c.grp.position.z; h.radius = 3.4; h.kind = 'chomp';
      }
      out.length = n;
      for (let i = 0; i < n; i++) out[i] = pool[i];
      return out;
    }

    reset() {
      for (let i = 0; i < this.ents.length; i++) this._free(this.ents[i]);
      for (let i = 0; i < this._bolts.length; i++) this._bolts[i].life = 0;
      for (let i = 0; i < this.drops.length; i++) { this.drops[i].active = false; this.drops[i].spr.visible = false; }
      this._resetBoxes();
      this.lightningTimer = 0;
      this.t = 0;
      for (let i = 0; i < this.karts.length; i++) {
        const k = this.karts[i];
        this._initKart(k);
        const st = k._itm;
        st.pend[0] = st.pend[1] = null; st.pressed = false; st.dragEnt = null; st.goldT = 0; st.heartT = 0;
        st.hearts = 0; st.orbShown = 0; st.src = ''; st.snap[0] = st.snap[1] = null;
        if (st.chompE) this._stopChomp(k, st);
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
      this._disposed = true;
      if (this._onLost) G.events.off('kartLostItems', this._onLost);
      for (let i = 0; i < this.karts.length; i++) {
        const st = this.karts[i]._itm;
        if (st && st.sys === this && st.chompE) this._stopChomp(this.karts[i], st);
      }
      if (this._root.parent) this._root.parent.remove(this._root);
      if (this.hub) { this.hub.release(this); this.hub = null; }
      for (let i = 0; i < this._disposables.length; i++) {
        const d = this._disposables[i];
        if (d && d.dispose) d.dispose();
      }
      this._disposables.length = 0;
      if (this.boxMesh && this.boxMesh.dispose) this.boxMesh.dispose();
      if (this.qMesh && this.qMesh.dispose) this.qMesh.dispose();
      if (this.linkMesh && this.linkMesh.dispose) this.linkMesh.dispose();
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
      if (this.hub) this.hub.step(this, dt);
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
        this._tickChomp(k, st, dt);
      }
      this._updateEnts(dt);
      this._collide(dt);
      this._updateDrops(dt);
      this._fxBolts(dt);
      this._updateOrbits(dt);
      for (let i = 0; i < ks.length; i++) {
        const k = ks[i], st = k._itm;
        if (st) { st.snap[0] = k.heldItems[0]; st.snap[1] = k.heldItems[1]; }
      }
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
        if (!this._canPickup(k)) continue;
        const px = k.pos.x, pz = k.pos.z, py = this._kartY(k);
        for (let i = 0; i < N; i++) {
          if (!this.bAct[i] || this.bS[i] < 0.7) continue;
          const dx = this.bx[i] - px, dz = this.bz[i] - pz;
          if (dx * dx + dz * dz > 3.24) continue;
          if (Math.abs(this.by[i] - py) > 4) continue;
          const pr = this.bPair[i], dbl = pr >= 0 && this.bAct[pr];
          this.bAct[i] = 0;
          this.bR[i] = i < n ? BOX_RESPAWN : -1;
          if (dbl) { this.bAct[pr] = 0; this.bR[pr] = BOX_RESPAWN; }
          this._fxBoxBreak(i);
          if (dbl) this._fxBoxBreak(pr);
          this._pickup(k, dbl ? 2 : 1);
          if (!this._canPickup(k)) break;
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

    _canPickup(k) {
      if (this.mode === 'bomb') {
        const h = k.heldItems[0];
        return (h == null && !(k.roulette[0] > 0)) || (h === 'bomb' && (k.itemCounts[0] || 1) < 5 && !(k.roulette[0] > 0));
      }
      return this._freeSlot(k) >= 0;
    }

    _pickup(k, count) {
      const st = k._itm;
      if (this.mode === 'bomb') {
        if (k.heldItems[0] === 'bomb') k.itemCounts[0] = Math.min(5, (k.itemCounts[0] || 1) + 1);
        else { k.heldItems[0] = 'bomb'; k.itemCounts[0] = 1; }
        this._snd('item_box', k); this._snd('item_get', k);
        return;
      }
      let n = count || 1;
      for (let i = 0; i < n; i++) {
        const s = this._freeSlot(k);
        if (s < 0) break;
        st.pend[s] = this._decide(k, s);
        k.roulette[s] = 1.5 + i * 0.35;
        this._snd('item_box', k);
        this._snd('roulette', k);
      }
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
          const id = st.pend[s] ? resolveId(st.pend[s]) : null;
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
      G.events.emit('itemUsed', { kart: k, item: 'mushroom_gold' });
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
      G.events.emit('itemUsed', { kart: k, item: id });
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

    _nearestKart(x, z, except, fx, fz, cone) {
      const ks = this.karts;
      let best = null, bd = 1e9;
      for (let i = 0; i < ks.length; i++) {
        const o = ks[i];
        if (o === except || o.finished) continue;
        const dx = o.pos.x - x, dz = o.pos.z - z, d2 = dx * dx + dz * dz;
        if (cone && d2 > 1e-6 && (dx * fx + dz * fz) / Math.sqrt(d2) < cone) continue;
        if (d2 < bd) { bd = d2; best = o; }
      }
      return best;
    }

    _pickTarget(k) {
      if (this.isArena) {
        const fx = Math.sin(k.heading), fz = Math.cos(k.heading);
        return this._nearestKart(k.pos.x, k.pos.z, k, fx, fz, 0.3) || this._nearestKart(k.pos.x, k.pos.z, k, 0, 0, 0);
      }
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
      G.events.emit('itemUsed', { kart: k, item: id });
      switch (id) {
        case 'chomp':
          this._startChomp(k, st);
          this._consume(k);
          break;
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
      if (this.isArena) return except ? this._nearestKart(except.pos.x, except.pos.z, except, 0, 0, 0) : null;
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
        this._fxBolt(k);
        const t = G.clamp(((k.position || 1) - 1) / (n - 1), 0, 1);
        k.shrinkTimer = 4 + 4 * t;
        // drop items
        if (st) {
          if (st.dragEnt) { const d = st.dragEnt; st.dragEnt = null; d.owner = null; this._free(d); }
          st.pend[0] = st.pend[1] = null; st.pressed = false; st.goldT = 0;
        }
        k.draggedItem = null;
        if (k.heldItems[0] || k.heldItems[1]) {
          const ids = [];
          if (k.heldItems[0]) ids.push(k.heldItems[0]);
          if (k.heldItems[1]) ids.push(k.heldItems[1]);
          this._scatterDrops(k, ids);
        }
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
        else if (kind === 'bomb') { /* flashing + fuse spark handled in _fxEnt */ }
        else if (kind === 'fireball') { /* sprites only */ }
        else m.rotation.y = e.spin;
        if (this.hub) this._fxEnt(e, i, dt);
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
        if (this.isArena || dx * dx + dz * dz < e.directR * e.directR) { ax = T.pos.x; az = T.pos.z; rate = 14; }
      }
      if (ax === undefined && this.isArena) { ax = e.x + e.vx; az = e.z + e.vz; }
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
        if (this.isArena && kind !== 'spiny' && (!e.target || e.target.finished) && e.age - e.lastPick > 0.4) {
          e.lastPick = e.age;
          const sp = Math.sqrt(e.vx * e.vx + e.vz * e.vz) || 1;
          e.target = this._nearestKart(e.x, e.z, e.owner, e.vx / sp, e.vz / sp, 0.2);
        }
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
      this._fxHit(k, src);
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
      this._fxExplosion(x, y, z, r);
      this._sndNear('explosion', x, z, 45);
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
              if (this.hub) this.hub.add.put(0, 0, m.position.x, m.position.y + 0.3, m.position.z, 1.3, mg.visible ? 0.4 : 1, mg.visible ? 1 : 0.25, mg.visible ? 0.5 : 0.2, 0.22, 0, 0, 0, 0);
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
              if (this.hub) {
                const A2 = this.hub.add, hp = hm[j].position;
                A2.put(0, 0, hp.x, hp.y, hp.z, 2.2 * pul, 1, 0.3, 0.55, 0.5, 0, 0, 0, 0);
                const tw = Math.sin(t * 6 + j * 3);
                if (tw > 0.3) A2.put(1, 0, hp.x + 0.3, hp.y + 0.3, hp.z, (tw - 0.3) * 1.3, 1, 0.85, 0.9, 1, 0, 0, 0, t * 2);
              }
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
