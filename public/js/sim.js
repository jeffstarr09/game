// ON THE LINE — deterministic simulation core.
// Shared verbatim by the browser (to play) and the server (to replay and
// verify submitted runs). Everything here must be bit-for-bit deterministic
// across JS engines: only + - * / and Math.sqrt/floor/imul on numbers, no
// Math.sin/cos (engines may differ in the last bit), no Date, no Math.random.

export const VERSION = 1;

// The page is a 3:4 sheet, the same aspect as the posters we print.
export const W = 900;
export const H = 1200;
export const TICK_HZ = 60;
export const MAX_TICKS = TICK_HZ * 60 * 12; // 12 minutes is far beyond any real run

const ANG = 4096; // angle units per full turn
const MASK = ANG - 1;
const TURN = 46; // angle units per tick while steering
const SPEED0 = 2.1;
const SPEED_GAIN = 0.00042; // per tick
const SPEED_MAX = 4.6;
const INK_R = 3.2; // half line width
const HIT_R = 6.0; // head vs line distance that counts as a crossing
const GRAZE_R = 17.0; // closer than this (but not touching) is a graze
const SAFE_TAIL = 14; // most recent segments the head can never collide with
const PIG_R = 15;
const CELL = 24;
const GW = Math.ceil(W / CELL);
const GH = Math.ceil(H / CELL);

// --- deterministic trig table -------------------------------------------
const PI = 3.141592653589793;
function taylorSin(x) {
  // x in [-PI, PI]; 15 terms is well past double precision there
  let term = x;
  let sum = x;
  const x2 = x * x;
  for (let n = 1; n < 15; n++) {
    term = (-term * x2) / ((2 * n) * (2 * n + 1));
    sum += term;
  }
  return sum;
}
const SIN = new Float64Array(ANG);
const COS = new Float64Array(ANG);
for (let i = 0; i < ANG; i++) {
  let a = (i / ANG) * 2 * PI;
  if (a > PI) a -= 2 * PI;
  SIN[i] = taylorSin(a);
}
for (let i = 0; i < ANG; i++) COS[i] = SIN[(i + ANG / 4) & MASK];

// --- seeded RNG ------------------------------------------------------------
export function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- inks ------------------------------------------------------------------
// Indices into the riso ink palette (renderer owns the actual colours).
export const INK_COUNT = 6;

// --- the world ---------------------------------------------------------------
export function dailySeed(dateStr) {
  return hashString('on-the-line/' + dateStr);
}

function distSegSq(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  let t = len > 0 ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const qx = ax + t * dx - px;
  const qy = ay + t * dy - py;
  return qx * qx + qy * qy;
}

export function createWorld(seed) {
  const r = rng(seed);
  const w = {
    seed: seed >>> 0,
    r,
    tick: 0,
    x: W / 2,
    y: H * 0.62,
    ang: (3 * ANG) / 4, // pointing up the page
    speed: SPEED0,
    alive: true,
    deathCause: null,
    length: 0,
    score: 0,
    mult: 1,
    pigments: 0,
    grazeTicks: 0,
    grazing: false,
    bestGrazeStreak: 0,
    grazeStreak: 0,
    ink: 0,
    // trail: flat arrays for speed and cheap serialisation
    sx: [],
    sy: [],
    sink: [],
    grid: new Array(GW * GH),
    stones: [],
    pigs: [],
    events: [], // drained by the client each frame (pickups, grazes, death)
  };
  for (let i = 0; i < w.grid.length; i++) w.grid[i] = null;
  w.sx.push(w.x);
  w.sy.push(w.y);
  w.sink.push(0);

  // Stones: ink blots that are already on the page. 4–7 of them, kept off
  // the start position.
  const n = 4 + Math.floor(r() * 4);
  let guard = 0;
  while (w.stones.length < n && guard++ < 400) {
    const rad = 26 + Math.floor(r() * 46);
    const x = 70 + r() * (W - 140);
    const y = 70 + r() * (H - 140);
    const dx = x - w.x;
    const dy = y - w.y;
    if (dx * dx + dy * dy < (rad + 170) * (rad + 170)) continue;
    let ok = true;
    for (const s of w.stones) {
      const ex = s.x - x;
      const ey = s.y - y;
      if (ex * ex + ey * ey < (s.r + rad + 60) * (s.r + rad + 60)) ok = false;
    }
    if (!ok) continue;
    w.stones.push({ x, y, r: rad, shape: Math.floor(r() * 3), rot: Math.floor(r() * ANG) });
  }

  spawnPigment(w);
  spawnPigment(w);
  return w;
}

