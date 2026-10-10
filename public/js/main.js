// ON THE LINE — the app. One wall, one frame, one label.
import * as Sim from './sim.js';
import { paletteFor } from './palette.js';
import { Sheet, renderPainting, drawPigment, drawNib } from './render.js';
import * as Sound from './audio.js';
import * as Net from './net.js';
import { titleFor } from './titles.js';
import { shareRun, downloadSVG } from './share.js';
import { dateFor, dateOfDay } from './calendar.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const DPR = () => Math.min(window.devicePixelRatio || 1, 2);

const stage = $('#stage');
const sctx = stage.getContext('2d');
const frameEl = $('#frame');
const overlay = $('#overlay');
const placard = $('#placard');
const hud = $('#hud');
const hudScore = $('#hudScore');
const hudMult = $('#hudMult');

const TIER = {
  masterpiece: { label: 'The Masterpiece', blurb: 'Hung alone, at the centre of the wall. Everyone who visits today sees it first.' },
  line: { label: 'Hung on the line', blurb: 'Eye level, the best spot on the wall.' },
  skyed: { label: 'Skyed', blurb: 'Hung up near the ceiling. Visible, if you crane your neck.' },
  refuses: { label: 'Salon des Refusés', blurb: 'Not hung today. The refused have their own room.' },
};
const tierFor = (rank) => (rank === 1 ? 'masterpiece' : rank <= 10 ? 'line' : rank <= 100 ? 'skyed' : 'refuses');

const S = {
  screen: 'gallery',
  mode: 'idle', // idle | ready | play | paused | dead
  today: null,
  daily: true,
  seed: 0,
  date: null,
  palette: null,
  world: null,
  sheet: null,
  inputs: [],
  pickups: [],
  ticketP: null,
  acc: 0,
  last: 0,
  t: 0,
  particles: [],
  deadAt: 0,
  runs: 0,
  result: null,
  lastScoreShown: -1,
  foyerArt: null,
  lastAd: Date.now(),
};

// ------------------------------------------------------------------ sizing
function fitStage() {
  const r = stage.getBoundingClientRect();
  const pw = Math.max(60, Math.round(r.width * DPR()));
  if (stage.width !== pw) {
    stage.width = pw;
    stage.height = Math.round((pw * Sim.H) / Sim.W);
    return true;
  }
  return false;
}

function rebuildSheet() {
  fitStage();
  const ghost = S.sheet?.ghostPts;
  S.sheet = new Sheet(stage.width, S.palette, S.world);
  if (ghost) {
    S.sheet.setGhost(ghost);
    S.sheet.advanceGhost(S.world.tick);
  }
  S.sheet.inkTo();
  if (!S.world.alive) S.sheet.blot();
}

window.addEventListener('resize', () => {
  if (S.mode === 'idle') drawFoyerArt();
  else if (S.world && fitStage()) rebuildSheet();
});

// ------------------------------------------------------------------ input
const held = [];
const pointers = new Map();
function press(d) {
  const i = held.indexOf(d);
  if (i >= 0) held.splice(i, 1);
  held.push(d);
  Sound.unlock();
  if (S.mode === 'ready' || S.mode === 'paused') begin();
}
function release(d) {
  const i = held.lastIndexOf(d);
  if (i >= 0) held.splice(i, 1);
}
const currentDir = () => (held.length ? held[held.length - 1] : 0);

window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea')) return;
  if (e.repeat && (e.code === 'Space' || e.code === 'Enter')) return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
    if (!e.repeat) press(-1);
    e.preventDefault();
  } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
    if (!e.repeat) press(1);
    e.preventDefault();
  } else if (e.code === 'Space' || e.code === 'Enter') {
    if (e.target.closest?.('button') && e.code === 'Enter') return;
    e.preventDefault();
    action();
  } else if (e.code === 'Escape' && S.mode !== 'idle' && S.mode !== 'play') {
    foyer();
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') release(-1);
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') release(1);
});

