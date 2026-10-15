// AI driver for Turbo Tandem (v2 Double Dash parity). Classic script; attaches G.AIController.
// Cheap: no allocations per step (all scratch state lives on the instance).
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  const PI = Math.PI;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const RB_CC = { 50: 0.7, 100: 0.9, 150: 1.0 };
  const NO_HZ = [];                                   // shared, never mutated
  const OFFROAD = { sand: true, grass: true, mud: true, water: true };

  class AIController {
    constructor(kart, track, opts) {
      opts = opts || {};
      this.kart = kart;
      this.track = track;
      this.skill = clamp(opts.skill === undefined ? 0.5 : opts.skill, 0, 1);
      this.cc = opts.cc || 100;
      const sk = this.skill;

      this.linePref = rnd(-0.4, 0.4);   // fraction of halfWidth
      this.cutAmount = 0.45 + 0.5 * sk;
      this.lat = 0;                      // smoothed lateral target (m)
      this.steerS = 0;
      this.curv = 0;                     // signed curvature ahead (+ = right)
      this.curvAbs = 0;
      this.curvTick = (Math.random() * 4) | 0;
      this.hazNudge = 0;
      this.qIdx = -1;                    // own track index (query hint)

      // drift state (DD: mini-turbo charges only via counter-steer wiggles)
      this.drifting = false;
      this.driftT = 0;
      this.driftDir = 0;
      this.driftCool = 0;
      this.driftWant = 0;
      this.straightT = 0;
      this.maxHold = 4.5;                // release no later than this
      this.halfPeriod = 0.3 - 0.15 * sk; // seconds per half-wiggle (skill: 0.3 slow .. 0.15 fast)
      this.wiggleSide = 1;               // +1 = drift side, -1 = counter-steer side
      this.wiggleT = 0;

      // stuck
      this.stuckT = 0;
      this.recoverT = 0;
      this.recoverSteer = 1;

      // items
      this.lastItem = null;
      this.itemWait = 0;
      this.itemAge = 0;
      this.phase = 0;        // 0 idle, 1 dragging, 2 release pending
      this.dragT = 0;
      this.dragLimit = 8;
      this.relBack = false;
      this.swapCool = 0;
      this.scanAhead = 1e9;  // nearest kart in narrow cone ahead
      this.scanNear = 1e9;   // nearest kart roughly ahead
      this.scanBehind = 1e9; // nearest kart behind

      // slap (DD rear-rider attack)
      this.slapCool = rnd(2, 5);
      this.slapArmed = false;
      this.slapWait = 0;

      this.rb = 1;
      this.bestP = 0;        // progress of best-placed human (set by _bestHuman)
      this.baseMul = 0.94 + 0.06 * sk;

      if (!kart.input) kart.input = {};
      const inp = kart.input;
      inp.accel = 1; inp.brake = 0; inp.steer = 0; inp.drift = false; inp.item = false;
      inp.itemPressed = false; inp.itemReleased = false; inp.swapPressed = false; inp.throwBack = false;
      inp.slapPressed = false;
    }

    _scan(ctx, fx, fz, rx, rz) {
      const k = this.kart, karts = ctx && ctx.karts;
      let ahead = 1e9, near = 1e9, behind = 1e9;
      if (karts) {
        for (let i = 0; i < karts.length; i++) {
          const o = karts[i];
          if (o === k || !o.pos) continue;
          const dx = o.pos.x - k.pos.x, dz = o.pos.z - k.pos.z;
          const f = dx * fx + dz * fz, s = dx * rx + dz * rz;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (f > 0) {
            const ang = Math.abs(Math.atan2(s, f));
            if (d < 35 && ang < 0.14 && d < ahead) ahead = d;
            if (d < 30 && ang < 0.7 && d < near) near = d;
          } else if (d < 40 && d < behind) behind = d;
        }
      }
      this.scanAhead = ahead; this.scanNear = near; this.scanBehind = behind;
    }

    // Lateral push (+ = steer right) away from hazards in the path cone. Moving hazards are
    // extrapolated to the moment we reach them (vx/vz optional; items pass none).
    _hazardNudge(list, k, fx, fz, rx, rz, range, speed) {
      if (!list) return 0;
      const px = k.pos.x, pz = k.pos.z;
      const sp = speed > 5 ? speed : 5;
      let nudge = 0;
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        const dx = o.x - px, dz = o.z - pz;
        const f = dx * fx + dz * fz;
        if (f < 0 || f > range) continue;
        const t = clamp(f / sp, 0, 1.5);
        const ox = dx + (o.vx || 0) * t, oz = dz + (o.vz || 0) * t;
        const s = ox * rx + oz * rz;
        const clear = (o.radius || 1) + 2.5;
        const as = s < 0 ? -s : s;
        if (as < clear) {
          const push = (clear - as) + 1.5;
          nudge += s > 0 ? -push : push;
          if (as < 0.3) nudge += (this.linePref >= 0 ? 1 : -1) * 2;
        }
      }
      return nudge;
    }

    // 0..1 how strongly to pull the line to the centre because of the surface at (x, z).
    _surfaceBias(track, x, z, y, hw, noWalls) {
      if (!track.query) return 0;
      const q = track.query(x, z, this.qIdx, y || 0);
      if (!q) return 0;
      const qs = q.surface;
      if (qs === 'void') return 1;
      if (noWalls && (q.halfWidth || hw) - Math.abs(q.lateral) < 2.5) return 0.8;
      if (OFFROAD[qs]) return 0.6;
      return 0;
    }

    // Progress along the race (cumulative metres). Prefers kart.raceDist; otherwise
    // lap-based from kart.lap and the lap-local track distance.
    _progress(o, len) {
      if (o.raceDist !== undefined) return o.raceDist;
      const d = o.trackInfo && o.trackInfo.dist !== undefined ? o.trackInfo.dist : 0;
      return (o.lap || 0) * len + d;
    }

    // Best-placed human (max progress, excluding this kart) from ctx.player / ctx.players.
    // Returns the kart or null; its progress is left in this.bestP.
    _bestHuman(ctx, k, len) {
      let best = null, bestP = -1e18;
      const pl = ctx.player;
      if (pl && pl !== k && pl.pos) {
        bestP = this._progress(pl, len); best = pl;
      }
      const ps = ctx.players;
      if (ps && ps.length) {
        for (let i = 0; i < ps.length; i++) {
          let o = ps[i];
          if (o && o.kart) o = o.kart;
          if (!o || o === k || o === pl || o.isPlayer === false) continue;
          const p = this._progress(o, len);
          if (p > bestP) { bestP = p; best = o; }
        }
      }
      this.bestP = bestP;
      return best;
    }

    update(dt, ctx) {
      const k = this.kart, track = this.track, inp = k.input;
      ctx = ctx || {};
      const sk = this.skill;
      const info = k.trackInfo;
      const len = track.length || 1000;
      const topSpeed = (k.stats && k.stats.topSpeed) || (G.CC_SPEED && G.CC_SPEED[this.cc]) || 26;
      const speed = k.speed || 0;
      const h = k.heading || 0;
      const fx = Math.sin(h), fz = Math.cos(h), rx = -Math.cos(h), rz = Math.sin(h);
      const finished = !!k.finished;

      let dist = info && info.dist !== undefined ? info.dist : (k.raceDist || 0);
      dist = ((dist % len) + len) % len;
      const hw = (info && info.halfWidth) || 8;
      const lateralNow = info && info.lateral !== undefined ? info.lateral : 0;
      if (info && info.index !== undefined) this.qIdx = info.index;

      // reset edge flags
      inp.itemPressed = false; inp.itemReleased = false; inp.swapPressed = false;
      inp.throwBack = false; inp.slapPressed = false;

      // ---- cannon flight / rescue drone: neutral input, no decisions ----
      if (k.cannonFlight || k.rescued) {
        if (this.phase !== 0) { inp.itemReleased = true; this.phase = 0; }
        inp.accel = 0; inp.brake = 0; inp.steer = 0; inp.drift = false; inp.item = false;
        this.steerS = 0; this.drifting = false; this.recoverT = 0; this.stuckT = 0;
        this.slapArmed = false;
        return;
      }

      // ---- curvature ahead (every 4th step) ----
      if ((++this.curvTick & 3) === 0) {
        let d1 = (dist + 10) % len, d2 = (dist + 35) % len;
        const p1 = track.pointAt(d1);
        const t1x = p1.tx, t1z = p1.tz;
        const p2 = track.pointAt(d2);
        const c = t1x * p2.tz - t1z * p2.tx; // sin(a1-a2): + = right turn
        this.curv = c;
        this.curvAbs = c < 0 ? -c : c;
      }
      const curv = this.curv;

      // ---- lookahead point on the centreline ----
      const look = 8 + speed * 0.55;
      const tp = track.pointAt((dist + look) % len);

      // ---- desired lateral ----
      let wantLat = this.linePref * hw;
      wantLat += clamp(curv * 2.2, -0.7, 0.7) * hw * this.cutAmount;

      // surface: never aim over the void; prefer road over offroad flavours.
      // Two probes (a near one and the lookahead one) so the kart reacts early.
      const noWalls = !!(track.noWalls || (track.def && track.def.noWalls));
      const nearD = look * 0.5;
      const bNear = this._surfaceBias(track, k.pos.x + fx * nearD + rx * wantLat, k.pos.z + fz * nearD + rz * wantLat, tp && tp.y, hw, noWalls);
      const bFar = tp ? this._surfaceBias(track, tp.x + tp.rx * wantLat, tp.z + tp.rz * wantLat, tp.y, hw, noWalls) : 0;
      const bias = bNear > bFar ? bNear : bFar;
      wantLat *= 1 - bias;
      const latRate = bias > 0 ? 9 : 4;

      // hazard avoidance: item hazards and track hazards (moving cars, crushers, ...)
      let nudge = 0;
      if (!finished) {
        const items = ctx.items;
        if (items && items.getHazards) nudge += this._hazardNudge(items.getHazards(), k, fx, fz, rx, rz, 25, speed);
        if (track.getHazards) nudge += this._hazardNudge(track.getHazards() || NO_HZ, k, fx, fz, rx, rz, 30, speed);
      }
      this.hazNudge = G.damp(this.hazNudge, clamp(nudge, -hw, hw), 8, dt);
      wantLat += this.hazNudge;
      const maxLat = Math.max(1, hw - 2.5);
      wantLat = clamp(wantLat, -maxLat, maxLat);
      this.lat = G.damp(this.lat, wantLat, latRate, dt);

      // ---- steering toward target ----
      const tx = tp.x + tp.rx * this.lat - k.pos.x;
      const tz = tp.z + tp.rz * this.lat - k.pos.z;
      const rDot = rx * tx + rz * tz;   // > 0 => target on the right
      const fDot = fx * tx + fz * tz;
      const err = Math.atan2(rDot, fDot); // + => target right => steer +
      const absErr = err < 0 ? -err : err;
      let steerT = clamp(err * 2.2, -1, 1);

      // ---- throttle / brake ----
      let accel = 1, brake = 0;
      const raceStarted = (ctx.raceTime === undefined) || ctx.raceTime > 1.5;
      if (absErr > 1.22 && speed > topSpeed * 0.4) accel = 0;
      if (absErr > 1.9 && speed > 4) { accel = 0; brake = 1; }

      // stuck / recovery
      if (this.recoverT > 0) {
        this.recoverT -= dt;
        accel = 0; brake = 1;
        steerT = -this.recoverSteer;
        if (this.recoverT <= 0) this.stuckT = 0;
      } else if (raceStarted && !finished && !k.falling && (speed < 1 && speed > -1)) {
        this.stuckT += dt;
        if (this.stuckT > 1.5) {
          this.recoverT = 1.2;
          this.recoverSteer = err >= 0 ? 1 : -1;
        }
      } else if (speed >= 1) {
        this.stuckT = 0;
      }

      // ---- drifting (DD: charge only by counter-steer wiggles; release once blue and corner ends) ----
      let driftHeld = false;
      if (finished || this.recoverT > 0 || k.falling || (k.spinTimer > 0)) {
        this.drifting = false;
      } else {
        this.driftCool -= dt;
        const kd = !!k.drifting;
        if (!this.drifting) {
          if (this.driftCool <= 0 && !kd && speed > topSpeed * 0.55 && this.curvAbs > 0.3) {
            this.driftWant += dt;
            if (this.driftWant > 0.2) {
              this.drifting = true;
              this.driftT = 0;
              this.straightT = 0;
              this.driftDir = curv > 0 ? 1 : -1;
              this.driftWant = 0;
              this.halfPeriod = (0.3 - 0.15 * sk) * rnd(0.95, 1.05);
              this.wiggleSide = 1;
              this.wiggleT = 0;
            }
          } else {
            this.driftWant = 0;
          }
        }
        if (this.drifting) {
          this.driftT += dt;
          if (this.curvAbs < 0.14) this.straightT += dt; else this.straightT = 0;
          const lvl = k.driftLevel || 0;     // v2: 0 none, 1 blue
          const cornerEnding = this.curvAbs < 0.22 || curv * this.driftDir < 0;
          let end = false;
          if (this.driftT > 0.35 && !kd) end = true;                          // kart refused / ended
          else if (lvl >= 1 && this.driftT > 0.4 && cornerEnding) end = true; // release for mini-turbo
          else if (this.straightT > 0.25 && this.driftT > 0.4) end = true;
          else if (speed < topSpeed * 0.35) end = true;
          else if (this.driftT > this.maxHold) end = true;
          else if (Math.abs(lateralNow) > hw * 0.9) end = true;
          if (end) {
            this.drifting = false;
            this.driftCool = rnd(0.5, 1.2);
          } else {
            driftHeld = true;
            // steer into the turn; while still white, wiggle to charge
            const dir = this.driftDir;
            let s = dir * clamp(dir * steerT, -0.5, 1);
            if (this.driftT < 0.15) s = dir * Math.max(0.7, dir * s);
            else if (lvl < 1 && Math.abs(lateralNow) < hw * 0.8) {
              // one flick = drift side -> counter side -> drift side
              this.wiggleT -= dt;
              if (this.wiggleT <= 0) {
                this.wiggleSide = -this.wiggleSide;
                this.wiggleT = this.halfPeriod;
              }
              s = dir * (this.wiggleSide > 0 ? 0.8 : -0.7);
            }
            steerT = clamp(s, -1, 1);
          }
        }
      }

      // smooth steering (snappier during recovery/drift start)
      this.steerS = G.damp(this.steerS, steerT, driftHeld ? 20 : 14, dt);
      inp.steer = this.steerS;
      inp.accel = accel;
      inp.brake = brake;
      inp.drift = driftHeld;

      // ---- items ----
      this._items(dt, ctx, finished, fx, fz, rx, rz);

      // ---- slap ----
      this._slap(dt, ctx, finished, fx, fz, rx, rz);

      // ---- rubber band (toward the best-placed human in multiplayer) ----
      let mul;
      if (finished) {
        mul = 0.85;
        this.rb = 1;
      } else {
        let rb = 1;
        const best = this._bestHuman(ctx, k, len);
        if (best) {
          const gap = this.bestP - this._progress(k, len); // + => AI behind the human
          if (gap > 80) rb = 1 + 0.12 * clamp((gap - 80) / 120, 0, 1);
          else if (gap < -120) rb = 1 - 0.07 * clamp((-gap - 120) / 150, 0, 1);
          const sc = (RB_CC[this.cc] !== undefined ? RB_CC[this.cc] : 0.9) * (0.6 + 0.4 * sk);
          rb = 1 + (rb - 1) * sc;
        }
        this.rb = G.damp(this.rb, rb, 1.5, dt);
        mul = clamp(this.baseMul * this.rb, 0.8, 1.15);
      }
      k.speedMul = mul;
    }

    // DD rear-rider slap: only with both slots empty and a kart beside us within 3 m.
    // Fires once after a short random wait, then rests a few seconds.
    _slap(dt, ctx, finished, fx, fz, rx, rz) {
      const k = this.kart, inp = k.input;
      if (this.slapCool > 0) this.slapCool -= dt;
      const held = k.heldItems;
      const empty = !finished && !(held && (held[0] || held[1]));
      const karts = ctx.karts;
      if (!empty || this.slapCool > 0 || !karts) { this.slapArmed = false; return; }
      let near = false;
      for (let i = 0; i < karts.length; i++) {
        const o = karts[i];
        if (o === k || !o.pos) continue;
        const dx = o.pos.x - k.pos.x, dz = o.pos.z - k.pos.z;
        if (dx * dx + dz * dz > 9) continue;
        const f = dx * fx + dz * fz, s = dx * rx + dz * rz;
        if (s * s > f * f) { near = true; break; }   // beside, not ahead/behind
      }
      if (!near) { this.slapArmed = false; return; }
      if (!this.slapArmed) {
        this.slapArmed = true;
        this.slapWait = rnd(0.3, 1.2);
        return;
      }
      this.slapWait -= dt;
      if (this.slapWait <= 0) {
        inp.slapPressed = true;
        this.slapArmed = false;
        this.slapCool = rnd(3, 6);
      }
    }

    _items(dt, ctx, finished, fx, fz, rx, rz) {
      const k = this.kart, inp = k.input;
      const held = k.heldItems || [null, null];
      const id = held[0] || null;
      const rou = k.roulette || [0, 0];

      if (this.swapCool > 0) this.swapCool -= dt;

      if (finished) {
        inp.item = false; this.phase = 0;
        return;
      }

      // swap riders when rear slot is empty but front holds something
      if (!id && rou[0] <= 0 && held[1] && rou[1] <= 0 && this.swapCool <= 0 && this.phase === 0) {
        inp.swapPressed = true;
        this.swapCool = 2;
      }

      // release step of single use
      if (this.phase === 2) {
        inp.item = false;
        inp.itemReleased = true;
        inp.throwBack = this.relBack;
        this.phase = 0;
        this.itemWait = 0.8;
        return;
      }

      if (id !== this.lastItem) {
        this.lastItem = id;
        this.itemWait = rnd(0.5, 2.5);
        this.itemAge = 0;
        if (this.phase === 1) this.phase = 0; // item vanished while dragging
      }

      if (!id || rou[0] > 0) { inp.item = false; this.phase = 0; return; }
      this.itemAge += dt;

      // dragging: keep holding, release later
      if (this.phase === 1) {
        this.dragT += dt;
        this._scan(ctx, fx, fz, rx, rz);
        if (this.scanBehind < 6 || this.dragT > this.dragLimit) {
          inp.item = false;
          inp.itemReleased = true;
          inp.throwBack = true;
          this.phase = 0;
          this.itemWait = rnd(0.5, 1.5);
        } else {
          inp.item = true;
          inp.throwBack = true;
        }
        return;
      }

      inp.item = false;
      if (this.itemWait > 0) { this.itemWait -= dt; return; }

      this._scan(ctx, fx, fz, rx, rz);
      const age = this.itemAge;
      const pos = k.position || 1;
      const straight = this.curvAbs < 0.1;
      let act = 0; // 1 fwd, 2 back, 3 drag

      switch (id) {
        case 'shell_green':
          if (this.scanAhead < 35) act = 1;
          else if (this.scanBehind < 15) act = 2;
          else if (age > 14) act = 1;
          break;
        case 'shell_green3': case 'shell_red3':
          // triple shells orbit as a shield; fire one when a kart is aimed at
          if (this.scanAhead < 40 || age > 16) act = 1;
          break;
        case 'shell_red': case 'egg': case 'fireball': case 'mega_shell':
          if (pos > 1) act = 1; else if (age > 10) act = 1;
          break;
        case 'spiny':
          if (pos > 1) act = 1; else if (age > 20) act = 1;
          break;
        case 'banana': case 'fake_box': case 'giant_banana':
          act = 3;
          break;
        case 'bomb':
          if (this.scanNear < 30) act = 1;
          else if (this.scanBehind < 10) act = 2;
          else if (age > 12) act = 1;
          break;
        case 'chomp': case 'mushroom_gold':
          // long boosts: use on the next straight, or soon anyway
          if ((straight && !this.drifting) || age > 3) act = 1;
          break;
        case 'mushroom':
          if (pos >= 5 || (straight && !k.drifting && !this.drifting) || age > 8) act = 1;
          break;
        default: // star, lightning, heart, unknown
          act = 1;
      }

      if (act === 1 || act === 2) {
        inp.itemPressed = true;
        inp.item = true;
        inp.throwBack = act === 2;
        this.relBack = act === 2;
        this.phase = 2;
      } else if (act === 3) {
        inp.itemPressed = true;
        inp.item = true;
        inp.throwBack = true;
        this.phase = 1;
        this.dragT = 0;
        this.dragLimit = rnd(6, 14);
      }
    }
  }

  G.AIController = AIController;
})();
