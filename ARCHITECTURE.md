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

---------------------------------------------------------------------------------------------------
# v2 — DOUBLE DASH PARITY (supersedes v1 where they conflict)

Goal: play exactly like *Mario Kart: Double Dash!!* (GameCube) — same rules, modes, structure, item set,
drift/mini-turbo technique, HUD layout, menu flow, 16 courses in 4 cups (+ All-Cup Tour), Mirror mode,
2–4 player split-screen, co-op (two players on one kart), Battle mode with 3 games, Time Trial with
ghosts, unlockables, award ceremony. **Characters, names, music melodies and art stay ORIGINAL**
(no Nintendo characters, likenesses, logos, music or ripped assets). Course layouts/themes may closely
follow the DD courses but use original names. Generic item names are fine (Mushroom, Banana,
Green Shell, Red Shell, Spiny Shell, Star, Lightning, Fake Item Box, Golden Mushroom, Bomb).

New script load order (index.html):
```
lib/three.min.js, js/util.js, js/save.js, js/input.js, js/sound.js, js/characters.js, js/track.js,
js/tracks/cup_mushroom.js, js/tracks/cup_flower.js, js/tracks/cup_star.js, js/tracks/cup_special.js,
js/kart.js, js/items.js, js/ai.js, js/ghost.js, js/battle.js, js/ceremony.js, js/ui.js, js/main.js
```

## Characters & karts (characters.js) — 20 characters, 10 pairs, 21 karts
| pair | weights | special (DD equivalent) |
|---|---|---|
| blaze / ember | medium, medium | `fireball` (Mario/Luigi) |
| rosa / lily | medium, medium | `heart` (Peach/Daisy) |
| pip / pop | medium, medium | `egg` (Yoshi/Birdo) |
| grub / nib | heavy, light | `giant_banana` (DK/Diddy) |
| krag / krik | heavy, light | `mega_shell` (Bowser/Bowser Jr) |
| volt / vex | heavy, heavy | `bomb` (Wario/Waluigi) |
| shelby / swoop | light, light | `shell_triple` (Koopa/Paratroopa: triple green OR triple red) |
| bitsy / bop | light, light | `chomp` (Baby Mario/Luigi: Chain Chomp) |
| spud / sprout | light, light | `mushroom_gold` (Toad/Toadette) — **unlockable** |
| thorn / wisp | heavy, heavy | `all` (Petey/King Boo: any special) — **unlockable** |
`G.CHARACTERS[i] = { id, name, weight, special, partner, colors, tagline, locked: bool }`.
`G.KARTS`: 21 karts = 7 light, 7 medium, 7 heavy; 6 of each class are "signature" karts (`owner: charId`,
two per pair spread over its classes) and one `parade` kart with `weight: 'any'` usable by every pair
(unlockable). ~1/3 of karts have `locked: true` (unlocked via G.Save). DD rule: the kart class equals the
HEAVIER rider; a pair may only pick karts of that class (or 'any').
`G.Characters.buildKart(kartId, frontId, rearId)` unchanged API (+ `parade`). New:
`G.Characters.buildTrophy(kind: 'gold'|'silver'|'bronze') -> THREE.Group` (used by ceremony / UI).

## Save / unlocks (js/save.js) → `G.Save`
```
G.Save.data                       // persisted JSON in localStorage key 'tt-save-v2' (try/catch everywhere)
G.Save.isUnlocked(key) / unlock(key) / unlockAll()     // keys: 'char:spud', 'kart:parade', 'cup:special',
                                                       //  'cup:allcup', 'cc:mirror', 'cc:150'
G.Save.recordGP(cupId, cc, place) -> [newlyUnlockedKeys]   // applies the unlock rules below
G.Save.bestTime(trackId) / bestLap(trackId) / setRecord(trackId, total, lap, ghostData) -> bool improved
G.Save.ghost(trackId) -> ghostData | null
G.Save.settings  { musicVol, sfxVol, itemFreq:'normal', ... }  + G.Save.persist()
```
Unlock rules (DD-like, simplified): start with Mushroom/Flower/Star cups at 50/100cc. Gold any cup at 100cc →
150cc. Gold Mushroom+Flower+Star (any cc) → Special Cup. Gold Special → All-Cup Tour. Gold All-Cup Tour at
150cc → Mirror. Each GP gold at 100cc+ unlocks the next locked kart; gold Special 150cc → spud/sprout;
gold All-Cup 150 → thorn/wisp + parade kart. Options menu has "Unlock everything".