window.addEventListener(
  'pointerdown',
  (e) => {
    if (S.screen !== 'gallery') return;
    if (e.target.closest('button, input, a, dialog, .placard, .topbar')) return;
    if (S.mode === 'ready' || S.mode === 'play' || S.mode === 'paused') {
      const d = e.clientX < window.innerWidth / 2 ? -1 : 1;
      pointers.set(e.pointerId, d);
      press(d);
      e.preventDefault();
    } else if (S.mode === 'dead' && e.target.closest('#frame')) {
      action();
    }
  },
  { passive: false }
);
const lift = (e) => {
  if (pointers.has(e.pointerId)) {
    release(pointers.get(e.pointerId));
    pointers.delete(e.pointerId);
  }
};
window.addEventListener('pointerup', lift);
window.addEventListener('pointercancel', lift);
window.addEventListener('blur', () => {
  held.length = 0;
  pointers.clear();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && S.mode === 'play') pause();
});

function action() {
  Sound.unlock();
  if (S.mode === 'ready' || S.mode === 'paused') begin();
  else if (S.mode === 'dead' && performance.now() - S.deadAt > 350) startRun(S.daily);
  else if (S.mode === 'idle' && S.screen === 'gallery') startRun(true);
}

// ------------------------------------------------------------------ screens
function show(screen) {
  S.screen = screen;
  $('#gallery').hidden = screen !== 'gallery';
  $('#wallScreen').hidden = screen !== 'wall';
  $('#collectionScreen').hidden = screen !== 'collection';
  document.querySelectorAll('.topbar nav button[data-go]').forEach((b) => {
    if (b.dataset.go === screen) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  if (screen !== 'gallery') {
    document.body.classList.remove('playing');
    if (S.mode === 'play') pause();
  }
}

document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) {
    e.preventDefault();
    const where = go.dataset.go;
    if (where === 'foyer') foyer();
    else if (where === 'wall') openWall(0);
    else if (where === 'collection') openCollection();
    else if (where === 'play') startRun(true);
    else if (where === 'practice') startRun(false);
  }
});

const muteBtn = $('#mute');
function syncMute() {
  muteBtn.textContent = Sound.isMuted() ? '♪ off' : '♪ on';
}
muteBtn.addEventListener('click', () => {
  Sound.unlock();
  Sound.setMuted(!Sound.isMuted());
  syncMute();
});
syncMute();

// ------------------------------------------------------------------ foyer
async function foyer() {
  maybeAdBreak();
  show('gallery');
  S.mode = 'idle';
  document.body.classList.remove('playing');
  hud.hidden = true;
  overlay.innerHTML = '';
  Sound.penStop();
  if (!S.today) S.today = await Net.today();
  const t = S.today;
  S.palette = paletteFor(t.seed);
  S.foyerArt = { world: Sim.createWorld(t.seed), empty: true };
  drawFoyerArt();
  renderFoyerPlacard(null, null);

  const [board, profile] = await Promise.all([Net.board(t.date).catch(() => null), Net.profile()]);
  if (S.mode !== 'idle' || S.screen !== 'gallery') return;
  let master = null;
  if (board?.top?.[0]) {
    try {
      const run = await Net.run(board.top[0].runId);
      const world = Sim.replay(run.seed, Sim.decodeInputs(run.inputs));
      master = { ...board.top[0], world, title: titleFor(world, S.palette.names) };
      S.foyerArt = { world, empty: false };
      if (S.mode === 'idle') drawFoyerArt();
    } catch {}
  }
  if (S.mode === 'idle' && S.screen === 'gallery') renderFoyerPlacard(board, profile, master);
}

function drawFoyerArt() {
  if (!S.foyerArt) return;
  fitStage();
  const art = renderPainting(S.foyerArt.world, S.palette, stage.width);
  sctx.clearRect(0, 0, stage.width, stage.height);
  sctx.drawImage(art, 0, 0);
  if (S.foyerArt.empty) {
    overlay.innerHTML = `<div class="big">Today's<br>paper</div><div class="hint">Nobody has drawn on it yet.</div>`;
  } else overlay.innerHTML = '';
}

