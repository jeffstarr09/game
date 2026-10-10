// Sharing: a spoiler-free text strip (like Wordle's grid) and a poster image
// of the actual painting. The poster is the thing people post; it is also
// the product we will eventually print and sell.
import { renderPainting, paintingSVG } from './render.js';
import { hexToRgb } from './palette.js';

const TIER_WORDS = {
  masterpiece: 'THE MASTERPIECE',
  line: 'hung on the line',
  skyed: 'skyed',
  refuses: 'Salon des Refusés',
};

// Nearest emoji square for a riso ink, so the strip carries the day's colours.
function inkEmoji(hex) {
  const [r, g, b] = hexToRgb(hex);
  const opts = [
    ['🟥', [230, 60, 60]], ['🟧', [255, 120, 40]], ['🟨', [255, 220, 0]], ['🟩', [20, 170, 90]],
    ['🟦', [40, 100, 200]], ['🟪', [150, 80, 180]], ['⬛', [30, 30, 30]], ['🟫', [140, 80, 60]],
  ];
  let best = opts[0][0];
  let bd = Infinity;
  for (const [e, [er, eg, eb]] of opts) {
    const d = (r - er) ** 2 + (g - eg) ** 2 + (b - eb) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  // fluorescent pink reads best as purple-square
  if (r > 230 && g < 120 && b > 140) best = '🟪';
  return best;
}

// One glyph per five seconds alive; a coloured square when a pigment was
// taken in that window; the blot at the end.
export function strip(world, pickups, palette) {
  const cells = Math.max(1, Math.ceil(world.tick / 300));
  const out = [];
  for (let i = 0; i < Math.min(cells, 24); i++) {
    const p = pickups.find((q) => q.tick > i * 300 && q.tick <= (i + 1) * 300);
    out.push(p ? inkEmoji(palette.inks[p.ink]) : '〰️');
  }
  if (cells > 24) out.push('…');
  out.push('✖️');
  return out.join('');
}

export function shareText({ day, title, score, tier, rank, total, world, pickups, palette, practice }) {
  const lines = [];
  lines.push(practice ? 'ON THE LINE · studio sketch' : `ON THE LINE · No. ${day}`);
  lines.push(`“${title}”`);
  let l3 = `${score.toLocaleString('en-US')}`;
  if (rank) l3 += ` — ${TIER_WORDS[tier]} (#${rank} of ${total})`;
  lines.push(l3);
  lines.push(strip(world, pickups, palette));
  lines.push(location.origin);
  return lines.join('\n');
}

// 1080×1350 (4:5) poster: the painting framed on a cream sheet with a
// typeset label underneath. Works on Instagram, X and in group chats.
export async function poster({ world, palette, title, artist, day, score, tier, rank, total, practice }) {
  await document.fonts?.ready;
  const Wp = 1080;
  const Hp = 1350;
  const c = document.createElement('canvas');
  c.width = Wp;
  c.height = Hp;
  const g = c.getContext('2d');
  g.fillStyle = '#3a1310';
  g.fillRect(0, 0, Wp, Hp);

  const pw = 690;
  const ph = (pw * 4) / 3;
  const px = (Wp - pw) / 2;
  const py = 70;
  // frame + mat
  g.fillStyle = '#15110f';
  g.fillRect(px - 52, py - 52, pw + 104, ph + 104);
  g.fillStyle = '#faf7f1';
  g.fillRect(px - 36, py - 36, pw + 72, ph + 72);
  const art = renderPainting(world, palette, pw);
  g.drawImage(art, px, py, pw, ph);

  // label
  const ly = py + ph + 80;
  g.fillStyle = '#f6f2ea';
  g.fillRect(70, ly, Wp - 140, Hp - ly - 40);
  g.fillStyle = '#161412';
  g.font = "italic 44px 'Instrument Serif', serif";
  g.fillText(fit(g, `“${title}”`, Wp - 200), 100, ly + 58);
  g.font = "700 22px 'Bricolage Grotesque', sans-serif";
  g.fillText(`${artist} · ${practice ? 'studio sketch' : 'Exhibition No. ' + day}`, 100, ly + 98);
  g.font = "700 34px 'Space Mono', monospace";
  const sc = score.toLocaleString('en-US');
  g.fillText(sc, 100, ly + 150);
  if (rank) {
    g.font = "800 22px 'Bricolage Grotesque', sans-serif";
    g.fillStyle = tier === 'masterpiece' ? '#c2187a' : '#161412';
    g.fillText(`${TIER_WORDS[tier].toUpperCase()} · #${rank} OF ${total}`, 100 + g.measureText(sc).width + 160, ly + 148);
  }
  g.fillStyle = '#6b655c';
  g.font = "400 18px 'Space Mono', monospace";
  g.textAlign = 'right';
  g.fillText('ON THE LINE', Wp - 100, ly + 98);
  g.textAlign = 'left';
  return c;
}

function fit(g, text, max) {
  if (g.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 4 && g.measureText(t + '…”').width > max) t = t.slice(0, -1);
  return t + '…”';
}

export async function shareRun(info) {
  const text = shareText(info);
  let blob = null;
  try {
    const c = await poster(info);
    blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  } catch {}
  const file = blob ? new File([blob], `on-the-line-${info.practice ? 'sketch' : info.day}.png`, { type: 'image/png' }) : null;
  if (navigator.share) {
    try {
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ text, files: [file] });
      else await navigator.share({ text });
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch {}
  if (blob) download(blob, file.name);
  return 'copied';
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

export function downloadSVG(info) {
  const svg = paintingSVG(info.world, info.palette, { title: info.title });
  download(new Blob([svg], { type: 'image/svg+xml' }), `on-the-line-${info.practice ? 'sketch' : info.day}.svg`);
}
