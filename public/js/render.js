// Risograph renderer. Three stacked layers per sheet:
//   paper  — stock colour, fibres, and the pre-printed stones (halftone)
//   ink    — the line, drawn incrementally, composited with multiply
//   grain  — speckle where the drum missed, laid over everything
// The same Sheet draws the live game, gallery thumbnails and print exports.
import { CONST, rng } from './sim.js';
import { hexToRgb } from './palette.js';

const { W, H, INK_R, PIG_R } = CONST;
const GRAPHITE = '#77736b';

function layer(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const grainCache = new Map();
function grainLayer(pw, ph) {
  const key = pw + 'x' + ph;
  if (grainCache.has(key)) return grainCache.get(key);
  const c = layer(pw, ph);
  const g = c.getContext('2d');
  const r = rng(7);
  const area = pw * ph;
  // drum dropouts: pale specks
  g.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < area / 260; i++) {
    const s = r() < 0.9 ? 0.8 : 1.8;
    g.fillRect(r() * pw, r() * ph, s, s);
  }
  // toner dust: dark specks
  g.fillStyle = 'rgba(40,30,20,0.18)';
  for (let i = 0; i < area / 1800; i++) g.fillRect(r() * pw, r() * ph, 1, 1);
  if (grainCache.size > 8) grainCache.clear();
  grainCache.set(key, c);
  return c;
}