function closesIn() {
  if (!S.today) return '';
  const end = Date.parse(S.today.date + 'T00:00:00Z') + 86400000;
  let s = Math.max(0, Math.floor((end - Date.now()) / 1000));
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
setInterval(() => {
  const el = $('#closes');
  if (el) el.textContent = 'closes ' + closesIn();
  if (S.today && dateFor(Date.now()) !== S.today.date && S.mode === 'idle') {
    S.today = null;
    foyer();
  }
}, 1000);

function streak() {
  const days = new Set(Net.store.load('otl.days', []));
  let d = Date.parse(dateFor(Date.now()) + 'T00:00:00Z');
  if (!days.has(dateFor(d))) d -= 86400000; // today not played yet is fine
  let n = 0;
  let lastSkip = -Infinity;
  for (let i = 0; i < 400; i++) {
    if (days.has(dateFor(d))) n++;
    else if (n > 0 && i - lastSkip > 7 && days.has(dateFor(d - 86400000))) lastSkip = i; // one forgiven day a week
    else break;
    d -= 86400000;
  }
  return n;
}

function renderFoyerPlacard(board, profile, master) {
  const t = S.today;
  const me = Net.me();
  const local = Net.store.load('otl.best.' + t.date, null);
  let notice = '';
  const n = profile?.notices?.[0];
  if (n) {
    notice = `<div class="notice">Your painting from No. ${n.day} was moved: <b>${esc(TIER[n.wasTier].label)}</b> → ${esc(TIER[n.nowTier].label.toLowerCase())} (#${n.now}). ${n.by ? `<b>${esc(n.by)}</b> now holds the Masterpiece.` : ''}</div>`;
  }
  let head;
  if (master) {
    const yours = master.you;
    head = `
      <h2>“${esc(master.title)}”</h2>
      <div class="artist">${esc(master.name)}</div>
      <div class="medium">Riso ink on paper · ${master.seconds} s · ${yours ? 'your painting is today’s Masterpiece' : 'today’s Masterpiece, so far'}</div>
      <div class="score">${fmt(master.score)}</div>`;
  } else {
    head = `
      <h2>The wall is empty.</h2>
      <div class="medium">${board ? 'Nobody has hung a painting today. The first one up is the Masterpiece until someone takes it down.' : 'Draw one line on today’s paper. Never cross it. The best painting of the day is hung for everyone to see.'}</div>`;
  }
  const prolific = board?.prolific
    ? `<p class="crown">Most prolific today: <b>${esc(board.prolific.name)}</b> — ${fmt(board.prolific.ink / 100)} m of ink</p>`
    : '';
  const st = streak();
  const yourBest = board?.me
    ? `<span>Your best</span><b>${fmt(board.me.score)} · #${board.me.rank}</b>`
    : local
      ? `<span>Your best</span><b>${fmt(local.score)}</b>`
      : '';
  placard.innerHTML = `
    <div class="eyebrow"><span>Exhibition No. ${t.day}</span><span id="closes">closes ${closesIn()}</span></div>
    ${notice}
    ${head}
    <hr>
    <div class="stats">
      ${board ? `<span>Artists today</span><b>${fmt(board.total)}</b><span>Lines drawn</span><b>${fmt(board.attempts)}</b>` : ''}
      ${yourBest}
      ${st > 1 ? `<span>Exhibitions in a row</span><b>${st}</b>` : ''}
      ${profile?.masterpieces ? `<span>Your Masterpieces</span><b>${profile.masterpieces}</b>` : ''}
    </div>
    ${prolific}
    <div class="actions">
      <button class="btn primary" data-go="play">Draw today's line</button>
      <button class="btn" data-go="practice">Studio practice</button>
      <button class="btn" data-go="wall">The Wall</button>
    </div>
    ${!board && !t.offline ? '' : t.offline ? '<p class="muted">Offline: your paintings are kept on this device.</p>' : ''}
    ${me && !me.anonymous ? `<p class="muted">Signed as ${esc(me.name)}.</p>` : ''}
  `;
}

// ------------------------------------------------------------------ a run
function randomSeed() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
}

