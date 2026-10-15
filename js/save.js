// Save data + unlocks + Time Trial records -> G.Save. Persisted to localStorage 'tt-save-v2'.
// Every storage access is try/catch'd; with storage unavailable everything still works in memory.
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  const KEY = 'tt-save-v2';
  const VERSION = 2;
  const GHOST_MAX_CHARS = 250 * 1024;
  const BASE_UNLOCKED = new Set(['cup:mushroom', 'cup:flower', 'cup:star', 'cc:50', 'cc:100']);
  const CUPS_BASE = ['mushroom', 'flower', 'star'];

  let store = null;   // loaded lazily on first access (never touches storage at script load)

  function defaults() {
    return {
      v: VERSION,
      unlocked: {},    // key -> true
      gp: {},          // 'cup@cc' -> best place
      records: {},     // trackId -> { total, lap }
      ghosts: {},      // trackId -> { at, data }   (only for the best total)
      settings: { musicVol: 0.8, sfxVol: 0.9, itemFreq: 'normal' },
    };
  }

  function isObj(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  function load() {
    const d = defaults();
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return d;
      const p = JSON.parse(raw);
      if (!isObj(p) || p.v !== VERSION) return d;
      if (isObj(p.unlocked)) d.unlocked = p.unlocked;
      if (isObj(p.gp)) d.gp = p.gp;
      if (isObj(p.records)) d.records = p.records;
      if (isObj(p.ghosts)) d.ghosts = p.ghosts;
      if (isObj(p.settings)) {
        for (const k in d.settings) if (typeof p.settings[k] === typeof d.settings[k]) d.settings[k] = p.settings[k];
      }
    } catch (e) { /* unreadable or unavailable: start fresh */ }
    return d;
  }

  function ensure() {
    if (!store) store = load();
    return store;
  }

  function isQuotaError(e) {
    return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      e.code === 22 || e.code === 1014);
  }

  // drop the oldest stored ghost; false when there are none left
  function dropOldestGhost() {
    let oldest = null;
    let oldestAt = Infinity;
    for (const id in store.ghosts) {
      const g = store.ghosts[id];
      const at = g && typeof g.at === 'number' ? g.at : 0;
      if (oldest === null || at < oldestAt) { oldest = id; oldestAt = at; }
    }
    if (oldest === null) return false;
    delete store.ghosts[oldest];
    return true;
  }

  function persist() {
    if (!store) return false;
    for (;;) {
      let json;
      try { json = JSON.stringify(store); } catch (e) { return false; }
      try {
        window.localStorage.setItem(KEY, json);
        return true;
      } catch (e) {
        if (!isQuotaError(e) || !dropOldestGhost()) return false;
      }
    }
  }

  function normCC(cc) {
    if (cc === 'mirror') return 150;
    return Number(cc);
  }

  function findById(list, id) {
    if (!list) return null;
    for (let i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }

  function isUnlocked(key) {
    const s = ensure();
    if (s.unlocked[key] || BASE_UNLOCKED.has(key)) return true;
    const sep = key.indexOf(':');
    if (sep < 0) return false;
    const kind = key.slice(0, sep);
    const id = key.slice(sep + 1);
    if (kind === 'char') {
      const c = findById(G.CHARACTERS, id);
      return !!c && !c.locked;
    }
    if (kind === 'kart') {
      const k = findById(G.KARTS, id);
      return !!k && !k.locked;
    }
    return false;
  }

  // gold in this cup at any cc (for the Special Cup rule)
  function goldAnyCC(cup) {
    const gp = ensure().gp;
    return gp[cup + '@50'] === 1 || gp[cup + '@100'] === 1 || gp[cup + '@150'] === 1;
  }

  // Time Trial ghost + best-time records
  function ghostSize(data) {
    try { return JSON.stringify(data).length; } catch (e) { return Infinity; }
  }

  const Save = (G.Save = {
    get data() { return ensure(); },
    get settings() { return ensure().settings; },

    isUnlocked,

    unlock(key) {
      const s = ensure();
      if (isUnlocked(key)) return false;
      s.unlocked[key] = true;
      persist();
      return true;
    },

    unlockAll() {
      const s = ensure();
      const list = G.CHARACTERS || [];
      for (let i = 0; i < list.length; i++) if (list[i]) s.unlocked['char:' + list[i].id] = true;
      const karts = G.KARTS || [];
      for (let i = 0; i < karts.length; i++) if (karts[i]) s.unlocked['kart:' + karts[i].id] = true;
      s.unlocked['cup:special'] = true;
      s.unlocked['cup:allcup'] = true;
      s.unlocked['cc:150'] = true;
      s.unlocked['cc:mirror'] = true;
      persist();
    },

    // call once per cup finish with the player's final place (1 = gold).
    // cc: 50 | 100 | 150 | 'mirror'. Returns the keys newly unlocked by this result.
    recordGP(cupId, cc, place) {
      const s = ensure();
      const c = normCC(cc);
      const newly = [];
      const gpKey = cupId + '@' + c;
      if (typeof place === 'number' && (s.gp[gpKey] === undefined || place < s.gp[gpKey])) s.gp[gpKey] = place;
      const gold = place === 1;
      if (!gold) {
        persist();
        return newly;
      }

      const grant = (key) => {
        if (isUnlocked(key)) return;
        s.unlocked[key] = true;
        newly.push(key);
      };

      // gold any cup at 100cc -> 150cc
      if (c === 100) grant('cc:150');
      // gold Mushroom + Flower + Star (any cc) -> Special Cup
      if (CUPS_BASE.includes(cupId) && CUPS_BASE.every(goldAnyCC)) grant('cup:special');
      // gold Special (any cc) -> All-Cup Tour
      if (cupId === 'special') grant('cup:allcup');
      // gold All-Cup Tour at 150cc -> Mirror
      if (cupId === 'allcup' && c === 150) grant('cc:mirror');
      // each gold at 100cc+ unlocks the next locked kart (parade is reserved for All-Cup 150)
      if (c >= 100) {
        const karts = G.KARTS || [];
        for (let i = 0; i < karts.length; i++) {
          const k = karts[i];
          if (k && k.locked && k.id !== 'parade' && !isUnlocked('kart:' + k.id)) {
            grant('kart:' + k.id);
            break;
          }
        }
      }
      // gold Special at 150cc -> spud / sprout
      if (cupId === 'special' && c === 150) { grant('char:spud'); grant('char:sprout'); }
      // gold All-Cup Tour at 150cc -> thorn / wisp + parade kart
      if (cupId === 'allcup' && c === 150) {
        grant('char:thorn');
        grant('char:wisp');
        grant('kart:parade');
      }

      persist();
      return newly;
    },

    bestTime(trackId) {
      const r = ensure().records[trackId];
      return r && typeof r.total === 'number' ? r.total : null;
    },

    bestLap(trackId) {
      const r = ensure().records[trackId];
      return r && typeof r.lap === 'number' ? r.lap : null;
    },

    // returns true when the total time improved (the ghost is replaced only then)
    setRecord(trackId, total, lap, ghostData) {
      const s = ensure();
      if (typeof total !== 'number' || !isFinite(total)) return false;
      const old = s.records[trackId];
      const improved = !old || total < old.total;
      const hasLap = typeof lap === 'number' && isFinite(lap);
      let bestLap = old && typeof old.lap === 'number' ? old.lap : null;
      if (hasLap && (bestLap === null || lap < bestLap)) bestLap = lap;

      if (improved) {
        s.records[trackId] = { total, lap: bestLap };
        if (ghostData && ghostSize(ghostData) <= GHOST_MAX_CHARS) {
          s.ghosts[trackId] = { at: Date.now(), data: ghostData };
        } else {
          delete s.ghosts[trackId];
        }
      } else if (old) {
        old.lap = bestLap;
      }
      persist();
      return improved;
    },

    ghost(trackId) {
      const g = ensure().ghosts[trackId];
      return g && g.data ? g.data : null;
    },

    persist,

    // wipes all save data (including settings) and removes the stored key
    reset() {
      store = defaults();
      try { window.localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ }
    },
  });

  return Save;
})();