function paperFibres(g, pw, ph, paper, seed) {
  g.fillStyle = paper;
  g.fillRect(0, 0, pw, ph);
  const r = rng(seed ^ 0x9e3779b9);
  const [pr, pg, pb] = hexToRgb(paper);
  // low-frequency mottling
  for (let i = 0; i < 60; i++) {
    const x = r() * pw;
    const y = r() * ph;
    const rad = (0.08 + r() * 0.2) * pw;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    const d = r() < 0.5 ? -8 : 6;
    grd.addColorStop(0, `rgba(${pr + d},${pg + d},${pb + d - 2},0.35)`);
    grd.addColorStop(1, `rgba(${pr},${pg},${pb},0)`);
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // fibres
  g.lineWidth = Math.max(0.5, pw / 1800);
  for (let i = 0; i < (pw * ph) / 9000; i++) {
    const x = r() * pw;
    const y = r() * ph;
    const a = r() * Math.PI * 2;
    const l = (2 + r() * 9) * (pw / 900);
    g.strokeStyle = r() < 0.5 ? 'rgba(120,100,80,0.10)' : 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
}

// Halftone a disc: dot size follows a light source up-left, so stones read
// as printed spheres.
function halftoneStone(g, s, scale, ink, angleDeg, style, reg) {
  const cx = (s.x + reg[0]) * scale;
  const cy = (s.y + reg[1]) * scale;
  const R = s.r * scale;
  g.fillStyle = ink;
  g.strokeStyle = ink;
  if (style === 1) {
    // plotter rings
    g.lineWidth = Math.max(1, 1.6 * scale);
    for (let k = R; k > 2; k -= 6 * scale) {
      g.beginPath();
      g.arc(cx, cy, k, 0, Math.PI * 2);
      g.stroke();
    }
    return;
  }
  const step = Math.max(3, 7.5 * scale);
  const a = (angleDeg * Math.PI) / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const lx = cx - R * 0.45;
  const ly = cy - R * 0.5;
  const n = Math.ceil((R * 1.5) / step);
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const x = cx + (i * ca - j * sa) * step;
      const y = cy + (i * sa + j * ca) * step;
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > R) continue;
      let cov;
      if (style === 2) cov = 0.95;
      else {
        const ld = Math.sqrt((x - lx) ** 2 + (y - ly) ** 2) / (R * 1.6);
        cov = Math.min(1, 0.18 + ld * 0.95);
      }
      const edge = Math.min(1, (R - d) / (step * 0.8));
      const rad = step * 0.62 * Math.sqrt(cov) * (0.5 + 0.5 * edge);
      if (rad < 0.4) continue;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (style === 2) {
    g.lineWidth = Math.max(1, 2 * scale);
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.stroke();
  }
}

export function drawBlot(g, x, y, scale, ink, seed, size = 1) {
  const r = rng(seed >>> 0);
  g.fillStyle = ink;
  const R = (9 + r() * 6) * scale * size;
  g.beginPath();
  for (let k = 0; k <= 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const rr = R * (0.8 + r() * 0.45);
    const px = x * scale + Math.cos(a) * rr;
    const py = y * scale + Math.sin(a) * rr;
    if (k === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.fill();
  const drops = 6 + Math.floor(r() * 8);
  for (let i = 0; i < drops; i++) {
    const a = r() * Math.PI * 2;
    const d = R * (1.2 + r() * 2.2);
    const s = R * (0.08 + r() * 0.22) * (1.6 - d / (R * 3.4));
    g.beginPath();
    g.arc(x * scale + Math.cos(a) * d, y * scale + Math.sin(a) * d, Math.max(0.6, s), 0, Math.PI * 2);
    g.fill();
  }
}

export class Sheet {
  constructor(pw, palette, world) {
    this.pw = Math.round(pw);
    this.ph = Math.round((pw * H) / W);
    this.scale = this.pw / W;
    this.palette = palette;
    this.world = world;
    this.paper = layer(this.pw, this.ph);
    this.ink = layer(this.pw, this.ph);
    this.ghost = null;
    this.ghostDrawn = 1;
    this.drawn = 1; // trail points already inked
    this.blotted = false;
    this.drawPaper();
  }

  drawPaper() {
    const g = this.paper.getContext('2d');
    const { palette, world, scale } = this;
    paperFibres(g, this.pw, this.ph, palette.paper, world.seed);
    world.stones.forEach((s, i) => {
      const inkIdx = 1 + (i % 2);
      halftoneStone(g, s, scale, palette.inks[inkIdx], palette.halftoneAngle, s.shape, palette.reg[inkIdx]);
    });
  }

  setGhost(points) {
    // points: {sx, sy} of a previous run on the same paper — the
    // "underdrawing" you are trying to beat.
    this.ghostPts = points;
    this.ghost = layer(this.pw, this.ph);
    this.ghostDrawn = 1;
  }

  advanceGhost(tick) {
    if (!this.ghost) return;
    const p = this.ghostPts;
    const end = Math.min(tick + 1, p.sx.length);
    if (end <= this.ghostDrawn) return;
    const g = this.ghost.getContext('2d');
    const s = this.scale;
    g.strokeStyle = GRAPHITE;
    g.globalAlpha = 0.5;
    g.lineWidth = Math.max(1, 1.3 * s);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(p.sx[this.ghostDrawn - 1] * s, p.sy[this.ghostDrawn - 1] * s);
    for (let i = this.ghostDrawn; i < end; i++) g.lineTo(p.sx[i] * s, p.sy[i] * s);
    g.stroke();
    this.ghostDrawn = end;
  }

  inkTo(n = this.world.sx.length) {
    const w = this.world;
    if (n <= this.drawn) return;
    const g = this.ink.getContext('2d');
    const s = this.scale;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = INK_R * 2 * s;
    let i = this.drawn;
    while (i < n) {
      const ink = w.sink[i];
      const reg = this.palette.reg[ink];
      g.strokeStyle = this.palette.inks[ink];
      g.beginPath();
      g.moveTo((w.sx[i - 1] + reg[0]) * s, (w.sy[i - 1] + reg[1]) * s);
      while (i < n && w.sink[i] === ink) {
        g.lineTo((w.sx[i] + reg[0]) * s, (w.sy[i] + reg[1]) * s);
        i++;
      }
      g.stroke();
    }
    this.drawn = n;
  }

  blot() {
    if (this.blotted || this.world.alive) return;
    const w = this.world;
    const g = this.ink.getContext('2d');
    drawBlot(g, w.x, w.y, this.scale, this.palette.inks[w.ink], w.seed + w.tick, 1);
    this.blotted = true;
  }

  // Composite onto ctx at (dx, dy). Overlays (pigments, nib) are drawn by
  // the caller between ink and grain via the `between` callback.
  composite(ctx, dx = 0, dy = 0, between) {
    ctx.drawImage(this.paper, dx, dy);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    if (this.ghost) ctx.drawImage(this.ghost, dx, dy);
    ctx.drawImage(this.ink, dx, dy);
    if (between) between(ctx);
    ctx.restore();
    ctx.drawImage(grainLayer(this.pw, this.ph), dx, dy);
  }
}

// A finished painting as a standalone canvas (thumbnails, posters).
export function renderPainting(world, palette, pw) {
  const sheet = new Sheet(pw, palette, world);
  sheet.inkTo();
  sheet.blot();
  const c = layer(sheet.pw, sheet.ph);
  sheet.composite(c.getContext('2d'));
  return c;
}

export function drawPigment(g, p, scale, ink, t) {
  const x = p.x * scale;
  const y = p.y * scale;
  const R = PIG_R * scale;
  const pulse = 1 + Math.sin(t * 5 + p.x) * 0.08;
  g.fillStyle = ink;
  g.beginPath();
  g.arc(x, y, R * 0.55 * pulse, 0, Math.PI * 2);
  g.fill();
  // halftone halo
  const n = 14;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + t * 0.9;
    g.beginPath();
    g.arc(x + Math.cos(a) * R * 1.05 * pulse, y + Math.sin(a) * R * 1.05 * pulse, Math.max(0.8, R * 0.11), 0, Math.PI * 2);
    g.fill();
  }
}

export function drawNib(g, w, scale, ink, t) {
  const x = w.x * scale;
  const y = w.y * scale;
  g.fillStyle = ink;
  g.beginPath();
  g.arc(x, y, INK_R * 1.7 * scale, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = ink;
  g.lineWidth = Math.max(1, 1.2 * scale);
  const pr = (INK_R * 3 + (Math.sin(t * 9) + 1) * 2) * scale;
  g.beginPath();
  g.arc(x, y, pr, 0, Math.PI * 2);
  g.stroke();
}

// A vector version of the painting for plotters and print shops.
export function paintingSVG(world, palette, meta = {}) {
  const parts = [];
  const f = (n) => Math.round(n * 10) / 10;
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W / 100 * 2.54 * 4}cm" height="${H / 100 * 2.54 * 4}cm">`);
  if (meta.title) parts.push(`<title>${escapeXml(meta.title)}</title>`);
  parts.push(`<rect width="${W}" height="${H}" fill="${palette.paper}"/>`);
  world.stones.forEach((s, i) => {
    const ink = palette.inks[1 + (i % 2)];
    parts.push(`<circle cx="${f(s.x)}" cy="${f(s.y)}" r="${s.r}" fill="none" stroke="${ink}" stroke-width="2"/>`);
  });
  let i = 1;
  while (i < world.sx.length) {
    const ink = world.sink[i];
    let d = `M${f(world.sx[i - 1])} ${f(world.sy[i - 1])}`;
    while (i < world.sx.length && world.sink[i] === ink) {
      d += `L${f(world.sx[i])} ${f(world.sy[i])}`;
      i++;
    }
    parts.push(`<path d="${d}" fill="none" stroke="${palette.inks[ink]}" stroke-width="${INK_R * 2}" stroke-linecap="round" stroke-linejoin="round" style="mix-blend-mode:multiply"/>`);
  }
  parts.push(`<circle cx="${f(world.x)}" cy="${f(world.y)}" r="12" fill="${palette.inks[world.ink]}"/>`);
  parts.push('</svg>');
  return parts.join('\n');
}

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
}
