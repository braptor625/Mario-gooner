// TURBO TANDEM — menus + HUD (all DOM lives inside #ui). Classic script; attaches G.UI and G.HUD.
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
  const portrait = (id) => {
    try { if (G.Characters && G.Characters.buildPortrait) return G.Characters.buildPortrait(id); } catch (e) {}
    const c = $('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), ch = charById(id);
    x.fillStyle = (ch && ch.colors && ch.colors.primary) || '#FF6B1A'; x.fillRect(0, 0, 128, 128);
    return c;
  };

  const ICONS = {
    trophy: '<svg class="ico" viewBox="0 0 64 64"><path d="M16 8h32v16c0 10-7 17-16 17S16 34 16 24z" fill="#FFE14D" stroke="#14102B" stroke-width="4" stroke-linejoin="round"/><path d="M16 14H6c0 10 4 15 11 16M48 14h10c0 10-4 15-11 16" fill="none" stroke="#14102B" stroke-width="4" stroke-linecap="round"/><path d="M28 41h8v8h-8z" fill="#FF6B1A" stroke="#14102B" stroke-width="4"/><path d="M18 50h28v8H18z" fill="#6B2BFF" stroke="#14102B" stroke-width="4" stroke-linejoin="round"/><path d="M26 14v12" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>',
    flag: '<svg class="ico" viewBox="0 0 64 64"><path d="M14 8v50" stroke="#14102B" stroke-width="6" stroke-linecap="round"/><path d="M17 10c10-5 16 5 28 0v26c-12 5-18-5-28 0z" fill="#fff6e0" stroke="#14102B" stroke-width="4" stroke-linejoin="round"/><path d="M17 10h7v8h-7zM31 10h7v8h-7zM24 18h7v9h-7zM38 18h7v9h-7zM17 27h7v9h-7zM31 27h7v9h-7z" fill="#14102B" opacity=".9"/></svg>',
    clock: '<svg class="ico" viewBox="0 0 64 64"><rect x="26" y="3" width="12" height="7" fill="#14102B"/><circle cx="32" cy="36" r="24" fill="#19E3FF" stroke="#14102B" stroke-width="4"/><circle cx="32" cy="36" r="17" fill="#fff6e0" stroke="#14102B" stroke-width="3"/><path d="M32 36V23M32 36l9 6" stroke="#FF6B1A" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="36" r="3" fill="#14102B"/></svg>',
    bolt: '<svg viewBox="0 0 64 80"><path d="M38 2 8 44h18l-6 34 36-46H38z" fill="#FFE14D" stroke="#14102B" stroke-width="5" stroke-linejoin="round"/></svg>',
    flame: '<svg viewBox="0 0 48 64"><path d="M24 2c4 14 20 20 20 40a20 20 0 0 1-40 0c0-8 4-12 8-16 0 6 3 9 6 9C16 22 22 14 24 2z" fill="#FF6B1A" stroke="#14102B" stroke-width="4" stroke-linejoin="round"/><path d="M24 30c3 8 10 10 10 18a10 10 0 0 1-20 0c0-5 4-7 5-11 1 2 3 3 4 3-1-4 0-6 1-10z" fill="#FFE14D"/></svg>',
    arrow: '<svg viewBox="0 0 48 48"><path d="M4 18h24V6l16 18-16 18V30H4z" fill="#fff6e0" stroke="#14102B" stroke-width="4" stroke-linejoin="round"/></svg>',
  };

  // ------------------------------------------------------------------ state
  let root = null, menuLayer = null, menuBox = null, hudLayer = null, ovlLayer = null;
  let active = null;      // current menu screen
  let ovl = null;         // current overlay handler (results / pause / gp final) — takes key priority
  let inited = false;
  const flow = { mode: 'gp', cc: 100, driver: null, thrower: null, kart: null };

  // ------------------------------------------------------------------ menu engine
  function clearMenus() {
    menuBox.innerHTML = '';
  }
  function refreshIdx(scr, silent) {
    scr.items.forEach((it, i) => it.classList.toggle('on', i === scr.idx));
    if (!silent) snd('menu_move');
    if (scr.onFocus) scr.onFocus(scr.idx);
  }
  function setIdx(scr, i, silent) {
    if (i === scr.idx && silent !== true) return;
    scr.idx = i;
    refreshIdx(scr, silent);
  }
  function mount(scr) {
    clearMenus();
    menuLayer.classList.remove('hidden');
    menuBox.appendChild(scr.el);
    active = scr;
    scr.idx = scr.idx || 0;
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
    } else moveIdx(active, act);
  }

  function screenEl(cls, title, sub, withHint) {
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
    if (withHint !== false) {
      el.appendChild($('div', 'nav-hint', '<span><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> Move</span><span><kbd>Enter</kbd> Select</span><span><kbd>Esc</kbd> Back</span>'));
    }
    return el;
  }
  const controlsHint = () => $('div', 'nav-hint controls', '<span><b>Arrows/WASD</b> drive</span><span>·</span><span><b>Shift</b> drift</span><span>·</span><span><b>E</b> item</span><span>·</span><span><b>Q</b> swap riders</span><span>·</span><span><b>Esc</b> pause</span>');

  // ------------------------------------------------------------------ screens
  function showTitle() {
    G.UI.init();
    hideOverlays();
    try { G.Sound && G.Sound.playMusic && G.Sound.playMusic('menu'); } catch (e) {}
    const el = $('section', 'screen title');
    const logo = $('div', 'logo');
    const spans = (t, o) => t.split('').map((ch, i) => '<span style="--i:' + (i + o) + '">' + ch + '</span>').join('');
    logo.innerHTML = '<span class="l1">' + spans('TURBO', 0) + '</span><span class="l2">' + spans('TANDEM', 5) + '</span><div class="bolt">' + ICONS.bolt + '</div>';
    el.appendChild(logo);
    el.appendChild($('div', 'subtitle', '<span>DOUBLE TROUBLE GRAND PRIX</span>'));
    el.appendChild($('div', 'press', 'PRESS ENTER / CLICK TO START'));
    el.appendChild($('div', 'sticker', '<div>2 RIDERS<em>1</em>KART</div>'));
    el.appendChild(controlsHint());
    const scr = { el, items: [], cols: 1, idx: 0, pick: () => showMode() };
    el.addEventListener('click', () => { if (active === scr && !ovl) { initSound(); snd('menu_select'); showMode(); } });
    mount(scr);
  }

  function showMode() {
    const el = screenEl('mode', 'CHOOSE MODE', 'how do you want to race?');
    const col = $('div', 'btn-col');
    const defs = [
      { id: 'gp', t: 'GRAND PRIX', s: 'Four tracks · points · cup glory', ic: 'trophy', c: 'var(--tang)' },
      { id: 'race', t: 'SINGLE RACE', s: 'Pick any track · one lap of fun', ic: 'flag', c: 'var(--cyan)' },
      { id: 'tt', t: 'TIME TRIAL', s: 'You versus the clock', ic: 'clock', c: 'var(--grape)' },
    ];
    const items = defs.map((d) => {
      const b = $('div', 'btn', ICONS[d.ic] + '<div class="tx"><b>' + d.t + '</b><i>' + d.s + '</i></div>');
      b.style.setProperty('--c', d.c);
      col.appendChild(b);
      return b;
    });
    el.appendChild(col);
    el.appendChild(controlsHint());
    mount({ el, items, cols: 1, idx: Math.max(0, defs.findIndex((d) => d.id === flow.mode)), pick: (i) => { flow.mode = defs[i].id; showCC(); }, back: showTitle });
  }

  function showCC() {
    const el = screenEl('cc', 'ENGINE CLASS', 'faster engine, tougher rivals');
    const row = $('div', 'cc-row');
    const defs = [
      { cc: 50, nm: 'CRUISER', a: -52, f: 28, c: 'var(--cyan)' },
      { cc: 100, nm: 'SPEEDSTER', a: 8, f: 60, c: 'var(--lemon)' },
      { cc: 150, nm: 'MAYHEM', a: 68, f: 92, c: 'var(--tang)' },
    ];
    const items = defs.map((d) => {
      let ticks = '';
      for (let i = 0; i <= 8; i++) {
        const a = (-90 + i * 22.5) * Math.PI / 180;
        ticks += '<line x1="' + (100 + Math.sin(a) * 70).toFixed(1) + '" y1="' + (100 - Math.cos(a) * 70).toFixed(1) + '" x2="' + (100 + Math.sin(a) * 60).toFixed(1) + '" y2="' + (100 - Math.cos(a) * 60).toFixed(1) + '" stroke="#14102B" stroke-width="3" stroke-linecap="round"/>';
      }
      const card = $('div', 'card cc-card', '<div class="in"><svg viewBox="0 0 200 116">' +
        '<path d="M20 100A80 80 0 0 1 180 100" fill="none" class="arc-bg" stroke-width="16" stroke-linecap="round" pathLength="100"/>' +
        '<path d="M20 100A80 80 0 0 1 180 100" fill="none" stroke="' + d.c.replace('var(--cyan)', '#19E3FF').replace('var(--lemon)', '#FFE14D').replace('var(--tang)', '#FF6B1A') + '" stroke-width="16" stroke-linecap="round" pathLength="100" stroke-dasharray="' + d.f + ' 100"/>' +
        '<path d="M20 100A80 80 0 0 1 180 100" fill="none" stroke="#14102B" stroke-width="3" opacity=".9" transform="translate(0 0)" pathLength="100" stroke-dasharray="0 100"/>' +
        ticks + '<g class="needle" style="--a:' + d.a + 'deg"><path d="M95 100 100 26 105 100z" fill="#14102B"/></g><circle cx="100" cy="100" r="9" fill="#FF6B1A" stroke="#14102B" stroke-width="4"/></svg>' +
        '<div class="big">' + d.cc + '<small>cc</small></div><div class="nm" style="--c:' + d.c + '">' + d.nm + '</div></div>');
      row.appendChild(card);
      return card;
    });
    el.appendChild(row);
    mount({ el, items, cols: 3, idx: Math.max(0, defs.findIndex((d) => d.cc === flow.cc)), pick: (i) => { flow.cc = defs[i].cc; showChars(false); }, back: showMode });
  }

  function showChars(keep) {
    if (!keep) { flow.driver = null; flow.thrower = null; } else flow.thrower = null;
    const list = chars();
    const el = $('section', 'screen chars');
    const top = $('div', 'char-top');
    top.innerHTML = '<div class="hd"><h1>PICK YOUR PAIR</h1><small>driver steers · thrower slings items</small></div>';
    const slots = $('div', 'slots');
    const sD = $('div', 'slot d', '<div class="lbl">DRIVER</div><div class="pic q">?</div><div class="nm">---</div>');
    const sT = $('div', 'slot t', '<div class="lbl">THROWER</div><div class="pic q">?</div><div class="nm">---</div>');
    slots.appendChild(sD); slots.appendChild(sT);
    top.appendChild(slots);
    el.appendChild(top);
    const grid = $('div', 'char-grid');
    const items = [];
    list.forEach((c) => {
      const sp = c.special ? itemName(c.special) : '';
      const card = $('div', 'card char-card', '<div class="in"><div class="pt"></div><div class="info"><div class="nm"></div><span class="badge ' + c.weight + '">' + c.weight + '</span><div class="sp"></div></div></div>');
      card.querySelector('.pt').appendChild(portrait(c.id));
      card.querySelector('.nm').textContent = c.name;
      card.querySelector('.sp').textContent = sp;
      if (!sp) card.querySelector('.sp').style.display = 'none';
      grid.appendChild(card); items.push(card);
    });
    const rnd = $('div', 'card rand-card', '<div class="in"><span class="dice"></span>RANDOM<span class="dice"></span></div>');
    grid.appendChild(rnd); items.push(rnd);
    el.appendChild(grid);
    el.appendChild($('div', 'nav-hint', '<span><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> Move</span><span><kbd>Enter</kbd> Pick</span><span><kbd>Esc</kbd> Undo / Back</span>'));

    const fillSlot = (slot, id, role) => {
      const pic = slot.querySelector('.pic'), nm = slot.querySelector('.nm');
      if (!id) { pic.className = 'pic q'; pic.innerHTML = '?'; nm.innerHTML = '---'; return; }
      pic.className = 'pic'; pic.innerHTML = ''; pic.appendChild(portrait(id));
      const c = charById(id);
      nm.innerHTML = ''; nm.textContent = charName(id);
      const sm = $('small'); sm.textContent = c && c.special ? itemName(c.special) : role; nm.appendChild(sm);
    };
    const refresh = () => {
      fillSlot(sD, flow.driver, 'driver'); fillSlot(sT, flow.thrower, 'thrower');
      sD.classList.toggle('act', !flow.driver); sT.classList.toggle('act', !!flow.driver && !flow.thrower);
      items.forEach((card, i) => {
        const old = card.querySelector('.pick'); if (old) old.remove();
        const c = list[i];
        card.classList.remove('dis');
        if (!c) return;
        if (c.id === flow.driver) { card.appendChild($('div', 'pick d', 'DRIVER')); if (!flow.thrower) card.classList.add('dis'); }
        if (c.id === flow.thrower) card.appendChild($('div', 'pick t', 'THROWER'));
      });
    };
    refresh();
    let busy = false;
    const scr = {
      el, items, cols: 4, idx: 0,
      pick(i) {
        if (busy) return;
        let id;
        if (i >= list.length) {
          const pool = list.filter((c) => c.id !== flow.driver);
          if (!pool.length) return;
          id = pool[Math.floor(Math.random() * pool.length)].id;
        } else id = list[i].id;
        if (flow.driver && id === flow.driver) {
          snd('menu_back');
          const card = items[i]; card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
          return;
        }
        if (!flow.driver) { flow.driver = id; refresh(); return; }
        flow.thrower = id; refresh(); busy = true;
        setTimeout(() => { busy = false; if (active === scr) showKarts(); }, 420);
      },
      back() {
        if (busy) return;
        if (flow.thrower) { flow.thrower = null; refresh(); }
        else if (flow.driver) { flow.driver = null; refresh(); }
        else showCC();
      },
    };
    mount(scr);
  }

  function showKarts() {
    const w = pairWeight(flow.driver, flow.thrower);
    let karts = (G.KARTS || []).filter((k) => k.weight === w);
    if (!karts.length) karts = (G.KARTS || []).slice();
    const el = $('section', 'screen karts');
    const top = $('div', 'char-top');
    top.innerHTML = '<div class="hd"><h1>PICK A KART</h1><small>built for ' + w + ' duos</small></div>';
    const chip = $('div', 'pair-chip');
    const pa = $('div', 'pic'); pa.appendChild(portrait(flow.driver));
    const pb = $('div', 'pic'); pb.appendChild(portrait(flow.thrower));
    chip.appendChild(pa); chip.appendChild($('span', 'plus', '+')); chip.appendChild(pb);
    chip.appendChild($('div', 'cls', w.toUpperCase() + '<small>' + charName(flow.driver) + ' &amp; ' + charName(flow.thrower) + '</small>'));
    top.appendChild(chip);
    el.appendChild(top);
    const row = $('div', 'kart-row');
    const stats = [['speed', 'Speed'], ['accel', 'Accel'], ['handling', 'Handling'], ['mass', 'Weight']];
    const items = karts.map((k) => {
      let st = '';
      stats.forEach(([key, lab]) => {
        let segs = '';
        for (let i = 1; i <= 5; i++) segs += '<i class="seg' + (i <= (k[key] || 0) ? ' f' : '') + '"></i>';
        st += '<div class="stat ' + key + '"><label>' + lab + '</label><div class="segs">' + segs + '</div></div>';
      });
      const card = $('div', 'card kart-card', '<div class="in"><div class="stage"><div class="kart"><div class="seat"></div><div class="body"></div><div class="nose"></div><div class="stripe"></div><div class="w a"></div><div class="w b"></div></div></div><div class="nm"></div><div class="cls">' + k.weight + ' class</div>' + st + '</div>');
      card.querySelector('.kart').style.setProperty('--kc', k.color || '#FF6B1A');
      card.querySelector('.nm').textContent = k.name;
      row.appendChild(card);
      return card;
    });
    el.appendChild(row);
    el.appendChild($('div', 'nav-hint', '<span><kbd>←</kbd><kbd>→</kbd> Browse</span><span><kbd>Enter</kbd> Select</span><span><kbd>Esc</kbd> Back</span>'));
    mount({
      el, items, cols: Math.max(1, items.length), idx: Math.max(0, karts.findIndex((k) => k.id === flow.kart)),
      pick(i) { if (!karts[i]) return; flow.kart = karts[i].id; if (flow.mode === 'gp') showCups(); else showTracks(); },
      back() { showChars(true); },
    });
  }

  const THEMES = { meadow: 1, dunes: 1, glacier: 1, starlight: 1 };
  const themeOf = (trackId) => {
    const t = (G.TRACKS || []).find((x) => x.id === trackId);
    return t && THEMES[t.theme] ? t.theme : t && THEMES[t.id] ? t.id : 'unk';
  };

  function launch(extra) {
    const config = Object.assign({ mode: flow.mode, cc: flow.cc, front: flow.driver, rear: flow.thrower, kart: flow.kart }, extra);
    G.UI.hideMenus();
    if (G.Game && G.Game.start) G.Game.start(config);
    else console.log('G.Game.start', config);
  }

  function showCups() {
    const cups = G.CUPS || [];
    const el = screenEl('cups', 'CHOOSE CUP', 'four tracks · points decide the champ');
    const row = $('div', 'track-grid');
    const items = cups.map((c) => {
      const th = (c.tracks || []).map((t) => '<div class="thumb mini ' + themeOf(t) + '"></div>').join('');
      const card = $('div', 'card cup-card', '<div class="in"><div class="thumbs">' + th + '</div><div class="nm"></div><div class="sub">' + (c.tracks || []).length + ' races</div></div>');
      card.appendChild($('div', 'cupico', ICONS.trophy));
      card.querySelector('.nm').textContent = c.name;
      row.appendChild(card);
      return card;
    });
    el.appendChild(row);
    mount({ el, items, cols: Math.max(1, items.length), idx: 0, pick: (i) => launch({ cup: cups[i].id }), back: showKarts });
  }

  function showTracks() {
    const tracks = G.TRACKS || [];
    const el = screenEl('tracks', flow.mode === 'tt' ? 'TIME TRIAL' : 'CHOOSE TRACK', flow.mode === 'tt' ? 'pick a track and beat the clock' : 'where are we racing?');
    const row = $('div', 'track-grid');
    const items = tracks.map((t, i) => {
      const card = $('div', 'card track-card', '<div class="num">' + (i + 1) + '</div><div class="in"><div class="thumb ' + themeOf(t.id) + '"></div><div class="nm"></div><div class="sub"><span></span><span>' + (t.laps || 3) + ' laps</span></div></div>');
      card.querySelector('.nm').textContent = t.name;
      card.querySelector('.sub span').textContent = t.theme || '';
      row.appendChild(card);
      return card;
    });
    el.appendChild(row);
    mount({ el, items, cols: Math.max(1, Math.min(4, items.length)), idx: 0, pick: (i) => launch({ track: tracks[i].id }), back: showKarts });
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
    panel.innerHTML = '<div class="ph"><h1>PAUSED</h1></div><div class="ck checker"></div>';
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

  function resultRow(r, i, showPoints) {
    const row = $('div', 'res-row' + (r.isPlayer ? ' me' : '') + (r.pos === 1 ? ' r1' : ''));
    row.style.setProperty('--i', i);
    const pt = showPoints ? '<div class="pt">' + (r.points != null ? '+' + r.points : '') + (r.total != null ? '<small>' + r.total + ' pts</small>' : '') + '</div>' : '';
    row.innerHTML = '<div class="p">' + (r.pos || i + 1) + ordinal(r.pos || i + 1) + '</div><div class="kc"></div><div class="nm"></div><div class="tm"></div>' + pt;
    row.querySelector('.kc').style.setProperty('--kc', r.kartColor || '#888');
    row.querySelector('.nm').textContent = r.name || '';
    row.querySelector('.tm').textContent = r.time == null ? '' : fmtTime(r.time);
    return row;
  }

  function showResults(rows, opts, onContinue) {
    G.UI.init();
    opts = opts || {};
    hideOverlays();
    rows = rows || [];
    const el = $('div', 'ovl');
    el.appendChild($('div', 'scrim'));
    el.appendChild($('div', 'res-title', '<h1></h1>'));
    el.querySelector('h1').textContent = opts.title || 'RESULTS';
    const table = $('div', 'res-table');
    if (opts.showPoints) table.style.setProperty('--pcols', '13rem');
    rows.forEach((r, i) => table.appendChild(resultRow(r, i, !!opts.showPoints)));
    el.appendChild(table);
    el.appendChild($('div', 'cont', 'PRESS ENTER / CLICK TO CONTINUE'));
    ovlLayer.appendChild(el);
    let done = false;
    const go = () => { if (done) return; done = true; snd('menu_select'); closeOverlay(o); if (onContinue) onContinue(); };
    const o = { key(a) { if (a === 'ok' || a === 'back') go(); } };
    // slight delay before click can dismiss (avoid accidental skip)
    const born = performance.now();
    el.addEventListener('click', () => { if (performance.now() - born > 500) go(); });
    ovl = o;
    try { G.Sound && G.Sound.playMusic && G.Sound.playMusic('results'); } catch (e) {}
  }

  const trophyHTML = (sm, shine) => '<div class="trophy' + (sm ? ' sm' : '') + (shine ? ' shine' : '') + '"><div class="h l"></div><div class="h r"></div><div class="cup"></div><div class="stem"></div><div class="base"></div></div>';

  function showGPFinal(standings, onDone) {
    G.UI.init();
    hideOverlays();
    standings = (standings || []).slice();
    standings.forEach((r, i) => { if (r.pos == null) r.pos = i + 1; });
    standings.sort((a, b) => a.pos - b.pos);
    const el = $('div', 'ovl');
    el.appendChild($('div', 'scrim'));
    const conf = $('div', 'confetti');
    const cols = ['#FF6B1A', '#19E3FF', '#6B2BFF', '#FFE14D', '#FFF6E0'];
    for (let i = 0; i < 40; i++) {
      const c = $('i');
      c.style.cssText = '--x:' + (Math.random() * 100).toFixed(1) + '%;--c:' + cols[i % 5] + ';--t:' + (3 + Math.random() * 3).toFixed(2) + 's;--dl:-' + (Math.random() * 5).toFixed(2) + 's;--dx:' + ((Math.random() - .5) * 10).toFixed(1) + 'rem';
      conf.appendChild(c);
    }
    el.appendChild(conf);
    el.appendChild($('div', 'res-title gp-title', '<h1>GRAND PRIX RESULTS</h1>'));
    const pod = $('div', 'podium');
    const order = [2, 1, 3];
    order.forEach((p) => {
      const r = standings.find((x) => x.pos === p);
      if (!r) return;
      const col = $('div', 'pcol p' + p);
      col.style.setProperty('--d', p === 1 ? 900 : p === 2 ? 450 : 100);
      col.innerHTML = '<div class="who' + (r.isPlayer ? ' me' : '') + '"></div>' + trophyHTML(false, p === 1) + '<div class="blk"><span>' + p + '</span></div>';
      const who = col.querySelector('.who');
      who.textContent = r.name || '';
      const sm = $('small'); sm.textContent = (r.total != null ? r.total + ' PTS' : '') + (r.isPlayer ? ' · YOU' : ''); who.appendChild(sm);
      pod.appendChild(col);
    });
    el.appendChild(pod);
    const rest = standings.filter((r) => r.pos > 3);
    const me = standings.find((r) => r.isPlayer);
    if (me && me.pos > 3) {
      el.appendChild($('div', 'yourplace', 'YOU FINISHED ' + me.pos + ordinal(me.pos)));
    }
    if (rest.length) {
      const wrap = $('div', 'gp-rest');
      rest.forEach((r) => {
        const c = $('div', 'gp-chip' + (r.isPlayer ? ' me' : ''), '<b>' + r.pos + ordinal(r.pos) + '</b><span class="kc"></span><span></span>' + (r.total != null ? '<span>' + r.total + ' pts</span>' : ''));
        c.querySelector('.kc').style.setProperty('--kc', r.kartColor || '#888');
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

  // ------------------------------------------------------------------ G.UI
  G.UI = {
    init() {
      if (inited) return;
      inited = true;
      root = document.getElementById('ui');
      if (!root) { root = $('div'); root.id = 'ui'; document.body.appendChild(root); }
      menuLayer = $('div'); menuLayer.id = 'menus';
      const bg = $('div', 'menu-bg', '<div class="stripes"></div><div class="dots halftone"></div><div class="vig"></div><div class="strip t checker"></div><div class="strip b checker"></div>');
      menuLayer.appendChild(bg);
      menuBox = $('div'); menuBox.style.cssText = 'position:absolute;inset:0';
      menuLayer.appendChild(menuBox);
      menuLayer.classList.add('hidden');
      hudLayer = buildHUD();
      hudLayer.classList.add('hidden');
      ovlLayer = $('div'); ovlLayer.id = 'overlays'; ovlLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none';
      ovlLayer.addEventListener('pointerdown', () => {}, { passive: true });
      root.appendChild(menuLayer); root.appendChild(hudLayer); root.appendChild(ovlLayer);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('pointerdown', initSound, { passive: true });
      HUD.setup();
    },
    showTitle,
    hideMenus() {
      if (!inited) return;
      active = null;
      menuLayer.classList.add('hidden');
      clearMenus();
    },
    showPause,
    hidePause,
    showGPFinal,
  };

  // ------------------------------------------------------------------ HUD
  const ref = {};          // cached DOM refs
  const last = {};         // last-written values
  let hudVisible = false;
  let mini = null;         // { off, ctx, sx(x), sy(z), s }
  let roulKeys = null;
  const roulFrame = [-1, -1];
  const SLOT_KEYS = ['slot0', 'slot1'];

  function buildHUD() {
    const hud = $('div'); hud.id = 'hud';
    // top-left
    const tl = $('div', 'hud-tl');
    tl.innerHTML = '<div class="plate lap"><span>LAP<b>1</b><span class="of">/3</span></span></div><div class="plate timer"><span>00:00.00</span></div><div class="laptimes"></div>';
    hud.appendChild(tl);
    // top-right item slots
    const tr = $('div', 'hud-tr');
    const mk = (cls) => '<div class="slotwrap ' + cls + '"><div class="ibub empty"><div class="ic"></div><div class="cnt hidden"></div></div><div class="rname">---</div></div>';
    tr.innerHTML = mk('big') + mk('small');
    hud.appendChild(tr);
    // bottom-right: speedo + position
    const br = $('div', 'hud-br');
    br.innerHTML = '<div class="speedo"><div class="flame">' + ICONS.flame + '</div><svg viewBox="0 0 200 118"><path class="trk" d="M15 105A85 85 0 0 1 185 105" fill="none" stroke-width="26" stroke-linecap="round"/><path class="gauge" d="M15 105A85 85 0 0 1 185 105" fill="none" stroke-width="16" stroke-linecap="round" opacity=".28"/><path class="fill" d="M15 105A85 85 0 0 1 185 105" fill="none" stroke-width="16" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100"/></svg><div class="kmh">0<small>KM/H</small></div></div><div class="pos" data-p="1"><span class="n">1</span><span class="s">st</span><span class="of">OF 8</span></div>';
    hud.appendChild(br);
    // bottom-left minimap
    const bl = $('div', 'hud-bl');
    bl.innerHTML = '<div class="mini-wrap"><canvas width="256" height="256"></canvas></div>';
    hud.appendChild(bl);
    // center
    const c = $('div', 'hud-c');
    c.innerHTML = '<div class="count"></div><div class="banner"><span></span></div><div class="wrong">' + ICONS.arrow + '<span>WRONG WAY</span></div>';
    hud.appendChild(c);
    return hud;
  }

  const HUD = {
    setup() {
      const q = (s) => hudLayer.querySelector(s);
      ref.lap = q('.lap'); ref.lapNum = q('.lap b'); ref.lapOf = q('.lap .of');
      ref.timer = q('.timer span'); ref.lapTimes = q('.laptimes');
      const wraps = hudLayer.querySelectorAll('.slotwrap');
      ref.slots = [0, 1].map((i) => ({
        wrap: wraps[i], bub: wraps[i].querySelector('.ibub'), ic: wraps[i].querySelector('.ic'), cnt: wraps[i].querySelector('.cnt'), nm: wraps[i].querySelector('.rname'),
      }));
      ref.speedo = q('.speedo'); ref.fill = q('.speedo .fill'); ref.kmh = q('.speedo .kmh');
      ref.kmhText = document.createTextNode('0'); ref.kmh.insertBefore(ref.kmhText, ref.kmh.firstChild); ref.kmh.removeChild(ref.kmh.childNodes[1]);
      ref.pos = q('.pos'); ref.posN = q('.pos .n'); ref.posS = q('.pos .s'); ref.posOf = q('.pos .of');
      ref.canvas = q('.mini-wrap canvas'); ref.ctx = ref.canvas.getContext('2d');
      ref.count = q('.count'); ref.banner = q('.banner'); ref.bannerTx = q('.banner span'); ref.wrong = q('.wrong');
      last.time = last.lap = last.laps = last.pos = last.count = last.speed = last.drift = last.boost = last.wrong = last.final = last.lapTimes = last.racers = null;
      last.slot = [null, null]; last.cnt = [null, null]; last.nm = [null, null]; last.roul = [false, false];
      ref.anims = {};
    },
    show() { G.UI.init(); hudVisible = true; hudLayer.classList.remove('hidden'); },
    hide() {
      if (!inited) return;
      hudVisible = false; hudLayer.classList.add('hidden');
      ['count', 'banner', 'pos'].forEach((k) => { if (ref.anims[k]) { ref.anims[k].cancel(); ref.anims[k] = null; } });
      for (const k in last) last[k] = Array.isArray(last[k]) ? last[k].map(() => null) : null;
      last.roul = [false, false];
    },
    setMinimap(m) {
      G.UI.init();
      mini = null;
      if (!m || !m.points || !m.points.length || !m.bounds) return;
      const W = 256, pad = 26, b = m.bounds;
      const w = Math.max(1, b.maxX - b.minX), h = Math.max(1, b.maxZ - b.minZ);
      const s = (W - pad * 2) / Math.max(w, h);
      const ox = (W - w * s) / 2, oy = (W - h * s) / 2;
      const sx = (x) => ox + (b.maxX - x) * s, sy = (z) => oy + (b.maxZ - z) * s; // top-down, +Z up
      const off = document.createElement('canvas'); off.width = off.height = W;
      const c = off.getContext('2d');
      const trace = () => { c.beginPath(); m.points.forEach((p, i) => (i ? c.lineTo(sx(p.x), sy(p.z)) : c.moveTo(sx(p.x), sy(p.z)))); c.closePath(); };
      c.lineJoin = c.lineCap = 'round';
      trace(); c.strokeStyle = '#14102B'; c.lineWidth = 17; c.stroke();
      trace(); c.strokeStyle = '#FFF6E0'; c.lineWidth = 10; c.stroke();
      trace(); c.strokeStyle = '#FF6B1A'; c.lineWidth = 3; c.setLineDash([2, 12]); c.stroke(); c.setLineDash([]);
      // start/finish tick
      const p0 = m.points[0], p1 = m.points[1] || m.points[0];
      let dx = sx(p1.x) - sx(p0.x), dy = sy(p1.z) - sy(p0.z); const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      c.save(); c.translate(sx(p0.x), sy(p0.z)); c.rotate(Math.atan2(dy, dx));
      c.fillStyle = '#14102B'; c.fillRect(-2, -10, 4, 20);
      c.fillStyle = '#fff'; c.fillRect(-2, -10, 4, 5); c.fillRect(-2, 0, 4, 5);
      c.restore();
      mini = { off, sx, sy };
      drawMini(null);
    },
    update(s) {
      if (!hudVisible || !s) return;
      // lap
      const lap = Math.max(1, Math.min(s.lap | 0, s.laps || 99)), laps = s.laps || 3;
      if (lap !== last.lap) { last.lap = lap; ref.lapNum.textContent = lap; }
      if (laps !== last.laps) { last.laps = laps; ref.lapOf.textContent = '/' + laps; }
      const fin = !!s.finalLap;
      if (fin !== last.final) { last.final = fin; ref.lap.classList.toggle('final', fin); }
      // timer
      const ts = fmtTime(s.time || 0);
      if (ts !== last.time) { last.time = ts; ref.timer.textContent = ts; }
      // lap times
      if (s.lapTimes) {
        const lt = s.lapTimes.length ? s.lapTimes.map((t, i) => 'L' + (i + 1) + '  ' + fmtTime(t)).join('\n') : '';
        if (lt !== last.lapTimes) { last.lapTimes = lt; ref.lapTimes.textContent = lt; }
      }
      // position
      const pos = s.position | 0;
      if (pos !== last.pos) {
        const first = last.pos == null;
        last.pos = pos;
        ref.posN.textContent = pos; ref.posS.textContent = ordinal(pos);
        ref.pos.setAttribute('data-p', pos > 4 ? 4 : pos);
        if (!first && ref.pos.animate) {
          if (ref.anims.pos) ref.anims.pos.cancel();
          ref.anims.pos = ref.pos.animate([{ transform: 'scale(1.9) rotate(-10deg)' }, { transform: 'scale(.9) rotate(2deg)', offset: .55 }, { transform: 'scale(1) rotate(0)' }], { duration: 520, easing: 'cubic-bezier(.3,1.4,.5,1)' });
        }
      }
      if (s.racerCount !== last.racers) { last.racers = s.racerCount; ref.posOf.textContent = 'OF ' + (s.racerCount || 8); }
      // speedometer
      const sp = G.clamp(s.speed01 || 0, 0, 1.2);
      const spq = Math.round(sp * 100);
      if (spq !== last.speed) {
        last.speed = spq;
        ref.fill.setAttribute('stroke-dasharray', Math.min(100, spq) + ' 100');
        ref.kmhText.nodeValue = Math.round(sp * 160);
      }
      const dl = s.driftLevel | 0;
      if (dl !== last.drift) { last.drift = dl; ref.speedo.setAttribute('data-d', dl); }
      const bo = !!s.boost;
      if (bo !== last.boost) { last.boost = bo; ref.speedo.classList.toggle('boost', bo); }
      // wrong way
      const ww = !!s.wrongWay;
      if (ww !== last.wrong) { last.wrong = ww; ref.wrong.classList.toggle('on', ww); }
      // items
      updateSlot(0, s, s.rear);
      updateSlot(1, s, s.front);
      // minimap
      drawMini(s.minimap);
    },
    countdown(n) {
      G.UI.init();
      const el = ref.count;
      el.textContent = n > 0 ? String(n) : 'GO!';
      el.className = 'count ' + (n > 0 ? 'c' + n : 'go');
      if (ref.anims.count) ref.anims.count.cancel();
      if (el.animate) {
        ref.anims.count = el.animate([
          { transform: 'scale(3) rotate(-10deg)', opacity: 0 },
          { transform: 'scale(1) rotate(0deg)', opacity: 1, offset: .2 },
          { transform: 'scale(1.1) rotate(1deg)', opacity: 1, offset: .75 },
          { transform: 'scale(.6) rotate(0deg)', opacity: 0 },
        ], { duration: n > 0 ? 950 : 1300, easing: 'cubic-bezier(.2,.9,.3,1.1)', fill: 'both' });
      } else el.style.opacity = 1;
    },
    banner(text, kind) {
      G.UI.init();
      ref.banner.className = 'banner ' + (kind || 'info');
      ref.bannerTx.textContent = text;
      if (ref.anims.banner) ref.anims.banner.cancel();
      const dur = kind === 'finish' ? 4200 : 2300;
      if (ref.banner.animate) {
        ref.anims.banner = ref.banner.animate([
          { transform: 'translateX(-60rem) scale(.6)', opacity: 0 },
          { transform: 'translateX(1.5rem) scale(1.08)', opacity: 1, offset: .12 },
          { transform: 'translateX(0) scale(1)', opacity: 1, offset: .2 },
          { transform: 'translateX(0) scale(1)', opacity: 1, offset: .82 },
          { transform: 'translateX(60rem) scale(.8)', opacity: 0 },
        ], { duration: dur, easing: 'ease-out', fill: 'both' });
      } else { ref.banner.style.opacity = 1; setTimeout(() => { ref.banner.style.opacity = 0; }, dur); }
    },
    showResults,
  };
  G.HUD = HUD;

  function iconHTML(id) {
    const it = G.ITEMS && G.ITEMS[id];
    if (it && it.icon) return /^\s*</.test(it.icon) ? it.icon : '<span class="lbl">' + it.icon + '</span>';
    return '<span class="lbl">' + (id ? String(id).slice(0, 3).toUpperCase() : '?') + '</span>';
  }

  function updateSlot(i, s, riderId) {
    const r = ref.slots[i];
    const id = (s.items && s.items[i]) || null;
    const rolling = !!(s.roulette && s.roulette[i]);
    // rider name label
    const nm = riderId ? charName(riderId) : '';
    if (nm !== last.nm[i]) { last.nm[i] = nm; r.nm.textContent = nm || '---'; }
    if (rolling !== last.roul[i]) {
      last.roul[i] = rolling;
      r.bub.classList.toggle('roul', rolling);
      if (!rolling) last.slot[i] = '__reset';
      else { last.slot[i] = '__roll'; r.bub.classList.remove('empty'); }
    }
    if (rolling) {
      if (!roulKeys) {
        roulKeys = G.ITEMS ? Object.keys(G.ITEMS) : [];
        if (!roulKeys.length) roulKeys = ['?'];
      }
      const f = Math.floor(performance.now() / 70);
      if (f !== roulFrame[i]) {
        roulFrame[i] = f;
        r.ic.innerHTML = iconHTML(roulKeys[(f + i * 5) % roulKeys.length]);
      }
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
    if (!mini || !ref.ctx) return;
    const c = ref.ctx;
    c.clearRect(0, 0, 256, 256);
    c.drawImage(mini.off, 0, 0);
    const ks = m && m.karts;
    if (!ks) return;
    let pl = null;
    c.lineWidth = 3; c.strokeStyle = '#14102B';
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i];
      if (k.isPlayer) { pl = k; continue; }
      c.beginPath(); c.arc(mini.sx(k.x), mini.sy(k.z), 7, 0, 6.2832);
      c.fillStyle = k.color || '#19E3FF'; c.fill(); c.stroke();
    }
    if (pl) {
      const x = mini.sx(pl.x), y = mini.sy(pl.z);
      c.beginPath(); c.arc(x, y, 13, 0, 6.2832); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 4; c.stroke();
      c.beginPath(); c.arc(x, y, 8, 0, 6.2832); c.fillStyle = pl.color || '#FF6B1A'; c.fill(); c.lineWidth = 2.5; c.stroke();
    }
  }
})();
