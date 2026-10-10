// Kart physics, drift, hits, visuals. Depends on G (util.js), THREE r128, G.Characters, G.KARTS, track.
(function () {
  'use strict';
  const G = (window.G = window.G || {});
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
  const TAU = Math.PI * 2;

  const POOL = 40;
  const HOP_TIME = 0.25, HOP_H = 0.35;
  const SPIN_TIME = 1.1, FLIP_TIME = 1.5, SQUISH_TIME = 1.5;
  const L1_CHARGE = 1.0, L2_CHARGE = 2.2;
  const GRAVITY = 32;

  // ---- shared render resources (lazy) ----
  let shared = null;
  function getShared() {
    if (shared) return shared;
    const shadowGeo = new THREE.CircleGeometry(1.1, 14);
    shadowGeo.rotateX(-Math.PI / 2);
    const flameGeo = new THREE.ConeGeometry(0.14, 1.0, 8);
    flameGeo.rotateX(-Math.PI / 2); // tip toward -Z
    flameGeo.translate(0, 0, -0.5);
    shared = {
      shadowGeo,
      shadowMat: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      flameGeo,
      flameMat: new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
      pointsMat: new THREE.PointsMaterial({ size: 0.45, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }),
    };
    return shared;
  }

  // ---- fallback kart if characters.js unavailable ----
  function buildFallbackKart(colorHex) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: colorHex || 0xdd3333 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 2.2), bodyMat);
    body.position.y = 0.5;
    group.add(body);
    const wheels = [], pivots = [];
    const wm = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const wg = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 10);
    wg.rotateZ(Math.PI / 2);
    const pos = [[-0.8, 0.35, 0.8], [0.8, 0.35, 0.8], [-0.8, 0.35, -0.8], [0.8, 0.35, -0.8]];
    for (let i = 0; i < 4; i++) {
      const w = new THREE.Mesh(wg, wm);
      if (i < 2) {
        const p = new THREE.Object3D();
        p.position.set(pos[i][0], pos[i][1], pos[i][2]);
        p.add(w);
        group.add(p);
        pivots.push(p);
      } else {
        w.position.set(pos[i][0], pos[i][1], pos[i][2]);
        group.add(w);
      }
      wheels.push(w);
    }
    const frontSeat = new THREE.Object3D(); frontSeat.position.set(0, 0.8, 0.4);
    const rearSeat = new THREE.Object3D(); rearSeat.position.set(0, 0.8, -0.5);
    group.add(frontSeat, rearSeat);
    const mk = (c) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshLambertMaterial({ color: c })); m.position.y = 0.35; const g = new THREE.Group(); g.add(m); return g; };
    const front = mk(0xffcc88), rear = mk(0x88ccff);
    frontSeat.add(front); rearSeat.add(rear);
    const ex = [new THREE.Object3D(), new THREE.Object3D()];
    ex[0].position.set(-0.4, 0.4, -1.1); ex[1].position.set(0.4, 0.4, -1.1);
    group.add(ex[0], ex[1]);
    return { group, body, wheels, frontWheelPivots: pivots, frontSeat, rearSeat, front, rear, exhausts: ex };
  }

  class Kart {
    constructor(opts) {
      opts = opts || {};
      this.scene = opts.scene;
      this.track = opts.track;
      this.kartId = opts.kartId;
      this.front = opts.frontId;
      this.rear = opts.rearId;
      this.isPlayer = !!opts.isPlayer;
      this.index = opts.index || 0;
      this.cc = opts.cc || 100;

      // stats
      const kdef = (G.KARTS && G.KARTS.find((k) => k.id === opts.kartId)) || { speed: 3, accel: 3, handling: 3, mass: 3, weight: 'medium', color: 0xdd3333 };
      let weight = kdef.weight || 'medium';
      try { if (G.Characters && G.Characters.kartWeight) weight = G.Characters.kartWeight(this.front, this.rear) || weight; } catch (e) { /* ignore */ }
      const wTop = weight === 'heavy' ? 1.04 : weight === 'light' ? 0.97 : 1;
      const wAcc = weight === 'heavy' ? 0.9 : weight === 'light' ? 1.06 : 1;
      const base = (G.CC_SPEED && G.CC_SPEED[this.cc]) || 26;
      this.stats = {
        topSpeed: base * (1 + (kdef.speed - 3) * 0.04) * wTop,
        accel: (9.5 + 1.8 * (kdef.accel - 3)) * wAcc,
        handling: 1 + (kdef.handling - 3) * 0.08,
        mass: kdef.mass || 3,
      };
      this.weight = weight;

      // state
      this.pos = new THREE.Vector3();
      this.vel = new THREE.Vector3();
      this.heading = 0;
      this.speed = 0;
      this.y = 0;
      this.speed01 = 0;
      this.input = { accel: 0, brake: 0, steer: 0, drift: false, itemPressed: false, itemReleased: false, item: false, swapPressed: false, throwBack: false };
      this.heldItems = [null, null];
      this.itemCounts = [0, 0];
      this.roulette = [0, 0];
      this.draggedItem = null;
      this.onBeforeHit = null;
      this.trackInfo = { index: 0, dist: 0, lateral: 0, halfWidth: 8, wallDist: 8, y: 0, onRoad: true, surface: 'road', tx: 0, tz: 1, rx: -1, rz: 0 };
      this.trackIndex = -1;
      this.lap = 0;
      this.dist = 0;
      this.lastDist = 0;
      this.raceDist = 0;
      this.lastGoodDist = 0;
      this.lastGoodY = 0;
      this._progressInit = false;
      this.finished = false;
      this.finishTime = 0;
      this.position = 1;
      this.wrongWay = false;
      this._wrongT = 0;

      this.drifting = false;
      this.driftDir = 0;
      this.driftLevel = 0;
      this.driftCharge = 0;
      this.boostTimer = 0;
      this.boostPower = 1;
      this.starTimer = 0;
      this.shrinkTimer = 0;
      this.spinTimer = 0;
      this.invulnTimer = 0;
      this.falling = false;
      this.speedMul = 1;
      this.lostItems = false;
      this.hitKind = null;
      this.flipTimer = 0;
      this.squishTimer = 0;
      this.stallTimer = 0;
      this.burnoutTimer = 0;
      this.airborne = false;
      this.vy = 0;
      this.airTime = 0;
      this.fromJump = false;

      this._fallTimer = 0;
      this._hopTimer = 0;
      this._hopPending = false;
      this._prevDrift = false;
      this._flick = 0;
      this._swapCd = 0;
      this._swapAnim = 0;
      this._wallCd = 0;
      this._wallSnd = 0;
      this._bumpCd = 0;
      this._padCd = 0;
      this._jumpCd = 0;
      this._prevGround = 0;
      this._pitch = 0;
      this._roll = 0;
      this._steerVis = 0;
      this._leanF = 0;
      this._leanR = 0;
      this._driftVis = 0;
      this._wheelSpin = 0;
      this._scale = 1;
      this._spinDur = SPIN_TIME;
      this._flipDur = FLIP_TIME;
      this._frame = 0;
      this._emitSide = 0;
      this._hue = 0;

      // model
      let model = null;
      try {
        if (G.Characters && G.Characters.buildKart) model = G.Characters.buildKart(this.kartId, this.front, this.rear);
      } catch (e) { model = null; }
      if (!model || !model.group) model = buildFallbackKart(kdef.color);
      this.model = model;
      if (!model.wheels) model.wheels = [];
      if (!model.frontWheelPivots) model.frontWheelPivots = [];
      if (!model.exhausts) model.exhausts = [];
      this.mesh = new THREE.Group();
      this.mesh.rotation.order = 'YXZ';
      model.group.rotation.order = 'YXZ';
      this.mesh.add(model.group);
      this._bodyBaseY = model.body ? model.body.position.y : 0;

      // clone materials of body for star flashing
      this._emMats = [];
      const root = model.body || model.group;
      root.traverse((o) => {
        if (o.isMesh && o.material) {
          if (Array.isArray(o.material)) o.material = o.material.map((m) => m.clone());
          else o.material = o.material.clone();
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of ms) if (m.emissive) this._emMats.push(m);
        }
      });

      const sh = getShared();
      // flames
      this._flames = [];
      let exs = model.exhausts;
      if (!exs.length) {
        const a = new THREE.Object3D(), b = new THREE.Object3D();
        a.position.set(-0.4, 0.4, -1.1); b.position.set(0.4, 0.4, -1.1);
        model.group.add(a, b);
        exs = [a, b];
      }
      for (const ex of exs) {
        const f = new THREE.Mesh(sh.flameGeo, sh.flameMat);
        f.visible = false;
        f.frustumCulled = false;
        ex.add(f);
        this._flames.push(f);
      }
      // blob shadow
      this._shadow = new THREE.Mesh(sh.shadowGeo, sh.shadowMat);
      this._shadow.renderOrder = 1;
      // particles
      this._pPos = new Float32Array(POOL * 3);
      this._pCol = new Float32Array(POOL * 3);
      this._pBase = new Float32Array(POOL * 3);
      this._pVel = new Float32Array(POOL * 3);
      this._pLife = new Float32Array(POOL);
      this._pMax = new Float32Array(POOL);
      this._pGrav = new Float32Array(POOL);
      for (let i = 0; i < POOL; i++) this._pPos[i * 3 + 1] = -1000;
      this._pGeo = new THREE.BufferGeometry();
      this._pGeo.setAttribute('position', new THREE.BufferAttribute(this._pPos, 3));
      this._pGeo.setAttribute('color', new THREE.BufferAttribute(this._pCol, 3));
      this._points = new THREE.Points(this._pGeo, sh.pointsMat);
      this._points.frustumCulled = false;
      this._pCursor = 0;
      this._pAlive = 0;

      if (this.scene) { this.scene.add(this.mesh); this.scene.add(this._shadow); this.scene.add(this._points); }
      this._syncMesh(0);
    }

    // ------------------------------------------------------------ helpers
    getForward(out) {
      return out.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    }

    isInvincible() {
      return this.starTimer > 0 || this.invulnTimer > 0;
    }

    _snd(name) {
      if (this.isPlayer && G.Sound && G.Sound.play) G.Sound.play(name);
    }

    _loseItems() {
      const had = this.heldItems[0] || this.heldItems[1] || this.roulette[0] > 0 || this.roulette[1] > 0;
      this.heldItems[0] = null; this.heldItems[1] = null;
      this.itemCounts[0] = 0; this.itemCounts[1] = 0;
      this.roulette[0] = 0; this.roulette[1] = 0;
      this.lostItems = true;
      if (had || true) G.events && G.events.emit('kartLostItems', this);
    }

    _endDrift(release) {
      if (this.drifting && release) {
        if (this.driftLevel === 2) { this._boost(1.1, 1, false); this._snd('mini_turbo2'); }
        else if (this.driftLevel === 1) { this._boost(0.6, 1, false); this._snd('mini_turbo1'); }
      }
      this.drifting = false;
      this.driftDir = 0;
      this.driftLevel = 0;
      this.driftCharge = 0;
      this._flick = 0;
    }

    _boost(seconds, power, sound) {
      if (seconds >= this.boostTimer || power > this.boostPower) {
        if (this.boostTimer <= 0 || power >= this.boostPower) this.boostPower = power;
      }
      if (seconds > this.boostTimer) this.boostTimer = seconds;
      const kick = this.stats.topSpeed * (1 + 0.35 * power) * 0.9;
      if (this.speed < kick) this.speed = kick;
      if (sound) this._snd('boost');
    }

    boost(seconds, power) {
      this._boost(seconds, power === undefined ? 1 : power, true);
    }

    rocketStart(level) {
      if (level >= 2) this._boost(1.2, 1, true);
      else if (level === 1) this._boost(0.6, 1, true);
      else if (level < 0) { this.burnoutTimer = 1.0; this.stallTimer = 1.0; this.speed = 0; }
    }

    hit(kind) {
      if (this.falling || this.isInvincible()) return;
      if (this.onBeforeHit && this.onBeforeHit(kind) === true) return;
      if (this.spinTimer > 0 || this.squishTimer > 0) return;
      this._endDrift(false);
      this.boostTimer = 0;
      this.hitKind = kind;
      if (kind === 'spin') {
        this.spinTimer = this._spinDur = SPIN_TIME;
        this.speed *= 0.15;
        this._loseItems();
        this.invulnTimer = SPIN_TIME + 1.5;
      } else if (kind === 'flip') {
        this.spinTimer = this._flipDur = FLIP_TIME;
        this.speed = 0;
        this.vel.set(0, 0, 0);
        this._loseItems();
        this.invulnTimer = FLIP_TIME + 1.5;
      } else if (kind === 'squish') {
        this.squishTimer = SQUISH_TIME;
        this.speed *= 0.3;
        this.invulnTimer = SQUISH_TIME + 1.5;
      }
    }

    respawn() {
      const L = this.track ? this.track.length : 1;
      let d = this.lastGoodDist - 5;
      d = ((d % L) + L) % L;
      const rp = this.track.respawnPoint(d);
      this.pos.set(rp.x, rp.y, rp.z);
      this.heading = rp.heading;
      this.speed = 0;
      this.vel.set(0, 0, 0);
      this.vy = 0;
      this.airborne = false;
      this.falling = false;
      this._fallTimer = 0;
      this.spinTimer = 0; this.squishTimer = 0; this.boostTimer = 0; this.burnoutTimer = 0;
      this._endDrift(false);
      this._hopTimer = 0; this._hopPending = false;
      this.stallTimer = 1.0;
      this.invulnTimer = 2.0;
      this.trackIndex = -1;
      this._prevGround = rp.y;
      this.y = rp.y;
    }

    swap() {
      if (this._swapCd > 0 || this.falling) return;
      this._swapCd = 0.4;
      let t = this.front; this.front = this.rear; this.rear = t;
      t = this.heldItems[0]; this.heldItems[0] = this.heldItems[1]; this.heldItems[1] = t;
      t = this.itemCounts[0]; this.itemCounts[0] = this.itemCounts[1]; this.itemCounts[1] = t;
      t = this.roulette[0]; this.roulette[0] = this.roulette[1]; this.roulette[1] = t;
      this._snd('swap');
      const m = this.model;
      if (!m.frontSeat || !m.rearSeat || !m.front || !m.rear) return;
      if (this._swapAnim > 0) this._finishSwap();
      const parent = m.frontSeat.parent;
      if (!parent) { const f = m.front; m.front = m.rear; m.rear = f; return; }
      this._swFrom = this._swFrom || new THREE.Vector3();
      this._swTo = this._swTo || new THREE.Vector3();
      this._swA = m.front; // moving front -> rear seat
      this._swB = m.rear;  // moving rear -> front seat
      this._swALocal = m.front.position.clone();
      this._swBLocal = m.rear.position.clone();
      parent.add(this._swA); parent.add(this._swB);
      this._swParent = parent;
      this._swapAnim = 0.35;
      this._swapStep(0);
    }

    _swapStep(dt) {
      const m = this.model;
      this._swapAnim -= dt;
      const p = clamp(1 - this._swapAnim / 0.35, 0, 1);
      const arc = Math.sin(p * Math.PI) * 1.0;
      const fs = m.frontSeat.position, rs = m.rearSeat.position;
      // A: front -> rear
      this._swA.position.set(
        fs.x + (rs.x - fs.x) * p + this._swALocal.x,
        fs.y + (rs.y - fs.y) * p + arc + this._swALocal.y,
        fs.z + (rs.z - fs.z) * p + this._swALocal.z);
      this._swB.position.set(
        rs.x + (fs.x - rs.x) * p + this._swBLocal.x,
        rs.y + (fs.y - rs.y) * p + arc * 1.25 + this._swBLocal.y,
        rs.z + (fs.z - rs.z) * p + this._swBLocal.z);
      this._swA.rotation.y = p * TAU; this._swB.rotation.y = -p * TAU;
      if (this._swapAnim <= 0) this._finishSwap();
    }

    _finishSwap() {
      const m = this.model;
      this._swapAnim = 0;
      if (!this._swA) return;
      this._swA.rotation.y = 0; this._swB.rotation.y = 0;
      m.rearSeat.add(this._swA);
      m.frontSeat.add(this._swB);
      this._swA.position.copy(this._swALocal);
      this._swB.position.copy(this._swBLocal);
      m.front = this._swB;
      m.rear = this._swA;
      this._swA = null; this._swB = null;
    }

    // ------------------------------------------------------------ particles
    _emit(x, y, z, vx, vy, vz, r, g, b, life, grav) {
      const i = this._pCursor;
      this._pCursor = (i + 1) % POOL;
      const k = i * 3;
      this._pPos[k] = x; this._pPos[k + 1] = y; this._pPos[k + 2] = z;
      this._pVel[k] = vx; this._pVel[k + 1] = vy; this._pVel[k + 2] = vz;
      this._pBase[k] = r; this._pBase[k + 1] = g; this._pBase[k + 2] = b;
      this._pCol[k] = r; this._pCol[k + 1] = g; this._pCol[k + 2] = b;
      this._pLife[i] = life; this._pMax[i] = life; this._pGrav[i] = grav;
      this._pAlive = 1;
    }

    _updateParticles(dt) {
      if (!this._pAlive) return;
      let any = 0;
      for (let i = 0; i < POOL; i++) {
        const k = i * 3;
        if (this._pLife[i] > 0) {
          this._pLife[i] -= dt;
          if (this._pLife[i] <= 0) {
            this._pPos[k + 1] = -1000;
            this._pCol[k] = this._pCol[k + 1] = this._pCol[k + 2] = 0;
          } else {
            any = 1;
            this._pVel[k + 1] -= this._pGrav[i] * dt;
            this._pPos[k] += this._pVel[k] * dt;
            this._pPos[k + 1] += this._pVel[k + 1] * dt;
            this._pPos[k + 2] += this._pVel[k + 2] * dt;
            const f = this._pLife[i] / this._pMax[i];
            this._pCol[k] = this._pBase[k] * f; this._pCol[k + 1] = this._pBase[k + 1] * f; this._pCol[k + 2] = this._pBase[k + 2] * f;
          }
        }
      }
      this._pGeo.attributes.position.needsUpdate = true;
      this._pGeo.attributes.color.needsUpdate = true;
      this._pAlive = any;
    }

    // world offset from kart center: back distance, side (right +)
    _wx(back, side) {
      const s = Math.sin(this.heading), c = Math.cos(this.heading);
      return this.pos.x - s * back - c * side;
    }
    _wz(back, side) {
      const s = Math.sin(this.heading), c = Math.cos(this.heading);
      return this.pos.z - c * back + s * side;
    }

    // ------------------------------------------------------------ main update
    update(dt) {
      const inp = this.input;
      const st = this.stats;
      const track = this.track;
      this._frame++;

      // timers
      if (this.boostTimer > 0) this.boostTimer -= dt;
      if (this.starTimer > 0) this.starTimer -= dt;
      if (this.shrinkTimer > 0) this.shrinkTimer -= dt;
      if (this.invulnTimer > 0) this.invulnTimer -= dt;
      if (this.stallTimer > 0) this.stallTimer -= dt;
      if (this.burnoutTimer > 0) this.burnoutTimer -= dt;
      if (this._swapCd > 0) this._swapCd -= dt;
      if (this._wallCd > 0) this._wallCd -= dt;
      if (this._wallSnd > 0) this._wallSnd -= dt;
      if (this._bumpCd > 0) this._bumpCd -= dt;
      if (this._jumpCd > 0) this._jumpCd -= dt;
      if (this.squishTimer > 0) this.squishTimer -= dt;
      if (this._hopTimer > 0) this._hopTimer -= dt;
      if (this.spinTimer > 0) { this.spinTimer -= dt; if (this.spinTimer <= 0) this.hitKind = null; }
      if (this._swapAnim > 0) this._swapStep(dt);

      if (inp.swapPressed && !this.falling && this.spinTimer <= 0) this.swap();

      const stunned = this.spinTimer > 0 || this.falling || this.stallTimer > 0;
      const topBase = st.topSpeed;
      const grounded = !this.airborne;

      // ---- falling state
      if (this.falling) {
        this._fallTimer += dt;
        this.vy -= GRAVITY * 0.6 * dt;
        this.pos.y += this.vy * dt;
        this.vel.multiplyScalar(0.97);
        this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
        this.speed *= 0.97;
        if (this._fallTimer >= 1.2) this.respawn();
        this._visuals(dt, 0);
        return;
      }

      // ---- surface / top speed
      const ti = this.trackInfo;
      const offroad = !ti.onRoad && ti.surface !== 'boost' && ti.surface !== 'jump';
      const boosting = this.boostTimer > 0;
      let top = topBase * this.speedMul;
      if (boosting) top *= 1 + 0.35 * this.boostPower;
      if (this.starTimer > 0) top *= 1.15;
      if (this.shrinkTimer > 0) top *= 0.7;
      if (this.squishTimer > 0) top *= 0.6;
      if (offroad && !boosting && this.starTimer <= 0 && grounded) top *= 0.55;

      // ---- speed
      if (stunned) {
        const drag = this.spinTimer > 0 ? 18 : 30;
        if (this.speed > 0) this.speed = Math.max(0, this.speed - drag * dt);
        else this.speed = Math.min(0, this.speed + drag * dt);
        if (this.spinTimer > 0 && this.hitKind === 'flip') this.speed = 0;
      } else if (grounded) {
        const acc = inp.accel > 0.5, brk = inp.brake > 0.5;
        const frac = clamp(this.speed / top, 0, 1.5);
        if (acc) {
          if (this.speed < top) {
            let a = st.accel * (frac < 0.7 ? 1 : 0.3);
            if (boosting) a *= 3;
            if (this.speed < 0) a = 30;
            this.speed = Math.min(top, this.speed + a * dt);
          }
        } else if (brk) {
          if (this.speed > 0.5) this.speed -= 28 * dt;
          else this.speed = Math.max(-6, this.speed - 10 * dt);
        } else {
          const d = (3.5 + 0.06 * Math.abs(this.speed)) * dt;
          if (this.speed > d) this.speed -= d; else if (this.speed < -d) this.speed += d; else this.speed = 0;
        }
        if (this.speed > top) {
          this.speed = Math.max(top, this.speed - (offroad ? 16 : 7) * dt);
        }
      }
      if (this.burnoutTimer > 0) this.speed = 0;

      // ---- drift state machine
      const driftEdge = inp.drift && !this._prevDrift;
      this._prevDrift = !!inp.drift;
      const steer = stunned ? 0 : clamp(inp.steer || 0, -1, 1);
      const spd01 = Math.abs(this.speed) / topBase;

      if (!stunned) {
        if (driftEdge && grounded && !this.drifting && this._hopTimer <= 0) {
          this._hopTimer = HOP_TIME;
          this._hopPending = true;
          this._snd('hop');
        }
        if (this._hopPending && !this.drifting) {
          if (!inp.drift) this._hopPending = false;
          else if (Math.abs(steer) > 0.3 && spd01 > 0.4) {
            this.drifting = true;
            this.driftDir = steer > 0 ? 1 : -1;
            this.driftCharge = 0; this.driftLevel = 0; this._flick = 0;
            this._hopPending = false;
            this._snd('drift_start');
          } else if (this._hopTimer <= 0) this._hopPending = false;
        }
      }
      if (this.drifting) {
        if (!inp.drift) {
          this._endDrift(true);
        } else if (spd01 < 0.25 || stunned) {
          this._endDrift(false);
        } else {
          const rel = steer * this.driftDir;
          this.driftCharge += dt * 0.5;
          if (this._flick === 0 && rel < -0.5) this._flick = 1;
          else if (this._flick === 1 && rel > 0.2) { this._flick = 0; this.driftCharge += 0.5; }
          this.driftLevel = this.driftCharge >= L2_CHARGE ? 2 : this.driftCharge >= L1_CHARGE ? 1 : 0;
        }
      }

      // ---- steering
      if (!stunned || this.stallTimer > 0 && this.spinTimer <= 0 && !this.falling) {
        const f = spd01;
        let c = Math.pow(Math.min(f / 0.5, 1), 0.7);
        if (f > 0.6) c *= 1 - 0.2 * Math.min(1, (f - 0.6) / 0.4);
        if (this.airborne) c *= 0.5;
        const rate = 1.9 * st.handling * c;
        const sgn = this.speed < 0 ? -1 : 1;
        if (this.drifting) {
          const turn = this.driftDir * (0.75 + 0.5 * steer * this.driftDir);
          this.heading -= turn * rate * 1.1 * dt;
        } else {
          this.heading -= steer * rate * sgn * dt;
        }
      }

      // ---- velocity (slip)
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      const grip = this.airborne ? 1.5 : this.drifting ? 3.2 : 9;
      const kg = 1 - Math.exp(-grip * dt);
      this.vel.x += (fx * this.speed - this.vel.x) * kg;
      this.vel.z += (fz * this.speed - this.vel.z) * kg;
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;

      // ---- vertical
      if (this.airborne) {
        this.vy -= GRAVITY * dt;
        this.pos.y += this.vy * dt;
        this.airTime += dt;
      }

      // ---- track query
      if (track) this._queryTrack(dt);

      // ---- progress
      this._updateProgress(dt);

      // ---- visuals
      this._visuals(dt, steer);
      this.speed01 = clamp(this.speed / topBase, -1, 1.5);
    }

    _queryTrack(dt) {
      const ti = this.trackInfo;
      const r = this.track.query(this.pos.x, this.pos.z, this.trackIndex);
      ti.index = r.index; ti.dist = r.dist; ti.lateral = r.lateral; ti.halfWidth = r.halfWidth;
      ti.wallDist = r.wallDist; ti.y = r.y; ti.onRoad = r.onRoad; ti.surface = r.surface;
      ti.tx = r.tx; ti.tz = r.tz; ti.rx = r.rx; ti.rz = r.rz;
      this.trackIndex = r.index;

      // walls
      const lat = ti.lateral;
      const wd = ti.wallDist;
      if (Math.abs(lat) > wd) {
        const sgn = lat > 0 ? 1 : -1;
        const excess = Math.abs(lat) - wd + 0.05;
        this.pos.x -= ti.rx * sgn * excess;
        this.pos.z -= ti.rz * sgn * excess;
        const vl = this.vel.x * ti.rx + this.vel.z * ti.rz;
        if (vl * sgn > 0) {
          this.vel.x -= ti.rx * vl * 1.3;
          this.vel.z -= ti.rz * vl * 1.3;
        }
        if (this._wallCd <= 0) {
          this._wallCd = 0.25;
          this.speed *= 0.6;
          this.vel.x *= 0.6; this.vel.z *= 0.6;
          // nudge heading toward track tangent
          const th = Math.atan2(ti.tx, ti.tz);
          let dh = th - this.heading;
          while (dh > Math.PI) dh -= TAU;
          while (dh < -Math.PI) dh += TAU;
          if (this.speed < 0) dh = 0;
          this.heading += dh * 0.25;
          if (this._wallSnd <= 0) { this._wallSnd = 0.4; this._snd('wall'); }
          this._endDrift(false);
        } else {
          this.speed *= 0.99;
        }
      }

      // vertical + surface
      const gy = ti.y;
      const surf = ti.surface;
      if (surf === 'void' && !this.airborne) {
        this.falling = true; this._fallTimer = 0; this.vy = 0;
        this._endDrift(false);
        this._snd('fall');
        return;
      }
      if (this.airborne) {
        if (surf === 'void') {
          if (this.pos.y < this.lastGoodY - 5) {
            this.falling = true; this._fallTimer = 0; this.vy = Math.min(this.vy, 0);
            this._endDrift(false);
            this._snd('fall');
            return;
          }
        } else if (this.pos.y <= gy && this.vy <= 0) {
          this.pos.y = gy;
          this.airborne = false;
          if (this.fromJump && this.airTime > 0.35) {
            this._boost(0.6, 1, false);
            this._snd('mini_turbo1');
          }
          this.fromJump = false;
          this.vy = 0;
          this.airTime = 0;
          this._prevGround = gy;
        }
      } else {
        this.pos.y = damp(this.pos.y, gy, 20, dt);
        if (Math.abs(this.pos.y - gy) > 1) this.pos.y = gy;
        this.lastGoodY = gy;
        this.lastGoodDist = ti.dist;
        if (surf === 'jump' && this._jumpCd <= 0) {
          this.airborne = true;
          this.fromJump = true;
          this.vy = 8 + Math.abs(this.speed) * 0.12;
          this.airTime = 0;
          this._jumpCd = 0.6;
        }
      }
      if (surf === 'boost') {
        if (this._padCd <= 0) this.boost(0.9, 1);
        this._padCd = 0.3;
      } else if (this._padCd > 0) this._padCd -= dt;
      if (this.lastGoodY === undefined) this.lastGoodY = gy;
    }

    _updateProgress(dt) {
      const ti = this.trackInfo;
      const L = this.track ? this.track.length : 1;
      const d = ti.dist;
      if (!this._progressInit) {
        this._progressInit = true;
        this.dist = d; this.lastDist = d;
        this.lastGoodDist = d;
      } else {
        const prev = this.dist;
        if (prev > L * 0.75 && d < L * 0.25) this.lap++;
        else if (prev < L * 0.25 && d > L * 0.75) this.lap--;
        this.lastDist = prev;
        this.dist = d;
      }
      this.raceDist = this.lap * L + this.dist - L;
      // wrong way
      const sp = Math.sqrt(this.vel.x * this.vel.x + this.vel.z * this.vel.z);
      if (sp > 5 && (this.vel.x * ti.tx + this.vel.z * ti.tz) / sp < -0.3) {
        this._wrongT += dt;
        if (this._wrongT > 1) this.wrongWay = true;
      } else { this._wrongT = 0; this.wrongWay = false; }
    }

    // ------------------------------------------------------------ visuals
    _syncMesh(dt) {
      const m = this.mesh;
      m.position.copy(this.pos);
      this.y = this.pos.y;
      m.rotation.y = this.heading;
    }

    _visuals(dt, steer) {
      const m = this.model;
      const ti = this.trackInfo;
      const sp = this.speed;
      const spd01 = clamp(Math.abs(sp) / this.stats.topSpeed, 0, 1.5);
      this.y = this.pos.y;

      // smooth values
      this._steerVis = damp(this._steerVis, steer, 12, dt);
      this._driftVis = damp(this._driftVis, this.drifting ? 1 : 0, 10, dt);
      const ddir = this.drifting ? this.driftDir : (this._lastDir || 0);
      if (this.drifting) this._lastDir = this.driftDir;
      this._leanF = damp(this._leanF, this._steerVis * 0.18 + ddir * 0.22 * this._driftVis, 10, dt);
      this._leanR = damp(this._leanR, this._steerVis * 0.18 + ddir * 0.22 * this._driftVis, 5, dt);

      // slope pitch
      const gy = ti.y;
      let pitchT;
      if (this.airborne) pitchT = -clamp(this.vy * 0.04, -0.4, 0.4);
      else {
        const dgy = gy - this._prevGround;
        const move = Math.max(Math.abs(sp) * dt, 0.05);
        pitchT = -Math.atan(clamp(dgy / move, -1, 1) * (sp < 0 ? -1 : 1));
      }
      this._prevGround = gy;
      this._pitch = damp(this._pitch, clamp(pitchT, -0.5, 0.5), 8, dt);
      const rollT = -this._steerVis * 0.05 * Math.min(spd01, 1) - ddir * 0.1 * this._driftVis;
      this._roll = damp(this._roll, rollT, 10, dt);

      // hop
      let hopY = 0;
      if (this._hopTimer > 0) hopY = HOP_H * Math.sin(Math.PI * (1 - this._hopTimer / HOP_TIME));

      // hit anims
      let spinAng = 0, flipAng = 0, flipY = 0, sy = 1, fallY = 0;
      if (this.spinTimer > 0) {
        const p = 1 - this.spinTimer / (this.hitKind === 'flip' ? this._flipDur : this._spinDur);
        if (this.hitKind === 'flip') {
          const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          flipAng = e * TAU;
          flipY = (p < 0.8 ? Math.sin(p / 0.8 * Math.PI) : 0) * 2.2;
          spinAng = 0;
        } else {
          const e = 1 - Math.pow(1 - p, 3);
          spinAng = e * TAU * 1.1;
        }
      }
      if (this.squishTimer > 0) {
        const left = this.squishTimer;
        sy = left > 0.4 ? 0.2 : 0.2 + 0.8 * (1 - left / 0.4);
      }
      if (this.falling) {
        fallY = -0.5 * this._fallTimer * this._fallTimer * 6;
        flipAng = this._fallTimer * 1.5;
      }

      // mesh transform
      const mesh = this.mesh;
      const targetScale = this.shrinkTimer > 0 ? 0.5 : 1;
      this._scale = damp(this._scale, targetScale, 10, dt);
      mesh.scale.set(this._scale, this._scale, this._scale);
      mesh.position.copy(this.pos);
      mesh.rotation.y = this.heading;
      mesh.rotation.x = this._pitch;
      mesh.rotation.z = this._roll;
      const g = m.group;
      g.position.y = hopY + flipY + (this.falling ? 0 : 0);
      g.rotation.y = -ddir * 0.44 * this._driftVis + spinAng;
      g.rotation.x = flipAng;
      g.scale.set(1, sy, 1);
      if (this.falling) { g.position.y = 0; }

      // invuln flash (not for star)
      let vis = true;
      if (this.starTimer <= 0 && this.invulnTimer > 0 && this.spinTimer <= 0 && this.squishTimer <= 0) vis = ((this._frame >> 2) & 1) === 0 || this.invulnTimer > 3;
      g.visible = vis;

      // star flash
      if (this._emMats.length) {
        if (this.starTimer > 0) {
          this._hue = (this._hue + dt * 2.5) % 1;
          if (!this._starCol) this._starCol = new THREE.Color();
          this._starCol.setHSL(this._hue, 1, 0.5);
          for (let i = 0; i < this._emMats.length; i++) this._emMats[i].emissive.copy(this._starCol);
          this._starOn = true;
        } else if (this._starOn) {
          for (let i = 0; i < this._emMats.length; i++) this._emMats[i].emissive.setRGB(0, 0, 0);
          this._starOn = false;
        }
      }

      // wheels
      const burn = this.burnoutTimer > 0;
      this._wheelSpin += (burn ? 40 : sp) * dt / 0.35;
      const wh = m.wheels;
      for (let i = 0; i < wh.length; i++) wh[i].rotation.x = this._wheelSpin;
      const pv = m.frontWheelPivots;
      const steerAng = -(this.drifting ? this.driftDir * 0.5 + this._steerVis * 0.3 : this._steerVis) * 0.45;
      for (let i = 0; i < pv.length; i++) pv[i].rotation.y = steerAng;

      // bob
      if (m.body) m.body.position.y = this._bodyBaseY + (this.airborne || this.falling ? 0 : Math.sin(this._frame * 0.55) * 0.015 * Math.min(spd01, 1));

      // riders lean
      if (m.front && this._swapAnim <= 0) { m.front.rotation.z = this._leanF; }
      if (m.rear && this._swapAnim <= 0) { m.rear.rotation.z = this._leanR * 0.8; }

      // flames
      const fl = this.boostTimer > 0;
      for (let i = 0; i < this._flames.length; i++) {
        const f = this._flames[i];
        if (fl) {
          f.visible = true;
          f.scale.set(0.8 + Math.random() * 0.4, 0.8 + Math.random() * 0.4, 0.9 + Math.random() * 0.9);
        } else if (f.visible) f.visible = false;
      }

      // blob shadow
      const sh = this._shadow;
      sh.position.set(this.pos.x, gy + 0.06, this.pos.z);
      sh.rotation.y = this.heading;
      const h = Math.max(0, this.pos.y - gy);
      const ss = this._scale * (1 - clamp(h * 0.08, 0, 0.5));
      sh.scale.set(ss * 0.95, 1, ss * 1.25);
      sh.visible = !this.falling || this._fallTimer < 0.4;

      // particle emission
      const fr = this._frame;
      if (this.drifting && this.driftLevel > 0 && !this.airborne && (fr & 1) === 0) {
        this._emitSide ^= 1;
        const side = this._emitSide ? 0.75 : -0.75;
        const lvl2 = this.driftLevel === 2;
        const r = lvl2 ? 1 : 0.3, gg = lvl2 ? (fr & 2 ? 0.55 : 0.2) : 0.6, b = lvl2 ? 0.1 : 1;
        this._emit(this._wx(1.0, side), this.pos.y + 0.2, this._wz(1.0, side),
          (Math.random() - 0.5) * 2.5, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 2.5, r, gg, b, 0.35, 12);
      }
      if ((burn || (this.stallTimer > 0 && this.speed < 1 && inp0(this))) && (fr % 3) === 0) {
        const side = (fr & 4) ? 0.7 : -0.7;
        this._emit(this._wx(1.0, side), this.pos.y + 0.2, this._wz(1.0, side), (Math.random() - 0.5), 0.8, (Math.random() - 0.5), 0.5, 0.5, 0.5, 0.6, -1);
      }
      if (!this.airborne && !this.falling && !this.trackInfo.onRoad && this.trackInfo.surface === 'offroad' && spd01 > 0.2 && (fr % 4) === 0) {
        const side = (fr & 8) ? 0.75 : -0.75;
        this._emit(this._wx(1.0, side), this.pos.y + 0.15, this._wz(1.0, side), (Math.random() - 0.5), 1.0, (Math.random() - 0.5), 0.45, 0.35, 0.2, 0.5, 2);
      }
      if (this.boostTimer <= 0 && spd01 > 0.3 && (fr % 8) === 0 && !this.falling) {
        const side = (fr & 8) ? 0.4 : -0.4;
        this._emit(this._wx(1.2, side), this.pos.y + 0.4, this._wz(1.2, side), (Math.random() - 0.5) * 0.4, 0.5, (Math.random() - 0.5) * 0.4, 0.25, 0.25, 0.25, 0.4, -0.5);
      }
      this._updateParticles(dt);
    }

    dispose() {
      if (this.scene) { this.scene.remove(this.mesh); this.scene.remove(this._shadow); this.scene.remove(this._points); }
      if (this._pGeo) this._pGeo.dispose();
    }

    // ------------------------------------------------------------ collisions
    static resolveCollisions(karts) {
      const n = karts.length;
      for (let i = 0; i < n; i++) {
        const a = karts[i];
        if (!a || a.falling) continue;
        for (let j = i + 1; j < n; j++) {
          const b = karts[j];
          if (!b || b.falling) continue;
          const ra = 1.2 * (a.shrinkTimer > 0 ? 0.5 : 1);
          const rb = 1.2 * (b.shrinkTimer > 0 ? 0.5 : 1);
          const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
          const rr = ra + rb;
          const d2 = dx * dx + dz * dz;
          if (d2 >= rr * rr) continue;
          if (Math.abs(a.pos.y - b.pos.y) > 1.5) continue;
          let d = Math.sqrt(d2), nx, nz;
          if (d < 1e-4) { nx = 1; nz = 0; d = 0; } else { nx = dx / d; nz = dz / d; }
          const overlap = rr - d;
          const ma = a.stats.mass, mb = b.stats.mass;
          const wa = mb / (ma + mb), wb = ma / (ma + mb); // share of push for a, b
          a.pos.x -= nx * overlap * wa; a.pos.z -= nz * overlap * wa;
          b.pos.x += nx * overlap * wb; b.pos.z += nz * overlap * wb;
          // velocity exchange along normal
          const rv = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
          if (rv < 0) {
            const jimp = -rv * 1.3;
            a.vel.x -= nx * jimp * wa; a.vel.z -= nz * jimp * wa;
            b.vel.x += nx * jimp * wb; b.vel.z += nz * jimp * wb;
            a.speed *= 1 - 0.06 * wa * 2; b.speed *= 1 - 0.06 * wb * 2;
          }
          // star / squish
          const aStar = a.starTimer > 0, bStar = b.starTimer > 0;
          if (aStar && !bStar) b.hit('flip');
          else if (bStar && !aStar) a.hit('flip');
          else if (!aStar && !bStar) {
            if (a.shrinkTimer <= 0 && b.shrinkTimer > 0) b.hit('squish');
            else if (b.shrinkTimer <= 0 && a.shrinkTimer > 0) a.hit('squish');
          }
          if ((a._bumpCd <= 0 && b._bumpCd <= 0) && (a.isPlayer || b.isPlayer)) {
            a._bumpCd = 0.3; b._bumpCd = 0.3;
            if (G.Sound && G.Sound.play) G.Sound.play('bump');
          }
        }
      }
    }
  }

  // helper: whether stall came with accel pressed (for rocket-start smoke)
  function inp0(k) { return k.input && k.input.accel > 0.5; }

  G.Kart = Kart;
})();