function cellOf(x, y) {
  let cx = Math.floor(x / CELL);
  let cy = Math.floor(y / CELL);
  if (cx < 0) cx = 0;
  else if (cx >= GW) cx = GW - 1;
  if (cy < 0) cy = 0;
  else if (cy >= GH) cy = GH - 1;
  return cy * GW + cx;
}

function clearance(w, x, y, rad) {
  // true if a circle at x,y of radius rad touches no line, stone or edge
  if (x < rad + 20 || y < rad + 20 || x > W - rad - 20 || y > H - rad - 20) return false;
  for (const s of w.stones) {
    const dx = s.x - x;
    const dy = s.y - y;
    if (dx * dx + dy * dy < (s.r + rad + 18) * (s.r + rad + 18)) return false;
  }
  for (const p of w.pigs) {
    const dx = p.x - x;
    const dy = p.y - y;
    if (dx * dx + dy * dy < 160 * 160) return false;
  }
  const reach = Math.ceil((rad + 10) / CELL);
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  const lim = (rad + 10) * (rad + 10);
  for (let gy = cy - reach; gy <= cy + reach; gy++) {
    if (gy < 0 || gy >= GH) continue;
    for (let gx = cx - reach; gx <= cx + reach; gx++) {
      if (gx < 0 || gx >= GW) continue;
      const list = w.grid[gy * GW + gx];
      if (!list) continue;
      for (let k = 0; k < list.length; k++) {
        const i = list[k];
        if (distSegSq(x, y, w.sx[i - 1], w.sy[i - 1], w.sx[i], w.sy[i]) < lim) return false;
      }
    }
  }
  return true;
}

function spawnPigment(w) {
  // Pigments appear somewhere open. As the page fills they get harder to
  // reach, which is the whole point.
  for (let tries = 0; tries < 60; tries++) {
    const x = 50 + w.r() * (W - 100);
    const y = 50 + w.r() * (H - 100);
    const hdx = x - w.x;
    const hdy = y - w.y;
    if (hdx * hdx + hdy * hdy < 140 * 140) continue;
    if (!clearance(w, x, y, PIG_R)) continue;
    w.pigs.push({ x, y, ink: 1 + Math.floor(w.r() * (INK_COUNT - 1)), born: w.tick });
    return;
  }
  // No room anywhere: the page is nearly full. No pigment this time.
}

