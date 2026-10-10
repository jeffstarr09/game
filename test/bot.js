// A simple look-ahead player used by tests to produce real, valid runs.
import * as S from '../public/js/sim.js';
const { W, H } = S.CONST;

function free(w, x, y) {
  if (x < 10 || y < 10 || x > W - 10 || y > H - 10) return false;
  for (const s of w.stones) if ((s.x - x) ** 2 + (s.y - y) ** 2 < (s.r + 12) ** 2) return false;
  const n = w.sx.length - 16;
  for (let i = 1; i < n; i++) if ((w.sx[i] - x) ** 2 + (w.sy[i] - y) ** 2 < 121) return false;
  return true;
}
function probe(w, inp, horizon) {
  let a = w.ang, x = w.x, y = w.y;
  let k = 0;
  for (; k < horizon; k++) {
    a = (a + inp * 46) & 4095;
    const t = (a / 4096) * 2 * Math.PI;
    x += Math.cos(t) * w.speed;
    y += Math.sin(t) * w.speed;
    if (!free(w, x, y)) break;
  }
  return k;
}

export function playBot(seed, { maxTicks = 3000, skill = 60 } = {}) {
  const w = S.createWorld(seed);
  const inputs = [];
  let cur = 0;
  while (w.alive) {
    if (w.tick >= maxTicks) cur = cur || 1; // give up: spiral into own line
    else if (w.tick % 4 === 0) {
      let best = -1;
      for (const i of [cur, 0, -1, 1]) {
        const p = probe(w, i, skill);
        if (p > best) { best = p; cur = i; }
      }
    }
    inputs.push(cur);
    S.step(w, cur);
    w.events.length = 0;
  }
  return { w, inputs, encoded: S.encodeInputs(inputs), score: S.finalScore(w) };
}
