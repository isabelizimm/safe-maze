// Maze generation and level geometry. Pure functions, no DOM, all lengths in millimetres.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const N = 1, E = 2, S = 4, W = 8;
// [bit, dx, dy, opposite bit]
const DIRS = [[N, 0, -1, S], [E, 1, 0, W], [S, 0, 1, N], [W, -1, 0, E]];
const bits = (v) => (v & 1) + ((v >> 1) & 1) + ((v >> 2) & 1) + ((v >> 3) & 1);

// Recursive backtracker: long winding corridors, then optionally open some dead ends into loops.
export function carve(cols, rows, rand, braid = 0) {
  const walls = new Uint8Array(cols * rows).fill(15);
  const seen = new Uint8Array(cols * rows);
  const inside = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;
  const stack = [0];
  seen[0] = 1;
  while (stack.length) {
    const c = stack[stack.length - 1];
    const x = c % cols, y = (c / cols) | 0;
    const opts = DIRS.filter(([, dx, dy]) => inside(x + dx, y + dy) && !seen[(y + dy) * cols + x + dx]);
    if (!opts.length) { stack.pop(); continue; }
    const [bit, dx, dy, opp] = opts[(rand() * opts.length) | 0];
    const n = (y + dy) * cols + x + dx;
    walls[c] &= ~bit;
    walls[n] &= ~opp;
    seen[n] = 1;
    stack.push(n);
  }
  if (braid > 0) {
    for (let c = 1; c < cols * rows; c++) {
      if (bits(walls[c]) !== 3 || rand() >= braid) continue;
      const x = c % cols, y = (c / cols) | 0;
      const opts = DIRS.filter(([bit, dx, dy]) => (walls[c] & bit) && inside(x + dx, y + dy));
      const [bit, dx, dy, opp] = opts[(rand() * opts.length) | 0];
      walls[c] &= ~bit;
      walls[(y + dy) * cols + x + dx] &= ~opp;
    }
  }
  return walls;
}

export function bfs(walls, cols, rows, from) {
  const dist = new Int32Array(cols * rows).fill(-1);
  const prev = new Int32Array(cols * rows).fill(-1);
  const queue = [from];
  dist[from] = 0;
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    const x = c % cols, y = (c / cols) | 0;
    for (const [bit, dx, dy] of DIRS) {
      if (walls[c] & bit) continue;
      const n = (y + dy) * cols + x + dx;
      if (dist[n] >= 0) continue;
      dist[n] = dist[c] + 1;
      prev[n] = c;
      queue.push(n);
    }
  }
  return { dist, prev };
}

// Cell counts and hole sizes for a level that fits a width x height board (mm).
export function levelParams(width, height, level) {
  const L = Math.max(1, level | 0);
  const short = Math.min(width, height);
  const across = Math.max(4, Math.min(Math.floor(short / 8), 18, 4 + Math.ceil(0.6 * L)));
  const cs = short / across;
  const cols = Math.max(4, Math.min(Math.floor(width / cs), 3 * across));
  const rows = Math.max(4, Math.min(Math.floor(height / cs), 3 * across));
  const w = 0.07 * cs;          // half wall thickness
  const r = 0.19 * cs;          // ball radius
  const gap = r * Math.max(0.45, 1.1 - 0.06 * (L - 1)); // clearance left beside a hole on the path
  return {
    L, cols, rows, cs, w, r, gap,
    sideHole: (cs - 2 * w - r - gap) / 2,
    deadHole: 1.35 * r,
    goalHole: 1.3 * r,
    braid: L < 3 ? 0 : Math.min(0.35, 0.05 * (L - 2)),
    pPath: Math.min(0.6, 0.12 + 0.06 * (L - 1)),
    pDead: Math.min(0.75, 0.25 + 0.07 * (L - 1)),
  };
}

