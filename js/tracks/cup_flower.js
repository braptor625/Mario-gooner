// Flower Cup: Bayside Bridge, Castle Circuit, Daydream Cruiser, Mudslide Stadium.
(function () {
  'use strict';
  const G = (window.G = window.G || {});
  const PI = Math.PI;
  function arc(cx, cz, r, a0, a1, n, y, hw) {
    const out = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r, y, hw]); }
    return out;
  }

  // ===================================================================== 1 BAYSIDE BRIDGE
  const BB_PTS = [
    [0, 0, 0, 12], [70, 0, 0], [140, 0, 2.5], [215, 0, 6], [270, 0, 8.5], [370, 0, 9.5], [450, 0, 9.5], [520, 0, 9],
    [565, 8, 7.2], [610, 35, 4], [640, 85, 1], [635, 140, 0], [600, 185, 0], [540, 205, 0], [470, 190, 0], [400, 215, 0],
    [330, 230, 0], [260, 205, 0], [190, 215, 0], [120, 250, 0], [60, 235, 0], [10, 185, 0], [-35, 120, 0], [-40, 55, 0], [-25, 15, 0],
  ];
  // ===================================================================== 2 CASTLE CIRCUIT
  const CC_PTS = (function () {
    const a = [[0, 0, 0, 12], [100, 0, 0], [200, 5, 0], [280, 30, 0], [330, 80, 0], [345, 150, 0], [320, 215, 0], [270, 262, 0], [225, 272, 0, 11]];
    for (let x = 190; x >= 40; x -= 30) a.push([x, 272 + 26 * Math.sin(((220 - x) / 180) * PI * 2), 0, 9.5]);
    a.push([5, 262, 0, 11], [-45, 215, 0], [-68, 145, 0], [-70, 75, 0], [-48, 20, 0]);
    return a;
  })();
  // ===================================================================== 3 DAYDREAM CRUISER
  const DC_PTS = (function () {
    const R = 70, Y = 8.5, a = [];
    a.push([60, -R, Y, 12], [130, -R + 8, Y], [200, -R - 4, Y], [270, -R, Y], [340, -R, Y]);
    arc(400, 0, R, -PI / 2, PI / 2, 6, Y).forEach((p, i) => { if (i > 0 && i < 6) a.push(p); });
    a.push([400, R, Y]);
    a.push([345, R, 4.3], [290, R, 0.2], [235, R, 0], [180, R, 0], [125, R, 0.2], [70, R, 4.3], [10, R, Y]);
    arc(-20, 0, R, PI / 2, PI * 1.5, 6, Y).forEach((p, i) => { if (i > 0 && i < 6) a.push(p); });
    a.push([-5, -R, Y]);
    return a;
  })();
  // ===================================================================== 4 MUDSLIDE STADIUM
  const MS_PTS = (function () {
    const a = [], hw = 11;
    const hill = (x0, z, dir, h) => [[x0, z, 0.3], [x0 + dir * 30, z, h * 0.3], [x0 + dir * 55, z, h * 0.9], [x0 + dir * 68, z, h], [x0 + dir * 100, z, 0.4]];
    const part = (arr) => arr.forEach((p) => a.push(p));
    a.push([0, 0, 0, hw], [60, 0, 0]);
    part(hill(90, 0, 1, 3.2));
    arc(220, 40, 40, -PI / 2, PI / 2, 4, 0).slice(0, 4).forEach((p, i) => { if (i > 0) a.push(p); });
    a.push([220, 80, 0], [190, 80, 0]);
    part(hill(170, 80, -1, 3));
    a.push([60, 80, 0]);
    arc(40, 120, 40, -PI / 2, -3 * PI / 2, 4, 0).forEach((p, i) => { if (i > 0 && i < 4) a.push(p); });
    a.push([40, 160, 0], [70, 160, 0.3]);
    part(hill(100, 160, 1, 4.6));
    arc(220, 200, 40, -PI / 2, PI / 2, 4, 0).forEach((p, i) => { if (i > 0 && i < 4) a.push(p); });
    a.push([220, 240, 0], [140, 240, 0], [60, 240, 0], [-10, 240, 0], [-60, 215, 0], [-90, 160, 0], [-92, 90, 0], [-70, 30, 0]);
    return a;
  })();

  const defs = [
    { id: 'bayside_bridge', name: 'Bayside Bridge', order: 1, music: 'bridge', seed: 101, hw: 12, shoulder: 5, pts: BB_PTS, scale: 0.93 },
    { id: 'castle_circuit', name: 'Castle Circuit', order: 2, music: 'classic', seed: 202, hw: 12, shoulder: 5, pts: CC_PTS },
    { id: 'daydream_cruiser', name: 'Daydream Cruiser', order: 3, music: 'cruise', seed: 303, hw: 12, shoulder: 5, pts: DC_PTS },
    { id: 'mudslide_stadium', name: 'Mudslide Stadium', order: 4, music: 'stadium', seed: 404, hw: 11, shoulder: 5, pts: MS_PTS, offroad: 'mud' },
  ];
  defs.forEach((d) => G.defineTrack(Object.assign({ cup: 'flower', laps: 3, scale: 1, theme: 'meadow', pads: [], jumps: [] }, d)));
})();
