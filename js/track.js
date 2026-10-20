// Tracks: spline-based closed circuits, road/wall/scenery meshes, query() for physics.
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  // ---------------------------------------------------------------- helpers
  const col = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
  const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const _hc = new THREE.Color();
  const hsl = (h, s, l) => { _hc.setHSL(((h % 1) + 1) % 1, s, l); return [_hc.r, _hc.g, _hc.b]; };
  const mulberry = (a) => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const ICO = {};
  function icoPositions(detail) {
    if (!ICO[detail]) ICO[detail] = new THREE.IcosahedronGeometry(1, detail).attributes.position.array;
    return ICO[detail];
  }

  // ---------------------------------------------------------------- shared textures (cached across tracks, never disposed)
  const TEXCACHE = {};
  function canvasOK() {
    try {
      if (typeof document === 'undefined' || !document.createElement) return false;
      const c = document.createElement('canvas');
      return !!c && typeof c.getContext === 'function' && !!c.getContext('2d');
    } catch (e) { return false; }
  }
  function sharedTex(key, w, h, draw, wrap) {
    if (key in TEXCACHE) return TEXCACHE[key];
    let t = null;
    try {
      if (canvasOK()) {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        draw(c.getContext('2d'), w, h);
        t = new THREE.CanvasTexture(c);
        if (wrap) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
        t.userData = { shared: true };
      }
    } catch (e) { t = null; }
    TEXCACHE[key] = t;
    return t;
  }
  const gfxTex = (name) => (G.GFX && G.GFX.tex && G.GFX.tex[name]) || null;
  // wrap-around speckle noise used by the fallback asphalt
  function genAsphalt(ctx, w, h) {
    const r = mulberry(4242);
    ctx.fillStyle = '#d4d4d4'; ctx.fillRect(0, 0, w, h);
    const dot = (x, y, s, v, a) => {
      ctx.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + a + ')';
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const px = x + ox * w, py = y + oy * h;
        if (px > -s && px < w && py > -s && py < h) ctx.fillRect(px, py, s, s);
      }
    };
    for (let i = 0; i < 90; i++) {            // soft blotches
      const x = r() * w, y = r() * h, s = 14 + r() * 40, v = r() < 0.5 ? 150 : 255;
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const g = ctx.createRadialGradient(x + ox * w, y + oy * h, 0, x + ox * w, y + oy * h, s);
        g.addColorStop(0, 'rgba(' + v + ',' + v + ',' + v + ',0.16)'); g.addColorStop(1, 'rgba(' + v + ',' + v + ',' + v + ',0)');
        ctx.fillStyle = g; ctx.fillRect(x + ox * w - s, y + oy * h - s, s * 2, s * 2);
      }
    }
    for (let i = 0; i < 5200; i++) dot((r() * w) | 0, (r() * h) | 0, r() < 0.8 ? 1 : 2, r() < 0.5 ? 60 + ((r() * 60) | 0) : 230 + ((r() * 25) | 0), 0.25 + r() * 0.4);
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {              // hairline cracks
      let x = r() * w, y = r() * h; ctx.strokeStyle = 'rgba(60,60,60,0.35)'; ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 22; y += (r() - 0.3) * 18; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }
  const asphaltTex = () => gfxTex('asphalt') || sharedTex('asphalt', 256, 256, genAsphalt, true);

  // 2x2 atlas of puffy cloud sprites (each cell 256x128)
  function genClouds(ctx, w, h) {
    const r = mulberry(777), cw = w / 2, ch = h / 2;
    for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) {
      const ox = cx * cw, oy = cy * ch, n = 8 + ((r() * 4) | 0);
      const puffs = [];
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, x = cw * (0.17 + 0.66 * t) + (r() - 0.5) * 12;
        const rad = ch * (0.2 + 0.2 * Math.sin(t * Math.PI) + r() * 0.1);
        puffs.push([x, ch * 0.62 - rad * 0.45 - Math.sin(t * Math.PI) * ch * 0.12 + (r() - 0.5) * 6, rad]);
      }
      const layer = (dy, rgb, a0) => {
        for (const p of puffs) {
          const g = ctx.createRadialGradient(ox + p[0], oy + p[1] + dy, p[2] * 0.15, ox + p[0], oy + p[1] + dy, p[2]);
          g.addColorStop(0, 'rgba(' + rgb + ',' + a0 + ')'); g.addColorStop(0.65, 'rgba(' + rgb + ',' + a0 * 0.75 + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
          ctx.fillStyle = g; ctx.fillRect(ox, oy, cw, ch);
        }
      };
      ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, cw, ch); ctx.clip();
      layer(7, '176,196,226', 0.9);     // shaded underside
      layer(0, '255,255,255', 0.95);    // lit body
      layer(-5, '255,255,255', 0.55);   // bright tops
      // flatten the base
      const g = ctx.createLinearGradient(0, oy + ch * 0.55, 0, oy + ch * 0.9);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = g; ctx.fillRect(ox, oy, cw, ch);
      ctx.restore(); ctx.globalCompositeOperation = 'source-over';
    }
  }
  const cloudTex = () => sharedTex('clouds', 512, 256, genClouds, false);
  function genGlow(ctx, w, h) {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.08, 'rgba(255,255,255,1)'); g.addColorStop(0.11, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.2)'); g.addColorStop(0.6, 'rgba(255,255,255,0.06)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  const sunTex = () => sharedTex('sunglow', 256, 256, genGlow, false);

  // ---- v6 ground textures: tiling, near-neutral (multiplied with vertex colours), macro variation baked in
  function wrapDraw(w, h, fn) { for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) fn(ox * w, oy * h); }
  function genGround(kind) {
    return function (ctx, w, h) {
      const r = mulberry(kind.length * 977 + kind.charCodeAt(0));
      const base = { grass: '#e6ece0', sand: '#f2ebe0', snow: '#f8fbff', dirt: '#e8e0d8', rock: '#dcdcdc' }[kind] || '#eeeeee';
      ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
      const blot = (n, rmin, rmax, rgb, a) => {
        for (let i = 0; i < n; i++) {
          const x = r() * w, y = r() * h, rad = rmin + r() * (rmax - rmin);
          wrapDraw(w, h, (ox, oy) => {
            const px = x + ox, py = y + oy; if (px < -rad || px > w + rad || py < -rad || py > h + rad) return;
            const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
            g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
            ctx.fillStyle = g; ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
          });
        }
      };
      const dots = (n, sz, rgb, a, len) => {
        for (let i = 0; i < n; i++) {
          const x = r() * w, y = r() * h, s = sz * (0.6 + r());
          ctx.fillStyle = 'rgba(' + rgb + ',' + (a * (0.5 + r() * 0.5)) + ')';
          wrapDraw(w, h, (ox, oy) => { const px = x + ox, py = y + oy; if (px > -8 && px < w + 8 && py > -8 && py < h + 8) ctx.fillRect(px, py, s, len ? s * len : s); });
        }
      };
      if (kind === 'grass') {
        blot(36, 40, 90, '170,190,150', 0.22); blot(30, 30, 80, '255,255,235', 0.2);
        // grass clumps: tiny radiating blade strokes, dark core, light tips
        for (let i = 0; i < 260; i++) {
          const x = r() * w, y = r() * h, n = 5 + ((r() * 5) | 0), light = r() < 0.5;
          wrapDraw(w, h, (ox, oy) => {
            const px = x + ox, py = y + oy; if (px < -14 || px > w + 14 || py < -14 || py > h + 14) return;
            ctx.strokeStyle = light ? 'rgba(255,255,230,0.3)' : 'rgba(95,120,85,0.38)'; ctx.lineWidth = 1.2;
            for (let k = 0; k < n; k++) { const a = -Math.PI / 2 + (k / (n - 1) - 0.5) * 2.2, l = 5 + r() * 7; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); ctx.stroke(); }
          });
        }
        dots(5200, 1.2, '90,110,80', 0.25); dots(3500, 1.2, '255,255,240', 0.22);
        // tiny flowers
        const fl = ['255,255,255', '255,220,70', '255,140,170', '200,170,255'];
        for (let i = 0; i < 46; i++) {
          const x = r() * w, y = r() * h, c = fl[(r() * fl.length) | 0];
          wrapDraw(w, h, (ox, oy) => { const px = x + ox, py = y + oy; if (px < -4 || px > w + 4 || py < -4 || py > h + 4) return; ctx.fillStyle = 'rgba(' + c + ',0.85)'; ctx.fillRect(px - 1.2, py - 1.2, 2.4, 2.4); });
        }
      } else if (kind === 'sand') {
        blot(30, 40, 100, '255,240,210', 0.18); blot(30, 40, 90, '200,170,130', 0.16);
        // wind ripples: wavy parallel lines (period divides tile so it tiles)
        for (let k = 0; k < 28; k++) {
          const y0 = (k / 28) * h, amp = 2 + r() * 3, ph = r() * 6.28, fr = (1 + ((r() * 3) | 0)) * 2 * Math.PI / w;
          ctx.strokeStyle = 'rgba(150,115,70,0.2)'; ctx.lineWidth = 1.6; ctx.beginPath();
          for (let x = 0; x <= w; x += 4) { const y = y0 + Math.sin(x * fr + ph) * amp + Math.sin(x * fr * 2.3 + ph) * amp * 0.4; if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
          ctx.stroke();
          ctx.strokeStyle = 'rgba(255,248,225,0.22)'; ctx.beginPath();
          for (let x = 0; x <= w; x += 4) { const y = y0 + 3 + Math.sin(x * fr + ph) * amp + Math.sin(x * fr * 2.3 + ph) * amp * 0.4; if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
          ctx.stroke();
        }
        dots(5000, 1, '120,95,60', 0.25); dots(4000, 1, '255,250,230', 0.3);
      } else if (kind === 'snow') {
        blot(30, 50, 110, '200,222,245', 0.2); blot(26, 40, 90, '255,255,255', 0.25);
        dots(1800, 1.5, '180,205,235', 0.22);
        // sparkle: bright crisp glints
        for (let i = 0; i < 360; i++) {
          const x = r() * w, y = r() * h, s = 1 + r() * 1.6;
          wrapDraw(w, h, (ox, oy) => { const px = x + ox, py = y + oy; if (px < -4 || px > w + 4 || py < -4 || py > h + 4) return; ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(px, py, s, s); if (s > 2) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(px - 2, py + 0.3, 6, 1); ctx.fillRect(px + 0.3, py - 2, 1, 6); } });
        }
      } else if (kind === 'rock') {
        blot(50, 20, 70, '120,120,120', 0.3); blot(40, 20, 60, '255,255,255', 0.25);
        ctx.lineWidth = 1.4;
        for (let i = 0; i < 40; i++) { let x = r() * w, y = r() * h; ctx.strokeStyle = 'rgba(60,60,60,0.35)'; ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; ctx.lineTo(x, y); } ctx.stroke(); }
        dots(4000, 1.3, '70,70,70', 0.3);
      } else { // dirt / gravel
        blot(40, 30, 80, '150,125,100', 0.2); blot(30, 30, 70, '255,245,230', 0.2);
        for (let i = 0; i < 700; i++) {
          const x = r() * w, y = r() * h, rad = 1.2 + r() * 2.6, dk = r() < 0.5;
          wrapDraw(w, h, (ox, oy) => { const px = x + ox, py = y + oy; if (px < -4 || px > w + 4 || py < -4 || py > h + 4) return; ctx.fillStyle = dk ? 'rgba(90,70,55,0.35)' : 'rgba(255,245,225,0.4)'; ctx.beginPath(); ctx.arc(px, py, rad, 0, 6.283); ctx.fill(); });
        }
        dots(3000, 1.2, '80,60,45', 0.25);
      }
    };
  }
  const groundTex = (kind) => sharedTex('ground_' + kind, 512, 512, genGround(kind), true);
  // thin horizon haze gradient (1 x 128): alpha peaks just above the horizon line
  function genHaze(ctx, w, h) {
    const g = ctx.createLinearGradient(0, h, 0, 0);   // v=0 (bottom of cylinder) -> top
    g.addColorStop(0, 'rgba(255,255,255,0.0)'); g.addColorStop(0.3, 'rgba(255,255,255,0.95)'); g.addColorStop(0.42, 'rgba(255,255,255,0.7)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.15)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  const hazeTex = () => sharedTex('haze', 4, 128, genHaze, false);
  // soft nebula cloud sprite (additive)
  function genNebula(ctx, w, h) {
    const r = mulberry(31337); ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const a = r() * 6.283, d = Math.pow(r(), 0.7) * w * 0.32, x = w / 2 + Math.cos(a) * d, y = h / 2 + Math.sin(a) * d * 0.7, rad = w * (0.06 + r() * 0.16);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, 'rgba(255,255,255,' + (0.1 + r() * 0.16) + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    const e = ctx.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w / 2); e.addColorStop(0, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = e; ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = 'source-over';
  }
  const nebulaTex = () => sharedTex('nebula', 256, 256, genNebula, false);

  // boost-pad chevron tile (orange, one yellow chevron pointing "up" = forward; scrolled by Track.update)
  function genChev(ctx, w, h) {
    ctx.fillStyle = '#ff8a00'; ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(120,40,0,0.5)'); g.addColorStop(0.1, 'rgba(120,40,0,0)'); g.addColorStop(0.9, 'rgba(120,40,0,0)'); g.addColorStop(1, 'rgba(120,40,0,0.5)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const chev = (dy, col) => {
      ctx.fillStyle = col; ctx.beginPath();
      ctx.moveTo(w * 0.06, h * (0.66 + dy)); ctx.lineTo(w * 0.5, h * (0.12 + dy)); ctx.lineTo(w * 0.94, h * (0.66 + dy));
      ctx.lineTo(w * 0.94, h * (0.96 + dy)); ctx.lineTo(w * 0.5, h * (0.42 + dy)); ctx.lineTo(w * 0.06, h * (0.96 + dy)); ctx.closePath(); ctx.fill();
    };
    chev(0.03, '#a84a00'); chev(0, '#fff25a');
  }
  const chevTex = () => sharedTex('chev', 128, 128, genChev, true);
  // tileable flowing textures: 'water' (waterfall streaks), 'lava' (molten blobs), 'river' (soft ripples)
  function genFlow(kind) {
    return function (ctx, w, h) {
      const r = mulberry(kind === 'lava' ? 91 : kind === 'river' ? 33 : 57);
      const wrap = (x, y, rad, fn) => { for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) fn(x + ox * w, y + oy * h); };
      if (kind === 'lava') {
        ctx.fillStyle = '#e8430c'; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 26; i++) {
          const x = r() * w, y = r() * h, rad = 10 + r() * 22, hot = r() < 0.5;
          wrap(x, y, rad, (px, py) => {
            const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
            g.addColorStop(0, hot ? 'rgba(255,230,90,0.95)' : 'rgba(120,20,0,0.75)'); g.addColorStop(1, hot ? 'rgba(255,160,40,0)' : 'rgba(120,20,0,0)');
            ctx.fillStyle = g; ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
          });
        }
      } else if (kind === 'river') {
        ctx.fillStyle = '#3aa7e0'; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 40; i++) {
          const x = r() * w, y = r() * h, rad = 6 + r() * 12;
          wrap(x, y, rad, (px, py) => {
            const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
            g.addColorStop(0, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g; ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
          });
        }
      } else {
        const g = ctx.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, '#4fb6ee'); g.addColorStop(0.5, '#8fdcff'); g.addColorStop(1, '#4fb6ee');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 46; i++) {
          const x = r() * w, y = r() * h, len = h * (0.25 + r() * 0.5), wd = 2 + r() * 5;
          ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + r() * 0.5) + ')';
          wrap(x, y, len, (px, py) => ctx.fillRect(px, py, wd, len));
        }
      }
    };
  }
  const flowTex = (kind) => sharedTex('flow_' + kind, 128, 128, genFlow(kind), true);

  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const hash2 = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
  const smooth01 = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
  // lattice value noise (-> 0..1) and fbm, deterministic from (x, z, seed)
  const vnoise = (x, z, sd) => {
    const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
    const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
    const a = hash2(xi + sd, zi), b = hash2(xi + 1 + sd, zi), c = hash2(xi + sd, zi + 1), d = hash2(xi + 1 + sd, zi + 1);
    return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
  };
  const fbm = (x, z, sd, oct) => {
    let v = 0, a = 0.5, t = 0;
    for (let o = 0; o < (oct || 3); o++) { v += vnoise(x, z, sd + o * 17.3) * a; t += a; a *= 0.5; x *= 2.03; z *= 2.03; }
    return v / t;
  };

  // Non-indexed vertex-colored triangle accumulator -> one merged mesh per material.
  // Normals: flat per face by default; blob()/frustum() (>=6 sides) supply smooth normals (GameCube-style
  // rounded shading). uvMode batches also carry a uv attribute (see quadUV).
  class Batch {
    constructor(uvMode) { this.p = []; this.c = []; this.n = []; this.uv = []; this.uvMode = !!uvMode; }
    tri(a, b, c, k) {
      const p = this.p, n = this.n, cc = this.c;
      p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      cc.push(k[0], k[1], k[2], k[0], k[1], k[2], k[0], k[1], k[2]);
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= l; ny /= l; nz /= l;
      n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
      if (this.uvMode) this.uv.push(0, 0, 0, 0, 0, 0);
    }
    // triangle with explicit (smooth) vertex normals; auto-aligned with the winding so double-sided lighting stays right
    triN(a, b, c, k, na, nb, nc) {
      const p = this.p, n = this.n, cc = this.c;
      p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      cc.push(k[0], k[1], k[2], k[0], k[1], k[2], k[0], k[1], k[2]);
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      const s = fx * (na[0] + nb[0] + nc[0]) + fy * (na[1] + nb[1] + nc[1]) + fz * (na[2] + nb[2] + nc[2]) < 0 ? -1 : 1;
      n.push(na[0] * s, na[1] * s, na[2] * s, nb[0] * s, nb[1] * s, nb[2] * s, nc[0] * s, nc[1] * s, nc[2] * s);
      if (this.uvMode) this.uv.push(0, 0, 0, 0, 0, 0);
    }
    quad(a, b, c, d, k) { this.tri(a, b, c, k); this.tri(a, c, d, k); }
    // triangle with per-vertex colours (flat normal) -- baked ambient occlusion / gradients
    triC(a, b, c, ka, kb, kc) {
      this.tri(a, b, c, ka);
      const cc = this.c, m = cc.length - 9;
      cc[m + 3] = kb[0]; cc[m + 4] = kb[1]; cc[m + 5] = kb[2]; cc[m + 6] = kc[0]; cc[m + 7] = kc[1]; cc[m + 8] = kc[2];
    }
    quadC(a, b, c, d, ka, kb, kc, kd) { this.triC(a, b, c, ka, kb, kc); this.triC(a, c, d, ka, kc, kd); }
    quadUVC(a, b, c, d, ka, kb, kc, kd, t) {
      this.triC(a, b, c, ka, kb, kc); this.triC(a, c, d, ka, kc, kd);
      const u = this.uv, m = u.length - 12;
      u[m] = t[0]; u[m + 1] = t[1]; u[m + 2] = t[2]; u[m + 3] = t[3]; u[m + 4] = t[4]; u[m + 5] = t[5];
      u[m + 6] = t[0]; u[m + 7] = t[1]; u[m + 8] = t[4]; u[m + 9] = t[5]; u[m + 10] = t[6]; u[m + 11] = t[7];
    }
    // uvMode only: quad with per-corner uv (a,b,c,d) -> [ua,va,ub,vb,uc,vc,ud,vd]
    quadUV(a, b, c, d, k, t) {
      this.tri(a, b, c, k); this.tri(a, c, d, k);
      const u = this.uv, m = u.length - 12;
      u[m] = t[0]; u[m + 1] = t[1]; u[m + 2] = t[2]; u[m + 3] = t[3]; u[m + 4] = t[4]; u[m + 5] = t[5];
      u[m + 6] = t[0]; u[m + 7] = t[1]; u[m + 8] = t[4]; u[m + 9] = t[5]; u[m + 10] = t[6]; u[m + 11] = t[7];
    }
    box(cx, y0, cz, sx, sy, sz, ry, k) {
      const c = Math.cos(ry), s = Math.sin(ry), hx = sx / 2, hz = sz / 2, y1 = y0 + sy;
      const v = (lx, lz, y) => [cx + lx * c + lz * s, y, cz - lx * s + lz * c];
      const a0 = v(-hx, -hz, y0), b0 = v(hx, -hz, y0), c0 = v(hx, hz, y0), d0 = v(-hx, hz, y0);
      const a1 = v(-hx, -hz, y1), b1 = v(hx, -hz, y1), c1 = v(hx, hz, y1), d1 = v(-hx, hz, y1);
      this.quad(a1, b1, c1, d1, k);
      this.quad(a0, b0, b1, a1, k); this.quad(b0, c0, c1, b1, k);
      this.quad(c0, d0, d1, c1, k); this.quad(d0, a0, a1, d1, k);
    }
    frustum(x, y0, z, r0, r1, h, sides, k, rot) {
      rot = rot || 0;
      const y1 = y0 + h, top = [x, y1, z], smooth = sides >= 6 && h > 0;
      const ny = smooth ? (r0 - r1) / h : 0;
      for (let i = 0; i < sides; i++) {
        const a0 = rot + (i / sides) * Math.PI * 2, a1 = rot + ((i + 1) / sides) * Math.PI * 2;
        const b0 = [x + Math.cos(a0) * r0, y0, z + Math.sin(a0) * r0];
        const b1 = [x + Math.cos(a1) * r0, y0, z + Math.sin(a1) * r0];
        let n0, n1, nm;
        if (smooth) {
          const l0 = Math.sqrt(1 + ny * ny), am = (a0 + a1) / 2;
          n0 = [Math.cos(a0) / l0, ny / l0, Math.sin(a0) / l0]; n1 = [Math.cos(a1) / l0, ny / l0, Math.sin(a1) / l0];
          nm = [Math.cos(am) / l0, ny / l0, Math.sin(am) / l0];
        }
        if (r1 <= 0) {
          if (smooth) this.triN(b0, b1, top, k, n0, n1, nm); else this.tri(b0, b1, top, k);
        } else {
          const t0 = [x + Math.cos(a0) * r1, y1, z + Math.sin(a0) * r1];
          const t1 = [x + Math.cos(a1) * r1, y1, z + Math.sin(a1) * r1];
          if (smooth) { this.triN(b0, b1, t1, k, n0, n1, n1); this.triN(b0, t1, t0, k, n0, n1, n0); }
          else this.quad(b0, b1, t1, t0, k);
          this.tri(top, t0, t1, k);
        }
      }
    }
    blob(x, y, z, sx, sy, sz, k, detail) {
      const P = icoPositions(detail || 0), isx = 1 / sx, isy = 1 / sy, isz = 1 / sz;
      const nrm = (i) => {
        const nx = P[i] * isx, ny = P[i + 1] * isy, nz = P[i + 2] * isz, l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        return [nx / l, ny / l, nz / l];
      };
      for (let i = 0; i < P.length; i += 9) {
        this.triN(
          [x + P[i] * sx, y + P[i + 1] * sy, z + P[i + 2] * sz],
          [x + P[i + 3] * sx, y + P[i + 4] * sy, z + P[i + 5] * sz],
          [x + P[i + 6] * sx, y + P[i + 7] * sy, z + P[i + 8] * sz], k, nrm(i), nrm(i + 3), nrm(i + 6));
      }
    }
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      if (this.uvMode && this.uv.length === (this.p.length / 3) * 2) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      g.computeBoundingSphere();
      return g;
    }
    get empty() { return this.p.length === 0; }
  }

  // ---------------------------------------------------------------- definitions
  // pts: [x, z, y?, halfWidth?]; first point is the start/finish line (dist 0), heading toward pts[1].
  const DEFS = {
    meadow: {
      name: 'Meadow Loop', theme: 'meadow', seed: 11, hw: 12, shoulder: 5, scale: 1,
      pts: [[0, 0, 0, 13], [80, 0, 0.3, 13], [160, 0, 1], [230, -5, 2], [290, 10, 3], [330, 50, 4], [335, 105, 4],
        [300, 150, 3], [245, 165, 2], [200, 140, 1], [160, 110, 1], [110, 115, 1.5], [70, 150, 3], [20, 175, 4],
        [-40, 170, 4], [-90, 140, 3], [-110, 95, 2], [-105, 45, 1], [-80, 8, 0.4], [-40, 0, 0]],
      pads: [{ d: 40, len: 10, l: -5, w: 6 }, { d: 40, len: 10, l: 5, w: 6 }, { d: 110, len: 10, l: 0, w: 7 }],
      jumps: [], arches: [], lakeDist: 0,
    },
    dunes: {
      name: 'Sunscorch Dunes', theme: 'dunes', seed: 23, hw: 13, shoulder: 5, scale: 1,
      pts: [[0, 0, 0, 14], [70, 0, 0, 14], [160, 0, 0.5], [250, -10, 1], [320, 20, 2], [350, 90, 3], [345, 170, 3.5],
        [310, 240, 3], [255, 285, 2], [195, 285, 1.5], [172, 248, 1], [170, 215, 1], [167, 179, 1.5], [158, 165, 1.5], [144, 156, 1.5], [128, 153, 1.5], [112, 156, 1.5], [98, 165, 1.5], [89, 179, 1.5], [86, 215, 3], [84, 250, 3.2], [58, 280, 3.5], [0, 295, 3], [-70, 270, 2], [-120, 210, 1.5], [-130, 130, 1],
        [-110, 60, 0.5], [-70, 15, 0.2]],
      pads: [{ d: 130, len: 10, l: 0, w: 8 }],
      jumps: [{ d: 80, len: 10, l: 0, w: 10 }],
      arches: [40, 140], lakeDist: 0,
    },
    glacier: {
      name: 'Glacier Pass', theme: 'glacier', seed: 37, hw: 12, shoulder: 5, scale: 0.8,
      pts: [[60, 0, 0, 13],
        [130, 0, 0],
        [195, 0, 0.4],
        [255, 0, 1],
        [278, 6, 1.7],
        [296, 24, 2.3],
        [302, 47, 3],
        [296, 70, 3.7],
        [278, 88, 4.3],
        [255, 94, 5],
        [190, 94, 5],
        [120, 94, 5],
        [65, 94, 5.5],
        [30, 94, 6],
        [7, 100, 6.7],
        [-11, 118, 7.3],
        [-17, 141, 8],
        [-11, 164, 8.7],
        [6, 182, 9.3],
        [30, 188, 10],
        [100, 188, 10],
        [180, 188, 10.5],
        [255, 188, 11],
        [278, 194, 11.4],
        [296, 212, 11.8],
        [302, 235, 12.2],
        [296, 258, 12.7],
        [278, 276, 13.1],
        [255, 282, 13.5],
        [190, 282, 13],
        [120, 282, 12.5],
        [50, 282, 12],
        [-30, 280, 11.5],
        [-90, 262, 10.5],
        [-135, 225, 9],
        [-150, 170, 6.5],
        [-148, 110, 4.5],
        [-135, 50, 2.5],
        [-110, 12, 1],
        [-60, 0, 0.3],
        [0, 0, 0]],
      pads: [{ d: 40, len: 10, l: 0, w: 8 }],
      jumps: [], arches: [], lakeDist: 330, iceLen: 110,
    },
    starlight: {
      name: 'Starlight Ribbon', theme: 'starlight', seed: 51, hw: 12, shoulder: 5, scale: 1, noWalls: true,
      pts: [[0, 0, 0, 14], [100, 0, 0, 13], [190, -5, 1], [255, 25, 3], [285, 90, 5], [270, 160, 7], [220, 215, 8],
        [150, 240, 8], [100, 225, 6], [50, 245, 4], [-10, 275, 3], [-80, 270, 2], [-130, 220, 2.5], [-150, 150, 3.5],
        [-138, 95, 4.5], [-140, 45, 3], [-112, 10, 1.5], [-65, -2, 0.5]],
      pads: [{ d: 40, len: 10, l: -4, w: 6 }, { d: 40, len: 10, l: 4, w: 6 }, { d: 400, len: 10, l: 0, w: 8 }],
      jumps: [], arches: [], lakeDist: 0,
    },
  };

  const THEMES = {
    meadow: {
      sky: [0x3b8fe8, 0xbfe4ff, 0x8ac96a], fog: [0xbfe4ff, 140, 520], ground: 0x6fbf4a, shoulder: 0x4f9a35,
      road: [0x5d6170, 0x555967], curb: [0xe8383d, 0xffffff], hemi: [0xcfe8ff, 0x6a9a50, 0.95], sun: [0xfff2d8, 0.85],
      emb: 0x5cae3e, bg: 0xbfe4ff,
    },
    dunes: {
      sky: [0x5aa6e0, 0xf6d19a, 0xe3b866], fog: [0xf1c98a, 100, 440], ground: 0xe3b866, shoulder: 0xd2a352,
      road: [0x8c8179, 0x837870], curb: [0xc8502d, 0xf3e2b8], hemi: [0xffe9c4, 0xc89a55, 0.95], sun: [0xffe2b0, 0.95],
      emb: 0xd9aa5a, bg: 0xf1c98a,
    },
    glacier: {
      sky: [0x7fb2e6, 0xdcecf8, 0xeaf4ff], fog: [0xcfe6f7, 70, 400], ground: 0xeaf4ff, shoulder: 0xd2e5f3,
      road: [0x7d8794, 0x747e8b], curb: [0x3c7fd0, 0xffffff], hemi: [0xdcecff, 0x9db8d0, 1.0], sun: [0xe8f3ff, 0.8],
      emb: 0xdcecf7, bg: 0xcfe6f7,
    },
    starlight: {
      sky: [0x05031a, 0x1b0f4a, 0x0a0630], fog: [0x0a0630, 160, 650], ground: 0x000000, shoulder: 0x000000,
      road: [0x7050c0, 0x6040b0], curb: [0xffffff, 0x78f0ff], hemi: [0xb9a8ff, 0x3a2a7a, 1.05], sun: [0xffe6ff, 0.6],
      emb: 0x000000, bg: 0x0a0630,
    },
  };

  // ---------------------------------------------------------------- registry (v2)
  // Built-in defs above stay available (attract mode / legacy ids) but cups are populated by
  // js/tracks/cup_*.js through G.defineTrack().
  const CUP_ORDER = [
    { id: 'mushroom', name: 'Mushroom Cup' },
    { id: 'flower', name: 'Flower Cup' },
    { id: 'star', name: 'Star Cup' },
    { id: 'special', name: 'Special Cup' },
  ];
  G.TRACKS = [];
  G.CUPS = [];
  function rebuildLists() {
    const list = [];
    for (const id in DEFS) {
      const d = DEFS[id];
      if (!d.cup) continue;
      const th = typeof d.theme === 'object' ? d.theme : THEMES[d.theme] || THEMES.meadow;
      list.push({
        id, name: d.name, cup: d.cup, order: d.order || 9, laps: d.laps || 3,
        theme: d.style || (typeof d.theme === 'string' ? d.theme : 'custom'), music: d.music || 'circuit',
        preview: { sky: th.sky ? th.sky[0] : 0x6fb6ff, ground: th.ground, road: th.road ? th.road[0] : 0x555555 },
      });
    }
    const cupIdx = (c) => { const i = CUP_ORDER.findIndex((x) => x.id === c); return i < 0 ? 99 : i; };
    list.sort((a, b) => cupIdx(a.cup) - cupIdx(b.cup) || a.order - b.order);
    G.TRACKS.length = 0;
    list.forEach((t) => G.TRACKS.push(t));
    G.CUPS.length = 0;
    CUP_ORDER.forEach((c) => {
      const tracks = list.filter((t) => t.cup === c.id).map((t) => t.id);
      if (tracks.length) G.CUPS.push({ id: c.id, name: c.name, tracks });
    });
    if (list.length >= 8) G.CUPS.push({ id: 'allcup', name: 'All-Cup Tour', tracks: list.map((t) => t.id), allCup: true });
  }
  G.defineTrack = function (def) {
    if (!def || !def.id || !def.pts) throw new Error('defineTrack: id and pts required');
    DEFS[def.id] = Object.assign({ hw: 12, shoulder: 5, scale: 1, seed: 7, pads: [], jumps: [], arches: [], lakeDist: 0 }, def);
    rebuildLists();
  };
  G.getTrackDef = (id) => DEFS[id];
  // legacy built-ins are still reachable by id but not listed in cups
  ['meadow', 'dunes', 'glacier', 'starlight'].forEach((id) => { DEFS[id].builtin = true; DEFS[id].builtinScenery = true; DEFS[id].style = id; });

  const ZONE_COLORS = { ice: 0xa9d9ff, mud: 0x6b4a2b, water: 0x3aa7e0, sand: 0xe3c27a, grass: 0x5cae3e, void: 0xff5a1f, offroad: 0x7a8a50 };
  const EMB = 10;     // embankment width beyond the shoulder
  const CELL = 32;    // spatial hash cell

  // ---------------------------------------------------------------- Track
  class Track {
    constructor(trackId, scene, opts) {
      opts = opts || {};
      this.scene = scene;
      this.id = trackId;
      const rev = /_r$/.test(trackId) && !DEFS[trackId];
      const baseId = rev ? trackId.slice(0, -2) : trackId;
      const base = DEFS[baseId];
      if (!base) throw new Error('Unknown track ' + trackId);
      this.rev = rev;
      this.mirror = !!opts.mirror;
      this.def = Object.assign({ id: trackId, rev: rev }, base);
      this.laps = base.laps || 3;
      this.theme = base.style || (typeof base.theme === 'string' ? base.theme : 'custom');
      const baseTheme = THEMES[typeof base.theme === 'string' ? base.theme : base.style] || THEMES.meadow;
      this.cfg = typeof base.theme === 'object' ? Object.assign({}, baseTheme, base.theme) : baseTheme;
      this.noWalls = !!base.noWalls;
      // rails: wall-less course look, but a low guard rail keeps karts on (gaps only at explicit void zones)
      this.rails = !!base.rails && this.noWalls;
      this.shoulder = base.shoulder;
      this.offroadSurface = base.offroad || 'offroad';
      this.rng = mulberry(base.seed + (rev ? 1000 : 0));
      this._time = 0;
      this._geoms = []; this._mats = []; this._objs = []; this._tex = [];
      this._anim = {};
      this._motion = []; this._blinkers = []; this._scrolls = []; this._crowds = []; this._evs = [];
      this._uT = { value: 0 }; this._clothB = null; this._clothMat = null; this._hk = new Float32Array(32); this._hn = 0; this._lapSeen = [];
      this._hazards = [];
      this._ao = [];
      this._glow = [];
      this._bbB = null;
      this._ter = null;
      this._hazOut = [];
      this._res = {
        index: 0, dist: 0, lateral: 0, halfWidth: 12, wallDist: 17, y: 0, onRoad: true, surface: 'road',
        tx: 0, tz: 1, rx: -1, rz: 0, cannonTo: 0, cannonHeight: 0,
      };
      // everything built for this track lives under root (scale.x = -1 in mirror mode)
      this.root = new THREE.Group();
      if (this.mirror) this.root.scale.x = -1;
      scene.add(this.root);
      this._sampleCurve(base, rev);
      this._buildRects(base, rev);
      this._buildGrid();
      this._buildItemSpots();
      this._buildMinimap();
      this._buildWorld(base, rev);
      this._buildCustom(base);
      this._meshTerrain();
      this._buildLife();
      this._mirrorPublicData();
    }

    // ------------------------------------------------ spline sampling
    _sampleCurve(def, rev) {
      let src = def.pts.slice();
      if (rev) src = [src[0]].concat(src.slice(1).reverse());
      const sc = def.scale || 1, n = src.length;
      const pts = src.map((p) => new THREE.Vector3(p[0] * sc, p[2] || 0, p[1] * sc));
      const wv = src.map((p) => (p[3] !== undefined ? p[3] : def.hw));
      const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
      const K = 48, M = n * K;
      const fx = new Float64Array(M + 1), fy = new Float64Array(M + 1), fz = new Float64Array(M + 1);
      const cum = new Float64Array(M + 1);
      for (let m = 0; m <= M; m++) {
        const p = curve.getPoint(m / M);
        fx[m] = p.x; fy[m] = p.y; fz[m] = p.z;
        if (m > 0) cum[m] = cum[m - 1] + Math.hypot(fx[m] - fx[m - 1], fz[m] - fz[m - 1]);
      }
      const L = cum[M], N = Math.round(L), ds = L / N;
      this.N = N; this.ds = ds; this.length = L;
      const px = (this.px = new Float32Array(N)), py = (this.py = new Float32Array(N)), pz = (this.pz = new Float32Array(N));
      const tx = (this.tx = new Float32Array(N)), tz = (this.tz = new Float32Array(N));
      const rx = (this.rx = new Float32Array(N)), rz = (this.rz = new Float32Array(N));
      const hw = (this.hw = new Float32Array(N));
      let j = 0;
      for (let k = 0; k < N; k++) {
        const s = k * ds;
        while (j < M - 1 && cum[j + 1] < s) j++;
        const seg = cum[j + 1] - cum[j] || 1;
        const f = Math.min(1, Math.max(0, (s - cum[j]) / seg));
        px[k] = fx[j] + (fx[j + 1] - fx[j]) * f;
        py[k] = fy[j] + (fy[j + 1] - fy[j]) * f;
        pz[k] = fz[j] + (fz[j + 1] - fz[j]) * f;
        const u = (j + f) / K, a = Math.floor(u) % n, b = (a + 1) % n;
        let q = u - Math.floor(u); q = q * q * (3 - 2 * q);
        hw[k] = wv[a] + (wv[b] - wv[a]) * q;
      }
      for (let k = 0; k < N; k++) {
        const a = (k - 1 + N) % N, b = (k + 1) % N;
        let dx = px[b] - px[a], dz = pz[b] - pz[a];
        const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        tx[k] = dx; tz[k] = dz; rx[k] = -dz; rz[k] = dx;
      }
      // signed curvature (heading change per meter, + = left turn)
      const curv = (this.curv = new Float32Array(N));
      const W = 6;
      for (let k = 0; k < N; k++) {
        const a = (k - W + N) % N, b = (k + W) % N;
        const h0 = Math.atan2(tx[a], tz[a]), h1 = Math.atan2(tx[b], tz[b]);
        curv[k] = G.wrapAngle(h1 - h0) / (2 * W * ds);
      }
      let minY = 1e9;
      for (let k = 0; k < N; k++) if (py[k] < minY) minY = py[k];
      this.groundY = minY - 0.25;
    }

    _dist(d) { return this.rev ? this.length - d : d; }

    _buildRects(def, rev) {
      const L = this.length, r = [];
      const add = (a, kind, extra) => {
        const d0 = a.d, d1 = a.d + a.len, l0 = a.l - a.w / 2, l1 = a.l + a.w / 2;
        let q;
        if (rev) q = { d0: L - d1, d1: L - d0, l0: -l1, l1: -l0, kind };
        else q = { d0, d1, l0, l1, kind };
        if (extra) Object.assign(q, extra);
        r.push(q);
      };
      (def.pads || []).forEach((p) => add(p, 'boost'));
      (def.jumps || []).forEach((p) => add(p, 'jump'));
      (def.cannons || []).forEach((p) => add(p, 'cannon', { to: p.to, height: p.height || 40 }));
      (def.zones || []).forEach((p) => add(p, p.surface || 'offroad', { color: p.color, offroadToo: !!p.offroad, id: p.id, active: p.active !== false, decal: p.decal !== false }));
      this.rects = r;
      this.nrect = r.length;
    }

    _buildGrid() {
      const g = (this._grid = new Map());
      for (let i = 0; i < this.N; i++) {
        const key = Math.floor(this.px[i] / CELL) * 4096 + Math.floor(this.pz[i] / CELL);
        let a = g.get(key); if (!a) { a = []; g.set(key, a); }
        a.push(i);
      }
      this._noGo = [];
    }
    // true when (x,z) is at least m from the centerline and outside reserved circles
    clear(x, z, m) {
      const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), r = Math.ceil(m / CELL), m2 = m * m;
      for (let a = cx - r; a <= cx + r; a++) for (let b = cz - r; b <= cz + r; b++) {
        const arr = this._grid.get(a * 4096 + b);
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const i = arr[k], dx = x - this.px[i], dz = z - this.pz[i];
          if (dx * dx + dz * dz < m2) return false;
        }
      }
      for (let k = 0; k < this._noGo.length; k++) {
        const o = this._noGo[k];
        if (Math.hypot(x - o.x, z - o.z) < o.r + m * 0.3) return false;
      }
      return true;
    }

    // ------------------------------------------------ public query API
    query(x, z, hint, y) {
      if (!this.mirror) return this._queryRaw(x, z, hint, y);
      const r = this._queryRaw(-x, z, hint, y);
      r.lateral = -r.lateral; r.tx = -r.tx; r.rz = -r.rz;
      return r;
    }
    _queryRaw(x, z, hint, y) {
      const N = this.N, px = this.px, pz = this.pz, r = this._res;
      const useY = y !== undefined && y === y;
      let best = -1, bd = 1e18;
      if (hint !== undefined && hint >= 0) {
        hint = hint | 0; if (hint >= N) hint %= N;
        for (let k = -40; k <= 40; k++) {
          let i = hint + k; if (i < 0) i += N; else if (i >= N) i -= N;
          const dx = x - px[i], dz = z - pz[i];
          let d = dx * dx + dz * dz;
          if (useY) { const dy = y - this.py[i]; d += dy * dy * 4; }
          if (d < bd) { bd = d; best = i; }
        }
        const lim = 2 * this.hw[best] + 30;
        if (bd > lim * lim) best = -1;
      }
      if (best < 0) {
        bd = 1e18;
        for (let i = 0; i < N; i++) {
          const dx = x - px[i], dz = z - pz[i];
          let d = dx * dx + dz * dz;
          if (useY) { const dy = y - this.py[i]; d += dy * dy * 4; }
          if (d < bd) { bd = d; best = i; }
        }
      }
      const i = best;
      const s = (x - px[i]) * this.tx[i] + (z - pz[i]) * this.tz[i];
      let j, t;
      if (s >= 0) { j = i; t = s / this.ds; } else { j = i === 0 ? N - 1 : i - 1; t = 1 + s / this.ds; }
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const j2 = j + 1 === N ? 0 : j + 1;
      const cx = px[j] + (px[j2] - px[j]) * t, cz = pz[j] + (pz[j2] - pz[j]) * t;
      let rx = this.rx[j] + (this.rx[j2] - this.rx[j]) * t, rz = this.rz[j] + (this.rz[j2] - this.rz[j]) * t;
      const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
      const lat = (x - cx) * rx + (z - cz) * rz;
      let dist = (j + t) * this.ds; if (dist >= this.length) dist -= this.length;
      const hw = this.hw[j] + (this.hw[j2] - this.hw[j]) * t;
      const a = lat < 0 ? -lat : lat;
      let surface = this.offroadSurface;
      r.cannonTo = 0; r.cannonHeight = 0;
      if (a <= hw) surface = 'road';
      else if (this.noWalls && !this.rails && a > hw + 1) surface = 'void';
      if (surface !== 'void') {
        for (let k = 0; k < this.nrect; k++) {
          const q = this.rects[k];
          if (q.active !== false && dist >= q.d0 && dist <= q.d1 && lat >= q.l0 && lat <= q.l1 && (a <= hw || q.offroadToo)) {
            surface = q.kind;
            if (q.kind === 'cannon') { r.cannonTo = q.to; r.cannonHeight = q.height; }
            break;
          }
        }
      }
      r.index = i; r.dist = dist; r.lateral = lat; r.halfWidth = hw;
      r.wallDist = this.noWalls ? hw + 1 : hw + this.shoulder;
      r.y = this.py[j] + (this.py[j2] - this.py[j]) * t;
      r.onRoad = a <= hw && surface !== 'void'; r.surface = surface;
      let tx = this.tx[j] + (this.tx[j2] - this.tx[j]) * t, tz = this.tz[j] + (this.tz[j2] - this.tz[j]) * t;
      const tl = Math.hypot(tx, tz) || 1;
      r.tx = tx / tl; r.tz = tz / tl; r.rx = rx; r.rz = rz;
      return r;
    }

    _frame(dist, o) {
      const L = this.length; dist = ((dist % L) + L) % L;
      const f = dist / this.ds; let i = Math.floor(f); const t = f - i;
      if (i >= this.N) i = 0;
      const j = i + 1 === this.N ? 0 : i + 1;
      o.x = this.px[i] + (this.px[j] - this.px[i]) * t;
      o.y = this.py[i] + (this.py[j] - this.py[i]) * t;
      o.z = this.pz[i] + (this.pz[j] - this.pz[i]) * t;
      let tx = this.tx[i] + (this.tx[j] - this.tx[i]) * t, tz = this.tz[i] + (this.tz[j] - this.tz[i]) * t;
      const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      o.tx = tx; o.tz = tz; o.rx = -tz; o.rz = tx;
      o.halfWidth = this.hw[i] + (this.hw[j] - this.hw[i]) * t;
      return o;
    }
    _mf(o) {
      if (this.mirror) { o.x = -o.x; o.tx = -o.tx; o.rz = -o.rz; }
      return o;
    }
    pointAt(dist) {
      return this._mf(this._frame(dist, { x: 0, y: 0, z: 0, tx: 0, tz: 1, rx: -1, rz: 0, halfWidth: 12 }));
    }
    respawnPoint(dist) {
      const p = this._mf(this._frame(dist, { x: 0, y: 0, z: 0, tx: 0, tz: 1, rx: -1, rz: 0, halfWidth: 12 }));
      return { x: p.x, y: p.y, z: p.z, heading: Math.atan2(p.tx, p.tz) };
    }
    getStartGrid(n) {
      n = n || 8;
      const out = [], tmp = { x: 0, y: 0, z: 0, tx: 0, tz: 1, rx: -1, rz: 0, halfWidth: 12 };
      for (let k = 0; k < n; k++) {
        const row = k >> 1, side = k & 1 ? 1 : -1;
        const d = this.length - 8 - row * 6 - (k & 1 ? 3 : 0);
        this._mf(this._frame(d, tmp));
        const lat = side * 4;
        out.push({ x: tmp.x + tmp.rx * lat, y: tmp.y, z: tmp.z + tmp.rz * lat, heading: Math.atan2(tmp.tx, tmp.tz) });
      }
      return out;
    }

    _buildItemSpots() {
      const spots = [], tmp = { x: 0, y: 0, z: 0, tx: 0, tz: 1, rx: -1, rz: 0, halfWidth: 12 };
      const L = this.length;
      let rows = this.def.itemRows;
      if (!rows) {
        rows = [];
        const nRows = L < 500 ? 2 : L > 1500 ? 6 : 5;
        for (let r = 0; r < nRows; r++) rows.push({ d: L * (0.1 + (0.9 / nRows) * r), count: 5 });
      } else if (this.rev) rows = rows.map((q) => Object.assign({}, q, { d: L - q.d }));
      for (const row of rows) {
        let d = row.d;
        for (let tries = 0; tries < 12; tries++) {
          let bad = d < 20 || d > L - 20;
          for (let k = 0; k < this.nrect; k++) if (d > this.rects[k].d0 - 14 && d < this.rects[k].d1 + 14) bad = true;
          if (!bad || this.def.itemRows) break;
          d += 12;
        }
        this._frame(d, tmp);
        const n = row.count || 5;
        for (let k = 0; k < n; k++) {
          const l = (k - (n - 1) / 2) * tmp.halfWidth * (n > 1 ? 1.5 / (n - 1) : 0);
          spots.push({ x: tmp.x + tmp.rx * l, y: tmp.y, z: tmp.z + tmp.rz * l, double: !!row.double });
        }
      }
      this.itemBoxSpots = spots;
    }

    _buildMinimap() {
      const pts = [], n = 200;
      let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
      for (let k = 0; k < n; k++) {
        const i = Math.floor((k * this.N) / n), x = this.px[i], z = this.pz[i];
        pts.push({ x, z });
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      this.minimap = { points: pts, bounds: { minX, maxX, minZ, maxZ } };
    }

    // ------------------------------------------------ mesh construction
    _mat(opts, basic) {
      opts = Object.assign({}, opts);
      delete opts.flatShading; // not supported by Lambert/Basic in r128
      const detail = opts.detail; delete opts.detail;
      const wind = opts.wind; delete opts.wind;
      const m = basic
        ? new THREE.MeshBasicMaterial(Object.assign({ vertexColors: true, side: THREE.DoubleSide }, opts))
        : new THREE.MeshLambertMaterial(Object.assign({ vertexColors: true, side: THREE.DoubleSide }, opts));
      // world-space detail texture on big lit surfaces (never on emissive/basic, textured or transparent ones)
      if (!basic && detail !== false && !opts.map && !opts.transparent) this._detail(m, typeof detail === 'object' ? detail : undefined);
      if (wind) this._wind(m, wind === true ? {} : wind);
      this._mats.push(m);
      return m;
    }
    // sway leaves / palms / flags with the shared wind shader (patch before the first render)
    _wind(m, o) {
      if (G.GFX && G.GFX.patchWind) { try { G.GFX.patchWind(m, Object.assign({ groundY: this.groundY }, o)); } catch (e) { /* ignore */ } }
      return m;
    }
    _mesh(batch, mat, noCull) {
      if (batch.empty) return null;
      const g = batch.build(); this._geoms.push(g);
      const m = new THREE.Mesh(g, mat);
      if (noCull) m.frustumCulled = false;
      return this._add(m);
    }
    _add(o) { this.root.add(o); this._objs.push(o); return o; }
    _P(i, l, dy) {
      return [this.px[i] + this.rx[i] * l, this.py[i] + dy, this.pz[i] + this.rz[i] * l];
    }
    _PD(d, l, dy) {
      const f = this._frame(d, this._ft || (this._ft = { x: 0, y: 0, z: 0, tx: 0, tz: 1, rx: -1, rz: 0, halfWidth: 12 }));
      return [f.x + f.rx * l, f.y + dy, f.z + f.rz * l];
    }

    _buildWorld(def, rev) {
      const cfg = this.cfg, theme = this.theme, N = this.N, ds = this.ds;
      const star = theme === 'starlight';
      const scene = this.scene;

      // fog / background
      scene.fog = new THREE.Fog(cfg.fog[0], cfg.fog[1], cfg.fog[2]);
      scene.background = new THREE.Color(cfg.bg);

      // lights: hemisphere + warm sun (+ soft cool fill); shadows are toggled by main (castShadow stays false here)
      const mode = (this.skyMode = this._skyMode(def));
      const off = mode === 'sunset' ? [150, 75, 70] : mode === 'night' ? [60, 140, 80] : mode === 'day' ? [90, 130, 60] : [50, 140, 40];
      const dayish = mode === 'day' || mode === 'sunset';
      this._sunDir = new THREE.Vector3(off[0], off[1], off[2]).normalize();
      const sunC = dayish ? mix(col(cfg.sun[0]), mode === 'sunset' ? [1, 0.72, 0.45] : [1, 0.93, 0.8], mode === 'sunset' ? 0.4 : 0.3) : col(cfg.sun[0]);
      this.hemi = new THREE.HemisphereLight(cfg.hemi[0], cfg.hemi[1], cfg.hemi[2] * (dayish ? 0.9 : 1));
      this._add(this.hemi);
      this.sun = new THREE.DirectionalLight(new THREE.Color(sunC[0], sunC[1], sunC[2]), cfg.sun[1]);
      this.sun.position.set(this.px[0] + off[0], off[1], this.pz[0] + off[2]);
      this.sun.target.position.set(this.px[0], 0, this.pz[0]);
      this.sun.userData.offset = new THREE.Vector3(off[0], off[1], off[2]);
      this.sun.castShadow = false;
      this.sun.shadow.mapSize.set(2048, 2048);
      const sc = this.sun.shadow.camera;
      sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 500;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.02;
      this._add(this.sun); this._add(this.sun.target);
      if (dayish || mode === 'night') {
        // soft fill from the opposite side (direction only: its target stays at the origin)
        const fc = mix(col(cfg.sky[0]), [1, 1, 1], 0.5);
        this.fill = new THREE.DirectionalLight(new THREE.Color(fc[0], fc[1], fc[2]), dayish ? 0.22 : 0.12);
        this.fill.position.set(-off[0], 45, -off[2]);
        this._add(this.fill);
      }
      if (G.GFX && G.GFX.setSun) {
        try { G.GFX.setSun(new THREE.Vector3(this.mirror ? -off[0] : off[0], off[1], off[2]).normalize(), this.sun.color.getHex()); } catch (e) { /* ignore */ }
      }

      // reserved circles (lake) before scatter
      let lake = null;
      if (!def.builtinScenery) { /* custom tracks decorate themselves */ }
      else if (theme === 'meadow') lake = this._findOpenSpot(48, 36);
      else if (theme === 'glacier') {
        const p = this._frame(this._dist(def.lakeDist), {});
        lake = { x: p.x, z: p.z, r: 52, onRoad: true };
      }
      this._lake = lake;

      this._buildSky(def);
      this._buildRoad(def);
      this._buildBoundaries(def);
      if (!star && def.ground !== false) this._buildGround();
      this._initTerrain(def);
      if (def.startArch !== false) this._buildStartArch();
      if (def.builtinScenery) this._buildScenery(def, lake);
      if (theme === 'glacier' && (def.builtinScenery || def.snow)) this._buildSnow();
    }

    _findOpenSpot(r, margin) {
      let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
      for (let i = 0; i < this.N; i += 8) {
        minX = Math.min(minX, this.px[i]); maxX = Math.max(maxX, this.px[i]);
        minZ = Math.min(minZ, this.pz[i]); maxZ = Math.max(maxZ, this.pz[i]);
      }
      let best = null, bestD = -1;
      for (let x = minX; x <= maxX; x += 12) for (let z = minZ; z <= maxZ; z += 12) {
        let d = 1e9;
        for (let i = 0; i < this.N; i += 3) { const dd = Math.hypot(x - this.px[i], z - this.pz[i]); if (dd < d) d = dd; }
        if (d > bestD) { bestD = d; best = { x, z }; }
      }
      if (!best || bestD < r + margin * 0.5) return null;
      return { x: best.x, z: best.z, r: Math.min(r, bestD - margin * 0.5) };
    }

    // sky gradient sphere + camera-locked backdrop decorations
    _follow(obj, spin) {
      obj.frustumCulled = false;
      const self = this;
      obj.onBeforeRender = function (renderer, scene, camera) {
        obj.position.copy(camera.position);
        if (self.mirror) obj.position.x = -obj.position.x;
        if (spin) obj.rotation.y = self._time * spin;
        obj.updateMatrixWorld(true);
      };
    }
    // sky style: explicit def.sky ('day'|'sunset'|'night'|'space'|'indoor') or derived from the theme colours
    _skyMode(def) {
      const ok = ['day', 'sunset', 'night', 'space', 'indoor'];
      if (def.sky && ok.indexOf(def.sky) >= 0) return def.sky;
      const cfg = this.cfg;
      if (def.style === 'starlight' || def.theme === 'starlight') return 'space';
      const mid = col(cfg.sky[1]), top = col(cfg.sky[0]);
      if (lum(mid) < 0.12) return (mid[0] > mid[2] * 1.4 && mid[0] > mid[1] * 1.4) ? 'indoor' : 'night';
      if (mid[0] - mid[2] > 0.4 && lum(top) < 0.55) return 'sunset';
      return 'day';
    }
    _detail(m, o) {
      if (G.GFX && G.GFX.patchDetail) { try { G.GFX.patchDetail(m, o); } catch (e) { /* ignore */ } }
      return m;
    }

    _buildSky(def) {
      const cfg = this.cfg, mode = this.skyMode, rng = this.rng, style = def.style;
      const top = col(cfg.sky[0]), mid = col(cfg.sky[1]), bot = col(cfg.sky[2]), fogc = col(cfg.fog[0]);
      const vr = mulberry((def.seed || 7) * 31 + 5);   // private stream: engine sky extras never disturb the course rng
      const sd = this._sunDir;
      const warm = mode === 'sunset' ? col(0xff9a4a) : col(0xffe2a8);
      const hz = (mode === 'day' || mode === 'sunset') ? mix(mid, fogc, 0.55) : mid;

      // ---- dome: smooth vertical gradient + sun glow + warm horizon band
      const geo = new THREE.SphereGeometry(300, 48, 32);
      const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const dx = pos.getX(i) / 300, v = pos.getY(i) / 300, dz = pos.getZ(i) / 300;
        let c;
        if (v >= 0) {
          c = v < 0.28 ? mix(hz, mid, smooth01(v / 0.28)) : mix(mid, top, smooth01(Math.pow((v - 0.28) / 0.72, 0.85)));
        } else c = mix(hz, bot, Math.min(1, -v * 3));
        if (mode === 'day' || mode === 'sunset') {
          const g = Math.max(0, dx * sd.x + v * sd.y + dz * sd.z);
          const k = mode === 'sunset' ? (Math.pow(g, 2.5) * 0.5 + Math.pow(g, 14) * 0.5) : (Math.pow(g, 5) * 0.2 + Math.pow(g, 40) * 0.4);
          c = [c[0] + warm[0] * k, c[1] + warm[1] * k, c[2] + warm[2] * k];
          if (mode === 'sunset') {
            const band = Math.exp(-v * v * 60) * (0.25 + 0.75 * Math.pow(g, 1.3)) * 0.6;
            c = mix(c, warm, band);
          }
        } else if (mode === 'night') {
          const g = Math.max(0, dx * sd.x + v * sd.y + dz * sd.z), k = Math.pow(g, 24) * 0.35;
          c = [c[0] + 0.5 * k, c[1] + 0.6 * k, c[2] + 0.8 * k];
        }
        colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      this._geoms.push(geo);
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, depthTest: false });
      this._mats.push(mat);
      const sky = new THREE.Mesh(geo, mat);
      sky.renderOrder = -1000;
      this._follow(sky);
      this._add(sky);

      // ---- distant mountain / hill silhouette rings (one merged mesh, aerial-perspective tinted)
      const P = [], C = [], I = [];
      const tint = (c, f) => mix(c, fogc, f);
      const ring = (R, y0, segs, hFn, stops) => {
        const base = P.length / 3, S = stops.length, sp1 = vr() * 6.28, sp2 = vr() * 6.28;
        for (let k = 0; k <= segs; k++) {
          const a = (k / segs) * Math.PI * 2, h = hFn(a), cs = Math.cos(a) * R, sn = Math.sin(a) * R;
          // gully / ridge light variation across the azimuth gives the silhouette real volume
          const sh = 0.86 + 0.14 * Math.sin(a * 23 + sp1) + 0.08 * Math.sin(a * 41 + sp2);
          for (let s = 0; s < S; s++) { const f = s === 0 ? 1 : sh; P.push(cs, y0 + (h - y0) * stops[s][0], sn); C.push(stops[s][1][0] * f, stops[s][1][1] * f, stops[s][1][2] * f); }
        }
        for (let k = 0; k < segs; k++) for (let s = 0; s < S - 1; s++) {
          const a = base + k * S + s, b = a + 1, c = a + S + 1, d = a + S;
          I.push(a, b, c, a, c, d);
        }
      };
      const ph = () => rng() * 6.28;
      const rolling = (h0, amp) => { const p1 = ph(), p2 = ph(), p3 = ph(); return (a) => Math.max(2, h0 * (0.62 + amp * (0.5 * Math.sin(a * 3 + p1) + 0.35 * Math.sin(a * 7 + p2) + 0.2 * Math.sin(a * 13 + p3)))); };
      const ridged = (h0) => {
        const p1 = ph(), p2 = ph();
        return (a) => h0 * (0.38 + 0.62 * (Math.pow(1 - Math.abs(Math.sin(a * 5 + p1)), 1.1) * 0.62 + Math.pow(1 - Math.abs(Math.sin(a * 11 + p2)), 1.5) * 0.38));
      };
      const mesa = (h0) => { const p1 = ph(), p2 = ph(); return (a) => h0 * (0.12 + 0.88 * smooth01(Math.sin(a * 4 + p1) * 2.2 + Math.sin(a * 9 + p2) * 0.6)); };
      // base stays hazy (below / at the horizon), body is clearly visible, so ranges read as solid volumes resting on the ground
      const grad = (c, f0, f1) => [[0, tint(c, Math.max(f0, 0.8))], [0.14, tint(c, Math.min(f0, 0.5) * 0.9)], [0.5, tint(c, f1 * 0.7)], [1, c]];
      if (mode === 'day' || mode === 'sunset') {
        const sunset = mode === 'sunset', emb = col(cfg.emb);
        const hill = lum(emb) > 0.03 ? mix(emb, col(cfg.ground), 0.3) : col(cfg.ground);
        if (style === 'dunes') {
          ring(292, -10, 120, mesa(46), grad(sunset ? col(0x8a4a3a) : col(0xc9805a), 0.85, 0.5));
          ring(282, -10, 160, rolling(22, 0.5), grad(sunset ? col(0xa8624a) : col(0xdcb070), 0.8, 0.3));
          ring(272, -10, 160, rolling(10, 0.6), grad(mix(col(cfg.ground), col(0xe8c88a), 0.5), 0.7, 0.2));
        } else if (style === 'glacier') {
          const rock = sunset ? col(0x7a6a9a) : col(0x7f9bbd), snow = sunset ? col(0xffd8c8) : col(0xffffff);
          ring(292, -10, 180, ridged(100), [[0, tint(rock, 0.85)], [0.3, tint(rock, 0.5)], [0.55, rock], [0.68, tint(snow, 0.08)], [1, snow]]);
          ring(280, -10, 160, rolling(26, 0.5), grad(sunset ? col(0xe8c8d8) : col(0xe6f2fb), 0.7, 0.25));
          ring(270, -10, 160, rolling(10, 0.6), grad(sunset ? col(0xf4dcd8) : col(0xf4faff), 0.6, 0.15));
        } else {
          ring(292, -10, 180, ridged(78), grad(sunset ? col(0x6a4a8a) : col(0x6f8fc4), 0.82, 0.5));
          ring(282, -10, 180, rolling(34, 0.55), grad(sunset ? mul(hill, 0.55) : mix(hill, col(0x5f9a8a), 0.35), 0.7, 0.3));
          ring(271, -10, 180, rolling(13, 0.65), grad(sunset ? mul(hill, 0.5) : hill, 0.5, 0.12));
        }
      } else if (mode === 'night') {
        const base = mix(col(0x070c26), fogc, 0.3);
        ring(292, -10, 180, ridged(70), grad(mix(base, col(0x2a3a70), 0.35), 0.5, 0.25));
        ring(278, -10, 180, rolling(24, 0.6), grad(base, 0.3, 0.1));
      }
      if (P.length) {
        const rg = new THREE.BufferGeometry();
        rg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        rg.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
        rg.setIndex(I);
        this._geoms.push(rg);
        const rm = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
        this._mats.push(rm);
        const m = new THREE.Mesh(rg, rm);
        m.renderOrder = -999;
        this._follow(m);
        this._add(m);
      }

      // ---- stars (night / space) and space-only planets
      if (mode === 'night' || mode === 'space') {
        const n = mode === 'space' ? 1800 : 900, pp = new Float32Array(n * 3), cc = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const u = mode === 'night' ? rng() * 0.95 + 0.05 : rng() * 2 - 1, a = rng() * Math.PI * 2, s = Math.sqrt(1 - u * u), r = 290;
          pp[i * 3] = Math.cos(a) * s * r; pp[i * 3 + 1] = u * r; pp[i * 3 + 2] = Math.sin(a) * s * r;
          const c = [col(0xffffff), col(0xbfd8ff), col(0xffe4b0), col(0xffc0ea)][(rng() * 4) | 0], k = 0.5 + rng() * 0.5;
          cc[i * 3] = c[0] * k; cc[i * 3 + 1] = c[1] * k; cc[i * 3 + 2] = c[2] * k;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pp, 3));
        g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
        this._geoms.push(g);
        const m = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false });
        this._mats.push(m);
        const pts = new THREE.Points(g, m);
        pts.renderOrder = -998;
        this._follow(pts, 0.006);
        this._add(pts);
      }
      if (mode === 'space') {
        const b = new Batch(), R = 270;
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 + rng() * 0.2;
          const y = 40 + rng() * 120, r = 120 + rng() * 100, rad = 8 + rng() * 22;
          const c = [col(0xff7ab8), col(0x6fd8ff), col(0xffd36f), col(0xa98bff)][i % 4];
          b.blob(Math.cos(a) * r * 1.2, y, Math.sin(a) * r * 1.2, rad, rad, rad, c, 1);
        }
        b.blob(-150, 90, -190, 40, 40, 40, col(0x7a5cf0), 1);
        b.blob(-150, 90, -190, 62, 1.5, 62, col(0xffc6f5), 1);
        const dm = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false, side: THREE.DoubleSide });
        this._mats.push(dm);
        const deco = this._mesh(b, dm, true);
        if (deco) { deco.renderOrder = -997; this._follow(deco, 0); this._anim.deco = deco; }
      }

      // ---- cloud billboards (one mesh, painted atlas) + sun/moon disc with glow (one mesh)
      const ctex = mode === 'indoor' ? null : cloudTex();
      if (ctex) {
        const CP = [], CU = [], CC = [], CI = [];
        const R = 255;
        const layers = {
          day: [[7, 15, 95, [0.97, 0.98, 1], 0.88], [18, 34, 110, [1, 1, 1], 1], [40, 62, 80, [1, 1, 1], 1]],
          sunset: [[5, 13, 100, [1, 0.62, 0.5], 0.9], [17, 32, 115, [1, 0.78, 0.68], 1], [38, 60, 85, [0.92, 0.72, 0.8], 1]],
          night: [[10, 28, 120, [0.2, 0.24, 0.42], 0.8], [34, 58, 90, [0.16, 0.2, 0.36], 0.8]],
          space: [[10, 30, 190, [0.55, 0.3, 0.85], 0.5], [34, 60, 150, [0.3, 0.55, 0.9], 0.5]],
        }[mode] || [];
        const per = mode === 'day' || mode === 'sunset' ? 12 : mode === 'night' ? 6 : 4;
        let vi = 0;
        layers.forEach((L, li) => {
          const nn = per - (li === 2 ? 3 : 0);
          for (let n = 0; n < nn; n++) {
            const az = ((n + 0.15 * li + rng() * 0.7) / nn) * Math.PI * 2, el = (L[0] + rng() * (L[1] - L[0])) * Math.PI / 180;
            const w = L[2] * (0.7 + rng() * 0.6) * 0.5, h = w * 0.5;
            const ce = Math.cos(el), cx = Math.cos(az) * ce * R, cy = Math.sin(el) * R, cz = Math.sin(az) * ce * R;
            const rx = -Math.sin(az), rz = Math.cos(az);
            const cell = (rng() * 4) | 0, u0 = (cell & 1) * 0.5, v0 = 0.5 * (1 - (cell >> 1));
            const flip = rng() < 0.5, ua = flip ? u0 + 0.5 : u0, ub = flip ? u0 : u0 + 0.5;
            const shade = 0.92 + rng() * 0.08, c = L[3];
            const k = [c[0] * shade, c[1] * shade, c[2] * shade];
            CP.push(cx - rx * w, cy - h, cz - rz * w, cx + rx * w, cy - h, cz + rz * w, cx + rx * w, cy + h, cz + rz * w, cx - rx * w, cy + h, cz - rz * w);
            CU.push(ua, v0, ub, v0, ub, v0 + 0.5, ua, v0 + 0.5);
            for (let q = 0; q < 4; q++) CC.push(k[0], k[1], k[2]);
            CI.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3); vi += 4;
          }
        });
        if (vi) {
          const cg = new THREE.BufferGeometry();
          cg.setAttribute('position', new THREE.Float32BufferAttribute(CP, 3));
          cg.setAttribute('uv', new THREE.Float32BufferAttribute(CU, 2));
          cg.setAttribute('color', new THREE.Float32BufferAttribute(CC, 3));
          cg.setIndex(CI);
          this._geoms.push(cg);
          const cm = new THREE.MeshBasicMaterial({ map: ctex, vertexColors: true, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, opacity: layers[0][4] });
          this._mats.push(cm);
          const cl = new THREE.Mesh(cg, cm);
          cl.renderOrder = -997;
          this._follow(cl, mode === 'space' ? 0.003 : mode === 'night' ? 0.006 : 0.014);   // clouds drift visibly
          this._add(cl);
        }
      }
      const stex = (mode === 'day' || mode === 'sunset' || mode === 'night') ? sunTex() : null;
      if (stex) {
        const R = 280, sz = mode === 'night' ? 34 : mode === 'sunset' ? 78 : 66;
        const cx = sd.x * R, cy = sd.y * R, cz = sd.z * R;
        // basis perpendicular to the sun direction
        let rx = -sd.z, rz = sd.x; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
        const ux = -sd.y * sd.x / (Math.hypot(sd.x, sd.z) || 1), uy = Math.hypot(sd.x, sd.z), uz = -sd.y * sd.z / (Math.hypot(sd.x, sd.z) || 1);
        const sp = [cx - rx * sz - ux * sz, cy - uy * sz, cz - rz * sz - uz * sz, cx + rx * sz - ux * sz, cy - uy * sz, cz + rz * sz - uz * sz,
          cx + rx * sz + ux * sz, cy + uy * sz, cz + rz * sz + uz * sz, cx - rx * sz + ux * sz, cy + uy * sz, cz - rz * sz + uz * sz];
        const sg = new THREE.BufferGeometry();
        const hs = 3.4, hp = [];   // wide faint halo quad (second quad, dimmer via vertex colour)
        for (let q = 0; q < 4; q++) hp.push(cx + (sp[q * 3] - cx) * hs, cy + (sp[q * 3 + 1] - cy) * hs, cz + (sp[q * 3 + 2] - cz) * hs);
        sg.setAttribute('position', new THREE.Float32BufferAttribute(sp.concat(hp), 3));
        sg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1], 2));
        const hk = mode === 'night' ? 0.22 : 0.3;
        sg.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, hk, hk, hk, hk, hk, hk, hk, hk, hk, hk, hk, hk], 3));
        sg.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
        this._geoms.push(sg);
        const scol = mode === 'night' ? 0xc8d8ff : mode === 'sunset' ? 0xffb070 : 0xfff0c8;
        const sm = new THREE.MeshBasicMaterial({ map: stex, color: scol, vertexColors: true, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
        this._mats.push(sm);
        const sun = new THREE.Mesh(sg, sm);
        sun.renderOrder = -996;
        this._follow(sun);
        this._add(sun);
        this._anim.sunDisc = sun;
      }

      // ---- v6 sky extras: horizon haze band, far stratus layer at another depth/drift, aurora / nebula
      const fx = [].concat(def.skyFx || []);
      if (def.aurora || (mode === 'night' && (style === 'glacier' || def.snow || def.theme === 'glacier'))) fx.push('aurora');
      if (def.nebula || mode === 'space') fx.push('nebula');
      const htex = (mode === 'day' || mode === 'sunset' || mode === 'night') ? hazeTex() : null;
      if (htex && def.haze !== false) {
        const hg = new THREE.CylinderGeometry(286, 286, 90, 48, 1, true);
        hg.translate(0, 28, 0);                       // spans y = -17 .. 73 around the camera, alpha peaks just above the horizon
        this._geoms.push(hg);
        const hc = mode === 'night' ? mix(fogc, mid, 0.5) : mix(fogc, hz, 0.4);
        const hm = new THREE.MeshBasicMaterial({ map: htex, color: new THREE.Color(hc[0], hc[1], hc[2]), transparent: true, opacity: mode === 'night' ? 0.16 : 0.18, depthWrite: false, depthTest: false, fog: false, side: THREE.BackSide });
        this._mats.push(hm);
        const hz2 = new THREE.Mesh(hg, hm); hz2.renderOrder = -995; this._follow(hz2); this._add(hz2);
      }
      if (fx.indexOf('aurora') >= 0 && mode !== 'indoor') {
        // curtains of light: additive vertex-coloured ribbons, bright at the lower edge fading upward
        const AP = [], AC = [], AI = [], R3 = 262, segs = 36;
        const pal = [[0.15, 1, 0.55], [0.3, 0.9, 0.9], [0.65, 0.4, 1]];
        for (let k = 0; k < 3; k++) {
          const a0 = vr() * 6.28, span = 1.2 + vr() * 0.9, el0 = (14 + k * 6 + vr() * 6) * Math.PI / 180, p1 = vr() * 6.28, base = AP.length / 3;
          for (let i = 0; i <= segs; i++) {
            const t = i / segs, az = a0 + t * span, wob = Math.sin(t * 9 + p1) * 0.07 + Math.sin(t * 4 + p1 * 2) * 0.05, e0 = el0 + wob, e1 = e0 + (0.32 + 0.12 * Math.sin(t * 6 + p1)) * (0.7 + 0.3 * Math.sin(t * Math.PI));
            const fade = Math.sin(t * Math.PI), pc = pal[k % 3], lo = 0.7 * fade, hi = 0.0;
            AP.push(Math.cos(az) * Math.cos(e0) * R3, Math.sin(e0) * R3, Math.sin(az) * Math.cos(e0) * R3, Math.cos(az) * Math.cos(e1) * R3, Math.sin(e1) * R3, Math.sin(az) * Math.cos(e1) * R3);
            AC.push(pc[0] * lo, pc[1] * lo, pc[2] * lo, pc[0] * hi, pc[1] * hi, pc[2] * hi);
          }
          for (let i = 0; i < segs; i++) { const q = base + i * 2; AI.push(q, q + 1, q + 3, q, q + 3, q + 2); }
        }
        const ag = new THREE.BufferGeometry();
        ag.setAttribute('position', new THREE.Float32BufferAttribute(AP, 3)); ag.setAttribute('color', new THREE.Float32BufferAttribute(AC, 3)); ag.setIndex(AI);
        this._geoms.push(ag);
        const am = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false, side: THREE.DoubleSide });
        this._mats.push(am);
        const au = new THREE.Mesh(ag, am); au.renderOrder = -993; this._follow(au, 0.003); this._add(au);
      }
      if (fx.indexOf('nebula') >= 0) {
        const nt = nebulaTex();
        if (nt) {
          const NP = [], NU = [], NC = [], NI = [], R4 = 275, cols = [[0.9, 0.25, 0.7], [0.25, 0.55, 1], [0.6, 0.35, 1], [0.2, 0.9, 0.8]];
          for (let k = 0; k < 14; k++) {
            const az = vr() * 6.28, el = (vr() * 1.2 - 0.25) * 0.9, sz = 60 + vr() * 80, ce = Math.cos(el), cx = Math.cos(az) * ce * R4, cy = Math.sin(el) * R4, cz = Math.sin(az) * ce * R4;
            const rx = -Math.sin(az), rz = Math.cos(az), rot = vr() * 6.28, c = cols[k % 4], br = 0.35 + vr() * 0.3, vi = NP.length / 3;
            const ca = Math.cos(rot), sa = Math.sin(rot);
            for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const lu = (u * ca - v * sa) * sz, lv = (u * sa + v * ca) * sz; NP.push(cx + rx * lu, cy + lv, cz + rz * lu); NC.push(c[0] * br, c[1] * br, c[2] * br); }
            NU.push(0, 0, 1, 0, 1, 1, 0, 1); NI.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
          }
          const ng = new THREE.BufferGeometry();
          ng.setAttribute('position', new THREE.Float32BufferAttribute(NP, 3)); ng.setAttribute('uv', new THREE.Float32BufferAttribute(NU, 2)); ng.setAttribute('color', new THREE.Float32BufferAttribute(NC, 3)); ng.setIndex(NI);
          this._geoms.push(ng);
          const nm = new THREE.MeshBasicMaterial({ map: nt, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false, side: THREE.DoubleSide });
          this._mats.push(nm);
          const nb = new THREE.Mesh(ng, nm); nb.renderOrder = -999; this._follow(nb, 0.002); this._add(nb);
        }
      }
    }

    _roadColors() {
      const cfg = this.cfg;
      return { a: col(cfg.road[0]), b: col(cfg.road[1]), c0: col(cfg.curb[0]), c1: col(cfg.curb[1]) };
    }

    _buildRoad(def) {
      const N = this.N, ds = this.ds, star = this.theme === 'starlight';
      const rc = this._roadColors(), road = new Batch(true), hwA = this.hw;
      const white = [1, 1, 1];
      const ice = this.theme === 'glacier' && def.builtinScenery ? { c: col(0xa9d9ff), c2: col(0x92c9f2) } : null;
      let iceD0 = 0, iceD1 = 0;
      if (ice) {
        const mid = this._dist(def.lakeDist), half = (def.iceLen || 100) / 2;
        iceD0 = mid - half; iceD1 = mid + half;
      }
      // ---- cross-section: 15 columns (curb, bevel, gap, edge line, asphalt, tire band, asphalt, centre, mirrored)
      const KIND = ['curb', 'slope', 'gap', 'line', 'asph', 'tire', 'asph', 'center', 'asph', 'tire', 'asph', 'line', 'gap', 'slope', 'curb'];
      const DYL = [0.075, 0.075, 0.02, 0.028, 0.02, 0.02, 0.02, 0.026, 0.02, 0.02, 0.02, 0.028, 0.02, 0.02, 0.075];
      const DYR = [0.075, 0.02, 0.02, 0.028, 0.02, 0.02, 0.02, 0.026, 0.02, 0.02, 0.02, 0.028, 0.02, 0.075, 0.075];
      const NC = KIND.length, TW = 6, GAIN = 1.18;
      const bnd = (h, o) => {
        const tb = 0.45 * h;
        o[0] = -h; o[1] = -h + 0.5; o[2] = -h + 1.1; o[3] = -h + 1.35; o[4] = -h + 1.65; o[5] = -tb - 0.9; o[6] = -tb + 0.9; o[7] = -0.15;
        o[8] = 0.15; o[9] = tb - 0.9; o[10] = tb + 0.9; o[11] = h - 1.65; o[12] = h - 1.35; o[13] = h - 1.1; o[14] = h - 0.5; o[15] = h;
      };
      const bi = new Float32Array(NC + 1), bj = new Float32Array(NC + 1);
      const paint = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
      for (let i = 0; i < N; i += 2) {
        const j = i + 2 >= N ? 0 : i + 2, r = i >> 1, d = i * ds, d2 = (i + 2) * ds;
        const hi = hwA[i], hj = hwA[j];
        const vi = d / TW, vj = d2 / TW;
        if (i < 4) {
          // start / finish checkerboard
          const nc = Math.max(4, Math.round((2 * hi) / 2.2));
          for (let c = 0; c < nc; c++) {
            const l0i = -hi + (c * 2 * hi) / nc, l1i = -hi + ((c + 1) * 2 * hi) / nc;
            const l0j = -hj + (c * 2 * hj) / nc, l1j = -hj + ((c + 1) * 2 * hj) / nc;
            const k = ((r + c) & 1) ? [0.1, 0.1, 0.1] : [1.1, 1.1, 1.1];
            road.quadUV(this._P(i, l0i, 0.04), this._P(i, l1i, 0.04), this._P(j, l1j, 0.04), this._P(j, l0j, 0.04), k,
              [l0i / TW, vi, l1i / TW, vi, l1j / TW, vj, l0j / TW, vj]);
          }
          continue;
        }
        bnd(hi, bi); bnd(hj, bj);
        const stripe = (r >> 2) & 1, dash = ((r >> 1) & 1) === 0, curbT = r & 1;
        const inIce = ice && d > iceD0 && d < iceD1;
        const streak = 0.9 + 0.04 * hash2(r, 3.7);
        for (let c = 0; c < NC; c++) {
          const kind = KIND[c];
          let k;
          if (star) {
            const hue = d * 0.0022 + c * 0.07;
            if (kind === 'curb' || kind === 'slope') k = curbT ? [1, 1, 1] : hsl(hue, 1, 0.75);
            else if (kind === 'line') k = [1, 1, 1];
            else if (kind === 'center') k = dash ? [1, 1, 1] : hsl(hue, 0.9, 0.55);
            else k = hsl(hue, 0.9, stripe ? 0.5 : 0.56);
          } else {
            const base = inIce ? (stripe ? ice.c : ice.c2) : (stripe ? rc.a : rc.b);
            if (kind === 'curb') k = paint(curbT ? rc.c1 : rc.c0, GAIN);
            else if (kind === 'slope') k = paint(curbT ? rc.c1 : rc.c0, 0.8);
            else if (kind === 'line') k = [1.12, 1.12, 1.12];
            else if (kind === 'center') k = dash ? [1.12, 1.12, 1.12] : base;
            else if (kind === 'tire') k = inIce ? base : paint(base, streak);
            else k = base;
          }
          if (!star) {
            // painted wear: soft blotches, rubber-darkened racing line, occasional repair patches; shadow under the curb lip
            let wv = 1;
            if (kind === 'asph' || kind === 'tire') {
              wv = (inIce ? 0.97 : 0.8) + 0.24 * vnoise(d * 0.045, c * 1.3 + 5, 3) - 0.08 * vnoise(d * 0.3, c * 2.1, 9);
              if (hash2(r >> 3, 7.7) < 0.12 && c > 3 && c < 11) wv *= 0.84 + 0.05 * ((c & 1) ? 1 : -1);
              if (kind === 'tire') wv *= 0.9;
            } else if (kind === 'gap') wv = 0.82;
            if (wv !== 1) k = [k[0] * wv, k[1] * wv, k[2] * wv];
          }
          const l0i = bi[c], l1i = bi[c + 1], l0j = bj[c], l1j = bj[c + 1];
          road.quadUV(this._P(i, l0i, DYL[c]), this._P(i, l1i, DYR[c]), this._P(j, l1j, DYR[c]), this._P(j, l0j, DYL[c]), k,
            [l0i / TW, vi, l1i / TW, vi, l1j / TW, vj, l0j / TW, vj]);
        }
        if (!star) {
          // vertical curb lips down to the shoulder (darker)
          const lip = paint(curbT ? rc.c1 : rc.c0, 0.65);
          for (let s = 0; s < 2; s++) {
            const li = s ? bi[NC] : bi[0], lj = s ? bj[NC] : bj[0], u = li / TW, u2 = lj / TW;
            road.quadUV(this._P(i, li, -0.01), this._P(i, li, 0.075), this._P(j, lj, 0.075), this._P(j, lj, -0.01), lip, [u, vi, u, vi, u2, vj, u2, vj]);
          }
        }
        if (star) {
          // slab underside & edges
          const dk = (r & 1) ? col(0x4a2a9a) : col(0x6a3cc8), bk = col(0x1c0d44), z8 = [0, 0, 0, 0, 0, 0, 0, 0];
          for (let s = -1; s <= 1; s += 2) road.quadUV(this._P(i, s * hi, 0), this._P(i, s * hi, -0.9), this._P(j, s * hj, -0.9), this._P(j, s * hj, 0), dk, z8);
          road.quadUV(this._P(i, -hi, -0.9), this._P(i, hi, -0.9), this._P(j, hj, -0.9), this._P(j, -hj, -0.9), bk, z8);
        }
      }
      // continuous guard rails (def.rails) except across void-zone gaps
      if (this.rails) {
        const inGap = (d) => {
          for (let k = 0; k < this.nrect; k++) { const q = this.rects[k]; if (q.kind === 'void' && d >= q.d0 - 2 && d <= q.d1 + 2) return true; }
          return false;
        };
        const rc0 = def.railColors ? col(def.railColors[0]) : star ? col(0x66f2ff) : col(0xd8d2c4);
        const rc1 = def.railColors ? col(def.railColors[1] || def.railColors[0]) : star ? col(0xff6ad5) : col(0xb8b0a0);
        for (let i = 0; i < N; i += 2) {
          const j = i + 2 >= N ? 0 : i + 2;
          if (inGap(i * ds)) continue;
          const cc = ((i >> 2) & 1) ? rc0 : rc1;
          for (let s = -1; s <= 1; s += 2) {
            const a0 = s * (hwA[i] + 0.6), a1 = s * (hwA[i] + 1.05), b0 = s * (hwA[j] + 0.6), b1 = s * (hwA[j] + 1.05);
            road.quad(this._P(i, a0, 0.05), this._P(i, a0, 0.9), this._P(j, b0, 0.9), this._P(j, b0, 0.05), cc);
            road.quad(this._P(i, a0, 0.9), this._P(i, a1, 0.9), this._P(j, b1, 0.9), this._P(j, b0, 0.9), cc);
            road.quad(this._P(i, a1, 0.9), this._P(i, a1, 0.05), this._P(j, b1, 0.05), this._P(j, b1, 0.9), cc);
          }
        }
      }
      // glowing guard rails on the outside of sharper corners (starlight only)
      if (star && !this.rails) {
        for (let i = 0; i < N; i += 2) {
          const j = i + 2 >= N ? 0 : i + 2;
          if (Math.abs(this.curv[i]) < 0.011) continue;
          const s = this.curv[i] > 0 ? 1 : -1, cc = ((i >> 2) & 1) ? col(0x66f2ff) : col(0xff6ad5);
          const a0 = s * (hwA[i] + 0.1), a1 = s * (hwA[i] + 0.55), b0 = s * (hwA[j] + 0.1), b1 = s * (hwA[j] + 0.55);
          road.quad(this._P(i, a0, 0.05), this._P(i, a0, 1.0), this._P(j, b0, 1.0), this._P(j, b0, 0.05), cc);
          road.quad(this._P(i, a0, 1.0), this._P(i, a1, 1.0), this._P(j, b1, 1.0), this._P(j, b0, 1.0), cc);
          road.quad(this._P(i, a1, 1.0), this._P(i, a1, 0.05), this._P(j, b1, 0.05), this._P(j, b1, 1.0), cc);
        }
      }
      const roadTex = star ? null : asphaltTex();
      const roadMat = this._mat(roadTex ? { map: roadTex } : {}, star);
      if (star) this._hueShift(roadMat);   // the rainbow flows along the ribbon
      this.roadMesh = this._mesh(road, roadMat, true);
      if (this.roadMesh) this.roadMesh.receiveShadow = true;

      // boost pads & jump ramps (flat decals just above the road)
      const pad = new Batch(), bpad = new Batch(true), cTex = chevTex();
      const wbat = {};   // animated water decals, one batch per colour
      const orange = col(0xff8a00), yellow = col(0xfff25a), blue = col(0x2c6bff), wht = [1, 1, 1];
      for (let k = 0; k < this.nrect; k++) {
        const q = this.rects[k], boost = q.kind === 'boost';
        if (q.kind !== 'boost' && q.kind !== 'jump' && q.kind !== 'cannon') {
          if (q.decal === false) continue;
          // surface zone decal
          const zc = q.color !== undefined ? col(q.color) : col(ZONE_COLORS[q.kind] || 0x777777);
          if (q.kind === 'water' && G.GFX && G.GFX.water) {
            const wk = q.color !== undefined ? q.color : ZONE_COLORS.water, wb = wbat[wk] || (wbat[wk] = new Batch());
            for (let d = q.d0; d < q.d1 - 0.01; d += 2) {
              const d2 = Math.min(q.d1, d + 2);
              wb.quad(this._PD(d, q.l0, 0.06), this._PD(d, q.l1, 0.06), this._PD(d2, q.l1, 0.06), this._PD(d2, q.l0, 0.06), zc);
            }
            continue;
          }
          for (let d = q.d0; d < q.d1 - 0.01; d += 2) {
            const d2 = Math.min(q.d1, d + 2), sh = ((d / 2) | 0) & 1 ? 1 : 0.93;
            pad.quad(this._PD(d, q.l0, 0.06), this._PD(d, q.l1, 0.06), this._PD(d2, q.l1, 0.06), this._PD(d2, q.l0, 0.06), mul(zc, sh));
          }
          continue;
        }
        const base = boost ? orange : q.kind === 'cannon' ? col(0x8a4a1c) : blue, chev = boost ? yellow : wht;
        if (boost && cTex) {
          // animated pad: one textured strip, chevrons scroll forward (map.offset in update)
          const wq = q.l1 - q.l0;
          for (let d = q.d0; d < q.d1 - 0.01; d += 1.5) {
            const d2 = Math.min(q.d1, d + 1.5), v0 = (d - q.d0) / 3, v1 = (d2 - q.d0) / 3;
            bpad.quadUV(this._PD(d, q.l0, 0.07), this._PD(d, q.l1, 0.07), this._PD(d2, q.l1, 0.07), this._PD(d2, q.l0, 0.07), wht, [0, v0, 1, v0, 1, v1, 0, v1]);
          }
          continue;
        }
        for (let d = q.d0; d < q.d1 - 0.01; d += 2) {
          const d2 = Math.min(q.d1, d + 2);
          pad.quad(this._PD(d, q.l0, 0.07), this._PD(d, q.l1, 0.07), this._PD(d2, q.l1, 0.07), this._PD(d2, q.l0, 0.07), base);
        }
        const w = q.l1 - q.l0, lc = (q.l0 + q.l1) / 2, h = Math.min(w / 2 - 0.4, 2.2), t = 0.9;
        const n = Math.max(1, Math.floor((q.d1 - q.d0) / 3));
        for (let c = 0; c < n; c++) {
          const dc = q.d0 + 0.5 + c * 3;
          pad.quad(this._PD(dc, q.l0 + 0.4, 0.1), this._PD(dc + h, lc, 0.1), this._PD(dc + h + t, lc, 0.1), this._PD(dc + t, q.l0 + 0.4, 0.1), chev);
          pad.quad(this._PD(dc, q.l1 - 0.4, 0.1), this._PD(dc + h, lc, 0.1), this._PD(dc + h + t, lc, 0.1), this._PD(dc + t, q.l1 - 0.4, 0.1), chev);
        }
        if (q.kind === 'jump') {
          // ramp lip posts
          const post = col(0xffffff);
          const a = this._PD(q.d0, q.l0 - 0.6, 0), b = this._PD(q.d0, q.l1 + 0.6, 0);
          pad.box(a[0], a[1], a[2], 0.5, 2.4, 0.5, 0, post);
          pad.box(b[0], b[1], b[2], 0.5, 2.4, 0.5, 0, post);
        }
      }
      const padMat = this._mat({}, true);
      this.padMesh = this._mesh(pad, padMat, true);
      this._padMat = padMat;
      if (!bpad.empty) {
        const bm = this._mat({ map: cTex }, true);
        this._boostMat = bm; this._boostTex = cTex;
        this._mesh(bpad, bm, true);
      }
      for (const wk in wbat) {
        const wm = this._waterMat({ color: +wk, opacity: 0.86 });
        const m = this._mesh(wbat[wk], wm, true);
        if (m) m.renderOrder = 2;
      }
    }

    // shoulders, embankments, walls/fences
    _buildBoundaries(def) {
      const N = this.N, star = this.theme === 'starlight', cfg = this.cfg, theme = this.theme;
      if (star || this.noWalls) return;
      const sh = this.shoulder, gy = this.groundY;
      const shC = col(cfg.shoulder), emC = col(cfg.emb), g = new Batch(true);
      const wallsOn = (def.walls || 'x') !== 'none';
      // road -> shoulder blend: curb shadow, dirt/gravel edge, shoulder colour, wall-base occlusion; embankment toe AO
      const sat = Math.max(shC[0], shC[1], shC[2]) - Math.min(shC[0], shC[1], shC[2]);
      const shKind = sat < 0.12 ? 'rock' : this._terrainKind(def);
      const gravel = mix(shC, shKind === 'sand' ? [0.78, 0.6, 0.4] : shKind === 'snow' ? [0.7, 0.78, 0.88] : [0.52, 0.45, 0.36], 0.55);
      const w0 = Math.min(0.5, sh * 0.2), w1 = Math.min(1.5, sh * 0.4), wb = wallsOn ? Math.min(1.0, sh * 0.3) : 0;
      const stops = [[0, mul(gravel, 0.5)], [w0, mul(gravel, 0.78)], [w0 + w1, gravel], [Math.min(sh - wb, w0 + w1 + 1.6), shC]];
      if (wb > 0) stops.push([sh - wb, shC]);
      stops.push([sh, wb > 0 ? mul(shC, 0.62) : shC]);
      const sk = []; for (const q of stops) if (!sk.length || q[0] > sk[sk.length - 1][0] + 0.01) sk.push(q);
      sk[sk.length - 1][0] = sh;
      const GT = 8;
      for (let i = 0; i < N; i += 2) {
        const j = i + 2 >= N ? 0 : i + 2, hi = this.hw[i], hj = this.hw[j];
        const shade = ((i >> 3) & 1) ? 1 : 0.94, di = i * this.ds, dj = (i + 2) * this.ds;
        for (let s = -1; s <= 1; s += 2) {
          for (let c = 0; c < sk.length - 1; c++) {
            const e0 = sk[c][0], e1 = sk[c + 1][0], k0 = mul(sk[c][1], shade), k1 = mul(sk[c + 1][1], shade);
            g.quadUVC(this._P(i, s * (hi + e0), -0.01), this._P(i, s * (hi + e1), -0.01), this._P(j, s * (hj + e1), -0.01), this._P(j, s * (hj + e0), -0.01), k0, k1, k1, k0,
              [di / GT, (s * e0) / GT, di / GT, (s * e1) / GT, dj / GT, (s * e1) / GT, dj / GT, (s * e0) / GT]);
          }
          const yi = this.py[i] - gy, yj = this.py[j] - gy, top = wallsOn ? mul(emC, 0.72) : emC;
          g.quadUVC(this._P(i, s * (hi + sh), -0.01), this._P(i, s * (hi + sh + EMB), -yi), this._P(j, s * (hj + sh + EMB), -yj), this._P(j, s * (hj + sh), -0.01), top, emC, emC, top,
            [di / GT, (s * sh) / GT, di / GT, (s * (sh + EMB)) / GT, dj / GT, (s * (sh + EMB)) / GT, dj / GT, (s * sh) / GT]);
        }
      }
      const shMap = groundTex(shKind);
      const shMat = this._mat(shMap ? { map: shMap } : {}, false);
      if (shMap) this._detail(shMat, { scale: 0.12, strength: 0.14, macro: 0.2 });
      this.shoulderMesh = this._mesh(g, shMat, true);
      if (this.shoulderMesh) this.shoulderMesh.receiveShadow = true;

      // walls / fences
      const w = new Batch();
      const ribbon = (side, o0, o1, y0, y1, step, cf) => {
        for (let i = 0; i < N; i += step) {
          const j = i + step >= N ? 0 : i + step, k = cf(i);
          const li = side * (this.hw[i] + sh + o0), lo = side * (this.hw[i] + sh + o1);
          const mi = side * (this.hw[j] + sh + o0), mo = side * (this.hw[j] + sh + o1);
          const kb = [k[0] * 0.68, k[1] * 0.68, k[2] * 0.68], ko = [k[0] * 0.58, k[1] * 0.58, k[2] * 0.58];   // baked AO toward the wall base
          w.quadC(this._P(i, li, y0), this._P(i, li, y1), this._P(j, mi, y1), this._P(j, mi, y0), kb, k, k, kb);
          w.quad(this._P(i, li, y1), this._P(i, lo, y1), this._P(j, mo, y1), this._P(j, mi, y1), k);
          w.quadC(this._P(i, lo, y1), this._P(i, lo, y0), this._P(j, mo, y0), this._P(j, mo, y1), k, ko, ko, k);
        }
      };
      const wallStyle = def.walls || (theme === 'meadow' ? 'fence' : theme === 'dunes' ? 'adobe' : 'barrier');
      if (wallStyle === 'none') { this.wallMesh = null; return; }
      const wc = def.wallColors ? def.wallColors.map(col) : null;
      for (let s = -1; s <= 1; s += 2) {
        if (wc) {
          ribbon(s, 0, 0.9, 0, 1.1, 4, (i) => (((i >> 2) & 1) ? wc[0] : wc[1] || wc[0]));
        } else if (wallStyle === 'fence') {
          const wood = col(0xb8844a), wood2 = col(0xa87438), post = col(0x8a5a2b);
          ribbon(s, 0, 0.14, 0.35, 0.55, 2, (i) => ((i >> 2) & 1 ? wood : wood2));
          ribbon(s, 0, 0.14, 0.8, 1.0, 2, (i) => ((i >> 2) & 1 ? wood : wood2));
          for (let i = 0; i < N; i += 4) {
            const p = this._P(i, s * (this.hw[i] + sh + 0.07), 0);
            w.box(p[0], p[1], p[2], 0.28, 1.15, 0.28, Math.atan2(this.tx[i], this.tz[i]), post);
          }
        } else if (wallStyle === 'adobe') {
          const a = col(0xcf9c5a), b = col(0xb98446);
          ribbon(s, 0, 0.9, 0, 1.1, 6, (i) => (((i / 6) | 0) & 1 ? a : b));
        } else {
          const top = col(0xf6fbff), side = col(0xc4dcee);
          ribbon(s, 0, 1.8, 0, 0.8, 4, (i) => (((i >> 2) & 1) ? top : side));
          ribbon(s, 0, 0.9, 0.8, 1.2, 4, () => top);
        }
      }
      this.wallMesh = this._mesh(w, this._mat({}, false), true);
      if (this.wallMesh) this.wallMesh.receiveShadow = true;
    }

    _buildGround() {
      const geo = new THREE.PlaneGeometry(6000, 6000);
      geo.rotateX(-Math.PI / 2);
      this._geoms.push(geo);
      const mat = new THREE.MeshLambertMaterial({ color: this.cfg.ground });
      this._detail(mat, { scale: 0.22, strength: 0.4, macro: 0.25 });
      this._mats.push(mat);
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = true;
      m.position.set(this.px[0], this.groundY, this.pz[0]);
      m.frustumCulled = false;
      this.ground = this._add(m);
    }

    // ================================================== v6 TERRAIN (sculpted heightfield around the road)
    // def.terrain: false = off; true / {kind:'grass'|'sand'|'snow'|'dirt', amp:1, hills:1, colors:{...}} = on.
    // Default: on for every course that has the legacy ground plane and a normal road (not space / indoor / void / ground:false).
    _terrainWanted(def) {
      if (def.terrain === false) return false;
      if (this.theme === 'starlight' || this.skyMode === 'space' || this.skyMode === 'indoor') return false;
      if (def.terrain) return true;
      if (def.ground === false || !this.ground) return false;
      if (this.noWalls && !this.rails) return false;
      return true;
    }
    _terrainKind(def) {
      const o = typeof def.terrain === 'object' ? def.terrain : {};
      if (o.kind) return o.kind;
      const st = def.style || this.theme;
      if (st === 'dunes') return 'sand';
      if (st === 'glacier') return 'snow';
      const c = col(this.cfg.ground), l = lum(c);
      if (l > 0.72 && c[2] >= c[0] * 0.95) return 'snow';
      if (c[0] > c[1] * 1.02 && c[0] > c[2] * 1.3 && l > 0.42) return 'sand';
      if (c[0] > c[1] * 1.0 && l <= 0.42) return 'dirt';
      if (this.offroadSurface === 'sand') return 'sand';
      if (this.offroadSurface === 'mud') return 'dirt';
      return 'grass';
    }
    // build-space terrain height (falls back to groundY off the grid / when terrain is off)
    terrainY(x, z) {
      const T = this._ter; if (!T) return this.groundY;
      let fx = (x - T.x0) / T.c, fz = (z - T.z0) / T.c;
      if (fx < 0 || fz < 0 || fx > T.nx || fz > T.nz) return this.groundY;
      let a = Math.floor(fx), b = Math.floor(fz); if (a >= T.nx) a = T.nx - 1; if (b >= T.nz) b = T.nz - 1;
      fx -= a; fz -= b;
      const W = T.nz + 1, H = T.H, h00 = H[a * W + b], h10 = H[(a + 1) * W + b], h01 = H[a * W + b + 1], h11 = H[(a + 1) * W + b + 1];
      return h00 + (h10 - h00) * fx + (h01 - h00) * fz + (h00 - h10 - h01 + h11) * fx * fz;
    }
    aoSpot(x, z, r, s) { if (this._ao.length < 4000) this._ao.push(x, z, r, s === undefined ? 0.3 : s); }

    _initTerrain(def) {
      this._ter = null;
      if (!this._terrainWanted(def)) return;
      const o = typeof def.terrain === 'object' ? def.terrain : {};
      const kind = this._terrainKind(def), N = this.N, gy = this.groundY;
      const sh = this.noWalls ? 1 : this.shoulder, emb = this.noWalls ? 0 : EMB;
      const sd = (def.seed || 7) * 0.37 + (this.rev ? 3.1 : 0);
      let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, hwMax = 0, hwAvg = 0;
      for (let i = 0; i < N; i += 2) {
        minX = Math.min(minX, this.px[i]); maxX = Math.max(maxX, this.px[i]); minZ = Math.min(minZ, this.pz[i]); maxZ = Math.max(maxZ, this.pz[i]);
        hwMax = Math.max(hwMax, this.hw[i]); hwAvg += this.hw[i];
      }
      hwAvg /= Math.ceil(N / 2);
      // grid sizing: <= ~34k cells (~68k tris)
      let pad = o.pad || 240, c;
      for (let tries = 0; tries < 4; tries++) {
        const W = maxX - minX + pad * 2, Hh = maxZ - minZ + pad * 2;
        c = Math.min(8, Math.max(o.cell || 3.5, Math.sqrt((W * Hh) / 34000)));
        if (c <= 6.5) break;
        pad *= 0.8;
      }
      const x0 = Math.floor((minX - pad) / c) * c, z0 = Math.floor((minZ - pad) / c) * c;
      const nx = Math.ceil((maxX + pad - x0) / c), nz = Math.ceil((maxZ + pad - z0) / c), Wd = nz + 1, V = (nx + 1) * Wd;
      // spatial hash of every 2nd centreline sample (16 m cells), CSR layout
      const CH = 16, sm = [];
      for (let i = 0; i < N; i += 2) sm.push(i);
      const cellOf = new Map(), cx0 = Math.floor((x0 - 8) / CH), cz0 = Math.floor((z0 - 8) / CH);
      const key = (a, b) => (a - cx0) * 4096 + (b - cz0);
      for (let k = 0; k < sm.length; k++) { const i = sm[k], kk = key(Math.floor(this.px[i] / CH), Math.floor(this.pz[i] / CH)); let a = cellOf.get(kk); if (!a) cellOf.set(kk, a = []); a.push(i); }
      const R1 = hwMax + sh + emb + 50, RR = Math.ceil(R1 / CH);
      const D = new Float32Array(V).fill(1e9), NI = new Int32Array(V).fill(-1);
      const px = this.px, pz = this.pz;
      // 1) seed the grid with the centreline (every sample touches its 4 corner vertices), 2) chamfer-propagate an approximate
      // distance field, 3) refine every vertex within the corridor / near field with an exact nearest-sample search
      for (let k = 0; k < sm.length; k++) {
        const i = sm[k], fa = (px[i] - x0) / c, fb = (pz[i] - z0) / c, a0 = Math.floor(fa), b0 = Math.floor(fb);
        for (let da = 0; da <= 1; da++) for (let db = 0; db <= 1; db++) {
          const a = a0 + da, b = b0 + db; if (a < 0 || b < 0 || a > nx || b > nz) continue;
          const d = Math.hypot(x0 + a * c - px[i], z0 + b * c - pz[i]), q = a * Wd + b;
          if (d < D[q]) D[q] = d;
        }
      }
      const w1 = c, w2 = c * 1.4142;
      for (let a = 0; a <= nx; a++) for (let b = 0; b <= nz; b++) {
        const q = a * Wd + b; let d = D[q];
        if (a > 0) { d = Math.min(d, D[q - Wd] + w1); if (b > 0) d = Math.min(d, D[q - Wd - 1] + w2); if (b < nz) d = Math.min(d, D[q - Wd + 1] + w2); }
        if (b > 0) d = Math.min(d, D[q - 1] + w1);
        D[q] = d;
      }
      for (let a = nx; a >= 0; a--) for (let b = nz; b >= 0; b--) {
        const q = a * Wd + b; let d = D[q];
        if (a < nx) { d = Math.min(d, D[q + Wd] + w1); if (b > 0) d = Math.min(d, D[q + Wd - 1] + w2); if (b < nz) d = Math.min(d, D[q + Wd + 1] + w2); }
        if (b < nz) d = Math.min(d, D[q + 1] + w1);
        D[q] = d;
      }
      for (let a = 0; a <= nx; a++) for (let b = 0; b <= nz; b++) {
        const q = a * Wd + b, ap = D[q];
        if (ap > R1) continue;
        const x = x0 + a * c, z = z0 + b * c, gx = Math.floor(x / CH), gz = Math.floor(z / CH);
        let best = 1e18, bi = -1;
        for (let r = Math.max(0, Math.floor((ap - c * 2) / CH) - 1); r <= RR + 2; r++) {
          if (bi >= 0 && (r - 1) * CH > Math.sqrt(best)) break;
          for (let u = -r; u <= r; u++) for (let v = -r; v <= r; v++) {
            if (r > 0 && Math.abs(u) !== r && Math.abs(v) !== r) continue;
            const arr = cellOf.get(key(gx + u, gz + v)); if (!arr) continue;
            for (let k = 0; k < arr.length; k++) { const i = arr[k], dx = x - px[i], dz = z - pz[i], d2 = dx * dx + dz * dz; if (d2 < best) { best = d2; bi = i; } }
          }
        }
        if (bi >= 0) { D[q] = Math.sqrt(best); NI[q] = bi; }
      }
      const HF = ({ grass: 38, sand: 30, snow: 60, dirt: 34 }[kind] || 36) * (o.hills !== undefined ? o.hills : 1) * (o.amp !== undefined ? o.amp : 1);
      const H = new Float32Array(V), DD = new Float32Array(V);
      for (let a = 0; a <= nx; a++) for (let b = 0; b <= nz; b++) {
        const q = a * Wd + b, x = x0 + a * c, z = z0 + b * c, i = NI[q];
        const dd = D[q] - (i >= 0 ? this.hw[i] : hwAvg) - sh - emb;
        DD[q] = dd;
        let h = gy - 0.05;
        if (dd > 1) {
          const n1 = fbm(x * 0.011, z * 0.011, sd, 3), n2 = fbm(x * 0.0045 + 9, z * 0.0045, sd + 5, 3), rg = 1 - Math.abs(2 * fbm(x * 0.0035, z * 0.0035, sd + 11, 3) - 1);
          h += 1.1 * smooth01((dd - 5) / 50) * n1;
          h += 7 * Math.pow(smooth01((dd - 35) / 120), 1.6) * n2 * n2 * 2;
          h += HF * Math.pow(smooth01((dd - 110) / 160), 1.8) * (0.4 + 0.6 * rg) * (0.6 + 0.8 * n2);
        }
        H[q] = h;
      }
      this._ter = { x0, z0, c, nx, nz, H, D: DD, kind, sd, HF, sh, emb, tile: kind === 'grass' ? 9 : 12 };
    }

    _meshTerrain() {
      const T = this._ter; if (!T) return;
      const def = this.def, cfg = this.cfg, gy = this.groundY, o = typeof def.terrain === 'object' ? def.terrain : {};
      const { x0, z0, c, nx, nz, H, D, kind, sd, HF } = T, Wd = nz + 1, V = (nx + 1) * Wd;
      // ---- water bodies registered by the course (GFX water shader / fallback): carve basins, skip when the sea covers the lot
      const water = [], tmpM = new THREE.Matrix4(), bb = new THREE.Box3(), v3 = new THREE.Vector3();
      let seaCover = 0;
      for (const ob of this._objs) {
        if (!ob.isMesh || !ob.material || !ob.geometry) continue;
        const mt = ob.material;
        if (!(mt.isShaderMaterial && mt.uniforms && mt.uniforms.deep) && !(mt.isMeshPhongMaterial && mt.transparent && mt.shininess >= 80)) continue;
        const g = ob.geometry; if (!g.boundingBox) g.computeBoundingBox();
        tmpM.identity(); let p = ob; while (p && p !== this.root) { p.updateMatrix(); tmpM.premultiply(p.matrix); p = p.parent; }
        bb.copy(g.boundingBox).applyMatrix4(tmpM);
        if (bb.min.y > gy + 3 || bb.max.y > gy + 4) continue;
        const isC = g.type === 'CircleGeometry', rr = isC ? g.parameters.radius * Math.max(Math.abs(ob.scale.x), 1) : 0;
        const wA = (bb.max.x - bb.min.x) * (bb.max.z - bb.min.z);
        if (wA > (nx * c) * (nz * c) * 0.45) seaCover++;
        water.push({ x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z, circ: isC, cx: (bb.min.x + bb.max.x) / 2, cz: (bb.min.z + bb.max.z) / 2, r: rr });
      }
      if (seaCover) { this._ter = null; return; }
      const wSd = (x, z) => {
        let m = 1e9;
        for (let k = 0; k < water.length; k++) {
          const w = water[k]; let s;
          if (w.circ) s = Math.hypot(x - w.cx, z - w.cz) - w.r;
          else { const dx = Math.max(w.x0 - x, 0, x - w.x1), dz = Math.max(w.z0 - z, 0, z - w.z1); s = (dx > 0 || dz > 0) ? Math.hypot(dx, dz) : -Math.min(x - w.x0, w.x1 - x, z - w.z0, w.z1 - z); }
          if (s < m) m = s;
        }
        return m;
      };
      const wetS = water.length ? new Float32Array(V) : null;
      if (water.length) for (let a = 0; a <= nx; a++) for (let b = 0; b <= nz; b++) {
        const q = a * Wd + b, s = wSd(x0 + a * c, z0 + b * c);
        if (s > 24) { wetS[q] = 99; continue; }
        wetS[q] = s;
        const f = smooth01(s / 18);
        H[q] = (gy - 0.55) + (H[q] - (gy - 0.55)) * f;
        if (s < 6 && s > -2) H[q] = Math.max(H[q], gy + 0.02 * (6 - s) / 6 - 0.0);   // beach lip
        if (s <= -2) H[q] = gy - 0.55;
      }
      // ---- palette
      const g0 = col(o.colors && o.colors.ground !== undefined ? o.colors.ground : cfg.ground), emC = col(cfg.emb), fogc = col(cfg.fog[0]);
      let dirtC, rockC, hiC, litC;
      if (kind === 'sand') { dirtC = mix(g0, [0.82, 0.45, 0.24], 0.45); rockC = [0.8, 0.5, 0.32]; hiC = mix(g0, rockC, 0.55); litC = mix(g0, [1, 0.95, 0.75], 0.25); }
      else if (kind === 'snow') { dirtC = mix(g0, [0.62, 0.74, 0.9], 0.55); rockC = [0.46, 0.55, 0.7]; hiC = [1, 1, 1]; litC = mix(g0, [1, 1, 1], 0.5); }
      else if (kind === 'dirt') { dirtC = mul(g0, 0.8); rockC = [0.5, 0.45, 0.4]; hiC = mix(g0, rockC, 0.5); litC = mix(g0, [1, 0.9, 0.7], 0.2); }
      else { dirtC = mix(g0, [0.55, 0.42, 0.26], 0.5); rockC = [0.5, 0.49, 0.45]; hiC = mix(g0, rockC, 0.45); litC = mix(g0, [0.8, 0.9, 0.35], 0.28); }
      if (o.colors) { if (o.colors.dirt !== undefined) dirtC = col(o.colors.dirt); if (o.colors.rock !== undefined) rockC = col(o.colors.rock); if (o.colors.high !== undefined) hiC = col(o.colors.high); }
      // ---- vertices
      const pos = new Float32Array(V * 3), nor = new Float32Array(V * 3), cl = new Float32Array(V * 3), uv = new Float32Array(V * 2), tile = T.tile;
      const ao = this._ao, rimW = Math.min(nx, nz) * c * 0.5;
      for (let a = 0; a <= nx; a++) for (let b = 0; b <= nz; b++) {
        const q = a * Wd + b, x = x0 + a * c, z = z0 + b * c, h = H[q];
        pos[q * 3] = x; pos[q * 3 + 1] = h; pos[q * 3 + 2] = z;
        const hl = H[(a > 0 ? a - 1 : a) * Wd + b], hr = H[(a < nx ? a + 1 : a) * Wd + b], hd = H[a * Wd + (b > 0 ? b - 1 : b)], hu = H[a * Wd + (b < nz ? b + 1 : b)];
        let ex = -(hr - hl) / ((a > 0 && a < nx ? 2 : 1) * c), ez = -(hu - hd) / ((b > 0 && b < nz ? 2 : 1) * c);
        const nl = Math.sqrt(ex * ex + 1 + ez * ez); nor[q * 3] = ex / nl; nor[q * 3 + 1] = 1 / nl; nor[q * 3 + 2] = ez / nl;
        uv[q * 2] = x / tile; uv[q * 2 + 1] = z / tile;
        const dd = D[q], hh = h - gy, slope = 1 - 1 / nl;
        const mac = fbm(x * 0.03, z * 0.03, sd + 3, 3), pat = fbm(x * 0.017 + 40, z * 0.017, sd + 8, 3);
        let k = mul(g0, 0.9 + 0.2 * mac);
        k = mix(k, litC, smooth01((mac - 0.55) / 0.3) * 0.5);
        const dirtA = smooth01((pat - 0.6) / 0.14) * smooth01((dd - 8) / 20) * 0.75;
        k = mix(k, dirtC, dirtA);
        const rockA = Math.max(smooth01((slope - 0.1) / 0.14), smooth01((hh - HF * 0.42) / (HF * 0.4)) * 0.8) * smooth01((dd - 12) / 25);
        k = mix(k, kind === 'snow' ? mix(rockC, [0.85, 0.9, 1], 0.2) : rockC, rockA * 0.85);
        if (kind === 'snow') k = mix(k, [1, 1, 1], smooth01((hh - HF * 0.55) / (HF * 0.25)) * (1 - slope * 2.2 > 0 ? 1 : 0.3));
        else k = mix(k, hiC, smooth01((hh - HF * 0.5) / (HF * 0.4)) * 0.6);
        k = mix(emC, k, smooth01(dd / 16));                                   // continue the embankment colour
        if (wetS && wetS[q] < 5) { const w = 1 - smooth01((wetS[q] + 1) / 6); k = mix(k, mul(mix(g0, [0.8, 0.7, 0.5], 0.5), 0.78), w * 0.8); }
        // baked AO: contact shade beside the embankment toe and along the shoulder
        let aoM = 1 - 0.12 * (1 - smooth01(dd / 5));
        k = [k[0] * aoM, k[1] * aoM, k[2] * aoM];
        // distant haze tint toward the rim
        const ex2 = Math.min(a, nx - a) * c, ez2 = Math.min(b, nz - b) * c, e = Math.min(ex2, ez2), rim = 1 - smooth01(e / (rimW * 0.5));
        k = mix(k, fogc, 0.32 * rim * rim);
        cl[q * 3] = k[0]; cl[q * 3 + 1] = k[1]; cl[q * 3 + 2] = k[2];
      }
      // contact shadows beneath props (trees, rocks, buildings, lamps registered through the kit)
      for (let s = 0; s < ao.length; s += 4) {
        const ax = ao[s], az = ao[s + 1], r = ao[s + 2], st = ao[s + 3];
        const a0 = Math.max(0, Math.floor((ax - r - x0) / c)), a1 = Math.min(nx, Math.ceil((ax + r - x0) / c)), b0 = Math.max(0, Math.floor((az - r - z0) / c)), b1 = Math.min(nz, Math.ceil((az + r - z0) / c));
        for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) {
          const d = Math.hypot(x0 + a * c - ax, z0 + b * c - az); if (d >= r) continue;
          const q = a * Wd + b, f = 1 - st * Math.pow(1 - d / r, 1.4);
          cl[q * 3] *= f; cl[q * 3 + 1] *= f; cl[q * 3 + 2] *= f;
        }
      }
      // ---- indices (skip cells wholly hidden beneath the embankment)
      const idx = [];
      for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
        const q00 = a * Wd + b, q10 = q00 + Wd, q01 = q00 + 1, q11 = q10 + 1;
        if (D[q00] < -1.2 && D[q10] < -1.2 && D[q01] < -1.2 && D[q11] < -1.2) continue;
        idx.push(q00, q01, q11, q00, q11, q10);
      }
      // skirt: drop the rim to below ground so no gap shows past the heightfield edge
      const per = [];
      for (let a = 0; a < nx; a++) per.push(a * Wd);
      for (let b = 0; b < nz; b++) per.push(nx * Wd + b);
      for (let a = nx; a > 0; a--) per.push(a * Wd + nz);
      for (let b = nz; b > 0; b--) per.push(b);
      const tot = V + per.length, P2 = new Float32Array(tot * 3), N2 = new Float32Array(tot * 3), C2 = new Float32Array(tot * 3), U2 = new Float32Array(tot * 2);
      P2.set(pos); N2.set(nor); C2.set(cl); U2.set(uv);
      for (let k = 0; k < per.length; k++) {
        const q = per[k], t = V + k;
        P2[t * 3] = pos[q * 3]; P2[t * 3 + 1] = gy - 6; P2[t * 3 + 2] = pos[q * 3 + 2];
        N2[t * 3 + 1] = 1; C2[t * 3] = cl[q * 3]; C2[t * 3 + 1] = cl[q * 3 + 1]; C2[t * 3 + 2] = cl[q * 3 + 2]; U2[t * 2] = uv[q * 2]; U2[t * 2 + 1] = uv[q * 2 + 1];
        const q2 = per[(k + 1) % per.length], t2 = V + ((k + 1) % per.length);
        idx.push(q, q2, t2, q, t2, t);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(P2, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N2, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(C2, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(U2, 2));
      geo.setIndex(tot > 65000 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
      geo.computeBoundingSphere(); this._geoms.push(geo);
      const map = groundTex(kind);
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: map || null, side: THREE.DoubleSide });
      this._detail(mat, { scale: 0.07, strength: 0.14, macro: 0.3 });
      this._mats.push(mat);
      const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = true;
      this.terrainMesh = this._add(mesh);
      this._terMat = mat;
      // the legacy infinite plane beyond the rim shares the texture
      if (this.ground && this.ground.geometry && map) {
        const pg = this.ground.geometry, pp = pg.attributes.position, uvs = new Float32Array(pp.count * 2), cs = new Float32Array(pp.count * 3);
        for (let i = 0; i < pp.count; i++) { uvs[i * 2] = (pp.getX(i) + this.ground.position.x) / tile; uvs[i * 2 + 1] = (pp.getZ(i) + this.ground.position.z) / tile; cs[i * 3] = g0[0]; cs[i * 3 + 1] = g0[1]; cs[i * 3 + 2] = g0[2]; }
        pg.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); pg.setAttribute('color', new THREE.BufferAttribute(cs, 3));
        this.ground.material = mat;
      }
    }

    _buildStartArch() {
      const b = new Batch(), f = this._frame(0, {}), star = this.theme === 'starlight';
      const wd = f.halfWidth + (star ? 1 : this.shoulder), h = Math.atan2(f.tx, f.tz);
      const pc = star ? col(0xff6ad5) : col(0xe8383d), pc2 = star ? col(0x6fe6ff) : col(0x2a54c8);
      const dark = col(0x1a1a1a), light = [1, 1, 1];
      for (let s = -1; s <= 1; s += 2) {
        const l = s * (wd + 1.2);
        b.box(f.x + f.rx * l, f.y, f.z + f.rz * l, 1.6, 9, 1.6, h, s < 0 ? pc : pc2);
      }
      const span = 2 * (wd + 1.2), cells = Math.round(span / 1.8), cw = span / cells;
      for (let c = 0; c < cells; c++) {
        const l = -span / 2 + (c + 0.5) * cw;
        for (let r = 0; r < 2; r++) {
          b.box(f.x + f.rx * l, f.y + 9 + r * 0.9, f.z + f.rz * l, cw, 0.9, 1.2, h, ((c + r) & 1) ? dark : light);
        }
      }
      this.arch = this._mesh(b, this._mat({}, false), true);
      // waving pennants on the arch posts (cloth batch, vertex-animated)
      const hd = Math.atan2(f.tx, f.tz);
      for (let s = -1; s <= 1; s += 2) {
        const l = s * (wd + 1.2);
        this._flag(f.x + f.rx * l, f.y + 9, f.z + f.rz * l, 4.2, 2.2, hd - Math.PI / 2, s < 0 ? [star ? 0xff6ad5 : 0xe8383d, 0xffffff] : [star ? 0x6fe6ff : 0x2a54c8, 0xffffff], { pole: 3.2, pattern: 'check' });
      }
    }

    // ================================================== v6 SCENERY HELPERS (kit.rock / bush / flowers / fence / railing / lamp / building / billboard)
    // faceted natural rock with baked AO (dark base, lit top, optional moss/snow cap). kind: 'boulder'|'slab'|'spire'|'cliff'|'pebbles'
    _rock(b, x, y, z, s, kind, o) {
      s = s || 1; o = o || {}; kind = kind || 'boulder';
      if (kind === 'cliff') {
        const n = 4 + ((hash2(x, z) * 3) | 0);
        for (let k = 0; k < n; k++) {
          const a = k * 2.4 + hash2(x + k, z) * 3, d = (k === 0 ? 0 : 1.4 + k * 0.5) * s, hh = (k === 0 ? 1 : 0.5 + hash2(z, x + k) * 0.5);
          this._rock(b, x + Math.cos(a) * d, y, z + Math.sin(a) * d, s * (k === 0 ? 1.15 : 0.7 + hash2(k, x) * 0.3), hh > 0.8 ? 'spire' : 'boulder', o);
        }
        return;
      }
      if (kind === 'pebbles') {
        for (let k = 0; k < 5; k++) this._rock(b, x + (hash2(x + k, z) - 0.5) * 2.4 * s, y, z + (hash2(z, x + k * 3) - 0.5) * 2.4 * s, s * (0.18 + hash2(k, z) * 0.18), 'boulder', o);
        return;
      }
      const base = o.color !== undefined ? col(o.color) : mix(col(this.cfg.ground), [0.52, 0.5, 0.47], 0.72), cap = o.top !== undefined ? col(o.top) : null;
      const sx = s * (kind === 'slab' ? 1.7 : kind === 'spire' ? 0.65 : 1.2), sy = s * (kind === 'slab' ? 0.55 : kind === 'spire' ? 2.6 : 0.95), sz = s * (kind === 'slab' ? 1.3 : kind === 'spire' ? 0.6 : 1.05);
      const P = icoPositions(1), ry = hash2(x * 1.3, z) * 6.28, cr = Math.cos(ry), sr = Math.sin(ry), cy = y + sy * (kind === 'spire' ? 0.5 : 0.32);
      const V = (i) => {
        let ux = P[i], uy = P[i + 1], uz = P[i + 2];
        const l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
        const nz = 1 + 0.3 * (hash2(Math.round(ux * 9) + x * 0.37, Math.round(uy * 9) + Math.round(uz * 9) * 1.7) - 0.5) * 2;
        let lx = ux * sx * nz, lz = uz * sz * nz, ly = uy * sy * nz * (kind === 'spire' && uy > 0 ? 1 + uy * 0.4 : 1);
        return [x + lx * cr + lz * sr, Math.max(y - 0.15 * s, cy + ly), z - lx * sr + lz * cr, uy];
      };
      const shade = (v, nY) => {
        const t = 0.7 + 0.42 * Math.max(0, Math.min(1, (v[1] - y) / (sy * 1.3 + 0.01)));
        let k = [base[0] * t, base[1] * t, base[2] * t];
        if (cap && nY > 0.55) k = mix(k, cap, Math.min(1, (nY - 0.55) * 3));
        return k;
      };
      for (let i = 0; i < P.length; i += 9) {
        const A = V(i), B = V(i + 3), C = V(i + 6);
        const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
        let ny = uz * vx - ux * vz; const nl = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx) || 1; ny /= nl;
        const f = 0.92 + 0.16 * hash2(i, x + z);
        const ka = mul(shade(A, ny), f), kb = mul(shade(B, ny), f), kc = mul(shade(C, ny), f);
        b.triC([A[0], A[1], A[2]], [B[0], B[1], B[2]], [C[0], C[1], C[2]], ka, kb, kc);
      }
      this.aoSpot(x, z, Math.max(sx, sz) * 1.5, 0.4);
    }
    _bush(b, x, y, z, s, o) {
      s = s || 1; o = o || {};
      const c = col(o.color !== undefined ? o.color : 0x3f9f45), h = 0.9 + hash2(x, z) * 0.2;
      b.blob(x, y + 0.45 * s, z, 1.0 * s, 0.7 * s, 1.0 * s, mul(c, 0.78 * h), 0);
      b.blob(x + 0.55 * s, y + 0.5 * s, z + 0.2 * s, 0.75 * s, 0.6 * s, 0.75 * s, mul(c, 0.95 * h), 0);
      b.blob(x - 0.5 * s, y + 0.55 * s, z - 0.2 * s, 0.7 * s, 0.6 * s, 0.7 * s, mul(c, 1.0 * h), 0);
      b.blob(x + 0.05 * s, y + 0.95 * s, z - 0.05 * s, 0.65 * s, 0.5 * s, 0.65 * s, mul(c, 1.15 * h), 0);
      if (o.berries !== undefined) { const bc = col(o.berries); for (let k = 0; k < 5; k++) { const a = k * 1.3 + h * 4; b.blob(x + Math.cos(a) * 0.7 * s, y + (0.55 + 0.25 * hash2(k, x)) * s, z + Math.sin(a) * 0.7 * s, 0.09 * s, 0.09 * s, 0.09 * s, bc, 0); } }
      this.aoSpot(x, z, 1.5 * s, 0.3);
    }
    // a little patch of flowers on stems (batch mode); colours: hex list
    _flowerPatch(b, x, y, z, r, n, colors) {
      const cs = (colors || [0xff5a6a, 0xffe14a, 0xffffff, 0xff9ae0, 0xb08cff]).map(col), stem = col(0x3f8f3a);
      n = n || 10; r = r || 1.5;
      for (let k = 0; k < n; k++) {
        const a = hash2(x + k, z) * 6.28, d = Math.sqrt(hash2(z + k, x)) * r, fx = x + Math.cos(a) * d, fz = z + Math.sin(a) * d, hh = 0.22 + hash2(k, z) * 0.22;
        b.frustum(fx, y, fz, 0.018, 0.012, hh, 3, stem, 0);
        const c = cs[(hash2(k * 3, x) * cs.length) | 0];
        b.blob(fx, y + hh + 0.04, fz, 0.12, 0.05, 0.12, c, 0);
        b.blob(fx, y + hh + 0.07, fz, 0.04, 0.03, 0.04, [1, 0.85, 0.3], 0);
      }
    }
    // post-and-rail fence along road distance d0..d1 on side (+1 right / -1 left). o: {off (m from road edge), h, rails, spacing, color, postColor, dy}
    _fenceRun(b, d0, d1, side, o) {
      o = o || {}; side = side < 0 ? -1 : 1;
      const f = {}, sp = o.spacing || 3, h = o.h || 1.1, nr = o.rails || 2, rc = col(o.color !== undefined ? o.color : 0xb8844a), pc = col(o.postColor !== undefined ? o.postColor : 0x8a5a2b), dy = o.dy || 0;
      let prev = null;
      for (let d = d0; d <= d1 + 0.01; d += sp) {
        this._frame(d, f);
        const l = side * (f.halfWidth + (o.off !== undefined ? o.off : this.shoulder + 0.5));
        const p = [f.x + f.rx * l, f.y + dy, f.z + f.rz * l];
        b.box(p[0], p[1], p[2], 0.2, h, 0.2, Math.atan2(f.tx, f.tz), pc);
        if (prev) for (let r = 0; r < nr; r++) {
          const yy = h * (nr === 1 ? 0.7 : 0.45 + (0.5 * r) / (nr - 1));
          this._prism(b, [prev[0], prev[1] + yy, prev[2]], [p[0], p[1] + yy, p[2]], 0.045, mul(rc, r & 1 ? 0.92 : 1));
        }
        prev = p;
      }
    }
    // metal guard rail: W-beam ribbon + posts with shaded underside
    _railingRun(b, d0, d1, side, o) {
      o = o || {}; side = side < 0 ? -1 : 1;
      const f = {}, g = {}, off = o.off !== undefined ? o.off : this.shoulder + 0.4, h = o.h || 0.85, dy = o.dy || 0, c = col(o.color !== undefined ? o.color : 0xc3c8d0), dk = mul(c, 0.55);
      const st = 2;
      for (let d = d0; d < d1 - 0.01; d += st) {
        const e = Math.min(d1, d + st);
        this._frame(d, f); this._frame(e, g);
        const li = side * (f.halfWidth + off), lj = side * (g.halfWidth + off);
        const a0 = [f.x + f.rx * li, f.y + dy + h * 0.55, f.z + f.rz * li], a1 = [f.x + f.rx * li, f.y + dy + h, f.z + f.rz * li];
        const b0 = [g.x + g.rx * lj, g.y + dy + h * 0.55, g.z + g.rz * lj], b1 = [g.x + g.rx * lj, g.y + dy + h, g.z + g.rz * lj];
        b.quadC(a0, a1, b1, b0, dk, c, c, dk);
        if (((d - d0) / st) % 2 < 1) { const p = [f.x + f.rx * (li + side * 0.12), f.y + dy, f.z + f.rz * (li + side * 0.12)]; b.box(p[0], p[1], p[2], 0.12, h * 0.95, 0.12, Math.atan2(f.tx, f.tz), dk); }
      }
    }
    // street / park lamp. o: {h, color (pole), lamp (bulb), glow:true, size (glow px), arm:[dx,dz] direction of the arm}
    _lamp(b, x, y, z, o) {
      o = o || {};
      const h = o.h || 6.5, pc = col(o.color !== undefined ? o.color : 0x454a56), lc = col(o.lamp !== undefined ? o.lamp : 0xfff1b0);
      b.frustum(x, y, z, 0.2, 0.12, 0.5, 8, mul(pc, 0.8), 0);
      b.frustum(x, y + 0.5, z, 0.11, 0.07, h - 0.5, 8, pc, 0);
      const ax = (o.arm ? o.arm[0] : 0), az = (o.arm ? o.arm[1] : 0), hx = x + ax, hz = z + az;
      if (ax || az) this._prism(b, [x, y + h - 0.1, z], [hx, y + h + 0.15, hz], 0.06, pc);
      b.blob(hx, y + h + 0.05, hz, 0.42, 0.22, 0.42, lc, 1);
      b.frustum(hx, y + h + 0.1, hz, 0.46, 0.2, 0.18, 8, mul(pc, 1.1), 0);
      this.aoSpot(x, z, 1.1, 0.35);
      if (o.glow !== false) this._glow.push([hx, y + h + 0.05, hz, o.size || 5, o.lamp !== undefined ? o.lamp : 0xfff1b0]);
    }
    _finishProps() {
      if (this._glow.length) {
        const bySize = {};
        for (const q of this._glow) (bySize[q[3]] || (bySize[q[3]] = [])).push(q);
        for (const sz in bySize) {
          const L = bySize[sz], pp = new Float32Array(L.length * 3), cc = new Float32Array(L.length * 3);
          L.forEach((q, i) => { pp[i * 3] = q[0]; pp[i * 3 + 1] = q[1]; pp[i * 3 + 2] = q[2]; const c = col(q[4]); cc[i * 3] = c[0]; cc[i * 3 + 1] = c[1]; cc[i * 3 + 2] = c[2]; });
          const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pp, 3)); g.setAttribute('color', new THREE.BufferAttribute(cc, 3)); this._geoms.push(g);
          const night = this.skyMode === 'night';
          const m = new THREE.PointsMaterial({ size: +sz * (night ? 1.3 : 1), sizeAttenuation: true, vertexColors: true, map: gfxTex('soft') || sunTex(), transparent: true, opacity: night ? 0.95 : 0.7, depthWrite: false, blending: THREE.AdditiveBlending });
          this._mats.push(m);
          const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 7; this._add(pts);
        }
      }
      this._glow.length = 0;
      if (this._bbB && !this._bbB.empty) this._mesh(this._bbB, this._mat({ detail: false }, false), true);
      this._bbB = null;
    }
    // building with windows + roof trim. style: 'house'|'shop'|'tower'|'castle'|'modern'; o: {y, ry, wall, roof, trim, glass, lit (0..1 chance windows glow), floors}
    _building(b, x, z, w, d, h, style, o) {
      o = o || {}; style = style || 'house';
      const y = o.y !== undefined ? o.y : this.terrainY(x, z), ry = o.ry || 0, cr = Math.cos(ry), sr = Math.sin(ry);
      const R = (lx, ly, lz) => [x + lx * cr + lz * sr, y + ly, z - lx * sr + lz * cr];
      const pal = { house: [0xf2e2c0, 0xb5503a, 0xffffff, 0x4a6a88], shop: [0xe9d3a8, 0x7a4a3a, 0xffffff, 0x3a5878], tower: [0xc9ced8, 0x5a606c, 0xe8ecf4, 0x2a3a58], castle: [0xb8b2a4, 0x7a4a4a, 0xd8d2c4, 0x2a2e3a], modern: [0xdde3ea, 0x3a3f4a, 0xffffff, 0x1c2c44] }[style] || [0xf2e2c0, 0xb5503a, 0xffffff, 0x4a6a88];
      const wall = col(o.wall !== undefined ? o.wall : pal[0]), roof = col(o.roof !== undefined ? o.roof : pal[1]), trim = col(o.trim !== undefined ? o.trim : pal[2]), glass = col(o.glass !== undefined ? o.glass : pal[3]);
      const lit = col(0xffe9a0), lp = o.lit !== undefined ? o.lit : (this.skyMode === 'night' ? 0.55 : 0.12);
      const hx = w / 2, hz = d / 2, jit = 0.94 + hash2(x, z) * 0.1;
      const wallK = mul(wall, jit), darkK = mul(wall, 0.72);
      // walls with a darker base course (AO) -- 4 sides as gradient quads
      const sides = [[-hx, -hz, hx, -hz], [hx, -hz, hx, hz], [hx, hz, -hx, hz], [-hx, hz, -hx, -hz]];
      for (const sd of sides) {
        const A = R(sd[0], 0, sd[1]), B = R(sd[2], 0, sd[3]), A2 = R(sd[0], h, sd[1]), B2 = R(sd[2], h, sd[3]);
        b.quadC(A, B, B2, A2, darkK, darkK, wallK, wallK);
      }
      b.box(x, y, z, w + 0.3, 0.5, d + 0.3, ry, mul(wall, 0.6));        // plinth
      // windows
      const cols = Math.max(1, Math.floor((style === 'castle' ? w * 0.5 : w) / (style === 'tower' || style === 'modern' ? 2.4 : 3))), floors = o.floors || Math.max(1, Math.floor((h - (style === 'shop' ? 2.6 : 1.2)) / (style === 'tower' || style === 'modern' ? 3 : 3.2)));
      const ww = style === 'modern' ? 1.7 : 1.1, wh = style === 'modern' || style === 'tower' ? 1.5 : 1.3;
      const winOn = (sdIdx, f, c) => hash2(sdIdx * 7 + c + x, f * 3 + z) < lp;
      for (let sdIdx = 0; sdIdx < 4; sdIdx++) {
        const sd = sides[sdIdx], len = Math.hypot(sd[2] - sd[0], sd[3] - sd[1]), ux = (sd[2] - sd[0]) / len, uz = (sd[3] - sd[1]) / len, nxx = uz, nzz = -ux;
        const nc = Math.max(1, Math.floor(len / (style === 'tower' || style === 'modern' ? 2.4 : 3)));
        for (let f = 0; f < floors; f++) for (let c = 0; c < nc; c++) {
          if (style === 'shop' && f === 0) continue;
          const t = (c + 0.5) / nc * len, cx = sd[0] + ux * t, cz = sd[1] + uz * t, wy = (style === 'shop' ? 2.8 : 1.1) + f * ((h - (style === 'shop' ? 3.6 : 2.4)) / Math.max(1, floors));
          const e = 0.04, k = winOn(sdIdx, f, c) ? lit : glass;
          const q = (hw2, hh2, off, col2, y0) => b.quad(R(cx - ux * hw2 + nxx * off, y0, cz - uz * hw2 + nzz * off), R(cx + ux * hw2 + nxx * off, y0, cz + uz * hw2 + nzz * off),
            R(cx + ux * hw2 + nxx * off, y0 + hh2, cz + uz * hw2 + nzz * off), R(cx - ux * hw2 + nxx * off, y0 + hh2, cz - uz * hw2 + nzz * off), col2);
          if (style !== 'modern') q(ww / 2 + 0.12, wh + 0.24, e, trim, wy - 0.12);
          q(ww / 2, wh, e * 2, k, wy);
          if (style === 'house' || style === 'shop') q(ww / 2 + 0.22, 0.12, e * 3, trim, wy - 0.2);   // sill
        }
      }
      // roof
      if (style === 'house' || style === 'shop' && o.gable) {
        const ov = 0.6, rh = Math.min(w, d) * 0.42, dkR = mul(roof, 0.8);
        const a0 = R(-hx - ov, h, -hz - ov), a1 = R(hx + ov, h, -hz - ov), a2 = R(hx + ov, h, hz + ov), a3 = R(-hx - ov, h, hz + ov), r0 = R(-hx - ov, h + rh, 0), r1 = R(hx + ov, h + rh, 0);
        b.quadC(a0, a1, r1, r0, dkR, dkR, roof, roof); b.quadC(a2, a3, r0, r1, dkR, dkR, roof, roof);
        b.tri(R(-hx, h, -hz), R(-hx, h, hz), R(-hx, h + rh * 0.92, 0), mul(wall, 0.9)); b.tri(R(hx, h, hz), R(hx, h, -hz), R(hx, h + rh * 0.92, 0), mul(wall, 0.9));
        const cp = R(hx * 0.5, h + rh * 0.45, hz * 0.3); b.box(cp[0], h > 0 ? cp[1] : cp[1], cp[2], 0.7, rh * 0.9, 0.7, ry, mul(wall, 0.55));
      } else {
        b.box(x, y + h, z, w + 0.5, 0.45, d + 0.5, ry, trim);                      // cornice / parapet
        b.box(x, y + h + 0.45, z, w * 0.8, 0.5, d * 0.8, ry, mul(roof, 1.0));
        if (style === 'shop') {                                                      // striped awning
          const n = Math.max(3, Math.round(w / 1.2));
          for (let c = 0; c < n; c++) { const l0 = -hx + (c / n) * w, l1 = -hx + ((c + 1) / n) * w; b.quad(R(l0, 2.5, -hz), R(l1, 2.5, -hz), R(l1, 2.0, -hz - 1.1), R(l0, 2.0, -hz - 1.1), c & 1 ? roof : trim); }
        }
        if (style === 'tower') b.frustum(x, y + h + 0.95, z, 0.12, 0.04, 3.2, 5, mul(trim, 0.6), 0);
        if (style === 'castle') {
          const nb = Math.max(4, Math.round(w / 1.6)), nd = Math.max(4, Math.round(d / 1.6));
          for (let c = 0; c < nb; c++) if (c & 1) for (const zz of [-hz, hz - 0.5]) { const p = R(-hx + (c + 0.5) / nb * w, h + 0.45, zz + 0.25); b.box(p[0], p[1], p[2], w / nb * 0.85, 0.9, 0.5, ry, trim); }
          for (let c = 0; c < nd; c++) if (c & 1) for (const xx of [-hx, hx - 0.5]) { const p = R(xx + 0.25, h + 0.45, -hz + (c + 0.5) / nd * d); b.box(p[0], p[1], p[2], 0.5, 0.9, d / nd * 0.85, ry, trim); }
          for (const [sx2, sz2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const p = R(sx2 * hx, 0, sz2 * hz); b.frustum(p[0], y, p[2], 1.3, 1.2, h + 2.2, 10, wall, 0); b.frustum(p[0], y + h + 2.2, p[2], 1.7, 0, 2.8, 10, roof, 0); }
        }
      }
      // door
      if (style !== 'tower' || true) { const dp = R(0, 0, -hz - 0.05); b.box(dp[0], y, dp[2], 1.3, 2.2, 0.12, ry, mul(roof, 0.55)); }
      this.aoSpot(x, z, Math.max(w, d) * 0.85 + 2, 0.45);
    }
    // sign board on two posts with a painted canvas texture. o: {y, w, h, ry, dy (height above ground of the board bottom), emissive}
    _billboard(x, z, text, colors, o) {
      o = o || {};
      const w = o.w || 8, h = o.h || 3.6, ry = o.ry || 0, y = o.y !== undefined ? o.y : this.terrainY(x, z), dy = o.dy !== undefined ? o.dy : 3.2;
      const cs = (colors || [0xe8383d, 0xffffff, 0x222222]);
      const css = (hx) => '#' + new THREE.Color(hx).getHexString();
      const tex = this._canvasTex(512, Math.round(512 * h / w), (ctx, cw, ch) => {
        const g = ctx.createLinearGradient(0, 0, 0, ch); g.addColorStop(0, css(cs[0])); g.addColorStop(1, css(new THREE.Color(cs[0]).multiplyScalar(0.75).getHex()));
        ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
        ctx.lineWidth = cw * 0.025; ctx.strokeStyle = css(cs[2] !== undefined ? cs[2] : 0x222222); ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, cw - ctx.lineWidth, ch - ctx.lineWidth);
        let fs = ch * 0.5; ctx.font = '900 ' + fs + 'px Bungee, Rubik, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const mw = ctx.measureText(String(text)).width; if (mw > cw * 0.88) { fs *= (cw * 0.88) / mw; ctx.font = '900 ' + fs + 'px Bungee, Rubik, Impact, sans-serif'; }
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillText(String(text), cw / 2 + 4, ch / 2 + 5);
        ctx.fillStyle = css(cs[1]); ctx.fillText(String(text), cw / 2, ch / 2);
      });
      this._tex.push(tex); tex.needsUpdate = true;
      const c = Math.cos(ry), s = Math.sin(ry), hw2 = w / 2, y0 = y + dy, y1 = y0 + h;
      const P = (lx, yy, lz) => [x + lx * c + lz * s, yy, z - lx * s + lz * c];
      const geo = new THREE.BufferGeometry(), A = P(-hw2, y0, 0), B = P(hw2, y0, 0), C = P(hw2, y1, 0), D = P(-hw2, y1, 0);
      geo.setAttribute('position', new THREE.Float32BufferAttribute([].concat(A, B, C, D), 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute([s, 0, c, s, 0, c, s, 0, c, s, 0, c], 3));
      geo.setIndex([0, 1, 2, 0, 2, 3]); this._g(geo);
      const m = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, emissive: o.emissive ? 0xffffff : 0x000000, emissiveMap: o.emissive ? tex : null }); this._mats.push(m);
      const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; this._add(mesh);
      const bb = this._bbB || (this._bbB = new Batch()), pc = col(0x5a5f6a);
      for (const sd of [-0.32, 0.32]) { const p = P(sd * w, y, -0.12); bb.box(p[0], p[1], p[2], 0.28, dy + h * 0.7, 0.28, ry, pc); }
      bb.box(x - s * 0.06, y1 + 0.05, z - c * 0.06, w + 0.3, 0.18, 0.3, ry + 0, mul(pc, 1.2));
      this.aoSpot(x, z, w * 0.35, 0.3);
      return mesh;
    }

    // ------------------------------------------------ scenery
    _scatter(count, off0, off1, margin, cb) {
      const rng = this.rng, N = this.N;
      let placed = 0, tries = 0;
      while (placed < count && tries < count * 25) {
        tries++;
        const i = (rng() * N) | 0, side = rng() < 0.5 ? -1 : 1;
        const off = this.hw[i] + this.shoulder + off0 + rng() * (off1 - off0);
        const x = this.px[i] + this.rx[i] * side * off + (rng() - 0.5) * 6;
        const z = this.pz[i] + this.rz[i] * side * off + (rng() - 0.5) * 6;
        if (!this.clear(x, z, margin)) continue;
        cb(x, z, i, rng, this.terrainY(x, z));
        placed++;
      }
    }
    _farScatter(count, minD, cb) {
      const rng = this.rng;
      let cx = 0, cz = 0, minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
      for (let i = 0; i < this.N; i += 5) {
        cx += this.px[i]; cz += this.pz[i];
        minX = Math.min(minX, this.px[i]); maxX = Math.max(maxX, this.px[i]);
        minZ = Math.min(minZ, this.pz[i]); maxZ = Math.max(maxZ, this.pz[i]);
      }
      let placed = 0, tries = 0;
      while (placed < count && tries < count * 40) {
        tries++;
        const x = minX - 260 + rng() * (maxX - minX + 520), z = minZ - 260 + rng() * (maxZ - minZ + 520);
        if (!this.clear(x, z, minD)) continue;
        cb(x, z, rng, this.terrainY(x, z)); placed++;
      }
    }

    // ------------------------------------------------ scenery helpers (also exposed through the kit)
    // GameCube-style smooth tree into a Batch. kind: 'round' | 'pine' | 'palm' | 'snowpine'; o = {leaf, leaf2, trunk} colours (hex)
    _tree(b, x, y, z, s, kind, o) {
      s = s || 1; o = o || {};
      this.aoSpot(x, z, (kind === 'palm' ? 1.6 : kind === 'cypress' ? 1.6 : 2.5) * s, 0.34);
      const h = hash2(x, z), g = 0.9 + h * 0.2, jc = (c) => mul(c, g);
      const trunk = col(o.trunk !== undefined ? o.trunk : 0x7a4f2a);
      if (kind === 'pine' || kind === 'snowpine') {
        const base = col(o.leaf !== undefined ? o.leaf : kind === 'pine' ? 0x2f8f46 : 0x1f6b57), snow = [1, 1, 1];
        b.frustum(x, y, z, 0.42 * s, 0.26 * s, 0.6 * s, 7, mul(trunk, 0.8), 0);
        b.frustum(x, y + 0.5 * s, z, 0.26 * s, 0.2 * s, 1.5 * s, 7, trunk, 0);
        for (let k = 0; k < 5; k++) {
          const r0 = (2.6 - k * 0.45) * s, hh = (2.3 - k * 0.12) * s, yy = y + (0.9 + k * 1.15) * s, c = mul(base, 0.8 + k * 0.08);
          b.frustum(x, yy, z, r0, 0.05 * s, hh, 9, jc(c), h * 6);
          if (kind === 'snowpine') b.frustum(x, yy + hh * 0.38, z, r0 * 0.62, 0.03 * s, hh * 0.62, 9, snow, h * 6);
        }
        b.blob(x, y + 6.3 * s, z, 0.28 * s, 0.4 * s, 0.28 * s, kind === 'snowpine' ? snow : jc(mul(base, 1.25)), 0);
      } else if (kind === 'palm') {
        const lean = (h - 0.5) * 2.4 * s, ang = h * 40, H = 5.6 * s, segs = 6, ca = Math.cos(ang), sa = Math.sin(ang);
        const tc = [col(0x9a6f3f), col(0x86592f)];
        let tx = x, tz = z;
        for (let k = 0; k < segs; k++) {
          const t0 = k / segs, t1 = (k + 1) / segs, ox0 = lean * t0 * t0, ox1 = lean * t1 * t1;
          b.frustum(x + ca * ox0, y + H * t0, z + sa * ox0, (0.3 - 0.13 * t0) * s, (0.3 - 0.13 * t1) * s, H / segs + 0.06 * s, 6, tc[k & 1], 0);
          tx = x + ca * ox1; tz = z + sa * ox1;
        }
        const top = y + H, leaf = col(o.leaf !== undefined ? o.leaf : 0x3fae4a), leaf2 = col(o.leaf2 !== undefined ? o.leaf2 : 0x2d8f3e);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + h * 3, dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx, w = 0.5 * s;
          const T = [tx, top, tz], M = [tx + dx * 2.0 * s, top + 0.75 * s, tz + dz * 2.0 * s], E = [tx + dx * 3.6 * s, top - 0.9 * s, tz + dz * 3.6 * s];
          const Ml = [M[0] + px * w, M[1], M[2] + pz * w], Mr = [M[0] - px * w, M[1], M[2] - pz * w];
          const c = jc(k & 1 ? leaf : leaf2);
          b.tri(T, Ml, Mr, c); b.tri(Ml, E, Mr, c);
        }
        b.blob(tx + 0.25 * s, top - 0.25 * s, tz, 0.26 * s, 0.26 * s, 0.26 * s, col(0x6b4a2a), 0);
        b.blob(tx - 0.2 * s, top - 0.3 * s, tz + 0.2 * s, 0.24 * s, 0.24 * s, 0.24 * s, col(0x6b4a2a), 0);
      } else if (kind === 'cypress') {
        const c = col(o.leaf !== undefined ? o.leaf : 0x2f7a3e), H = 6.5 * s;
        b.frustum(x, y, z, 0.26 * s, 0.16 * s, 1.2 * s, 6, trunk, 0);
        for (let k = 0; k < 4; k++) b.blob(x + (h - 0.5) * 0.2 * s * k, y + (1.8 + k * 1.25) * s, z, (1.05 - k * 0.15) * s, 1.35 * s, (1.05 - k * 0.15) * s, jc(mul(c, 0.85 + k * 0.1)), k < 1 ? 1 : 0);
        b.blob(x, y + H, z, 0.3 * s, 0.6 * s, 0.3 * s, jc(mul(c, 1.2)), 0);
      } else if (kind === 'birch') {
        const l1 = col(o.leaf !== undefined ? o.leaf : 0x7cc653), l2 = col(o.leaf2 !== undefined ? o.leaf2 : 0xa6dc6a), wh = col(0xf0eee4), bk = col(0x3a3a38);
        for (let k = 0; k < 5; k++) b.frustum(x + (h - 0.5) * 0.15 * s * k, y + k * 0.8 * s, z, (0.2 - k * 0.018) * s, (0.2 - (k + 1) * 0.018) * s, 0.8 * s + 0.02, 6, k & 1 ? bk : wh, 0);
        const ty = y + 4.0 * s;
        b.blob(x, ty + 0.4 * s, z, 1.4 * s, 1.5 * s, 1.4 * s, jc(l1), 1);
        b.blob(x + 0.8 * s, ty - 0.1 * s, z + 0.3 * s, 0.9 * s, 0.95 * s, 0.9 * s, jc(mix(l1, l2, 0.5)), 0);
        b.blob(x - 0.7 * s, ty + 0.1 * s, z - 0.4 * s, 0.9 * s, 0.95 * s, 0.9 * s, jc(mix(l1, l2, 0.5)), 0);
        b.blob(x, ty + 1.5 * s, z, 0.9 * s, 0.9 * s, 0.9 * s, jc(l2), 0);
      } else {
        // 'round' (default) / 'oak': flared trunk, forking branches, clustered canopy shaded dark underneath -> bright on top
        const oak = kind === 'oak', S2 = s * (oak ? 1.12 : 1);
        const l1 = col(o.leaf !== undefined ? o.leaf : 0x45b24a), l2 = col(o.leaf2 !== undefined ? o.leaf2 : 0x5cc65a), dk = mul(trunk, 0.8);
        b.frustum(x, y, z, 0.55 * S2, 0.36 * S2, 0.5 * S2, 7, dk, 0);
        b.frustum(x, y + 0.45 * S2, z, 0.36 * S2, 0.2 * S2, 2.4 * S2, 7, trunk, 0);
        const lx = (h - 0.5) * 1.2 * S2;
        this._prism(b, [x, y + 2.0 * S2, z], [x + 1.0 * S2 + lx * 0.3, y + 3.1 * S2, z + 0.3 * S2], 0.1 * S2, trunk);
        this._prism(b, [x, y + 2.3 * S2, z], [x - 0.9 * S2, y + 3.2 * S2, z - 0.4 * S2], 0.09 * S2, trunk);
        b.blob(x, y + 3.3 * S2, z, 2.3 * S2, 1.5 * S2, 2.3 * S2, jc(mul(l1, 0.74)), 1);           // shaded underside mass
        b.blob(x, y + 3.65 * S2, z, 2.25 * S2, 1.85 * S2, 2.25 * S2, jc(l1), 1);
        b.blob(x + 1.2 * S2, y + 3.1 * S2, z + 0.4 * S2, 1.45 * S2, 1.3 * S2, 1.45 * S2, jc(mix(l1, l2, 0.4)), 0);
        b.blob(x - 1.15 * S2, y + 3.3 * S2, z - 0.5 * S2, 1.45 * S2, 1.3 * S2, 1.45 * S2, jc(mix(l1, l2, 0.4)), 0);
        b.blob(x + 0.3 * S2, y + 3.2 * S2, z + 1.2 * S2, 1.3 * S2, 1.15 * S2, 1.3 * S2, jc(mul(l1, 0.9)), 0);
        b.blob(x - 0.3 * S2, y + 3.4 * S2, z - 1.25 * S2, 1.3 * S2, 1.15 * S2, 1.3 * S2, jc(mul(l1, 0.95)), 0);
        b.blob(x + 0.1 * S2, y + 4.8 * S2, z - 0.1 * S2, 1.55 * S2, 1.2 * S2, 1.55 * S2, jc(l2), 1);
        b.blob(x + 0.6 * S2, y + 5.3 * S2, z + 0.3 * S2, 0.75 * S2, 0.6 * S2, 0.75 * S2, jc(mul(l2, 1.1)), 0);
        if (oak) { b.blob(x + 1.9 * S2, y + 3.8 * S2, z - 0.6 * S2, 1.0 * S2, 0.9 * S2, 1.0 * S2, jc(mix(l1, l2, 0.6)), 0); b.blob(x - 1.9 * S2, y + 3.6 * S2, z + 0.7 * S2, 1.0 * S2, 0.9 * S2, 1.0 * S2, jc(mix(l1, l2, 0.6)), 0); }
      }
    }

    // animated GameCube water plane (G.GFX.water when available). o: {x,y,z, radius | w,d, color, deep, opacity, segs}
    _water(o) {
      o = o || {};
      const geo = o.radius ? new THREE.CircleGeometry(o.radius, o.segs || 48) : new THREE.PlaneGeometry(o.w || 100, o.d || 100, 1, 1);
      geo.rotateX(-Math.PI / 2); this._geoms.push(geo);
      let mat;
      if (G.GFX && G.GFX.water) {
        mat = G.GFX.water({ color: o.color !== undefined ? o.color : 0x3aa7e0, deep: o.deep, opacity: o.opacity !== undefined ? o.opacity : 0.9 });
      } else {
        mat = new THREE.MeshPhongMaterial({ color: o.color !== undefined ? o.color : 0x3aa7e0, shininess: 90, specular: 0xffffff, transparent: true, opacity: o.opacity !== undefined ? o.opacity : 0.88 });
      }
      this._mats.push(mat);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(o.x || 0, o.y !== undefined ? o.y : this.groundY + 0.08, o.z || 0);
      return this._add(m);
    }

    // one InstancedMesh of grass tufts / flowers scattered along the road edges. Offsets are measured from the
    // road edge (hw): the shoulder + embankment follow the road height down to groundY.
    // o = { colors:[hex], flowerColors:[hex], flowers:0..1, scale:[min,max], height, skipWalls }
    _tufts(count, off0, off1, o) {
      o = o || {};
      const N = this.N, rng = this.rng, sh = this.shoulder, gy = this.groundY;
      off0 = off0 === undefined ? 0.4 : off0; off1 = off1 === undefined ? sh + EMB : off1;
      // geometry: 6 crossed blades + a tiny bloom, vertex colour is a neutral gradient tinted per instance
      const P = [], Cc = [], Nn = [];
      const H = o.height || 0.55, W = 0.09;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI + k * 0.4, ca = Math.cos(a), sa = Math.sin(a), lean = (k % 2 ? 1 : -1) * 0.12, hh = H * (0.7 + 0.3 * ((k * 37) % 5) / 4);
        P.push(-W * ca, 0, -W * sa, W * ca, 0, W * sa, lean * ca * 2, hh, lean * sa * 2);
        Cc.push(0.55, 0.62, 0.5, 0.55, 0.62, 0.5, 1, 1, 0.9);
        Nn.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
      }
      const ico = icoPositions(0), br = 0.1;
      for (let i = 0; i < ico.length; i += 3) { P.push(ico[i] * br, H * 0.95 + ico[i + 1] * br, ico[i + 2] * br); Cc.push(1.15, 1.15, 1.15); Nn.push(0, 1, 0); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
      this._geoms.push(geo);
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
      this._wind(mat, { strength: o.windStrength !== undefined ? o.windStrength : 0.5, heightScale: 1.5, groundY: 0, speed: 2.1 });
      this._mats.push(mat);
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      const greens = (o.colors || [0x4fb04a, 0x66c457, 0x3f9e44, 0x7ad060]).map(col);
      const fl = (o.flowerColors || [0xff5a6a, 0xffe14a, 0xffffff, 0xff9ae0, 0xb08cff]).map(col);
      const fr = o.flowers === undefined ? 0.3 : o.flowers, sMin = (o.scale || [0.8, 1.6])[0], sMax = (o.scale || [0.8, 1.6])[1];
      const dummy = new THREE.Object3D(), cc = new THREE.Color();
      const wallOn = !this.noWalls && o.skipWalls !== false && (this.def.walls || 'x') !== 'none';
      let placed = 0, tries = 0;
      while (placed < count && tries < count * 6) {
        tries++;
        const i = (rng() * N) | 0, side = rng() < 0.5 ? -1 : 1, e = off0 + rng() * (off1 - off0);
        if (wallOn && e > sh - 0.2 && e < sh + 2.1) continue;
        const l = side * (this.hw[i] + e), below = e - sh;
        const yy = below <= 0 ? this.py[i] - 0.01 : below >= EMB ? gy : this.py[i] - 0.01 + (gy - this.py[i] + 0.01) * (below / EMB);
        const x = this.px[i] + this.rx[i] * l, z = this.pz[i] + this.rz[i] * l;
        if (below >= EMB && !this.clear(x, z, this.hw[i] + sh + EMB - 0.5)) continue;
        const c = rng() < fr ? fl[(rng() * fl.length) | 0] : greens[(rng() * greens.length) | 0], sc = sMin + rng() * (sMax - sMin);
        dummy.position.set(x, yy, z); dummy.rotation.set(0, rng() * 6.28, 0); dummy.scale.set(sc, sc * (0.8 + rng() * 0.5), sc);
        dummy.updateMatrix();
        mesh.setMatrixAt(placed, dummy.matrix); cc.setRGB(c[0], c[1], c[2]); mesh.setColorAt(placed, cc);
        placed++;
      }
      mesh.count = placed;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      return this._add(mesh);
    }

    _buildScenery(def, lake) {
      const theme = this.theme, gy = this.groundY, b = new Batch(), fb = new Batch();   // fb: foliage (swayed by the wind shader)
      const marginTree = this.shoulder + 15 + EMB * 0.5;   // from centerline: hw ~13 + shoulder + embankment
      const m0 = 13 + this.shoulder + EMB + 3;
      if (lake) this._noGo.push({ x: lake.x, z: lake.z, r: lake.r + 4 });
      const jit = (c, r) => mul(c, 0.88 + r() * 0.24);

      if (theme === 'meadow') {
        this._scatter(240, 2, 70, m0, (x, z, i, r) => {
          const s = 0.85 + r() * 0.8;
          this._tree(fb, x, gy, z, s, r() < 0.3 ? 'pine' : 'round');
        });
        this._scatter(120, 1, 45, m0 - 4, (x, z, i, r) => b.blob(x, gy + 0.5, z, 1.2 + r(), 0.9 + r() * 0.5, 1.2 + r(), jit(col(0x3f9f45), r), 0));
        this._tufts(700, 0.4, this.shoulder + EMB + 12, { flowers: 0.35 });
        this._farScatter(26, 100, (x, z, r) => {
          const s = 25 + r() * 35;
          b.blob(x, gy - 4, z, s * 1.3, s * 0.55, s, jit(col(0x69b848), r), 1);
        });
      } else if (theme === 'dunes') {
        const green = col(0x3f9a4a);
        this._scatter(130, 2, 60, m0, (x, z, i, r) => {
          const s = 0.8 + r() * 0.9, c = jit(green, r);
          b.frustum(x, gy, z, 0.55 * s, 0.45 * s, 3.8 * s, 6, c, 0);
          b.blob(x, gy + 3.8 * s, z, 0.5 * s, 0.4 * s, 0.5 * s, c, 0);
          const side = r() < 0.5 ? -1 : 1;
          b.box(x + side * 0.7 * s, gy + 1.5 * s, z, 0.9 * s, 0.4 * s, 0.4 * s, 0, c);
          b.box(x + side * 1.05 * s, gy + 1.5 * s, z, 0.4 * s, 1.3 * s, 0.4 * s, 0, c);
        });
        this._scatter(34, 3, 50, m0, (x, z, i, r) => this._tree(fb, x, gy, z, 0.9 + r() * 0.6, 'palm'));
        this._tufts(320, 0.4, this.shoulder + EMB + 10, { colors: [0xb8a24a, 0x9aa04a, 0xc8b060, 0x8f9a45], flowers: 0.08, flowerColors: [0xffd36f, 0xff8a5a], scale: [0.7, 1.3] });
        this._scatter(110, 2, 70, m0 - 3, (x, z, i, r) => {
          const s = 0.8 + r() * 2.2;
          b.blob(x, gy + 0.3 * s, z, 1.6 * s, 1.0 * s, 1.3 * s, jit(r() < 0.5 ? col(0xb9885a) : col(0x9d7a5a), r), 0);
        });
        const rock = [col(0xc9733f), col(0xd98a4a), col(0xb85f35)];
        this._farScatter(14, 85, (x, z, r) => {
          const R0 = 14 + r() * 14, h = 14 + r() * 22;
          for (let k = 0; k < 3; k++) b.frustum(x, gy + k * h / 3, z, R0 * (1 - k * 0.06), R0 * (1 - (k + 1) * 0.06 - 0.1), h / 3, 8, rock[k], r());
        });
        this._farScatter(5, 130, (x, z, r) => {
          const R0 = 26 + r() * 16;
          b.frustum(x, gy, z, R0, 0, R0 * 1.05, 4, col(0xe7c27d), r());
        });
        this._farScatter(34, 90, (x, z, r) => {
          const s = 30 + r() * 40;
          b.blob(x, gy - 3, z, s * 1.6, s * 0.33, s, mix(col(0xe8c070), col(0xd9a85c), r()), 1);
        });
        // rock arches spanning the road
        const stone = col(0xc27a44), stone2 = col(0xb5693a);
        const fr = {};
        (def.arches || []).forEach((dd) => {
          this._frame(this._dist(dd), fr);
          const wd = fr.halfWidth + this.shoulder + 3, h = Math.atan2(fr.tx, fr.tz);
          for (let s = -1; s <= 1; s += 2) {
            const lx = fr.x + fr.rx * s * wd, lz = fr.z + fr.rz * s * wd;
            b.box(lx, fr.y - 2, lz, 5, 13, 5, h, stone);
            b.box(lx, fr.y + 8, lz, 6, 3, 6, h, stone2);
          }
          const nseg = 7, span = wd * 2 + 5;
          for (let k = 0; k < nseg; k++) {
            const l = -wd + (k / (nseg - 1)) * 2 * wd;
            const yy = fr.y + 11 + Math.sin((k / (nseg - 1)) * Math.PI) * 2.5;
            b.box(fr.x + fr.rx * l, yy, fr.z + fr.rz * l, span / nseg + 1.5, 3, 5, h, k & 1 ? stone : stone2);
          }
        });
      } else if (theme === 'glacier') {
        const snowTop = col(0xffffff);
        this._scatter(230, 2, 70, m0, (x, z, i, r) => this._tree(fb, x, gy, z, 0.85 + r() * 1.0, 'snowpine'));
        this._scatter(90, 1, 60, m0 - 3, (x, z, i, r) => {
          const s = 0.8 + r() * 2.2;
          b.blob(x, gy + 0.3 * s, z, 1.7 * s, 1.2 * s, 1.5 * s, jit(col(0xbfe6ff), r), 0);
        });
        this._scatter(70, 3, 55, m0 - 2, (x, z, i, r) => {
          const s = 1 + r() * 2;
          for (let k = 0; k < 3; k++) b.frustum(x + (k - 1) * s * 0.7, gy, z + (r() - 0.5) * s, 0.5 * s, 0, (2 + r() * 3) * s, 5, jit(col(0x9fd8ff), r), 0);
        });
        this._scatter(10, 2, 20, m0 - 6, (x, z, i, r) => {
          b.blob(x, gy + 0.7, z, 1.0, 0.9, 1.0, [1, 1, 1], 0);
          b.blob(x, gy + 1.7, z, 0.75, 0.7, 0.75, [1, 1, 1], 0);
          b.blob(x, gy + 2.5, z, 0.5, 0.5, 0.5, [1, 1, 1], 0);
          b.box(x - 0.1, gy + 2.45, z + 0.45, 0.14, 0.14, 0.5, 0, col(0xff7a1a));
        });
        this._farScatter(30, 95, (x, z, r) => {
          const s = 25 + r() * 35;
          b.blob(x, gy - 4, z, s * 1.3, s * 0.5, s, mix(col(0xf2f9ff), col(0xd8ebf8), r()), 1);
        });
        if (lake) this._anim.water = this._water({ x: lake.x, y: gy + 0.08, z: lake.z, radius: lake.r, color: 0x9fd8ff, opacity: 0.92 });
      } else {
        // starlight: floating rocks and crystals around the ribbon
        const rng = this.rng, cs = [col(0xff7ab8), col(0x6fd8ff), col(0xffd36f), col(0xa98bff), col(0x8cffc0)];
        for (let n = 0; n < 150; n++) {
          const i = (rng() * this.N) | 0, side = rng() < 0.5 ? -1 : 1;
          const off = this.hw[i] + 14 + rng() * 90;
          const x = this.px[i] + this.rx[i] * side * off, z = this.pz[i] + this.rz[i] * side * off;
          if (!this.clear(x, z, 26)) continue;
          const y = this.py[i] + (rng() - 0.5) * 70 - 8, s = 1.5 + rng() * 5;
          if (rng() < 0.5) b.blob(x, y, z, s, s * 0.8, s, mix(col(0x6a5a8a), col(0x9a8ac0), rng()), 0);
          else {
            const c = cs[(rng() * cs.length) | 0];
            b.frustum(x, y, z, s * 0.5, 0, s * 2.2, 5, c, rng());
            b.frustum(x, y - s * 1.2, z, s * 0.5, 0, s * 1.2, 5, mul(c, 0.7), rng());
          }
        }
        // glowing hoops over the road at a few distances
        const fr = {}, ringC = [col(0x66f2ff), col(0xff6ad5), col(0xffe066)];
        for (let k = 0; k < 5; k++) {
          const dd = this.length * (0.14 + k * 0.17);
          this._frame(dd, fr);
          const h = Math.atan2(fr.tx, fr.tz), c = ringC[k % 3], wd = fr.halfWidth + 3;
          for (let a = 0; a < 14; a++) {
            const t0 = (a / 14) * Math.PI;
            const l = Math.cos(t0) * wd, y = fr.y + Math.sin(t0) * 9;
            b.box(fr.x + fr.rx * -l, y, fr.z + fr.rz * -l, 1.1, 1.1, 1.1, h, c);
          }
        }
      }
      const mat = this._mat({}, theme === 'starlight');
      this.sceneryMesh = this._mesh(b, mat, true);
      if (this.sceneryMesh) this.sceneryMesh.receiveShadow = true;
      if (!fb.empty) {
        this.foliageMesh = this._mesh(fb, this._mat({ wind: { strength: 0.32, heightScale: 0.17 } }, theme === 'starlight'), true);
        if (this.foliageMesh) this.foliageMesh.receiveShadow = true;
      }

      // meadow lake
      if (theme === 'meadow' && lake) {
        this._anim.water = this._water({ x: lake.x, y: gy + 0.08, z: lake.z, radius: lake.r, color: 0x3aa7e0, opacity: 0.88 });
        // shore ring + reeds
        const sb = new Batch(), rng = this.rng;
        for (let a = 0; a < 26; a++) {
          const an = (a / 26) * Math.PI * 2, rr = lake.r + 1.5 + rng() * 2;
          sb.blob(lake.x + Math.cos(an) * rr, gy, lake.z + Math.sin(an) * rr, 2.5 + rng() * 2, 0.7, 2.5 + rng() * 2, col(0xd8cf93), 0);
          if (rng() < 0.6) sb.frustum(lake.x + Math.cos(an) * (rr - 1), gy, lake.z + Math.sin(an) * (rr - 1), 0.25, 0, 2.2, 4, col(0x3f8f3a), 0);
        }
        this.shoreMesh = this._mesh(sb, this._mat({}, false), true);
      }
    }

    _buildSnow() {
      const n = 650, self = this, rng = this.rng;
      const base = new Float32Array(n * 3), pos = new Float32Array(n * 3);
      for (let i = 0; i < n * 3; i++) base[i] = rng() * 120;
      const g = new THREE.BufferGeometry();
      const attr = new THREE.BufferAttribute(pos, 3); attr.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', attr);
      this._geoms.push(g);
      const m = new THREE.PointsMaterial({ color: 0xffffff, size: 0.42, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false });
      this._mats.push(m);
      const pts = new THREE.Points(g, m);
      pts.frustumCulled = false;
      pts.onBeforeRender = function (renderer, scene, camera) {
        const cx = self.mirror ? -camera.position.x : camera.position.x, cy = camera.position.y, cz = camera.position.z, t = self._time;
        const S = 120, H = 50;
        for (let i = 0; i < n; i++) {
          const bx = base[i * 3], by = base[i * 3 + 1], bz = base[i * 3 + 2];
          pos[i * 3] = cx - S / 2 + ((((bx - cx) % S) + S) % S) + Math.sin(t * 0.8 + i) * 0.6;
          pos[i * 3 + 1] = cy - 18 + ((((by - t * 2.4 - cy) % H) + H) % H);
          pos[i * 3 + 2] = cz - S / 2 + ((((bz - cz) % S) + S) % S) + Math.cos(t * 0.7 + i * 1.3) * 0.6;
        }
        attr.needsUpdate = true;
      };
      this.snow = this._add(pts);
    }

    // ================================================== v5 LIVELINESS (flags, crowds, spinners, particles, flow ...)
    _waterMat(o) {
      o = o || {};
      const color = o.color !== undefined ? o.color : 0x3aa7e0, opacity = o.opacity !== undefined ? o.opacity : 0.88;
      let m;
      if (G.GFX && G.GFX.water) { m = G.GFX.water({ color, deep: o.deep, opacity, waveScale: o.waveScale }); m.side = THREE.DoubleSide; }
      else m = new THREE.MeshPhongMaterial({ color, shininess: 90, specular: 0xaaccee, transparent: opacity < 1, opacity, side: THREE.DoubleSide });
      this._mats.push(m);
      return m;
    }
    _g(g) { this._geoms.push(g); return g; }
    // slowly rotate the hue of a vertex-coloured material (rainbow road); greys / whites stay put
    _hueShift(m) {
      const uT = this._uT;
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uT = uT;
        sh.vertexShader = 'uniform float uT;\nvec3 hueRot( vec3 c, float a ){ mat3 T = mat3( 0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312 ); mat3 Ti = mat3( 1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703 );\n' +
          ' vec3 y = T * c; float ca = cos( a ), sa = sin( a ); y = vec3( y.x, y.y * ca - y.z * sa, y.y * sa + y.z * ca ); return clamp( Ti * y, 0.0, 2.0 ); }\n' +
          sh.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\n vColor.rgb = hueRot( vColor.rgb, uT * 0.55 );');
      };
      m.customProgramCacheKey = () => 'hue5';
      return m;
    }
    // square prism between two points (used for arms / spokes)
    _prism(b, a, c, w, k) {
      let dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2];
      const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
      let ux = 0, uy = 1, uz = 0;
      if (Math.abs(dy) > 0.95) { ux = 1; uy = 0; }
      let n1x = dy * uz - dz * uy, n1y = dz * ux - dx * uz, n1z = dx * uy - dy * ux, nl = Math.hypot(n1x, n1y, n1z) || 1;
      n1x /= nl; n1y /= nl; n1z /= nl;
      let n2x = dy * n1z - dz * n1y, n2y = dz * n1x - dx * n1z, n2z = dx * n1y - dy * n1x; nl = Math.hypot(n2x, n2y, n2z) || 1;
      n2x /= nl; n2y /= nl; n2z /= nl;
      const cn = (p, s1, s2) => [p[0] + (n1x * s1 + n2x * s2) * w, p[1] + (n1y * s1 + n2y * s2) * w, p[2] + (n1z * s1 + n2z * s2) * w];
      const A = [cn(a, -1, -1), cn(a, 1, -1), cn(a, 1, 1), cn(a, -1, 1)], C = [cn(c, -1, -1), cn(c, 1, -1), cn(c, 1, 1), cn(c, -1, 1)];
      for (let i = 0; i < 4; i++) { const j = (i + 1) & 3; b.quad(A[i], A[j], C[j], C[i], k); }
    }

    // ---- cloth: one merged mesh for every flag / banner / bunting of the course (vertex-shader waving)
    _clothBatch() { return this._clothB || (this._clothB = new Batch(true)); }
    _clothMaterial() {
      if (this._clothMat) return this._clothMat;
      const m = this._mat({ detail: false }, false), uT = this._uT;
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uT = uT;
        sh.vertexShader = 'uniform float uT;\nfloat clothW( vec2 a, vec3 p ){ float ph = p.x * 0.31 + p.z * 0.37; return sin( a.y * 7.0 - uT * 6.0 + ph ) + 0.4 * sin( a.y * 13.0 - uT * 9.5 + ph * 1.7 ); }\n' +
          sh.vertexShader
            .replace('#include <color_vertex>', '#include <color_vertex>\n vColor *= 0.9 + 0.1 * clothW( uv, position ) * min( uv.x * 2.0, 1.0 );')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normal * clothW( uv, position ) * uv.x;');
      };
      m.customProgramCacheKey = () => 'cloth5';
      this._clothMat = m;
      return m;
    }
    _cloth(O, U, V, nu, nv, colorFn, attach, amp) {
      const b = this._clothBatch(), top = attach === 'v1';
      const P = (i, j) => [O[0] + (U[0] * i) / nu + (V[0] * j) / nv, O[1] + (U[1] * i) / nu + (V[1] * j) / nv, O[2] + (U[2] * i) / nu + (V[2] * j) / nv];
      const w = (i, j) => (top ? 1 - j / nv : i / nu);
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        const a = w(i, j), bb = w(i + 1, j), c = w(i + 1, j + 1), d = w(i, j + 1);
        b.quadUV(P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1), colorFn(i, j), [a * amp, a, bb * amp, bb, c * amp, c, d * amp, d]);
      }
    }
    _patFn(colors, pattern) {
      const cs = (colors && colors.length ? colors : [0xe8383d, 0xffffff]).map(col), n = cs.length;
      pattern = pattern || (n > 1 ? 'stripes' : 'solid');
      if (pattern === 'solid') return () => cs[0];
      if (pattern === 'check') return (i, j) => cs[((i >> 1) + j) % n < 0 ? 0 : ((i >> 1) + j) % n];
      if (pattern === 'vstripes') return (i) => cs[(i >> 1) % n];
      return (i, j) => cs[j % n];
    }
    // flag on a pole: base at (x,y,z), cloth w x h flying along heading ry
    _flag(x, y, z, w, h, ry, colors, o) {
      o = o || {};
      const b = this._clothBatch(), pole = o.pole !== undefined ? o.pole : h * 2.4, c = Math.cos(ry), s = Math.sin(ry);
      b.box(x, y, z, 0.16, pole, 0.16, ry, col(o.poleColor !== undefined ? o.poleColor : 0xd8d8e0));
      b.blob(x, y + pole + 0.1, z, 0.14, 0.14, 0.14, col(0xffd23a), 0);
      const nu = Math.max(6, Math.round(w * 2.2)), nv = Math.max(2, Math.round(h * 1.6));
      this._cloth([x, y + pole - h, z], [w * c, 0, -w * s], [0, h, 0], nu, nv, this._patFn(colors, o.pattern), 'u0', o.amp !== undefined ? o.amp : Math.min(0.9, 0.12 * w + 0.15));
    }
    // banner hanging from a rod: top edge centred on (x, y+h, z), bottom at y, width w along heading ry
    _banner(x, y, z, w, h, ry, colors, o) {
      o = o || {};
      const b = this._clothBatch(), c = Math.cos(ry), s = Math.sin(ry), nu = Math.max(4, Math.round(w * 2)), nv = Math.max(3, Math.round(h * 1.8));
      b.box(x, y + h, z, w + 0.5, 0.14, 0.14, ry, col(o.poleColor !== undefined ? o.poleColor : 0x8a8a96));
      if (o.ground !== undefined) for (let sd = -1; sd <= 1; sd += 2) b.box(x + sd * (w / 2 + 0.2) * c, o.ground, z - sd * (w / 2 + 0.2) * s, 0.16, y + h + 0.3 - o.ground, 0.16, ry, col(0x8a8a96));
      this._cloth([x - (w / 2) * c, y, z + (w / 2) * s], [w * c, 0, -w * s], [0, h, 0], nu, nv, this._patFn(colors, o.pattern || 'vstripes'), 'v1', o.amp !== undefined ? o.amp : 0.22);
    }
    // string of triangular pennants between two points
    _bunting(a, bp, colors, n, size, sag) {
      const cl = (colors && colors.length ? colors : [0xe8383d, 0xffd23a, 0x3ad1ff, 0x59e06b]).map(col), bt = this._clothBatch();
      const len = Math.hypot(bp[0] - a[0], bp[1] - a[1], bp[2] - a[2]);
      sag = sag === undefined ? len * 0.05 : sag; size = size || 0.8;
      const P = (t) => [a[0] + (bp[0] - a[0]) * t, a[1] + (bp[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (bp[2] - a[2]) * t];
      for (let k = 0; k < n; k++) {
        const p0 = P((k + 0.08) / n), p1 = P((k + 0.92) / n), pm = P((k + 0.5) / n);
        bt.tri(p0, p1, [pm[0], pm[1] - size * 1.2, pm[2]], cl[k % cl.length]);
        const u = bt.uv, m = u.length - 6; u[m + 4] = 0.3 * size; u[m + 5] = 1;
      }
    }
    _finishCloth() {
      if (this._clothB && !this._clothB.empty) this._mesh(this._clothB, this._clothMaterial(), true);
      this._clothB = null;
    }

    // ---- motion registry: spinners / sways / bobs / slides (time-based, allocation free)
    _spin(obj, axis, speed, phase) { this._motion.push({ t: 0, o: obj, ax: axis || 'y', sp: speed || 1, ph: phase || 0, b: obj.rotation[axis || 'y'] }); return obj; }
    _sway(obj, axis, amp, speed, phase) { this._motion.push({ t: 1, o: obj, ax: axis || 'z', amp: amp || 0.1, sp: speed || 1, ph: phase || 0, b: obj.rotation[axis || 'z'] }); return obj; }
    _bob(obj, amp, speed, phase, roll) {
      this._motion.push({ t: 2, o: obj, amp: amp === undefined ? 0.15 : amp, sp: speed || 1.2, ph: phase || 0, roll: roll === undefined ? 0.05 : roll, y0: obj.position.y, rx: obj.rotation.x, rz: obj.rotation.z });
      return obj;
    }
    _slide(obj, dx, dy, dz, speed, phase) { this._motion.push({ t: 4, o: obj, dx, dy, dz, sp: speed || 0.3, ph: phase || 0, x0: obj.position.x, y0: obj.position.y, z0: obj.position.z }); return obj; }
    // convenience: build a batch around its own origin, place it at (x,y,z) heading ry, spin it about a local axis
    _spinBatch(batch, o) {
      o = o || {};
      const grp = new THREE.Group(); grp.position.set(o.x || 0, o.y || 0, o.z || 0); grp.rotation.y = o.ry || 0;
      const mesh = new THREE.Mesh(this._g(batch.build()), this._mat(o.matOpts || {}, !!o.basic));
      mesh.frustumCulled = false; grp.add(mesh); this._add(grp);
      this._spin(mesh, o.axis || 'z', o.speed || 1, o.phase || 0);
      return grp;
    }
    // rotating light beam(s) (lighthouse / searchlight): additive fans from (x,y,z); o: {len, width, color, speed, count, tilt, phase}
    _lightBeam(o) {
      const bm = new Batch(), len = o.len || 90, wd = o.width || 8, cnt = o.count || 2, c = col(o.color !== undefined ? o.color : 0xfff2a0), tilt = o.tilt || 0;
      for (let k = 0; k < cnt; k++) {
        const a = (k / cnt) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const A = [0, 0, 0], F0 = [ca * len - sa * wd, len * tilt, sa * len + ca * wd], F1 = [ca * len + sa * wd, len * tilt, sa * len - ca * wd], P0 = [-sa * 0.4, 0, ca * 0.4], P1 = [sa * 0.4, 0, -ca * 0.4];
        const z = [0, 0, 0];
        const V0 = [ca * len, len * tilt - wd * 0.7, sa * len], V1 = [ca * len, len * tilt + wd * 0.7, sa * len], Q0 = [0, -0.4, 0], Q1 = [0, 0.4, 0];
        for (const fan of [[P0, P1, F1, F0], [Q0, Q1, V1, V0]]) {
          bm.tri(fan[0], fan[1], fan[2], c); bm.tri(fan[0], fan[2], fan[3], c);
          const cc = bm.c, m = cc.length - 18;
          for (const q of [2, 4, 5]) { cc[m + q * 3] = z[0]; cc[m + q * 3 + 1] = z[1]; cc[m + q * 3 + 2] = z[2]; }
        }
        void A;
      }
      return this._spinBatch(bm, { x: o.x || 0, y: o.y || 0, z: o.z || 0, axis: 'y', speed: o.speed || 0.7, phase: o.phase || 0, basic: true,
        matOpts: { transparent: true, opacity: o.opacity !== undefined ? o.opacity : 0.55, blending: THREE.AdditiveBlending, depthWrite: false } });
    }
    _blinker(mat, period, o) {
      o = o || {};
      const c = o.emissive && mat.emissive ? mat.emissive : mat.color;
      const alt = o.alt !== undefined ? new THREE.Color(o.alt) : null;
      this._blinkers.push({ m: mat, c, r: c.r, g: c.g, b: c.b, ar: alt ? alt.r : 0, ag: alt ? alt.g : 0, ab: alt ? alt.b : 0, alt: !!alt, per: period || 1, ph: o.phase || 0, duty: o.duty !== undefined ? o.duty : 0.5,
        lo: o.lo !== undefined ? o.lo : 0.12, hi: o.hi !== undefined ? o.hi : 1, sine: o.mode === 'sine' });
      return mat;
    }
    _scroll(tex, du, dv) { this._scrolls.push({ t: tex, u: du || 0, v: dv || 0 }); return tex; }
    _flowMat(kind, o) {
      o = o || {};
      const base = flowTex(kind || 'water');
      let map = null;
      if (base) {
        map = base.clone(); map.needsUpdate = true; map.wrapS = map.wrapT = THREE.RepeatWrapping;
        if (o.repeat) map.repeat.set(o.repeat[0], o.repeat[1]);
        this._tex.push(map);
        if (o.speed) this._scrolls.push({ t: map, u: o.speed[0], v: o.speed[1] });
      }
      const m = new THREE.MeshBasicMaterial({ map, color: o.color !== undefined ? o.color : 0xffffff, side: THREE.DoubleSide, transparent: o.opacity !== undefined && o.opacity < 1, opacity: o.opacity !== undefined ? o.opacity : 1 });
      if (!map && o.fallback !== undefined) m.color.setHex(o.fallback);
      this._mats.push(m);
      return m;
    }
    // quad panel p0 bottom-left, p1 bottom-right, p2 top-right, p3 top-left ([x,y,z] each); uv 0..rep
    _panel(c, mat, rep) {
      rep = rep || [1, 1];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([].concat(c[0], c[1], c[2], c[3]), 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, rep[0], 0, rep[0], rep[1], 0, rep[1]], 2));
      g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals(); this._g(g);
      const m = new THREE.Mesh(g, mat); m.frustumCulled = false;
      return this._add(m);
    }
    // ribbon over the road (uv: u across 0..ur, v along in tiles of `tile` metres)
    _ribbon(d0, d1, l0, l1, dy, mat, o) {
      o = o || {};
      const step = o.step || 4, tile = o.tile || 8, ur = o.ur || 1, n = Math.max(1, Math.ceil((d1 - d0) / step)), pos = [], uv = [], idx = [];
      for (let i = 0; i <= n; i++) {
        const d = d0 + ((d1 - d0) * i) / n, a = this._PD(d, l0, dy), c = this._PD(d, l1, dy);
        pos.push(a[0], a[1], a[2], c[0], c[1], c[2]); uv.push(0, (d - d0) / tile, ur, (d - d0) / tile);
        if (i < n) { const q = i * 2; idx.push(q, q + 1, q + 3, q, q + 3, q + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals(); this._g(g);
      const m = new THREE.Mesh(g, mat); m.frustumCulled = false;
      return this._add(m);
    }

    // ---- particles: one Points draw, all animation in the vertex shader (no CPU per frame)
    // o: {emitters:[[x,y,z]..], count, vel:[x,y,z], spread:[x,y,z], jitter:[x,y,z], sphere, burst, life, size, grow, grav, wob, alpha,
    //     pow, fadeIn, win, color:hex|[hex..], tex:'soft'|'spark', additive, depthTest}
    _particles(o) {
      const em = o.emitters || [[o.x || 0, o.y || 0, o.z || 0]], cnt = o.count || 10, n = em.length * cnt;
      const pos = new Float32Array(n * 3), dir = new Float32Array(n * 3), seed = new Float32Array(n * 2), colA = new Float32Array(n * 3);
      const vel = o.vel || [0, 1, 0], sp = o.spread || [0.3, 0.3, 0.3], jt = o.jitter || [0, 0, 0];
      const cols = (Array.isArray(o.color) ? o.color : [o.color !== undefined ? o.color : 0xffffff]).map(col);
      const rng = this.rng;
      for (let e = 0; e < em.length; e++) {
        const ph = rng(), ec = cols[o.burst ? e % cols.length : 0];
        for (let k = 0; k < cnt; k++) {
          const i = e * cnt + k;
          pos[i * 3] = em[e][0] + (rng() - 0.5) * 2 * jt[0]; pos[i * 3 + 1] = em[e][1] + (rng() - 0.5) * 2 * jt[1]; pos[i * 3 + 2] = em[e][2] + (rng() - 0.5) * 2 * jt[2];
          if (o.sphere) {
            const u = rng() * 2 - 1, a = rng() * 6.2832, r = Math.sqrt(1 - u * u), v = o.sphere * (0.55 + 0.45 * rng());
            dir[i * 3] = Math.cos(a) * r * v; dir[i * 3 + 1] = u * v; dir[i * 3 + 2] = Math.sin(a) * r * v;
          } else {
            dir[i * 3] = vel[0] + (rng() - 0.5) * 2 * sp[0]; dir[i * 3 + 1] = vel[1] + (rng() - 0.5) * 2 * sp[1]; dir[i * 3 + 2] = vel[2] + (rng() - 0.5) * 2 * sp[2];
          }
          seed[i * 2] = o.burst ? ph : (k + rng() * 0.8) / cnt; seed[i * 2 + 1] = rng();
          const c = o.burst ? ec : cols[(rng() * cols.length) | 0];
          colA[i * 3] = c[0]; colA[i * 3 + 1] = c[1]; colA[i * 3 + 2] = c[2];
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2)); g.setAttribute('color', new THREE.BufferAttribute(colA, 3));
      this._g(g);
      const tex = o.tex === 'spark' ? (gfxTex('spark') || gfxTex('soft') || sunTex()) : (gfxTex('soft') || sunTex());
      const m = new THREE.PointsMaterial({ size: o.size || 1, sizeAttenuation: true, vertexColors: true, map: tex, transparent: true, depthWrite: false, depthTest: o.depthTest !== false,
        blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending });
      const U = { uT: this._uT, uLife: { value: o.life || 2 }, uGrav: { value: o.grav || 0 }, uGrow: { value: o.grow || 0 }, uPA: { value: o.alpha !== undefined ? o.alpha : 0.8 },
        uPow: { value: o.pow !== undefined ? o.pow : 1 }, uIn: { value: o.fadeIn || 0.12 }, uWin: { value: o.win || 1 }, uWob: { value: o.wob || 0 } };
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U);
        sh.vertexShader = 'uniform float uT; uniform float uLife; uniform float uGrav; uniform float uGrow; uniform float uPA; uniform float uPow; uniform float uIn; uniform float uWin; uniform float uWob;\n' +
          'attribute vec3 aDir; attribute vec2 aSeed; varying float vPA; float pSz;\n' + sh.vertexShader
            .replace('#include <begin_vertex>', '#include <begin_vertex>\n float pf = fract( uT / uLife + aSeed.x ); float pwf = pf / uWin; float ptt = pf * uLife;\n' +
              ' transformed += aDir * ptt + vec3( 0.0, 0.5 * uGrav * ptt * ptt, 0.0 );\n' +
              ' transformed.x += sin( ptt * 1.7 + aSeed.y * 40.0 ) * uWob * pf; transformed.z += cos( ptt * 1.3 + aSeed.y * 31.0 ) * uWob * pf;\n' +
              ' float pk = pwf < 1.0 ? 1.0 : 0.0;\n' +
              ' vPA = uPA * clamp( pwf / uIn, 0.0, 1.0 ) * pow( max( 1.0 - pwf, 0.0 ), uPow ) * pk;\n' +
              ' pSz = ( 0.6 + 0.8 * aSeed.y ) * ( 1.0 + uGrow * pwf ) * pk;')
            .replace('gl_PointSize = size;', 'gl_PointSize = size * pSz;');
        sh.fragmentShader = 'varying float vPA;\n' + sh.fragmentShader.replace('#include <alphatest_fragment>', 'diffuseColor.a *= vPA;\n#include <alphatest_fragment>');
      };
      m.customProgramCacheKey = () => 'ptfx5';
      this._mats.push(m);
      const pts = new THREE.Points(g, m);
      pts.frustumCulled = false; pts.renderOrder = o.additive ? 8 : 6;
      return this._add(pts);
    }
    // flocks of flapping birds circling (cx, cz) at height y; one InstancedMesh for the whole course
    _birds(o) {
      o = o || {};
      const n = o.count || 7, sz = o.size || 1.1;
      const gk = (o.body !== undefined ? o.body : 0x383840) + '_' + (o.wing !== undefined ? o.wing : 0xf4f4ff);
      this._birdGeos = this._birdGeos || {};
      let geo = this._birdGeos[gk];
      if (!geo) {
        const b = new Batch(), body = col(o.body !== undefined ? o.body : 0x383840), wing = col(o.wing !== undefined ? o.wing : 0xf4f4ff);
        b.tri([0, 0, 0.45], [-0.12, 0, -0.35], [0.12, 0, -0.35], body);
        b.tri([-0.05, 0, 0.1], [-1.0, 0.05, -0.15], [-0.1, 0, -0.3], wing); b.tri([0.05, 0, 0.1], [0.1, 0, -0.3], [1.0, 0.05, -0.15], wing);
        geo = this._birdGeos[gk] = this._g(b.build());
      }
      if (!this._birdMat) {
        const m = this._mat({ detail: false }, true), uT = this._uT;
        m.onBeforeCompile = (sh) => {
          sh.uniforms.uT = uT;
          sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed.y += abs( position.x ) * 0.55 * sin( uT * 11.0 + instanceMatrix[3][0] * 0.9 + instanceMatrix[3][2] * 0.7 );');
        };
        m.customProgramCacheKey = () => 'birds5';
        this._birdMat = m;
      }
      const im = new THREE.InstancedMesh(geo, this._birdMat, n);
      im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const rec = { t: 3, im, n, cx: o.cx || 0, cz: o.cz || 0, y: o.y || 45, R: o.radius || 60, sp: o.speed || 0.12, sz, ph: [], rr: [], yy: [], dir: o.dir || 1 };
      for (let i = 0; i < n; i++) { rec.ph.push((i / n) * 6.2832 + this.rng() * 0.6); rec.rr.push(1 + (this.rng() - 0.5) * 0.3); rec.yy.push((this.rng() - 0.5) * 6); }
      this._motion.push(rec); this._add(im); this._stepBirds(rec, 0);
      return im;
    }
    _stepBirds(m, time) {
      const a = m.im.instanceMatrix.array, s = m.sz;
      for (let i = 0; i < m.n; i++) {
        const ang = m.ph[i] + time * m.sp * m.dir, R = m.R * m.rr[i], c = Math.cos(ang), sn = Math.sin(ang);
        const x = m.cx + c * R, z = m.cz + sn * R, y = m.y + m.yy[i] + Math.sin(time * 0.7 + i) * 1.5;
        // heading = tangent of the circle
        const fx = -sn * m.dir, fz = c * m.dir, cy = fz, sy = fx, o = i * 16;
        a[o] = cy * s; a[o + 1] = 0; a[o + 2] = -sy * s; a[o + 3] = 0; a[o + 4] = 0; a[o + 5] = s; a[o + 6] = 0; a[o + 7] = 0;
        a[o + 8] = sy * s; a[o + 9] = 0; a[o + 10] = cy * s; a[o + 11] = 0; a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
      }
      m.im.instanceMatrix.needsUpdate = true;
    }

    // ---- crowds: instanced spectators (body + head/arms), bounce, do the wave, cheer near human karts / on events
    _crowdGeo() {
      if (this._cGeo) return this._cGeo;
      const bb = new Batch(), hb = new Batch(), w = [1, 1, 1];
      bb.frustum(0, 0, 0, 0.3, 0.23, 0.78, 7, w, 0);
      bb.blob(0, 0.78, 0, 0.27, 0.13, 0.22, w, 0);
      hb.blob(0, 1.03, 0, 0.26, 0.28, 0.26, w, 0);
      for (let sd = -1; sd <= 1; sd += 2) this._prism(hb, [sd * 0.25, 0.7, 0], [sd * 0.52, 1.32, 0.04], 0.075, w);
      this._cGeo = [this._g(bb.build()), this._g(hb.build())];
      return this._cGeo;
    }
    // spots: [[x,y,z, ry?, u?]] ; o: {scale, colors:[hex], skin:[hex], radius, wave:true, idle, group}
    _crowd(spots, o) {
      o = o || {};
      const n = spots.length; if (!n) return null;
      const [gb, gh] = this._crowdGeo(), mb = this._mat({ detail: false }, false), mh = this._mat({ detail: false }, false);
      const bi = new THREE.InstancedMesh(gb, mb, n), hi = new THREE.InstancedMesh(gh, mh, n);
      bi.instanceMatrix.setUsage(THREE.DynamicDrawUsage); hi.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const shirts = (o.colors || [0xe8383d, 0xffd23a, 0x3a8cff, 0x59d66b, 0xff7ad9, 0xffffff, 0xff9a2e, 0xa56bff, 0x35d0c8]).map((h) => new THREE.Color(h));
      const skins = (o.skin || [0xf6d2b0, 0xe0a87c, 0xa8744a, 0xfff0a0, 0xd8c0f0]).map((h) => new THREE.Color(h));
      const c = { bi, hi, n, x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), cs: new Float32Array(n), sn: new Float32Array(n), ph: new Float32Array(n), u: new Float32Array(n),
        sc: o.scale || 1.1, idle: o.idle !== undefined ? o.idle : 0.06, wave: o.wave !== false, period: o.period || 14 + this.rng() * 5, wsp: o.waveTime || 3.2, woff: o.woff !== undefined ? o.woff : this.rng() * 14, cheer: 0, boost: 0, cx: 0, cz: 0, ext: 20, R: 55, ax: 0 };
      let sx = 0, sz = 0;
      for (let i = 0; i < n; i++) {
        const s = spots[i], ry = s[3] || 0;
        c.x[i] = s[0]; c.y[i] = s[1]; c.z[i] = s[2]; c.cs[i] = Math.cos(ry); c.sn[i] = Math.sin(ry); c.ph[i] = this.rng() * 6.283; c.u[i] = s[4] !== undefined ? s[4] : i / Math.max(1, n - 1);
        sx += s[0]; sz += s[2];
        bi.setColorAt(i, shirts[(this.rng() * shirts.length) | 0]); hi.setColorAt(i, skins[(this.rng() * skins.length) | 0]);
      }
      c.cx = sx / n; c.cz = sz / n;
      for (let i = 0; i < n; i++) c.ext = Math.max(c.ext, Math.hypot(c.x[i] - c.cx, c.z[i] - c.cz));
      c.R = o.radius || 50;
      bi.frustumCulled = hi.frustumCulled = false;
      this._poseCrowd(c, 0, 0);
      bi.instanceColor.needsUpdate = true; hi.instanceColor.needsUpdate = true;
      this._add(bi); this._add(hi);
      this._crowds.push(c);
      return c;
    }
    _poseCrowd(c, time, dt) {
      const ar = c.bi.instanceMatrix.array, ah = c.hi.instanceMatrix.array, ch = c.cheer, rate = 5.2 + ch * 5.5, amp = c.idle + ch * 0.5 * c.sc, n = c.n, sc = c.sc, sy = sc * (1 + ch * 0.1);
      let front = -9;
      if (c.wave) { const tt = (time + c.woff) % c.period; front = tt / c.wsp - 0.15; if (front > 1.2) front = -9; }
      for (let i = 0; i < n; i++) {
        let b = Math.abs(Math.sin(time * rate + c.ph[i])) * amp;
        if (front > -5) { const dd = Math.abs(c.u[i] - front); if (dd < 0.13) { const k = 1 - dd / 0.13; b += k * k * (3 - 2 * k) * 0.6 * sc; } }
        const o = i * 16, cc = c.cs[i] * sc, ss = c.sn[i] * sc;
        ar[o] = cc; ar[o + 1] = 0; ar[o + 2] = -ss; ar[o + 3] = 0; ar[o + 4] = 0; ar[o + 5] = sy; ar[o + 6] = 0; ar[o + 7] = 0;
        ar[o + 8] = ss; ar[o + 9] = 0; ar[o + 10] = cc; ar[o + 11] = 0; ar[o + 12] = c.x[i]; ar[o + 13] = c.y[i] + b; ar[o + 14] = c.z[i]; ar[o + 15] = 1;
        for (let q = 0; q < 16; q++) ah[o + q] = ar[o + q];
      }
      c.bi.instanceMatrix.needsUpdate = true; c.hi.instanceMatrix.needsUpdate = true;
    }
    // grandstand-style spot list along the road: {d0,d1,side(+1 right/-1 left),l0 (lateral of the first row), rows, gap (m between rows), rise (per row), step (m along), jitter, dy}
    _standSpots(o) {
      const out = [], side = o.side || 1, step = o.step || 1.5, rows = o.rows || 3, gap = o.gap || 1.3, rise = o.rise !== undefined ? o.rise : 0.7, rng = this.rng, f = {};
      const span = o.d1 - o.d0;
      for (let d = o.d0; d <= o.d1; d += step) {
        this._frame(d, f);
        for (let r = 0; r < rows; r++) {
          const l = side * (o.l0 + r * gap) + (rng() - 0.5) * (o.jitter !== undefined ? o.jitter : 0.4);
          const dd = (rng() - 0.5) * (o.jitter !== undefined ? o.jitter : 0.4);
          const x = f.x + f.rx * l + f.tx * dd, z = f.z + f.rz * l + f.tz * dd;
          out.push([x, f.y + (o.dy || 0) + r * rise, z, Math.atan2(-side * f.rx, -side * f.rz), (d - o.d0) / (span || 1)]);
        }
      }
      return out;
    }
    _cheerAt(x, z, r, sec) {
      for (let i = 0; i < this._crowds.length; i++) {
        const c = this._crowds[i], dx = x - c.cx, dz = z - c.cz, rr = r + c.ext;
        if (dx * dx + dz * dz < rr * rr && c.boost < sec) c.boost = sec;
      }
    }

    // ---- item box row sparkles (one Points draw, shader animated)
    _buildSparkles() {
      const sp = this.itemBoxSpots; if (!sp || !sp.length) return;
      const em = []; for (const s of sp) em.push([s.x, s.y + 1.1, s.z]);
      this._particles({ emitters: em, count: 6, vel: [0, 0.8, 0], spread: [0.6, 0.35, 0.6], jitter: [1.0, 0.7, 1.0], life: 1.7, size: 1.0, grow: -0.4, alpha: 1, pow: 0.6, fadeIn: 0.2,
        color: [0xfff4b0, 0xffffff, 0xa8e8ff, 0xffd0f4], tex: 'spark', additive: true });
    }

    _buildLife() {
      this._finishCloth();
      this._finishProps();
      this._buildSparkles();
      if (this._crowds.length && G.events && G.events.on) {
        const self = this;
        const hit = (e) => { const p = e && e.victim && e.victim.pos; if (p) self._cheerAt(self.mirror ? -p.x : p.x, p.z, 80, 2.4); };
        const hz = (e) => { if (e && e.x !== undefined) self._cheerAt(self.mirror ? -e.x : e.x, e.z, 90, 2.2); };
        G.events.on('itemHit', hit); G.events.on('hazardLaunched', hz);
        this._evs.push(['itemHit', hit], ['hazardLaunched', hz]);
      }
    }
    _stepLife(dt, time) {
      this._uT.value = time;
      // human kart positions (build space) + lap-change cheers
      const gm = G.Game, hs = gm && gm.humans, hk = this._hk; let hn = 0;
      if (hs) for (let i = 0; i < hs.length && hn < 16; i++) {
        const k = hs[i] && hs[i].kart; if (!k || !k.pos) continue;
        hk[hn * 2] = this.mirror ? -k.pos.x : k.pos.x; hk[hn * 2 + 1] = k.pos.z;
        const lap = k.lap | 0;
        if (this._lapSeen[hn] === undefined) this._lapSeen[hn] = lap;
        else if (lap > this._lapSeen[hn]) { this._lapSeen[hn] = lap; this._cheerAt(hk[hn * 2], hk[hn * 2 + 1], 140, 3.5); }
        hn++;
      }
      this._hn = hn;
      const M = this._motion;
      for (let i = 0; i < M.length; i++) {
        const m = M[i];
        if (m.t === 0) m.o.rotation[m.ax] = m.b + time * m.sp + m.ph;
        else if (m.t === 1) m.o.rotation[m.ax] = m.b + Math.sin(time * m.sp + m.ph) * m.amp;
        else if (m.t === 2) {
          const a = time * m.sp + m.ph;
          m.o.position.y = m.y0 + Math.sin(a) * m.amp; m.o.rotation.z = m.rz + Math.sin(a * 0.8 + 1) * m.roll; m.o.rotation.x = m.rx + Math.cos(a * 0.7) * m.roll * 0.6;
        } else if (m.t === 4) {
          const k = Math.sin(time * m.sp + m.ph); m.o.position.set(m.x0 + m.dx * k, m.y0 + m.dy * k, m.z0 + m.dz * k);
        } else if (m.t === 3) this._stepBirds(m, time);
      }
      const B = this._blinkers;
      for (let i = 0; i < B.length; i++) {
        const b = B[i], u = (((time / b.per + b.ph) % 1) + 1) % 1;
        let lit;
        if (b.sine) lit = 0.5 + 0.5 * Math.sin(u * 6.2832); else lit = u < b.duty ? 1 : 0;
        if (b.alt && !b.sine) { const k = b.hi; if (lit) b.c.setRGB(b.r * k, b.g * k, b.b * k); else b.c.setRGB(b.ar * k, b.ag * k, b.ab * k); }
        else { const v = b.lo + (b.hi - b.lo) * lit; b.c.setRGB(b.r * v, b.g * v, b.b * v); }
      }
      const S = this._scrolls;
      for (let i = 0; i < S.length; i++) { const s = S[i]; s.t.offset.set((time * s.u) % 1, (time * s.v) % 1); }
      if (this._boostTex) this._boostTex.offset.y = -((time * 1.1) % 1);
      if (this._boostMat) { const k = 0.88 + 0.12 * Math.sin(time * 9); this._boostMat.color.setRGB(k, k, k); }
      const C = this._crowds;
      for (let i = 0; i < C.length; i++) {
        const c = C[i];
        let d2 = 1e18;
        for (let h = 0; h < hn; h++) { const dx = hk[h * 2] - c.cx, dz = hk[h * 2 + 1] - c.cz, q = dx * dx + dz * dz; if (q < d2) d2 = q; }
        const vis = hn === 0 || d2 < (c.R + c.ext + 230) * (c.R + c.ext + 230);
        if (c.bi.visible !== vis) c.bi.visible = c.hi.visible = vis;
        if (!vis) continue;
        let tgt = 0;
        const lim = c.R + c.ext;
        if (d2 < lim * lim) { const dd = Math.sqrt(d2) - c.ext; tgt = dd < 6 ? 1 : Math.max(0, 1 - (dd - 6) / (c.R - 6)) * 0.85; }
        if (c.boost > 0) { c.boost -= dt; if (tgt < 1) tgt = 1; }
        c.cheer += (tgt - c.cheer) * Math.min(1, dt * (tgt > c.cheer ? 7 : 1.4));
        this._poseCrowd(c, time, dt);
      }
    }

    // ------------------------------------------------ v2 content hooks
    _kit() {
      if (this._kitObj) return this._kitObj;
      const self = this, ft = { x: 0, y: 0, z: 0, tx: 0, tz: 1, rx: -1, rz: 0, halfWidth: 12 };
      this._kitObj = {
        Batch, col, mix, mul, hsl, rng: this.rng, theme: this.cfg, length: this.length, groundY: this.groundY,
        N: this.N, ds: this.ds, px: this.px, py: this.py, pz: this.pz, hw: this.hw, curv: this.curv,
        at(d, l, dy) { return self._PD(d, l || 0, dy || 0); },
        frame(d) { const f = self._frame(d, {}); return f; },
        frameInto(d, out) { return self._frame(d, out); },
        tree(batch, x, y, z, scale, kind, o) { self._tree(batch, x, y, z, scale, kind, o); },
        water(o) { return self._water(o); },
        grassTufts(count, off0, off1, o) { return self._tufts(count, off0, off1, o); },
        shiny(opts) {
          const m = G.GFX && G.GFX.shiny ? G.GFX.shiny(opts || {}) : new THREE.MeshPhongMaterial(Object.assign({ shininess: 60, specular: 0x444444 }, opts || {}));
          self._mats.push(m); return m;
        },
        detail(mat, o) { return self._detail(mat, o); },
        skyMode: self.skyMode,
        mesh(batch, matOpts, basic) { const m = self._mesh(batch, self._mat(matOpts || {}, !!basic), true); if (m) m.receiveShadow = true; return m; },
        mat(opts, basic) { return self._mat(opts || {}, !!basic); },
        add(o) { return self._add(o); },
        trackGeom(g) { self._geoms.push(g); return g; },
        trackMat(m) { self._mats.push(m); return m; },
        scatter(count, off0, off1, margin, cb) { self._scatter(count, off0, off1, margin, cb); },
        farScatter(count, minD, cb) { self._farScatter(count, minD, cb); },
        clear(x, z, m) { return self.clear(x, z, m); },
        reserve(x, z, r) { self._noGo.push({ x, z, r }); },
        follow(obj, spin) { self._follow(obj, spin); },
        makeCanvasTexture(w, h, draw) {
          const t = self._canvasTex(w, h, draw); self._tex.push(t); return t;
        },
        get time() { return self._time; },
        // ---- v5 liveliness helpers -------------------------------------------------------------------
        // windy foliage: kit.mesh(batch, {wind:true}) or kit.foliage(batch, {strength, heightScale})
        foliage(batch, o) { const m = self._mesh(batch, self._mat({ wind: Object.assign({ strength: 0.32, heightScale: 0.17 }, o || {}) }, !!(o && o.basic)), true); if (m) m.receiveShadow = true; return m; },
        waterMat(o) { return self._waterMat(o); },
        flowMat(kind, o) { return self._flowMat(kind, o); },
        panel(corners, mat, rep) { return self._panel(corners, mat, rep); },
        ribbon(d0, d1, l0, l1, dy, mat, o) { return self._ribbon(d0, d1, l0, l1, dy, mat, o); },
        scroll(tex, du, dv) { return self._scroll(tex, du, dv); },
        flag(x, y, z, w, h, ry, colors, o) { self._flag(x, y, z, w, h, ry, colors, o); },
        banner(x, y, z, w, h, ry, colors, o) { self._banner(x, y, z, w, h, ry, colors, o); },
        bunting(a, b, colors, n, size, sag) { self._bunting(a, b, colors, n, size, sag); },
        spinner(obj, axis, speed, phase) { return self._spin(obj, axis, speed, phase); },
        spinBatch(batch, o) { return self._spinBatch(batch, o); },
        sway(obj, axis, amp, speed, phase) { return self._sway(obj, axis, amp, speed, phase); },
        bob(obj, amp, speed, phase, roll) { return self._bob(obj, amp, speed, phase, roll); },
        slide(obj, dx, dy, dz, speed, phase) { return self._slide(obj, dx, dy, dz, speed, phase); },
        blinker(mat, period, o) { return self._blinker(mat, period, o); },
        crowd(spots, o) { return self._crowd(spots, o); },
        standSpots(o) { return self._standSpots(o); },
        cheerAt(x, z, r, sec) { self._cheerAt(x, z, r, sec); },
        particles(o) { return self._particles(o); },
        birds(o) { return self._birds(o); },
        prism(b, a, c, w, k) { self._prism(b, a, c, w, k); },
        // flag pole at road distance d / lateral l flying along the road (o.flip reverses); o: {pole, pattern, dy, amp}
        flagAt(d, l, w, h, colors, o) {
          o = o || {}; const p = self._PD(d, l, o.dy || 0), f = self._frame(d, {}), ry = Math.atan2(f.tx, f.tz) - Math.PI / 2 + (o.flip ? Math.PI : 0);
          self._flag(p[0], p[1], p[2], w, h, o.ry !== undefined ? o.ry : ry, colors, o);
        },
        // grandstand crowd along the road: standSpots(o) -> crowd(spots, o)
        crowdStand(o) { return self._crowd(self._standSpots(o), o); },
        lightBeam(o) { return self._lightBeam(o); },
        // ---- v6 engine scenery helpers (all optional) ------------------------------------------------
        terrainY(x, z) { return self.terrainY(x, z); },
        terrainKind() { return self._ter ? self._ter.kind : null; },
        aoSpot(x, z, r, s) { self.aoSpot(x, z, r, s); },
        rock(batch, x, y, z, scale, kind, o) { self._rock(batch, x, y, z, scale, kind, o); },
        bush(batch, x, y, z, scale, o) { self._bush(batch, x, y, z, scale, o); },
        // flowers(batch, x, y, z, radius, count, colors)  -> patch in a batch;  flowers(count, off0, off1, o) -> instanced road-edge flowers
        flowers(a, x, y, z, r, n, colors) { if (a && a.tri) self._flowerPatch(a, x, y, z, r, n, colors); else return self._tufts(a, x, y, z, Object.assign({ flowers: 1 }, r || {})); },
        fence(batch, d0, d1, side, o) { self._fenceRun(batch, d0, d1, side, o); },
        railing(batch, d0, d1, side, o) { self._railingRun(batch, d0, d1, side, o); },
        lamp(batch, x, y, z, o) { self._lamp(batch, x, y, z, o); },
        building(batch, x, z, w, d, h, style, o) { self._building(batch, x, z, w, d, h, style, o); },
        billboard(x, z, text, colors, o) { return self._billboard(x, z, text, colors, o); },
      };
      return this._kitObj;
    }
    // canvas texture that never throws: without a 2D context (node stub / headless validation) draws go to a chainable no-op context
    _canvasTex(w, h, draw) {
      let ctx = null, c = null;
      try { if (canvasOK()) { c = document.createElement('canvas'); c.width = w; c.height = h; ctx = c.getContext('2d'); } } catch (e) { ctx = null; }
      if (!ctx) {
        const nop = new Proxy(function () {}, { get: (t, k) => (k === 'canvas' ? { width: w, height: h } : k === 'measureText' ? () => ({ width: 10 }) : nop), set: () => true, apply: () => nop });
        ctx = nop;
        try { draw(ctx, w, h); } catch (e) { /* ignore */ }
        return new THREE.Texture();
      }
      draw(ctx, w, h);
      return new THREE.CanvasTexture(c);
    }
    // zones with an id can be toggled at runtime (tides, gates): track.setZoneActive('tide', false)
    setZoneActive(id, on) { for (const q of this.rects) if (q.id === id) q.active = on; }
    _buildCustom(def) {
      if (typeof def.decorate === 'function') def.decorate(this, this._kit());
      if (typeof def.hazards === 'function') {
        const list = def.hazards(this, this._kit()) || [];
        for (const h of list) {
          if (h.object3D && !h.object3D.parent) this._add(h.object3D);
          this._hazards.push(h);
        }
      }
    }
    _mirrorPublicData() {
      if (!this.mirror) return;
      for (const s of this.itemBoxSpots) s.x = -s.x;
      const m = this.minimap;
      for (const p of m.points) p.x = -p.x;
      const b = m.bounds, mx = b.minX;
      b.minX = -b.maxX; b.maxX = -mx;
    }
    // world-space hazards for collision (reused array/objects)
    getHazards() {
      const out = this._hazOut, hz = this._hazards;
      out.length = 0;
      for (let i = 0; i < hz.length; i++) {
        const h = hz[i];
        if (h.active === false || h._L) continue;
        let o = h._w; if (!o) o = h._w = { x: 0, y: 0, z: 0, radius: 1, hitKind: 'spin', vx: 0, vz: 0, ref: h };
        o.x = this.mirror ? -h.x : h.x; o.y = h.y || 0; o.z = h.z;
        o.radius = h.radius || 1.5; o.hitKind = h.hitKind || 'spin';
        o.vx = this.mirror ? -(h.vx || 0) : h.vx || 0; o.vz = h.vz || 0;
        out.push(o);
      }
      return out;
    }

    // ------------------------------------------------ launchable hazards (v4)
    // ref = hazard object from def.hazards() (getHazards() entries carry .ref). vx/vz in WORLD space.
    // Returns true if the hazard was launched.
    launchHazard(ref, vx, vy, vz) {
      const h = ref && ref.ref ? ref.ref : ref;
      if (!h || h._L || h.launchable === false || h.active === false) return false;
      if (this._hazards.indexOf(h) < 0) return false;
      const mx = this.mirror ? -1 : 1;
      const L = h._L = {
        t: 0, vx: (vx || 0) * mx, vy: vy === undefined ? 14 : vy, vz: vz || 0,
        x: h.x, y: h.y || 0, z: h.z, y0: h.y || 0,
        rx: 0, ry: h.object3D ? h.object3D.rotation.y : 0, rz: 0,
        sx: (Math.random() - 0.5) * 14, sy: (Math.random() - 0.5) * 10, sz: (Math.random() - 0.5) * 14,
        s: 1, landed: -1, base: null,
      };
      const o3 = h.object3D;
      if (o3) L.base = { sx: o3.scale.x, sy: o3.scale.y, sz: o3.scale.z, rx: o3.rotation.x, ry: o3.rotation.y, rz: o3.rotation.z };
      h.vx = L.vx; h.vz = L.vz;
      if (h.launch) h.launch(L.vx, L.vy, L.vz);
      if (G.events) G.events.emit('hazardLaunched', { ref: h, x: mx * h.x, z: h.z });
      return true;
    }
    _stepLaunched(h, dt, time) {
      const L = h._L, o3 = h.object3D;
      L.t += dt;
      const POP = 0.45, RESPAWN = 4.0;
      if (L.t < RESPAWN) {
        if (L.landed < 0) {
          L.vy -= 30 * dt;
          L.x += L.vx * dt; L.y += L.vy * dt; L.z += L.vz * dt;
          L.rx += L.sx * dt; L.ry += L.sy * dt; L.rz += L.sz * dt;
          if ((L.vy < 0 && L.y <= L.y0 + 0.3) || L.t > 2.5) { L.landed = L.t; L.vx = L.vz = 0; }
        }
        // shrink out after landing (or at 2.5 s)
        L.s = L.landed < 0 ? 1 : Math.max(0, 1 - (L.t - L.landed) / 0.5);
      } else {
        // pop-in: resume normal behaviour, scaled up
        const k = (L.t - RESPAWN) / POP;
        if (!L.popped) {
          L.popped = true;
          if (o3 && L.base) { o3.rotation.x = L.base.rx; o3.rotation.z = L.base.rz; }
          if (h.launchEnd) h.launchEnd();
        }
        if (h.update) h.update(dt, time);
        if (k >= 1) {
          h._L = null;
          if (o3 && L.base) o3.scale.set(L.base.sx, L.base.sy, L.base.sz);
          return;
        }
        if (o3 && L.base) o3.scale.set(L.base.sx * k, L.base.sy * k, L.base.sz * k);
        else if (h.popScale) h.popScale(k);
        return;
      }
      h.x = L.x; h.y = L.y; h.z = L.z;
      if (o3) {
        o3.position.set(L.x, L.y, L.z);
        o3.rotation.set(L.rx, L.ry, L.rz);
        const b = L.base, s = L.s;
        o3.scale.set(b.sx * s, b.sy * s, b.sz * s);
      }
      if (h.launchPose) h.launchPose(L);
    }

    // ------------------------------------------------ per-frame animation
    update(dt, time) {
      this._time = time;
      for (let i = 0; i < this._hazards.length; i++) {
        const h = this._hazards[i];
        if (h._L) { this._stepLaunched(h, dt, time); continue; }
        if (h.update) h.update(dt, time);
      }
      this._stepLife(dt, time);
      if (this.def.update) this.def.update(this, dt, time);
      if (this._padMat) { const k = 0.8 + 0.2 * Math.sin(time * 9); this._padMat.color.setRGB(k, k, k); }
      const w = this._anim.water;
      if (w) {
        w.position.y = this.groundY + 0.08 + Math.sin(time * 1.3) * 0.03;
        if (!w.material.isShaderMaterial) w.material.opacity = 0.86 + Math.sin(time * 0.9) * 0.04;
      }
    }

    dispose() {
      if (G.events && G.events.off) for (const e of this._evs) G.events.off(e[0], e[1]);
      this._evs.length = 0;
      for (const o of this._objs) { if (o.parent) o.parent.remove(o); if (o.isInstancedMesh && o.dispose) o.dispose(); }
      for (const g of this._geoms) g.dispose();
      for (const m of this._mats) m.dispose();
      for (const t of this._tex) t.dispose();
      this._objs.length = 0; this._geoms.length = 0; this._mats.length = 0;
      if (this.hemi && this.hemi.dispose) this.hemi.dispose();
      if (this.sun && this.sun.shadow && this.sun.shadow.map) this.sun.shadow.map.dispose();
      if (this.root && this.root.parent) this.root.parent.remove(this.root);
      if (this.scene) { this.scene.fog = null; this.scene.background = null; }
    }
  }

  G.Track = Track;
})();
