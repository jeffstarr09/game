// Storage. node:sqlite keeps us at zero dependencies; one file on a volume is
// plenty until we have tens of thousands of daily players.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      secret_hash TEXT NOT NULL,
      created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL,
      date TEXT NOT NULL,
      seed INTEGER NOT NULL,
      score INTEGER NOT NULL,
      ticks INTEGER NOT NULL,
      pigments INTEGER NOT NULL,
      inputs TEXT NOT NULL,
      version INTEGER NOT NULL,
      created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS best (
      date TEXT NOT NULL,
      player_id TEXT NOT NULL,
      run_id INTEGER NOT NULL,
      score INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      peak_rank INTEGER,
      updated INTEGER NOT NULL,
      PRIMARY KEY (date, player_id)
    );
    CREATE INDEX IF NOT EXISTS best_by_score ON best(date, score DESC, updated ASC);
    CREATE TABLE IF NOT EXISTS attempts (
      date TEXT NOT NULL,
      player_id TEXT NOT NULL,
      n INTEGER NOT NULL,
      ink INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (date, player_id)
    );
  `);

  const q = {
    insertPlayer: db.prepare('INSERT INTO players (id, name, secret_hash, created) VALUES (?, ?, ?, ?)'),
    getPlayer: db.prepare('SELECT * FROM players WHERE id = ?'),
    renamePlayer: db.prepare('UPDATE players SET name = ? WHERE id = ?'),
    insertRun: db.prepare(
      'INSERT INTO runs (player_id, date, seed, score, ticks, pigments, inputs, version, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ),
    getRun: db.prepare(
      'SELECT runs.*, players.name FROM runs JOIN players ON players.id = runs.player_id WHERE runs.id = ?'
    ),
    getBest: db.prepare('SELECT * FROM best WHERE date = ? AND player_id = ?'),
    upsertBest: db.prepare(`
      INSERT INTO best (date, player_id, run_id, score, attempts, updated) VALUES (?, ?, ?, ?, 0, ?)
      ON CONFLICT(date, player_id) DO UPDATE SET run_id = excluded.run_id, score = excluded.score, updated = excluded.updated
    `),
    setPeak: db.prepare('UPDATE best SET peak_rank = ? WHERE date = ? AND player_id = ?'),
    bumpAttempts: db.prepare(`
      INSERT INTO attempts (date, player_id, n, ink) VALUES (?, ?, 1, ?)
      ON CONFLICT(date, player_id) DO UPDATE SET n = n + 1, ink = ink + excluded.ink
    `),
    getAttempts: db.prepare('SELECT n, ink FROM attempts WHERE date = ? AND player_id = ?'),
    prolific: db.prepare(`
      SELECT attempts.player_id, attempts.n, attempts.ink, players.name FROM attempts
      JOIN players ON players.id = attempts.player_id
      WHERE date = ? ORDER BY ink DESC LIMIT 1
    `),
    rankOf: db.prepare(
      'SELECT COUNT(*) AS n FROM best WHERE date = ? AND (score > ? OR (score = ? AND updated < ?))'
    ),
    count: db.prepare('SELECT COUNT(*) AS n FROM best WHERE date = ?'),
    top: db.prepare(`
      SELECT best.player_id, best.run_id, best.score, best.updated, players.name, runs.ticks, runs.pigments
      FROM best JOIN players ON players.id = best.player_id JOIN runs ON runs.id = best.run_id
      WHERE best.date = ? ORDER BY best.score DESC, best.updated ASC LIMIT ? OFFSET ?
    `),
    winners: db.prepare(`
      SELECT b.date, b.run_id, b.score, players.name FROM best b
      JOIN players ON players.id = b.player_id
      WHERE b.date < ? AND NOT EXISTS (
        SELECT 1 FROM best c WHERE c.date = b.date AND (c.score > b.score OR (c.score = b.score AND c.updated < b.updated))
      )
      ORDER BY b.date DESC LIMIT ?
    `),
    playerDays: db.prepare(`
      SELECT date, score, peak_rank, run_id FROM best WHERE player_id = ? ORDER BY date DESC LIMIT ?
    `),
    dailyPlayers: db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE date = ?'),
    dailyAttempts: db.prepare('SELECT COALESCE(SUM(n), 0) AS n FROM attempts WHERE date = ?'),
  };

  return { db, q };
}
