import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../server/server.js';
import * as S from '../public/js/sim.js';
import { playBot } from './bot.js';

async function boot() {
  let clock = Date.parse('2026-10-12T12:00:00Z');
  const app = createApp({ now: () => clock, secret: 'test' });
  const srv = createServer(app);
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (path, body) => {
    const res = await fetch(base + path, body ? { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {});
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  return { srv, call, advance: (ms) => (clock += ms) };
}

async function submit(t, me, run, extra = {}) {
  const { json } = await t.call('/api/start', me);
  t.advance(run.inputs.length * 17 + 1000);
  return t.call('/api/run', { ...me, date: '2026-10-12', version: S.VERSION, inputs: run.encoded, score: run.score, ticket: json.ticket, ...extra });
}

test('full leaderboard flow', async () => {
  const t = await boot();
  try {
    const today = (await t.call('/api/today')).json;
    assert.equal(today.date, '2026-10-12');
    assert.equal(today.day, 3);

    const a = (await t.call('/api/player', { name: 'Ada' })).json;
    const b = (await t.call('/api/player', { name: 'Bea' })).json;
    assert.ok(a.secret && b.secret);
    assert.equal((await t.call('/api/player', { name: '!' })).status, 400);

    const meA = { id: a.id, secret: a.secret };
    const meB = { id: b.id, secret: b.secret };
    const seed = today.seed;
    const weak = playBot(seed, { maxTicks: 400 });
    const strong = playBot(seed, { maxTicks: 2000 });
    assert.ok(strong.score > weak.score);

    // A lie about the score is rejected.
    assert.equal((await submit(t, meA, weak, { score: weak.score + 1 })).status, 422);
    // Without a ticket: rejected.
    assert.equal((await t.call('/api/run', { ...meA, date: '2026-10-12', version: S.VERSION, inputs: weak.encoded, score: weak.score })).status, 422);
    // Too fast after the ticket: rejected.
    const tk = (await t.call('/api/start', meA)).json.ticket;
    assert.equal((await t.call('/api/run', { ...meA, date: '2026-10-12', version: S.VERSION, inputs: weak.encoded, score: weak.score, ticket: tk })).status, 422);

    let r = await submit(t, meA, weak);
    assert.equal(r.status, 200);
    assert.equal(r.json.rank, 1);
    assert.equal(r.json.tier, 'masterpiece');

    r = await submit(t, meB, strong);
    assert.equal(r.json.rank, 1);
    // A now sees they were taken down.
    const me = (await t.call('/api/me', meA)).json;
    assert.equal(me.notices.length, 1);
    assert.equal(me.notices[0].by, 'BEA');

    // Worse run does not replace the best, but counts as ink.
    r = await submit(t, meB, weak);
    assert.equal(r.json.improved, false);
    assert.equal(r.json.best, strong.score);

    const board = (await t.call(`/api/board?pid=${a.id}`)).json;
    assert.equal(board.total, 2);
    assert.equal(board.top[0].name, 'BEA');
    assert.equal(board.top[1].you, true);
    assert.equal(board.prolific.name, 'BEA');
    assert.equal(board.attempts, 3);

    const painting = (await t.call(`/api/run/${board.top[0].runId}`)).json;
    assert.equal(painting.inputs, strong.encoded);

    // Tomorrow, yesterday's winner is in the Permanent Collection.
    t.advance(86400000);
    const col = (await t.call('/api/collection')).json;
    assert.equal(col.works[0].name, 'BEA');
    // And yesterday's exhibition is closed to new work.
    const late = await submit(t, meA, strong);
    assert.equal(late.status, 400);
  } finally {
    t.srv.close();
  }
});

test('static files and app shell', async () => {
  const t = await boot();
  try {
    const res = await fetch(`http://127.0.0.1:${t.srv.address().port}/js/sim.js`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /javascript/);
    const trav = await fetch(`http://127.0.0.1:${t.srv.address().port}/../server/server.js`);
    assert.notEqual(trav.status, 200);
  } finally {
    t.srv.close();
  }
});
