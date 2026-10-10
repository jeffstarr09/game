import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../public/js/sim.js';
import { cleanName, dayNumber, dateOfDay } from '../public/js/calendar.js';
import { playBot } from './bot.js';

test('runs replay to the identical score', () => {
  for (const seed of [1, 99, S.dailySeed('2026-10-10')]) {
    const run = playBot(seed, { maxTicks: 1500 });
    const again = S.replay(seed, S.decodeInputs(run.encoded));
    assert.equal(S.finalScore(again), run.score);
    assert.equal(again.tick, run.inputs.length);
    assert.equal(again.alive, false);
  }
});

test('trig table is sane', () => {
  const w = S.createWorld(5);
  S.step(w, 0);
  // pointing straight up the page at the start
  assert.ok(Math.abs(w.x - S.CONST.W / 2) < 1e-9);
  assert.ok(w.y < S.CONST.H * 0.62);
});

test('input encoding round-trips and rejects junk', () => {
  const inp = [0, 0, 1, 1, 1, -1, 0];
  assert.deepEqual(S.decodeInputs(S.encodeInputs(inp)), inp);
  assert.equal(S.decodeInputs('X3.'), null);
  assert.equal(S.decodeInputs('Lzzzzzz.'), null); // too long
});

test('names are cleaned', () => {
  assert.equal(cleanName('  ada  lovelace '), 'ADA LOVELACE');
  assert.equal(cleanName('é'), null);
  assert.equal(cleanName('a'), null);
  assert.equal(cleanName('f u c k'), null);
  assert.equal(cleanName('<script>'), 'SCRIPT');
});

test('exhibition numbering', () => {
  assert.equal(dayNumber('2026-10-10'), 1);
  assert.equal(dateOfDay(32), '2026-11-10');
});
