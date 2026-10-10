# Turbo Tandem

An original 3D kart racer for the browser in the style of *Double Dash*. Two riders share each kart: the driver steers and the thrower in the back uses the items. Either rider can hold an item, and you can swap them at any time. Racing has hop-drifts with wiggle-charged mini-turbos, rocket starts and 8-kart Grand Prix cups.

It's plain HTML, CSS and JS with Three.js r128 bundled in `lib/`. There is no build step and no audio files; all sound and music is generated in the browser.

## Run
Serve the folder over HTTP and open `index.html`:
```
npx http-server .   # or: python3 -m http.server
```

## Controls
| Action | Keyboard | Gamepad |
|---|---|---|
| Accelerate | ↑ / W / X | A |
| Brake / reverse | ↓ / S | B |
| Steer | ← → / A D | Left stick |
| Hop / drift (wiggle the steering to charge a mini-turbo) | Shift / Space | R1 / R2 |
| Use thrower's item (hold to drag it behind you, hold ↓ to throw backwards) | E / L / Ctrl | X / L1 |
| Swap riders (and their items) | Q / Z | Y |
| Look back | C | Back |
| Pause | Esc / P | Start |
| Mute | M | |
| FPS / perf overlay | F3 (or add `?fps` to the URL) | |

For a rocket start, press accelerate just as the "1" disappears.

## Content
- **8 characters** in 4 natural pairs, each pair with its own special item: Blaze & Ember (Fireballs), Rosa & Lily (Heart Shield), Pip & Pop (Mystery Egg), Grub & Krag (Mega Peel / Spiked Mega Shell).
- **9 karts** in light, medium and heavy classes. You choose from the class that matches the heavier of your two riders.
- **4 tracks**, in 2 cups:
  - Meadow Loop, Sunscorch Dunes, Glacier Pass and Starlight Ribbon make up the Comet Cup. Starlight Ribbon has no walls, so you can fall off.
  - The Nova Cup runs the same 4 tracks in reverse.
- **18 items**, including shells, seeker shells, spiked shells, peels, shrooms, superstar, thunderbolt and decoy boxes, plus the 5 character specials.
- **Modes:** Grand Prix, Single Race and Time Trial, each at 50cc, 100cc or 150cc.

## Performance
- The simulation runs at a fixed 60 Hz.
- On a sandboxed CPU it measured about 0.1–0.25 ms per simulation step and about 1.5–2.5 ms of CPU to submit each frame, at about 100 draw calls per frame.
- If frames run slow, the game lowers its render resolution automatically to hold 60 fps.

## Code layout
See `ARCHITECTURE.md` for the module contracts:
- `js/main.js` runs the race (loop, camera, race rules).
- `js/track.js`, `js/kart.js`, `js/items.js`, `js/ai.js`, `js/characters.js` build the game world, karts, items, opponents and characters.
- `js/ui.js` and `css/style.css` are the menus and HUD.
- `js/sound.js` and `js/input.js` handle audio and controls.
