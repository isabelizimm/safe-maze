import { buildLevel } from './maze.js';
import { createBall, respawn, step, SUBSTEP } from './physics.js';
import { Input } from './input.js';
import { Renderer } from './render.js';
import { Sound } from './audio.js';

const $ = (s) => document.querySelector(s);
const q = new URLSearchParams(location.search);
const store = {
  get(k, d) { try { const v = localStorage.getItem('maze.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('maze.' + k, JSON.stringify(v)); } catch {} },
};

const canvas = $('#c');
const coarse = matchMedia('(pointer: coarse)').matches;
const pxPerMm = (+q.get('ppi') || (coarse ? 160 : 96)) / 25.4;
const seed = q.has('seed') ? +q.get('seed') | 0 : 1;
const settings = { guide: store.get('guide', true), sound: store.get('sound', true), haptics: store.get('haptics', true) };
let unlocked = store.get('unlocked', 1);
const best = store.get('best', {});

const input = new Input(canvas, { flip: q.has('flip') });
input.mmPerPx = 1 / pxPerMm;
const sound = new Sound();
sound.enabled = settings.sound;
const renderer = new Renderer(canvas);

let view, level, ball;
let levelNum = q.has('level') ? Math.max(1, +q.get('level') | 0) : Math.min(store.get('current', 1), unlocked);
let state = 'intro'; // intro | play | won
let paused = false;
let time = 0, falls = 0, acc = 0, last = 0, lastHaptic = 0;

const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), ms);
}

function orientationAngle() {
  const a = screen.orientation?.angle ?? (typeof window.orientation === 'number' ? window.orientation : 0);
  return ((a % 360) + 360) % 360;
}

function safeInsets() {
  const p = $('#safe'), cs = getComputedStyle(p);
  return ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].map((k) => parseFloat(cs[k]) || 0);
}

// The canvas stays fixed to the glass in the phone's natural portrait, whatever the browser does on rotation.
function layout() {
  const angle = orientationAngle(), iw = innerWidth, ih = innerHeight;
  const swap = angle === 90 || angle === 270;
  const w = swap ? ih : iw, h = swap ? iw : ih;
  Object.assign(canvas.style, {
    width: `${w}px`, height: `${h}px`, left: `${(iw - w) / 2}px`, top: `${(ih - h) / 2}px`,
    transform: angle ? `rotate(${-angle}deg)` : '',
  });
  input.angle = angle;
  const sc = safeInsets(), k = angle / 90;
  const nat = [0, 1, 2, 3].map((i) => sc[(i - k + 4) % 4] / pxPerMm);
  const top = nat[0] + 11, right = nat[1] + 3, bottom = nat[2] + 4, left = nat[3] + 3;
  view = {
    w, h, dpr: Math.min(devicePixelRatio || 1, 2.5), pxPerMm,
    top, left, safeTop: nat[0],
    boardW: Math.max(40, w / pxPerMm - left - right), boardH: Math.max(40, h / pxPerMm - top - bottom),
  };
}

function loadLevel(n) {
  levelNum = n;
  if (!q.has('level')) store.set('current', n);
  level = buildLevel({ width: view.boardW, height: view.boardH, level: n, seed });
  const ox = view.left + (view.boardW - level.width) / 2;
  const oy = view.top + (view.boardH - level.height) / 2;
  renderer.setup(view, level, { ox, oy, guide: settings.guide });
  ball = createBall(level);
  time = 0; falls = 0; acc = 0;
  if (state === 'won') state = 'play';
  $('#win').classList.remove('show');
  renderMenu();
}

function restart() {
  respawn(ball, level);
  time = 0; falls = 0; acc = 0;
}

function buzz(ms) {
  if (!settings.haptics || !navigator.vibrate) return;
  const now = performance.now();
  if (now - lastHaptic < 40) return;
  lastHaptic = now;
  try { navigator.vibrate(ms); } catch {}
}

function onEvent(e) {
  if (e.type === 'hit') {
    sound.hit(e.v);
    if (e.v > 120) buzz(Math.min(25, 6 + e.v / 40));
  } else if (e.type === 'fall') {
    falls++;
    sound.fall();
    buzz(60);
  } else if (e.type === 'goal') {
    sound.goal();
    buzz(30);
  } else if (e.type === 'won') {
    finish();
  }
}

function finish() {
  state = 'won';
  const key = `${levelNum}`;
  const prev = best[key];
  const record = prev === undefined || time < prev;
  if (record) { best[key] = time; store.set('best', best); }
  unlocked = Math.max(unlocked, levelNum + 1);
  store.set('unlocked', unlocked);
  $('#winTitle').textContent = `Level ${levelNum} done`;
  $('#winTime').textContent = fmt(time);
  $('#winSub').textContent = [
    falls === 0 ? 'No falls' : `${falls} ${falls === 1 ? 'fall' : 'falls'}`,
    record ? (prev === undefined ? 'First clear' : 'New best') : `Best ${fmt(prev)}`,
  ].join(' · ');
  $('#win').classList.add('show');
}

