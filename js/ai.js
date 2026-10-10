// AI driver for Turbo Tandem. Classic script; attaches G.AIController.
// Cheap: no allocations per step (all scratch state lives on the instance).
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  const PI = Math.PI;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const RB_CC = { 50: 0.7, 100: 0.9, 150: 1.0 };

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

      // drift state
      this.drifting = false;
      this.driftT = 0;
      this.driftDir = 0;
      this.driftCool = 0;
      this.driftWant = 0;
      this.straightT = 0;
      this.driftTarget = sk > 0.55 ? 2 : (sk > 0.25 && Math.random() < 0.5 ? 2 : 1);
      this.wiggleAmt = sk > 0.2 ? 0.15 + 0.2 * sk : 0;
      this.wigglePhase = Math.random() * 6;

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

      this.rb = 1;
      this.baseMul = 0.94 + 0.06 * sk;

      if (!kart.input) kart.input = {};
      const inp = kart.input;
      inp.accel = 1; inp.brake = 0; inp.steer = 0; inp.drift = false; inp.item = false;
      inp.itemPressed = false; inp.itemReleased = false; inp.swapPressed = false; inp.throwBack = false;
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

      // reset edge flags
      inp.itemPressed = false; inp.itemReleased = false; inp.swapPressed = false;
      inp.throwBack = false;

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

      // ---- desired lateral ----
      let wantLat = this.linePref * hw;
      wantLat += clamp(curv * 2.2, -0.7, 0.7) * hw * this.cutAmount;

      // hazard avoidance
      let nudge = 0;
      const items = ctx.items;
      if (items && items.getHazards && !finished) {
        const hz = items.getHazards();
        if (hz) {
          for (let i = 0; i < hz.length; i++) {
            const o = hz[i];
            const dx = o.x - k.pos.x, dz = o.z - k.pos.z;
            const f = dx * fx + dz * fz;
            if (f < 0 || f > 25) continue;
            const s = dx * rx + dz * rz;
            const clear = (o.radius || 1) + 2.5;
            const as = s < 0 ? -s : s;
            if (as < clear) {
              const push = (clear - as) + 1.5;
              nudge += s > 0 ? -push : push;
              if (as < 0.3) nudge += (this.linePref >= 0 ? 1 : -1) * 2;
            }
          }
        }
      }
      this.hazNudge = G.damp(this.hazNudge, clamp(nudge, -hw, hw), 8, dt);
      wantLat += this.hazNudge;
      const maxLat = Math.max(1, hw - 2.5);
      wantLat = clamp(wantLat, -maxLat, maxLat);
      this.lat = G.damp(this.lat, wantLat, 4, dt);

      // ---- steering toward target ----
      const look = 8 + speed * 0.55;
      const tp = track.pointAt((dist + look) % len);
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

      // ---- drifting ----
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
              this.wigglePhase = Math.random() * 6;
            }
          } else {
            this.driftWant = 0;
          }
        }
        if (this.drifting) {
          this.driftT += dt;
          if (this.curvAbs < 0.14) this.straightT += dt; else this.straightT = 0;
          const lvl = k.driftLevel || 0;
          let end = false;
          if (this.driftT > 0.35 && !kd) end = true;           // kart refused / ended
          else if (this.driftT > 0.4 && lvl >= this.driftTarget) end = true;
          else if (this.straightT > 0.25 && this.driftT > 0.4) end = true;
          else if (speed < topSpeed * 0.35) end = true;
          else if (this.driftT > 5) end = true;
          else if (Math.abs(lateralNow) > hw * 0.7) end = true;
          if (end) {
            this.drifting = false;
            this.driftCool = rnd(0.5, 1.2);
          } else {
            driftHeld = true;
            // steer into the turn, with counter-steer wiggles to charge
            const dir = this.driftDir;
            let s = dir * clamp(dir * steerT, -0.5, 1);
            if (this.driftT < 0.15) s = dir * Math.max(0.7, dir * s);
            else if (this.wiggleAmt > 0 && Math.abs(lateralNow) < hw * 0.55) {
              this.wigglePhase += dt * 9;
              s += Math.sin(this.wigglePhase) * this.wiggleAmt;
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

      // ---- rubber band ----
      let mul;
      if (finished) {
        mul = 0.85;
        this.rb = 1;
      } else {
        let rb = 1;
        const pl = ctx.player;
        if (pl && pl !== k && pl.raceDist !== undefined && k.raceDist !== undefined) {
          const gap = pl.raceDist - k.raceDist; // + => AI behind the player
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
      let act = 0; // 1 fwd, 2 back, 3 drag

      switch (id) {
        case 'shell_green': case 'shell_green3':
          if (this.scanAhead < 35) act = 1;
          else if (this.scanBehind < 15) act = 2;
          else if (age > 14) act = 1;
          break;
        case 'shell_red': case 'shell_red3': case 'egg': case 'fireball': case 'mega_shell':
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
        case 'mushroom': case 'mushroom3': case 'mushroom_gold':
          if (pos >= 5 || (this.curvAbs < 0.08 && !k.drifting && !this.drifting) || age > 8) act = 1;
          break;
        default: // star, lightning, heart, golden, unknown
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
