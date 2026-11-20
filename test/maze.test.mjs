import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLevel, bfs } from '../src/maze.js';

const SIZES = [[56, 114], [62, 130], [300, 180], [120, 120]];
const levels = function* () {
  for (const [width, height] of SIZES) for (let level = 1; level <= 20; level++) for (const seed of [1, 7, 42]) {
    yield buildLevel({ width, height, level, seed });
  }
};

const rectDist = ([x0, y0, x1, y1], x, y) =>
  Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1));

test('every cell is reachable and the path joins start to goal', () => {
  for (const lv of levels()) {
    const { dist } = bfs(lv.walls, lv.cols, lv.rows, 0);
    assert.ok(dist.every((d) => d >= 0));
    assert.equal(lv.path[0], 0);
    const last = lv.path[lv.path.length - 1];
    assert.equal(lv.goal.x, (last % lv.cols + 0.5) * lv.cs);
    assert.ok(lv.path.length >= Math.min(lv.cols, lv.rows));
  }
});

test('holes sit on the floor, apart from each other and the start', () => {
  for (const lv of levels()) {
    for (const h of lv.holes) {
      assert.ok(h.r > lv.r * 1.15, 'ball must fit through the hole');
      for (const rc of lv.rects) assert.ok(rectDist(rc, h.x, h.y) >= h.r - 1e-6, 'hole cut into a wall');
      assert.ok(Math.hypot(h.x - lv.start.x, h.y - lv.start.y) > h.r + lv.r * 2);
    }
    for (let i = 0; i < lv.holes.length; i++) for (let j = i + 1; j < lv.holes.length; j++) {
      const a = lv.holes[i], b = lv.holes[j];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > a.r + b.r);
    }
  }
});

test('the guide line keeps the ball clear of holes and walls', () => {
  for (const lv of levels()) {
    const pts = lv.guide;
    for (let i = 1; i < pts.length; i++) {
      for (let k = 0; k <= 20; k++) {
        const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k / 20;
        const y = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k / 20;
        for (const h of lv.holes) if (!h.goal) assert.ok(Math.hypot(x - h.x, y - h.y) >= h.r, `level ${lv.level}: guide crosses a hole`);
        for (const rc of lv.rects) assert.ok(rectDist(rc, x, y) >= lv.r * 0.99, `level ${lv.level}: guide hits a wall`);
      }
    }
  }
});

test('same inputs give the same maze', () => {
  const a = buildLevel({ width: 60, height: 120, level: 5, seed: 3 });
  const b = buildLevel({ width: 60, height: 120, level: 5, seed: 3 });
  assert.deepEqual(a.holes, b.holes);
  assert.deepEqual([...a.walls], [...b.walls]);
});
