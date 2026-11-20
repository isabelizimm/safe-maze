# Maze

A wooden labyrinth marble game for your phone. Tilt it to roll a steel ball along the line to the brass hole. Any other hole swallows the ball and sends it back to the start.

Open it on a phone and tap Play. On iOS, allow motion access. For true fullscreen, use Share → Add to Home Screen (iOS) or Install app (Android). The board is fixed to the glass, so rotating the phone does not turn the maze. The way you hold the phone when you tap Play counts as level. To reset that, use Level the board in the menu.

## How it works

- The ball is simulated in real units: millimetres, 9.81 m/s², and the physical size of your screen. It rolls like a solid sphere, at 5/7 of the acceleration of a sliding one, with rolling resistance for steel on wood. It bounces off the walls with a restitution of 0.45, and every step is 1 ms, so a fast ball can't pass through a wall.
- A ball over a hole rests on the rim, which pushes it toward the centre. A fast ball can skim across the edge of a hole. A slow one drops in.
- Every level is generated from a seed. A recursive backtracker carves long corridors, and from level 3 on, some dead ends open up into loops. The goal is the cell farthest from the start. Holes sit at the side of straight corridors on the path, which leaves a gap that narrows as the levels go up, and fill dead ends off the path. The guide line runs through the middle of each gap.
- The light stays fixed in the room, so as you tilt, the wall shadows move and the highlight on the ball moves with them.
- The sound is synthesised from the ball's motion: a rumble that rises with speed, a knock for each wall hit that scales with how hard it lands, and a thunk when the ball drops into a hole. A ball at rest makes no sound. On Android, harder wall hits also vibrate the phone.
- Best times and unlocked levels are stored in `localStorage`. The maze depends on the screen size, so the same level number is a different maze on another device.

## Develop

No build step. Serve the folder over HTTP:

```sh
python3 -m http.server 8000
```

On desktop, tilt with the arrow keys or WASD, or drag the board. R restarts the level and Esc opens the menu.

Query parameters: `level=<n>`, `seed=<n>` (another set of mazes), `ppi=<CSS px per inch>` (default 160 on touch screens, 96 otherwise), `flip` (reverses the accelerometer if the ball rolls uphill on your device), and `test` (exposes `window.maze` for poking at the state).

```sh
npm test
```

The tests check that every maze is connected, that holes never cut into walls or crowd the start, that the guide line clears every hole and wall, that the ball never passes through a wall under random hard tilts, and that a simple autopilot following the guide line can finish levels 1–15 on a phone-sized board and a desktop-sized board.
