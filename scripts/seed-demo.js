// Fills a local database with bot artists so the Wall has something on it.
// Usage: DB_FILE=data/dev.db node --no-warnings scripts/seed-demo.js
import { createServer } from 'node:http';
import { createApp } from '../server/server.js';
import * as S from '../public/js/sim.js';
import { dateFor } from '../public/js/calendar.js';
import { playBot } from '../test/bot.js';

const NAMES = ['MARGOT', 'TOMÁS', 'HILMA', 'AGNES', 'BASQ', 'KUSAMA FAN', 'ODILON', 'RIO', 'PETRA', 'SOL', 'LEE', 'YUKI', 'FRIDA K', 'DUCHAMPION', 'MONDRIAN JR', 'NIB LORD', 'BRUSHLESS', 'KAT', 'ZED', 'ORLA'];
const dbFile = process.env.DB_FILE || 'data/dev.db';

async function seedDay(dayOffset, n) {
  let clock = Date.now() + dayOffset * 86400000;
  const date = dateFor(clock);
  const app = createApp({ dbFile, now: () => clock, secret: process.env.TICKET_SECRET || 'dev' });
  const srv = createServer(app);
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const post = (p, b) => fetch(base + p, { method: 'POST', body: JSON.stringify(b) }).then((r) => r.json());
  const seed = S.dailySeed(date);
  for (let i = 0; i < n; i++) {
    const me = await post('/api/player', { name: NAMES[(i + (dayOffset ? 7 : 0)) % NAMES.length] });
    const tries = 1 + (i % 3);
    for (let k = 0; k < tries; k++) {
      const run = playBot(seed, { maxTicks: 300 + Math.floor(Math.random() * 3000), skill: 30 + Math.floor(Math.random() * 50) });
      const { ticket } = await post('/api/start', me);
      clock += run.inputs.length * 17 + 500;
      const r = await post('/api/run', { ...me, date, version: S.VERSION, inputs: run.encoded, score: run.score, ticket });
      if (r.error) console.log(r.error);
    }
  }
  srv.close();
  console.log('seeded', date, n);
}

await seedDay(-1, 8);
await seedDay(0, 16);