## Input (input.js) — multiplayer
```
G.Input.players[0..3] = { state: {same fields as v1 state}, device: 'kb1'|'kb2'|'kbfull'|'pad0'..'pad3'|null }
G.Input.state  // alias of players[0].state (v1 compatible)
G.Input.configure(count)   // 1P: kbfull (all keys) + pad0; 2P: P1 kb1 (WASD set) or pad0, P2 kb2 (arrows set) or pad1; 3-4P: pads (kb1/kb2 for first two if fewer pads)
G.Input.poll()             // polls all players
```
kb1 (left hand): W/S/A/D, drift LeftShift, item E (throwBack = S held), swap Q, look-back C, pause Esc.
kb2 (right hand): arrows, drift RightShift or '/', item Enter or '.', swap ',' or RightCtrl, pause Backspace/P.

## Track engine (track.js) — registry + hooks (lead writes core)
```
G.defineTrack(def)        // called by js/tracks/cup_*.js
G.TRACKS  // [{id, name, cup, order, theme, laps, music, preview:{sky, ground, road}}]  (derived from defs)
G.CUPS    // mushroom, flower, star, special (+ 'allcup' virtual = all 16 in order)
new G.Track(trackId, scene, { mirror: bool })
track.laps                // per-course lap count (Baby-Park-like oval = 7, Colosseum-like = 2)
track.query(x, z, hint, y?)  // y optional: disambiguates stacked roads (overpasses)
RESULT += { surface: 'road'|'offroad'|'sand'|'grass'|'mud'|'water'|'ice'|'boost'|'jump'|'cannon'|'void',
            cannonTo (dist), cannonHeight }   // offroad flavours slow differently; 'ice' = road speed, low grip
track.getHazards() -> [{ x, y, z, radius, hitKind: 'spin'|'flip'|'squish'|'bump', vx, vz }]  // world space, reused
track.mirror (bool)
```
def = { id, name, cup, order (1-4), laps, music, seed, hw, shoulder, scale,
  theme: { sky:[top,mid,bottom], fog:[color,near,far], ground, shoulder, road:[a,b], curb:[a,b],
           hemi:[sky,ground,intensity], sun:[color,intensity], emb, bg }  OR a built-in key
           ('meadow'|'dunes'|'glacier'|'starlight'),
  offroad: 'offroad'|'sand'|'grass'|'mud'|'water'  (shoulder surface), noWalls, walls: 'fence'|'barrier'|'none',
  pts: [[x, z, y?, halfWidth?], ...]   (closed loop, first point = start line),
  pads:[{d,len,l,w}], jumps:[{d,len,l,w}], cannons:[{d,len,l,w,to,height}],
  zones:[{d,len,l,w,surface}]   // road-area surface overrides (ice sheet, mud patch, water, void pit)
  itemRows: [{d, count, double?:bool}]  (optional; default auto),
  decorate(track, kit)   // build scenery with kit (see below). Use kit.at(d, lateral, dy) for positions.
  hazards(track, kit) -> [hazard]   // moving obstacles; hazard = { x,y,z, radius, hitKind, vx, vz,
                                    //   update(dt, time), object3D }  (coordinates in track build space)
}
kit = { Batch (tri/quad/box(cx,y0,cz,sx,sy,sz,ry,color)/frustum(x,y0,z,r0,r1,h,sides,color,rot)/blob(x,y,z,sx,sy,sz,color,detail)),
        col(hex)->[r,g,b], mix, mul, hsl(h,s,l), rng() (seeded), theme (resolved theme cfg), length, groundY,
        N, ds, px/py/pz/hw/curv (Float32Arrays of centerline samples, 1 sample ≈ ds m),
        at(d, lateral, dy) -> [x,y,z] (build space), frame(d) -> {x,y,z,tx,tz,rx,rz,halfWidth},
        mesh(batch, matOpts?, basic?) -> merged vertex-colored Mesh (Lambert, or MeshBasic if basic), added + auto-disposed,
        mat(opts, basic?) -> tracked material, add(object3D) (adds under the track root, auto-removed),
        trackGeom(g)/trackMat(m) (register for disposal), scatter(count, off0, off1, margin, cb(x,z,i,rng)),
        farScatter(count, minD, cb(x,z,rng)), clear(x,z,m) -> bool (no road within m), reserve(x,z,r),
        follow(obj, spin) (camera-locked backdrop), makeCanvasTexture(w,h,draw(ctx,w,h)), time }