async function startRun(daily) {
  show('gallery');
  if (daily && !S.today) S.today = await Net.today();
  S.daily = daily;
  S.date = daily ? S.today.date : null;
  S.seed = daily ? S.today.seed : randomSeed();
  S.palette = paletteFor(S.seed);
  S.world = Sim.createWorld(S.seed);
  S.inputs = [];
  S.pickups = [];
  S.particles = [];
  S.acc = 0;
  S.result = null;
  S.lastScoreShown = -1;
  held.length = 0;
  pointers.clear();
  S.sheet = null;
  rebuildSheet();
  // Underdrawing: your best line on this paper, in pencil, racing you.
  if (daily) {
    const best = Net.store.load('otl.best.' + S.date, null);
    if (best?.inputs) {
      const g = Sim.replay(S.seed, Sim.decodeInputs(best.inputs) || []);
      S.sheet.setGhost({ sx: g.sx, sy: g.sy });
    }
    S.ticketP = Net.startTicket();
  } else S.ticketP = null;

  S.mode = 'ready';
  document.body.classList.add('playing');
  hud.hidden = false;
  updateHud(true);
  const touch = matchMedia('(pointer: coarse)').matches;
  overlay.innerHTML = touch
    ? `<div class="sides"><span>hold to steer ←</span><span>→ hold to steer</span></div><div class="big">${daily ? 'No. ' + S.today.day : 'Studio'}</div><div class="hint">Never cross your own line.<br>Hold a side to start.</div>`
    : `<div class="big">${daily ? 'No. ' + S.today.day : 'Studio'}</div><div class="hint">Steer with <kbd>←</kbd> <kbd>→</kbd> or <kbd>A</kbd> <kbd>D</kbd><br>Never cross your own line.<br>Press a key to start.</div>`;
  placard.innerHTML = `<div class="eyebrow"><span>${daily ? 'Exhibition No. ' + S.today.day : 'Studio practice'}</span><span>${daily ? 'counts today' : 'not judged'}</span></div>
    <p class="muted">Collect pigment to raise your multiplier. Flying close to your own line scores more. The page fills up; that is the point.</p>`;
}

function begin() {
  if (S.mode !== 'ready' && S.mode !== 'paused') return;
  S.mode = 'play';
  overlay.innerHTML = '';
  S.last = performance.now();
  S.acc = 0;
}

function pause() {
  S.mode = 'paused';
  Sound.penStop();
  held.length = 0;
  pointers.clear();
  overlay.innerHTML = `<div class="big">Paused</div><div class="hint">Steer to carry on.</div>`;
}

function tickOnce() {
  const w = S.world;
  const dir = currentDir();
  S.inputs.push(dir);
  Sim.step(w, dir);
  for (const ev of w.events) {
    if (ev.t === 'pigment') {
      S.pickups.push({ tick: w.tick, ink: ev.ink });
      Sound.pigment(ev.n);
      burst(ev.x, ev.y, ev.ink, 22, 3.2);
      hudMult.classList.remove('bump');
      void hudMult.offsetWidth;
      hudMult.classList.add('bump');
    } else if (ev.t === 'graze-off') {
      // a long close call earns a little flourish
      burst(ev.x, ev.y, w.ink, Math.min(30, ev.n / 6), 2);
    }
  }
  w.events.length = 0;
  if (w.grazing && w.tick % 3 === 0) {
    const a = Math.random() * Math.PI * 2;
    S.particles.push({ x: w.x, y: w.y, vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 1.5, life: 0.35, max: 0.35, ink: w.ink, kind: 'dash' });
  }
  S.sheet.inkTo();
  S.sheet.advanceGhost(w.tick);
  if (!w.alive) die();
}

function burst(x, y, ink, n, sp) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
    const v = sp * (0.6 + Math.random() * 0.8);
    S.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6, max: 0.6, ink, kind: 'dot' });
  }
}

function updateHud(force) {
  const w = S.world;
  const sc = Sim.finalScore(w);
  if (force || sc !== S.lastScoreShown) {
    hudScore.textContent = fmt(sc);
    S.lastScoreShown = sc;
  }
  const m = '×' + w.mult.toFixed(2);
  if (hudMult.textContent !== m) hudMult.textContent = m;
}

