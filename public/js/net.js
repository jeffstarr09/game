// Talks to the exhibition server. Everything degrades gracefully: if the
// server is unreachable the game still plays and keeps local bests.
import { VERSION, dailySeed } from './sim.js';
import { dateFor, dayNumber } from './calendar.js';

const KEY = 'otl.me';
let online = true;

function load(k, fallback) {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function save(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
}

export const store = { load, save };

async function call(path, body) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    });
    online = true;
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(json.error || 'error'), { status: res.status, json });
    return json;
  } catch (e) {
    if (!e.status) online = false;
    throw e;
  } finally {
    clearTimeout(to);
  }
}

export function isOnline() {
  return online;
}

export function me() {
  return load(KEY, null);
}

export async function ensurePlayer() {
  let m = me();
  if (m?.id) return m;
  const anon = 'ANON ' + Math.floor(1000 + Math.random() * 9000);
  m = await call('/api/player', { name: anon });
  m.anonymous = true;
  save(KEY, m);
  return m;
}

export async function rename(name) {
  const m = await ensurePlayer();
  const r = await call('/api/player', { id: m.id, secret: m.secret, name });
  m.name = r.name;
  m.anonymous = false;
  save(KEY, m);
  return m;
}

export async function today() {
  try {
    return await call('/api/today');
  } catch {
    const date = dateFor(Date.now());
    const end = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1);
    return { date, day: dayNumber(date), seed: dailySeed(date), closesIn: end - Date.now(), version: VERSION, offline: true };
  }
}

export async function startTicket() {
  try {
    const m = await ensurePlayer();
    return (await call('/api/start', { id: m.id, secret: m.secret })).ticket;
  } catch {
    return null;
  }
}

export async function submitRun({ date, inputs, score, ticket }) {
  const m = await ensurePlayer();
  return call('/api/run', { id: m.id, secret: m.secret, date, version: VERSION, inputs, score, ticket });
}

export async function board(date) {
  const m = me();
  return call(`/api/board?date=${date}${m ? '&pid=' + encodeURIComponent(m.id) : ''}`);
}

const runCache = new Map();
export async function run(id) {
  if (runCache.has(id)) return runCache.get(id);
  const p = call(`/api/run/${id}`);
  runCache.set(id, p);
  p.catch(() => runCache.delete(id));
  return p;
}

export async function collection() {
  return call('/api/collection');
}

export async function profile() {
  const m = me();
  if (!m) return null;
  try {
    return await call('/api/me', { id: m.id, secret: m.secret });
  } catch {
    return null;
  }
}
