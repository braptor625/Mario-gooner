# Turbo Tandem

An original 3D kart racer for the browser in the style of *Double Dash*. Two riders share each kart: the driver steers and the thrower in the back uses the items. Either rider can hold an item, and you can swap them at any time. Racing has hop-drifts with wiggle-charged mini-turbos, rocket starts and 8-kart Grand Prix cups.

It's plain HTML, CSS and JS with Three.js r128 bundled in `lib/`. There is no build step and no audio files; all sound and music is generated in the browser.

## Run
Serve the folder over HTTP and open `index.html`:
```
npx http-server .   # or: python3 -m http.server
```

## Controls
| Action | Keyboard (1P) | Xbox controller (wired or wireless) |
|---|---|---|
| Accelerate | ↑ / W / X | A or RT |
| Brake / reverse (↓ / S only brake when you are NOT holding gas — with gas held they aim item throws backwards) | ↓ / S | B or LT |
| Steer | ← → / A D | Left stick or D-pad |
| Hop / drift (hold through the turn until the sparks turn blue, then release for a mini-turbo; wiggling the steering charges faster) | Shift / Space | RB |
| Use the rear rider's item (hold to drag it behind you; hold down to throw it backwards) | E / L / Ctrl | X or LB |
| Swap riders (their items swap too) | Q / Z | Y |
| Slap a kart beside you | F | Right stick click |
| Look back | C | View |
| Pause | Esc / P | Menu |
| Menus | Arrows + Enter / Esc | D-pad or stick + A / B |
| Toggle GameCube video filter | G | |

The controller works in Chrome, Edge and Firefox. In Firefox on Linux it may not report the standard layout; that case is handled too. For a 2-player game on one keyboard, player 1 uses W/A/S/D, Left Shift, E and Q. Player 2 uses the arrows, Right Shift, Enter and comma. Every connected controller is assigned to a player.

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
