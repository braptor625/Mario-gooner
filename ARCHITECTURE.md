# TURBO TANDEM — Architecture Contract

An original browser kart racer that plays like a "Double Dash"-style game: **two riders per kart**
(front = driver, rear = item thrower), swap riders at any time, both riders hold one item each,
hop-drift with counter-steer mini-turbo charging, rocket starts, 8 racers, Grand Prix cups.
All characters, names, tracks and art are ORIGINAL (no Nintendo names/assets).

Plain classic `<script>` files (no modules, no build step). Three.js r128 is vendored at
`lib/three.min.js` and exposed as global `THREE`. Every module attaches to the global namespace
object `G` (created in `js/util.js`). **Never** use ES `import`/`export`.

Script load order (index.html):
```
lib/three.min.js, js/util.js, js/input.js, js/sound.js, js/characters.js, js/track.js,
js/kart.js, js/items.js, js/ai.js, js/ui.js, js/main.js
```
Nothing may run game logic at load time except defining things on `G`. `js/main.js` boots.

## Performance budget (target: locked 60 fps on a mid-range laptop)
- Physics/logic runs in a fixed 1/60 s step (`dt` is always `1/60` when `update(dt)` is called).
- Allocate nothing per frame in hot paths: reuse `THREE.Vector3` temporaries, pool particles/projectiles.
- Low-poly geometry; prefer `MeshLambertMaterial`/`MeshPhongMaterial` with `flatShading` and vertex colors.
  Merge static scenery or use `THREE.InstancedMesh`. Total draw calls for a race scene < ~250.
- One shadow-casting directional light max (shadow map 1024), or fake blob shadows (preferred for karts).
- No per-frame DOM layout thrash: HUD updates only change text/transform when values change.

## Coordinates & conventions
- Units are meters. Y is up. Ground is roughly y≈0 but tracks may have gentle elevation.
- A heading angle `h` (radians) means forward vector `(sin h, 0, cos h)`. A Three object facing +Z
  gets `object.rotation.y = h`.
- The RIGHT vector of heading h is `(-cos h, 0, sin h)` (Y-up right-handed: forward x up). Turning right
  therefore DECREASES h. Steering input `steer` in [-1, 1], **+1 = turn right** => `heading -= rate*steer*dt`.
- `track.query()` returns `lateral` (> 0 = right side of the road when driving forward) and the matching
  unit right vector `rx, rz`, consistent with the definition above.
- Speeds: base max speed 50cc = 22 m/s, 100cc = 26 m/s, 150cc = 30 m/s (`G.CC_SPEED[cc]`).

## `js/util.js` (owner: lead) — already written
`G.clamp, G.lerp, G.damp(a,b,lambda,dt), G.wrapAngle, G.rand(a,b), G.randInt, G.choice, G.weighted(obj)`,
`G.CC_SPEED`, `G.events` (tiny pub/sub: `G.events.on(name, fn)`, `G.events.emit(name, data)`),
`G.tmpV(i)` (scratch Vector3s), `G.makeTextSprite(text, color)`, `G.FIXED_DT`.
Fonts loaded in index.html (Google Fonts): "Bungee", "Bungee Shade", "Rubik" (500/700/900).

## `js/input.js` → `G.Input` (owner: haiku)
```
G.Input.init()
G.Input.poll()  // call once per fixed step; updates G.Input.state
G.Input.state = {
  accel: 0|1, brake: 0|1, steer: -1..1 (analog from gamepad, keys give ±1 smoothed),
  drift: bool (held), item: bool (held), itemPressed: bool (edge, true for one poll),
  itemReleased: bool (edge), swapPressed: bool (edge), lookBack: bool (held),
  throwBack: bool (held: down/back, throw items behind), pausePressed: bool (edge)
}
```
Keys: Arrows/WASD steer+accel/brake; Up/W accel also `X`/`J`; brake `S`/Down; drift = `Shift`/`Space`/`K`;
item = `E`/`L`/`Ctrl`; swap = `Q`/`Z`/`I`; pause `Esc`/`P`; look back `C`. Standard gamepad: A accel,
B brake, R1/R2 drift, L1/X item, Y swap, Start pause, left stick steer, stick down = throwBack.

## `js/sound.js` → `G.Sound` (owner: haiku) — fully procedural WebAudio, no files
```
G.Sound.init()            // creates AudioContext lazily; safe to call many times; resume on gesture
G.Sound.play(name, opts?) // opts {volume, pitch}
G.Sound.setEngine(speed01, boosting:bool, onRoad:bool)   // continuous player engine hum
G.Sound.playMusic(themeName) / G.Sound.stopMusic()  // themes: 'menu','meadow','dunes','glacier','starlight','results'
G.Sound.setMuted(bool), G.Sound.muted
```
names: menu_move, menu_select, menu_back, countdown, go, item_box, roulette, item_get, throw, drop,
shell_hit, banana_hit, spin, explosion, boost, mini_turbo1, mini_turbo2, drift_start, hop, swap,
bump, lap, final_lap, finish, star, lightning, fall, wall, heart, fireball, egg, coin_bonus.

