// A solid steel ball rolling on a wooden board. Units: mm, seconds.

export const G = 9810;               // mm/s²
export const SUBSTEP = 1 / 1000;     // s
const ROLL = 5 / 7;                  // a rolling solid sphere accelerates at 5/7 of a sliding one
const ROLLING_RESISTANCE = 0.006 * G;
const RESTITUTION = 0.45;            // steel on hardwood
const MAX_SPEED = 1500;
const FALL_TIME = 0.45;

export function createBall(level) {
  return { x: level.start.x, y: level.start.y, vx: 0, vy: 0, mode: 'roll', t: 0, hole: null };
}

export function respawn(ball, level) {
  Object.assign(ball, createBall(level));
}

// Advance one substep. gx, gy: gravity in the board plane (mm/s²). Pushes events into `out`.
export function step(b, lv, gx, gy, dt, out) {
  if (b.mode === 'won') return;
  if (b.mode === 'fall') {
    b.t += dt;
    const k = 1 - Math.exp(-dt * 25);
    b.x += (b.hole.x - b.x) * k;
    b.y += (b.hole.y - b.y) * k;
    if (b.t >= FALL_TIME) {
      if (b.hole.goal) { b.mode = 'won'; out.push({ type: 'won' }); }
      else { respawn(b, lv); out.push({ type: 'respawn' }); }
    }
    return;
  }

  const r = lv.r;
  let ax = gx * ROLL, ay = gy * ROLL;

  // Over a hole the ball rests on the rim, which pushes it toward the centre; deep enough in, it drops.
  for (const h of lv.holes) {
    const dx = h.x - b.x, dy = h.y - b.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= h.r * h.r) continue;
    const d = Math.sqrt(d2);
    const dropAt = h.goal ? h.r - 0.4 * r : Math.max(0.25 * r, h.r - 0.8 * r);
    if (d < dropAt) {
      b.mode = 'fall'; b.t = 0; b.hole = h; b.vx = 0; b.vy = 0;
      out.push({ type: h.goal ? 'goal' : 'fall' });
      return;
    }
    const k = (Math.min(1, (h.r - d) / r) * ROLL * G) / d;
    ax += dx * k;
    ay += dy * k;
  }

  b.vx += ax * dt;
  b.vy += ay * dt;
  const s = Math.hypot(b.vx, b.vy);
  if (s > 0) {
    const ns = Math.min(MAX_SPEED, Math.max(0, s - ROLLING_RESISTANCE * dt));
    b.vx *= ns / s;
    b.vy *= ns / s;
  }
  b.x += b.vx * dt;
  b.y += b.vy * dt;

  for (const [x0, y0, x1, y1] of lv.rects) {
    if (b.x < x0 - r || b.x > x1 + r || b.y < y0 - r || b.y > y1 + r) continue;
    const px = Math.max(x0, Math.min(b.x, x1)), py = Math.max(y0, Math.min(b.y, y1));
    let nx = b.x - px, ny = b.y - py;
    let d = Math.hypot(nx, ny);
    let pen;
    if (d > 1e-9) {
      if (d >= r) continue;
      nx /= d; ny /= d; pen = r - d;
    } else {
      // Centre inside the rectangle: leave by the nearest face.
      const faces = [[b.x - x0, -1, 0], [x1 - b.x, 1, 0], [b.y - y0, 0, -1], [y1 - b.y, 0, 1]];
      faces.sort((a, c) => a[0] - c[0]);
      [d, nx, ny] = faces[0];
      pen = d + r;
    }
    b.x += nx * pen;
    b.y += ny * pen;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      const e = vn < -40 ? RESTITUTION : 0;
      b.vx -= (1 + e) * vn * nx;
      b.vy -= (1 + e) * vn * ny;
      if (vn < -40) {
        // Some spin is lost to friction at the wall.
        const tx = b.vx - (b.vx * nx + b.vy * ny) * nx, ty = b.vy - (b.vx * nx + b.vy * ny) * ny;
        b.vx -= tx * 0.08; b.vy -= ty * 0.08;
      }
      if (vn < -15) out.push({ type: 'hit', v: -vn });
    }
  }
}
