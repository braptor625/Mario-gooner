// Race director (v2): renderer, fixed-step loop, split-screen chase cameras, race/battle state
// machine, Grand Prix / All-Cup Tour / Versus / Time Trial / Battle flows, unlocks, ceremony.
(function () {
  'use strict';
  const G = window.G;

  const GP_POINTS = [10, 8, 6, 4, 3, 2, 1, 0];
  const RACERS = 8;
  const STEP = G.FIXED_DT;
  const INTRO_TIME = 2.6;
  const COUNT_TIME = 3.0;

  const Game = (G.Game = {
    state: 'boot', // boot | attract | intro | countdown | race | finished | results | paused | ceremony
    config: null,
    mode: null,
    track: null,
    karts: [],
    ais: [],
    items: null,
    battle: null,
    player: null, // first human kart (v1 compat)
    humans: [], // [{kart, players:[pIdx], view}]
    raceTime: 0,
    stateTime: 0,
    raceIndex: 0,
    raceList: [],
    standings: null,
    perf: { step: 0, render: 0 },
  });

  // ---------------------------------------------------------------- renderer
  const canvas = document.getElementById('game');
  // AA comes from the multisampled scene target in js/gfx.js; the plain path (low quality) goes without
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !G.GFX, powerPreference: 'high-performance' });
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false; // count every pass of a frame (scene views + post)
  const maxRatio = () => Math.min(window.devicePixelRatio || 1, 1.5);
  let pixelRatio = maxRatio();
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.3, 2500);
  Game.scene = scene;
  Game.camera = camera;
  Game.renderer = renderer;

  // split-screen views: {camera, rect:{x,y,w,h} in 0..1 (y from top), rig, hud, kart}
  let views = [];
  function layoutRects(n) {
    if (n <= 1) return [{ x: 0, y: 0, w: 1, h: 1 }];
    if (n === 2) return [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }];
    return [{ x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0, w: 0.5, h: 0.5 }, { x: 0, y: 0.5, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }].slice(0, n);
  }
  function onResize() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    for (const v of views) {
      v.camera.aspect = (window.innerWidth * v.rect.w) / (window.innerHeight * v.rect.h);
      v.camera.updateProjectionMatrix();
    }
  }
  window.addEventListener('resize', onResize);

  // full-screen flash overlay (lightning, hits)
  const flash = document.createElement('div');
  flash.style.cssText = 'position:fixed;inset:0;pointer-events:none;background:#fff;opacity:0;z-index:5;';
  document.body.appendChild(flash);
  function doFlash(color, strength) {
    flash.style.transition = 'none';
    flash.style.background = color;
    flash.style.opacity = String(strength);
    void flash.offsetWidth;
    flash.style.transition = 'opacity .45s ease-out';
    flash.style.opacity = '0';
  }

  // FPS meter (?fps in URL or F3)
  const fpsEl = document.createElement('div');
  fpsEl.style.cssText =
    'position:fixed;left:8px;bottom:8px;z-index:50;font:700 12px Rubik,monospace;color:#19E3FF;background:#14102Bcc;padding:3px 7px;border-radius:6px;pointer-events:none;display:none';
  document.body.appendChild(fpsEl);
  if (/[?&]fps/.test(location.search)) fpsEl.style.display = 'block';
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F3') {
      e.preventDefault();
      fpsEl.style.display = fpsEl.style.display === 'none' ? 'block' : 'none';
    }
  });

  // ---------------------------------------------------------------- helpers
  const charDef = (id) => (G.CHARACTERS || []).find((c) => c.id === id);
  const charName = (id) => (charDef(id) || { name: id }).name;
  const kartDef = (id) => (G.KARTS || []).find((k) => k.id === id);
  const cssColor = (c) => (typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c || '#888');
  const kartColor = (id) => cssColor((kartDef(id) || {}).color);
  const unlocked = (key) => !G.Save || !G.Save.isUnlocked || G.Save.isUnlocked(key);
  const snd = (name) => G.Sound && G.Sound.play && G.Sound.play(name);
  const voice = (id, kind) => G.Sound && G.Sound.voice && G.Sound.voice(id, kind);
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function weightRank(w) { return w === 'heavy' ? 2 : w === 'medium' ? 1 : 0; }
  function pairWeight(a, b) {
    if (G.Characters && G.Characters.kartWeight) return G.Characters.kartWeight(a, b);
    const wa = (charDef(a) || {}).weight || 'medium', wb = (charDef(b) || {}).weight || 'medium';
    return weightRank(wa) >= weightRank(wb) ? wa : wb;
  }
  function kartsFor(front, rear) {
    if (G.Characters && G.Characters.kartsFor) return G.Characters.kartsFor(front, rear);
    const w = pairWeight(front, rear);
    return (G.KARTS || []).filter((k) => k.weight === w || k.weight === 'any');
  }
  // CPU teams pick one of their own signature karts when they have one (DD behaviour)
  function cpuKartFor(front, rear) {
    const opts = kartsFor(front, rear);
    const own = opts.filter((k) => k.owner === front || k.owner === rear);
    const list = own.length ? own : opts.length ? opts : G.KARTS;
    return G.choice(list).id;
  }

  // Rival teams: every character appears at most once per race (DD rule); natural pairs first.
  function buildRivals(usedChars, count) {
    const used = new Set(usedChars);
    const pool = (G.CHARACTERS || []).filter((c) => unlocked('char:' + c.id) && !used.has(c.id));
    const ids = new Set(pool.map((c) => c.id));
    const teams = [];
    shuffle(pool.slice()).forEach((c) => {
      if (teams.length >= count || !ids.has(c.id) || !ids.has(c.partner)) return;
      ids.delete(c.id); ids.delete(c.partner);
      const heavyFirst = weightRank(c.weight) >= weightRank((charDef(c.partner) || {}).weight);
      teams.push(heavyFirst ? [c.id, c.partner] : [c.partner, c.id]);
    });
    let rest = shuffle(Array.from(ids));
    while (teams.length < count) {
      if (rest.length < 2) rest = shuffle((G.CHARACTERS || []).map((c) => c.id)); // more karts than characters
      const a = rest.pop(), b = rest.pop();
      if (a === b) continue;
      teams.push([a, b]);
    }
    return teams.map((t) => ({ front: t[0], rear: t[1], kart: cpuKartFor(t[0], t[1]), human: false, players: [], total: 0, skill: G.rand(0.55, 1) }));
  }

  // ---------------------------------------------------------------- camera rig
  class CamRig {
    constructor(cam) {
      this.cam = cam;
      this.init = false;
      this.pos = new THREE.Vector3();
      this.look = new THREE.Vector3();
      this.heading = 0;
      this.fov = 68;
      this.shake = 0;
      this.orbit = 0;
      this._v1 = new THREE.Vector3();
      this._v2 = new THREE.Vector3();
    }
    setFov(f, dt) {
      this.fov = G.damp(this.fov, f, 4, dt);
      if (Math.abs(this.cam.fov - this.fov) > 0.01) {
        this.cam.fov = this.fov;
        this.cam.updateProjectionMatrix();
      }
    }
    cinematic(target, dt) {
      const v1 = this._v1;
      this.orbit += dt * 0.25;
      const a = target.heading + Math.PI + Math.sin(this.orbit) * 1.1;
      v1.set(target.pos.x + Math.sin(a) * 11, target.pos.y + 4.5, target.pos.z + Math.cos(a) * 11);
      if (!this.init) { this.pos.copy(v1); this.look.copy(target.pos); this.init = true; }
      this.pos.x = G.damp(this.pos.x, v1.x, 2.5, dt);
      this.pos.y = G.damp(this.pos.y, v1.y, 2.5, dt);
      this.pos.z = G.damp(this.pos.z, v1.z, 2.5, dt);
      this.look.x = G.damp(this.look.x, target.pos.x, 5, dt);
      this.look.y = G.damp(this.look.y, target.pos.y + 1, 5, dt);
      this.look.z = G.damp(this.look.z, target.pos.z, 5, dt);
      this.cam.position.copy(this.pos);
      this.cam.lookAt(this.look);
      this.setFov(62, dt);
    }
    intro(target, t01) {
      const e = t01 * t01 * (3 - 2 * t01);
      const ang = target.heading + G.lerp(0.35, Math.PI, e);
      const dist = G.lerp(26, 6.8, e), h = G.lerp(9, 2.7, e);
      this.cam.position.set(target.pos.x + Math.sin(ang) * dist, target.pos.y + h, target.pos.z + Math.cos(ang) * dist);
      this._v1.set(target.pos.x, target.pos.y + 1, target.pos.z);
      this.cam.lookAt(this._v1);
      this.pos.copy(this.cam.position);
      this.look.copy(this._v1);
      this.heading = target.heading;
      this.init = true;
      this.setFov(68, 10);
    }
    chase(target, dt, lookBack, orbiting, topSpeed) {
      const v1 = this._v1, v2 = this._v2;
      if (!this.init) { this.heading = target.heading; this.init = true; }
      if (orbiting) this.orbit += dt * 0.35;
      const dh = G.wrapAngle(target.heading - this.heading);
      this.heading += dh * (1 - Math.exp(-(target.drifting ? 4.2 : 6.5) * dt));
      let ch = this.heading + (orbiting ? this.orbit + Math.PI : 0);
      if (lookBack) ch += Math.PI;
      const speed01 = G.clamp(Math.abs(target.speed) / topSpeed, 0, 1.5);
      const dist = 6.2 + speed01 * 1.1, height = 2.5 + speed01 * 0.3;
      const fx = Math.sin(ch), fz = Math.cos(ch);
      v1.set(target.pos.x - fx * dist, target.pos.y + height, target.pos.z - fz * dist);
      if (Game.track && !target.cannonFlight) {
        const q = Game.track.query(v1.x, v1.z, target.trackIndex != null ? target.trackIndex : -1, target.pos.y);
        if (q && q.surface !== 'void' && v1.y < q.y + 1.2 && Math.abs(q.y - target.pos.y) < 6) v1.y = q.y + 1.2;
      }
      const k = target.cannonFlight ? 4 : 12;
      this.pos.x = G.damp(this.pos.x, v1.x, k, dt);
      this.pos.y = G.damp(this.pos.y, v1.y, target.cannonFlight ? 4 : 6, dt);
      this.pos.z = G.damp(this.pos.z, v1.z, k, dt);
      if (target.falling && !target.rescued) this.pos.y = Math.max(this.pos.y, target.pos.y + 3);
      v2.set(target.pos.x + fx * 4, target.pos.y + 1.1, target.pos.z + fz * 4);
      this.look.x = G.damp(this.look.x, v2.x, 18, dt);
      this.look.y = G.damp(this.look.y, v2.y, 8, dt);
      this.look.z = G.damp(this.look.z, v2.z, 18, dt);
      this.cam.position.copy(this.pos);
      if (this.shake > 0) {
        this.shake = Math.max(0, this.shake - dt * 2.5);
        const s = this.shake * 0.35;
        this.cam.position.x += (Math.random() - 0.5) * s;
        this.cam.position.y += (Math.random() - 0.5) * s;
      }
      this.cam.lookAt(this.look);
      const boosting = target.boostTimer > 0 || target.starTimer > 0;
      this.setFov(68 + speed01 * 6 + (boosting ? 9 : 0) - (views.length > 2 ? 4 : 0), dt);
    }
  }
  const mainRig = new CamRig(camera);

  function buildViews(humanKarts) {
    for (const v of views) if (v.hud && v.hud !== G.HUD && v.hud.destroy) v.hud.destroy();
    views = [];
    const n = Math.max(1, humanKarts.length);
    const rects = layoutRects(n);
    for (let i = 0; i < n; i++) {
      const cam = i === 0 ? camera : new THREE.PerspectiveCamera(68, 1, 0.3, 2500);
      let hud = null;
      if (G.HUD) {
        if (n === 1) hud = G.HUD;
        else if (G.HUD.create) hud = G.HUD.create(i, n);
        else if (i === 0) hud = G.HUD;
      }
      views.push({ camera: cam, rect: rects[i], rig: i === 0 ? mainRig : new CamRig(cam), hud, kart: humanKarts[i] || null, hudState: makeHudState(), dots: [] });
    }
    mainRig.init = false;
    onResize();
  }
  function forHuds(fn) {
    for (const v of views) if (v.hud) fn(v.hud, v);
  }

  // ---------------------------------------------------------------- race setup
  function clearRace() {
    if (Game.items) { if (Game.items.dispose) Game.items.dispose(); Game.items = null; }
    if (Game.battle && Game.battle.dispose) { Game.battle.dispose(); Game.battle = null; }
    if (Game.ghostPlayer) { Game.ghostPlayer.dispose && Game.ghostPlayer.dispose(); Game.ghostPlayer = null; }
    Game.ghostRec = null;
    for (const k of Game.karts) {
      if (k.dispose) k.dispose();
      else if (k.mesh && k.mesh.parent) k.mesh.parent.remove(k.mesh);
    }
    Game.karts = [];
    Game.ais = [];
    Game.humans = [];
    Game.player = null;
    if (Game.battle && Game.battle.dispose) Game.battle.dispose();
    Game.battle = null;
    if (Game.track) { Game.track.dispose(); Game.track = null; }
    for (let i = scene.children.length - 1; i >= 0; i--) scene.remove(scene.children[i]);
    scene.fog = null;
    scene.background = null;
  }

  // per-course reflections, bloom and sun shadows
  function applyTrackLook(track) {
    if (!G.GFX) return;
    const cfg = track.cfg;
    if (cfg && cfg.sky) G.GFX.setEnvFromTheme(cfg.sky[0], cfg.sky[1], cfg.ground !== undefined ? cfg.ground : cfg.sky[2]);
    const night = track.theme === 'starlight' || (cfg && cfg.bg !== undefined && new THREE.Color(cfg.bg).getHSL({}).l < 0.2);
    G.GFX.bloomStrength = night ? 0.62 : 0.5;
    G.GFX.bloomThreshold = night ? 0.7 : 0.74;
    const sun = track.sun;
    if (sun) {
      sun.castShadow = !!Game.shadows;
      if (Game.shadows) {
        sun.shadow.mapSize.set(2048, 2048);
        const sc = sun.shadow.camera;
        sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 500;
        sc.updateProjectionMatrix();
        sun.shadow.bias = -0.0006;
        sun.shadow.normalBias = 0.02;
      }
      if (G.GFX.setSun) G.GFX.setSun(sun.position.clone().sub(sun.target.position), sun.color.getHex());
    }
  }
  // keep the shadow frustum centred on the action (sun and target live under the track root)
  const _sunOff = new THREE.Vector3();
  function updateSun() {
    const sun = Game.track && Game.track.sun;
    if (!sun || !sun.castShadow) return;
    const t = Game.player || sorted[0] || Game.karts[0];
    if (!t) return;
    if (!sun.userData.offset) sun.userData.offset = sun.position.clone().sub(sun.target.position);
    const root = sun.parent;
    _sunOff.copy(t.pos);
    if (root) root.worldToLocal(_sunOff);
    sun.target.position.copy(_sunOff);
    sun.position.copy(_sunOff).add(sun.userData.offset);
    sun.target.updateMatrixWorld();
  }

  function makeKart(e, i, track, cc, grid) {
    const kart = new G.Kart({ scene, track, kartId: e.kart, frontId: e.front, rearId: e.rear, isPlayer: !!e.human, index: i, cc });
    const g = grid[i];
    kart.pos.set(g.x, g.y, g.z);
    kart.heading = g.heading;
    if (kart.vel) kart.vel.set(0, 0, 0);
    kart.speed = 0;
    kart.entrant = e;
    kart.lapTimes = [];
    kart.lapStart = 0;
    kart.position = i + 1;
    kart._cssColor = kartColor(e.kart);
    if (kart.mesh && Game.shadows) kart.mesh.traverse((o) => { if (o.isMesh && !o.material.transparent) o.castShadow = true; });
    if (e.players && e.players.length === 2) kart.coop = { driver: e.players[0], thrower: e.players[1] };
    if (kart.mesh) {
      kart.mesh.position.copy(kart.pos);
      kart.mesh.rotation.y = kart.heading;
    }
    return kart;
  }

  // entrants in grid order (index 0 = pole)
  function setupRace(trackId, entrants, opts) {
    clearRace();
    const cc = opts.cc;
    const humanCount = entrants.filter((e) => e.human).length;
    Game.shadows = !!G.GFX && G.GFX.quality === 'high' && humanCount <= 1;
    renderer.shadowMap.enabled = Game.shadows;
    const track = (Game.track = new G.Track(trackId, scene, { mirror: !!opts.mirror }));
    applyTrackLook(track);
    const grid = track.getStartGrid(entrants.length);
    entrants.forEach((e, i) => {
      const kart = makeKart(e, i, track, cc, grid);
      Game.karts.push(kart);
      if (e.human) Game.humans.push({ kart, players: e.players });
      else Game.ais.push(new G.AIController(kart, track, { skill: e.skill != null ? e.skill : G.rand(0.45, 0.95), cc }));
    });
    Game.player = Game.humans.length ? Game.humans[0].kart : null;

    let itemTrack = track;
    if (opts.mode === 'tt') {
      itemTrack = Object.create(track);
      itemTrack.itemBoxSpots = [];
    }
    Game.items = new G.ItemSystem(scene, itemTrack, Game.karts, { mode: 'race', boxes: opts.mode !== 'tt', freq: opts.itemFreq });
    if (opts.mode === 'tt' && Game.player) {
      // DD time trial: each rider carries one mushroom
      Game.player.heldItems[0] = 'mushroom'; Game.player.itemCounts[0] = 1;
      Game.player.heldItems[1] = 'mushroom'; Game.player.itemCounts[1] = 1;
      if (G.Ghost && G.Ghost.Recorder) Game.ghostRec = new G.Ghost.Recorder(Game.player);
      const data = opts.ghost && G.Save && G.Save.ghost ? G.Save.ghost(trackId) : null;
      if (data && G.Ghost && G.Ghost.Player) {
        try { Game.ghostPlayer = new G.Ghost.Player(scene, data); } catch (err) { console.warn('ghost failed', err); }
      }
    }

    Game.laps = track.laps || 3;
    Game.raceTime = 0;
    Game.rocketPress = {};
    Game.resultsShown = false;
    Game.allHumansDone = false;
    buildViews(Game.humans.map((h) => h.kart));
    forHuds((hud) => hud.setMinimap && hud.setMinimap(track.minimap));
  }

  function setupBattle(cfg, entrants) {
    clearRace();
    Game.shadows = false;
    renderer.shadowMap.enabled = false;
    const arena = (Game.track = new G.Arena(cfg.arena || (G.ARENAS && G.ARENAS[0].id), scene, {}));
    applyTrackLook(arena);
    const grid = arena.getStartGrid(entrants.length);
    entrants.forEach((e, i) => {
      const kart = makeKart(e, i, arena, 100, grid);
      Game.karts.push(kart);
      if (e.human) Game.humans.push({ kart, players: e.players });
      else if (G.BattleAI) Game.ais.push(new G.BattleAI(kart, arena, { skill: G.rand(0.5, 0.95) }));
    });
    Game.player = Game.humans.length ? Game.humans[0].kart : null;
    Game.items = new G.ItemSystem(scene, arena, Game.karts, { mode: cfg.battleType || 'balloon', boxes: true });
    Game.battle = new G.BattleMode(Game, { type: cfg.battleType || 'balloon', arena, karts: Game.karts });
    Game.laps = 0;
    Game.raceTime = 0;
    Game.rocketPress = {};
    Game.resultsShown = false;
    buildViews(Game.humans.map((h) => h.kart));
    forHuds((hud) => hud.setMinimap && hud.setMinimap(arena.minimap));
  }

  // ---------------------------------------------------------------- public API
  // config (from ui.js): { mode: 'gp'|'tt'|'vs'|'battle', cc: 50|100|150|'mirror', players:[{front,rear,kart}],
  //   coop, cup, track, arena, battleType, itemFreq, cpu, ghost }  (v1: front/rear/kart at top level)
  Game.start = function (config) {
    config = Object.assign({}, config);
    if (config.mode === 'race') config.mode = config.track ? 'vs1' : 'gp';
    if (!config.players || !config.players.length) config.players = [{ front: config.front, rear: config.rear, kart: config.kart }];
    config.players.forEach((p) => { if (!p.kart && p.front) p.kart = cpuKartFor(p.front, p.rear); });
    Game.config = config;
    Game.mode = config.mode;
    Game.mirror = config.cc === 'mirror';
    Game.cc = Game.mirror ? 150 : config.cc || 100;

    // humans: coop = one kart driven by two players
    const humans = [];
    if (config.coop && config.players.length >= 1) {
      const p = config.players[0];
      humans.push({ front: p.front, rear: p.rear, kart: p.kart, human: true, players: [0, 1], total: 0 });
      for (let i = 2; i < config.players.length; i++) {
        const q = config.players[i];
        if (q.front) humans.push({ front: q.front, rear: q.rear, kart: q.kart, human: true, players: [i], total: 0 });
      }
    } else {
      config.players.forEach((p, i) => { if (p.front) humans.push({ front: p.front, rear: p.rear, kart: p.kart, human: true, players: [i], total: 0 }); });
    }
    const playerCount = config.coop ? Math.max(2, config.players.length) : humans.length;
    if (G.Input.configure) G.Input.configure(playerCount);

    const used = [];
    humans.forEach((h) => used.push(h.front, h.rear));
    Game.standings = humans.slice();
    const mode = config.mode;
    if (mode === 'gp' || mode === 'vs1' || (mode === 'battle' && (config.cpu || humans.length < 2))) {
      const n = mode === 'battle' ? Math.max(0, 4 - humans.length) : RACERS - humans.length;
      buildRivals(used, n).forEach((r) => Game.standings.push(r));
    }

    if (mode === 'battle') {
      setupBattle(config, Game.standings);
      afterSetup(G.ARENAS && (G.ARENAS.find((a) => a.id === config.arena) || G.ARENAS[0]));
      return;
    }

    if (mode === 'gp') {
      const cup = (G.CUPS || []).find((c) => c.id === config.cup) || G.CUPS[0];
      Game.cupId = cup.id;
      Game.cupName = cup.name;
      let list = cup.tracks.slice();
      if (cup.allCup && list.length > 2) {
        // DD All-Cup Tour: first course fixed, last course fixed, the rest shuffled
        const first = list.shift(), last = list.pop();
        list = [first].concat(shuffle(list), [last]);
      }
      Game.raceList = list;
    } else {
      Game.raceList = [config.track || G.TRACKS[0].id];
      Game.cupId = null;
      Game.cupName = null;
    }
    Game.raceIndex = 0;
    startCurrentRace();
  };

  function startCurrentRace() {
    const trackId = Game.raceList[Game.raceIndex];
    let order;
    const humans = Game.standings.filter((s) => s.human);
    const cpus = Game.standings.filter((s) => !s.human);
    if (Game.mode !== 'gp' || Game.raceIndex === 0) order = shuffle(cpus).concat(humans); // humans start at the back
    else order = Game.standings.slice().sort((a, b) => a.total - b.total); // reverse of standings
    setupRace(trackId, order, { cc: Game.cc, mirror: Game.mirror, mode: Game.mode, ghost: Game.config.ghost, itemFreq: Game.config.itemFreq });
    afterSetup(G.TRACKS.find((t) => t.id === trackId));
  }

  function afterSetup(tdef) {
    if (G.UI && G.UI.hideMenus) G.UI.hideMenus();
    forHuds((hud) => hud.show && hud.show());
    let label = tdef ? tdef.name : '';
    if (Game.cupName && Game.mode === 'gp') label = Game.cupName + ' · Race ' + (Game.raceIndex + 1) + '/' + Game.raceList.length + ' · ' + label;
    if (Game.mirror) label += ' · MIRROR';
    forHuds((hud) => hud.banner && hud.banner(label, 'info'));
    if (G.Sound) {
      G.Sound.playMusic(Game.mode === 'tt' ? 'timetrial' : tdef && tdef.music ? tdef.music : 'circuit');
      if (G.Sound.setMusicTempoBoost) G.Sound.setMusicTempoBoost(false);
    }
    setState('intro');
  }

  Game.restartRace = function () {
    if (G.UI && G.UI.hidePause) G.UI.hidePause();
    if (Game.mode === 'battle') Game.start(Game.config);
    else startCurrentRace();
  };

  Game.quitToTitle = function () {
    if (G.UI && G.UI.hidePause) G.UI.hidePause();
    forHuds((hud) => hud.hide && hud.hide());
    if (G.HUD && G.HUD.hide) G.HUD.hide();
    if (G.Input.configure) G.Input.configure(1);
    startAttract();
    if (G.UI) G.UI.showTitle();
  };

  function setState(s) {
    Game.state = s;
    Game.stateTime = 0;
  }

  // ---------------------------------------------------------------- attract mode (behind menus)
  function startAttract() {
    let ids = (G.TRACKS || []).map((t) => t.id);
    if (!ids.length) ids = ['meadow'];
    const teams = buildRivals([], RACERS);
    setupRace(G.choice(ids), teams, { cc: 150, mirror: false, mode: 'attract' });
    buildViews([]);
    Game.config = null;
    Game.mode = 'attract';
    Game.cc = 150;
    setState('attract');
    if (G.Sound && G.Sound.stopEngine) G.Sound.stopEngine();
  }

  // ---------------------------------------------------------------- input routing
  function routeInput(h) {
    const kart = h.kart, inp = kart.input;
    const players = G.Input.players;
    const ps = (i) => (players && players[i] ? players[i].state : G.Input.state);
    if (h.players.length >= 2) {
      // co-op: driver steers, thrower handles items; either may call a swap (DD needs both, we accept one)
      const c = kart.coop || { driver: h.players[0], thrower: h.players[1] };
      const d = ps(c.driver), t = ps(c.thrower);
      inp.accel = d.accel; inp.brake = d.brake; inp.steer = d.steer; inp.drift = d.drift;
      inp.item = t.item; inp.itemPressed = t.itemPressed; inp.itemReleased = t.itemReleased; inp.throwBack = t.throwBack;
      inp.slapPressed = !!(t.slapPressed || (t.itemPressed && !kart.heldItems[0] && !kart.heldItems[1]));
      inp.swapPressed = !!(d.swapPressed || t.swapPressed);
    } else {
      const s = ps(h.players[0]);
      inp.accel = s.accel; inp.brake = s.brake; inp.steer = s.steer; inp.drift = s.drift;
      inp.item = s.item; inp.itemPressed = s.itemPressed; inp.itemReleased = s.itemReleased;
      inp.swapPressed = s.swapPressed; inp.throwBack = s.throwBack; inp.slapPressed = !!s.slapPressed;
    }
  }
  function zeroInput(kart) {
    const inp = kart.input;
    inp.accel = 0; inp.brake = 0; inp.steer = 0; inp.drift = false; inp.item = false;
    inp.itemPressed = false; inp.itemReleased = false; inp.swapPressed = false; inp.throwBack = false; inp.slapPressed = false;
  }
  function anyPause() {
    const players = G.Input.players;
    if (!players) return G.Input.state.pausePressed;
    for (const p of players) if (p && p.state && p.state.pausePressed) return true;
    return false;
  }
  function humanAccelHeld(h) {
    const players = G.Input.players;
    const i = h.kart.coop ? h.kart.coop.driver : h.players[0];
    const s = players && players[i] ? players[i].state : G.Input.state;
    return !!s.accel;
  }

  const aiCtx = { karts: null, items: null, player: null, players: null, raceTime: 0, track: null, battle: null };
  function stepAIs() {
    aiCtx.karts = Game.karts;
    aiCtx.items = Game.items;
    aiCtx.player = Game.player || Game.karts[0];
    aiCtx.players = Game.humans.map((h) => h.kart);
    aiCtx.raceTime = Game.raceTime;
    aiCtx.track = Game.track;
    aiCtx.battle = Game.battle;
    for (let i = 0; i < Game.ais.length; i++) Game.ais[i].update(STEP, aiCtx);
  }

  const sorted = [];
  function updatePositions() {
    sorted.length = 0;
    for (const k of Game.karts) sorted.push(k);
    sorted.sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.raceDist - a.raceDist;
    });
    for (let i = 0; i < sorted.length; i++) sorted[i].position = i + 1;
  }

  function viewOf(kart) {
    if (!kart) return null;
    for (const v of views) if (v.kart === kart) return v;
    return null;
  }

  function checkLaps() {
    const laps = Game.laps;
    for (const k of Game.karts) {
      if (k.finished) continue;
      const lap = k.lap | 0;
      if (k._seenLap === undefined) k._seenLap = lap;
      if (lap > k._seenLap) {
        if (k._seenLap >= 1) k.lapTimes.push(Game.raceTime - k.lapStart);
        k.lapStart = Game.raceTime;
        k._seenLap = lap;
        const v = viewOf(k);
        if (lap > laps) {
          k.finished = true;
          k.finishTime = Game.raceTime;
          if (v) onHumanFinish(k, v);
        } else if (v && lap > 1) {
          if (lap === laps) {
            v.hud && v.hud.banner && v.hud.banner('FINAL LAP!', 'final');
            snd('final_lap');
            if (G.Sound && G.Sound.setMusicTempoBoost) G.Sound.setMusicTempoBoost(true);
          } else {
            v.hud && v.hud.banner && v.hud.banner('LAP ' + lap, 'lap');
            snd('lap');
          }
        }
      } else if (lap < k._seenLap) {
        k._seenLap = lap;
      }
    }
  }

  function onHumanFinish(k, v) {
    v.hud && v.hud.banner && v.hud.banner(k.position === 1 ? 'WINNER!' : 'FINISH!', 'finish');
    snd('finish');
    voice(k.front, k.position <= 3 ? 'win' : 'lose');
    // the computer takes over this kart
    Game.ais.push(new G.AIController(k, Game.track, { skill: 0.8, cc: Game.cc }));
    if (Game.mode === 'tt') finishTimeTrial(k, v);
    if (Game.humans.every((h) => h.kart.finished)) {
      Game.allHumansDone = true;
      setState('finished');
      if (G.Sound && G.Sound.setMusicTempoBoost) G.Sound.setMusicTempoBoost(false);
    }
  }

  function finishTimeTrial(k, v) {
    if (!G.Save || !G.Save.setRecord) return;
    const best = k.lapTimes.length ? Math.min.apply(null, k.lapTimes) : k.finishTime;
    const data = Game.ghostRec && Game.ghostRec.finish ? Game.ghostRec.finish() : null;
    Game.ghostRec = null;
    let improved = false;
    try { improved = G.Save.setRecord(Game.track.id, k.finishTime, best, data); } catch (err) { console.warn(err); }
    if (improved) {
      v.hud && v.hud.banner && v.hud.banner('NEW RECORD!', 'final');
      snd('unlock');
    }
  }

  // estimated finishing times for karts still racing when results are shown
  function projectFinishes() {
    const total = Game.track.length * Game.laps;
    const done = Game.karts.filter((k) => k.finished);
    let pace = 0;
    done.forEach((k) => { pace += total / Math.max(1, k.finishTime); });
    pace = done.length ? pace / done.length : 25;
    for (const k of Game.karts) {
      if (k.finished) continue;
      const remaining = Math.max(0, total - k.raceDist);
      k.finished = true;
      k.finishTime = Game.raceTime + remaining / (pace * 0.97) + Math.random() * 0.3;
    }
    updatePositions();
  }

  // DD rocket start: press accelerate just as the last countdown number disappears
  function rocketStartLevel(press, held) {
    if (press == null || !held) return 0;
    const before = COUNT_TIME - press;
    if (before >= 0.12 && before <= 0.45) return 2;
    if (before > 0.45 && before <= 0.8) return 1;
    if (before > 1.4) return -1;
    return 0;
  }

  // track hazards (traffic, crushers, boulders ...) vs karts
  function collideHazards() {
    const track = Game.track;
    if (!track || !track.getHazards) return;
    const hz = track.getHazards();
    if (!hz.length) return;
    for (const k of Game.karts) {
      if (k.ghost || k.falling || k.cannonFlight) continue;
      if (k._hazCd > 0) { k._hazCd -= STEP; continue; }
      for (let i = 0; i < hz.length; i++) {
        const h = hz[i];
        if (Math.abs(h.y - k.pos.y) > 4 + h.radius) continue;
        const dx = k.pos.x - h.x, dz = k.pos.z - h.z, r = h.radius + 1.1;
        if (dx * dx + dz * dz > r * r) continue;
        if (h.hitKind === 'bump') {
          const d = Math.sqrt(dx * dx + dz * dz) || 1;
          if (k.bump) k.bump((dx / d) * 9 + (h.vx || 0), (dz / d) * 9 + (h.vz || 0));
          k._hazCd = 0.4;
        } else {
          if (k.isInvincible && k.isInvincible()) continue;
          k.hit(h.hitKind);
          k._hazCd = 1.0;
          const v = viewOf(k);
          if (v) { v.rig.shake = 0.7; voice(k.rear, 'hit'); }
        }
        break;
      }
    }
  }

  function physicsStep(drive) {
    if (drive) for (const h of Game.humans) if (!h.kart.finished || Game.mode === 'battle') routeInput(h);
    stepAIs();
    for (const k of Game.karts) k.update(STEP);
    G.Kart.resolveCollisions(Game.karts);
    collideHazards();
    Game.items.update(STEP, Game.raceTime);
    Game.track.update(STEP, Game.raceTime);
  }

  function step() {
    if (G.Input.poll) G.Input.poll();
    const st = Game.state;
    Game.stateTime += STEP;

    if (st === 'paused' || st === 'boot' || st === 'results' || st === 'ceremony') return;

    if (st === 'attract') {
      if (!Game.track) return;
      Game.raceTime += STEP;
      physicsStep(false);
      updatePositions();
      return;
    }

    if (anyPause() && (st === 'race' || st === 'countdown' || st === 'intro' || st === 'finished')) {
      pauseGame();
      return;
    }

    if (st === 'intro' || st === 'countdown') {
      for (const k of Game.karts) { zeroInput(k); k.update(STEP); }
      Game.track.update(STEP, Game.stateTime);
      if (st === 'intro' && Game.stateTime >= INTRO_TIME) {
        setState('countdown');
        forHuds((hud) => hud.countdown && hud.countdown(3));
        snd('countdown');
        Game.lastCount = 3;
      }
      if (st === 'countdown') {
        for (const h of Game.humans) {
          const held = humanAccelHeld(h), key = h.kart.index;
          const rp = Game.rocketPress[key] || (Game.rocketPress[key] = { t: null, prev: false });
          if (held && !rp.prev) rp.t = Game.stateTime;
          if (!held) rp.t = null;
          rp.prev = held;
        }
        const n = 3 - Math.floor(Game.stateTime);
        if (n !== Game.lastCount && n >= 1) {
          Game.lastCount = n;
          forHuds((hud) => hud.countdown && hud.countdown(n));
          snd('countdown');
        }
        if (Game.stateTime >= COUNT_TIME) {
          forHuds((hud) => hud.countdown && hud.countdown(0));
          snd('go');
          for (const k of Game.karts) {
            const h = Game.humans.find((x) => x.kart === k);
            if (h) {
              const rp = Game.rocketPress[k.index] || {};
              k.rocketStart(rocketStartLevel(rp.t, humanAccelHeld(h)));
            } else {
              const r = Math.random();
              k.rocketStart(r < 0.35 ? 2 : r < 0.7 ? 1 : 0);
            }
          }
          setState('race');
        }
      }
      return;
    }

    // race / finished
    Game.raceTime += STEP;
    physicsStep(st === 'race' || st === 'finished');
    if (Game.ghostRec && Game.ghostRec.sample && Game.player && !Game.player.finished) Game.ghostRec.sample();
    if (Game.ghostPlayer && Game.ghostPlayer.update) Game.ghostPlayer.update(Game.raceTime);

    if (Game.mode === 'battle') {
      Game.battle.step(STEP);
      if (!Game.resultsShown && Game.battle.isOver()) {
        Game.resultsShown = true;
        setState('finished');
        forHuds((hud) => hud.banner && hud.banner('GAME!', 'finish'));
        snd('finish');
        setTimeout(showBattleResults, 2500);
      }
      return;
    }

    checkLaps();
    updatePositions();

    if (st === 'finished' && !Game.resultsShown && Game.stateTime > 3.5) {
      Game.resultsShown = true;
      showRaceResults();
    }
  }

  function pauseGame() {
    Game.pausedFrom = Game.state;
    setState('paused');
    if (G.Sound && G.Sound.stopEngine) G.Sound.stopEngine();
    G.UI.showPause(
      () => { G.UI.hidePause(); Game.state = Game.pausedFrom; if (G.Input.reset) G.Input.reset(); },
      () => Game.restartRace(),
      () => Game.quitToTitle()
    );
  }

  // ---------------------------------------------------------------- results / GP flow
  const teamName = (e) => charName(e.front) + ' & ' + charName(e.rear);
  function fmtTime(t) {
    const m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
  }
  function standingsRows() {
    return Game.standings
      .slice()
      .sort((a, b) => b.total - a.total)
      .map((e, i) => ({ pos: i + 1, name: teamName(e), kartColor: kartColor(e.kart), time: '', points: null, total: e.total, isPlayer: !!e.human, front: e.front, rear: e.rear, kart: e.kart }));
  }

  function showRaceResults() {
    projectFinishes();
    setState('results');
    if (G.Sound) { if (G.Sound.stopEngine) G.Sound.stopEngine(); G.Sound.playMusic('results'); }
    const gp = Game.mode === 'gp';
    const rows = sorted.map((k, i) => {
      const pts = gp ? GP_POINTS[i] || 0 : 0;
      if (gp) k.entrant.total += pts;
      return { pos: i + 1, name: teamName(k.entrant), kartColor: k._cssColor, time: fmtTime(k.finishTime), points: pts, total: k.entrant.total, isPlayer: !!k.entrant.human, front: k.front, rear: k.rear };
    });
    const tdef = G.TRACKS.find((t) => t.id === Game.raceList[Game.raceIndex]);
    let title = tdef ? tdef.name : 'Results';
    if (Game.mode === 'tt' && Game.player) {
      const lt = Game.player.lapTimes;
      if (lt.length) title += ' · Best lap ' + fmtTime(Math.min.apply(null, lt));
    }
    G.HUD.showResults(rows, { title, showPoints: gp, gp }, () => {
      if (gp && Game.raceIndex < Game.raceList.length - 1) {
        Game.raceIndex++;
        G.HUD.showResults(standingsRows(), { title: (Game.cupName || 'Cup') + ' Standings', showPoints: true, gp: true, standings: true }, () => startCurrentRace());
      } else if (gp) {
        finishGrandPrix();
      } else {
        Game.quitToTitle();
      }
    });
  }

  function finishGrandPrix() {
    const st = standingsRows();
    const best = st.find((r) => r.isPlayer);
    const place = best ? best.pos : 9;
    let unlocks = [];
    if (G.Save && G.Save.recordGP) {
      try { unlocks = G.Save.recordGP(Game.cupId, Game.mirror ? 'mirror' : Game.cc, place) || []; } catch (err) { console.warn(err); }
    }
    const after = () => {
      const done = () => Game.quitToTitle();
      if (unlocks.length && G.UI && G.UI.showUnlocks) G.UI.showUnlocks(unlocks, done);
      else done();
    };
    const showFinal = () => {
      if (G.UI && G.UI.showGPFinal) G.UI.showGPFinal(st, after);
      else after();
    };
    if (G.Ceremony && G.Ceremony.play) {
      if (G.HUD && G.HUD.hide) G.HUD.hide();
      forHuds((hud) => hud.hide && hud.hide());
      clearRace();
      buildViews([]);
      setState('ceremony');
      G.Ceremony.play({
        scene, camera,
        standings: st.slice(0, 3).map((r) => ({ front: r.front, rear: r.rear, kart: r.kart, name: r.name, place: r.pos })),
        playerPlace: place, cupName: Game.cupName, cc: Game.mirror ? 'mirror' : Game.cc,
      }, () => {
        setState('results');
        showFinal();
      });
    } else showFinal();
  }

  function showBattleResults() {
    setState('results');
    if (G.Sound) { if (G.Sound.stopEngine) G.Sound.stopEngine(); G.Sound.playMusic('results'); }
    const rows = (Game.battle.results ? Game.battle.results() : []).map((r) => Object.assign({ time: r.stat != null ? String(r.stat) : '' }, r));
    const done = () => Game.quitToTitle();
    if (G.UI && G.UI.showBattleResults) G.UI.showBattleResults(rows, done);
    else G.HUD.showResults(rows, { title: 'Battle Results', showPoints: false }, done);
  }

  // ---------------------------------------------------------------- HUD feed
  function makeHudState() {
    return {
      lap: 1, laps: 3, position: 1, racerCount: RACERS, time: 0, lapTimes: null,
      items: [null, null], counts: [0, 0], roulette: [false, false], front: '', rear: '', frontId: '', rearId: '',
      speed01: 0, driftLevel: 0, boost: false, minimap: { karts: [] }, wrongWay: false, finalLap: false,
      drafting01: 0, coop: null, battle: null,
    };
  }
  function feedHUD() {
    const cc = Game.cc || 150, top = G.CC_SPEED[cc] || 30;
    for (let vi = 0; vi < views.length; vi++) {
      const v = views[vi], p = v.kart;
      if (!p || !v.hud || !v.hud.update) continue;
      const s = v.hudState;
      const laps = Game.laps || 3;
      s.laps = laps;
      s.lap = G.clamp(p.lap | 0, 1, Math.max(1, laps));
      s.finalLap = s.lap === laps && laps > 0;
      s.position = p.position;
      s.racerCount = Game.karts.length;
      s.time = p.finished && Game.mode !== 'battle' ? p.finishTime : Game.state === 'race' || Game.state === 'finished' ? Game.raceTime : 0;
      s.lapTimes = p.lapTimes;
      s.items[0] = p.heldItems[0]; s.items[1] = p.heldItems[1];
      s.counts[0] = p.itemCounts[0]; s.counts[1] = p.itemCounts[1];
      s.roulette[0] = p.roulette[0] > 0; s.roulette[1] = p.roulette[1] > 0;
      s.front = charName(p.front); s.rear = charName(p.rear);
      s.frontId = p.front; s.rearId = p.rear;
      s.speed01 = G.clamp(Math.abs(p.speed) / top, 0, 1.3);
      s.driftLevel = p.drifting ? p.driftLevel | 0 : 0;
      s.boost = p.boostTimer > 0 || p.starTimer > 0;
      s.drafting01 = p.drafting01 || 0;
      s.wrongWay = !!p.wrongWay && Game.state === 'race' && Game.mode !== 'battle';
      s.coop = p.coop ? { driver: 'P' + (p.coop.driver + 1), thrower: 'P' + (p.coop.thrower + 1) } : null;
      s.battle = Game.battle && Game.battle.hudState ? Game.battle.hudState(p) : null;
      const dots = v.dots;
      for (let i = 0; i < Game.karts.length; i++) {
        const k = Game.karts[i];
        let d = dots[i];
        if (!d) d = dots[i] = { x: 0, z: 0, color: '#fff', isPlayer: false };
        d.x = k.pos.x; d.z = k.pos.z;
        d.color = k._cssColor || '#fff';
        d.isPlayer = k === p;
      }
      dots.length = Game.karts.length;
      s.minimap.karts = dots;
      v.hud.update(s);
      if (G.Sound && G.Sound.setEngine && Game.state !== 'results') {
        const surf = p.trackInfo && p.trackInfo.surface;
        G.Sound.setEngine(s.speed01, s.boost, surf === 'road' || surf === 'boost' || surf === 'ice', vi);
      }
    }
  }

  // ---------------------------------------------------------------- events
  G.events.on('lightning', () => {
    doFlash('#fff7a8', 0.75);
    for (const v of views) v.rig.shake = 0.6;
  });
  G.events.on('itemHit', (e) => {
    if (!e) return;
    const vv = viewOf(e.victim);
    if (vv) { vv.rig.shake = 0.8; if (views.length === 1) doFlash('#ff3b3b', 0.25); voice(e.victim.rear, 'hit'); }
    const va = viewOf(e.attacker);
    if (va && va !== vv && va.hud && va.hud.banner) { va.hud.banner('HIT!', 'info'); voice(e.attacker.rear, 'taunt'); }
  });

  // ---------------------------------------------------------------- main loop
  let last = performance.now();
  let acc = 0;
  let fpsFrames = 0, fpsTime = 0, slowTime = 0, fastTime = 0;

  function updateCameras(dt) {
    const st = Game.state;
    if (st === 'ceremony') return; // ceremony drives the main camera
    if (st === 'attract' || !views.length || !views[0].kart) {
      const target = sorted[0] || Game.karts[0];
      if (target) mainRig.cinematic(target, dt);
      return;
    }
    const top = G.CC_SPEED[Game.cc || 150] || 30;
    for (const v of views) {
      const k = v.kart;
      if (!k) continue;
      if (st === 'intro') { v.rig.intro(k, G.clamp(Game.stateTime / INTRO_TIME, 0, 1)); continue; }
      const h = Game.humans.find((x) => x.kart === k);
      let lookBack = false;
      if (h && st === 'race' && G.Input.players) {
        const pi = k.coop ? k.coop.driver : h.players[0];
        const ps = G.Input.players[pi];
        lookBack = !!(ps && ps.state.lookBack);
      } else if (st === 'race') lookBack = !!G.Input.state.lookBack;
      v.rig.chase(k, dt, lookBack, k.finished || st === 'results', top);
    }
  }

  const fullView = [{ camera, rect: { x: 0, y: 0, w: 1, h: 1 } }];
  function render() {
    if (G.GFX && G.GFX.render) {
      const single = views.length <= 1 || Game.state === 'ceremony' || Game.state === 'attract';
      G.GFX.render(renderer, scene, single ? fullView : views);
      return;
    }
    const W = window.innerWidth, H = window.innerHeight;
    if (views.length <= 1 || Game.state === 'ceremony' || Game.state === 'attract') {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, W, H);
      renderer.render(scene, camera);
      return;
    }
    renderer.setScissorTest(true);
    for (const v of views) {
      const x = Math.round(v.rect.x * W), w = Math.round(v.rect.w * W), h = Math.round(v.rect.h * H);
      const y = Math.round(H - (v.rect.y + v.rect.h) * H); // GL origin is bottom-left
      renderer.setViewport(x, y, w, h);
      renderer.setScissor(x, y, w, h);
      renderer.render(scene, v.camera);
    }
    renderer.setScissorTest(false);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    let elapsed = (now - last) / 1000;
    last = now;
    if (elapsed > 0.25) elapsed = 0.25;
    acc += elapsed;
    let steps = 0;
    while (acc >= STEP * 0.96 && steps < 5) {
      try {
        const t0 = performance.now();
        step();
        Game.perf.step = G.lerp(Game.perf.step, performance.now() - t0, 0.05);
      } catch (err) {
        console.error(err);
      }
      acc -= STEP;
      steps++;
    }
    if (acc < 0) acc = 0;
    if (steps === 0) return; // high-refresh displays: nothing changed, skip the render

    const dt = STEP * steps;
    try {
      if (Game.state === 'ceremony' && G.Ceremony && G.Ceremony.update) G.Ceremony.update(dt);
      updateCameras(dt);
      if (Game.state !== 'attract' && Game.state !== 'boot' && Game.state !== 'ceremony') feedHUD();
    } catch (err) {
      console.error(err);
    }
    if (G.GFX && G.GFX.update) G.GFX.update(dt);
    updateSun();
    const r0 = performance.now();
    renderer.info.reset();
    render();
    Game.perf.render = G.lerp(Game.perf.render, performance.now() - r0, 0.05);

    // adaptive resolution to hold 60 fps
    fpsFrames++;
    fpsTime += elapsed;
    if (elapsed > 1 / 50) slowTime += elapsed; else slowTime = Math.max(0, slowTime - elapsed * 0.5);
    if (elapsed < 1 / 58) fastTime += elapsed; else fastTime = 0;
    // quality ladder when frames run long: resolution down to 1x, then drop MSAA, then resolution, then post
    const qLock = /[?&]q=(high|medium|low)/.exec(location.search);
    if (qLock) { if (G.GFX && G.GFX.quality !== qLock[1]) G.GFX.setQuality(qLock[1]); slowTime = fastTime = 0; }
    if (slowTime > 1.5) {
      const q = G.GFX ? G.GFX.quality : 'low';
      if (pixelRatio > 1.0) pixelRatio = Math.max(1.0, pixelRatio - 0.15);
      else if (q === 'high') { G.GFX.setQuality('medium'); G.GFX.lockedMedium = true; }
      else if (pixelRatio > 0.7) pixelRatio = Math.max(0.7, pixelRatio - 0.15);
      else if (q === 'medium') G.GFX.setQuality('low');
      else if (pixelRatio > 0.55) pixelRatio -= 0.1;
      renderer.setPixelRatio(pixelRatio);
      onResize();
      slowTime = 0;
    } else if (fastTime > 10) {
      const q = G.GFX ? G.GFX.quality : 'low';
      if (pixelRatio < 0.7) pixelRatio = Math.min(0.7, pixelRatio + 0.1);
      else if (q === 'low' && G.GFX) G.GFX.setQuality('medium');
      else if (pixelRatio < 1.0) pixelRatio = Math.min(1.0, pixelRatio + 0.1);
      else if (q === 'medium' && G.GFX && !G.GFX.lockedMedium) G.GFX.setQuality('high');
      else if (pixelRatio < maxRatio()) pixelRatio = Math.min(pixelRatio + 0.1, maxRatio());
      renderer.setPixelRatio(pixelRatio);
      onResize();
      fastTime = 0;
    }
    if (fpsTime >= 0.5) {
      if (fpsEl.style.display !== 'none') {
        fpsEl.textContent = Math.round(fpsFrames / fpsTime) + ' fps · ' + renderer.info.render.calls + ' draws · x' + pixelRatio.toFixed(2) + ' · ' + (G.GFX ? G.GFX.quality : 'basic') +
          ' · sim ' + Game.perf.step.toFixed(2) + 'ms · gl ' + Game.perf.render.toFixed(2) + 'ms';
      }
      fpsFrames = 0;
      fpsTime = 0;
    }
  }

  // test hook: advance the simulation n fixed steps without rendering
  Game.debugAdvance = function (n) {
    for (let i = 0; i < n; i++) step();
  };

  // ---------------------------------------------------------------- boot
  function boot() {
    if (G.Input.init) G.Input.init();
    if (G.UI) G.UI.init();
    try {
      startAttract();
    } catch (err) {
      console.error('attract mode failed', err);
      setState('boot');
    }
    if (G.HUD && G.HUD.hide) G.HUD.hide();
    if (G.UI) G.UI.showTitle();
    requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
