// ON THE LINE — game server. Serves the static client and the leaderboard API.
// Zero dependencies: node:http + node:sqlite. Every submitted run is replayed
// here with the same simulation the browser uses, so a score can only exist
// if the inputs actually produce it.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import * as Sim from '../public/js/sim.js';
import { dayNumber, dateFor, isValidDate, cleanName } from '../public/js/calendar.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

export function createApp({ dbFile = ':memory:', now = () => Date.now(), secret = process.env.TICKET_SECRET || randomBytes(32).toString('hex') } = {}) {
  const { q } = openDb(dbFile);
  const sign = (s) => createHmac('sha256', secret).update(s).digest('base64url').slice(0, 22);
  const buckets = new Map();

  function limited(ip, cost = 1, cap = 30, perSec = 0.5) {
    const t = now() / 1000;
    let b = buckets.get(ip);
    if (!b) b = { tokens: cap, t };
    b.tokens = Math.min(cap, b.tokens + (t - b.t) * perSec);
    b.t = t;
    buckets.set(ip, b);
    if (buckets.size > 50000) buckets.clear();
    if (b.tokens < cost) return true;
    b.tokens -= cost;
    return false;
  }

  const hash = (s) => createHash('sha256').update(String(s)).digest('hex');

  function auth(id, secret) {
    if (typeof id !== 'string' || typeof secret !== 'string') return null;
    const p = q.getPlayer.get(id);
    if (!p) return null;
    const a = Buffer.from(p.secret_hash);
    const b = Buffer.from(hash(secret));
    return a.length === b.length && timingSafeEqual(a, b) ? p : null;
  }

  function rankFor(date, row) {
    return q.rankOf.get(date, row.score, row.score, row.updated).n + 1;
  }

  function entry(r, rank) {
    return {
      rank,
      name: r.name,
      score: r.score,
      runId: r.run_id,
      seconds: Math.round(r.ticks / Sim.TICK_HZ),
      pigments: r.pigments,
      you: false,
      pid: r.player_id,
    };
  }

  function board(date, playerId, limit = 30) {
    const total = q.count.get(date).n;
    const top = q.top.all(date, limit, 0).map((r, i) => entry(r, i + 1));
    let me = null;
    let around = [];
    if (playerId) {
      const b = q.getBest.get(date, playerId);
      if (b) {
        const rank = rankFor(date, b);
        if (rank > limit) {
          const from = Math.max(0, rank - 3);
          around = q.top.all(date, 5, from).map((r, i) => entry(r, from + i + 1));
        }
        me = { rank, score: b.score, peak: b.peak_rank };
      }
    }
    for (const e of [...top, ...around]) {
      e.you = e.pid === playerId;
      delete e.pid;
    }
    const players = q.dailyPlayers.get(date).n;
    const attempts = q.dailyAttempts.get(date).n;
    // The second crown: whoever put the most ink on paper today. Skill wins
    // the Masterpiece; devotion wins this, so anyone can still take a crown.
    const pr = q.prolific.get(date);
    const prolific = pr ? { name: pr.name, ink: pr.ink, runs: pr.n, you: pr.player_id === playerId } : null;
    return { date, day: dayNumber(date), total, players, attempts, top, around, me, prolific };
  }

  async function api(req, res, url, body, ip) {
    const today = dateFor(now());
    const send = (code, obj) => {
      res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(obj));
    };

    if (url.pathname === '/api/today' && req.method === 'GET') {
      const t = now();
      const end = Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth(), new Date(t).getUTCDate() + 1);
      return send(200, { date: today, day: dayNumber(today), seed: Sim.dailySeed(today), closesIn: end - t, version: Sim.VERSION });
    }

    if (url.pathname === '/api/player' && req.method === 'POST') {
      if (limited(ip, 5)) return send(429, { error: 'slow down' });
      const name = cleanName(body?.name);
      if (!name) return send(400, { error: 'name must be 2–14 letters or numbers' });
      if (body?.id && body?.secret) {
        const p = auth(body.id, body.secret);
        if (!p) return send(403, { error: 'unknown player' });
        q.renamePlayer.run(name, p.id);
        return send(200, { id: p.id, name });
      }
      const id = randomBytes(9).toString('base64url');
      const secret = randomBytes(24).toString('base64url');
      q.insertPlayer.run(id, name, hash(secret), now());
      return send(200, { id, secret, name });
    }

    if (url.pathname === '/api/start' && req.method === 'POST') {
      // A signed ticket stamped with server time. A run must carry one, and it
      // cannot be redeemed faster than the run could actually have been played.
      if (limited(ip, 0.5)) return send(429, { error: 'slow down' });
      const p = auth(body?.id, body?.secret);
      if (!p) return send(403, { error: 'unknown player' });
      const t = now();
      return send(200, { ticket: `${p.id}.${t}.${sign(p.id + '.' + t)}` });
    }

    if (url.pathname === '/api/run' && req.method === 'POST') {
      if (limited(ip, 2)) return send(429, { error: 'slow down' });
      const p = auth(body?.id, body?.secret);
      if (!p) return send(403, { error: 'unknown player' });
      const date = body?.date;
      // Allow a short grace period so a run that started before midnight counts.
      const graceDate = dateFor(now() - 15 * 60 * 1000);
      if (date !== today && date !== graceDate) return send(400, { error: 'that exhibition has closed' });
      if (body?.version !== Sim.VERSION) return send(409, { error: 'please reload — the game was updated' });
      const inputs = Sim.decodeInputs(body?.inputs);
      if (!inputs || inputs.length < 10) return send(400, { error: 'bad run' });
      const seed = Sim.dailySeed(date);
      const w = Sim.replay(seed, inputs);
      const score = Sim.finalScore(w);
      if (score !== body?.score || w.tick !== inputs.length) return send(422, { error: 'run did not verify' });
      // Plausibility: humans cannot change input more than ~20 times a second
      // sustained. A bot flipping every tick is rejected.
      const tk = String(body?.ticket || '').split('.');
      const issued = Number(tk[1]);
      if (tk.length !== 3 || tk[0] !== p.id || tk[2] !== sign(tk[0] + '.' + tk[1])) return send(422, { error: 'run did not verify' });
      if (now() - issued < (inputs.length / Sim.TICK_HZ) * 1000 * 0.9 || now() - issued > 6 * 3600 * 1000) {
        return send(422, { error: 'run did not verify' });
      }
      let flips = 0;
      for (let i = 1; i < inputs.length; i++) if (inputs[i] !== inputs[i - 1]) flips++;
      if (flips / (inputs.length / Sim.TICK_HZ) > 20) return send(422, { error: 'run did not verify' });

      const t = now();
      q.bumpAttempts.run(date, p.id, Math.round(w.length));
      const prev = q.getBest.get(date, p.id);
      const prevRank = prev ? rankFor(date, prev) : null;
      let improved = false;
      let runId = null;
      if (!prev || score > prev.score) {
        runId = Number(q.insertRun.run(p.id, date, seed, score, w.tick, w.pigments, body.inputs, Sim.VERSION, t).lastInsertRowid);
        // Who did we just pass? Remember the old #1 so we can tell them.
        q.upsertBest.run(date, p.id, runId, score, t);
        improved = true;
      }
      const best = q.getBest.get(date, p.id);
      const rank = rankFor(date, best);
      if (best.peak_rank == null || rank < best.peak_rank) q.setPeak.run(rank, date, p.id);
      const total = q.count.get(date).n;
      // The painting directly above you: the one to beat next.
      let rival = null;
      if (rank > 1) {
        const r = q.top.get(date, 1, rank - 2);
        if (r) rival = { name: r.name, score: r.score, gap: r.score - best.score, rank: rank - 1 };
      }
      return send(200, {
        score,
        best: best.score,
        improved,
        rank,
        prevRank,
        total,
        rival,
        runId: runId ?? best.run_id,
        tier: tierFor(rank),
      });
    }

    if (url.pathname === '/api/board' && req.method === 'GET') {
      if (limited(ip, 0.5)) return send(429, { error: 'slow down' });
      const date = url.searchParams.get('date') || today;
      if (!isValidDate(date)) return send(400, { error: 'bad date' });
      const pid = url.searchParams.get('pid');
      return send(200, board(date, pid));
    }

    if (url.pathname.startsWith('/api/run/') && req.method === 'GET') {
      const id = Number(url.pathname.slice(9));
      const r = Number.isInteger(id) ? q.getRun.get(id) : null;
      if (!r) return send(404, { error: 'no such painting' });
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=31536000, immutable' });
      return res.end(
        JSON.stringify({ id: r.id, name: r.name, date: r.date, day: dayNumber(r.date), seed: r.seed, score: r.score, inputs: r.inputs, version: r.version })
      );
    }

    if (url.pathname === '/api/collection' && req.method === 'GET') {
      // The Permanent Collection: every day's Masterpiece, forever.
      const rows = q.winners.all(today, 60);
      return send(200, { works: rows.map((r) => ({ date: r.date, day: dayNumber(r.date), runId: r.run_id, score: r.score, name: r.name })) });
    }

    if (url.pathname === '/api/me' && req.method === 'POST') {
      if (limited(ip, 0.5)) return send(429, { error: 'slow down' });
      const p = auth(body?.id, body?.secret);
      if (!p) return send(403, { error: 'unknown player' });
      const days = q.playerDays.all(p.id, 30);
      const notices = [];
      for (const d of days.slice(0, 3)) {
        const cur = rankFor(d.date, { score: d.score, updated: q.getBest.get(d.date, p.id).updated });
        if (d.peak_rank != null && cur > d.peak_rank && tierFor(cur) !== tierFor(d.peak_rank)) {
          const top = q.top.get(d.date, 1, 0);
          notices.push({ date: d.date, day: dayNumber(d.date), was: d.peak_rank, now: cur, wasTier: tierFor(d.peak_rank), nowTier: tierFor(cur), by: top?.name });
        }
      }
      const masterpieces = days.filter((d) => d.date < today && rankFor(d.date, { score: d.score, updated: q.getBest.get(d.date, p.id).updated }) === 1).length;
      return send(200, { name: p.name, days: days.length, masterpieces, notices, attempts: q.getAttempts.get(today, p.id)?.n ?? 0, ink: q.getAttempts.get(today, p.id)?.ink ?? 0 });
    }

    return send(404, { error: 'not found' });
  }

  async function serveStatic(req, res, url) {
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end();
    }
    try {
      const s = await stat(file);
      if (!s.isFile()) throw new Error('not a file');
      const data = await readFile(file);
      const ext = extname(file);
      res.writeHead(200, {
        'content-type': MIME[ext] || 'application/octet-stream',
        'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
        'x-content-type-options': 'nosniff',
      });
      res.end(data);
    } catch {
      // Unknown paths fall back to the app shell (e.g. /work/123 deep links).
      if (!extname(path)) {
        const data = await readFile(join(ROOT, 'index.html'));
        res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-cache' });
        return res.end(data);
      }
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    }
  }

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://x');
    const ip = (req.headers['fly-client-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
    try {
      if (url.pathname.startsWith('/api/')) {
        let body = null;
        if (req.method === 'POST') {
          const chunks = [];
          let size = 0;
          for await (const c of req) {
            size += c.length;
            if (size > 256 * 1024) {
              res.writeHead(413);
              return res.end();
            }
            chunks.push(c);
          }
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
          } catch {
            res.writeHead(400, { 'content-type': 'application/json' });
            return res.end('{"error":"bad json"}');
          }
        }
        return await api(req, res, url, body, ip);
      }
      return await serveStatic(req, res, url);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
      res.end('{"error":"server error"}');
    }
  };
}

export function tierFor(rank) {
  if (rank === 1) return 'masterpiece';
  if (rank <= 10) return 'line';
  if (rank <= 100) return 'skyed';
  return 'refuses';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8080);
  const dbFile = process.env.DB_FILE || join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'ontheline.db');
  createServer(createApp({ dbFile })).listen(port, () => console.log(`on the line → http://localhost:${port}`));
}
