// Award ceremony: podium, trophy, confetti, fireworks, camera choreography. Classic script, global G.
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  const DURATION = 12.5;
  const NCONF = 400;
  const FW_BURSTS = 8, FW_PER = 56, NFW = FW_BURSTS * FW_PER;
  const GRAV = 9;

  const S = {
    active: false, root: null, t: 0, scene: null, camera: null, onDone: null,
    saved: null, opts: null, disposables: [], rider: [], kartObjs: [], spots: [],
    trophy: null, conf: null, fw: null, keyFn: null, clickFn: null, nextFw: 0, fwIdx: 0,
    nextCheer: 0, banner: null, winnerKart: null, trophyTargetY: 0,
  };
  G.Ceremony = S;
  S.active = false;

  const smooth = (x) => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
  const seg = (t, a, b) => smooth((t - a) / (b - a));
  const _c = typeof THREE !== 'undefined' ? new THREE.Color() : null;
  let camP = null, camL = null, tmpA = null;

  function track(o) { S.disposables.push(o); return o; }

  function ordinal(p) { return p === 1 ? '1st' : p === 2 ? '2nd' : p === 3 ? '3rd' : p + 'th'; }

  function makeCanvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return track(t);
  }

  function makeBanner(cup, place) {
    const tex = makeCanvasTex(1024, 256, (x, w, h) => {
      x.textAlign = 'center'; x.textBaseline = 'middle';
      let fs = 112;
      x.font = '900 ' + fs + 'px "Trebuchet MS", sans-serif';
      while (x.measureText(cup).width > w - 60 && fs > 30) { fs -= 4; x.font = '900 ' + fs + 'px "Trebuchet MS", sans-serif'; }
      x.lineJoin = 'round';
      x.lineWidth = 22; x.strokeStyle = '#1a0f3a';
      x.strokeText(cup, w / 2, 90);
      const g = x.createLinearGradient(0, 30, 0, 150);
      g.addColorStop(0, '#fff6a8'); g.addColorStop(1, '#ffb11f');
      x.fillStyle = g; x.fillText(cup, w / 2, 90);
      if (place) {
        x.font = '900 78px "Trebuchet MS", sans-serif';
        x.lineWidth = 16;
        x.strokeText(place, w / 2, 200);
        x.fillStyle = '#ffffff'; x.fillText(place, w / 2, 200);
      }
    });
    const m = track(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0 }));
    const s = new THREE.Sprite(m);
    s.scale.set(13, 3.25, 1);
    return s;
  }

  function buildSky(root) {
    const geo = track(new THREE.SphereGeometry(300, 24, 16));
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    const top = new THREE.Color(0x070421), mid = new THREE.Color(0x3a1a6e), low = new THREE.Color(0xff6a8a);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const h = pos.getY(i) / 300;
      if (h > 0.15) c.copy(mid).lerp(top, Math.min(1, (h - 0.15) / 0.7));
      else c.copy(mid).lerp(low, Math.min(1, (0.15 - h) / 0.45));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const sky = new THREE.Mesh(geo, track(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
    sky.renderOrder = -10;
    root.add(sky);
    // stars
    const n = 260, sp = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = 0.12 + Math.random() * 1.2;
      const r = 280;
      sp[i * 3] = Math.cos(a) * Math.cos(e) * r; sp[i * 3 + 1] = Math.sin(e) * r; sp[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    const sg = track(new THREE.BufferGeometry());
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const stars = new THREE.Points(sg, track(new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, depthWrite: false })));
    root.add(stars);
  }

  function buildStage(root) {
    // ground disc with radial pattern
    const gtex = makeCanvasTex(256, 256, (x, w, h) => {
      const g = x.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
      g.addColorStop(0, '#5a3aa8'); g.addColorStop(0.6, '#2c1a66'); g.addColorStop(1, '#120a30');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.strokeStyle = 'rgba(255,220,120,0.35)'; x.lineWidth = 3;
      for (let r = 30; r < 128; r += 24) { x.beginPath(); x.arc(w / 2, h / 2, r, 0, 7); x.stroke(); }
    });
    const ground = new THREE.Mesh(track(new THREE.CircleGeometry(60, 48)), track(new THREE.MeshBasicMaterial({ map: gtex, fog: false })));
    ground.rotation.x = -Math.PI / 2;
    root.add(ground);

    const mkStep = (x, h, place, color) => {
      const w = 5, d = 4.6;
      const geo = track(new THREE.BoxGeometry(w, h, d));
      const m = new THREE.Mesh(geo, track(new THREE.MeshPhongMaterial({ color, shininess: 60, specular: 0x555555, flatShading: true })));
      m.position.set(x, h / 2, 0);
      root.add(m);
      // gold trim top
      const trim = new THREE.Mesh(track(new THREE.BoxGeometry(w + 0.2, 0.18, d + 0.2)), track(new THREE.MeshPhongMaterial({ color: 0xffd34a, shininess: 90, specular: 0xffffff })));
      trim.position.set(x, h + 0.02, 0);
      root.add(trim);
      const tex = makeCanvasTex(128, 128, (c, ww, hh) => {
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = '900 110px "Trebuchet MS", sans-serif';
        c.lineWidth = 14; c.strokeStyle = '#2a1650'; c.lineJoin = 'round';
        c.strokeText(String(place), ww / 2, hh / 2 + 6);
        c.fillStyle = '#ffe27a'; c.fillText(String(place), ww / 2, hh / 2 + 6);
      });
      const num = new THREE.Mesh(track(new THREE.PlaneGeometry(Math.min(2.2, h * 1.5), Math.min(2.2, h * 1.5))),
        track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false })));
      num.position.set(x, h * 0.5, d / 2 + 0.02);
      root.add(num);
    };
    mkStep(-5.2, 1.3, 2, 0x8a93c8);
    mkStep(0, 2.1, 1, 0xe8b830);
    mkStep(5.2, 0.8, 3, 0xc9803a);

    // light string poles / bulbs behind the podium
    const bulbG = track(new THREE.SphereGeometry(0.18, 8, 6));
    const cols = [0xff5a5a, 0xffd34a, 0x5affc0, 0x5ab0ff, 0xff7ae0];
    for (let i = 0; i < 25; i++) {
      const a = Math.PI + (i / 24) * Math.PI; // back half arc
      const b = new THREE.Mesh(bulbG, track(new THREE.MeshBasicMaterial({ color: cols[i % 5], fog: false })));
      b.position.set(Math.cos(a) * 16, 0.3 + Math.sin(i * 1.7) * 0.1, -Math.abs(Math.sin(a)) * 14 - 2);
      b.position.y = 0.25;
      root.add(b);
    }
  }

  function buildSpots(root) {
    const colors = [0xffe9a0, 0x7ad0ff, 0xff8ad8, 0xa8ff9a];
    const xs = [-9, 9, -4, 4], zs = [-8, -8, 7, 7];
    const geo = track(new THREE.ConeGeometry(3.2, 26, 20, 1, true));
    geo.translate(0, -13, 0); // apex at origin, opens downward
    for (let i = 0; i < 4; i++) {
      const piv = new THREE.Group();
      piv.position.set(xs[i], 24, zs[i]);
      const m = new THREE.Mesh(geo, track(new THREE.MeshBasicMaterial({
        color: colors[i], transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
      })));
      piv.add(m);
      root.add(piv);
      S.spots.push({ piv, base: new THREE.Vector3(xs[i], 24, zs[i]), ph: i * 1.7 });
    }
    // volumes: cone apex height 26 -> reaches y~-2. Aim handled in update.
  }

  function buildOwnTrophy(kind) {
    const col = kind === 'silver' ? 0xd8dde6 : kind === 'bronze' ? 0xcd7f3a : 0xffcf2e;
    const g = new THREE.Group();
    const m = track(new THREE.MeshPhongMaterial({ color: col, shininess: 120, specular: 0xffffff, flatShading: false, emissive: new THREE.Color(col).multiplyScalar(0.18) }));
    const pts = [[0, 0], [1.1, 0], [1.1, 0.25], [0.5, 0.45], [0.3, 0.9], [0.3, 1.3], [0.9, 1.6], [1.4, 2.6], [1.5, 3.0], [0, 3.0]];
    const pv = pts.map((p) => new THREE.Vector2(p[0] * 0.8, p[1] * 0.8));
    const cup = new THREE.Mesh(track(new THREE.LatheGeometry(pv, 24)), m);
    g.add(cup);
    const hg = track(new THREE.TorusGeometry(0.6, 0.09, 8, 16));
    const h1 = new THREE.Mesh(hg, m); h1.position.set(1.15, 1.9, 0); h1.rotation.y = 0;
    const h2 = new THREE.Mesh(hg, m); h2.position.set(-1.15, 1.9, 0);
    g.add(h1, h2);
    return g;
  }

  function buildPoints(n, size, blending) {
    const geo = track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const tex = makeCanvasTex(32, 32, (x, w, h) => {
      const g = x.createRadialGradient(16, 16, 1, 16, 16, 15);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    });
    const mat = track(new THREE.PointsMaterial({
      size, vertexColors: true, sizeAttenuation: true, transparent: true, depthWrite: false, blending, fog: false,
      map: blending === THREE.AdditiveBlending ? tex : null,
    }));
    const p = new THREE.Points(geo, mat);
    p.frustumCulled = false;
    return p;
  }

  function initConfetti(p) {
    const pos = p.geometry.attributes.position.array, col = p.geometry.attributes.color.array;
    const pal = [0xff4a6a, 0xffd23a, 0x4adfff, 0x7aff6a, 0xff8ae0, 0xffffff, 0xff8a2a];
    p.userData.vel = new Float32Array(NCONF * 4); // fallSpeed, flutterFreq, flutterAmp, phase
    p.userData.base = new Float32Array(NCONF * 2); // base x, base z
    for (let i = 0; i < NCONF; i++) {
      p.userData.base[i * 2] = G.rand(-16, 16);
      p.userData.base[i * 2 + 1] = G.rand(-12, 10);
      pos[i * 3 + 1] = G.rand(-5, 22) + 40; // hidden high until released
      _c.setHex(pal[i % pal.length]);
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
      p.userData.vel[i * 4] = G.rand(1.6, 3.4);
      p.userData.vel[i * 4 + 1] = G.rand(1.5, 4);
      p.userData.vel[i * 4 + 2] = G.rand(0.4, 1.4);
      p.userData.vel[i * 4 + 3] = G.rand(0, 6.28);
      pos[i * 3] = p.userData.base[i * 2]; pos[i * 3 + 2] = p.userData.base[i * 2 + 1];
    }
  }

  function initFireworks(p) {
    p.userData.v = new Float32Array(NFW * 3);
    p.userData.life = new Float32Array(NFW); // remaining 0..1
    p.userData.base = new Float32Array(NFW * 3); // base color
    p.userData.life.fill(0);
    const pos = p.geometry.attributes.position.array;
    for (let i = 0; i < NFW; i++) pos[i * 3 + 1] = -100;
  }

  function burst(x, y, z) {
    const p = S.fw, pos = p.geometry.attributes.position.array, v = p.userData.v, life = p.userData.life, bc = p.userData.base;
    const pal = [0xff4a6a, 0xffd23a, 0x4adfff, 0x7aff6a, 0xff8ae0, 0xffffff];
    _c.setHex(pal[(Math.random() * pal.length) | 0]);
    const r = _c.r, g = _c.g, b = _c.b;
    const i0 = S.fwIdx * FW_PER;
    S.fwIdx = (S.fwIdx + 1) % FW_BURSTS;
    for (let k = 0; k < FW_PER; k++) {
      const i = i0 + k;
      const th = Math.random() * 6.2832, ph = Math.acos(2 * Math.random() - 1), sp = G.rand(5, 10);
      v[i * 3] = Math.sin(ph) * Math.cos(th) * sp;
      v[i * 3 + 1] = Math.cos(ph) * sp;
      v[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      life[i] = 1;
      bc[i * 3] = r; bc[i * 3 + 1] = g; bc[i * 3 + 2] = b;
    }
  }

  function end(callDone) {
    if (!S.active) return;
    S.active = false;
    try { window.removeEventListener('keydown', S.keyFn, true); window.removeEventListener('pointerdown', S.clickFn, true); } catch (e) { /* ignore */ }
    const cb = S.onDone;
    S.dispose();
    if (callDone && cb) cb();
  }

  S.play = function (o, onDone) {
    if (S.active) S.dispose();
    const scene = o.scene, camera = o.camera;
    camP = camP || new THREE.Vector3(); camL = camL || new THREE.Vector3(); tmpA = tmpA || new THREE.Vector3();
    S.scene = scene; S.camera = camera; S.onDone = onDone; S.opts = o;
    S.t = 0; S.nextFw = 2.5; S.fwIdx = 0; S.nextCheer = 0.3;
    S.disposables = []; S.rider = []; S.kartObjs = []; S.spots = [];
    S.saved = { fog: scene.fog, bg: scene.background, fov: camera.fov };
    scene.fog = null; scene.background = new THREE.Color(0x1a0d40);
    const root = (S.root = new THREE.Group());
    scene.add(root);

    // lights
    root.add(new THREE.HemisphereLight(0xb8a8ff, 0x3a2060, 0.45));
    const dl = new THREE.DirectionalLight(0xfff0d8, 0.55); dl.position.set(6, 14, 14); root.add(dl);
    const pl1 = new THREE.PointLight(0xff77aa, 0.6, 40); pl1.position.set(-10, 8, 6); root.add(pl1);
    const pl2 = new THREE.PointLight(0x66ccff, 0.6, 40); pl2.position.set(10, 8, 6); root.add(pl2);

    buildSky(root);
    buildStage(root);
    buildSpots(root);

    // karts on podium
    const stepX = { 1: 0, 2: -5.2, 3: 5.2 }, stepH = { 1: 2.1, 2: 1.3, 3: 0.8 };
    const st = (o.standings || []).slice(0, 3);
    for (let i = 0; i < st.length; i++) {
      const s = st[i], place = s.place || i + 1;
      const k = G.Characters.buildKart(s.kart, s.front, s.rear);
      const g = k.group;
      g.position.set(stepX[place], stepH[place] + 0.12, place === 1 ? 0.9 : 0.3);
      g.scale.setScalar(1.3);
      g.rotation.y = place === 2 ? 0.35 : place === 3 ? -0.35 : 0;
      root.add(g);
      const entry = { k, g, baseY: g.position.y, place, ph: i * 1.3, fy: k.front.position.y, ry: k.rear.position.y };
      S.kartObjs.push(entry);
      if (place === 1) S.winnerKart = g;
    }

    // trophy kind matches the player's place if on the podium
    const pp = o.playerPlace;
    const kind = pp === 2 ? 'silver' : pp === 3 ? 'bronze' : 'gold';
    let tr = null;
    try { if (G.Characters.buildTrophy) tr = G.Characters.buildTrophy(kind); } catch (e) { tr = null; }
    if (!tr) tr = buildOwnTrophy(kind);
    const tg = new THREE.Group();
    tg.add(tr);
    // normalise size
    const box = new THREE.Box3().setFromObject(tr);
    const hgt = box.max.y - box.min.y || 1;
    const sc = 3.3 / hgt;
    tr.scale.setScalar(sc);
    tr.position.y = -box.min.y * sc;
    S.trophyTargetY = 2.1 + 0.12;
    tg.position.set(0.2, 20, -1.3);
    // glow halo
    const halo = new THREE.Sprite(track(new THREE.SpriteMaterial({
      map: makeCanvasTex(64, 64, (x, w, h) => {
        const g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
        g.addColorStop(0, 'rgba(255,240,170,0.9)'); g.addColorStop(1, 'rgba(255,200,60,0)');
        x.fillStyle = g; x.fillRect(0, 0, w, h);
      }), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0.7,
    })));
    halo.scale.set(5, 5, 1); halo.position.y = 1.5;
    tg.add(halo);
    S.trophy = tg; S.halo = halo;
    root.add(tg);
    // own spotlight onto trophy
    const tl = new THREE.PointLight(0xfff0b0, 0.5, 14); tl.position.set(0, 6, 3); root.add(tl);

    // banner
    const cupTxt = ((o.cupName || '') + (o.cc ? ' ' + (o.cc === 'mirror' ? 'MIRROR' : o.cc + 'cc') : '')).toUpperCase().trim() || 'GRAND PRIX';
    const banner = (S.banner = makeBanner(cupTxt, pp ? ordinal(pp) : ''));
    banner.position.set(0, 8.2, -3);
    root.add(banner);

    // particles
    S.conf = buildPoints(NCONF, 0.45, THREE.NormalBlending);
    // confetti pieces should be solid squares
    S.conf.material.map = null;
    initConfetti(S.conf);
    root.add(S.conf);
    S.fw = buildPoints(NFW, 0.8, THREE.AdditiveBlending);
    initFireworks(S.fw);
    root.add(S.fw);

    S.active = true;
    S.keyFn = (e) => { if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') { e.preventDefault(); e.stopPropagation(); S.skip(); } };
    S.clickFn = () => S.skip();
    window.addEventListener('keydown', S.keyFn, true);
    window.addEventListener('pointerdown', S.clickFn, true);

    try { if (G.Sound && G.Sound.playMusic) G.Sound.playMusic('ceremony'); } catch (e) { /* ignore */ }
    S.update(0);
  };

  S.skip = function () { if (S.active) end(true); };

  S.update = function (dt) {
    if (!S.active) return;
    if (dt > 0.1) dt = 0.1;
    const t = (S.t += dt);

    // spotlights sweep, aimed at podium
    for (let i = 0; i < S.spots.length; i++) {
      const sp = S.spots[i];
      const tx = Math.sin(t * 0.9 + sp.ph) * 4.5, tz = Math.cos(t * 0.7 + sp.ph) * 1.5;
      sp.piv.lookAt(tx, 0, tz);
      sp.piv.rotateX(-Math.PI / 2); // cone axis is -Y; lookAt aims +Z
      sp.piv.children[0].material.opacity = 0.12 + 0.05 * Math.sin(t * 3 + sp.ph);
    }

    // trophy descent 2.2..5.8
    const td = seg(t, 2.2, 5.8);
    const ty = G.lerp(20, S.trophyTargetY + 0.3, td) + (td >= 1 ? Math.sin(t * 2) * 0.12 : 0);
    S.trophy.position.y = ty;
    S.trophy.rotation.y = t * 1.2;
    S.halo.material.opacity = 0.25 + 0.15 * Math.sin(t * 4) + td * 0.15;
    S.banner.material.opacity = seg(t, 1.5, 2.5) * (1 - seg(t, 11.6, 12.4));

    // riders & karts celebrate
    for (let i = 0; i < S.kartObjs.length; i++) {
      const e = S.kartObjs[i], k = e.k;
      const amp = e.place === 1 ? 0.45 : 0.28;
      const hop = Math.abs(Math.sin(t * 5.5 + e.ph));
      e.g.position.y = e.baseY + hop * (e.place === 1 ? 0.35 : 0.18);
      const w1 = Math.sin(t * 6 + e.ph), w2 = Math.sin(t * 6 + e.ph + 1.6);
      k.front.position.y = e.fy + Math.abs(w1) * amp;
      k.rear.position.y = e.ry + Math.abs(w2) * amp;
      k.front.rotation.z = w1 * 0.22;
      k.rear.rotation.z = -w2 * 0.22;
      k.front.rotation.y = Math.sin(t * 2.5 + e.ph) * 0.5;
      k.rear.rotation.y = Math.sin(t * 2.5 + e.ph + 2) * 0.5;
    }

    // confetti: released from t>0.4, wrap around
    {
      const p = S.conf, pos = p.geometry.attributes.position.array, u = p.userData.vel, b = p.userData.base;
      const on = t > 0.4;
      for (let i = 0; i < NCONF; i++) {
        let y = pos[i * 3 + 1];
        if (!on) continue;
        y -= u[i * 4] * dt;
        if (y < 0.1) y += 24;
        pos[i * 3 + 1] = y;
        const ph = u[i * 4 + 3] + t * u[i * 4 + 1];
        pos[i * 3] = b[i * 2] + Math.sin(ph) * u[i * 4 + 2] * 1.5;
        pos[i * 3 + 2] = b[i * 2 + 1] + Math.cos(ph * 0.8) * u[i * 4 + 2];
      }
      p.geometry.attributes.position.needsUpdate = true;
    }

    // fireworks
    if (t >= S.nextFw) {
      S.nextFw = t + G.rand(0.45, 0.9);
      const a = Math.random() * 6.28;
      burst(Math.cos(a) * G.rand(6, 14), G.rand(9, 17), -G.rand(6, 16));
      try { if (G.Sound && G.Sound.play && Math.random() < 0.4) G.Sound.play('crowd'); } catch (e) { /* ignore */ }
    }
    {
      const p = S.fw, pos = p.geometry.attributes.position.array, col = p.geometry.attributes.color.array;
      const v = p.userData.v, life = p.userData.life, bc = p.userData.base;
      for (let i = 0; i < NFW; i++) {
        const l = life[i];
        if (l <= 0) { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue; }
        life[i] = l - dt * 0.7;
        v[i * 3 + 1] -= GRAV * 0.35 * dt;
        v[i * 3] *= 1 - 0.8 * dt; v[i * 3 + 1] *= 1 - 0.8 * dt; v[i * 3 + 2] *= 1 - 0.8 * dt;
        pos[i * 3] += v[i * 3] * dt; pos[i * 3 + 1] += v[i * 3 + 1] * dt; pos[i * 3 + 2] += v[i * 3 + 2] * dt;
        const f = Math.max(0, l);
        col[i * 3] = bc[i * 3] * f; col[i * 3 + 1] = bc[i * 3 + 1] * f; col[i * 3 + 2] = bc[i * 3 + 2] * f;
      }
      p.geometry.attributes.position.needsUpdate = true;
      p.geometry.attributes.color.needsUpdate = true;
    }

    // cheers
    if (t >= S.nextCheer) {
      S.nextCheer = t + G.rand(1.4, 2.4);
      try { if (G.Sound && G.Sound.play) G.Sound.play('cheer'); } catch (e) { /* ignore */ }
    }

    // camera choreography
    const cam = S.camera;
    const tgtY = S.trophy.position.y;
    if (t < 3.8) {
      const k = seg(t, 0, 3.8);
      camP.set(G.lerp(-4, 0, k), G.lerp(8, 4.5, k), G.lerp(34, 15, k));
      camL.set(0, G.lerp(3, 3.2, k), 0);
    } else if (t < 8.8) {
      const k = (t - 3.8) / 5.0;
      // orbit: start in front, swing to the right side and back toward front-left
      const a = 1.1 * smoothSym(k);
      const r = G.lerp(15, 12, k), y = G.lerp(5, 4, k);
      camP.set(Math.sin(a) * r, y, Math.cos(a) * r);
      camL.set(0, 3.3, 0);
    } else {
      const k = seg(t, 8.8, 11.2);
      // start = end of orbit
      const a = 1.1, r = 12;
      tmpA.set(Math.sin(a) * r, 4, Math.cos(a) * r);
      camP.set(G.lerp(tmpA.x, -1.6, k), G.lerp(4, 5.0, k), G.lerp(tmpA.z, 6.5, k));
      camL.set(G.lerp(0, 0.2, k), G.lerp(3.3, S.trophyTargetY + 2.0, k), G.lerp(0, -1.3, k));
    }
    // gentle handheld sway
    cam.position.set(camP.x + Math.sin(t * 0.8) * 0.12, camP.y + Math.sin(t * 1.1) * 0.08, camP.z);
    cam.lookAt(camL);

    if (t >= DURATION) end(true);
  };

  // eased 0..1 for orbit sweep (ease in/out)
  function smoothSym(k) { return k * k * (3 - 2 * k); }

  S.dispose = function () {
    const scene = S.scene;
    if (S.keyFn) {
      try { window.removeEventListener('keydown', S.keyFn, true); window.removeEventListener('pointerdown', S.clickFn, true); } catch (e) { /* ignore */ }
    }
    S.active = false;
    if (S.root && scene) {
      scene.remove(S.root);
      if (S.saved) { scene.fog = S.saved.fog; scene.background = S.saved.bg; }
    }
    // kart/rider geometry is shared/cached by G.Characters: do not dispose it. Only our own resources.
    if (S.trophy) S.trophy.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    for (let i = 0; i < S.disposables.length; i++) { try { S.disposables[i].dispose(); } catch (e) { /* ignore */ } }
    S.disposables = []; S.rider = []; S.kartObjs = []; S.spots = [];
    S.root = null; S.trophy = null; S.conf = null; S.fw = null; S.banner = null; S.halo = null; S.winnerKart = null;
    S.saved = null; S.onDone = null; S.keyFn = null; S.clickFn = null;
    try { if (G.Sound && G.Sound.stopMusic) { /* main decides next music */ } } catch (e) { /* ignore */ }
  };
})();
