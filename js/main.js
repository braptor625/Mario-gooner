// Race director: renderer, fixed-step loop, chase camera, race state machine, Grand Prix flow.
(function () {
  'use strict';
  const G = window.G;

  const LAPS = 3;
  const GP_POINTS = [10, 8, 6, 4, 3, 2, 1, 0];
  const RACERS = 8;
  const STEP = G.FIXED_DT;

  const Game = (G.Game = {
    state: 'boot', // boot | attract | intro | countdown | race | finished | results | paused
    config: null,
    track: null,
    karts: [],
    ais: [],
    items: null,
    player: null,
    raceTime: 0,
    stateTime: 0,
    raceIndex: 0,
    raceList: [],
    standings: null, // GP: [{front, rear, kart, isPlayer, total}]
  });

  // ---------------------------------------------------------------- renderer
  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.3, 2500);
  Game.scene = scene;
  Game.camera = camera;
  Game.renderer = renderer;

  function onResize() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);

  // full-screen flash overlay (lightning, hits)
  const flash = document.createElement('div');
  flash.style.cssText =
    'position:fixed;inset:0;pointer-events:none;background:#fff;opacity:0;z-index:5;transition:opacity .35s ease-out;';
  document.body.appendChild(flash);
  function doFlash(color, strength) {
    flash.style.transition = 'none';
    flash.style.background = color;
    flash.style.opacity = String(strength);
    void flash.offsetWidth; // restart transition
    flash.style.transition = 'opacity .45s ease-out';
    flash.style.opacity = '0';
  }

  // optional FPS meter (?fps in URL or F3 key)
  const fpsEl = document.createElement('div');
  fpsEl.style.cssText =
    'position:fixed;left:8px;top:8px;z-index:50;font:700 12px Rubik,monospace;color:#19E3FF;background:#14102Bcc;padding:3px 7px;border-radius:6px;pointer-events:none;display:none';
  document.body.appendChild(fpsEl);
  if (/[?&]fps/.test(location.search)) fpsEl.style.display = 'block';
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F3') {
      e.preventDefault();
      fpsEl.style.display = fpsEl.style.display === 'none' ? 'block' : 'none';
    }
  });

  // ---------------------------------------------------------------- helpers
  function charName(id) {
    const c = (G.CHARACTERS || []).find((c) => c.id === id);
    return c ? c.name : id;
  }
  function kartDef(id) {
    return (G.KARTS || []).find((k) => k.id === id);
  }
  function weightRank(w) {
    return w === 'heavy' ? 2 : w === 'medium' ? 1 : 0;
  }
  function pairWeight(a, b) {
    if (G.Characters && G.Characters.kartWeight) return G.Characters.kartWeight(a, b);
    const ca = (G.CHARACTERS || []).find((c) => c.id === a);
    const cb = (G.CHARACTERS || []).find((c) => c.id === b);
    const wa = ca ? ca.weight : 'medium', wb = cb ? cb.weight : 'medium';
    return weightRank(wa) >= weightRank(wb) ? wa : wb;
  }
  function randomKartFor(front, rear) {
    const w = pairWeight(front, rear);
    const opts = (G.KARTS || []).filter((k) => k.weight === w);
    return (opts.length ? G.choice(opts) : G.choice(G.KARTS)).id;
  }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Build the 7 rival teams. With 8 characters and 8 karts, rival pairs are drawn from the
  // natural partner pairs first, then mixed pairings, avoiding the player's exact team.
  function buildRivals(playerFront, playerRear, count) {
    const chars = (G.CHARACTERS || []).map((c) => c.id);
    const natural = [];
    const seen = {};
    (G.CHARACTERS || []).forEach((c) => {
      const key = [c.id, c.partner].sort().join('|');
      if (!seen[key] && c.partner) { seen[key] = 1; natural.push([c.id, c.partner]); }
    });
    const playerKey = [playerFront, playerRear].sort().join('|');
    const teams = [];
    const used = {};
    const add = (a, b) => {
      const key = [a, b].sort().join('|');
      if (key === playerKey || used[key] || a === b) return;
      used[key] = 1;
      teams.push(Math.random() < 0.5 ? [a, b] : [b, a]);
    };
    shuffle(natural).forEach((p) => add(p[0], p[1]));
    let guard = 0;
    while (teams.length < count && guard++ < 500) add(G.choice(chars), G.choice(chars));
    return teams.slice(0, count).map((t) => ({ front: t[0], rear: t[1], kart: randomKartFor(t[0], t[1]) }));
  }

  // ---------------------------------------------------------------- race setup
  function clearRace() {
    if (Game.items) { Game.items.dispose && Game.items.dispose(); Game.items = null; }
    for (const k of Game.karts) {
      if (k.dispose) k.dispose();
      else if (k.mesh && k.mesh.parent) k.mesh.parent.remove(k.mesh);
    }
    Game.karts = [];
    Game.ais = [];
    Game.player = null;
    if (Game.track) { Game.track.dispose(); Game.track = null; }
    // sweep anything left behind
    for (let i = scene.children.length - 1; i >= 0; i--) scene.remove(scene.children[i]);
  }

  // entrants: [{front, rear, kart, isPlayer}] in grid order (index 0 = pole)
  function setupRace(trackId, entrants, cc, mode) {
    clearRace();
    const track = (Game.track = new G.Track(trackId, scene));
    const grid = track.getStartGrid(entrants.length);
    entrants.forEach((e, i) => {
      const kart = new G.Kart({
        scene, track, kartId: e.kart, frontId: e.front, rearId: e.rear,
        isPlayer: !!e.isPlayer, index: i, cc,
      });
      const g = grid[i];
      kart.pos.set(g.x, g.y, g.z);
      kart.heading = g.heading;
      if (kart.vel) kart.vel.set(0, 0, 0);
      kart.speed = 0;
      kart.entrant = e;
      kart.lapTimes = [];
      kart.lapStart = 0;
      kart.position = i + 1;
      if (kart.mesh) {
        kart.mesh.position.copy(kart.pos);
        kart.mesh.rotation.y = kart.heading;
      }
      Game.karts.push(kart);
      if (e.isPlayer) Game.player = kart;
      else {
        const skill = e.skill != null ? e.skill : G.rand(0.45, 0.95);
        Game.ais.push(new G.AIController(kart, track, { skill, cc }));
      }
    });

    // Time trial: no item boxes, start with a triple shroom.
    let itemTrack = track;
    if (mode === 'tt') {
      itemTrack = Object.create(track);
      itemTrack.itemBoxSpots = [];
    }
    Game.items = new G.ItemSystem(scene, itemTrack, Game.karts);
    if (mode === 'tt' && Game.player) {
      Game.player.heldItems[0] = 'mushroom3';
      Game.player.itemCounts[0] = 3;
    }

    Game.raceTime = 0;
    Game.rocketPressTime = null;
    Game.prevAccel = false;
    Game.playerLap = 0;
    Game.resultsShown = false;
    if (G.HUD && G.HUD.setMinimap) G.HUD.setMinimap(track.minimap);
    camState.init = false;
  }

  // ---------------------------------------------------------------- public API
  Game.start = function (config) {
    Game.config = config;
    const mode = config.mode;
    if (mode === 'gp') {
      const cup = (G.CUPS || []).find((c) => c.id === config.cup) || G.CUPS[0];
      Game.raceList = cup.tracks.slice();
      Game.cupName = cup.name;
    } else {
      Game.raceList = [config.track || G.TRACKS[0].id];
      Game.cupName = null;
    }
    Game.raceIndex = 0;

    const me = { front: config.front, rear: config.rear, kart: config.kart || randomKartFor(config.front, config.rear), isPlayer: true, total: 0 };
    Game.standings = [me];
    if (mode !== 'tt') {
      buildRivals(config.front, config.rear, RACERS - 1).forEach((r) => {
        r.total = 0;
        r.skill = G.rand(0.5, 1.0);
        Game.standings.push(r);
      });
    }
    startCurrentRace();
  };

  function startCurrentRace() {
    const trackId = Game.raceList[Game.raceIndex];
    let order;
    if (Game.config.mode === 'tt') order = Game.standings.slice();
    else if (Game.raceIndex === 0) {
      // player starts at the back of the grid for the first race, rivals shuffled
      const rivals = shuffle(Game.standings.filter((s) => !s.isPlayer));
      order = rivals.concat(Game.standings.filter((s) => s.isPlayer));
    } else {
      // reverse of current standings (leader starts last, like the classics)
      order = Game.standings.slice().sort((a, b) => a.total - b.total);
    }
    setupRace(trackId, order, Game.config.cc, Game.config.mode);
    if (G.UI && G.UI.hideMenus) G.UI.hideMenus();
    if (G.HUD) G.HUD.show();
    const tdef = G.TRACKS.find((t) => t.id === trackId);
    if (G.HUD && G.HUD.banner) G.HUD.banner((Game.cupName ? Game.cupName + ' · Race ' + (Game.raceIndex + 1) + ' · ' : '') + (tdef ? tdef.name : ''), 'info');
    if (G.Sound) G.Sound.playMusic(tdef && tdef.music ? tdef.music : Game.track.theme || trackId);
    if (G.Sound && G.Sound.setMusicTempoBoost) G.Sound.setMusicTempoBoost(false);
    setState('intro');
  }

  Game.restartRace = function () {
    if (G.UI && G.UI.hidePause) G.UI.hidePause();
    startCurrentRace();
  };

  Game.quitToTitle = function () {
    if (G.UI && G.UI.hidePause) G.UI.hidePause();
    if (G.HUD) G.HUD.hide();
    startAttract();
    if (G.UI) G.UI.showTitle();
  };

  function setState(s) {
    Game.state = s;
    Game.stateTime = 0;
  }

  // ---------------------------------------------------------------- attract mode (behind menus)
  function startAttract() {
    const ids = (G.TRACKS || []).map((t) => t.id);
    const trackId = ids.length ? G.choice(ids) : null;
    if (!trackId) return;
    const teams = buildRivals('__none', '__none', RACERS).map((t) => Object.assign(t, { skill: G.rand(0.6, 1) }));
    setupRace(trackId, teams, 150, 'race');
    Game.config = null;
    setState('attract');
    if (G.Sound && G.Sound.stopEngine) G.Sound.stopEngine();
  }

  // ---------------------------------------------------------------- simulation step
  function copyPlayerInput(kart) {
    const s = G.Input.state;
    const inp = kart.input;
    inp.accel = s.accel; inp.brake = s.brake; inp.steer = s.steer; inp.drift = s.drift;
    inp.item = s.item; inp.itemPressed = s.itemPressed; inp.itemReleased = s.itemReleased;
    inp.swapPressed = s.swapPressed; inp.throwBack = s.throwBack;
  }
  function zeroInput(kart) {
    const inp = kart.input;
    inp.accel = 0; inp.brake = 0; inp.steer = 0; inp.drift = false; inp.item = false;
    inp.itemPressed = false; inp.itemReleased = false; inp.swapPressed = false; inp.throwBack = false;
  }

  const aiCtx = { karts: null, items: null, player: null, raceTime: 0 };
  function stepAIs() {
    aiCtx.karts = Game.karts;
    aiCtx.items = Game.items;
    aiCtx.player = Game.player || Game.karts[0];
    aiCtx.raceTime = Game.raceTime;
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

  function checkLaps() {
    for (const k of Game.karts) {
      if (k.finished) continue;
      const lap = k.lap | 0;
      if (k._seenLap === undefined) k._seenLap = lap;
      if (lap > k._seenLap) {
        if (k._seenLap >= 1) {
          k.lapTimes.push(Game.raceTime - k.lapStart);
        }
        k.lapStart = Game.raceTime;
        k._seenLap = lap;
        if (lap > LAPS) {
          k.finished = true;
          k.finishTime = Game.raceTime;
          if (k === Game.player) onPlayerFinish();
        } else if (k === Game.player && lap > 1) {
          if (lap === LAPS) {
            G.HUD && G.HUD.banner('FINAL LAP!', 'final');
            G.Sound && G.Sound.play('final_lap');
            G.Sound && G.Sound.setMusicTempoBoost && G.Sound.setMusicTempoBoost(true);
          } else {
            G.HUD && G.HUD.banner('LAP ' + lap, 'lap');
            G.Sound && G.Sound.play('lap');
          }
        }
      } else if (lap < k._seenLap) {
        k._seenLap = lap; // drove backwards over the line
      }
    }
  }

  function onPlayerFinish() {
    setState('finished');
    const p = Game.player;
    G.HUD && G.HUD.banner(p.position === 1 ? 'WINNER!' : 'FINISH!', 'finish');
    G.Sound && G.Sound.play('finish');
    G.Sound && G.Sound.setMusicTempoBoost && G.Sound.setMusicTempoBoost(false);
    // the player's kart is now driven by the computer
    Game.ais.push(new G.AIController(p, Game.track, { skill: 0.8, cc: Game.config.cc }));
  }

  // Estimated finishing times for karts that are still racing when results are shown.
  function projectFinishes() {
    const L = Game.track.length;
    const total = L * LAPS;
    const lead = Game.karts.filter((k) => k.finished);
    let pace = 0;
    lead.forEach((k) => { pace += total / Math.max(1, k.finishTime); });
    pace = lead.length ? pace / lead.length : 25;
    for (const k of Game.karts) {
      if (k.finished) continue;
      const remaining = Math.max(0, total - k.raceDist);
      k.finished = true;
      k.finishTime = Game.raceTime + remaining / (pace * 0.97) + Math.random() * 0.3;
    }
    updatePositions();
  }

  function rocketStartLevel(goTime) {
    const t = Game.rocketPressTime;
    if (t === null || !G.Input.state.accel) return 0;
    const before = goTime - t;
    if (before >= 0.18 && before <= 0.5) return 2;
    if (before > 0.5 && before <= 0.9) return 1;
    if (before > 1.4) return -1;
    return 0;
  }

  const INTRO_TIME = 2.6;
  const COUNT_TIME = 3.0;

  function step() {
    G.Input.poll();
    const st = Game.state;
    Game.stateTime += STEP;

    if (st === 'paused' || st === 'boot' || st === 'results') return;

    if (st === 'attract') {
      if (!Game.track) return;
      Game.raceTime += STEP;
      stepAIs();
      for (const k of Game.karts) k.update(STEP);
      G.Kart.resolveCollisions(Game.karts);
      Game.items.update(STEP, Game.raceTime);
      Game.track.update(STEP, Game.raceTime);
      updatePositions();
      return;
    }

    if (G.Input.state.pausePressed && (st === 'race' || st === 'countdown' || st === 'intro' || st === 'finished')) {
      pauseGame();
      return;
    }

    if (st === 'intro' || st === 'countdown') {
      for (const k of Game.karts) { zeroInput(k); k.update(STEP); }
      Game.track.update(STEP, Game.stateTime);
      if (st === 'intro' && Game.stateTime >= INTRO_TIME) {
        setState('countdown');
        G.HUD && G.HUD.countdown(3);
        G.Sound && G.Sound.play('countdown');
        Game.lastCount = 3;
      }
      if (st === 'countdown') {
        // rocket start timing: remember when accel was last pressed
        const acc = !!G.Input.state.accel;
        if (acc && !Game.prevAccel) Game.rocketPressTime = Game.stateTime;
        if (!acc) Game.rocketPressTime = null;
        Game.prevAccel = acc;
        const n = 3 - Math.floor(Game.stateTime);
        if (n !== Game.lastCount && n >= 1) {
          Game.lastCount = n;
          G.HUD && G.HUD.countdown(n);
          G.Sound && G.Sound.play('countdown');
        }
        if (Game.stateTime >= COUNT_TIME) {
          G.HUD && G.HUD.countdown(0);
          G.Sound && G.Sound.play('go');
          if (Game.player) Game.player.rocketStart(rocketStartLevel(COUNT_TIME));
          for (const k of Game.karts) {
            if (k === Game.player) continue;
            const r = Math.random();
            k.rocketStart(r < 0.35 ? 2 : r < 0.7 ? 1 : 0);
          }
          setState('race');
        }
      }
      return;
    }

    // race / finished
    Game.raceTime += STEP;
    if (st === 'race' && Game.player) copyPlayerInput(Game.player);
    stepAIs();
    for (const k of Game.karts) k.update(STEP);
    G.Kart.resolveCollisions(Game.karts);
    Game.items.update(STEP, Game.raceTime);
    Game.track.update(STEP, Game.raceTime);
    checkLaps();
    updatePositions();

    if (st === 'finished' && !Game.resultsShown && Game.stateTime > 4) {
      Game.resultsShown = true;
      showRaceResults();
    }
  }

  function pauseGame() {
    const prev = Game.state;
    setState('paused');
    Game.pausedFrom = prev;
    G.Sound && G.Sound.stopEngine && G.Sound.stopEngine();
    G.UI.showPause(
      () => { G.UI.hidePause(); Game.state = Game.pausedFrom; G.Input.reset && G.Input.reset(); },
      () => Game.restartRace(),
      () => Game.quitToTitle()
    );
  }

  // ---------------------------------------------------------------- results / GP flow
  function teamName(e) {
    return charName(e.front) + ' & ' + charName(e.rear);
  }
  function fmtTime(t) {
    const m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
  }

  function showRaceResults() {
    projectFinishes();
    setState('results');
    G.Sound && G.Sound.stopEngine && G.Sound.stopEngine();
    G.Sound && G.Sound.playMusic('results');
    const mode = Game.config.mode;
    const gp = mode === 'gp';
    const rows = sorted.map((k, i) => {
      const pts = gp ? GP_POINTS[i] || 0 : 0;
      if (gp) k.entrant.total += pts;
      const def = kartDef(k.entrant.kart);
      return {
        pos: i + 1,
        name: teamName(k.entrant),
        kartColor: def ? def.color : '#888',
        time: fmtTime(k.finishTime),
        points: pts,
        total: k.entrant.total,
        isPlayer: k === Game.player,
      };
    });
    const tdef = G.TRACKS.find((t) => t.id === Game.raceList[Game.raceIndex]);
    let title = tdef ? tdef.name : 'Results';
    if (mode === 'tt' && Game.player) {
      const lt = Game.player.lapTimes;
      const best = lt.length ? Math.min.apply(null, lt) : 0;
      title += ' · Best lap ' + fmtTime(best);
    }
    G.HUD.showResults(rows, { title, showPoints: gp, gp }, () => {
      if (gp && Game.raceIndex < Game.raceList.length - 1) {
        // standings between races
        Game.raceIndex++;
        const standRows = Game.standings
          .slice()
          .sort((a, b) => b.total - a.total)
          .map((e, i) => {
            const def = kartDef(e.kart);
            return { pos: i + 1, name: teamName(e), kartColor: def ? def.color : '#888', time: '', points: 0, total: e.total, isPlayer: !!e.isPlayer };
          });
        G.HUD.showResults(standRows, { title: (Game.cupName || 'Cup') + ' Standings', showPoints: true, gp: true, standings: true }, () => startCurrentRace());
      } else if (gp) {
        const standings = Game.standings
          .slice()
          .sort((a, b) => b.total - a.total)
          .map((e, i) => ({ pos: i + 1, name: teamName(e), total: e.total, isPlayer: !!e.isPlayer, front: e.front, rear: e.rear, kartColor: (kartDef(e.kart) || {}).color }));
        G.UI.showGPFinal(standings, () => Game.quitToTitle());
      } else {
        Game.quitToTitle();
      }
    });
  }

  // ---------------------------------------------------------------- camera
  const camState = { init: false, pos: new THREE.Vector3(), look: new THREE.Vector3(), heading: 0, fov: 68, shake: 0, orbit: 0 };
  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();

  function updateCamera(dt) {
    const st = Game.state;
    let target = Game.player;
    if (st === 'attract' || !target) {
      // cinematic: follow the leader with a slow orbit
      target = sorted[0] || Game.karts[0];
      if (!target) return;
      camState.orbit += dt * 0.25;
      const a = target.heading + Math.PI + Math.sin(camState.orbit) * 1.1;
      _v1.set(target.pos.x + Math.sin(a) * 11, target.pos.y + 4.5, target.pos.z + Math.cos(a) * 11);
      if (!camState.init) { camState.pos.copy(_v1); camState.look.copy(target.pos); camState.init = true; }
      camState.pos.x = G.damp(camState.pos.x, _v1.x, 2.5, dt);
      camState.pos.y = G.damp(camState.pos.y, _v1.y, 2.5, dt);
      camState.pos.z = G.damp(camState.pos.z, _v1.z, 2.5, dt);
      camState.look.x = G.damp(camState.look.x, target.pos.x, 5, dt);
      camState.look.y = G.damp(camState.look.y, target.pos.y + 1, 5, dt);
      camState.look.z = G.damp(camState.look.z, target.pos.z, 5, dt);
      camera.position.copy(camState.pos);
      camera.lookAt(camState.look);
      setFov(62, dt);
      return;
    }

    if (st === 'intro') {
      // sweeping fly-in from the front of the grid to behind the player
      const t = G.clamp(Game.stateTime / INTRO_TIME, 0, 1);
      const e = t * t * (3 - 2 * t);
      const ang = target.heading + G.lerp(0.35, Math.PI, e);
      const dist = G.lerp(26, 6.8, e);
      const h = G.lerp(9, 2.7, e);
      camera.position.set(target.pos.x + Math.sin(ang) * dist, target.pos.y + h, target.pos.z + Math.cos(ang) * dist);
      _v1.set(target.pos.x, target.pos.y + 1, target.pos.z);
      camera.lookAt(_v1);
      camState.pos.copy(camera.position);
      camState.look.copy(_v1);
      camState.heading = target.heading;
      camState.init = true;
      setFov(68, 10);
      return;
    }

    if (!camState.init) {
      camState.heading = target.heading;
      camState.init = true;
    }
    const finishedOrbit = st === 'finished' || st === 'results';
    if (finishedOrbit) camState.orbit += dt * 0.35;

    // lag the camera heading behind the kart heading (drift swing feel)
    let dh = G.wrapAngle(target.heading - camState.heading);
    camState.heading += dh * (1 - Math.exp(-(target.drifting ? 4.2 : 6.5) * dt));
    let ch = camState.heading + (finishedOrbit ? camState.orbit + Math.PI : 0);
    const lookBack = st === 'race' && G.Input.state.lookBack;
    if (lookBack) ch += Math.PI;

    const speed01 = G.clamp(Math.abs(target.speed) / (G.CC_SPEED[Game.config ? Game.config.cc : 150] || 30), 0, 1.5);
    const dist = 6.2 + speed01 * 1.1;
    const height = 2.5 + speed01 * 0.3;
    const fx = Math.sin(ch), fz = Math.cos(ch);
    _v1.set(target.pos.x - fx * dist, target.pos.y + height, target.pos.z - fz * dist);
    // keep the camera above ground (hills)
    if (Game.track) {
      const q = Game.track.query(_v1.x, _v1.z, target.trackIndex != null ? target.trackIndex : -1);
      if (q && q.surface !== 'void' && _v1.y < q.y + 1.2) _v1.y = q.y + 1.2;
    }
    camState.pos.x = G.damp(camState.pos.x, _v1.x, 12, dt);
    camState.pos.y = G.damp(camState.pos.y, _v1.y, 6, dt);
    camState.pos.z = G.damp(camState.pos.z, _v1.z, 12, dt);
    if (target.falling) camState.pos.y = Math.max(camState.pos.y, target.pos.y + 3);

    _v2.set(target.pos.x + fx * 4, target.pos.y + 1.1, target.pos.z + fz * 4);
    camState.look.x = G.damp(camState.look.x, _v2.x, 18, dt);
    camState.look.y = G.damp(camState.look.y, _v2.y, 8, dt);
    camState.look.z = G.damp(camState.look.z, _v2.z, 18, dt);

    camera.position.copy(camState.pos);
    if (camState.shake > 0) {
      camState.shake = Math.max(0, camState.shake - dt * 2.5);
      const s = camState.shake * 0.35;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
    }
    camera.lookAt(camState.look);

    const boosting = target.boostTimer > 0 || target.starTimer > 0;
    setFov(68 + speed01 * 6 + (boosting ? 9 : 0), dt);
  }
  function setFov(f, dt) {
    camState.fov = G.damp(camState.fov, f, 4, dt);
    if (Math.abs(camera.fov - camState.fov) > 0.01) {
      camera.fov = camState.fov;
      camera.updateProjectionMatrix();
    }
  }

  // keep the sun's shadow/light focused near the action if the track exposes one
  function updateSun() {
    const sun = Game.track && Game.track.sun;
    if (!sun || !sun.castShadow) return;
    const t = Game.player || sorted[0];
    if (!t) return;
    if (!sun.userData.offset) sun.userData.offset = sun.position.clone().sub(sun.target.position);
    sun.target.position.copy(t.pos);
    sun.position.copy(t.pos).add(sun.userData.offset);
    sun.target.updateMatrixWorld();
  }

  // ---------------------------------------------------------------- HUD feed
  const hudState = {
    lap: 1, laps: LAPS, position: 1, racerCount: RACERS, time: 0, lapTimes: null,
    items: [null, null], counts: [0, 0], roulette: [false, false], front: '', rear: '',
    speed01: 0, driftLevel: 0, boost: false, minimap: { karts: [] }, wrongWay: false, finalLap: false,
  };
  const dots = [];
  function feedHUD() {
    const p = Game.player;
    if (!p || !G.HUD) return;
    const lap = G.clamp(p.lap | 0, 1, LAPS);
    hudState.lap = lap;
    hudState.finalLap = lap === LAPS;
    hudState.position = p.position;
    hudState.racerCount = Game.karts.length;
    hudState.time = p.finished ? p.finishTime : Game.state === 'race' || Game.state === 'finished' ? Game.raceTime : 0;
    hudState.lapTimes = p.lapTimes;
    hudState.items[0] = p.heldItems[0];
    hudState.items[1] = p.heldItems[1];
    hudState.counts[0] = p.itemCounts[0];
    hudState.counts[1] = p.itemCounts[1];
    hudState.roulette[0] = p.roulette[0] > 0;
    hudState.roulette[1] = p.roulette[1] > 0;
    hudState.front = charName(p.front);
    hudState.rear = charName(p.rear);
    hudState.speed01 = G.clamp(Math.abs(p.speed) / (G.CC_SPEED[Game.config.cc] || 30), 0, 1.3);
    hudState.driftLevel = p.drifting ? p.driftLevel | 0 : 0;
    hudState.boost = p.boostTimer > 0 || p.starTimer > 0;
    hudState.wrongWay = !!p.wrongWay && Game.state === 'race';
    for (let i = 0; i < Game.karts.length; i++) {
      const k = Game.karts[i];
      let d = dots[i];
      if (!d) d = dots[i] = { x: 0, z: 0, color: '#fff', isPlayer: false };
      d.x = k.pos.x; d.z = k.pos.z;
      const def = kartDef(k.entrant.kart);
      d.color = def ? def.color : '#fff';
      d.isPlayer = k === p;
    }
    dots.length = Game.karts.length;
    hudState.minimap.karts = dots;
    G.HUD.update(hudState);

    if (G.Sound && G.Sound.setEngine && Game.state !== 'results') {
      const onRoad = !p.trackInfo || p.trackInfo.surface !== 'offroad';
      G.Sound.setEngine(hudState.speed01, hudState.boost, onRoad);
    }
  }

  // ---------------------------------------------------------------- events
  G.events.on('lightning', () => { doFlash('#fff7a8', 0.75); camState.shake = 0.6; });
  G.events.on('itemHit', (e) => {
    if (!e || !Game.player) return;
    if (e.victim === Game.player) { camState.shake = 0.8; doFlash('#ff3b3b', 0.25); }
    else if (e.attacker === Game.player && G.HUD && G.HUD.banner) G.HUD.banner('HIT!', 'info');
  });

  // ---------------------------------------------------------------- main loop
  let last = performance.now();
  let acc = 0;
  let fpsFrames = 0, fpsTime = 0, slowTime = 0, fastTime = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    let elapsed = (now - last) / 1000;
    last = now;
    if (elapsed > 0.25) elapsed = 0.25; // tab was hidden
    acc += elapsed;
    let steps = 0;
    // small tolerance so a 59.9 Hz display still steps every frame
    while (acc >= STEP * 0.96 && steps < 5) {
      try {
        step();
      } catch (err) {
        console.error(err);
      }
      acc -= STEP;
      steps++;
    }
    if (acc < 0) acc = 0;
    if (steps === 0) return; // high refresh displays: nothing changed, skip the render

    const dt = STEP * steps;
    try {
      updateCamera(dt);
      updateSun();
      if (Game.state !== 'attract' && Game.state !== 'boot') feedHUD();
    } catch (err) {
      console.error(err);
    }
    renderer.render(scene, camera);

    // perf monitor + adaptive resolution to hold 60 fps
    fpsFrames++;
    fpsTime += elapsed;
    if (elapsed > 1 / 50) slowTime += elapsed; else slowTime = Math.max(0, slowTime - elapsed * 0.5);
    if (elapsed < 1 / 58) fastTime += elapsed; else fastTime = 0;
    if (slowTime > 1.5 && pixelRatio > 0.6) {
      pixelRatio = Math.max(0.6, pixelRatio - 0.15);
      renderer.setPixelRatio(pixelRatio);
      onResize();
      slowTime = 0;
    } else if (fastTime > 8 && pixelRatio < Math.min(window.devicePixelRatio || 1, 1.5)) {
      pixelRatio = Math.min(pixelRatio + 0.1, Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setPixelRatio(pixelRatio);
      onResize();
      fastTime = 0;
    }
    if (fpsTime >= 0.5) {
      if (fpsEl.style.display !== 'none') {
        fpsEl.textContent = Math.round(fpsFrames / fpsTime) + ' fps · ' + renderer.info.render.calls + ' draws · x' + pixelRatio.toFixed(2);
      }
      fpsFrames = 0;
      fpsTime = 0;
    }
  }

  // ---------------------------------------------------------------- boot
  function boot() {
    G.Input.init();
    if (G.UI) G.UI.init();
    try {
      startAttract();
    } catch (err) {
      console.error('attract mode failed', err);
      setState('boot');
    }
    if (G.HUD) G.HUD.hide();
    if (G.UI) G.UI.showTitle();
    requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