function frame(now) {
  const dt = Math.min(0.05, (now - (last || now)) / 1000);
  last = now;
  const g = input.gravity(dt);
  const running = state === 'play' && !paused;
  if (running) {
    if (ball.mode !== 'won') time += dt;
    acc += dt;
    const events = [];
    while (acc >= SUBSTEP) { step(ball, level, g.gx, g.gy, SUBSTEP, events); acc -= SUBSTEP; }
    events.forEach(onEvent);
  }
  sound.roll(running && ball.mode === 'roll' ? Math.hypot(ball.vx, ball.vy) : 0);
  renderer.draw(ball, g.up, {
    text: `Level ${levelNum}`,
    sub: state === 'intro' ? '' : `${fmt(time)}${falls ? ` · ${falls} ${falls === 1 ? 'fall' : 'falls'}` : ''}`,
  });
  requestAnimationFrame(frame);
}

// ---- UI ----

function chip(label, on, onClick, cls = 'chip') {
  const b = document.createElement('button');
  b.className = cls + (on ? ' on' : '');
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function renderMenu() {
  const levels = $('#levels');
  levels.replaceChildren();
  const top = Math.max(unlocked, levelNum);
  for (let n = 1; n <= top; n++) {
    const b = chip(`${n}`, n === levelNum, () => { loadLevel(n); closeMenu(); }, 'chip lvl');
    if (best[n] !== undefined) b.title = `Best ${fmt(best[n])}`;
    levels.append(b);
  }
  $('#guide').textContent = settings.guide ? 'Guide line on' : 'Guide line off';
  $('#guide').classList.toggle('on', settings.guide);
  $('#sound').textContent = settings.sound ? 'Sound on' : 'Sound off';
  $('#sound').classList.toggle('on', settings.sound);
  $('#haptics').textContent = settings.haptics ? 'Haptics on' : 'Haptics off';
  $('#haptics').classList.toggle('on', settings.haptics);
  $('#haptics').hidden = !navigator.vibrate;
}

function openMenu() { $('#menu').classList.add('open'); paused = true; }
function closeMenu() { $('#menu').classList.remove('open'); paused = false; }

$('#menuBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  if ($('#menu').classList.contains('open')) closeMenu(); else openMenu();
});
canvas.addEventListener('pointerdown', () => { if ($('#menu').classList.contains('open')) closeMenu(); });
$('#restart').addEventListener('click', () => { restart(); closeMenu(); });
$('#level').addEventListener('click', () => { input.calibrate(); closeMenu(); toast('The way you hold it now is level'); });
$('#guide').addEventListener('click', () => {
  settings.guide = !settings.guide;
  store.set('guide', settings.guide);
  loadLevelKeepBall();
});
$('#sound').addEventListener('click', () => {
  settings.sound = !settings.sound;
  store.set('sound', settings.sound);
  sound.setEnabled(settings.sound);
  renderMenu();
});
$('#haptics').addEventListener('click', () => {
  settings.haptics = !settings.haptics;
  store.set('haptics', settings.haptics);
  renderMenu();
});
$('#next').addEventListener('click', () => loadLevel(levelNum + 1));
$('#again').addEventListener('click', () => { state = 'play'; $('#win').classList.remove('show'); restart(); });

function loadLevelKeepBall() {
  const saved = { ...ball }, t = time, f = falls;
  const prevState = state;
  loadLevel(levelNum);
  Object.assign(ball, saved);
  time = t; falls = f; state = prevState;
}

$('#intro').addEventListener('click', async () => {
  sound.start();
  $('#intro').classList.add('hide');
  document.body.classList.add('started');
  state = 'play';
  time = 0;
  const ok = await input.requestMotion();
  input.calibrate();
  acquireWakeLock();
  if (!ok) toast(coarse ? 'No motion access. Drag on the board to tilt it.' : 'Tilt with the arrow keys or WASD, or drag the board.', 4000);
  else setTimeout(() => {
    if (!input.hasMotion) toast(coarse ? 'Drag on the board to tilt it.' : 'Tilt with the arrow keys or WASD, or drag the board.', 4000);
  }, 1200);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if ($('#menu').classList.contains('open')) closeMenu(); else if (state !== 'intro') openMenu(); }
  if (e.key === 'r' && state === 'play') restart();
  if (e.key === 'Enter' && state === 'won') loadLevel(levelNum + 1);
});

let wakeLock = null;
async function acquireWakeLock() {
  try {
    if ('wakeLock' in navigator && !wakeLock && !document.hidden) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch {}
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { paused = true; sound.roll(0); }
  else {
    paused = $('#menu').classList.contains('open');
    last = 0;
    if (state !== 'intro') acquireWakeLock();
  }
});

let resizeTimer;
function onResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const before = view && [view.w, view.h, view.dpr].join();
    layout();
    if ([view.w, view.h, view.dpr].join() !== before) loadLevel(levelNum);
    else canvas.style.transform = input.angle ? `rotate(${-input.angle}deg)` : '';
  }, 80);
}
window.addEventListener('resize', onResize);
screen.orientation?.addEventListener?.('change', onResize);

layout();
loadLevel(levelNum);
requestAnimationFrame(frame);

if (q.has('test')) {
  window.maze = {
    get level() { return level; },
    get ball() { return ball; },
    input,
    load: loadLevel,
    info: () => ({ level: levelNum, state, time, falls, cols: level.cols, rows: level.rows, holes: level.holes.length, view }),
  };
}