track.setZoneActive(zoneId, bool) toggles zones that have an `id` (e.g. tides). def.update(track, dt, time)
optional per-frame hook. def.style ∈ meadow|dunes|glacier|starlight reuses that built-in road/wall look
('starlight' = rainbow road slab, no walls); def.walls 'fence'|'adobe'|'barrier'|'none', def.wallColors
[hexA, hexB]; def.ground:false (no ground plane), def.startArch:false, def.snow:true (snowfall).
Mirror mode: the whole built world lives in one root Group scaled x = -1; query/pointAt/start grid/
itemBoxSpots/minimap/getHazards are converted to mirrored world space by the core — content code never
needs to care about mirroring.

## Kart (kart.js) — DD feel changes
- DD power-slide: hop then slide; mini-turbo charges ONLY by counter-steering wiggles (steer from the
  drift side across to the opposite side and back = 1 flick). Sparks: none → yellowish → BLUE after 2
  flicks (fast flicks ~0.18 s each). Release while blue → mini-turbo (0.75 s). Only one spark level
  (driftLevel 0/1; 1 = blue). Holding the drift alone never charges.
- Surfaces per v2 RESULT. 'cannon' → fly in an arc along the track to `cannonTo` (no control).
  'ice' = low grip slide. 'water' = splash & slow; deep water is 'void'.
- Slipstream (drafting): directly behind a kart (<18 m, within ~12°) above 70% speed for 1.2 s →
  wind streaks then 1.2 s boost.
- Slap (DD rear-rider attack): `input.slapPressed` (edge) OR itemPressed with BOTH slots empty → rear rider
  swings; any kart within 3 m to the side gets bumped sideways and, if its slot 0 has an item and ours
  is empty, the item is stolen. Animation on model.rear.
- Rescue: falling into 'void' → an original propeller rescue-drone (simple model) lowers the kart back
  onto the road (1.6 s), like DD's Lakitu.
- Track hazards: main.js calls `kart.hit(h.hitKind)` or `kart.bump(vx, vz)` (new method: shove +
  speed loss, no item loss) on contact.
- `kart.query` calls must pass this.pos.y as the 4th arg.
- Co-op: `kart.coop = {driver: playerIdx, thrower: playerIdx}`; swap() also swaps these (main reads it).
- Ghost mode: `new G.Kart({..., ghost: true})` → translucent, no collisions, no audio (used by ghost.js).

## Items (items.js) — DD item set
Normal pool ONLY: banana, shell_green, shell_red, mushroom, fake_box, star, lightning, spiny.
Specials (only appear in a slot whose rider owns them; `all` = random special): fireball, heart, egg,
giant_banana, mega_shell, bomb, shell_triple (→ shell_green3 or shell_red3), chomp, mushroom_gold.
DD probabilities: specials appear with decent weight for each character (≈20%); star/lightning/spiny
only for back positions; 1st place mostly bananas/green shells/fake boxes.
- Item box gives ONE item to the rear slot if empty else the front slot. Double item boxes (track
  itemRows double:true, rendered as two stacked/side-by-side boxes) fill BOTH slots.