// ------------------------------------------------------------------ death & results
async function die() {
  const w = S.world;
  S.mode = 'dead';
  S.deadAt = performance.now();
  S.runs++;
  held.length = 0;
  S.sheet.blot();
  burst(w.x, w.y, w.ink, 26, 4.5);
  Sound.death();
  frameEl.classList.remove('shake');
  void frameEl.offsetWidth;
  frameEl.classList.add('shake');
  document.body.classList.remove('playing');

  const score = Sim.finalScore(w);
  const title = titleFor(w, S.palette.names);
  const encoded = Sim.encodeInputs(S.inputs);
  const me = Net.me();
  S.result = { world: w, score, title, inputs: encoded, palette: S.palette, pickups: S.pickups.slice(), daily: S.daily, day: S.today?.day, date: S.date, pending: S.daily, server: null };

  let prevBest = null;
  if (S.daily) {
    prevBest = Net.store.load('otl.best.' + S.date, null);
    if (!prevBest || score > prevBest.score) Net.store.save('otl.best.' + S.date, { score, inputs: encoded, title });
    const days = Net.store.load('otl.days', []);
    if (!days.includes(S.date)) Net.store.save('otl.days', [...days.slice(-400), S.date]);
  } else {
    prevBest = Net.store.load('otl.studio', null);
    if (!prevBest || score > prevBest.score) Net.store.save('otl.studio', { score });
  }
  S.result.prevBest = prevBest?.score ?? null;
  renderResult();

  if (S.daily && w.tick >= 10) {
    const result = S.result;
    try {
      const ticket = await S.ticketP;
      if (!ticket) throw new Error('offline');
      // The server checks you could not have played this faster than real time.
      const res = await Net.submitRun({ date: result.date, inputs: encoded, score, ticket });
      result.server = res;
      if (res.rank) Sound.chord(res.rank);
    } catch (e) {
      result.error = e.status === 422 ? 'This run could not be verified, so it was not hung.' : e.status === 400 ? e.message : 'Could not reach the gallery. Your painting is saved on this device.';
    }
    result.pending = false;
    if (S.result === result && S.mode === 'dead') renderResult();
  } else {
    S.result.pending = false;
  }
}

function renderResult() {
  const r = S.result;
  const w = r.world;
  const me = Net.me();
  const srv = r.server;
  const secs = Math.round(w.tick / 60);
  const best = Math.max(r.score, r.prevBest ?? 0);
  const newBest = r.prevBest == null || r.score > r.prevBest;

  let verdict = '';
  if (r.daily) {
    if (r.pending) verdict = `<p class="verdict">Hanging…</p>`;
    else if (srv) {
      const tier = srv.tier;
      const pct = srv.total > 1 ? Math.round(((srv.total - srv.rank) / (srv.total - 1)) * 100) : 100;
      verdict = srv.improved
        ? `<p class="verdict ${tier}">${esc(TIER[tier].label)} — #${srv.rank} of ${fmt(srv.total)}</p><p class="muted">${esc(TIER[tier].blurb)}${srv.total > 2 && pct >= 10 ? ` Better than ${pct}% of today’s artists.` : ''}</p>`
        : `<p class="verdict">Not your best.</p><p class="muted">Your best painting still hangs at #${srv.rank} (${esc(TIER[tier].label.toLowerCase())}).</p>`;
      if (srv.rival) verdict += `<p class="rival">${fmt(srv.rival.gap + 1)} more to pass <b>${esc(srv.rival.name)}</b> (#${srv.rival.rank}).</p>`;
      else if (srv.rank === 1) verdict += `<p class="rival">Until someone takes it down.</p>`;
    } else if (r.error) verdict = `<p class="muted">${esc(r.error)}</p>`;
  }

  const sign =
    r.daily && me?.anonymous && srv
      ? `<form class="sign" id="signForm"><input id="signName" maxlength="14" placeholder="Sign your work" autocomplete="nickname" aria-label="Your name"><button class="btn" type="submit">Sign</button></form>`
      : '';

  placard.innerHTML = `
    <div class="eyebrow"><span>${r.daily ? 'Exhibition No. ' + r.day : 'Studio sketch'}</span><span>${newBest && r.prevBest != null ? 'new personal best' : ''}</span></div>
    <h2>“${esc(r.title)}”</h2>
    <div class="artist">${esc(me?.name || 'Anonymous')}</div>
    <div class="medium">Riso ink on paper · ${secs} s · ${w.pigments} pigment${w.pigments === 1 ? '' : 's'}</div>
    <div class="score">${fmt(r.score)}${!newBest ? `<small>best ${fmt(best)}</small>` : ''}</div>
    ${verdict}
    ${sign}
    <div class="actions">
      <button class="btn primary" id="again">Again <kbd>space</kbd></button>
      <button class="btn" id="share">Share</button>
      <button class="btn" id="print">Print file</button>
      ${r.daily ? '<button class="btn" data-go="wall">The Wall</button>' : '<button class="btn" data-go="play">Today’s line</button>'}
      <button class="btn link" data-go="foyer">Back to the foyer</button>
    </div>`;
  $('#again').onclick = () => startRun(S.daily);
  $('#share').onclick = async () => {
    const out = await shareRun(shareInfo(r));
    if (out === 'copied') toast('Copied to clipboard, poster downloaded.');
  };
  $('#print').onclick = () => {
    downloadSVG(shareInfo(r));
    toast('Vector print file saved. Framed prints are coming soon.');
  };
  const form = $('#signForm');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const name = $('#signName').value;
      try {
        await Net.rename(name);
        renderResult();
        toast('Signed. Your name is on the wall.');
      } catch (err) {
        toast(err.message || 'Could not sign.');
      }
    };
  }
}

