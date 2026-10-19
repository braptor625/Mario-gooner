// Input: keyboard + standard gamepad -> per-player state. Polled once per fixed 1/60 s step.
// G.Input.state is an alias of G.Input.players[0].state (v1 compatible).
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  const DT = 1 / 60;
  const DEADZONE = 0.15;
  const STEER_RAMP = 8;   // units/s toward a held direction
  const STEER_SNAP = 12;  // units/s back to centre / when reversing
  const MAX_PLAYERS = 4;
  const MAX_PADS = 4;
  const PAD_BUTTONS = 32;

  // keyboard binding sets, by KeyboardEvent.code
  const KB = {
    // single player: every keyboard key from v1
    kbfull: {
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
      slap: ['KeyF'],
    },
    // left hand (player 1 fallback)
    kb1: {
      accel: ['KeyW'],
      brake: ['KeyS'],
      left: ['KeyA'],
      right: ['KeyD'],
      drift: ['ShiftLeft'],
      item: ['KeyE'],
      swap: ['KeyQ'],
      pause: ['Escape'],
      lookBack: ['KeyC'],
      throwBack: ['KeyS'],
      slap: ['KeyF'],
    },
    // right hand (player 2 fallback)
    kb2: {
      accel: ['ArrowUp'],
      brake: ['ArrowDown'],
      left: ['ArrowLeft'],
      right: ['ArrowRight'],
      drift: ['ShiftRight', 'Slash'],
      item: ['Enter', 'Period'],
      swap: ['Comma', 'ControlRight'],
      pause: ['Backspace', 'KeyP'],
      lookBack: ['Numpad0'],
      throwBack: ['ArrowDown'],
      slap: ['KeyN'],   // M is sound mute
    },
  };
  // keys whose default action (page scroll / back-nav) is suppressed outside text fields
  const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Slash', 'Backspace']);

  // standard-mapping gamepad button indices per action
  // Layout for an Xbox controller (standard mapping): A/RT gas, B/LT brake, RB drift (hop),
  // X/LB item, Y swap riders, R3 slap, View look back, Menu pause, D-pad also steers.
  const PAD = {
    accel: [0],        // A (RT handled as analog below)
    brake: [1],        // B (LT handled as analog below)
    item: [2, 4],      // X, LB
    swap: [3],         // Y
    drift: [5],        // RB
    pause: [9],        // Menu / Start
    lookBack: [8],     // View / Back
    slap: [11],        // right stick click
  };
  const PAD_LT = 6;
  const PAD_RT = 7;
  const PAD_DL = 14, PAD_DR = 15, PAD_DD = 13, PAD_DU = 12;
  // Non-"standard" Xbox layouts (e.g. Firefox on Linux, xpad driver): remap raw indices to standard ones.
  // raw: A0 B1 X2 Y3 LB4 RB5 View6 Menu7 Guide8 LS9 RS10; triggers on axes 2/5 (-1..1), d-pad on axes 6/7.
  const XPAD_RAW_TO_STD = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 8, 7: 9, 8: 16, 9: 10, 10: 11 };
  const PAD_STICK_X = 0;
  const PAD_STICK_Y = 1;   // positive = down

  const ACTIONS = ['accel', 'brake', 'item', 'drift', 'swap', 'pause', 'lookBack', 'throwBack', 'slap'];
  const EMPTY_PADS = [];

  const held = new Set();        // codes currently down
  const latchPress = new Set();  // codes pressed (non-repeat keydown) since last poll
  const gpPrev = [];             // per pad index: previous button-down bytes
  for (let i = 0; i < MAX_PADS; i++) gpPrev.push(new Uint8Array(PAD_BUTTONS));
  let inited = false;

  function makeActs() {
    const acts = {};
    for (const name of ACTIONS) acts[name] = { down: false, pressed: false, released: false };
    return acts;
  }

  function makeState() {
    return {
      accel: 0,
      brake: 0,
      steer: 0,
      drift: false,
      item: false,
      itemPressed: false,
      itemReleased: false,
      swapPressed: false,
      slapPressed: false,
      lookBack: false,
      throwBack: false,
      pausePressed: false,
    };
  }

  function makePlayer(i) {
    return {
      index: i,
      state: makeState(),
      device: i === 0 ? 'kbfull' : null,  // 'kbfull' | 'kb1' | 'kb2' | 'pad<N>' | null
      keys: i === 0 ? 'kbfull' : null,    // keyboard binding set in use, or null
      pad: -1,                            // gamepad array index in use, or -1
      act: makeActs(),
      steerKey: 0,
    };
  }

  const players = [];
  for (let i = 0; i < MAX_PLAYERS; i++) players.push(makePlayer(i));

  const api = (G.Input = {
    players,
    state: players[0].state,   // alias, v1 compatible (never reassigned)
    count: 1,
    anyKeyPressed: false,

    init() {
      if (inited) return;
      inited = true;
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onBlur);
    },

    // n = number of local players (1..4). 1P: kbfull + first pad. 2P+: player i uses pad i
    // when connected, else kb1 (P1) / kb2 (P2); players 3-4 need a pad.
    configure(n) {
      n = Math.round(Number(n)) || 1;
      api.count = G.clamp(n, 1, MAX_PLAYERS);
      for (let i = 0; i < MAX_PLAYERS; i++) neutral(players[i]);
      assign(readPads());
    },

    // number of gamepads the browser reports as connected
    connectedPads() {
      const pads = readPads();
      let n = 0;
      for (let i = 0; i < pads.length; i++) if (pads[i]) n++;
      return n;
    },

    // call once per fixed step; updates every active player's state
    poll() {
      const pads = readPads();
      assign(pads);

      // gamepad button edges (any pad, any button) for anyKeyPressed
      let anyPad = false;
      for (let pi = 0; pi < MAX_PADS; pi++) {
        const pad = pads[pi];
        const prev = gpPrev[pi];
        const n = pad && pad.buttons ? Math.min(pad.buttons.length, PAD_BUTTONS) : 0;
        for (let i = 0; i < PAD_BUTTONS; i++) {
          const b = i < n ? pad.buttons[i] : null;
          const down = b && b.pressed ? 1 : 0;
          if (down && !prev[i]) anyPad = true;
          prev[i] = down;
        }
      }
      api.anyKeyPressed = latchPress.size > 0 || anyPad;

      for (let i = 0; i < api.count; i++) pollPlayer(players[i], pads);
      latchPress.clear();
      bridgeMenus(pads, 1 / 60);
    },

    reset() {
      held.clear();
      latchPress.clear();
      for (let i = 0; i < MAX_PADS; i++) gpPrev[i].fill(0);
      for (let i = 0; i < MAX_PLAYERS; i++) neutral(players[i]);
      api.anyKeyPressed = false;
    },
  });

  function neutral(p) {
    for (const name of ACTIONS) {
      const a = p.act[name];
      a.down = a.pressed = a.released = false;
    }
    p.steerKey = 0;
    const s = p.state;
    s.accel = s.brake = s.steer = 0;
    s.drift = s.item = s.lookBack = s.throwBack = false;
    s.itemPressed = s.itemReleased = s.swapPressed = s.slapPressed = s.pausePressed = false;
  }

  // decide which device each active player uses (re-evaluated every poll so pads can hot-plug)
  function assign(pads) {
    const list = [];
    for (let i = 0; i < pads.length && list.length < MAX_PADS; i++) if (pads[i]) list.push(i);
    const count = api.count;
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const p = players[i];
      if (i >= count) {
        p.keys = null;
        p.pad = -1;
        p.device = null;
        continue;
      }
      p.pad = i < list.length ? list[i] : -1;
      if (count === 1) p.keys = 'kbfull';
      else p.keys = p.pad < 0 && i < 2 ? (i === 0 ? 'kb1' : 'kb2') : null;
      if (count === 1) p.device = 'kbfull';
      else if (p.pad >= 0) p.device = 'pad' + p.pad;
      else p.device = p.keys;
    }
  }

  function pollPlayer(p, pads) {
    const map = p.keys ? KB[p.keys] : null;
    const pad = p.pad >= 0 ? pads[p.pad] || null : null;

    for (const name of ACTIONS) {
      const a = p.act[name];
      const codes = map ? map[name] : null;
      const kbHeld = codes ? anyHeld(codes) : false;
      const kbLatched = codes ? anyLatched(codes) : false;
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
    const target = map
      ? (anyHeld(map.right) ? 1 : 0) - (anyHeld(map.left) ? 1 : 0)
      : 0;
    stepSteer(p, target);
    let steer = p.steerKey;
    if (pad && pad.axes) {
      const ax = padStickX(pad);
      if (Math.abs(ax) > DEADZONE) {
        steer = Math.sign(ax) * (Math.abs(ax) - DEADZONE) / (1 - DEADZONE);
      }
    }

    const s = p.state;
    const act = p.act;
    s.steer = G.clamp(steer, -1, 1);
    s.accel = act.accel.down ? 1 : 0;
    // S / Down double as "throw backwards": while the gas is held they only aim the throw and never
    // brake. Controller brake (B / LT) always brakes since throw-back is on the stick there.
    const padBrake = pad ? readPadAction(pad, 'brake') : false;
    const kbBrake = map ? anyHeld(map.brake) : false;
    s.brake = padBrake || (kbBrake && !act.accel.down) ? 1 : 0;
    s.drift = act.drift.down;
    s.item = act.item.down;
    s.itemPressed = act.item.pressed;
    s.itemReleased = act.item.released;
    s.swapPressed = act.swap.pressed;
    s.slapPressed = act.slap.pressed;
    s.pausePressed = act.pause.pressed;
    s.lookBack = act.lookBack.down;
    s.throwBack = act.throwBack.down;
  }

  // ---- keyboard ----
  function isTextTarget(t) {
    if (!t) return false;
    const tag = t.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!t.isContentEditable;
  }

  function onKeyDown(e) {
    const code = e.code;
    if (!code || e._fromPad) return; // synthetic menu keys from the gamepad bridge

    if (PREVENT.has(code) && !isTextTarget(e.target) && e.preventDefault) e.preventDefault();
    held.add(code);
    if (!e.repeat) latchPress.add(code);
  }

  function onKeyUp(e) {
    if (e.code && !e._fromPad) held.delete(e.code);
  }

  function onBlur() {
    held.clear();
    latchPress.clear();
    for (let i = 0; i < MAX_PLAYERS; i++) players[i].steerKey = 0;
  }

  function anyHeld(codes) {
    for (let i = 0; i < codes.length; i++) if (held.has(codes[i])) return true;
    return false;
  }

  function anyLatched(codes) {
    for (let i = 0; i < codes.length; i++) if (latchPress.has(codes[i])) return true;
    return false;
  }

  function stepSteer(p, target) {
    const steerKey = p.steerKey;
    const diff = target - steerKey;
    if (diff === 0) return;
    const reversing = steerKey !== 0 && target !== 0 && Math.sign(target) !== Math.sign(steerKey);
    const rate = target === 0 || reversing ? STEER_SNAP : STEER_RAMP;
    const step = rate * DT;
    if (Math.abs(diff) <= step) p.steerKey = target;
    else p.steerKey = steerKey + Math.sign(diff) * step;
  }

  // ---- gamepad ----
  function readPads() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return EMPTY_PADS;
    return navigator.getGamepads() || EMPTY_PADS;
  }

  // Read a button by its STANDARD index, translating for non-standard (raw xpad) layouts.
  function isStd(pad) { return pad.mapping === 'standard' || !pad.axes || pad.axes.length < 6; }
  function padBtn(pad, i) {
    if (!isStd(pad)) {
      if (i === PAD_LT) return padTrigger(pad, PAD_LT) > 0.5;
      if (i === PAD_RT) return padTrigger(pad, PAD_RT) > 0.5;
      if (i >= 12 && i <= 15) {
        const hx = pad.axes[6] || 0, hy = pad.axes[7] || 0;
        return i === PAD_DL ? hx < -0.5 : i === PAD_DR ? hx > 0.5 : i === PAD_DU ? hy < -0.5 : hy > 0.5;
      }
      for (const raw in XPAD_RAW_TO_STD) {
        if (XPAD_RAW_TO_STD[raw] === i) {
          const b = pad.buttons && pad.buttons[raw];
          return !!b && (b.pressed || b.value > 0.5);
        }
      }
      return false;
    }
    const b = pad.buttons && pad.buttons[i];
    return !!b && (b.pressed || b.value > 0.5);
  }
  // analog trigger 0..1
  function padTrigger(pad, i) {
    if (!isStd(pad)) {
      const a = pad.axes[i === PAD_LT ? 2 : 5];
      return a === undefined ? 0 : (a + 1) / 2; // raw triggers rest at -1
    }
    const b = pad.buttons && pad.buttons[i];
    return b ? b.value || (b.pressed ? 1 : 0) : 0;
  }
  function padStickX(pad) {
    let x = (pad.axes && pad.axes[PAD_STICK_X]) || 0;
    if (Math.abs(x) <= DEADZONE) {
      if (padBtn(pad, PAD_DL)) x = -1;
      else if (padBtn(pad, PAD_DR)) x = 1;
    }
    return x;
  }

  function readPadAction(pad, name) {
    if (name === 'throwBack') {
      return (!!pad.axes && (pad.axes[PAD_STICK_Y] || 0) > 0.5) || padBtn(pad, PAD_DD);
    }
    if (name === 'accel' && padTrigger(pad, PAD_RT) > 0.25) return true;
    if (name === 'brake' && padTrigger(pad, PAD_LT) > 0.25) return true;
    const list = PAD[name];
    if (!list) return false;
    for (let i = 0; i < list.length; i++) if (padBtn(pad, list[i])) return true;
    return false;
  }

  // ---- gamepad -> menu keys bridge ----
  // Menus are keyboard driven; while no race is being driven, translate pad input into synthetic
  // key events (D-pad / left stick = arrows, A = Enter, B = Escape, Menu = Enter).
  const navPrev = {};
  const navRepeat = {};
  function menuActive() {
    const g = G.Game;
    if (!g) return true;
    const st = g.state;
    return st === 'attract' || st === 'boot' || st === 'paused' || st === 'results' || st === 'ceremony';
  }
  function sendKey(code, key, type) {
    let ev;
    try { ev = new KeyboardEvent(type, { code, key, bubbles: true, cancelable: true }); } catch (e) { return; }
    try { Object.defineProperty(ev, '_fromPad', { value: true }); } catch (e) { /* ignore */ }
    (document.activeElement || document.body || document).dispatchEvent(ev);
  }
  let bridgeWasActive = false;
  function bridgeMenus(pads, dt) {
    const active = menuActive();
    // entering a menu (e.g. pause via the Menu button): buttons already held must not "click"
    const priming = active && !bridgeWasActive;
    bridgeWasActive = active;
    for (let pi = 0; pi < pads.length && pi < MAX_PADS; pi++) {
      const pad = pads[pi];
      if (!pad) continue;
      const ax = (pad.axes && pad.axes[PAD_STICK_X]) || 0, ay = (pad.axes && pad.axes[PAD_STICK_Y]) || 0;
      const dirs = {
        ArrowLeft: padBtn(pad, PAD_DL) || ax < -0.6,
        ArrowRight: padBtn(pad, PAD_DR) || ax > 0.6,
        ArrowUp: padBtn(pad, PAD_DU) || ay < -0.6,
        ArrowDown: padBtn(pad, PAD_DD) || ay > 0.6,
        Enter: padBtn(pad, 0) || padBtn(pad, 9),
        Escape: padBtn(pad, 1),
      };
      for (const code in dirs) {
        const k = pi + code, down = active && dirs[code];
        if (priming) { navPrev[k] = down; continue; }
        if (down && !navPrev[k]) {
          sendKey(code, code, 'keydown');
          navRepeat[k] = 0.4;
        } else if (down && code.indexOf('Arrow') === 0) {
          navRepeat[k] -= dt;
          if (navRepeat[k] <= 0) { sendKey(code, code, 'keydown'); navRepeat[k] = 0.12; }
        } else if (!down && navPrev[k]) {
          sendKey(code, code, 'keyup');
        }
        navPrev[k] = down;
      }
    }
  }
})();