- When a kart is hit and loses items (event 'kartLostItems' with {kart, items:[ids]}), the items are
  dropped on the track as pickups other karts can collect (spinning item icons, 15 s life).
- chomp: a big black ball-and-chain biter drags the kart along the track centerline at ~1.4x top speed
  for 6 s, steering itself, flipping karts it touches.
- `G.ItemSystem(scene, track, karts, { mode: 'race'|'balloon'|'shine'|'bomb', boxes: bool })`;
  'bomb' mode: every box gives bombs; up to 5 bombs carried (itemCounts).
- Emits `G.events.emit('itemHit', {victim, kind, attacker, item})` (battle mode uses it to pop balloons).

## Battle (js/battle.js) → `G.Arena` + `G.BattleMode` + `G.BattleAI`
4 original arenas (DD equivalents: Cookie Land, Block City, Pipe Plaza, Tilt-a-Kart-ish/GameCube-ish).
`G.ARENAS = [{id, name, music}]`. `new G.Arena(id, scene)` implements the Track interface
(query/pointAt/getStartGrid/itemBoxSpots/minimap/update/dispose/getHazards/length/theme/sun) for an
enclosed field (see battle prompt for the wall/lateral trick).
`new G.BattleMode(game, { type: 'balloon'|'shine'|'bomb', arena, entrants })`, methods:
`step(dt)`, `hudState(kart) -> {balloons, shineTime, score, ...}`, `isOver()`, `results()`.
Battle games: Balloon Battle (3 balloons, pop by any hit, last kart standing / most balloons after 3 min);
Shine Thief (grab the shine, hold 55 s total; getting hit drops it); Bomb Blast (item boxes give bombs,
3 points to win, hits score points).

## Ghosts (js/ghost.js) → `G.Ghost`
`G.Ghost.Recorder(kart)` .sample() each step (every 2nd step stores x,y,z,heading,driftYaw,steer),
`.finish() -> data` (compact arrays, ≤ ~200 KB); `new G.Ghost.Player(scene, data, kartInfo)` .update(t)
spawns a translucent kart (G.Kart ghost:true or buildKart) and interpolates.

## Ceremony (js/ceremony.js) → `G.Ceremony`
`G.Ceremony.play({ scene, camera, standings (top 3 with front, rear, kart), playerPlace }, onDone)`
builds its own temporary 3D podium stage (night sky, spotlights, confetti, fireworks), places the top-3
karts + riders on a podium, trophy model presented to 1st, camera choreography ~12 s, skippable with
Enter/click. `G.Ceremony.update(dt)` called by main each frame; `G.Ceremony.active`.

## UI (ui.js) — DD flow, DD HUD layout
Title → Main menu: GRAND PRIX · TIME TRIAL · VERSUS · BATTLE · RECORDS · OPTIONS.
GP: player count 1-2 (co-op toggle when 2: "Same kart (co-op)" / "Separate karts") → cc (50/100/150/
Mirror, locked ones shown locked) → character pairs per player → kart per player (3D turntable preview
via a small secondary renderer) → cup (Mushroom/Flower/Star/Special/All-Cup Tour; locked shown locked).
Versus: 2-4 players (co-op pairs allowed), item frequency, course select (all 16, by cup).
Battle: 2-4 players (+ optional CPU fill), game type, arena. TT: course + ghost toggle.
`G.HUD` stays the 1-player singleton AND `G.HUD.create(index, count) -> hudInstance` for split-screen
(same methods: update/countdown/banner/setMinimap/show/hide; instance occupies its viewport quadrant:
2P = top/bottom halves, 3-4P = quadrants). DD HUD layout: item slots TOP-LEFT (big rear-rider slot,
smaller front-rider slot, character face icons next to them), lap + time TOP-RIGHT, position BOTTOM-RIGHT
(big), minimap RIGHT side (vertical), lap counter as "LAP 1/3". Battle HUD: balloons/shine timer/score.

