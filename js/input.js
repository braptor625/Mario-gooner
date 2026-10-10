// Input: keyboard + standard gamepad -> G.Input.state. Polled once per fixed 1/60 s step.
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  const DT = 1 / 60;
  const DEADZONE = 0.15;
  const STEER_RAMP = 8;   // units/s toward a held direction
  const STEER_SNAP = 12;  // units/s back to centre / when reversing

  // keyboard bindings by KeyboardEvent.code
  const KEYS = {
    accel: ['KeyW', 'ArrowUp', 'KeyX', 'KeyJ'],
    brake: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    drift: ['ShiftLeft', 'ShiftRight', 'Space', 'KeyK'],
    item: ['KeyE', 'KeyL', 'ControlLeft', 'ControlRight'],
    swap: ['KeyQ', 'KeyZ', 'KeyI'],
    pause: ['Escape', 'KeyP'],
    lookBack: ['KeyC'],
    throwBack: ['KeyS', 'ArrowDown'],
  };
  // keys whose default action (page scroll) is suppressed outside text fields
  const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

  // standard-mapping gamepad button indices per action
  const PAD = {
    accel: [0],        // A
    brake: [1],        // B
    item: [2, 4],      // X, L1
    swap: [3],         // Y
    drift: [5],        // R1 (R2 handled separately)
    pause: [9],        // Start
    lookBack: [8],     // Back
  };
  const PAD_R2 = 7;
  const PAD_STICK_Y = 1;   // left stick y, positive = down
  const PAD_STICK_X = 0;

  const ACTIONS = ['accel', 'brake', 'item', 'drift', 'swap', 'pause', 'lookBack', 'throwBack'];
  const act = {};
  for (const name of ACTIONS) act[name] = { down: false, pressed: false, released: false };

  const held = new Set();        // codes currently down
  const latchPress = new Set();  // codes pressed (non-repeat keydown) since last poll
  const gpPrev = new Uint8Array(32);
  let steerKey = 0;
  let inited = false;

  G.Input = {
    state: {
      accel: 0,
      brake: 0,
      steer: 0,
      drift: false,
      item: false,
      itemPressed: false,
      itemReleased: false,
      swapPressed: false,
      lookBack: false,
      throwBack: false,
      pausePressed: false,
    },
    anyKeyPressed: false,

    init() {
      if (inited) return;
      inited = true;
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onBlur);
    },

    poll() {
      const pad = findPad();
      const s = this.state;

      for (const name of ACTIONS) {
        const a = act[name];
        const kbHeld = anyHeld(KEYS[name]);
        const kbLatched = anyLatched(KEYS[name]);
        const padHeld = pad ? readPadAction(pad, name) : false;
        const heldNow = kbHeld || padHeld;
        // a press latched since the last poll counts as down for this poll, so a
        // press+release that both happened between polls still yields one press edge
        const newDown = heldNow || kbLatched;
        a.pressed = kbLatched || (heldNow && !a.down);
        a.released = a.down && !newDown;
        a.down = newDown;
      }

      // steering: keyboard digital target smoothed, gamepad stick analog overrides
      const target = (anyHeld(KEYS.right) ? 1 : 0) - (anyHeld(KEYS.left) ? 1 : 0);
      stepSteer(target);
      let steer = steerKey;
      if (pad && pad.axes) {
        const ax = pad.axes[PAD_STICK_X] || 0;
        if (Math.abs(ax) > DEADZONE) {
          steer = Math.sign(ax) * (Math.abs(ax) - DEADZONE) / (1 - DEADZONE);
        }
      }
      s.steer = G.clamp(steer, -1, 1);

      // any-key edge: keyboard latch or a gamepad button newly pressed
      let anyPad = false;
      if (pad) {
        const n = Math.min(pad.buttons ? pad.buttons.length : 0, gpPrev.length);
        for (let i = 0; i < n; i++) {
          const b = pad.buttons[i];
          const down = b && b.pressed ? 1 : 0;
          if (down && !gpPrev[i]) anyPad = true;
          gpPrev[i] = down;
        }
      } else {
        gpPrev.fill(0);
      }
      this.anyKeyPressed = latchPress.size > 0 || anyPad;
      latchPress.clear();

      s.accel = act.accel.down ? 1 : 0;
      s.brake = act.brake.down ? 1 : 0;
      s.drift = act.drift.down;
      s.item = act.item.down;
      s.itemPressed = act.item.pressed;
      s.itemReleased = act.item.released;
      s.swapPressed = act.swap.pressed;
      s.pausePressed = act.pause.pressed;
      s.lookBack = act.lookBack.down;
      s.throwBack = act.throwBack.down;
    },

    reset() {
      held.clear();
      latchPress.clear();
      gpPrev.fill(0);
      steerKey = 0;
      for (const name of ACTIONS) {
        const a = act[name];
        a.down = a.pressed = a.released = false;
      }
      const s = this.state;
      s.accel = s.brake = s.steer = 0;
      s.drift = s.item = s.lookBack = s.throwBack = false;
      s.itemPressed = s.itemReleased = s.swapPressed = s.pausePressed = false;
      this.anyKeyPressed = false;
    },
  };

  // ---- keyboard ----
  function isTextTarget(t) {
    if (!t) return false;
    const tag = t.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!t.isContentEditable;
  }

  function onKeyDown(e) {
    const code = e.code;
    if (!code) return;
    if (PREVENT.has(code) && !isTextTarget(e.target) && e.preventDefault) e.preventDefault();
    held.add(code);
    if (!e.repeat) latchPress.add(code);
  }

  function onKeyUp(e) {
    if (e.code) held.delete(e.code);
  }

  function onBlur() {
    held.clear();
    latchPress.clear();
    steerKey = 0;
  }

  function anyHeld(codes) {
    for (let i = 0; i < codes.length; i++) if (held.has(codes[i])) return true;
    return false;
  }

  function anyLatched(codes) {
    for (let i = 0; i < codes.length; i++) if (latchPress.has(codes[i])) return true;
    return false;
  }

  function stepSteer(target) {
    const diff = target - steerKey;
    if (diff === 0) return;
    const reversing = steerKey !== 0 && target !== 0 && Math.sign(target) !== Math.sign(steerKey);
    const rate = target === 0 || reversing ? STEER_SNAP : STEER_RAMP;
    const step = rate * DT;
    if (Math.abs(diff) <= step) steerKey = target;
    else steerKey += Math.sign(diff) * step;
  }

  // ---- gamepad ----
  function findPad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads() || [];
    for (let i = 0; i < pads.length; i++) if (pads[i]) return pads[i];
    return null;
  }

  function padBtn(pad, i) {
    const b = pad.buttons && pad.buttons[i];
    return !!b && (b.pressed || b.value > 0.5);
  }

  function readPadAction(pad, name) {
    if (name === 'throwBack') {
      return !!pad.axes && (pad.axes[PAD_STICK_Y] || 0) > 0.5;
    }
    if (name === 'drift') {
      const r2 = pad.buttons && pad.buttons[PAD_R2];
      if (r2 && r2.value > 0.3) return true;
    }
    const list = PAD[name];
    if (!list) return false;
    for (let i = 0; i < list.length; i++) if (padBtn(pad, list[i])) return true;
    return false;
  }
})();