## `js/characters.js` (owner: sonnet "art")
```
G.CHARACTERS = [{ id, name, weight: 'light'|'medium'|'heavy', special: itemId, colors:{primary,secondary,skin,accent}, partner: id }]  // 8 characters, 4 natural pairs
G.KARTS = [{ id, name, weight, speed:1-5, accel:1-5, handling:1-5, mass:1-5, color }]  // 3 per weight class = 9
G.Characters.buildRider(charId) -> THREE.Group   (~1.0 m tall chibi figure, faces +Z, origin at seat)
G.Characters.buildKart(kartId, frontCharId, rearCharId) ->
   { group, body, wheels:[fl,fr,rl,rr] (THREE.Object3D, spin on x), frontWheelPivots:[l,r] (steer on y),
     frontSeat:THREE.Object3D, rearSeat:THREE.Object3D, front:riderGroup, rear:riderGroup, exhausts:[Object3D] }
   // kart ~2.2 m long, 1.6 m wide, faces +Z, origin at ground level center. Riders are children of seats.
G.Characters.buildPortrait(charId) -> HTMLCanvasElement 128x128 (stylised 2D portrait for menus)
G.Characters.kartWeight(frontId, rearId) -> heaviest weight class of the pair
```
Characters (original): Blaze & Ember (medium, special 'fireball'), Rosa & Lily (light/medium,
'heart'), Pip & Pop (light, 'egg'), Grub (heavy, 'giant_banana') & Krag (heavy, 'mega_shell').

## `js/track.js` (owner: sonnet "track")
```
G.TRACKS = [{ id, name, cup, theme, laps:3, music }]  // 4 tracks: meadow, dunes, glacier, starlight
G.CUPS = [{ id, name, tracks:[ids] }]
class G.Track {
  constructor(trackId, scene)     // builds everything: road, offroad, walls, scenery, sky, fog, LIGHTS
  length                         // meters along centerline (closed loop)
  query(x, z, hint) -> RESULT     // hint = previous index (or -1) for O(1) local search
  pointAt(dist) -> {x, y, z, tx, tz (unit tangent), rx, rz (unit right), halfWidth}
  getStartGrid(n=8) -> [{x, y, z, heading}]  // index 0 = pole; staggered 2-wide behind start line
  itemBoxSpots -> [{x, y, z}]  (rows of 4-5 across the road, 4-6 rows per lap)
  minimap -> {points:[{x,z}], bounds:{minX,maxX,minZ,maxZ}}
  update(dt, time)               // animate scenery (water, flags, etc.)
  dispose()
}
RESULT (reused object, copy what you need) = { index, dist (0..length), lateral, halfWidth, wallDist,
  y (ground height), onRoad, surface: 'road'|'offroad'|'boost'|'jump'|'void',
  tx, tz (unit tangent), rx, rz (unit right) }
```
Karts beyond `wallDist` laterally must be pushed back (kart.js does it, using `rx,rz`).
`'void'` surface (only starlight / gaps) => kart falls & respawns. `'boost'` => dash pad.
`'jump'` => ramp gives a hop/trick boost. Start/finish line is at dist = 0; karts drive increasing dist.

## `js/kart.js` (owner: sonnet "kart")
```
class G.Kart {
  constructor({ scene, track, kartId, frontId, rearId, isPlayer, index, cc })
  // public state
  pos (THREE.Vector3), heading, speed, vel (THREE.Vector3), y
  mesh (THREE.Group), model (buildKart result)
  input = { accel, brake, steer, drift, itemPressed, itemReleased, item, swapPressed, throwBack }  // set by player Input or AI each step
  front, rear (character ids; rear = item thrower), stats {topSpeed, accel, handling, mass}
  heldItems = [rearItem|null, frontItem|null]  // index 0 belongs to rear rider = the one used
  itemCounts = [n, n]  // for triples
  roulette = [0, 0]      // >0 seconds remaining of roulette for each slot
  draggedItem = null     // item id held behind kart (managed by items.js)
  trackInfo (last query RESULT copy), trackIndex, lap, raceDist, lastDist, finished, finishTime, position
  drifting, driftDir, driftLevel (0 none, 1 blue, 2 orange/red), boostTimer, starTimer, shrinkTimer,
  spinTimer, invulnTimer, falling, speedMul (rubberband multiplier, default 1, set by AI)
  // methods
  update(dt)            // physics, drift, wall collision, surface effects, animation, particles
  swap()                // swap front/rear riders + items, with animation; also called on input.swapPressed
  hit(kind)             // 'spin' (banana/green shell), 'flip' (red shell, bomb, explosion), 'squish' (lightning/giant) ; ignored during star/invuln
  boost(seconds, power=1)  // mushroom/pad
  rocketStart(level)    // 0 none, 1 good, 2 perfect, -1 burnout (spin wheels 1s)
  isInvincible()
  respawn()
  getForward(out) -> out vector
  static resolveCollisions(karts)   // kart-kart bumping weighted by mass; star kart flips others
}
```
Drift ("Double Dash" style): press drift while steering & moving > 40% speed => hop + drift in that dir.
During drift, counter-steering wiggles (steer crossing toward the opposite side then back) add charge;
holding drift also slowly charges. Level 1 sparks blue → release drift = mini-turbo 0.7s;
In DD mini-turbo charging is by alternating stick; implement both (time + flicks).
Emits `G.events.emit('sound', name)` only for the player kart (isPlayer) — or call G.Sound.play directly
when `this.isPlayer`.