---------------------------------------------------------------------------------------------------
# v3 — GAMECUBE-ERA GRAPHICS OVERHAUL
Target look: Double Dash on GameCube — saturated, glossy, smooth-shaded toy-like models, shiny kart paint
with environment reflections, soft bloom on bright surfaces, warm color grading, textured (not flat)
ground/road surfaces, soft round particles, clean anti-aliasing. Still locked 60 fps on mid-range GPUs.

## js/gfx.js (lead) → `G.GFX` (loaded right after util.js; every consumer must guard `G.GFX &&`)
```
G.GFX.quality            // 'high' | 'medium' | 'low' (auto-adjusted by main.js)
G.GFX.envMap             // equirect THREE.Texture (sky/studio gradient) for glossy reflections (mapping set)
G.GFX.tex.soft           // radial soft-dot CanvasTexture for Points/Sprites (smoke, dust, sparks)
G.GFX.tex.spark          // 4-point star sparkle
G.GFX.tex.detail         // tiling grayscale detail noise (RepeatWrapping)
G.GFX.tex.asphalt / grass / sand / snow / dirt   // tiling color-neutral-ish detail textures (RepeatWrapping)
G.GFX.shiny(opts) -> THREE.MeshPhongMaterial  // glossy toy paint: envMap, reflectivity ~0.25, shininess 60-90,
                                               // specular 0x555555, vertexColors if opts.vertexColors; registers rim light
G.GFX.patchRim(material, {color, strength, power})   // fresnel rim light (characters, karts, items)
G.GFX.patchDetail(material, {scale=0.35, strength=0.35, macro=0.18})  // world-space detail texture
                                               // modulation for big vertex-colored meshes (terrain, road, walls)
G.GFX.water(opts{color, deep, opacity}) -> ShaderMaterial (animated waves, specular sun glint, fresnel)
G.GFX.time               // seconds, advanced by main each frame (shader uniforms update automatically)
G.GFX.setSun(dirVector3, colorHex)   // tracks call when building lights (water glints, lens flare)
G.GFX.render(renderer, scene, views) // post pipeline: MSAA scene RT → bloom → grade/vignette → screen
```
Shadows (quality high, single-view): renderer.shadowMap PCFSoft; track.sun.castShadow handled by main;
kart meshes castShadow=true, road/ground/scenery meshes receiveShadow=true (big props castShadow true).

---------------------------------------------------------------------------------------------------
# v4 — ITEM ACCURACY + LIVELINESS
## Launchable hazards (track.js engine + js/tracks/cup_*.js)
`track.launchHazard(ref, vx, vy, vz) -> bool` — `ref` is the hazard object from a course's hazards()
(getHazards() entries carry `.ref`). A launched hazard stops colliding, flies ballistically with tumble
spin (gravity ~30), shrinks/fades out when it lands or after ~2.5 s, then respawns at its normal
behaviour after ~4 s (pop-in scale). Hazards may implement their own `launch(vx,vy,vz)` (needed when
they're drawn via a shared InstancedMesh) — the engine calls it if present, else animates `object3D`.
`hazard.launchable === false` opts out (e.g. giant stomping legs, crushers, geysers, fire bars).
main.js calls launchHazard when a STAR kart (or a chomp-dragged kart) touches a hazard; items.js calls
it when a mega shell / chomp / star-ish projectile hits one. Event: G.events.emit('hazardLaunched', {ref, x, z}).

## Hit reactions (kart.js) — DD accurate
- 'spin' (banana, green shell? no — see items): kart spins 1–2 times in place, keeps a little speed.
- 'flip' (shells, star contact, bomb, chomp, fireball? no): kart is knocked UP into the air and
  tumbles/rolls (barrel-roll + flip, ~1.3 s), lands with a bounce; riders flail; stars circle heads.
- 'squish' (lightning shrink trample / crushers): flattened then pops back.
