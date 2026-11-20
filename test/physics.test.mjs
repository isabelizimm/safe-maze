import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLevel } from '../src/maze.js';
import { createBall, step, SUBSTEP } from '../src/physics.js';

const rectDist = ([x0, y0, x1, y1], x, y) =>
  Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1));

test('a ball on a level board stays put', () => {
  const lv = buildLevel({ width: 60, height: 120, level: 1 });
  const b = createBall(lv);
  for (let i = 0; i < 2000; i++) step(b, lv, 0, 0, SUBSTEP, []);
  assert.equal(b.x, lv.start.x);
  assert.equal(b.y, lv.start.y);
});

test('rolling under hard random tilts never goes through a wall', () => {
  const lv = buildLevel({ width: 60, height: 120, level: 8, seed: 5 });
  lv.holes = [];
  const b = createBall(lv);
  let gx = 0, gy = 0, hits = 0;
  for (let i = 0; i < 30000; i++) {
    if (i % 400 === 0) { gx = (Math.sin(i * 12.9898) * 2 - 1) * 6000; gy = (Math.cos(i * 78.233) * 2 - 1) * 6000; }
    const ev = [];
    step(b, lv, gx, gy, SUBSTEP, ev);
    hits += ev.length;
    for (const rc of lv.rects) assert.ok(rectDist(rc, b.x, b.y) >= lv.r - 1e-3, `penetration at step ${i}`);
  }
  assert.ok(hits > 10);
});

test('a ball tilted toward a hole falls in and comes back to the start', () => {
  const lv = buildLevel({ width: 60, height: 120, level: 1 });
  lv.rects = [];
  lv.holes = [{ x: lv.start.x + 20, y: lv.start.y, r: lv.r * 1.4 }];
  const b = createBall(lv);
  const ev = [];
  for (let i = 0; i < 3000 && !ev.some((e) => e.type === 'respawn'); i++) step(b, lv, 300, 0, SUBSTEP, ev);
  assert.deepEqual(ev.map((e) => e.type), ['fall', 'respawn']);
  assert.equal(b.x, lv.start.x);
});

// Steer the ball along the guide line with a gentle controller: every level must be playable.
function autopilot(lv, seconds = 120) {
  const b = createBall(lv);
  let target = 1;
  for (let i = 0; i < seconds / SUBSTEP; i++) {
    const [tx, ty] = lv.guide[Math.min(target, lv.guide.length - 1)];
    const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy);
    if (d < lv.cs * 0.12 && target < lv.guide.length - 1) target++;
    const speed = Math.min(60, d * 4);
    let gx = ((dx / (d || 1)) * speed - b.vx) * 40, gy = ((dy / (d || 1)) * speed - b.vy) * 40;
    const m = Math.hypot(gx, gy), cap = 0.25 * 9810;
    if (m > cap) { gx *= cap / m; gy *= cap / m; }
    const ev = [];
    step(b, lv, gx, gy, SUBSTEP, ev);
    if (ev.some((e) => e.type === 'fall')) return 'fell';
    if (b.mode === 'won') return 'won';
  }
  return 'timeout';
}

test('every level can be finished by following the guide line', () => {
  for (const [w, h] of [[56, 114], [300, 180]]) for (let level = 1; level <= 15; level++) {
    const lv = buildLevel({ width: w, height: h, level, seed: 11 });
    assert.equal(autopilot(lv), 'won', `level ${level} at ${w}x${h}`);
  }
});