## `js/items.js` (owner: sonnet "items")
```
G.ITEMS = { id: { name, icon: '<emoji-free short label or SVG string>', color } }
ids: banana, shell_green, shell_green3, shell_red, shell_red3, mushroom, mushroom3, mushroom_gold,
     star, lightning, fake_box, bomb, spiny, + specials fireball, heart, egg, giant_banana, mega_shell
class G.ItemSystem {
  constructor(scene, track, karts)
  update(dt, time)      // item boxes (spin, respawn 3s), roulette ticking, projectiles, hazards,
                        // collisions with karts, handles each kart.input.itemPressed / itemReleased
  reset()
  getHazards() -> array of {x, z, radius, kind}  (for AI avoidance)
  dispose()
}
```
Rules: driving through an item box fills the first empty slot (rear first, then front) with a 1.5 s
roulette; item distribution weighted by `kart.position` (front-runners get bananas/green shells,
back-markers mushrooms/stars/lightning/spiny). Each character's special has a chance to appear only in
their own slot. Using: itemPressed uses `heldItems[0]` (rear rider). Bananas/shells/bombs can be HELD
behind (drag) while item is held, released to throw/drop. `throwBack` throws backwards. After use,
if slot 0 empty and slot 1 not, the items do NOT auto-move (same as DD: you must swap riders).

## `js/ai.js` (owner: sonnet "ai")
```
class G.AIController {
  constructor(kart, track, { skill: 0..1, cc })
  update(dt, ctx)   // ctx = { karts, items: ItemSystem, player: Kart, raceTime }
                    // writes kart.input; sets kart.speedMul for rubber-banding
}
```
Follows racing line using `track.pointAt(dist + lookahead)` with a per-AI lateral line offset, drifts
in tight corners (uses mini-turbos), avoids hazards, uses items sensibly (shells at kart ahead in range,
bananas behind when someone is close behind, mushrooms on straights), swaps riders when slot 0 empty
and slot 1 full.

## `js/ui.js` (owner: sonnet "ui") + `css/style.css`
Bespoke non-default visual design (see brief). Owns all DOM inside `#ui` root.
```
G.UI.init()
G.UI.showTitle()         // flow: Title → Mode (Grand Prix / Single Race / Time Trial) → CC → Character
                         //   pair select (pick 2: driver + thrower) → Kart select → Cup / Track select
                         //   → calls G.Game.start(config)
config = { mode: 'gp'|'race'|'tt', cc: 50|100|150, front, rear, kart, cup?, track? }
G.UI.hideMenus()
G.HUD.show() / G.HUD.hide()
G.HUD.update(s)  // s = { lap, laps, position, racerCount, time, lapTimes, items:[id|null,id|null],
                 //   counts:[n,n], roulette:[bool,bool], front, rear, speed01, driftLevel, boost:bool,
                 //   minimap:{ karts:[{x,z,color,isPlayer}] }, wrongWay:bool, finalLap:bool }
G.HUD.setMinimap(minimap)      // from track.minimap
G.HUD.countdown(n)             // 3,2,1,0='GO!'
G.HUD.banner(text, kind)       // 'lap','final','finish','info'
G.HUD.showResults(rows, opts, onContinue)   // rows [{pos, name, kartColor, time, points, total, isPlayer}]
G.UI.showPause(onResume, onRestart, onQuit) / G.UI.hidePause()
G.UI.showGPFinal(standings, onDone)   // trophy screen
```

## `js/main.js` (owner: lead) → `G.Game`
Fixed-step loop, renderer, chase camera, race state machine, countdown, rocket start, lap counting,
positions, GP points `[10,8,6,4,3,2,1,0]`, wiring of all modules.