function shareInfo(r) {
  const me = Net.me();
  return {
    world: r.world,
    palette: r.palette,
    pickups: r.pickups,
    title: r.title,
    artist: me?.name || 'ANONYMOUS',
    day: r.day,
    score: r.score,
    tier: r.server?.tier,
    rank: r.server?.rank,
    total: r.server?.total,
    practice: !r.daily,
  };
}

let toastTimer = null;
function toast(msg) {
  let el = $('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3200);
}

// ------------------------------------------------------------------ main loop
function loop(ts) {
  const dt = Math.min(0.1, (ts - S.last) / 1000 || 0);
  S.last = ts;
  S.t += dt;
  if (S.mode === 'play') {
    S.acc += dt;
    let n = 0;
    while (S.acc >= 1 / Sim.TICK_HZ && n < 8 && S.mode === 'play') {
      tickOnce();
      S.acc -= 1 / Sim.TICK_HZ;
      n++;
    }
    if (S.mode === 'play') Sound.penUpdate(S.world.speed, currentDir() !== 0, S.world.grazing, S.world.grazeStreak);
  }
  if (S.mode !== 'idle' && S.sheet && S.screen === 'gallery') draw(dt);
  requestAnimationFrame(loop);
}

function draw(dt) {
  const w = S.world;
  const sh = S.sheet;
  const s = sh.scale;
  sctx.clearRect(0, 0, stage.width, stage.height);
  sh.composite(sctx, 0, 0, (g) => {
    for (const p of w.pigs) drawPigment(g, p, s, S.palette.inks[p.ink], S.t);
    if (w.alive) drawNib(g, w, s, S.palette.inks[w.ink], S.t);
    if (S.mode === 'ready') {
      // a beacon so you can find your nib before you start
      const k = (S.t * 1.2) % 1;
      g.strokeStyle = S.palette.inks[w.ink];
      g.globalAlpha = 1 - k;
      g.lineWidth = Math.max(1.5, 2.5 * s);
      g.beginPath();
      g.arc(w.x * s, w.y * s, (10 + k * 46) * s, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }
  });
  // particles
  for (let i = S.particles.length - 1; i >= 0; i--) {
    const p = S.particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      S.particles.splice(i, 1);
      continue;
    }
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.92;
    p.vy *= 0.92;
    const a = p.life / p.max;
    sctx.globalAlpha = a;
    sctx.fillStyle = sctx.strokeStyle = S.palette.inks[p.ink];
    if (p.kind === 'dash') {
      sctx.lineWidth = Math.max(1, 1.4 * s);
      sctx.beginPath();
      sctx.moveTo(p.x * s, p.y * s);
      sctx.lineTo((p.x + p.vx * 4) * s, (p.y + p.vy * 4) * s);
      sctx.stroke();
    } else {
      sctx.beginPath();
      sctx.arc(p.x * s, p.y * s, Math.max(1, 3 * a * s), 0, Math.PI * 2);
      sctx.fill();
    }
  }
  sctx.globalAlpha = 1;
  updateHud(false);
}

// ------------------------------------------------------------------ the wall
let wallToken = 0;
async function openWall(offset) {
  show('wall');
  if (!S.today) S.today = await Net.today();
  const date = dateOfDay(S.today.day + offset);
  document.querySelectorAll('#wallScreen .tabs button').forEach((b) => b.setAttribute('aria-selected', String(Number(b.dataset.day) === offset)));
  $('#wallTitle').textContent = offset === 0 ? 'The Wall' : 'Yesterday’s wall';
  const salon = $('#salon');
  salon.innerHTML = '<p class="empty">Hanging the paintings…</p>';
  const token = ++wallToken;
  let b;
  try {
    b = await Net.board(date);
  } catch {
    salon.innerHTML = '<p class="empty">The gallery is closed right now (offline). Your paintings are safe on this device.</p>';
    return;
  }
  if (token !== wallToken) return;
  $('#wallSub').textContent = `Exhibition No. ${b.day} · ${fmt(b.total)} artists · ${fmt(b.attempts)} lines drawn${offset === 0 ? ' · closes ' + closesIn() : ' · closed'}`;
  if (!b.top.length) {
    salon.innerHTML = `<p class="empty">Nothing hung yet. The first painting up is the Masterpiece.</p>`;
    return;
  }
  const groups = { masterpiece: [], line: [], skyed: [], refuses: [] };
  for (const e of [...b.top, ...b.around]) {
    const k = tierFor(e.rank);
    if (!groups[k].some((x) => x.rank === e.rank)) groups[k].push(e);
  }
  let html = '';
  if (b.prolific) html += `<p class="crownline">Most prolific: <b>${esc(b.prolific.name)}</b>, ${fmt(b.prolific.ink / 100)} m of ink across ${b.prolific.runs} lines. Skill wins the Masterpiece; devotion wins this.</p>`;
  for (const k of ['masterpiece', 'line', 'skyed', 'refuses']) {
    if (!groups[k].length) continue;
    html += `<div class="tier"><h3>${TIER[k].label}</h3><span>${k === 'masterpiece' ? '#1' : k === 'line' ? '#2–10, eye level' : k === 'skyed' ? '#11–100, near the ceiling' : 'the next room'}</span></div><div class="tier-grid ${k}">`;
    for (const e of groups[k]) {
      html += `<button class="work ${k} ${e.you ? 'you' : ''}" data-run="${e.runId}" data-rank="${e.rank}">
        <div class="pframe"><canvas data-thumb="${e.runId}"></canvas></div>
        <div class="plate"><b>${esc(e.name)}</b><br>#${e.rank} · ${fmt(e.score)}</div>
      </button>`;
    }
    html += '</div>';
  }
  if (b.me && b.me.rank > 30 && !b.around.length) html += `<p class="crownline">You: #${b.me.rank}</p>`;
  salon.innerHTML = html;
  paintThumbs(salon, token);
}

document.querySelectorAll('#wallScreen .tabs button').forEach((btn) => btn.addEventListener('click', () => openWall(Number(btn.dataset.day))));

async function paintThumbs(root, token) {
  for (const c of root.querySelectorAll('canvas[data-thumb]')) {
    if (token !== wallToken) return;
    try {
      const run = await Net.run(Number(c.dataset.thumb));
      const world = Sim.replay(run.seed, Sim.decodeInputs(run.inputs));
      const w = Math.max(80, Math.round(c.getBoundingClientRect().width * DPR()));
      const art = renderPainting(world, paletteFor(run.seed), w);
      c.width = art.width;
      c.height = art.height;
      c.getContext('2d').drawImage(art, 0, 0);
      await new Promise((r) => setTimeout(r, 0));
    } catch {}
  }
}

document.addEventListener('click', (e) => {
  const work = e.target.closest('.work[data-run]');
  if (work) openViewer(Number(work.dataset.run), work.dataset.rank ? Number(work.dataset.rank) : null);
});

async function openCollection() {
  show('collection');
  const grid = $('#collectionGrid');
  grid.innerHTML = '<p class="empty">Fetching the collection…</p>';
  const token = ++wallToken;
  try {
    const { works } = await Net.collection();
    if (!works.length) {
      grid.innerHTML = '<p class="empty">The collection is empty. The first Masterpiece joins it at midnight UTC.</p>';
      return;
    }
    grid.innerHTML = works
      .map(
        (w) => `<button class="work line" data-run="${w.runId}">
        <div class="pframe"><canvas data-thumb="${w.runId}"></canvas></div>
        <div class="plate"><b>${esc(w.name)}</b><br>No. ${w.day} · ${fmt(w.score)}</div></button>`
      )
      .join('');
    paintThumbs(grid, token);
  } catch {
    grid.innerHTML = '<p class="empty">The archive is closed right now (offline).</p>';
  }
}

// ------------------------------------------------------------------ viewer
const viewer = $('#viewer');
let viewToken = 0;
viewer.addEventListener('click', (e) => {
  if (e.target === viewer || e.target.closest('[data-close]')) viewer.close();
});
viewer.addEventListener('close', () => viewToken++);

async function openViewer(runId, rank) {
  const token = ++viewToken;
  const run = await Net.run(runId).catch(() => null);
  if (!run || token !== viewToken) return;
  const inputs = Sim.decodeInputs(run.inputs);
  const palette = paletteFor(run.seed);
  const finalW = Sim.replay(run.seed, inputs);
  const title = titleFor(finalW, palette.names);
  const tier = rank ? tierFor(rank) : 'masterpiece';
  $('#viewerPlacard').innerHTML = `
    <div class="eyebrow"><span>Exhibition No. ${run.day}</span><span>${rank ? '#' + rank : 'collection'}</span></div>
    <h2>“${esc(title)}”</h2>
    <div class="artist">${esc(run.name)}</div>
    <div class="medium">Riso ink on paper · ${Math.round(finalW.tick / 60)} s · ${finalW.pigments} pigments</div>
    <div class="score">${fmt(run.score)}</div>
    <p class="verdict ${tier}">${esc(TIER[tier].label)}</p>
    <div class="actions"><button class="btn" id="replayBtn">Watch it drawn</button></div>`;
  viewer.showModal();
  const canvas = $('#viewerCanvas');
  const draw = (anim) => {
    const pw = Math.round(canvas.getBoundingClientRect().width * DPR());
    canvas.width = pw;
    canvas.height = Math.round((pw * 4) / 3);
    const ctx = canvas.getContext('2d');
    if (!anim) {
      ctx.drawImage(renderPainting(finalW, palette, pw), 0, 0);
      return;
    }
    // Replay at 4× so you can study how the artist filled the page.
    const w = Sim.createWorld(run.seed);
    const sheet = new Sheet(pw, palette, w);
    let i = 0;
    const my = viewToken;
    const stepFrame = () => {
      if (my !== viewToken) return;
      for (let k = 0; k < 4 && i < inputs.length && w.alive; k++, i++) {
        Sim.step(w, inputs[i]);
        w.events.length = 0;
      }
      sheet.inkTo();
      if (!w.alive) sheet.blot();
      ctx.clearRect(0, 0, pw, canvas.height);
      sheet.composite(ctx, 0, 0, (g) => {
        for (const p of w.pigs) drawPigment(g, p, sheet.scale, palette.inks[p.ink], performance.now() / 1000);
        if (w.alive) drawNib(g, w, sheet.scale, palette.inks[w.ink], performance.now() / 1000);
      });
      if (w.alive && i < inputs.length) requestAnimationFrame(stepFrame);
    };
    stepFrame();
  };
  requestAnimationFrame(() => draw(false));
  $('#replayBtn').onclick = () => {
    viewToken++;
    const t = viewToken;
    requestAnimationFrame(() => {
      if (t === viewToken) draw(true);
    });
  };
}

// ------------------------------------------------------------------ ads
// Ads only ever appear on the way back to the foyer, never between a death
// and a retry. Disabled until we are approved for AdSense H5 games ads.
function maybeAdBreak() {
  if (!window.OTL_ADS || typeof window.adBreak !== 'function') return;
  if (S.runs < 3 || Date.now() - S.lastAd < 4 * 60 * 1000) return;
  S.lastAd = Date.now();
  window.adBreak({ type: 'browse', name: 'back-to-foyer' });
}

// ------------------------------------------------------------------ boot
requestAnimationFrame((ts) => {
  S.last = ts;
  loop(ts);
});
foyer();
