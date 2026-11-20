// Canvas 2D renderer for a moulded-plastic toy labyrinth. Static layers (shell, floor, holes, walls,
// wall shadows) are drawn once per level; each frame composites them with a light that follows the tilt,
// the ball, and the glare on the clear cover.

// Each level gets the next colour scheme.
export const PALETTES = [
  { shell: '#ff7eb0', shellHi: '#ffb3d1', floor: '#bfe7ff', wall: '#ffd43b', wallDark: '#e8a400', pit: '#1d2a5c' },
  { shell: '#8b7bff', shellHi: '#bdb3ff', floor: '#c8f7dc', wall: '#ff8f5e', wallDark: '#e0602e', pit: '#1f3b2c' },
  { shell: '#27c6b5', shellHi: '#7fe6da', floor: '#fff4b8', wall: '#ff6fa3', wallDark: '#e0437e', pit: '#4a2a10' },
  { shell: '#ffad33', shellHi: '#ffd28a', floor: '#e5dcff', wall: '#3fc1ff', wallDark: '#1595d6', pit: '#2b1d5c' },
];
export const paletteFor = (level) => PALETTES[(level - 1) % PALETTES.length];

const layer = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

function star(ctx, cx, cy, R, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rad = i % 2 ? r : R;
    ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  ctx.closePath();
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
    this.ready = W > 0 && H > 0;
    if (!this.ready) return;
    const s = this.s = pxPerMm * dpr; // canvas px per mm
    const pal = this.pal = paletteFor(lv.level);
    this.view = view;
    this.lv = lv;
    this.ox = ox;
    this.oy = oy;
    const X = (mm) => (ox + mm) * s, Y = (mm) => (oy + mm) * s;
    const bx = X(0), by = Y(0), bw = lv.width * s, bh = lv.height * s;
    const lip = lv.w * 2 * s, corner = lv.cs * 0.35 * s;
    this.board = [bx, by, bw, bh, corner];

    // Shell: glossy moulded plastic around a recessed tray.
    const floor = this.floor = layer(W, H);
    let ctx = floor.getContext('2d');
    ctx.fillStyle = pal.shell;
    ctx.fillRect(0, 0, W, H);
    const sheen = ctx.createLinearGradient(0, 0, W * 0.4, H);
    sheen.addColorStop(0, 'rgba(255,255,255,0.35)');
    sheen.addColorStop(0.45, 'rgba(255,255,255,0.05)');
    sheen.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, W, H);
    // Floor: flat pastel plastic with polka dots.
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, corner);
    ctx.clip();
    ctx.fillStyle = pal.floor;
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    const step = lv.cs * 0.5 * s, dot = Math.max(0.5 * s, lv.cs * 0.04 * s);
    for (let yy = by + step / 2, row = 0; yy < by + bh; yy += step, row++) {
      for (let xx = bx + (row % 2 ? step : step / 2); xx < bx + bw; xx += step) {
        ctx.beginPath();
        ctx.arc(xx, yy, dot, 0, 7);
        ctx.fill();
      }
    }
    const glow = ctx.createRadialGradient(bx + bw * 0.3, by + bh * 0.2, 0, bx + bw * 0.3, by + bh * 0.2, Math.max(bw, bh));
    glow.addColorStop(0, 'rgba(255,255,255,0.25)');
    glow.addColorStop(1, 'rgba(0,0,0,0.08)');
    ctx.fillStyle = glow;
    ctx.fillRect(bx, by, bw, bh);
    ctx.restore();

    if (guide) {
      // A dotted trail of little white beads.
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = Math.max(0.8, lv.r * 0.38) * s;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([0, lv.r * 1.1 * s]);
      ctx.beginPath();
      lv.guide.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
      ctx.stroke();
      ctx.restore();
    }

    // Start: a dashed white ring.
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 0.22 * lv.r * s;
    ctx.setLineDash([0.5 * lv.r * s, 0.35 * lv.r * s]);
    ctx.beginPath();
    ctx.arc(X(lv.start.x), Y(lv.start.y), lv.r * 1.45 * s, 0, 7);
    ctx.stroke();
    ctx.restore();

    for (const hole of lv.holes) {
      const cx = X(hole.x), cy = Y(hole.y), R = hole.r * s;
      if (hole.goal) {
        // A star sticker around the goal.
        ctx.save();
        star(ctx, cx, cy, R * 2.2, R * 1.1);
        ctx.lineJoin = 'round';
        ctx.lineWidth = R * 0.28;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
        const g = ctx.createLinearGradient(cx - R * 2, cy - R * 2, cx + R * 2, cy + R * 2);
        g.addColorStop(0, '#fff27a');
        g.addColorStop(1, '#ffb800');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.restore();
      }
      // A raised moulded lip, then the dark pit.
      const rim = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      rim.addColorStop(0, 'rgba(255,255,255,0.9)');
      rim.addColorStop(1, 'rgba(0,0,0,0.25)');
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.14, 0, 7);
      ctx.fill();
      const pit = ctx.createRadialGradient(cx + R * 0.15, cy + R * 0.2, R * 0.1, cx, cy, R);
      pit.addColorStop(0, '#000');
      pit.addColorStop(0.65, pal.pit);
      pit.addColorStop(1, '#000');
      ctx.fillStyle = pit;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, 7);
      ctx.fill();
    }

    // Walls: rounded plastic ribs. Each rectangle becomes a stroke with round caps of the same footprint.
    const segs = lv.rects.map(([x0, y0, x1, y1]) => {
      const horiz = x1 - x0 >= y1 - y0, t = horiz ? y1 - y0 : x1 - x0;
      return horiz ? [x0 + t / 2, (y0 + y1) / 2, x1 - t / 2, (y0 + y1) / 2, t] : [(x0 + x1) / 2, y0 + t / 2, (x0 + x1) / 2, y1 - t / 2, t];
    });
    const ribs = (c, color, dx = 0, dy = 0, widthScale = 1) => {
      c.strokeStyle = color;
      c.lineCap = 'round';
      for (const [ax, ay, ex, ey, t] of segs) {
        c.lineWidth = t * s * widthScale;
        c.beginPath();
        c.moveTo(X(ax) + dx, Y(ay) + dy);
        c.lineTo(X(ex) + dx, Y(ey) + dy);
        c.stroke();
      }
    };
    const walls = this.walls = layer(W, H);
    ctx = walls.getContext('2d');
    ribs(ctx, '#000');
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = pal.wallDark;
    ctx.fillRect(0, 0, W, H);
    const bevel = Math.max(1, lv.w * 0.6 * s);
    ribs(ctx, pal.wall, -bevel, -bevel);
    // The shiny streak along the top of each rib.
    ribs(ctx, 'rgba(255,255,255,0.6)', -lv.w * 0.45 * s, -lv.w * 0.45 * s, 0.32);
    ctx.globalCompositeOperation = 'source-over';
    // The shell overlaps the outer wall so the tray looks sunk into it, with a glossy lip.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.roundRect(bx - lip, by - lip, bw + 2 * lip, bh + 2 * lip, corner + lip);
    ctx.clip('evenodd');
    ctx.drawImage(floor, 0, 0);
    ctx.restore();
    ctx.lineWidth = lip * 0.7;
    const lipG = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
    lipG.addColorStop(0, 'rgba(255,255,255,0.75)');
    lipG.addColorStop(1, 'rgba(0,0,0,0.15)');
    ctx.strokeStyle = lipG;
    ctx.beginPath();
    ctx.roundRect(bx - lip * 1.2, by - lip * 1.2, bw + 2.4 * lip, bh + 2.4 * lip, corner + lip * 1.2);
    ctx.stroke();

    // Wall shadows: a blurred silhouette, moved each frame with the light.
    const shadow = this.shadow = layer(W, H);
    ctx = shadow.getContext('2d');
    const far = W + H;
    ctx.shadowColor = 'rgba(20,20,60,0.35)';
    ctx.shadowBlur = lv.w * 2.2 * s;
    ctx.shadowOffsetX = far;
    ribs(ctx, '#000', -far, 0);
  }

  clipBoard() {
    const [bx, by, bw, bh, corner] = this.board;
    this.ctx.beginPath();
    this.ctx.roundRect(bx, by, bw, bh, corner);
    this.ctx.clip();
  }

  draw(ball, up, hud) {
    if (!this.ready) return;
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
    this.clipBoard();
    ctx.drawImage(this.shadow, sx, sy);
    this.drawBall(ball, lx, ly, shift);
    ctx.restore();
    ctx.drawImage(this.walls, 0, 0);

    // Glare on the clear plastic cover, sliding a little as the toy tilts.
    ctx.save();
    this.clipBoard();
    const gx = bx + up[0] * bw * 0.3, gy = by + up[1] * bh * 0.3;
    const glare = ctx.createLinearGradient(gx, gy, gx + bw, gy + bh * 0.6);
    glare.addColorStop(0.0, 'rgba(255,255,255,0)');
    glare.addColorStop(0.18, 'rgba(255,255,255,0.16)');
    glare.addColorStop(0.26, 'rgba(255,255,255,0.03)');
    glare.addColorStop(0.32, 'rgba(255,255,255,0.12)');
    glare.addColorStop(0.36, 'rgba(255,255,255,0)');
    ctx.fillStyle = glare;
    ctx.fillRect(bx, by, bw, bh);
    ctx.restore();
    this.drawHud(hud);
  }

  drawBall(b, lx, ly, shift) {
    const { ctx, s, lv } = this;
    const cx = (this.ox + b.x) * s, cy = (this.oy + b.y) * s;
    let R = lv.r * s;
    let sink = 0;
    ctx.save();
    if (b.mode === 'fall' || b.mode === 'won') {
      if (b.mode === 'won') { ctx.restore(); return; }
      sink = Math.min(1, b.t / 0.3);
      const h = b.hole;
      ctx.beginPath();
      ctx.arc((this.ox + h.x) * s, (this.oy + h.y) * s, h.r * s, 0, 7);
      ctx.clip();
      R *= 1 - 0.3 * sink;
    } else {
      const [dx, dy] = shift(lv.r * 0.9);
      const sh = ctx.createRadialGradient(cx + dx, cy + dy, 0, cx + dx, cy + dy, R * 1.25);
      sh.addColorStop(0, 'rgba(20,20,60,0.4)');
      sh.addColorStop(0.6, 'rgba(20,20,60,0.2)');
      sh.addColorStop(1, 'rgba(20,20,60,0)');
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.arc(cx + dx, cy + dy, R * 1.25, 0, 7);
      ctx.fill();
    }
    // A polished ball bearing: dark body, the pastel floor reflected below, a sharp highlight toward the light.
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
    const rx = cx - lx * R * 0.6, ry = cy - ly * R * 0.6;
    const tint = ctx.createRadialGradient(rx, ry, 0, rx, ry, R * 0.9);
    tint.addColorStop(0, this.pal.floor);
    tint.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = tint;
    ctx.fill();
    ctx.globalAlpha = 1;
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
    const font = 'ui-rounded, "SF Pro Rounded", -apple-system, system-ui, sans-serif';
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowOffsetY = 1 * dpr;
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${15 * dpr}px ${font}`;
    const x = this.board[0];
    ctx.fillText(text, x, y);
    if (sub) {
      const tw = ctx.measureText(text).width;
      ctx.globalAlpha = 0.8;
      ctx.font = `600 ${14 * dpr}px ${font}`;
      ctx.fillText(sub, x + tw + 12 * dpr, y);
    }
    ctx.restore();
  }
}