// input: -1 steer left (anticlockwise on screen), 0 straight, 1 steer right
export function step(w, input) {
  if (!w.alive) return;
  w.tick++;
  if (input < 0) w.ang = (w.ang - TURN) & MASK;
  else if (input > 0) w.ang = (w.ang + TURN) & MASK;

  w.speed = SPEED0 + w.tick * SPEED_GAIN;
  if (w.speed > SPEED_MAX) w.speed = SPEED_MAX;

  const nx = w.x + COS[w.ang] * w.speed;
  const ny = w.y + SIN[w.ang] * w.speed;

  // Edge of the paper
  if (nx < INK_R || ny < INK_R || nx > W - INK_R || ny > H - INK_R) {
    return die(w, 'edge', nx, ny);
  }
  // Stones
  for (const s of w.stones) {
    const dx = s.x - nx;
    const dy = s.y - ny;
    if (dx * dx + dy * dy < (s.r + INK_R) * (s.r + INK_R)) return die(w, 'stone', nx, ny);
  }

  // Own line
  const newest = w.sx.length - 1; // index of current head point
  const cutoff = newest - SAFE_TAIL;
  let minD = Infinity;
  const reach = Math.ceil(GRAZE_R / CELL);
  const cx = Math.floor(nx / CELL);
  const cy = Math.floor(ny / CELL);
  for (let gy = cy - reach; gy <= cy + reach; gy++) {
    if (gy < 0 || gy >= GH) continue;
    for (let gx = cx - reach; gx <= cx + reach; gx++) {
      if (gx < 0 || gx >= GW) continue;
      const list = w.grid[gy * GW + gx];
      if (!list) continue;
      for (let k = 0; k < list.length; k++) {
        const i = list[k];
        if (i > cutoff) continue;
        const d = distSegSq(nx, ny, w.sx[i - 1], w.sy[i - 1], w.sx[i], w.sy[i]);
        if (d < minD) minD = d;
      }
    }
  }
  if (minD < HIT_R * HIT_R) return die(w, 'line', nx, ny);

  // Commit the move
  w.x = nx;
  w.y = ny;
  w.sx.push(nx);
  w.sy.push(ny);
  w.sink.push(w.ink);
  const idx = w.sx.length - 1;
  // register segment (idx-1 -> idx) in every cell its bounding box touches
  const x0 = Math.min(w.sx[idx - 1], nx);
  const x1 = Math.max(w.sx[idx - 1], nx);
  const y0 = Math.min(w.sy[idx - 1], ny);
  const y1 = Math.max(w.sy[idx - 1], ny);
  const gx0 = Math.max(0, Math.floor(x0 / CELL));
  const gx1 = Math.min(GW - 1, Math.floor(x1 / CELL));
  const gy0 = Math.max(0, Math.floor(y0 / CELL));
  const gy1 = Math.min(GH - 1, Math.floor(y1 / CELL));
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const c = gy * GW + gx;
      if (!w.grid[c]) w.grid[c] = [];
      w.grid[c].push(idx);
    }
  }

  w.length += w.speed;

  // Grazing: flying close to your own line is worth more, and it is how
  // good players fill a page densely.
  const grazing = minD < GRAZE_R * GRAZE_R;
  let gain = w.speed * 0.5;
  if (grazing) {
    w.grazeTicks++;
    w.grazeStreak++;
    if (w.grazeStreak > w.bestGrazeStreak) w.bestGrazeStreak = w.grazeStreak;
    gain += 1.5 + Math.min(w.grazeStreak, 120) * 0.05;
    if (!w.grazing) w.events.push({ t: 'graze-on', x: nx, y: ny });
  } else {
    if (w.grazing && w.grazeStreak >= 30) w.events.push({ t: 'graze-off', n: w.grazeStreak, x: nx, y: ny });
    w.grazeStreak = 0;
  }
  w.grazing = grazing;
  w.score += gain * w.mult;

  // Pigments
  for (let i = w.pigs.length - 1; i >= 0; i--) {
    const p = w.pigs[i];
    const dx = p.x - nx;
    const dy = p.y - ny;
    if (dx * dx + dy * dy < (PIG_R + INK_R + 2) * (PIG_R + INK_R + 2)) {
      w.pigs.splice(i, 1);
      w.pigments++;
      w.mult = 1 + w.pigments * 0.25;
      w.ink = p.ink;
      w.score += 50 * w.mult;
      w.events.push({ t: 'pigment', x: p.x, y: p.y, ink: p.ink, n: w.pigments });
      spawnPigment(w);
    }
  }
  // Keep two pigments on the page whenever there is room for them.
  if (w.pigs.length < 2 && w.tick % 90 === 0) spawnPigment(w);

  if (w.tick >= MAX_TICKS) die(w, 'time', nx, ny);
}

function die(w, cause, x, y) {
  w.alive = false;
  w.deathCause = cause;
  w.events.push({ t: 'death', cause, x, y });
}

export function finalScore(w) {
  return Math.floor(w.score);
}

// --- input recording -------------------------------------------------------
// A run is fully described by its seed and the input on every tick. We store
// it as run-length pairs: "<input char><count>" where L/S/R = -1/0/1.
export function encodeInputs(inputs) {
  let out = '';
  let prev = null;
  let n = 0;
  for (const v of inputs) {
    if (v === prev) n++;
    else {
      if (prev !== null) out += charFor(prev) + n.toString(36) + '.';
      prev = v;
      n = 1;
    }
  }
  if (prev !== null) out += charFor(prev) + n.toString(36) + '.';
  return out;
}

function charFor(v) {
  return v < 0 ? 'L' : v > 0 ? 'R' : 'S';
}

export function decodeInputs(str, limit = MAX_TICKS) {
  if (typeof str !== 'string' || !/^([LSR][0-9a-z]{1,6}\.)*$/.test(str)) return null;
  const out = [];
  for (const part of str.split('.')) {
    if (!part) continue;
    const v = part[0] === 'L' ? -1 : part[0] === 'R' ? 1 : 0;
    const n = parseInt(part.slice(1), 36);
    if (!(n > 0) || out.length + n > limit) return null;
    for (let i = 0; i < n; i++) out.push(v);
  }
  return out;
}

// Replays a run from scratch. Used by the server to verify scores and by the
// client to render other people's paintings.
export function replay(seed, inputs) {
  const w = createWorld(seed);
  for (let i = 0; i < inputs.length && w.alive; i++) {
    step(w, inputs[i]);
    w.events.length = 0;
  }
  // A recorded run always ends in death; let it play out straight if the
  // recording stopped a hair early (it never should).
  let guard = 0;
  while (w.alive && guard++ < 5) step(w, 0);
  return w;
}

export const CONST = { W, H, INK_R, PIG_R, TICK_HZ, ANG };
