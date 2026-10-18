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

  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const hash2 = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
  const smooth01 = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

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
      this.shoulder = base.shoulder;
      this.offroadSurface = base.offroad || 'offroad';
      this.rng = mulberry(base.seed + (rev ? 1000 : 0));
      this._time = 0;
      this._geoms = []; this._mats = []; this._objs = []; this._tex = [];
      this._anim = {};
      this._hazards = [];
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
      else if (this.noWalls && a > hw + 1) surface = 'void';
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
      const m = basic
        ? new THREE.MeshBasicMaterial(Object.assign({ vertexColors: true, side: THREE.DoubleSide }, opts))
        : new THREE.MeshLambertMaterial(Object.assign({ vertexColors: true, side: THREE.DoubleSide }, opts));
      // world-space detail texture on big lit surfaces (never on emissive/basic, textured or transparent ones)
      if (!basic && detail !== false && !opts.map && !opts.transparent) this._detail(m, typeof detail === 'object' ? detail : undefined);
      this._mats.push(m);
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
        const base = P.length / 3, S = stops.length;
        for (let k = 0; k <= segs; k++) {
          const a = (k / segs) * Math.PI * 2, h = hFn(a), cs = Math.cos(a) * R, sn = Math.sin(a) * R;
          for (let s = 0; s < S; s++) { P.push(cs, y0 + (h - y0) * stops[s][0], sn); C.push(stops[s][1][0], stops[s][1][1], stops[s][1][2]); }
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
        return (a) => h0 * (0.3 + 0.7 * (Math.pow(1 - Math.abs(Math.sin(a * 5 + p1)), 1.6) * 0.6 + Math.pow(1 - Math.abs(Math.sin(a * 11 + p2)), 2.2) * 0.4));
      };
      const mesa = (h0) => { const p1 = ph(), p2 = ph(); return (a) => h0 * (0.12 + 0.88 * smooth01(Math.sin(a * 4 + p1) * 2.2 + Math.sin(a * 9 + p2) * 0.6)); };
      const grad = (c, f0, f1) => [[0, tint(c, f0)], [0.3, tint(c, f1)], [1, c]];
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
          this._follow(cl, mode === 'space' ? 0.002 : 0.004);
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
        sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
        sg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
        sg.setIndex([0, 1, 2, 0, 2, 3]);
        this._geoms.push(sg);
        const scol = mode === 'night' ? 0xc8d8ff : mode === 'sunset' ? 0xffb070 : 0xfff0c8;
        const sm = new THREE.MeshBasicMaterial({ map: stex, color: scol, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
        this._mats.push(sm);
        const sun = new THREE.Mesh(sg, sm);
        sun.renderOrder = -996;
        this._follow(sun);
        this._add(sun);
        this._anim.sunDisc = sun;
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
      // glowing guard rails on the outside of sharper corners (starlight only)
      if (star) {
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
      this.roadMesh = this._mesh(road, this._mat(roadTex ? { map: roadTex } : {}, star), true);
      if (this.roadMesh) this.roadMesh.receiveShadow = true;

      // boost pads & jump ramps (flat decals just above the road)
      const pad = new Batch();
      const orange = col(0xff8a00), yellow = col(0xfff25a), blue = col(0x2c6bff), wht = [1, 1, 1];
      for (let k = 0; k < this.nrect; k++) {
        const q = this.rects[k], boost = q.kind === 'boost';
        if (q.kind !== 'boost' && q.kind !== 'jump' && q.kind !== 'cannon') {
          if (q.decal === false) continue;
          // surface zone decal
          const zc = q.color !== undefined ? col(q.color) : col(ZONE_COLORS[q.kind] || 0x777777);
          for (let d = q.d0; d < q.d1 - 0.01; d += 2) {
            const d2 = Math.min(q.d1, d + 2), sh = ((d / 2) | 0) & 1 ? 1 : 0.93;
            pad.quad(this._PD(d, q.l0, 0.06), this._PD(d, q.l1, 0.06), this._PD(d2, q.l1, 0.06), this._PD(d2, q.l0, 0.06), mul(zc, sh));
          }
          continue;
        }
        const base = boost ? orange : q.kind === 'cannon' ? col(0x8a4a1c) : blue, chev = boost ? yellow : wht;
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
    }

    // shoulders, embankments, walls/fences
    _buildBoundaries(def) {
      const N = this.N, star = this.theme === 'starlight', cfg = this.cfg, theme = this.theme;
      if (star || this.noWalls) return;
      const sh = this.shoulder, gy = this.groundY;
      const shC = col(cfg.shoulder), emC = col(cfg.emb), g = new Batch();
      for (let i = 0; i < N; i += 2) {
        const j = i + 2 >= N ? 0 : i + 2, hi = this.hw[i], hj = this.hw[j];
        const shade = ((i >> 3) & 1) ? 1 : 0.94;
        for (let s = -1; s <= 1; s += 2) {
          g.quad(this._P(i, s * hi, -0.01), this._P(i, s * (hi + sh), -0.01), this._P(j, s * (hj + sh), -0.01), this._P(j, s * hj, -0.01), mul(shC, shade));
          const yi = this.py[i] - gy, yj = this.py[j] - gy;
          g.quad(this._P(i, s * (hi + sh), -0.01), this._P(i, s * (hi + sh + EMB), -yi), this._P(j, s * (hj + sh + EMB), -yj), this._P(j, s * (hj + sh), -0.01), emC);
        }
      }
      this.shoulderMesh = this._mesh(g, this._mat({}, false), true);
      if (this.shoulderMesh) this.shoulderMesh.receiveShadow = true;

      // walls / fences
      const w = new Batch();
      const ribbon = (side, o0, o1, y0, y1, step, cf) => {
        for (let i = 0; i < N; i += step) {
          const j = i + step >= N ? 0 : i + step, k = cf(i);
          const li = side * (this.hw[i] + sh + o0), lo = side * (this.hw[i] + sh + o1);
          const mi = side * (this.hw[j] + sh + o0), mo = side * (this.hw[j] + sh + o1);
          w.quad(this._P(i, li, y0), this._P(i, li, y1), this._P(j, mi, y1), this._P(j, mi, y0), k);
          w.quad(this._P(i, li, y1), this._P(i, lo, y1), this._P(j, mo, y1), this._P(j, mi, y1), k);
          w.quad(this._P(i, lo, y1), this._P(i, lo, y0), this._P(j, mo, y0), this._P(j, mo, y1), k);
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
        cb(x, z, i, rng);
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
        cb(x, z, rng); placed++;
      }
    }

    // ------------------------------------------------ scenery helpers (also exposed through the kit)
    // GameCube-style smooth tree into a Batch. kind: 'round' | 'pine' | 'palm' | 'snowpine'; o = {leaf, leaf2, trunk} colours (hex)
    _tree(b, x, y, z, s, kind, o) {
      s = s || 1; o = o || {};
      const h = hash2(x, z), g = 0.9 + h * 0.2, jc = (c) => mul(c, g);
      const trunk = col(o.trunk !== undefined ? o.trunk : 0x7a4f2a);
      if (kind === 'pine' || kind === 'snowpine') {
        const base = col(o.leaf !== undefined ? o.leaf : kind === 'pine' ? 0x2f8f46 : 0x1f6b57), snow = [1, 1, 1];
        b.frustum(x, y, z, 0.3 * s, 0.22 * s, 1.8 * s, 7, trunk, 0);
        for (let k = 0; k < 4; k++) {
          const r0 = (2.5 - k * 0.5) * s, hh = (2.3 - k * 0.15) * s, yy = y + (1.0 + k * 1.3) * s, c = mul(base, 0.85 + k * 0.08);
          b.frustum(x, yy, z, r0, 0.05 * s, hh, 9, jc(c), h * 6);
          if (kind === 'snowpine') b.frustum(x, yy + hh * 0.38, z, r0 * 0.62, 0.03 * s, hh * 0.62, 9, snow, h * 6);
        }
        b.blob(x, y + 6.05 * s, z, 0.28 * s, 0.4 * s, 0.28 * s, kind === 'snowpine' ? snow : jc(mul(base, 1.25)), 0);
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
      } else {
        const l1 = col(o.leaf !== undefined ? o.leaf : 0x45b24a), l2 = col(o.leaf2 !== undefined ? o.leaf2 : 0x5cc65a);
        b.frustum(x, y, z, 0.34 * s, 0.2 * s, 2.7 * s, 7, trunk, 0);
        b.blob(x, y + 3.5 * s, z, 2.3 * s, 1.95 * s, 2.3 * s, jc(l1), 1);
        b.blob(x + 1.1 * s, y + 3.0 * s, z + 0.4 * s, 1.5 * s, 1.35 * s, 1.5 * s, jc(mix(l1, l2, 0.4)), 0);
        b.blob(x - 1.0 * s, y + 3.2 * s, z - 0.5 * s, 1.5 * s, 1.35 * s, 1.5 * s, jc(mix(l1, l2, 0.4)), 0);
        b.blob(x + 0.1 * s, y + 4.7 * s, z - 0.1 * s, 1.55 * s, 1.2 * s, 1.55 * s, jc(l2), 1);
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
      const theme = this.theme, gy = this.groundY, b = new Batch();
      const marginTree = this.shoulder + 15 + EMB * 0.5;   // from centerline: hw ~13 + shoulder + embankment
      const m0 = 13 + this.shoulder + EMB + 3;
      if (lake) this._noGo.push({ x: lake.x, z: lake.z, r: lake.r + 4 });
      const jit = (c, r) => mul(c, 0.88 + r() * 0.24);

      if (theme === 'meadow') {
        this._scatter(240, 2, 70, m0, (x, z, i, r) => {
          const s = 0.85 + r() * 0.8;
          this._tree(b, x, gy, z, s, r() < 0.3 ? 'pine' : 'round');
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
        this._scatter(34, 3, 50, m0, (x, z, i, r) => this._tree(b, x, gy, z, 0.9 + r() * 0.6, 'palm'));
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
        this._scatter(230, 2, 70, m0, (x, z, i, r) => this._tree(b, x, gy, z, 0.85 + r() * 1.0, 'snowpine'));
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
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          draw(c.getContext('2d'), w, h);
          const t = new THREE.CanvasTexture(c); self._tex.push(t); return t;
        },
        get time() { return self._time; },
      };
      return this._kitObj;
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
      if (this.def.update) this.def.update(this, dt, time);
      if (this._padMat) { const k = 0.8 + 0.2 * Math.sin(time * 9); this._padMat.color.setRGB(k, k, k); }
      const w = this._anim.water;
      if (w) {
        w.position.y = this.groundY + 0.08 + Math.sin(time * 1.3) * 0.03;
        if (!w.material.isShaderMaterial) w.material.opacity = 0.86 + Math.sin(time * 0.9) * 0.04;
      }
    }

    dispose() {
      for (const o of this._objs) { if (o.parent) o.parent.remove(o); }
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
