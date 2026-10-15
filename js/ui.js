// TURBO TANDEM — menus + HUD (v2 "Double Dash parity"). All DOM lives inside #ui. Classic script; attaches G.UI and G.HUD.
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  // ------------------------------------------------------------------ helpers
  const $ = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
  const snd = (n) => { try { G.Sound && G.Sound.play && G.Sound.play(n); } catch (e) { /* ignore */ } };
  let soundInit = false;
  const initSound = () => {
    if (soundInit) { try { G.Sound && G.Sound.init && G.Sound.init(); } catch (e) {} return; }
    try { if (G.Sound && G.Sound.init) { G.Sound.init(); soundInit = true; } } catch (e) {}
  };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const pad2 = (n) => (n < 10 ? '0' : '') + n;
  const fmtTime = (t) => {
    if (typeof t === 'string') return t;
    if (t == null || !isFinite(t)) return '--:--.--';
    t = Math.max(0, t);
    const m = Math.floor(t / 60), s = Math.floor(t % 60), cs = Math.floor((t * 100) % 100);
    return pad2(m) + ':' + pad2(s) + '.' + pad2(cs);
  };
  const ordinal = (n) => {
    const m = n % 100;
    if (m >= 11 && m <= 13) return 'th';
    return ['th', 'st', 'nd', 'rd'][n % 10 > 3 ? 0 : n % 10] || 'th';
  };
  const css = (c, d) => {
    if (c == null) return d || '#888';
    if (typeof c === 'number') return '#' + ('000000' + (c >>> 0).toString(16)).slice(-6);
    return String(c);
  };
  const chars = () => G.CHARACTERS || [];
  const charById = (id) => chars().find((c) => c.id === id) || null;
  const charName = (id) => { const c = charById(id); return c ? c.name : (id || '—'); };
  const prettify = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const itemName = (id) => (G.ITEMS && G.ITEMS[id] && G.ITEMS[id].name) || prettify(id);
  const WEIGHT_ORDER = { light: 0, medium: 1, heavy: 2 };
  const pairWeight = (a, b) => {
    try { if (G.Characters && G.Characters.kartWeight) return G.Characters.kartWeight(a, b); } catch (e) {}
    const wa = (charById(a) || {}).weight || 'medium', wb = (charById(b) || {}).weight || 'medium';
    return WEIGHT_ORDER[wa] >= WEIGHT_ORDER[wb] ? wa : wb;
  };
  const portraitCache = {};
  const portrait = (id) => {
    try { if (G.Characters && G.Characters.buildPortrait) return G.Characters.buildPortrait(id); } catch (e) {}
    const c = $('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), ch = charById(id);
    x.fillStyle = css(ch && ch.colors && ch.colors.primary, '#4a8cff'); x.fillRect(0, 0, 128, 128);
    return c;
  };
  const portraitSrc = (id) => portraitCache[id] || (portraitCache[id] = portrait(id));
  const faceInto = (cv, id) => {
    const x = cv.getContext('2d');
    x.clearRect(0, 0, cv.width, cv.height);
    if (!id) return;
    try { x.drawImage(portraitSrc(id), 0, 0, cv.width, cv.height); } catch (e) {}
  };
  const setText = (el, t) => { el.textContent = t; return el; };

  // saves (defensive: no G.Save => everything unlocked)
  const SV = () => G.Save || null;
  const unlocked = (key) => { try { const s = SV(); if (s && s.isUnlocked) return !!s.isUnlocked(key); } catch (e) {} return true; };
  const charOpen = (c) => !c || !c.locked || unlocked('char:' + c.id);
  const kartOpen = (k) => !k || !k.locked || unlocked('kart:' + k.id);
  const settings = () => { const s = SV(); return (s && s.settings) || (G._uiSettings = G._uiSettings || { musicVol: 0.7, sfxVol: 0.8, itemFreq: 'normal' }); };
  const persist = () => { try { const s = SV(); s && s.persist && s.persist(); } catch (e) {} };

  const PCOL = ['#ff4655', '#3b9bff', '#ffd23c', '#3ddc6f'];
  const PNAME = ['P1', 'P2', 'P3', 'P4'];

  const ICONS = {
    lock: '<svg class="lockic" viewBox="0 0 48 56"><path d="M12 24V16a12 12 0 0 1 24 0v8" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/><rect x="5" y="22" width="38" height="30" rx="8" fill="#ffd23c" stroke="#1a1f5c" stroke-width="4"/><circle cx="24" cy="36" r="4.5" fill="#1a1f5c"/><rect x="22" y="38" width="4" height="8" rx="2" fill="#1a1f5c"/></svg>',
    trophy: '<svg class="ico" viewBox="0 0 64 64"><path d="M16 8h32v16c0 10-7 17-16 17S16 34 16 24z" fill="#FFD21F" stroke="#1a1f5c" stroke-width="4" stroke-linejoin="round"/><path d="M16 14H6c0 10 4 15 11 16M48 14h10c0 10-4 15-11 16" fill="none" stroke="#1a1f5c" stroke-width="4" stroke-linecap="round"/><path d="M28 41h8v8h-8z" fill="#ff8a1e" stroke="#1a1f5c" stroke-width="4"/><path d="M18 50h28v8H18z" fill="#7a3cff" stroke="#1a1f5c" stroke-width="4" stroke-linejoin="round"/><path d="M26 14v12" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>',
    clock: '<svg class="ico" viewBox="0 0 64 64"><rect x="26" y="3" width="12" height="7" rx="2" fill="#1a1f5c"/><circle cx="32" cy="36" r="24" fill="#2ee6ff" stroke="#1a1f5c" stroke-width="4"/><circle cx="32" cy="36" r="17" fill="#fff" stroke="#1a1f5c" stroke-width="3"/><path d="M32 36V23M32 36l9 6" stroke="#ff8a1e" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="36" r="3" fill="#1a1f5c"/></svg>',
    flag: '<svg class="ico" viewBox="0 0 64 64"><path d="M14 8v50" stroke="#1a1f5c" stroke-width="6" stroke-linecap="round"/><path d="M17 10c10-5 16 5 28 0v26c-12 5-18-5-28 0z" fill="#fff" stroke="#1a1f5c" stroke-width="4" stroke-linejoin="round"/><path d="M17 10h7v8h-7zM31 10h7v8h-7zM24 18h7v9h-7zM38 18h7v9h-7zM17 27h7v9h-7zM31 27h7v9h-7z" fill="#1a1f5c" opacity=".9"/></svg>',
    versus: '<svg class="ico" viewBox="0 0 64 64"><rect x="4" y="8" width="26" height="22" rx="5" fill="#ff4655" stroke="#1a1f5c" stroke-width="4"/><rect x="34" y="34" width="26" height="22" rx="5" fill="#3b9bff" stroke="#1a1f5c" stroke-width="4"/><path d="M36 10l14 0M36 18l14 0M14 40l14 0M14 48l14 0" stroke="#1a1f5c" stroke-width="4" stroke-linecap="round"/></svg>',
    battle: '<svg class="ico" viewBox="0 0 64 64"><circle cx="22" cy="22" r="15" fill="#ff5ab0" stroke="#1a1f5c" stroke-width="4"/><circle cx="44" cy="26" r="13" fill="#ffd23c" stroke="#1a1f5c" stroke-width="4"/><circle cx="30" cy="44" r="13" fill="#3ddc6f" stroke="#1a1f5c" stroke-width="4"/><path d="M17 15a8 8 0 0 1 7-3" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M30 57l-2 6M22 36l-3 8" stroke="#1a1f5c" stroke-width="3" stroke-linecap="round"/></svg>',
    records: '<svg class="ico" viewBox="0 0 64 64"><rect x="10" y="6" width="44" height="52" rx="8" fill="#fff" stroke="#1a1f5c" stroke-width="4"/><path d="M20 20h24M20 30h24M20 40h14" stroke="#7a3cff" stroke-width="5" stroke-linecap="round"/><circle cx="46" cy="46" r="10" fill="#ffd23c" stroke="#1a1f5c" stroke-width="4"/><path d="M46 41v6l4 2" stroke="#1a1f5c" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
    options: '<svg class="ico" viewBox="0 0 64 64"><circle cx="32" cy="32" r="12" fill="#fff" stroke="#1a1f5c" stroke-width="4"/><path d="M32 4v10M32 50v10M4 32h10M50 32h10M12 12l7 7M45 45l7 7M12 52l7-7M45 19l7-7" stroke="#1a1f5c" stroke-width="8" stroke-linecap="round"/><path d="M32 4v10M32 50v10M4 32h10M50 32h10M12 12l7 7M45 45l7 7M12 52l7-7M45 19l7-7" stroke="#ffd23c" stroke-width="3" stroke-linecap="round"/></svg>',
    arrow: '<svg viewBox="0 0 48 48"><path d="M4 18h24V6l16 18-16 18V30H4z" fill="#fff" stroke="#1a1f5c" stroke-width="4" stroke-linejoin="round"/></svg>',
    star: '<svg viewBox="0 0 48 48"><path d="M24 3l6 13 14 2-10 10 3 14-13-7-13 7 3-14L4 18l14-2z" fill="#ffd23c" stroke="#1a1f5c" stroke-width="3" stroke-linejoin="round"/></svg>',
    balloon: '<svg viewBox="0 0 40 52"><ellipse cx="20" cy="20" rx="16" ry="18" fill="currentColor" stroke="#1a1f5c" stroke-width="3.5"/><path d="M14 10a10 10 0 0 1 7-3" stroke="#fff" stroke-width="3.5" stroke-linecap="round" fill="none" opacity=".85"/><path d="M16 38l4 5 4-5z" fill="currentColor" stroke="#1a1f5c" stroke-width="3" stroke-linejoin="round"/><path d="M20 43c-3 3 3 5 0 9" stroke="#1a1f5c" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>',
    shine: '<svg viewBox="0 0 48 48"><path d="M24 2l5 14 15 1-12 9 4 15-12-9-12 9 4-15L4 17l15-1z" fill="#fff25a" stroke="#1a1f5c" stroke-width="3" stroke-linejoin="round"/></svg>',
    bomb: '<svg viewBox="0 0 48 48"><circle cx="22" cy="28" r="16" fill="#2a2d55" stroke="#1a1f5c" stroke-width="3.5"/><path d="M32 14l6-6" stroke="#1a1f5c" stroke-width="4" stroke-linecap="round"/><circle cx="40" cy="6" r="4" fill="#ff8a1e"/><path d="M14 22a9 9 0 0 1 6-5" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/></svg>',
  };

  // ------------------------------------------------------------------ state
  let root = null, menuLayer = null, menuBox = null, hudLayer = null, ovlLayer = null;
  let active = null;      // current menu screen
  let ovl = null;         // current overlay handler (results / pause / gp final) — takes key priority
  let inited = false;
  const F = {
    mode: 'gp', n: 1, coop: false, cc: 100, picks: [], cup: null, track: null, arena: null, battleType: 'balloon',
    itemFreq: 'normal', cpu: true, ghost: true, step: 0, kartIdx: 0,
  };

  // ------------------------------------------------------------------ menu engine
  function destroyActive() {
    if (active && active.destroy) { try { active.destroy(); } catch (e) {} }
    active = null;
  }
  function clearMenus() { menuBox.innerHTML = ''; }
  function refreshIdx(scr, silent) {
    scr.items.forEach((it, i) => it.classList.toggle('on', i === scr.idx));
    if (!silent) snd('menu_move');
    const cur = scr.items[scr.idx];
    if (cur && cur.scrollIntoView && scr.scrollFocus) { try { cur.scrollIntoView({ block: 'nearest' }); } catch (e) {} }
    if (scr.onFocus) scr.onFocus(scr.idx);
  }
  function setIdx(scr, i, silent) {
    if (i === scr.idx && silent !== true) return;
    scr.idx = i;
    refreshIdx(scr, silent);
  }
  function mount(scr) {
    destroyActive();
    clearMenus();
    menuLayer.classList.remove('hidden');
    menuBox.appendChild(scr.el);
    active = scr;
    scr.idx = clamp(scr.idx || 0, 0, Math.max(0, scr.items.length - 1));
    scr.items.forEach((it, i) => {
      it.addEventListener('pointerenter', () => { if (active === scr && !ovl) setIdx(scr, i); });
      it.addEventListener('click', () => {
        if (active !== scr || ovl) return;
        scr.idx = i; refreshIdx(scr, true);
        snd('menu_select');
        scr.pick(i);
      });
    });
    if (scr.items.length) refreshIdx(scr, true);
    if (scr.start) scr.start();
  }
  function moveIdx(scr, act) {
    const n = scr.items.length, c = scr.cols || 1;
    if (!n) return;
    let i = scr.idx;
    if (act === 'left') { if (c > 1) i = Math.max(0, i - 1); }
    else if (act === 'right') { if (c > 1) i = Math.min(n - 1, i + 1); }
    else if (act === 'up') { if (i - c >= 0) i -= c; }
    else if (act === 'down') {
      if (i + c < n) i += c;
      else if (Math.floor(i / c) < Math.floor((n - 1) / c)) i = n - 1;
    }
    setIdx(scr, i);
  }
  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    Enter: 'ok', NumpadEnter: 'ok', Space: 'ok', Escape: 'back', Backspace: 'back',
  };
  function onKeyDown(e) {
    initSound();
    const act = KEYMAP[e.code];
    if (!act) return;
    if (ovl) {
      if (ovl.key) { if (!(e.repeat && (act === 'ok' || act === 'back'))) ovl.key(act); }
      e.preventDefault();
      return;
    }
    if (!active || menuLayer.classList.contains('hidden')) return;
    e.preventDefault();
    if (act === 'ok') {
      if (e.repeat) return;
      if (active.items.length) { snd('menu_select'); active.pick(active.idx); }
      else if (active.pick) { snd('menu_select'); active.pick(0); }
    } else if (act === 'back') {
      if (e.repeat) return;
      if (active.back) { snd('menu_back'); active.back(); }
    } else {
      if (active.onKey && active.onKey(act)) return;
      moveIdx(active, act);
    }
  }

  function screenEl(cls, title, sub, hint) {
    const el = $('section', 'screen ' + (cls || ''));
    if (title) {
      const head = $('div', 'screen-head');
      const hd = $('div', 'hd', '<h1></h1>' + (sub ? '<small></small>' : ''));
      hd.querySelector('h1').textContent = title;
      if (sub) hd.querySelector('small').textContent = sub;
      head.appendChild(hd);
      el.appendChild(head);
      el._head = head;
    }
    if (hint !== false) {
      el.appendChild($('div', 'nav-hint', hint || '<span><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> Move</span><span><kbd>Enter</kbd> Select</span><span><kbd>Esc</kbd> Back</span>'));
    }
    return el;
  }
  const lockBadge = () => $('div', 'lockov', ICONS.lock);
  const shakeEl = (el) => { snd('menu_back'); el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); };

  // ------------------------------------------------------------------ course / cup data
  const CUP_STYLE = {
    mushroom: { c: '#ff4d5a', c2: '#ff9a5a', ic: '🍄' },
    flower: { c: '#ff5ab0', c2: '#ffb347', ic: '✿' },
    star: { c: '#ffc72c', c2: '#ff8a1e', ic: '★' },
    special: { c: '#7a3cff', c2: '#3b9bff', ic: '✦' },
    allcup: { c: '#19c37d', c2: '#2ee6ff', ic: '♛' },
  };
  const CUP_DEFAULT_NAMES = { mushroom: 'Mushroom Cup', flower: 'Flower Cup', star: 'Star Cup', special: 'Special Cup', allcup: 'All-Cup Tour' };
  const cupStyle = (id, i) => CUP_STYLE[id] || { c: ['#ff4d5a', '#ff5ab0', '#ffc72c', '#7a3cff'][(i || 0) % 4], c2: '#3b9bff', ic: '★' };
  function cupList() {
    let cups = (G.CUPS || []).slice();
    if (!cups.length) {
      const seen = [];
      (G.TRACKS || []).forEach((t) => { if (t.cup && seen.indexOf(t.cup) < 0) seen.push(t.cup); });
      cups = seen.map((id) => ({ id, name: CUP_DEFAULT_NAMES[id] || prettify(id) }));
    }
    cups = cups.filter((c) => c.id !== 'allcup');
    return cups;
  }
  function tracksOfCup(cupId) {
    const all = G.TRACKS || [];
    if (cupId === 'allcup') {
      const cl = cupList();
      let out = [];
      cl.forEach((c) => { out = out.concat(tracksOfCup(c.id)); });
      return out;
    }
    let ts = all.filter((t) => t.cup === cupId).sort((a, b) => (a.order || 0) - (b.order || 0));
    if (!ts.length) {
      const c = (G.CUPS || []).find((x) => x.id === cupId);
      if (c && c.tracks) ts = c.tracks.map((id) => all.find((t) => t.id === id)).filter(Boolean);
    }
    return ts;
  }
  const cupOpen = (id) => (id === 'special' || id === 'allcup') ? unlocked('cup:' + id) : true;
  const trackById = (id) => (G.TRACKS || []).find((t) => t.id === id) || null;
  const col1 = (v, d) => { if (Array.isArray(v)) v = v[0]; return css(v, d); };
  const THEMES = { meadow: 1, dunes: 1, glacier: 1, starlight: 1 };
  function thumbEl(t, cls) {
    const th = $('div', 'thumb ' + (cls || ''));
    const p = t && t.preview;
    if (p && (p.sky || p.ground)) {
      const sky = Array.isArray(p.sky) ? p.sky : [p.sky || '#59c8ff', p.sky || '#c8f0ff'];
      const a = css(sky[0], '#59c8ff'), b = css(sky[sky.length > 1 ? 1 : 0], a);
      const gr = col1(p.ground, '#3fbf4a'), rd = col1(p.road, '#5a5a6e');
      th.style.background = 'linear-gradient(180deg,' + a + ',' + b + ' 52%,' + gr + ' 52%)';
      th.appendChild($('div', 'rd')).style.background = rd;
    } else {
      const key = t && (THEMES[t.theme] ? t.theme : THEMES[t.id] ? t.id : null);
      th.classList.add(key || 'unk');
      th.appendChild($('div', 'rd'));
    }
    return th;
  }

  // ------------------------------------------------------------------ launching
  function playerList() {
    const base = F.picks.slice(0, F.coop ? 1 : F.n).map((p) => ({ front: p.front, rear: p.rear, kart: p.kart }));
    if (F.coop && F.n === 2) base.push({ front: null, rear: null, kart: null });
    return base;
  }
  function launch(extra) {
    const players = playerList();
    const p0 = players[0] || {};
    const config = Object.assign({
      mode: F.mode, cc: F.cc, players, coop: !!(F.coop && F.n === 2),
      cup: null, track: null, arena: null, battleType: null,
      itemFreq: F.itemFreq, cpu: F.mode === 'gp' ? true : F.mode === 'tt' ? false : !!F.cpu,
      ghost: F.mode === 'tt' ? !!F.ghost : false,
      front: p0.front, rear: p0.rear, kart: p0.kart,
    }, extra || {});
    if (F.mode === 'battle') { config.arena = F.arena; config.battleType = F.battleType; }
    if (F.mode !== 'gp' && F.mode !== 'battle' && config.track && !config.cup) { const t = trackById(config.track); if (t) config.cup = t.cup; }
    if (config.cup == null) delete config.cup;
    if (config.track == null) delete config.track;
    if (config.arena == null) delete config.arena;
    if (config.battleType == null) delete config.battleType;
    G.UI.hideMenus();
    if (G.Game && G.Game.start) G.Game.start(config);
    else console.log('G.Game.start', JSON.stringify(config));
  }

  // ------------------------------------------------------------------ title
  function showTitle() {
    G.UI.init();
    hideOverlays();
    try { G.Sound && G.Sound.playMusic && G.Sound.playMusic('menu'); } catch (e) {}
    const el = $('section', 'screen title');
    const logo = $('div', 'logo');
    const spans = (t, o) => t.split('').map((ch, i) => '<span style="--i:' + (i + o) + '">' + ch + '</span>').join('');
    logo.innerHTML = '<span class="l1">' + spans('TURBO', 0) + '</span><span class="l2">' + spans('TANDEM', 5) + '</span>';
    el.appendChild(logo);
    el.appendChild($('div', 'subtitle', '<span>DOUBLE TROUBLE GRAND PRIX</span>'));
    el.appendChild($('div', 'press', 'PRESS ENTER / CLICK TO START'));
    el.appendChild($('div', 'sticker', '<div>2 RIDERS<em>1</em>KART</div>'));
    const scr = { el, items: [], cols: 1, idx: 0, pick: () => showMain() };
    el.addEventListener('click', () => { if (active === scr && !ovl) { initSound(); snd('menu_select'); showMain(); } });
    mount(scr);
  }

  // ------------------------------------------------------------------ main menu
  function showMain() {
    const el = screenEl('main', 'MAIN MENU', 'choose how to race');
    const grid = $('div', 'main-grid');
    const defs = [
      { id: 'gp', t: 'GRAND PRIX', s: 'Cups · points · trophies', ic: 'trophy', c: '#ff8a1e', c2: '#ffc72c' },
      { id: 'tt', t: 'TIME TRIAL', s: 'Beat the clock & ghosts', ic: 'clock', c: '#19b6f0', c2: '#5fe3ff' },
      { id: 'vs', t: 'VERSUS', s: '2–4 players, any course', ic: 'versus', c: '#ff4d5a', c2: '#ff8a7a' },
      { id: 'battle', t: 'BATTLE', s: 'Balloons · Shine · Bombs', ic: 'battle', c: '#ff5ab0', c2: '#ffa0d6' },
      { id: 'records', t: 'RECORDS', s: 'Best times & laps', ic: 'records', c: '#7a3cff', c2: '#a98bff' },
      { id: 'options', t: 'OPTIONS', s: 'Sound · save data', ic: 'options', c: '#2fbf5f', c2: '#7be39a' },
    ];
    const items = defs.map((d) => {
      const b = $('div', 'btn', ICONS[d.ic] + '<div class="tx"><b>' + d.t + '</b><i>' + d.s + '</i></div>');
      b.style.setProperty('--c', d.c); b.style.setProperty('--c2', d.c2);
      grid.appendChild(b);
      return b;
    });
    el.appendChild(grid);
    const idx = Math.max(0, defs.findIndex((d) => d.id === F.mode));
    mount({
      el, items, cols: 2, idx,
      pick(i) {
        const id = defs[i].id;
        if (id === 'records') return showRecords();
        if (id === 'options') return showOptions();
        F.mode = id;
        F.itemFreq = settings().itemFreq || 'normal';
        if (id === 'gp') { F.n = clamp(F.n, 1, 2); }
        else if (id === 'vs') { F.n = clamp(F.n, 2, 4); }
        else if (id === 'battle') { F.n = clamp(F.n, 1, 4); }
        else { F.n = 1; F.coop = false; }
        if (F.n !== 2) F.coop = false;
        showSetup(0);
      },
      back: showTitle,
    });
  }

  // ------------------------------------------------------------------ generic option rows screen
  function rowsScreen(opts) {
    const el = screenEl(opts.cls || 'rows', opts.title, opts.sub);
    const list = $('div', 'rows');
    const rows = opts.rows;
    const items = rows.map((r) => {
      const row = $('div', 'row ' + (r.type || 'choice') + (r.cls ? ' ' + r.cls : ''));
      row.appendChild($('div', 'rl', '')).textContent = r.label || '';
      if (r.type === 'slider') {
        row.appendChild($('div', 'slider', '<div class="trk"><i></i></div><b></b>'));
      } else if (r.type === 'button') {
        row.classList.add('rbtn');
        if (r.sub) row.appendChild($('div', 'rs')).textContent = r.sub;
      } else {
        const ch = $('div', 'chips');
        r.choices.forEach((c) => {
          const chip = $('span', 'chip');
          chip.textContent = c.t;
          if (c.lock) chip.appendChild($('em', 'lk', ICONS.lock));
          chip.addEventListener('click', (e) => { e.stopPropagation(); if (c.lock) return shakeEl(chip); r.set(c.v); snd('menu_select'); opts.changed && opts.changed(r); });
          ch.appendChild(chip);
        });
        row.appendChild(ch);
      }
      list.appendChild(row);
      return row;
    });
    el.appendChild(list);
    const paint = () => {
      rows.forEach((r, i) => {
        const row = items[i];
        if (r.type === 'slider') {
          const v = r.get();
          row.querySelector('.trk i').style.width = Math.round(v * 100) + '%';
          row.querySelector('b').textContent = Math.round(v * 100);
        } else if (r.type !== 'button') {
          const cur = r.get();
          row.querySelectorAll('.chip').forEach((chip, ci) => chip.classList.toggle('sel', r.choices[ci].v === cur));
        }
        if (r.paint) r.paint(row);
      });
    };
    paint();
    const scr = {
      el, items, cols: 1, idx: opts.idx || 0,
      pick(i) {
        const r = rows[i];
        if (r.type === 'button') { r.onPick && r.onPick(row2el(i)); return; }
        if (r.type === 'slider') return;
        if (i < rows.length - 1) setIdx(scr, i + 1);
      },
      onKey(act) {
        if (act !== 'left' && act !== 'right') return false;
        const r = rows[scr.idx], d = act === 'left' ? -1 : 1;
        if (r.type === 'slider') {
          r.set(clamp(Math.round((r.get() + d * 0.1) * 10) / 10, 0, 1)); paint(); snd('menu_move');
          return true;
        }
        if (r.type === 'choice') {
          const cs = r.choices; let ci = cs.findIndex((c) => c.v === r.get());
          let n = ci;
          do { n += d; } while (n >= 0 && n < cs.length && cs[n].lock);
          if (n < 0 || n >= cs.length) return true;
          r.set(cs[n].v); snd('menu_move'); paint(); opts.changed && opts.changed(r, scr.idx);
          return true;
        }
        return false;
      },
      back: opts.back,
      repaint: paint,
    };
    const row2el = (i) => items[i];
    mount(scr);
    return scr;
  }

  // ------------------------------------------------------------------ setup (players / options)
  const FREQ = [{ v: 'few', t: 'FEW' }, { v: 'normal', t: 'NORMAL' }, { v: 'many', t: 'MANY' }];
  const ONOFF = (on, off) => [{ v: true, t: on || 'ON' }, { v: false, t: off || 'OFF' }];
  function showSetup(idx) {
    const m = F.mode;
    const title = { gp: 'GRAND PRIX', tt: 'TIME TRIAL', vs: 'VERSUS', battle: 'BATTLE' }[m];
    const rows = [];
    const rowPlayers = (lo, hi) => {
      const cs = []; for (let i = lo; i <= hi; i++) cs.push({ v: i, t: i + 'P' });
      return { label: 'PLAYERS', choices: cs, get: () => F.n, set: (v) => { F.n = v; if (v !== 2) F.coop = false; } };
    };
    if (m === 'gp') rows.push(rowPlayers(1, 2));
    if (m === 'vs') rows.push(rowPlayers(2, 4));
    if (m === 'battle') rows.push(rowPlayers(1, 4));
    if ((m === 'gp' || m === 'vs') && F.n === 2) {
      rows.push({ label: 'KARTS', choices: [{ v: false, t: 'SEPARATE KARTS' }, { v: true, t: 'SAME KART (CO-OP)' }], get: () => F.coop, set: (v) => { F.coop = v; } });
    }
    if (m === 'tt') rows.push({ label: 'GHOST', choices: ONOFF('RACE GHOST', 'NO GHOST'), get: () => F.ghost, set: (v) => { F.ghost = v; } });
    if (m === 'vs' || m === 'battle') rows.push({ label: 'CPU RACERS', choices: ONOFF('FILL WITH CPU', 'HUMANS ONLY'), get: () => F.cpu, set: (v) => { F.cpu = v; } });
    if (m !== 'tt') rows.push({ label: 'ITEMS', choices: FREQ, get: () => F.itemFreq, set: (v) => { F.itemFreq = v; } });
    rows.push({ type: 'button', label: 'NEXT', cls: 'go', onPick: () => afterSetup() });
    const subs = { gp: 'players & teams', tt: 'ghost settings', vs: 'players, items & CPU', battle: 'players & items' };
    rowsScreen({
      cls: 'setup', title, sub: subs[m], rows, idx: idx || 0,
      changed(r) {
        const i = rows.indexOf(r);
        if (r.label === 'PLAYERS' || r.label === 'KARTS') showSetup(i);
      },
      back: showMain,
    });
  }
  function afterSetup() {
    if (F.mode === 'tt') { F.cc = unlocked('cc:150') ? 150 : 100; return startChars(false); }
    if (F.mode === 'battle') { F.cc = 100; return showBattleType(); }
    showCC();
  }

  // ------------------------------------------------------------------ cc
  function showCC() {
    const el = screenEl('cc', 'ENGINE CLASS', 'faster engine, tougher rivals');
    const row = $('div', 'cc-row');
    const defs = [
      { cc: 50, big: '50', nm: '50cc', sub: 'RELAXED', c: '#2fbf5f', c2: '#8ff0a8', key: null },
      { cc: 100, big: '100', nm: '100cc', sub: 'STANDARD', c: '#ffb41f', c2: '#ffe37a', key: null },
      { cc: 150, big: '150', nm: '150cc', sub: 'BLAZING', c: '#ff4d5a', c2: '#ff9a8a', key: 'cc:150' },
      { cc: 'mirror', big: '<span class="mir">150</span>', nm: 'MIRROR', sub: 'FLIPPED COURSES', c: '#7a3cff', c2: '#b79cff', key: 'cc:mirror' },
    ];
    const items = defs.map((d) => {
      const lock = d.key && !unlocked(d.key);
      const card = $('div', 'card cc-card' + (lock ? ' locked' : ''), '<div class="in"><div class="gauge"><span class="lines"></span></div><div class="big">' + d.big + '<small>cc</small></div><div class="nm">' + d.nm + '</div><div class="sub">' + d.sub + '</div></div>');
      card.style.setProperty('--c', d.c); card.style.setProperty('--c2', d.c2);
      if (lock) card.appendChild(lockBadge());
      row.appendChild(card);
      return card;
    });
    el.appendChild(row);
    mount({
      el, items, cols: 4, idx: Math.max(0, defs.findIndex((d) => d.cc === F.cc)),
      pick(i) {
        const d = defs[i];
        if (d.key && !unlocked(d.key)) return shakeEl(items[i]);
        F.cc = d.cc; startChars(false);
      },
      back() { showSetup(0); },
    });
  }

  // ------------------------------------------------------------------ battle type + arena
  function showBattleType() {
    const el = screenEl('btype', 'BATTLE', 'choose a game');
    const row = $('div', 'cc-row');
    const defs = [
      { v: 'balloon', t: 'BALLOON BATTLE', s: 'Pop rivals\' balloons. Last kart standing wins.', ic: 'balloon', c: '#ff5ab0', c2: '#ffa0d6' },
      { v: 'shine', t: 'SHINE THIEF', s: 'Grab the Shine and hold it the longest.', ic: 'shine', c: '#ffc72c', c2: '#fff25a' },
      { v: 'bomb', t: 'BOMB BLAST', s: 'Bombs from every box. Score hits to win.', ic: 'bomb', c: '#ff6a2a', c2: '#ffb37a' },
    ];
    const items = defs.map((d) => {
      const card = $('div', 'card cc-card btcard', '<div class="in"><div class="bicon">' + ICONS[d.ic] + '</div><div class="nm">' + d.t + '</div><div class="sub">' + d.s + '</div></div>');
      card.style.setProperty('--c', d.c); card.style.setProperty('--c2', d.c2);
      row.appendChild(card);
      return card;
    });
    el.appendChild(row);
    mount({
      el, items, cols: 3, idx: Math.max(0, defs.findIndex((d) => d.v === F.battleType)),
      pick(i) { F.battleType = defs[i].v; showArenas(); },
      back() { showSetup(0); },
    });
  }
  function showArenas() {
    const arenas = G.ARENAS || [];
    const el = screenEl('arenas', 'ARENA', 'where do we battle?');
    const row = $('div', 'arena-grid');
    const cols = ['#ff5ab0', '#2ee6ff', '#ffc72c', '#7a3cff', '#2fbf5f'];
    const items = arenas.map((a, i) => {
      const card = $('div', 'card arena-card', '<div class="in"><div class="athumb"></div><div class="nm"></div></div>');
      card.style.setProperty('--c', cols[i % cols.length]);
      card.querySelector('.nm').textContent = a.name || prettify(a.id);
      row.appendChild(card);
      return card;
    });
    if (!arenas.length) row.appendChild($('div', 'empty', 'NO ARENAS'));
    el.appendChild(row);
    mount({
      el, items, cols: Math.max(1, Math.min(4, items.length)), idx: Math.max(0, arenas.findIndex((a) => a.id === F.arena)),
      pick(i) { if (!arenas[i]) return; F.arena = arenas[i].id; startChars(false); },
      back: showBattleType,
    });
  }

  // ------------------------------------------------------------------ character select (sequential turns)
  function charSteps() {
    const n = F.coop ? 1 : F.n, out = [];
    for (let p = 0; p < n; p++) { out.push({ p, role: 'front' }); out.push({ p, role: 'rear' }); }
    return out;
  }
  function backFromChars() {
    if (F.mode === 'tt') return showSetup(0);
    if (F.mode === 'battle') return showArenas();
    showCC();
  }
  function startChars(resume) {
    if (!resume) { F.picks = []; for (let i = 0; i < 4; i++) F.picks.push({ front: null, rear: null, kart: null }); F.step = 0; }
    showChars();
  }
  function showChars() {
    const list = chars();
    const steps = charSteps();
    const el = $('section', 'screen chars');
    const top = $('div', 'char-top');
    const sub = F.n > 1 && !F.coop ? 'players take turns · driver then thrower' : F.coop ? 'co-op · pick your pair' : 'driver steers · thrower slings items';
    top.innerHTML = '<div class="hd"><h1>PICK YOUR RIDERS</h1><small></small></div>';
    top.querySelector('small').textContent = sub;
    const slots = $('div', 'slots');
    const nP = F.coop ? 1 : F.n;
    const slotEls = [];
    for (let p = 0; p < nP; p++) {
      const s = $('div', 'pslot', '<div class="ptag"></div><div class="pr d"><div class="pic q">?</div><i>DRIVER</i></div><div class="pr t"><div class="pic q">?</div><i>THROWER</i></div>');
      s.style.setProperty('--pc', PCOL[p]);
      s.querySelector('.ptag').textContent = F.coop ? 'CO-OP' : PNAME[p];
      slots.appendChild(s); slotEls.push(s);
    }
    top.appendChild(slots);
    el.appendChild(top);
    const grid = $('div', 'char-grid');
    const items = [];
    list.forEach((c) => {
      const lock = !charOpen(c);
      const card = $('div', 'card pcard' + (lock ? ' locked' : ''), '<div class="in"><div class="pt"></div><div class="nm"></div><span class="badge ' + c.weight + '"></span></div>');
      card.querySelector('.pt').appendChild(lock ? $('div', 'q', '?') : portrait(c.id));
      card.querySelector('.nm').textContent = lock ? '???' : c.name;
      card.querySelector('.badge').textContent = c.weight;
      if (lock) card.appendChild(lockBadge());
      grid.appendChild(card); items.push(card);
    });
    const rnd = $('div', 'card rand-card', '<div class="in"><span class="dice"></span>RANDOM<span class="dice"></span></div>');
    grid.appendChild(rnd); items.push(rnd);
    el.appendChild(grid);
    const info = $('div', 'char-info', '<div class="ci-nm"></div><div class="ci-tag"></div><div class="ci-sp"></div>');
    el.appendChild(info);
    el.appendChild($('div', 'nav-hint', '<span><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> Move</span><span><kbd>Enter</kbd> Pick</span><span><kbd>Esc</kbd> Undo / Back</span>'));

    const taken = () => { const t = {}; steps.forEach((s) => { const id = F.picks[s.p][s.role]; if (id) t[id] = s; }); return t; };
    const cur = () => steps[F.step] || null;
    const refresh = () => {
      const tk = taken(), st = cur();
      slotEls.forEach((s, p) => {
        ['front', 'rear'].forEach((role, ri) => {
          const pr = s.children[ri + 1], pic = pr.querySelector('.pic'), id = F.picks[p][role];
          pic.className = 'pic' + (id ? '' : ' q'); pic.innerHTML = '';
          if (id) pic.appendChild(portrait(id)); else pic.textContent = '?';
          pr.classList.toggle('act', !!st && st.p === p && st.role === role);
        });
        s.classList.toggle('act', !!st && st.p === p);
      });
      items.forEach((card, i) => {
        const old = card.querySelector('.pick'); if (old) old.remove();
        card.classList.remove('dis');
        const c = list[i]; if (!c) return;
        const t = tk[c.id];
        if (t) {
          const tag = $('div', 'pick', PNAME[t.p] + (t.role === 'front' ? ' DRV' : ' THR'));
          if (F.coop) tag.textContent = t.role === 'front' ? 'DRIVER' : 'THROWER';
          tag.style.background = PCOL[t.p]; card.appendChild(tag); card.classList.add('dis');
        }
      });
      el.style.setProperty('--cur', st ? PCOL[st.p] : '#fff');
      if (st) el.querySelector('.hd small').textContent = (F.coop ? 'CO-OP' : PNAME[st.p]) + ' · pick the ' + (st.role === 'front' ? 'DRIVER' : 'THROWER') + (F.n > 1 && !F.coop ? '' : '');
    };
    const focus = (i) => {
      const c = list[i];
      if (!c) { info.querySelector('.ci-nm').textContent = 'RANDOM'; info.querySelector('.ci-tag').textContent = 'Let fate decide.'; info.querySelector('.ci-sp').textContent = ''; return; }
      const lock = !charOpen(c);
      info.querySelector('.ci-nm').textContent = lock ? 'LOCKED' : c.name + ' · ' + c.weight.toUpperCase();
      info.querySelector('.ci-tag').textContent = lock ? 'Win cups to unlock this driver.' : (c.tagline || '');
      info.querySelector('.ci-sp').textContent = !lock && c.special ? 'Special item: ' + (c.special === 'all' ? 'Any special' : itemName(c.special)) : '';
    };
    refresh();
    let busy = false;
    const scr = {
      el, items, cols: 5, idx: 0, onFocus: focus,
      pick(i) {
        if (busy) return;
        const st = cur(); if (!st) return;
        const tk = taken();
        let id;
        if (i >= list.length) {
          const pool = list.filter((c) => charOpen(c) && !tk[c.id]);
          if (!pool.length) return;
          id = pool[Math.floor(Math.random() * pool.length)].id;
        } else {
          const c = list[i];
          if (!charOpen(c)) return shakeEl(items[i]);
          if (tk[c.id]) return shakeEl(items[i]);
          id = c.id;
        }
        F.picks[st.p][st.role] = id;
        F.step++;
        refresh();
        if (F.step >= steps.length) {
          busy = true;
          setTimeout(() => { busy = false; if (active === scr) { F.kartIdx = 0; showKarts(0); } }, 380);
        }
      },
      back() {
        if (busy) return;
        if (F.step > 0) {
          F.step--; const st = steps[F.step]; F.picks[st.p][st.role] = null; refresh();
        } else backFromChars();
      },
    };
    mount(scr);
    if (F.step >= steps.length) { F.step = steps.length - 1; const st = steps[F.step]; F.picks[st.p][st.role] = null; refresh(); }
  }

  // ------------------------------------------------------------------ kart select + 3D turntable
  function kartsFor(front, rear) {
    const all = G.KARTS || [];
    let ks = null;
    try {
      if (G.Characters && G.Characters.kartsFor) {
        const r = G.Characters.kartsFor(front, rear);
        if (r && r.length) ks = r.map((k) => (typeof k === 'string' ? all.find((x) => x.id === k) : k)).filter(Boolean);
      }
    } catch (e) {}
    if (!ks) {
      const w = pairWeight(front, rear);
      ks = all.filter((k) => k.weight === w || k.weight === 'any');
      if (!ks.length) ks = all.slice();
    }
    return ks;
  }
  const kartStatsDef = [['speed', 'SPEED'], ['accel', 'ACCEL'], ['handling', 'HANDLING'], ['mass', 'WEIGHT']];

  function makePreview(canvas) {
    if (!window.THREE) return null;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: false }); } catch (e) { return null; }
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6a7cff, 0.95));
    const dl = new THREE.DirectionalLight(0xffffff, 0.9); dl.position.set(4, 8, 5); scene.add(dl);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.1, 32), new THREE.MeshBasicMaterial({ color: 0x1a1f5c, transparent: true, opacity: 0.28 }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.01; scene.add(disc);
    const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
    cam.position.set(4.4, 2.5, 5.6); cam.lookAt(0, 0.55, 0);
    let spin = new THREE.Group(); scene.add(spin);
    let w = 0, h = 0, raf = 0, dead = false, last = 0;
    const size = () => {
      const cw = canvas.clientWidth | 0, ch = canvas.clientHeight | 0;
      if (cw && ch && (cw !== w || ch !== h)) { w = cw; h = ch; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
    };
    const loop = (t) => {
      if (dead) return;
      raf = requestAnimationFrame(loop);
      if (document.hidden || !canvas.isConnected || menuLayer.classList.contains('hidden')) { last = t; return; }
      size();
      if (!w) return;
      const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
      spin.rotation.y += dt * 0.9;
      renderer.render(scene, cam);
    };
    raf = requestAnimationFrame(loop);
    return {
      set(kartId, front, rear) {
        scene.remove(spin);
        spin = new THREE.Group();
        if (kartId) try {
          const m = G.Characters.buildKart(kartId, front, rear);
          m.group.position.set(0, 0, 0);
          spin.add(m.group);
        } catch (e) { console.warn('kart preview', e); }
        spin.rotation.y = 0.6;
        scene.add(spin);
      },
      destroy() {
        dead = true; cancelAnimationFrame(raf);
        try { renderer.dispose(); if (renderer.forceContextLoss) renderer.forceContextLoss(); } catch (e) {}
      },
    };
  }

  function showKarts(pi) {
    const pk = F.picks[pi];
    const ks = kartsFor(pk.front, pk.rear);
    const w = pairWeight(pk.front, pk.rear);
    const el = $('section', 'screen karts');
    const top = $('div', 'char-top');
    const label = F.coop ? 'CO-OP' : (F.n > 1 ? PNAME[pi] : '');
    top.innerHTML = '<div class="hd"><h1>PICK A KART</h1><small></small></div>';
    top.querySelector('small').textContent = (label ? label + ' · ' : '') + w + ' class karts';
    const chip = $('div', 'pair-chip');
    chip.style.setProperty('--pc', PCOL[pi]);
    const pa = $('div', 'pic'); pa.appendChild(portrait(pk.front));
    const pb = $('div', 'pic'); pb.appendChild(portrait(pk.rear));
    chip.appendChild(pa); chip.appendChild($('span', 'plus', '+')); chip.appendChild(pb);
    chip.appendChild($('div', 'cls', w.toUpperCase() + '<small>' + charName(pk.front).replace(/&/g, '&amp;') + ' &amp; ' + charName(pk.rear).replace(/&/g, '&amp;') + '</small>'));
    top.appendChild(chip);
    el.appendChild(top);

    const body = $('div', 'kart-body');
    const listEl = $('div', 'kart-list');
    const items = ks.map((k) => {
      const lock = !kartOpen(k);
      const row = $('div', 'krow' + (lock ? ' locked' : ''), '<i class="sw"></i><div class="kn"></div><span class="kc"></span>');
      row.querySelector('.sw').style.background = css(k.color);
      row.querySelector('.kn').textContent = lock ? '???' : k.name;
      row.querySelector('.kc').textContent = k.weight === 'any' ? 'ANY' : k.weight;
      if (lock) row.appendChild($('div', 'lk', ICONS.lock));
      listEl.appendChild(row);
      return row;
    });
    body.appendChild(listEl);
    const stage = $('div', 'kart-stage');
    const cv = $('canvas', 'kart-cv');
    stage.appendChild(cv);
    const nameEl = $('div', 'k-name');
    stage.appendChild(nameEl);
    const stats = $('div', 'k-stats');
    kartStatsDef.forEach(([key, lab]) => {
      const r = $('div', 'stat ' + key, '<label>' + lab + '</label><div class="segs"></div>');
      for (let i = 1; i <= 5; i++) r.querySelector('.segs').appendChild($('i', 'seg'));
      stats.appendChild(r);
    });
    stage.appendChild(stats);
    body.appendChild(stage);
    el.appendChild(body);
    el.appendChild($('div', 'nav-hint', '<span><kbd>↑</kbd><kbd>↓</kbd> Browse</span><span><kbd>Enter</kbd> Select</span><span><kbd>Esc</kbd> Back</span>'));

    let preview = null;
    const scr = {
      el, items, cols: 1, idx: Math.max(0, ks.findIndex((k) => k.id === pk.kart)), scrollFocus: true,
      onFocus(i) {
        const k = ks[i]; if (!k) return;
        const lock = !kartOpen(k);
        nameEl.textContent = lock ? 'LOCKED' : k.name;
        stage.classList.toggle('locked', lock);
        kartStatsDef.forEach(([key]) => {
          const segs = stats.querySelectorAll('.stat.' + key + ' .seg');
          segs.forEach((s, si) => s.classList.toggle('f', si < (k[key] || 0)));
        });
        if (preview) { if (lock) preview.set(null); else preview.set(k.id, pk.front, pk.rear); }
      },
      pick(i) {
        const k = ks[i]; if (!k) return;
        if (!kartOpen(k)) return shakeEl(items[i]);
        pk.kart = k.id;
        if (F.coop || pi + 1 >= F.n) { afterKarts(); } else showKarts(pi + 1);
      },
      back() { if (pi > 0) showKarts(pi - 1); else { startChars(true); } },
      start() {
        preview = makePreview(cv);
        if (!preview) stage.classList.add('nogl'); else scr.onFocus(scr.idx);
      },
      destroy() { if (preview) { preview.destroy(); preview = null; } },
    };
    mount(scr);
  }
  function afterKarts() {
    if (F.mode === 'gp') showCups();
    else if (F.mode === 'battle') launch({});
    else showCourses();
  }

  // ------------------------------------------------------------------ cups
  function showCups() {
    const cups = cupList().concat([{ id: 'allcup', name: CUP_DEFAULT_NAMES.allcup }]);
    const el = screenEl('cups', 'CHOOSE CUP', 'four courses · points decide the champ');
    const row = $('div', 'cup-row');
    const items = cups.map((c, i) => {
      const st = cupStyle(c.id, i);
      const lock = !cupOpen(c.id);
      const ts = tracksOfCup(c.id);
      const names = c.id === 'allcup' ? '<li class="all">ALL 16 COURSES</li><li class="all">IN CUP ORDER</li>' : ts.map((t, n) => '<li><b>' + (n + 1) + '</b><span></span></li>').join('');
      const card = $('div', 'card cup-card' + (lock ? ' locked' : ''), '<div class="in"><div class="cupico">' + ICONS.trophy + '</div><div class="nm"></div><ul>' + names + '</ul></div>');
      card.style.setProperty('--c', st.c); card.style.setProperty('--c2', st.c2);
      card.querySelector('.nm').textContent = c.name || CUP_DEFAULT_NAMES[c.id];
      if (c.id !== 'allcup') card.querySelectorAll('li span').forEach((s, n) => { s.textContent = ts[n] ? ts[n].name : '—'; });
      if (lock) card.appendChild(lockBadge());
      row.appendChild(card);
      return card;
    });
    el.appendChild(row);
    mount({
      el, items, cols: items.length, idx: Math.max(0, cups.findIndex((c) => c.id === F.cup)),
      pick(i) {
        if (!cupOpen(cups[i].id)) return shakeEl(items[i]);
        F.cup = cups[i].id; launch({ cup: cups[i].id });
      },
      back() { F.kartIdx = 0; showKarts(F.coop ? 0 : Math.max(0, F.n - 1)); },
    });
  }

  // ------------------------------------------------------------------ courses (VS / TT): all 16 grouped by cup
  function showCourses() {
    const cups = cupList();
    const el = screenEl('courses', F.mode === 'tt' ? 'TIME TRIAL' : 'CHOOSE COURSE', 'every course, grouped by cup');
    const board = $('div', 'course-board');
    const items = [], colIdx = [];
    cups.forEach((c, ci) => {
      const st = cupStyle(c.id, ci);
      const lock = !cupOpen(c.id);
      const col = $('div', 'ccol');
      col.style.setProperty('--c', st.c); col.style.setProperty('--c2', st.c2);
      const hd = $('div', 'chd'); hd.textContent = c.name; if (lock) hd.insertAdjacentHTML('beforeend', ICONS.lock);
      col.appendChild(hd);
      const idxs = [];
      tracksOfCup(c.id).forEach((t) => {
        const card = $('div', 'card course-card' + (lock ? ' locked' : ''), '<div class="in"><div class="tn"></div><div class="tl"></div></div>');
        card.querySelector('.in').insertBefore(thumbEl(t), card.querySelector('.tn'));
        card.querySelector('.tn').textContent = lock ? '???' : t.name;
        card.querySelector('.tl').textContent = (t.laps || 3) + ' laps';
        card._t = t; card._lock = lock;
        if (lock) card.appendChild(lockBadge());
        col.appendChild(card); items.push(card); idxs.push(items.length - 1);
      });
      colIdx.push(idxs);
      board.appendChild(col);
    });
    el.appendChild(board);
    const posOf = (i) => { for (let c = 0; c < colIdx.length; c++) { const r = colIdx[c].indexOf(i); if (r >= 0) return [c, r]; } return [0, 0]; };
    let start = items.findIndex((c) => c._t.id === F.track);
    const scr = {
      el, items, cols: 1, idx: Math.max(0, start),
      onKey(act) {
        const [c, r] = posOf(scr.idx);
        let nc = c, nr = r;
        if (act === 'left') nc = c - 1; else if (act === 'right') nc = c + 1;
        else if (act === 'up') nr = r - 1; else if (act === 'down') nr = r + 1;
        if (nc < 0 || nc >= colIdx.length || !colIdx[nc].length) return true;
        nr = clamp(nr, 0, colIdx[nc].length - 1);
        setIdx(scr, colIdx[nc][nr]);
        return true;
      },
      pick(i) {
        const c = items[i]; if (!c) return;
        if (c._lock) return shakeEl(c);
        F.track = c._t.id; launch({ track: c._t.id });
      },
      back() { F.kartIdx = 0; showKarts(F.coop ? 0 : Math.max(0, F.n - 1)); },
    };
    mount(scr);
  }

  // ------------------------------------------------------------------ records
  function showRecords() {
    const cups = cupList();
    const el = screenEl('records', 'RECORDS', 'best times & fastest laps', '<span><kbd>Esc</kbd> Back</span>');
    const board = $('div', 'rec-board');
    cups.forEach((c, ci) => {
      const st = cupStyle(c.id, ci);
      const col = $('div', 'rcol');
      col.style.setProperty('--c', st.c); col.style.setProperty('--c2', st.c2);
      col.appendChild($('div', 'chd')).textContent = c.name;
      tracksOfCup(c.id).forEach((t) => {
        let bt = null, bl = null;
        try { const s = SV(); if (s) { bt = s.bestTime ? s.bestTime(t.id) : null; bl = s.bestLap ? s.bestLap(t.id) : null; } } catch (e) {}
        const r = $('div', 'rrow', '<div class="rn"></div><div class="rt"><span>RACE</span><b></b></div><div class="rt"><span>LAP</span><b></b></div>');
        r.querySelector('.rn').textContent = t.name;
        const bs = r.querySelectorAll('b');
        bs[0].textContent = bt ? fmtTime(bt) : '--:--.--'; bs[1].textContent = bl ? fmtTime(bl) : '--:--.--';
        if (bt) r.classList.add('has');
        col.appendChild(r);
      });
      board.appendChild(col);
    });
    el.appendChild(board);
    mount({ el, items: [], cols: 1, idx: 0, pick: showMain, back: showMain });
  }

  // ------------------------------------------------------------------ options
  function showOptions() {
    const st = settings();
    const apply = () => { try { G.Sound && G.Sound.setVolumes && G.Sound.setVolumes(st.musicVol, st.sfxVol); } catch (e) {} persist(); };
    let armed = false, scr = null;
    const rows = [
      { type: 'slider', label: 'MUSIC', get: () => (st.musicVol == null ? 0.7 : st.musicVol), set: (v) => { st.musicVol = v; apply(); } },
      { type: 'slider', label: 'SOUND FX', get: () => (st.sfxVol == null ? 0.8 : st.sfxVol), set: (v) => { st.sfxVol = v; apply(); snd('item_get'); } },
      { label: 'ITEM FREQUENCY', choices: FREQ, get: () => st.itemFreq || 'normal', set: (v) => { st.itemFreq = v; F.itemFreq = v; persist(); } },
      {
        type: 'button', label: 'UNLOCK EVERYTHING', sub: 'all cups, karts, drivers',
        onPick(row) { try { SV() && SV().unlockAll && SV().unlockAll(); persist(); } catch (e) {} row.classList.add('done'); row.querySelector('.rs').textContent = 'DONE!'; },
      },
      {
        type: 'button', label: 'RESET SAVE DATA', sub: 'erases records & unlocks', cls: 'danger',
        onPick(row) {
          if (!armed) { armed = true; row.querySelector('.rs').textContent = 'PRESS AGAIN TO CONFIRM'; row.classList.add('armed'); return; }
          armed = false;
          try {
            const s = SV();
            if (s && s.reset) s.reset();
            else { localStorage.removeItem('tt-save-v2'); if (s && s.data) { for (const k in s.data) delete s.data[k]; } if (s && s.persist) s.persist(); }
          } catch (e) {}
          row.classList.remove('armed'); row.querySelector('.rs').textContent = 'ERASED';
        },
      },
    ];
    scr = rowsScreen({ cls: 'options', title: 'OPTIONS', sub: 'sound & save data', rows, back: showMain });
  }

  // ------------------------------------------------------------------ overlays
  function hideOverlays() {
    ovl = null;
    if (ovlLayer) ovlLayer.innerHTML = '';
  }
  function closeOverlay(o) { if (ovl === o) ovl = null; ovlLayer.innerHTML = ''; }

  function showPause(onResume, onRestart, onQuit) {
    G.UI.init();
    hideOverlays();
    const el = $('div', 'ovl');
    el.appendChild($('div', 'scrim'));
    const panel = $('div', 'pause-panel');
    panel.innerHTML = '<div class="ph"><h1>PAUSED</h1></div>';
    const opts = $('div', 'opts');
    const defs = [['RESUME', onResume], ['RESTART', onRestart], ['QUIT', onQuit]];
    const items = defs.map((d) => { const b = $('div', 'popt', '<span>' + d[0] + '</span>'); opts.appendChild(b); return b; });
    panel.appendChild(opts);
    el.appendChild(panel);
    ovlLayer.appendChild(el);
    let idx = 0, done = false;
    const refresh = (silent) => { items.forEach((b, i) => b.classList.toggle('on', i === idx)); if (!silent) snd('menu_move'); };
    refresh(true);
    const choose = (i) => {
      if (done) return; done = true;
      snd(i === 0 ? 'menu_back' : 'menu_select');
      closeOverlay(o);
      const fn = defs[i][1]; if (fn) fn();
    };
    const o = {
      key(a) {
        if (a === 'up') { idx = (idx + items.length - 1) % items.length; refresh(); }
        else if (a === 'down') { idx = (idx + 1) % items.length; refresh(); }
        else if (a === 'ok') choose(idx);
        else if (a === 'back') choose(0);
      },
    };
    items.forEach((b, i) => {
      b.addEventListener('pointerenter', () => { if (idx !== i) { idx = i; refresh(); } });
      b.addEventListener('click', () => choose(i));
    });
    ovl = o;
    o.el = el;
  }
  function hidePause() { hideOverlays(); }

  function resultRow(r, i, opts) {
    const row = $('div', 'res-row' + (r.isPlayer ? ' me' : '') + (r.pos === 1 ? ' r1' : ''));
    row.style.setProperty('--i', i);
    const pos = r.pos || i + 1;
    let tag = '';
    if (r.playerIndex != null) tag = '<em class="ptg" style="background:' + PCOL[r.playerIndex % 4] + '">' + PNAME[r.playerIndex % 4] + '</em>';
    let races = '';
    if (opts.allcup && r.racePoints && r.racePoints.length) {
      races = '<div class="rpts">' + r.racePoints.map((p) => '<i class="' + (p >= 8 ? 'hi' : p > 0 ? 'mid' : '') + '">' + p + '</i>').join('') + '</div>';
    }
    const pt = opts.showPoints ? '<div class="pt">' + (r.points != null ? '+' + r.points : '') + (r.total != null ? '<small>' + r.total + ' pts</small>' : '') + '</div>' : '';
    row.innerHTML = '<div class="p">' + pos + '<small>' + ordinal(pos) + '</small></div><div class="kc"></div><div class="nm"></div>' + races + '<div class="tm"></div>' + pt;
    row.querySelector('.kc').style.setProperty('--kc', css(r.kartColor, '#888'));
    const nm = row.querySelector('.nm'); nm.textContent = r.name || ''; if (tag) nm.insertAdjacentHTML('beforeend', tag);
    row.querySelector('.tm').textContent = r.time == null ? '' : fmtTime(r.time);
    return row;
  }

  function showResults(rows, opts, onContinue) {
    G.UI.init();
    opts = opts || {};
    hideOverlays();
    rows = rows || [];
    const el = $('div', 'ovl results' + (opts.allcup ? ' allcup' : ''));
    el.appendChild($('div', 'scrim'));
    const title = $('div', 'res-title', '<h1></h1><small></small>');
    title.querySelector('h1').textContent = opts.title || 'RESULTS';
    const subt = opts.subtitle || (opts.raceCount ? 'RACE ' + (opts.raceNo || opts.raceIndex + 1 || 1) + ' / ' + opts.raceCount : '');
    if (subt) title.querySelector('small').textContent = subt; else title.querySelector('small').remove();
    el.appendChild(title);
    const table = $('div', 'res-table');
    if (opts.showPoints) table.classList.add('pts');
    if (rows.length > 8) table.classList.add('dense');
    rows.forEach((r, i) => table.appendChild(resultRow(r, i, opts)));
    el.appendChild(table);
    el.appendChild($('div', 'cont', 'PRESS ENTER / CLICK TO CONTINUE'));
    ovlLayer.appendChild(el);
    let done = false;
    const go = () => { if (done) return; done = true; snd('menu_select'); closeOverlay(o); if (onContinue) onContinue(); };
    const o = { key(a) { if (a === 'ok' || a === 'back') go(); } };
    const born = performance.now();
    el.addEventListener('click', () => { if (performance.now() - born > 500) go(); });
    ovl = o;
    try { G.Sound && G.Sound.playMusic && G.Sound.playMusic('results'); } catch (e) {}
  }

  function showBattleResults(rows, onDone) {
    G.UI.init();
    hideOverlays();
    rows = rows || [];
    const el = $('div', 'ovl results battle');
    el.appendChild($('div', 'scrim'));
    el.appendChild($('div', 'res-title', '<h1>BATTLE RESULTS</h1>'));
    const table = $('div', 'res-table pts');
    rows.forEach((r, i) => {
      const row = resultRow(Object.assign({}, r, { points: null, total: null, time: null }), i, { showPoints: false });
      let stat = r.stat;
      if (stat == null) {
        const bits = [];
        if (r.balloons != null) bits.push(r.balloons + ' balloon' + (r.balloons === 1 ? '' : 's'));
        if (r.score != null) bits.push(r.score + ' pt' + (r.score === 1 ? '' : 's'));
        if (r.shineTime != null) bits.push(Math.round(r.shineTime) + 's shine');
        if (r.time != null) bits.push(fmtTime(r.time));
        stat = bits.join(' · ');
      }
      row.querySelector('.tm').textContent = stat;
      row.querySelector('.tm').classList.add('wide');
      table.appendChild(row);
    });
    el.appendChild(table);
    el.appendChild($('div', 'cont', 'PRESS ENTER / CLICK TO CONTINUE'));
    ovlLayer.appendChild(el);
    let done = false;
    const go = () => { if (done) return; done = true; snd('menu_select'); closeOverlay(o); if (onDone) onDone(); };
    const o = { key(a) { if (a === 'ok' || a === 'back') go(); } };
    const born = performance.now();
    el.addEventListener('click', () => { if (performance.now() - born > 500) go(); });
    ovl = o;
    try { G.Sound && G.Sound.playMusic && G.Sound.playMusic('results'); } catch (e) {}
  }

  function unlockInfo(key) {
    const [kind, id] = String(key).split(':');
    if (kind === 'cup') return { head: 'NEW CUP UNLOCKED!', name: CUP_DEFAULT_NAMES[id] || prettify(id) + ' Cup', c: cupStyle(id).c, ic: ICONS.trophy };
    if (kind === 'cc') return { head: id === 'mirror' ? 'NEW MODE UNLOCKED!' : 'NEW CLASS UNLOCKED!', name: id === 'mirror' ? 'Mirror Mode' : id + 'cc', c: '#7a3cff', ic: ICONS.flag };
    if (kind === 'char') {
      const c = charById(id);
      return { head: 'NEW DRIVER UNLOCKED!', name: c ? c.name : prettify(id), c: '#ff5ab0', portrait: id };
    }
    if (kind === 'kart') {
      const k = (G.KARTS || []).find((x) => x.id === id);
      return { head: 'NEW KART UNLOCKED!', name: k ? k.name : prettify(id), c: k ? css(k.color) : '#3b9bff', ic: ICONS.star, swatch: k ? css(k.color) : null };
    }
    return { head: 'UNLOCKED!', name: prettify(id || key), c: '#ffc72c', ic: ICONS.star };
  }
  function showUnlocks(keys, onDone) {
    G.UI.init();
    keys = (keys || []).filter(Boolean);
    if (!keys.length) { if (onDone) onDone(); return; }
    hideOverlays();
    let i = 0, done = false;
    const el = $('div', 'ovl unlocks');
    el.appendChild($('div', 'scrim'));
    ovlLayer.appendChild(el);
    const show = () => {
      el.querySelectorAll('.unl').forEach((n) => n.remove());
      const u = unlockInfo(keys[i]);
      const card = $('div', 'unl', '<div class="burst"></div><div class="uh"></div><div class="uic"></div><div class="un"></div><div class="ucount"></div><div class="cont">PRESS ENTER</div>');
      card.style.setProperty('--c', u.c);
      card.querySelector('.uh').textContent = u.head;
      card.querySelector('.un').textContent = u.name;
      const ic = card.querySelector('.uic');
      if (u.portrait) ic.appendChild(portrait(u.portrait)); else ic.innerHTML = u.ic || '';
      if (u.swatch) ic.style.setProperty('--sw', u.swatch);
      if (keys.length > 1) card.querySelector('.ucount').textContent = (i + 1) + ' / ' + keys.length;
      el.appendChild(card);
      snd('coin_bonus');
    };
    const go = () => {
      if (done) return; snd('menu_select');
      if (++i < keys.length) { show(); return; }
      done = true; closeOverlay(o); if (onDone) onDone();
    };
    const o = { key(a) { if (a === 'ok' || a === 'back') go(); } };
    const born = performance.now();
    el.addEventListener('click', () => { if (performance.now() - born > 400) go(); });
    show();
    ovl = o;
  }

  function showGPFinal(standings, onDone) {
    G.UI.init();
    hideOverlays();
    standings = (standings || []).slice();
    standings.forEach((r, i) => { if (r.pos == null) r.pos = i + 1; });
    standings.sort((a, b) => a.pos - b.pos);
    const el = $('div', 'ovl gpfinal');
    el.appendChild($('div', 'scrim'));
    const conf = $('div', 'confetti');
    const cols = ['#ff4655', '#2ee6ff', '#7a3cff', '#ffd23c', '#ffffff', '#3ddc6f', '#ff5ab0'];
    for (let i = 0; i < 40; i++) {
      const c = $('i');
      c.style.cssText = '--x:' + (Math.random() * 100).toFixed(1) + '%;--c:' + cols[i % cols.length] + ';--t:' + (3 + Math.random() * 3).toFixed(2) + 's;--dl:-' + (Math.random() * 5).toFixed(2) + 's;--dx:' + ((Math.random() - .5) * 10).toFixed(1) + 'rem';
      conf.appendChild(c);
    }
    el.appendChild(conf);
    el.appendChild($('div', 'res-title gp-title', '<h1>GRAND PRIX RESULTS</h1>'));
    const pod = $('div', 'podium');
    [2, 1, 3].forEach((p) => {
      const r = standings.find((x) => x.pos === p);
      if (!r) return;
      const col = $('div', 'pcol p' + p);
      col.style.setProperty('--d', p === 1 ? 900 : p === 2 ? 450 : 100);
      col.innerHTML = '<div class="who' + (r.isPlayer ? ' me' : '') + '"></div>' + trophyHTML(p === 1) + '<div class="blk"><span>' + p + '</span></div>';
      const who = col.querySelector('.who');
      who.textContent = r.name || '';
      const sm = $('small'); sm.textContent = (r.total != null ? r.total + ' PTS' : '') + (r.isPlayer ? ' · YOU' : ''); who.appendChild(sm);
      pod.appendChild(col);
    });
    el.appendChild(pod);
    const rest = standings.filter((r) => r.pos > 3);
    const me = standings.find((r) => r.isPlayer);
    if (me && me.pos > 3) el.appendChild($('div', 'yourplace', 'YOU FINISHED ' + me.pos + ordinal(me.pos)));
    if (rest.length) {
      const wrap = $('div', 'gp-rest');
      rest.forEach((r) => {
        const c = $('div', 'gp-chip' + (r.isPlayer ? ' me' : ''), '<b>' + r.pos + ordinal(r.pos) + '</b><span class="kc"></span><span></span>' + (r.total != null ? '<span>' + r.total + ' pts</span>' : ''));
        c.querySelector('.kc').style.setProperty('--kc', css(r.kartColor, '#888'));
        c.children[2].textContent = r.name || '';
        wrap.appendChild(c);
      });
      el.appendChild(wrap);
    }
    el.appendChild($('div', 'cont', 'PRESS ENTER / CLICK TO CONTINUE'));
    ovlLayer.appendChild(el);
    let done = false;
    const go = () => { if (done) return; done = true; snd('menu_select'); closeOverlay(o); if (onDone) onDone(); };
    const o = { key(a) { if (a === 'ok' || a === 'back') go(); } };
    const born = performance.now();
    el.addEventListener('click', () => { if (performance.now() - born > 800) go(); });
    ovl = o;
    try { G.Sound && G.Sound.playMusic && G.Sound.playMusic('results'); } catch (e) {}
  }
  const trophyHTML = (shine) => '<div class="trophy' + (shine ? ' shine' : '') + '"><div class="h l"></div><div class="h r"></div><div class="cup"></div><div class="stem"></div><div class="base"></div></div>';

  // ------------------------------------------------------------------ G.UI
  G.UI = {
    init() {
      if (inited) return;
      inited = true;
      root = document.getElementById('ui');
      if (!root) { root = $('div'); root.id = 'ui'; document.body.appendChild(root); }
      menuLayer = $('div'); menuLayer.id = 'menus';
      const bg = $('div', 'menu-bg', '<div class="rays"></div><div class="bubbles"></div><div class="vig"></div><div class="strip t checker"></div><div class="strip b checker"></div>');
      const bub = bg.querySelector('.bubbles');
      for (let i = 0; i < 14; i++) {
        const b = $('i');
        const s = 5 + ((i * 37) % 11) * 1.6;
        b.style.cssText = 'left:' + ((i * 53) % 100) + '%;width:' + s + 'rem;height:' + s + 'rem;animation-duration:' + (14 + (i * 7) % 12) + 's;animation-delay:-' + ((i * 5) % 17) + 's';
        bub.appendChild(b);
      }
      menuLayer.appendChild(bg);
      menuBox = $('div'); menuBox.style.cssText = 'position:absolute;inset:0';
      menuLayer.appendChild(menuBox);
      menuLayer.classList.add('hidden');
      hudLayer = $('div'); hudLayer.id = 'hud';
      ovlLayer = $('div'); ovlLayer.id = 'overlays'; ovlLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none';
      root.appendChild(menuLayer); root.appendChild(hudLayer); root.appendChild(ovlLayer);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('pointerdown', initSound, { passive: true });
      window.addEventListener('resize', () => instances.forEach((h) => h._layout()));
      G.HUD._boot();
    },
    showTitle,
    showMenu: showMain,
    hideMenus() {
      if (!inited) return;
      destroyActive();
      menuLayer.classList.add('hidden');
      clearMenus();
    },
    showPause,
    hidePause,
    showGPFinal,
    showUnlocks,
    showBattleResults,
  };

  // ------------------------------------------------------------------ HUD (per-viewport instances)
  const instances = [];
  let roulKeys = null;
  const HUD_LAST_RESET = () => ({ lap: null, laps: null, fin: null, time: null, lapTimes: null, pos: null, racers: null, drift: null, draft: -1, wrong: null, slot: [null, null], cnt: [null, null], roul: [false, false], face: [null, null], coop: null, bal: null, shine: null, score: null, bt: null, btype: null, label: null });

  function iconHTML(id) {
    const it = G.ITEMS && G.ITEMS[id];
    if (it && it.icon) return /^\s*</.test(it.icon) ? it.icon : '<span class="lbl">' + it.icon + '</span>';
    return '<span class="lbl">' + (id ? String(id).slice(0, 3).toUpperCase() : '?') + '</span>';
  }

  function createHUD(index, count) {
    index = index | 0; count = clamp(count | 0 || 1, 1, 4);
    const el = $('div', 'hudv hidden');
    el.dataset.n = count; el.dataset.i = index;
    const pc = PCOL[index % 4];
    el.style.setProperty('--pc', pc);
    el.innerHTML =
      '<div class="h-items">' +
        '<div class="islot big"><div class="ibub empty"><div class="ic"></div><div class="cnt hidden"></div></div><canvas class="face" width="64" height="64"></canvas></div>' +
        '<div class="islot small"><div class="ibub empty"><div class="ic"></div><div class="cnt hidden"></div></div><canvas class="face" width="64" height="64"></canvas></div>' +
        '<div class="ptag-h hidden"></div>' +
        '<div class="coop hidden"><span class="cp d"></span><span class="cp t"></span></div>' +
      '</div>' +
      '<div class="h-laptimes"></div>' +
      '<div class="h-tr"><div class="plate lap"><span class="lt">LAP</span><b>1</b><span class="of">/3</span></div><div class="plate timer"><span>00:00.00</span></div></div>' +
      '<div class="h-battle hidden"><div class="bt-time"></div><div class="bt-bal"></div><div class="bt-shine hidden"><span class="sl"></span><div class="sbar"><i></i></div></div><div class="bt-score hidden"><span class="sl">BOMB HITS</span><div class="pips"></div></div></div>' +
      '<div class="h-mini"><canvas width="120" height="190"></canvas></div>' +
      '<div class="h-pos"><div class="pos" data-p="1"><span class="n">1</span><span class="s">st</span></div><div class="pof">OF 8</div></div>' +
      '<div class="h-turbo"><div class="tb"><i></i><span>MINI-TURBO</span></div><div class="dr"><span>SLIPSTREAM</span><div class="dbar"><i></i></div></div></div>' +
      '<div class="h-c"><div class="count"></div><div class="banner"><span></span></div><div class="wrong">' + ICONS.arrow + '<span>WRONG WAY</span></div></div>';
    const q = (s) => el.querySelector(s);
    const R = {
      items: q('.h-items'), tr: q('.h-tr'), lap: q('.lap'), lt: q('.lap .lt'), lapNum: q('.lap b'), lapOf: q('.lap .of'), timer: q('.timer span'),
      lapTimes: q('.h-laptimes'), pos: q('.pos'), posN: q('.pos .n'), posS: q('.pos .s'), posOf: q('.pof'), hpos: q('.h-pos'),
      slots: [0, 1].map((i) => { const w = el.querySelectorAll('.islot')[i]; return { wrap: w, bub: w.querySelector('.ibub'), ic: w.querySelector('.ic'), cnt: w.querySelector('.cnt'), face: w.querySelector('.face') }; }),
      ptag: q('.ptag-h'), coop: q('.coop'), cpD: q('.cp.d'), cpT: q('.cp.t'),
      battle: q('.h-battle'), btTime: q('.bt-time'), btBal: q('.bt-bal'), btShine: q('.bt-shine'), btShineL: q('.bt-shine .sl'), btShineBar: q('.bt-shine .sbar i'),
      btScore: q('.bt-score'), btPips: q('.bt-score .pips'),
      mini: q('.h-mini'), canvas: q('.h-mini canvas'), turbo: q('.h-turbo'), tb: q('.tb'), dr: q('.dr'), drBar: q('.dbar i'),
      count: q('.count'), banner: q('.banner'), bannerTx: q('.banner span'), wrong: q('.wrong'),
    };
    R.ctx = R.canvas.getContext('2d');
    if (count > 1) { R.ptag.textContent = PNAME[index]; R.ptag.classList.remove('hidden'); }
    let last = HUD_LAST_RESET();
    let mini = null, visible = false, miniT = 0, lastMini = null;
    const anims = {};
    const frames = [-1, -1];

    const h = {
      index, count, el,
      _layout() {
        const W = window.innerWidth, H = window.innerHeight;
        let l = 0, t = 0, w = 1, hh = 1;
        if (count === 2) { hh = 0.5; t = index === 0 ? 0 : 0.5; }
        else if (count >= 3) { w = 0.5; hh = 0.5; l = (index % 2) * 0.5; t = (index >> 1) * 0.5; }
        el.style.left = (l * 100) + '%'; el.style.top = (t * 100) + '%'; el.style.width = (w * 100) + '%'; el.style.height = (hh * 100) + '%';
        const u = Math.min(W * w / 100, H * hh / 56.25) * (count > 1 ? 1.28 : 1);
        el.style.setProperty('--u', Math.max(3, u).toFixed(2) + 'px');
      },
      show() { G.UI.init(); visible = true; el.classList.remove('hidden'); h._layout(); },
      hide() {
        visible = false; el.classList.add('hidden');
        for (const k in anims) { if (anims[k]) { anims[k].cancel(); anims[k] = null; } }
        last = HUD_LAST_RESET();
      },
      destroy() {
        visible = false;
        const i = instances.indexOf(h); if (i >= 0) instances.splice(i, 1);
        if (el.parentNode) el.parentNode.removeChild(el);
      },
      setMinimap(m) {
        mini = null; lastMini = null;
        const W = R.canvas.width, Hh = R.canvas.height;
        R.ctx.clearRect(0, 0, W, Hh);
        if (!m || !m.points || !m.points.length || !m.bounds) return;
        const b = m.bounds, pad = 14;
        const bw = Math.max(1, b.maxX - b.minX), bh = Math.max(1, b.maxZ - b.minZ);
        const rot = bw > bh * 1.15;       // portrait layout: rotate wide tracks
        const iw = rot ? bh : bw, ih = rot ? bw : bh;
        const s = Math.min((W - pad * 2) / iw, (Hh - pad * 2) / ih);
        const ox = (W - iw * s) / 2, oy = (Hh - ih * s) / 2;
        const sx = rot ? (x, z) => ox + (b.maxZ - z) * s : (x, z) => ox + (b.maxX - x) * s;
        const sy = rot ? (x, z) => oy + (b.maxX - x) * s : (x, z) => oy + (b.maxZ - z) * s;
        const off = document.createElement('canvas'); off.width = W; off.height = Hh;
        const c = off.getContext('2d');
        const trace = () => { c.beginPath(); m.points.forEach((p, i) => (i ? c.lineTo(sx(p.x, p.z), sy(p.x, p.z)) : c.moveTo(sx(p.x, p.z), sy(p.x, p.z)))); c.closePath(); };
        c.lineJoin = c.lineCap = 'round';
        trace(); c.strokeStyle = '#1a1f5c'; c.lineWidth = 13; c.stroke();
        trace(); c.strokeStyle = '#ffffff'; c.lineWidth = 7.5; c.stroke();
        trace(); c.strokeStyle = h_cupColor(); c.lineWidth = 2; c.setLineDash([2, 8]); c.stroke(); c.setLineDash([]);
        const p0 = m.points[0], p1 = m.points[1] || m.points[0];
        let dx = sx(p1.x, p1.z) - sx(p0.x, p0.z), dy = sy(p1.x, p1.z) - sy(p0.x, p0.z); const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
        c.save(); c.translate(sx(p0.x, p0.z), sy(p0.x, p0.z)); c.rotate(Math.atan2(dy, dx));
        c.fillStyle = '#1a1f5c'; c.fillRect(-2.5, -8, 5, 16);
        c.fillStyle = '#fff'; c.fillRect(-2.5, -8, 5, 4); c.fillRect(-2.5, 0, 5, 4);
        c.restore();
        mini = { off, sx, sy };
        drawMini(null);
      },
      update(s) {
        if (!visible || !s) return;
        const bat = s.battle || null;
        if (bat) h._battle(bat); else if (last.btype) h._battle(null);
        // lap
        const laps = s.laps || 3;
        const lap = clamp(s.lap | 0, 1, laps);
        if (lap !== last.lap) { last.lap = lap; R.lapNum.textContent = lap; }
        if (laps !== last.laps) { last.laps = laps; R.lapOf.textContent = '/' + laps; }
        const fin = !!s.finalLap;
        if (fin !== last.fin) { last.fin = fin; R.lap.classList.toggle('final', fin); R.lt.textContent = fin ? 'FINAL' : 'LAP'; }
        // time
        const tval = bat && bat.timeLeft != null ? bat.timeLeft : (s.time || 0);
        const ts = fmtTime(tval);
        if (ts !== last.time) { last.time = ts; R.timer.textContent = ts; }
        if (s.lapTimes && count === 1) {
          const lt = s.lapTimes.length ? s.lapTimes.map((t, i) => 'L' + (i + 1) + '  ' + fmtTime(t)).join('\n') : '';
          if (lt !== last.lapTimes) { last.lapTimes = lt; R.lapTimes.textContent = lt; }
        }
        // position
        const pos = s.position | 0;
        if (pos !== last.pos) {
          const first = last.pos == null;
          last.pos = pos;
          R.posN.textContent = pos; R.posS.textContent = ordinal(pos);
          R.pos.setAttribute('data-p', pos > 4 ? 4 : pos);
          if (!first && R.pos.animate) {
            if (anims.pos) anims.pos.cancel();
            anims.pos = R.pos.animate([{ transform: 'scale(1.8) rotate(-8deg)' }, { transform: 'scale(.92) rotate(2deg)', offset: .55 }, { transform: 'scale(1)' }], { duration: 480, easing: 'cubic-bezier(.3,1.4,.5,1)' });
          }
        }
        if (s.racerCount !== last.racers) { last.racers = s.racerCount; R.posOf.textContent = 'OF ' + (s.racerCount || 8); }
        // drift (blue only) + slipstream
        const dl = s.driftLevel ? 1 : 0;
        if (dl !== last.drift) { last.drift = dl; R.tb.classList.toggle('on', !!dl); }
        const dq = Math.round(clamp(s.drafting01 || 0, 0, 1) * 20);
        if (dq !== last.draft) { last.draft = dq; R.dr.classList.toggle('on', dq > 0); R.drBar.style.width = (dq * 5) + '%'; }
        const ww = !!s.wrongWay;
        if (ww !== last.wrong) { last.wrong = ww; R.wrong.classList.toggle('on', ww); }
        // items + faces
        updateSlot(0, s, s.rear);
        updateSlot(1, s, s.front);
        // coop
        let ck = '';
        if (s.coop) {
          const d = s.coop.driver, t = s.coop.thrower;
          const lab = (v) => (typeof v === 'number' ? 'P' + (v + 1) : String(v));
          ck = lab(d) + ' DRIVE|' + lab(t) + ' THROW|' + d + '|' + t;
        }
        if (ck !== last.coop) {
          last.coop = ck;
          if (!s.coop) R.coop.classList.add('hidden');
          else {
            R.coop.classList.remove('hidden');
            const d = s.coop.driver, t = s.coop.thrower;
            const lab = (v) => (typeof v === 'number' ? 'P' + (v + 1) : String(v));
            R.cpD.textContent = lab(d) + ' DRIVE'; R.cpT.textContent = lab(t) + ' THROW';
            R.cpD.style.background = typeof d === 'number' ? PCOL[d % 4] : ''; R.cpT.style.background = typeof t === 'number' ? PCOL[t % 4] : '';
          }
        }
        // minimap at ~30Hz
        if (s.minimap) {
          const now = performance.now();
          if (now - miniT > 30) { miniT = now; drawMini(s.minimap); }
        }
      },
      _battle(b) {
        const bt = b ? b.type || 'balloon' : null;
        if (bt !== last.btype) {
          last.btype = bt;
          R.battle.classList.toggle('hidden', !b);
          el.classList.toggle('is-battle', !!b);
          R.btBal.classList.toggle('hidden', bt === 'bomb');
          R.btShine.classList.toggle('hidden', bt !== 'shine');
          R.btScore.classList.toggle('hidden', bt !== 'bomb');
          last.bal = last.shine = last.score = null;
        }
        if (!b) return;
        // balloons
        if (bt !== 'bomb') {
          const mx = clamp(b.maxBalloons || 3, 1, 6), bn = clamp(b.balloons | 0, 0, mx), key = bn + '/' + mx;
          if (key !== last.bal) {
            last.bal = key;
            if (R.btBal.children.length !== mx) { R.btBal.innerHTML = ''; for (let i = 0; i < mx; i++) R.btBal.appendChild($('i', 'bal', ICONS.balloon)); }
            for (let i = 0; i < mx; i++) R.btBal.children[i].classList.toggle('off', i >= bn);
          }
        }
        if (bt === 'shine') {
          const tot = b.target || 55, sec = Math.max(0, b.shineTime == null ? tot : b.shineTime);
          const key = Math.ceil(sec) + (b.hasShine ? 'h' : '');
          if (key !== last.shine) {
            last.shine = key;
            R.btShineL.textContent = (b.hasShine ? 'YOU HAVE THE SHINE  ' : 'SHINE  ') + Math.ceil(sec) + 's';
            R.btShine.classList.toggle('has', !!b.hasShine);
            R.btShineBar.style.width = (clamp(sec / tot, 0, 1) * 100) + '%';
          }
        }
        if (bt === 'bomb') {
          const tgt = clamp(b.target || 3, 1, 8), sc = clamp(b.score | 0, 0, tgt), key = sc + '/' + tgt;
          if (key !== last.score) {
            last.score = key;
            if (R.btPips.children.length !== tgt) { R.btPips.innerHTML = ''; for (let i = 0; i < tgt; i++) R.btPips.appendChild($('i', 'pip', ICONS.bomb)); }
            for (let i = 0; i < tgt; i++) R.btPips.children[i].classList.toggle('on', i < sc);
          }
        }
      },
      countdown(n) {
        const e = R.count;
        e.textContent = n > 0 ? String(n) : 'GO!';
        e.className = 'count ' + (n > 0 ? 'c' + n : 'go');
        if (anims.count) anims.count.cancel();
        if (e.animate) {
          anims.count = e.animate([
            { transform: 'translate(-50%,-50%) scale(3) rotate(-10deg)', opacity: 0 },
            { transform: 'translate(-50%,-50%) scale(1) rotate(0deg)', opacity: 1, offset: .2 },
            { transform: 'translate(-50%,-50%) scale(1.08) rotate(1deg)', opacity: 1, offset: .75 },
            { transform: 'translate(-50%,-50%) scale(.6) rotate(0deg)', opacity: 0 },
          ], { duration: n > 0 ? 950 : 1300, easing: 'cubic-bezier(.2,.9,.3,1.1)', fill: 'both' });
        } else e.style.opacity = 1;
      },
      banner(text, kind) {
        R.banner.className = 'banner ' + (kind || 'info');
        R.bannerTx.textContent = text;
        if (anims.banner) anims.banner.cancel();
        const dur = kind === 'finish' ? 4200 : 2300;
        if (R.banner.animate) {
          anims.banner = R.banner.animate([
            { transform: 'translate(-160%,-50%) scale(.6)', opacity: 0 },
            { transform: 'translate(-48%,-50%) scale(1.08)', opacity: 1, offset: .12 },
            { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: .2 },
            { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: .82 },
            { transform: 'translate(60%,-50%) scale(.8)', opacity: 0 },
          ], { duration: dur, easing: 'ease-out', fill: 'both' });
        } else { R.banner.style.opacity = 1; setTimeout(() => { R.banner.style.opacity = 0; }, dur); }
      },
      showResults,
    };

    function h_cupColor() { return pc; }

    function updateSlot(i, s, riderId) {
      const r = R.slots[i];
      if (riderId !== last.face[i]) { last.face[i] = riderId; faceInto(r.face, riderId); r.face.classList.toggle('hidden', !riderId); }
      const id = (s.items && s.items[i]) || null;
      const rolling = !!(s.roulette && s.roulette[i]);
      if (rolling !== last.roul[i]) {
        last.roul[i] = rolling;
        r.bub.classList.toggle('roul', rolling);
        if (!rolling) last.slot[i] = '__reset';
        else { last.slot[i] = '__roll'; r.bub.classList.remove('empty'); }
      }
      if (rolling) {
        if (!roulKeys) { roulKeys = G.ITEMS ? Object.keys(G.ITEMS) : []; if (!roulKeys.length) roulKeys = ['?']; }
        const f = Math.floor(performance.now() / 70);
        if (f !== frames[i]) { frames[i] = f; r.ic.innerHTML = iconHTML(roulKeys[(f + i * 5) % roulKeys.length]); }
        if (last.cnt[i] !== 0) { last.cnt[i] = 0; r.cnt.classList.add('hidden'); }
        return;
      }
      if (last.slot[i] !== id) {
        const was = last.slot[i];
        last.slot[i] = id;
        r.ic.innerHTML = id ? iconHTML(id) : '';
        r.bub.classList.toggle('empty', !id);
        if (id && was !== null && r.bub.animate) {
          r.bub.animate([{ transform: 'scale(1.35) rotate(-8deg)' }, { transform: 'scale(.92)', offset: .6 }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.3,1.4,.5,1)' });
        }
        last.cnt[i] = null;
      }
      const n = id && s.counts ? s.counts[i] | 0 : 0;
      if (n !== last.cnt[i]) {
        last.cnt[i] = n;
        if (n > 1) { r.cnt.textContent = 'x' + n; r.cnt.classList.remove('hidden'); } else r.cnt.classList.add('hidden');
      }
    }

    function drawMini(m) {
      if (!mini) return;
      const c = R.ctx, W = R.canvas.width, Hh = R.canvas.height;
      c.clearRect(0, 0, W, Hh);
      c.drawImage(mini.off, 0, 0);
      const ks = m && m.karts;
      if (!ks) return;
      let pl = [];
      c.lineWidth = 2; c.strokeStyle = '#1a1f5c';
      for (let i = 0; i < ks.length; i++) {
        const k = ks[i];
        if (k.isPlayer) { pl.push(k); continue; }
        c.beginPath(); c.arc(mini.sx(k.x, k.z), mini.sy(k.x, k.z), 5, 0, 6.2832);
        c.fillStyle = css(k.color, '#2ee6ff'); c.fill(); c.stroke();
      }
      for (let i = 0; i < pl.length; i++) {
        const k = pl[i], x = mini.sx(k.x, k.z), y = mini.sy(k.x, k.z);
        const own = k.index == null || k.index === index;
        c.beginPath(); c.arc(x, y, own ? 9 : 7, 0, 6.2832); c.fillStyle = own ? '#fff' : '#ffffffaa'; c.fill(); c.lineWidth = 3; c.stroke();
        c.beginPath(); c.arc(x, y, own ? 5.5 : 4.5, 0, 6.2832); c.fillStyle = css(k.color, pc); c.fill(); c.lineWidth = 1.8; c.stroke();
      }
    }

    instances.push(h);
    G.UI.init();
    hudLayer.appendChild(el);
    h._layout();
    return h;
  }

  // singleton (1P) — lazily created on init so DOM exists
  const HUD = {
    _inst: null,
    _boot() { if (!HUD._inst) HUD._inst = createHUD(0, 1); },
    create(index, count) { G.UI.init(); return createHUD(index, count); },
    show() { G.UI.init(); HUD._boot(); HUD._inst.show(); },
    hide() { if (!inited) return; HUD._inst && HUD._inst.hide(); },
    update(s) { HUD._inst && HUD._inst.update(s); },
    setMinimap(m) { G.UI.init(); HUD._boot(); HUD._inst.setMinimap(m); },
    countdown(n) { G.UI.init(); HUD._boot(); HUD._inst.countdown(n); },
    banner(t, k) { G.UI.init(); HUD._boot(); HUD._inst.banner(t, k); },
    destroy() { /* singleton lives for the page */ },
    showResults,
    showUnlocks,
    showBattleResults,
  };
  G.HUD = HUD;
})();
