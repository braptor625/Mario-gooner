// Time Trial ghosts -> G.Ghost. Recorder samples a kart during a run; Player replays it translucently.
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  const STEP = 2 / 60;        // seconds per stored sample (every 2nd fixed step)
  const WHEEL_R = 0.35;       // metres, for wheel spin from distance travelled
  const OPACITY = 0.45;
  const TAU = Math.PI * 2;

  function r2(v) { return Math.round(v * 100) / 100; }
  function r3(v) { return Math.round(v * 1000) / 1000; }

  // Records a flat array of [x, y, z, heading] per stored sample.
  class Recorder {
    constructor(kart) {
      this.kart = kart;
      this.calls = 0;
      this.data = [];
    }

    // call once per fixed step
    sample() {
      const parity = this.calls++ & 1;
      if (parity) return;
      const k = this.kart;
      const d = this.data;
      d.push(r2(k.pos.x), r2(k.pos.y), r2(k.pos.z), r3(k.heading));
    }

    finish() {
      return {
        v: 1,
        kart: this.kart.kartId,
        front: this.kart.front,
        rear: this.kart.rear,
        step: STEP,
        data: this.data,
      };
    }
  }

  function cloneMat(m) {
    const c = m.clone();
    c.transparent = true;
    c.opacity = OPACITY;
    c.depthWrite = false;
    return c;
  }

  // Replays recorded data. update(t) interpolates the pose at time t (seconds from run start).
  class Player {
    constructor(scene, data) {
      this.scene = scene;
      this.step = data.step || STEP;
      this.d = data.data || [];
      this.n = Math.floor(this.d.length / 4);

      // cumulative distance per sample, for wheel spin (allocated once here)
      this.cum = new Float64Array(this.n);
      const d = this.d;
      for (let i = 1; i < this.n; i++) {
        const dx = d[i * 4] - d[(i - 1) * 4];
        const dy = d[i * 4 + 1] - d[(i - 1) * 4 + 1];
        const dz = d[i * 4 + 2] - d[(i - 1) * 4 + 2];
        this.cum[i] = this.cum[i - 1] + Math.sqrt(dx * dx + dy * dy + dz * dz);
      }

      const model = G.Characters.buildKart(data.kart, data.front, data.rear);
      this.group = model.group;
      this.wheels = model.wheels || [];
      const group = this.group;
      group.traverse((o) => {
        if (!o.isMesh) return;
        const m = o.material;
        if (Array.isArray(m)) {
          const orig = m.slice();
          o.material = orig.map(cloneMat);
          orig.forEach((x) => x.dispose && x.dispose());
        } else if (m) {
          o.material = cloneMat(m);
          m.dispose && m.dispose();
        }
        o.castShadow = false;
        o.receiveShadow = false;
      });
      this.visible = true;
      this.update(0);
      scene.add(group);
    }

    get duration() {
      return this.n > 0 ? (this.n - 1) * this.step : 0;
    }

    // no allocations: pure arithmetic and Object3D property writes
    update(t) {
      const n = this.n;
      if (n === 0) return;
      const d = this.d;
      let f = t / this.step;
      if (!(f > 0)) f = 0;
      let a = Math.floor(f);
      let alpha;
      if (a >= n - 1) {
        a = n - 1;
        alpha = 0;
      } else {
        alpha = f - a;
      }
      const b = a < n - 1 ? a + 1 : a;
      const ia = a * 4;
      const ib = b * 4;

      const x = d[ia] + (d[ib] - d[ia]) * alpha;
      const y = d[ia + 1] + (d[ib + 1] - d[ia + 1]) * alpha;
      const z = d[ia + 2] + (d[ib + 2] - d[ia + 2]) * alpha;

      // shortest-angle heading interpolation
      const ha = d[ia + 3];
      let dh = d[ib + 3] - ha;
      dh -= TAU * Math.round(dh / TAU);
      const h = ha + dh * alpha;

      const g = this.group;
      g.position.set(x, y, z);
      g.rotation.y = h;

      const dist = this.cum[a] + (this.cum[b] - this.cum[a]) * alpha;
      const spin = dist / WHEEL_R;
      const w = this.wheels;
      for (let i = 0; i < w.length; i++) w[i].rotation.x = spin;
    }

    setVisible(v) {
      this.visible = !!v;
      this.group.visible = this.visible;
    }

    dispose() {
      if (!this.group) return;
      if (this.scene) this.scene.remove(this.group);
      this.group.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry && o.geometry.dispose && o.geometry.dispose();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose && x.dispose());
        else if (m && m.dispose) m.dispose();
      });
      this.group = null;
      this.wheels = [];
      this.d = null;
      this.cum = null;
      this.n = 0;
    }
  }

  G.Ghost = { Recorder, Player, STEP };
})();
