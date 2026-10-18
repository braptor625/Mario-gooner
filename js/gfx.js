// GameCube-era look: shared textures, glossy materials, rim light, world-space detail texturing,
// water shader and the post pipeline (MSAA scene target -> bloom -> grade/vignette -> screen).
(function () {
  'use strict';
  const G = (window.G = window.G || {});

  const hasCanvas = (() => {
    try {
      return typeof document !== 'undefined' && typeof document.createElement('canvas').getContext === 'function' &&
        !!document.createElement('canvas').getContext('2d');
    } catch (e) {
      return false;
    }
  })();

  const GFX = (G.GFX = {
    quality: 'high',
    time: 0,
    tex: {},
    envMap: null,
    sunDir: new THREE.Vector3(0.45, 0.8, 0.35).normalize(),
    sunColor: new THREE.Color(0xfff2d8),
    bloomStrength: 0.3,
    bloomThreshold: 0.84,
    exposure: 0.95,
    // "GameCube" video filter: ~480p-class internal resolution (soft upscale), 6-bit-per-channel
    // colour with ordered dithering like the console's framebuffer, vertical deflicker blur, warm grade
    retro: true,
    retroHeight: 576,
  });
  try {
    const st = G.Save && G.Save.settings;
    if (st && st.retro !== undefined) GFX.retro = !!st.retro;
  } catch (e) { /* save not ready */ }

  // ------------------------------------------------------------------ textures
  function canvasTex(w, h, draw, repeat) {
    if (!hasCanvas) return null;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    t.anisotropy = 4;
    return t;
  }
  // tiling value noise (periodic), returns Float32Array w*h in 0..1
  function tileNoise(w, h, cells, octaves, seed) {
    let s = seed || 1;
    const rnd = () => { s = (s * 16807) % 2147483647; return (s & 0xffff) / 0xffff; };
    const out = new Float32Array(w * h);
    let amp = 1, total = 0;
    for (let o = 0; o < octaves; o++) {
      const n = cells << o, grid = new Float32Array(n * n);
      for (let i = 0; i < grid.length; i++) grid[i] = rnd();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const fx = (x / w) * n, fy = (y / h) * n;
        const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const g = (a, b) => grid[((b + n) % n) * n + ((a + n) % n)];
        const v = G.lerp(G.lerp(g(x0, y0), g(x0 + 1, y0), sx), G.lerp(g(x0, y0 + 1), g(x0 + 1, y0 + 1), sx), sy);
        out[y * w + x] += v * amp;
      }
      total += amp; amp *= 0.5;
    }
    for (let i = 0; i < out.length; i++) out[i] /= total;
    return out;
  }
  function grayTex(w, h, fn, seed) {
    return canvasTex(w, h, (ctx) => {
      const img = ctx.createImageData(w, h), d = img.data;
      const n = tileNoise(w, h, 8, 4, seed), fine = tileNoise(w, h, 64, 1, seed + 7);
      for (let i = 0; i < w * h; i++) {
        const v = G.clamp(fn(n[i], fine[i], i % w, (i / w) | 0), 0, 1) * 255;
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }, true);
  }

  function buildTextures() {
    const T = GFX.tex;
    T.soft = canvasTex(64, 64, (c, w) => {
      const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.75)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, w);
    });
    T.spark = canvasTex(64, 64, (c, w) => {
      const m = w / 2;
      const g = c.createRadialGradient(m, m, 0, m, m, m * 0.45);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, w);
      c.fillStyle = 'rgba(255,255,255,0.9)';
      for (let k = 0; k < 2; k++) {
        c.save(); c.translate(m, m); c.rotate(k * Math.PI / 2);
        c.beginPath(); c.moveTo(-m, 0); c.quadraticCurveTo(0, -3, m, 0); c.quadraticCurveTo(0, 3, -m, 0); c.fill();
        c.restore();
      }
    });
    T.shadow = canvasTex(64, 64, (c, w) => {
      const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.6, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, w);
    });
    // detail textures are mean ~0.87 grayscale; shaders re-normalise so average brightness is kept
    T.detail = grayTex(256, 256, (n, f) => 0.62 + n * 0.3 + f * 0.12, 3);
    T.asphalt = grayTex(256, 256, (n, f, x, y) => {
      let v = 0.78 + n * 0.12 + (f - 0.5) * 0.22;
      if (((x * 7 + y * 13) % 97) === 0) v += 0.18; // stone glints
      return v;
    }, 5);
    T.grass = grayTex(256, 256, (n, f, x, y) => 0.7 + n * 0.22 + Math.max(0, Math.sin(x * 0.9 + n * 9) * Math.sin(y * 0.35)) * 0.12 * f, 9);
    T.sand = grayTex(256, 256, (n, f, x, y) => 0.8 + Math.sin((y + n * 40) * 0.25) * 0.06 + n * 0.1 + (f - 0.5) * 0.06, 13);
    T.snow = grayTex(256, 256, (n, f) => 0.9 + n * 0.08 + (f - 0.5) * 0.04, 17);
    T.dirt = grayTex(256, 256, (n, f) => 0.66 + n * 0.25 + (f > 0.8 ? 0.15 : 0), 21);
    T.envCanvas = null;
  }

  // equirect environment for glossy reflections: sky gradient, bright horizon band, sun hotspot, warm ground
  function drawEnv(top, horizon, ground) {
    if (!hasCanvas) return;
    if (!GFX.tex.envCanvas) {
      GFX.tex.envCanvas = document.createElement('canvas');
      GFX.tex.envCanvas.width = 256; GFX.tex.envCanvas.height = 128;
    }
    const c = GFX.tex.envCanvas, ctx = c.getContext('2d');
    const css = (h) => '#' + new THREE.Color(h).getHexString();
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, css(top));
    g.addColorStop(0.46, css(horizon));
    g.addColorStop(0.5, '#ffffff');
    g.addColorStop(0.56, css(ground));
    g.addColorStop(1, css(new THREE.Color(ground).multiplyScalar(0.55)));
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 128);
    const sg = ctx.createRadialGradient(70, 34, 0, 70, 34, 26);
    sg.addColorStop(0, 'rgba(255,255,240,1)'); sg.addColorStop(1, 'rgba(255,255,240,0)');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, 256, 128);
    // soft studio strips: these make curved paint read as glossy
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(150, 20, 60, 8); ctx.fillRect(20, 44, 30, 5);
    if (!GFX.envMap) {
      GFX.envMap = new THREE.CanvasTexture(c);
      GFX.envMap.mapping = THREE.EquirectangularReflectionMapping;
    } else GFX.envMap.needsUpdate = true;
  }
  GFX.setEnvFromTheme = function (top, horizon, ground) {
    drawEnv(top !== undefined ? top : 0x4a90e2, horizon !== undefined ? horizon : 0xcfe8ff, ground !== undefined ? ground : 0x7a8a5a);
  };

  GFX.setSun = function (dir, color) {
    if (dir) GFX.sunDir.copy(dir).normalize();
    if (color !== undefined) GFX.sunColor.set(color);
  };

  // ------------------------------------------------------------------ shader patches
  function chain(material, fn, key) {
    const prev = material.onBeforeCompile;
    material.onBeforeCompile = function (shader, renderer) {
      if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev.call(this, shader, renderer);
      fn(shader);
    };
    const prevKey = material.customProgramCacheKey ? material.customProgramCacheKey.bind(material) : () => '';
    material.customProgramCacheKey = () => prevKey() + key;
    material.needsUpdate = true;
  }

  const FINAL = 'gl_FragColor = vec4( outgoingLight, diffuseColor.a );';

  GFX.patchRim = function (material, opts) {
    if (!material || material._gfxRim) return material;
    if (!(material.isMeshPhongMaterial || material.isMeshStandardMaterial)) return material;
    material._gfxRim = true;
    opts = opts || {};
    const u = {
      rimColor: { value: new THREE.Color(opts.color !== undefined ? opts.color : 0xffffff) },
      rimStrength: { value: opts.strength !== undefined ? opts.strength : 0.35 },
      rimPower: { value: opts.power !== undefined ? opts.power : 2.6 },
    };
    material.userData.rim = u;
    chain(material, (shader) => {
      Object.assign(shader.uniforms, u);
      shader.fragmentShader = 'uniform vec3 rimColor;\nuniform float rimStrength;\nuniform float rimPower;\n' +
        shader.fragmentShader.replace(FINAL,
          'float rimF = pow( 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 ), rimPower );\n' +
          'outgoingLight += rimColor * rimF * rimStrength;\n' + FINAL);
    }, '|rim');
    return material;
  };

  GFX.shiny = function (opts) {
    opts = Object.assign({}, opts);
    const rim = opts.rim; delete opts.rim;
    const m = new THREE.MeshPhongMaterial(Object.assign({
      color: 0xffffff, shininess: 80, specular: 0x777777,
      envMap: GFX.envMap || null, combine: THREE.MixOperation, reflectivity: 0.1,
    }, opts));
    GFX.patchRim(m, rim || { strength: 0.25 });
    return m;
  };

  const detailUniform = { value: null };
  GFX.patchDetail = function (material, opts) {
    if (!material || material._gfxDetail || !GFX.tex.detail) return material;
    material._gfxDetail = true;
    opts = opts || {};
    detailUniform.value = GFX.tex.detail;
    const tex = opts.texture || GFX.tex.detail;
    const u = {
      detailMap: { value: tex },
      detailScale: { value: opts.scale !== undefined ? opts.scale : 0.35 },
      detailStrength: { value: opts.strength !== undefined ? opts.strength : 0.25 },
      detailMacro: { value: opts.macro !== undefined ? opts.macro : 0.18 },
    };
    material.userData.detail = u;
    chain(material, (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = 'varying vec3 vDetailPos;\n' + shader.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\n vec4 dwp = vec4( transformed, 1.0 );\n#ifdef USE_INSTANCING\n dwp = instanceMatrix * dwp;\n#endif\n vDetailPos = ( modelMatrix * dwp ).xyz;');
      shader.fragmentShader = 'varying vec3 vDetailPos;\nuniform sampler2D detailMap;\nuniform float detailScale;\nuniform float detailStrength;\nuniform float detailMacro;\n' +
        shader.fragmentShader.replace('#include <color_fragment>',
          '#include <color_fragment>\n' +
          ' vec2 dUV = vDetailPos.xz + vec2( vDetailPos.y * 0.71, vDetailPos.y * 0.37 );\n' +
          ' float dA = texture2D( detailMap, dUV * detailScale ).r;\n' +
          ' float dB = texture2D( detailMap, dUV * detailScale * 0.061 + 0.37 ).r;\n' +
          ' float dC = texture2D( detailMap, dUV * 0.013 ).r;\n' +
          ' float dd = mix( 1.0, ( dA * 0.6 + dB * 0.4 ) * 1.16, detailStrength ) * mix( 1.0, 0.72 + dC * 0.6, detailMacro );\n' +
          ' diffuseColor.rgb *= dd;');
    }, '|detail');
    return material;
  };

  // ------------------------------------------------------------------ water
  const waterUniforms = { time: { value: 0 }, sunDir: { value: GFX.sunDir }, sunColor: { value: GFX.sunColor } };
  GFX.water = function (opts) {
    opts = opts || {};
    const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      shallow: { value: new THREE.Color(opts.color !== undefined ? opts.color : 0x3ec6e0) },
      deep: { value: new THREE.Color(opts.deep !== undefined ? opts.deep : 0x0b5aa8) },
      sky: { value: new THREE.Color(opts.sky !== undefined ? opts.sky : 0xcfeaff) },
      opacity: { value: opts.opacity !== undefined ? opts.opacity : 0.88 },
      waveScale: { value: opts.waveScale !== undefined ? opts.waveScale : 1 },
    }]);
    u.time = waterUniforms.time; u.sunDir = waterUniforms.sunDir; u.sunColor = waterUniforms.sunColor;
    return new THREE.ShaderMaterial({
      uniforms: u,
      transparent: u.opacity.value < 1,
      fog: true,
      depthWrite: u.opacity.value >= 1,
      vertexShader: [
        'uniform float time; uniform float waveScale;',
        'varying vec3 vWorld; varying vec3 vView;',
        THREE.ShaderChunk.fog_pars_vertex,
        'void main(){',
        ' vec4 wp = modelMatrix * vec4(position,1.0);',
        ' wp.y += (sin(wp.x*0.21+time*1.3)+cos(wp.z*0.17+time*1.1))*0.06*waveScale;',
        ' vWorld = wp.xyz; vView = cameraPosition - wp.xyz;',
        ' vec4 mvPosition = viewMatrix * wp;',
        ' gl_Position = projectionMatrix * mvPosition;',
        THREE.ShaderChunk.fog_vertex,
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform float time; uniform vec3 shallow; uniform vec3 deep; uniform vec3 sky; uniform float opacity;',
        'uniform vec3 sunDir; uniform vec3 sunColor; uniform float waveScale;',
        'varying vec3 vWorld; varying vec3 vView;',
        THREE.ShaderChunk.fog_pars_fragment,
        'void main(){',
        ' vec2 p = vWorld.xz;',
        ' float t = time;',
        ' vec3 n = normalize(vec3(',
        '   (cos(p.x*0.35+t*1.4)*0.35 + cos(p.x*1.3-p.y*0.7+t*2.3)*0.15 + cos((p.x+p.y)*2.7+t*3.1)*0.06)*waveScale,',
        '   1.0,',
        '   (cos(p.y*0.31+t*1.2)*0.35 + cos(p.y*1.1+p.x*0.6+t*2.0)*0.15 + cos((p.y-p.x)*2.9+t*2.7)*0.06)*waveScale));',
        ' vec3 v = normalize(vView);',
        ' float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);',
        ' vec3 col = mix(deep, shallow, 0.45 + 0.35 * n.x);',
        ' col = mix(col, sky, clamp(fres * 0.85, 0.0, 0.85));',
        ' vec3 h = normalize(sunDir + v);',
        ' float spec = pow(max(dot(n, h), 0.0), 140.0) * 2.2;',
        ' float sparkle = step(0.985, fract(sin(dot(floor(p*3.0), vec2(12.9898,78.233)))*43758.5453 + t*0.6)) * spec * 0.0;',
        ' col += sunColor * (spec + sparkle);',
        ' gl_FragColor = vec4(col, max(opacity, fres));',
        THREE.ShaderChunk.fog_fragment,
        '}',
      ].join('\n'),
    });
  };

  // ------------------------------------------------------------------ wind (opt-in vertex sway)
  // GFX.patchWind(material, {strength=0.25 (m of sway at heightScale 1), heightScale=0.15 (per metre above
  // groundY, sway ramps up with height, clamped to 1.5), groundY=0 (local-space y of the base), speed=1.6})
  // Works for Mesh and InstancedMesh (world position phase). Patch the material BEFORE its first render.
  const windTime = { value: 0 };
  GFX.windTime = windTime;
  GFX.patchWind = function (material, opts) {
    if (!material || material._gfxWind) return material;
    material._gfxWind = true;
    opts = opts || {};
    const u = {
      windTime: windTime,
      windStrength: { value: opts.strength !== undefined ? opts.strength : 0.25 },
      windHeight: { value: opts.heightScale !== undefined ? opts.heightScale : 0.15 },
      windGround: { value: opts.groundY !== undefined ? opts.groundY : 0 },
      windSpeed: { value: opts.speed !== undefined ? opts.speed : 1.6 },
    };
    material.userData.wind = u;
    chain(material, (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = 'uniform float windTime;\nuniform float windStrength;\nuniform float windHeight;\nuniform float windGround;\nuniform float windSpeed;\n' +
        shader.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\n' +
          ' vec4 wwp = vec4( transformed, 1.0 );\n#ifdef USE_INSTANCING\n wwp = instanceMatrix * wwp;\n#endif\n wwp = modelMatrix * wwp;\n' +
          ' float wH = clamp( ( transformed.y - windGround ) * windHeight, 0.0, 1.5 );\n' +
          ' float wPh = windTime * windSpeed + wwp.x * 0.1 + wwp.z * 0.13;\n' +
          ' float wAmt = windStrength * wH * wH;\n' +
          ' transformed.x += ( sin( wPh ) + 0.35 * sin( wPh * 2.3 + 1.7 ) ) * wAmt;\n' +
          ' transformed.z += cos( wPh * 0.9 + 0.6 ) * wAmt * 0.6;');
    }, '|wind');
    return material;
  };

  GFX.update = function (dt) {
    GFX.time += dt;
    waterUniforms.time.value = GFX.time;
    windTime.value = GFX.time;
  };

  // ------------------------------------------------------------------ post pipeline
  const P = { w: 0, h: 0, msaa: false };
  let quadScene = null, quadCam = null, quad = null, mats = null;

  function makeQuad() {
    quadScene = new THREE.Scene();
    quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    quad.frustumCulled = false;
    quadScene.add(quad);
    const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    mats = {
      bright: new THREE.ShaderMaterial({
        uniforms: { tDiffuse: { value: null }, threshold: { value: 0.72 } },
        vertexShader: vs,
        fragmentShader: [
          'uniform sampler2D tDiffuse; uniform float threshold; varying vec2 vUv;',
          'void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb;',
          ' float l = max(c.r, max(c.g, c.b));',
          ' float k = smoothstep(threshold, threshold + 0.25, l);',
          ' gl_FragColor = vec4(c * k, 1.0); }',
        ].join('\n'),
        depthTest: false, depthWrite: false,
      }),
      blur: new THREE.ShaderMaterial({
        uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2(1, 0) } },
        vertexShader: vs,
        fragmentShader: [
          'uniform sampler2D tDiffuse; uniform vec2 dir; varying vec2 vUv;',
          'void main(){',
          ' vec3 s = texture2D(tDiffuse, vUv).rgb * 0.227;',
          ' s += texture2D(tDiffuse, vUv + dir * 1.385).rgb * 0.316;',
          ' s += texture2D(tDiffuse, vUv - dir * 1.385).rgb * 0.316;',
          ' s += texture2D(tDiffuse, vUv + dir * 3.231).rgb * 0.070;',
          ' s += texture2D(tDiffuse, vUv - dir * 3.231).rgb * 0.070;',
          ' gl_FragColor = vec4(s, 1.0); }',
        ].join('\n'),
        depthTest: false, depthWrite: false,
      }),
      final: new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: null }, tBloom: { value: null }, bloom: { value: 0.3 },
          saturation: { value: 1.2 }, contrast: { value: 1.05 }, vignette: { value: 0.18 }, time: { value: 0 },
          tint: { value: new THREE.Color(1.03, 1.0, 0.95) }, exposure: { value: 0.92 },
          retro: { value: 1 }, srcSize: { value: new THREE.Vector2(1, 1) },
        },
        vertexShader: vs,
        fragmentShader: [
          'uniform sampler2D tDiffuse; uniform sampler2D tBloom; uniform float bloom; uniform float saturation;',
          'uniform float contrast; uniform float vignette; uniform float time; uniform vec3 tint; uniform float exposure;',
          'uniform float retro; uniform vec2 srcSize; varying vec2 vUv;',
          'float bayer(vec2 p){ vec2 q = mod(floor(p), 4.0);',
          ' float i = q.x + q.y * 4.0;',
          ' float m[16];',
          ' m[0]=0.0; m[1]=8.0; m[2]=2.0; m[3]=10.0; m[4]=12.0; m[5]=4.0; m[6]=14.0; m[7]=6.0;',
          ' m[8]=3.0; m[9]=11.0; m[10]=1.0; m[11]=9.0; m[12]=15.0; m[13]=7.0; m[14]=13.0; m[15]=5.0;',
          ' float r = 0.0; for (int k = 0; k < 16; k++) { if (float(k) == i) r = m[k]; }',
          ' return r / 16.0 - 0.47; }',
          'vec3 shoulder(vec3 c){ vec3 x = max(c - 0.72, 0.0); return min(c, 0.72) + x / (1.0 + x * 2.2); }',
          'void main(){',
          ' vec3 c;',
          ' if (retro > 0.5) {',
          // GC "deflicker" copy filter: 3-line vertical blend
          '  vec2 px = vec2(0.0, 1.0 / srcSize.y);',
          '  c = texture2D(tDiffuse, vUv).rgb * 0.62 + texture2D(tDiffuse, vUv + px).rgb * 0.19 + texture2D(tDiffuse, vUv - px).rgb * 0.19;',
          ' } else c = texture2D(tDiffuse, vUv).rgb;',
          ' c += texture2D(tBloom, vUv).rgb * bloom;',
          ' c *= exposure * tint;',
          ' float l = dot(c, vec3(0.299, 0.587, 0.114));',
          ' c = mix(vec3(l), c, saturation);',
          ' c = (c - 0.5) * contrast + 0.5;',
          ' c = shoulder(c);',
          ' vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * vignette * 2.0;',
          ' if (retro > 0.5) {',
          // 6 bits per channel with 4x4 ordered dither on the internal pixel grid; slightly lifted blacks
          '  float d = bayer(vUv * srcSize);',
          '  c = floor(c * 63.0 + 0.5 + d) / 63.0;',
          '  c = c * 0.975 + 0.018;',
          ' } else c += (fract(sin(dot(vUv * 913.7 + time, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;',
          ' gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0); }',
        ].join('\n'),
        depthTest: false, depthWrite: false,
      }),
    };
  }

  function rtOpts() {
    return { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false };
  }
  function ensureTargets(renderer, w, h) {
    if (GFX.retro && h > GFX.retroHeight) { w = Math.max(1, Math.round(w * GFX.retroHeight / h)); h = GFX.retroHeight; }
    const msaa = GFX.quality === 'high' && renderer.capabilities.isWebGL2 && !!THREE.WebGLMultisampleRenderTarget;
    if (P.scene && P.w === w && P.h === h && P.msaa === msaa) return;
    P.scene && (P.scene.texture.minFilter = THREE.LinearFilter);
    ['scene', 'bright', 'b1', 'b2'].forEach((k) => { if (P[k]) P[k].dispose(); });
    const so = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false };
    if (msaa) { P.scene = new THREE.WebGLMultisampleRenderTarget(w, h, so); P.scene.samples = 4; }
    else P.scene = new THREE.WebGLRenderTarget(w, h, so);
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1), qw = Math.max(1, w >> 2), qh = Math.max(1, h >> 2);
    P.bright = new THREE.WebGLRenderTarget(hw, hh, rtOpts());
    P.b1 = new THREE.WebGLRenderTarget(qw, qh, rtOpts());
    P.b2 = new THREE.WebGLRenderTarget(qw, qh, rtOpts());
    P.w = w; P.h = h; P.msaa = msaa; P.retro = GFX.retro;
  }
  function pass(renderer, mat, target) {
    quad.material = mat;
    renderer.setRenderTarget(target);
    renderer.render(quadScene, quadCam);
  }

  const _size = new THREE.Vector2();
  // views: [{camera, rect:{x,y,w,h}}] in 0..1 canvas space (y measured from the top)
  GFX.render = function (renderer, scene, views) {
    renderer.getDrawingBufferSize(_size);
    const W = _size.x, H = _size.y;
    const cssW = W / renderer.getPixelRatio(), cssH = H / renderer.getPixelRatio();
    if (GFX.quality === 'low' || !hasCanvas) {
      // direct path
      if (views.length <= 1) {
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, cssW, cssH);
        renderer.render(scene, views[0].camera);
      } else {
        renderer.setScissorTest(true);
        for (const v of views) {
          const x = v.rect.x * cssW, w = v.rect.w * cssW, h = v.rect.h * cssH, y = cssH - (v.rect.y + v.rect.h) * cssH;
          renderer.setViewport(x, y, w, h); renderer.setScissor(x, y, w, h);
          renderer.render(scene, v.camera);
        }
        renderer.setScissorTest(false);
      }
      return;
    }
    if (!quad) makeQuad();
    ensureTargets(renderer, W, H);
    const rt = P.scene;
    const RW = P.w, RH = P.h;
    // scene views into the (multisampled) target
    if (views.length <= 1) {
      rt.viewport.set(0, 0, RW, RH); rt.scissorTest = false;
      renderer.setRenderTarget(rt);
      renderer.render(scene, views[0].camera);
    } else {
      for (const v of views) {
        const x = Math.round(v.rect.x * RW), w = Math.round(v.rect.w * RW), h = Math.round(v.rect.h * RH);
        const y = Math.round(RH - (v.rect.y + v.rect.h) * RH);
        rt.viewport.set(x, y, w, h); rt.scissor.set(x, y, w, h); rt.scissorTest = true;
        renderer.setRenderTarget(rt);
        renderer.render(scene, v.camera);
      }
      rt.scissorTest = false;
    }
    // bloom
    mats.bright.uniforms.tDiffuse.value = rt.texture;
    mats.bright.uniforms.threshold.value = GFX.bloomThreshold;
    pass(renderer, mats.bright, P.bright);
    const bl = mats.blur.uniforms;
    bl.tDiffuse.value = P.bright.texture; bl.dir.value.set(1 / P.b1.width, 0); pass(renderer, mats.blur, P.b1);
    bl.tDiffuse.value = P.b1.texture; bl.dir.value.set(0, 1 / P.b1.height); pass(renderer, mats.blur, P.b2);
    bl.tDiffuse.value = P.b2.texture; bl.dir.value.set(2 / P.b1.width, 0); pass(renderer, mats.blur, P.b1);
    bl.tDiffuse.value = P.b1.texture; bl.dir.value.set(0, 2 / P.b1.height); pass(renderer, mats.blur, P.b2);
    // composite to screen
    const f = mats.final.uniforms;
    f.tDiffuse.value = rt.texture; f.tBloom.value = P.b2.texture; f.bloom.value = GFX.bloomStrength; f.time.value = GFX.time % 100;
    f.exposure.value = GFX.exposure; f.retro.value = GFX.retro ? 1 : 0; f.srcSize.value.set(RW, RH);
    renderer.setRenderTarget(null);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, cssW, cssH);
    quad.material = mats.final;
    renderer.render(quadScene, quadCam);
  };

  GFX.setQuality = function (q) {
    GFX.quality = q;
  };
  GFX.setRetro = function (on) {
    GFX.retro = !!on;
    try { if (G.Save && G.Save.settings) { G.Save.settings.retro = GFX.retro; G.Save.persist && G.Save.persist(); } } catch (e) { /* ignore */ }
  };
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyG' && !e.repeat && !(e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) {
        GFX.setRetro(!GFX.retro);
        if (G.HUD && G.HUD.banner && G.Game && G.Game.state === 'race') G.HUD.banner(GFX.retro ? 'GAMECUBE FILTER ON' : 'FILTER OFF', 'info');
      }
    });
  }

  if (hasCanvas) {
    buildTextures();
    GFX.setEnvFromTheme();
  }
})();
