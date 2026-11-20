// Turns the accelerometer (or keys / dragging on desktop) into gravity in the board plane.
// Board frame: x right, y down the screen, z out of the glass, always fixed to the phone's natural portrait.

const G = 9.81;
const MAX_TILT = 0.3; // rad, for keys and dragging

const norm = (v) => { const n = Math.hypot(...v) || 1; return v.map((c) => c / n); };

// Rotation taking unit vector `from` onto +z, applied to v (Rodrigues).
function levelTo(from, v) {
  const [ax, ay] = [from[1], -from[0]]; // from × z
  const s = Math.hypot(ax, ay), c = from[2];
  if (s < 1e-6) return c > 0 ? v.slice() : [v[0], -v[1], -v[2]];
  const kx = ax / s, ky = ay / s;
  const dot = kx * v[0] + ky * v[1];
  const cross = [ky * v[2], -kx * v[2], kx * v[1] - ky * v[0]];
  return [0, 1, 2].map((i) => v[i] * c + cross[i] * s + [kx, ky, 0][i] * dot * (1 - c));
}

export class Input {
  constructor(el, { flip = false } = {}) {
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    this.sign = (ios ? -1 : 1) * (flip ? -1 : 1);
    this.angle = 0;
    this.motion = null;
    this.lastMotion = 0;
    this.ref = [0, 0, 1];
    this.wantCalibrate = false;
    this.keys = new Set();
    this.tilt = [0, 0];
    this.drag = null;
    this.mmPerPx = 0.25;
    this.override = null;

    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      this.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
    });
    el.addEventListener('pointermove', (e) => {
      if (this.drag?.id === e.pointerId) { this.drag.x = e.clientX; this.drag.y = e.clientY; }
    });
    const end = (e) => { if (this.drag?.id === e.pointerId) this.drag = null; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
    window.addEventListener('blur', () => this.keys.clear());
  }

  async requestMotion() {
    const DM = window.DeviceMotionEvent;
    if (!DM) return false;
    if (typeof DM.requestPermission === 'function') {
      try { if ((await DM.requestPermission()) !== 'granted') return false; } catch { return false; }
    }
    if (!this.listening) {
      this.listening = true;
      window.addEventListener('devicemotion', (e) => this.onMotion(e));
    }
    return true;
  }

  onMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    // "Up" (the reaction to gravity) in the board frame, m/s².
    const f = [a.x * this.sign, -a.y * this.sign, a.z * this.sign];
    if (!this.motion) this.motion = f;
    else for (let i = 0; i < 3; i++) this.motion[i] += (f[i] - this.motion[i]) * 0.6;
    this.lastMotion = performance.now();
    if (this.wantCalibrate) this.calibrate();
  }

  get hasMotion() { return !!this.motion && performance.now() - this.lastMotion < 1000; }

  // Treat the way the phone is held right now as level.
  calibrate() {
    if (!this.motion) { this.wantCalibrate = true; return; }
    this.wantCalibrate = false;
    this.ref = norm(this.motion);
  }

  // Returns { gx, gy } in mm/s² and `up`, a unit vector for lighting.
  gravity(dt) {
    let f;
    if (this.override) f = this.override;
    else if (this.hasMotion) f = levelTo(this.ref, this.motion);
    else {
      const k = this.keys, t = this.tilt;
      const want = [
        (k.has('ArrowRight') || k.has('d') ? 1 : 0) - (k.has('ArrowLeft') || k.has('a') ? 1 : 0),
        (k.has('ArrowDown') || k.has('s') ? 1 : 0) - (k.has('ArrowUp') || k.has('w') ? 1 : 0),
      ];
      if (this.drag) {
        // Drag away from where the finger went down; 30 mm of drag is full tilt.
        const sx = this.drag.x - this.drag.x0, sy = this.drag.y - this.drag.y0;
        const a = (this.angle * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
        const nx = sx * c - sy * s, ny = sx * s + sy * c;
        want[0] = Math.max(-1, Math.min(1, (nx * this.mmPerPx) / 30));
        want[1] = Math.max(-1, Math.min(1, (ny * this.mmPerPx) / 30));
        for (let i = 0; i < 2; i++) t[i] += (want[i] * MAX_TILT - t[i]) * (1 - Math.exp(-dt * 12));
      } else {
        for (let i = 0; i < 2; i++) {
          if (want[i]) t[i] = Math.max(-MAX_TILT, Math.min(MAX_TILT, t[i] + want[i] * dt * 0.8));
          else t[i] *= Math.exp(-dt * 4);
        }
      }
      const [tx, ty] = t;
      f = [-Math.sin(tx) * G, -Math.sin(ty) * Math.cos(tx) * G, Math.cos(tx) * Math.cos(ty) * G];
    }
    let gx = -f[0] * 1000, gy = -f[1] * 1000;
    const m = Math.hypot(gx, gy), cap = 1.5 * G * 1000;
    if (m > cap) { gx *= cap / m; gy *= cap / m; }
    return { gx, gy, up: norm(f) };
  }
}