export function buildLevel({ width, height, level = 1, seed = 1 }) {
  const P = levelParams(width, height, level);
  const { cols, rows, cs, w, r } = P;
  const rand = mulberry32((seed ^ Math.imul(P.L, 0x9e3779b1)) >>> 0);
  const walls = carve(cols, rows, rand, P.braid);

  const startCell = 0;
  const { dist, prev } = bfs(walls, cols, rows, startCell);
  let goalCell = 0;
  for (let c = 0; c < dist.length; c++) if (dist[c] > dist[goalCell]) goalCell = c;
  const path = [];
  for (let c = goalCell; c >= 0; c = prev[c]) path.push(c);
  path.reverse();
  const onPath = new Uint8Array(cols * rows);
  path.forEach((c) => { onPath[c] = 1; });

  const cx = (c) => (c % cols + 0.5) * cs;
  const cy = (c) => (((c / cols) | 0) + 0.5) * cs;
  const near = (c, k) => Math.abs((c % cols) - (k % cols)) + Math.abs(((c / cols) | 0) - ((k / cols) | 0));

  // A straight cell is open on exactly two opposite sides. Returns 'h', 'v' or null.
  const straight = (c) => {
    if (walls[c] === (N | S)) return 'h';
    if (walls[c] === (E | W)) return 'v';
    return null;
  };

  const holes = [];
  const holeIn = new Int32Array(cols * rows).fill(-1);
  // Side hole tucked against one wall of a straight corridor, leaving `gap` beside it.
  const sideHole = (c, axis, side) => {
    const hr = P.sideHole;
    const off = -cs / 2 + w + hr; // from cell centre toward side 0
    const h = axis === 'h'
      ? { x: cx(c), y: cy(c) + (side ? -off : off), r: hr }
      : { x: cx(c) + (side ? -off : off), y: cy(c), r: hr };
    holeIn[c] = holes.length;
    holes.push(h);
    return h;
  };

  const guide = [];
  let lastHoled = -10;
  path.forEach((c, i) => {
    const axis = straight(c);
    const allowed = axis && i >= 2 && i < path.length - 2 && i - lastHoled > 1 && near(c, startCell) > 1;
    if (allowed && rand() < P.pPath) {
      const side = rand() < 0.5 ? 0 : 1;
      const h = sideHole(c, axis, side);
      lastHoled = i;
      // The guide line runs through the middle of the gap beside the hole.
      const lo = -cs / 2 + w + 2 * h.r, hi = cs / 2 - w - r;
      const cross = ((lo + hi) / 2) * (side ? -1 : 1);
      const along = 0.35 * cs;
      const dir = axis === 'h' ? Math.sign(cx(path[i + 1]) - cx(path[i - 1])) : Math.sign(cy(path[i + 1]) - cy(path[i - 1]));
      for (const a of [-along * dir, along * dir]) {
        guide.push(axis === 'h' ? [cx(c) + a, cy(c) + cross] : [cx(c) + cross, cy(c) + a]);
      }
    } else {
      guide.push([cx(c), cy(c)]);
    }
  });

  for (let c = 0; c < cols * rows; c++) {
    if (onPath[c] || near(c, startCell) <= 1) continue;
    if (bits(walls[c]) === 3) {
      if (rand() < P.pDead) { holeIn[c] = holes.length; holes.push({ x: cx(c), y: cy(c), r: P.deadHole }); }
      continue;
    }
    const axis = straight(c);
    if (!axis || rand() >= P.pPath * 0.6) continue;
    const x = c % cols, y = (c / cols) | 0;
    const nbrs = axis === 'h' ? [x > 0 && c - 1, x < cols - 1 && c + 1] : [y > 0 && c - cols, y < rows - 1 && c + cols];
    if (nbrs.some((n) => n !== false && holeIn[n] >= 0)) continue;
    sideHole(c, axis, rand() < 0.5 ? 0 : 1);
  }

  const goal = { x: cx(goalCell), y: cy(goalCell), r: P.goalHole, goal: true };
  holes.push(goal);

  // Walls as axis-aligned rectangles [x0, y0, x1, y1]. The border is thicker and runs under the frame.
  const bw = cols * cs, bh = rows * cs, outer = 4 * w;
  const rects = [
    [-outer, -outer, bw + outer, w], [-outer, bh - w, bw + outer, bh + outer],
    [-outer, -outer, w, bh + outer], [bw - w, -outer, bw + outer, bh + outer],
  ];
  for (let c = 0; c < cols * rows; c++) {
    const x = c % cols, y = (c / cols) | 0;
    const x0 = x * cs, y0 = y * cs, x1 = x0 + cs, y1 = y0 + cs;
    if ((walls[c] & E) && x < cols - 1) rects.push([x1 - w, y0 - w, x1 + w, y1 + w]);
    if ((walls[c] & S) && y < rows - 1) rects.push([x0 - w, y1 - w, x1 + w, y1 + w]);
  }

  return {
    level: P.L, seed, cols, rows, cs, w, r, gap: P.gap,
    width: bw, height: bh, walls, rects, holes, goal, path, guide,
    start: { x: cx(startCell), y: cy(startCell) },
    wallHeight: 2.2 * r,
  };
}
