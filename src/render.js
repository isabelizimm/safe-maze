// Canvas 2D renderer. Static layers (frame, floor, holes, walls, wall shadows) are drawn once per level;
// each frame composites them with a light direction that follows the tilt, plus the ball.

import { mulberry32 } from './maze.js';

const layer = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

function wood(ctx, x, y, w, h, s, { base, dark, light, seed, angle = 0 }) {
  const rand = mulberry32(seed);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(angle);
  const span = Math.hypot(w, h) / 2;
  // Broad colour bands, then fine grain lines, then pores.
  for (let i = 0; i < 18; i++) {
    const yy = -span + rand() * span * 2, hh = (2 + rand() * 10) * s;
    ctx.fillStyle = rand() < 0.5 ? dark : light;
    ctx.globalAlpha = 0.06 + rand() * 0.08;
    ctx.fillRect(-span, yy, span * 2, hh);
  }
  const lines = Math.ceil((span * 2) / (0.9 * s));
  for (let i = 0; i < lines; i++) {
    const y0 = -span + (i + rand()) * 0.9 * s;
    const amp = (0.4 + rand() * 1.8) * s, freq = (0.01 + rand() * 0.03) / s, ph = rand() * 6.28;
    ctx.globalAlpha = 0.05 + rand() * 0.12;
    ctx.strokeStyle = dark;
    ctx.lineWidth = (0.08 + rand() * 0.25) * s;
    ctx.beginPath();
    for (let xx = -span; xx <= span; xx += 3 * s) {
      const yy = y0 + Math.sin(xx * freq + ph) * amp + Math.sin(xx * freq * 3.1 + ph * 2) * amp * 0.25;
      if (xx === -span) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
  }
  ctx.fillStyle = dark;
  const pores = (w * h) / (s * s) * 0.6;
  for (let i = 0; i < pores; i++) {
    ctx.globalAlpha = 0.08 + rand() * 0.15;
    ctx.fillRect(-span + rand() * span * 2, -span + rand() * span * 2, (0.3 + rand() * 1.2) * s, 0.12 * s);
  }
  ctx.restore();
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  setup(view, lv, { ox, oy, guide }) {
    const { w, h, dpr, pxPerMm } = view;
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    this.canvas.width = W;
    this.canvas.height = H;
    const s = this.s = pxPerMm * dpr; // canvas px per mm
    this.view = view;
    this.lv = lv;
    this.ox = ox;
    this.oy = oy;
    const X = (mm) => (ox + mm) * s, Y = (mm) => (oy + mm) * s;
    const bx = X(0), by = Y(0), bw = lv.width * s, bh = lv.height * s;

    // Floor: walnut frame, maple board, guide line, holes.
    const floor = this.floor = layer(W, H);
    let ctx = floor.getContext('2d');
    wood(ctx, 0, 0, W, H, s, { base: '#4a2f1c', dark: '#24150b', light: '#6b4428', seed: 3, angle: Math.PI / 2 });
    const vign = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    vign.addColorStop(0, 'rgba(0,0,0,0)');
    vign.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vign;
    ctx.fillRect(0, 0, W, H);
    wood(ctx, bx, by, bw, bh, s, { base: '#d8b382', dark: '#9c6f42', light: '#ecd3a8', seed: 11 + lv.level, angle: Math.PI / 2 + 0.04 });

    if (guide) {
      ctx.save();
      ctx.strokeStyle = 'rgba(28,18,10,0.72)';
      ctx.lineWidth = Math.max(0.55, lv.r * 0.22) * s;
      ctx.lineJoin = ctx.lineCap = 'round';
      ctx.beginPath();
      lv.guide.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
      ctx.stroke();
      ctx.restore();
    }

    // Start: an engraved ring.
    ctx.save();
    ctx.strokeStyle = 'rgba(60,36,18,0.55)';
    ctx.lineWidth = 0.18 * lv.r * s;
    ctx.beginPath();
    ctx.arc(X(lv.start.x), Y(lv.start.y), lv.r * 1.45 * s, 0, 7);
    ctx.stroke();
    ctx.restore();

    for (const hole of lv.holes) {
      const cx = X(hole.x), cy = Y(hole.y), R = hole.r * s;
      if (hole.goal) {
        const ring = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
        ring.addColorStop(0, '#f6e3a1');
        ring.addColorStop(0.5, '#b8902f');
        ring.addColorStop(1, '#6e5214');
        ctx.fillStyle = ring;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.28, 0, 7);
        ctx.fill();
      }
      // A bevelled lip, lit from the top left, then the dark bore.
      const lip = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      lip.addColorStop(0, 'rgba(40,22,8,0.55)');
      lip.addColorStop(1, 'rgba(255,240,210,0.5)');
      ctx.fillStyle = lip;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.08, 0, 7);
      ctx.fill();
      const bore = ctx.createRadialGradient(cx + R * 0.15, cy + R * 0.2, R * 0.1, cx, cy, R);
      bore.addColorStop(0, '#000');
      bore.addColorStop(0.7, '#0b0603');
      bore.addColorStop(1, '#2b190b');
      ctx.fillStyle = bore;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, 7);
      ctx.fill();
    }

    // Walls: the union of the rectangles, so overlapping pieces join without seams.
    const union = (c, dx = 0, dy = 0) => {
      c.beginPath();
      for (const [x0, y0, x1, y1] of lv.rects) c.rect(X(x0) + dx, Y(y0) + dy, (x1 - x0) * s, (y1 - y0) * s);
    };
    const walls = this.walls = layer(W, H);
    ctx = walls.getContext('2d');
    wood(ctx, 0, 0, W, H, s, { base: '#c08d58', dark: '#7a4e28', light: '#e2b985', seed: 29 + lv.level });
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = '#000';
    union(ctx);
    ctx.fill();
    const edge = (color, d, width) => {
      const e = layer(W, H), c = e.getContext('2d');
      c.fillStyle = color;
      c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = 'destination-out';
      union(c, d * width, d * width);
      c.fill();
      c.globalCompositeOperation = 'destination-in';
      union(c);
      c.fill();
      return e;
    };
    ctx.globalCompositeOperation = 'source-over';
    const bevel = Math.max(1, lv.w * 0.5 * s);
    ctx.drawImage(edge('rgba(255,236,200,0.55)', 1, bevel), 0, 0);
    ctx.drawImage(edge('rgba(50,26,8,0.5)', -1, bevel), 0, 0);
    // The frame overlaps the outer wall so the board looks sunk into it.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.rect(bx - lv.w * 2 * s, by - lv.w * 2 * s, bw + lv.w * 4 * s, bh + lv.w * 4 * s);
    ctx.clip('evenodd');
    ctx.drawImage(floor, 0, 0);
    ctx.restore();

    // Wall shadows: a blurred silhouette, moved each frame with the light.
    const shadow = this.shadow = layer(W, H);
    ctx = shadow.getContext('2d');
    const far = W + H;
    ctx.shadowColor = 'rgba(30,15,0,0.55)';
    ctx.shadowBlur = lv.w * 2.2 * s;
    ctx.shadowOffsetX = far;
    ctx.fillStyle = '#000';
    union(ctx, -far, 0);
    ctx.fill();

    this.board = [bx, by, bw, bh];
  }

  draw(ball, up, hud) {
    const { ctx, s, lv } = this;
    const [bx, by, bw, bh] = this.board;
    // Light: fixed in the room, so relative to the board it swings toward the raised side.
    let lx = -0.35 - up[0] * 1.4, ly = -0.5 - up[1] * 1.4, lz = 0.8;
    const n = Math.hypot(lx, ly, lz);
    lx /= n; ly /= n; lz /= n;
    lz = Math.max(lz, 0.35);
    const shift = (height) => [(-lx / lz) * height * s, (-ly / lz) * height * s];

    ctx.drawImage(this.floor, 0, 0);
    const [sx, sy] = shift(lv.wallHeight * 0.5);
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, by, bw, bh);
    ctx.clip();
    ctx.drawImage(this.shadow, sx, sy);
    this.drawBall(ball, lx, ly, shift);
    ctx.restore();
    ctx.drawImage(this.walls, 0, 0);
    this.drawHud(hud);
  }

  drawBall(b, lx, ly, shift) {
    const { ctx, s, lv } = this;
    const cx = (this.ox + b.x) * s, cy = (this.oy + b.y) * s;
    let R = lv.r * s;
    let sink = 0;
    ctx.save();
    if (b.mode === 'fall' || b.mode === 'won') {
      sink = Math.min(1, b.t / 0.3);
      const h = b.hole;
      ctx.beginPath();
      ctx.arc((this.ox + h.x) * s, (this.oy + h.y) * s, h.r * s, 0, 7);
      ctx.clip();
      if (b.mode === 'won') { ctx.restore(); return; }
      R *= 1 - 0.3 * sink;
    } else {
      const [dx, dy] = shift(lv.r * 0.9);
      const sh = ctx.createRadialGradient(cx + dx, cy + dy, 0, cx + dx, cy + dy, R * 1.25);
      sh.addColorStop(0, 'rgba(25,12,0,0.5)');
      sh.addColorStop(0.6, 'rgba(25,12,0,0.25)');
      sh.addColorStop(1, 'rgba(25,12,0,0)');
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.arc(cx + dx, cy + dy, R * 1.25, 0, 7);
      ctx.fill();
    }
    // Polished steel: a dark body, the warm board reflected below, a sharp highlight toward the light.
    const hx = cx + lx * R * 0.55, hy = cy + ly * R * 0.55;
    const body = ctx.createRadialGradient(hx, hy, R * 0.02, cx, cy, R);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.1, '#eef2f6');
    body.addColorStop(0.32, '#a7afb8');
    body.addColorStop(0.72, '#4c535c');
    body.addColorStop(1, '#1b1f24');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 7);
    ctx.fill();
    const warm = ctx.createRadialGradient(cx - lx * R * 0.6, cy - ly * R * 0.6, 0, cx - lx * R * 0.6, cy - ly * R * 0.6, R * 0.9);
    warm.addColorStop(0, 'rgba(225,170,105,0.45)');
    warm.addColorStop(1, 'rgba(225,170,105,0)');
    ctx.fillStyle = warm;
    ctx.fill();
    if (sink) {
      ctx.fillStyle = `rgba(0,0,0,${0.85 * sink})`;
      ctx.fill();
    }
    ctx.restore();
  }

  drawHud({ text, sub }) {
    const { ctx } = this;
    const { dpr, pxPerMm, safeTop, top } = this.view;
    const y = ((safeTop + top) / 2) * pxPerMm * dpr;
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,236,210,0.82)';
    ctx.font = `600 ${14 * dpr}px -apple-system, system-ui, sans-serif`;
    const x = this.board[0];
    ctx.fillText(text, x, y);
    if (sub) {
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(255,236,210,0.5)';
      ctx.font = `500 ${13 * dpr}px -apple-system, system-ui, sans-serif`;
      ctx.fillText(sub, x + tw + 12 * dpr, y);
    }
    ctx.restore();
  }
}
