import fs from 'fs';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data.db');

const dbDir = path.dirname(dbPath);
try {
  fs.mkdirSync(dbDir, { recursive: true });
} catch (e) {
  console.error('[db] Не удалось создать каталог для БД:', dbDir, e);
  throw e;
}

export const db = new Database(dbPath);

// Надёжная запись на диск (важно при внезапном завершении процесса)
db.pragma('journal_mode = WAL');
db.pragma('synchronous = FULL');
db.pragma('foreign_keys = ON');

console.log('[db] Файл базы:', dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS friend_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id INTEGER NOT NULL,
    to_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')),
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(from_id, to_id),
    FOREIGN KEY (from_id) REFERENCES users(id),
    FOREIGN KEY (to_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    player1_id INTEGER NOT NULL,
    player2_id INTEGER NOT NULL,
    difficulty TEXT NOT NULL,
    state_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'finished', 'cancelled')),
    winner_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (player1_id) REFERENCES users(id),
    FOREIGN KEY (player2_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_friend_from ON friend_requests(from_id);
  CREATE INDEX IF NOT EXISTS idx_friend_to ON friend_requests(to_id);
`);

migrateGamesStatusConstraint(db);

function migrateGamesStatusConstraint(db) {
  const t = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='games'`)
    .get();
  if (!t?.sql) return;
  if (t.sql.includes("'pending'") && t.sql.includes("'cancelled'")) return;
  try {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;
      CREATE TABLE games_migrated_saper (
        id TEXT PRIMARY KEY,
        player1_id INTEGER NOT NULL,
        player2_id INTEGER NOT NULL,
        difficulty TEXT NOT NULL,
        state_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'finished', 'cancelled')),
        winner_id INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (player1_id) REFERENCES users(id),
        FOREIGN KEY (player2_id) REFERENCES users(id)
      );
      INSERT INTO games_migrated_saper SELECT * FROM games;
      DROP TABLE games;
      ALTER TABLE games_migrated_saper RENAME TO games;
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
    console.log('[db] Таблица games: добавлены статусы pending/cancelled');
  } catch (e) {
    console.error('[db] Миграция games не выполнена:', e.message);
  }
}
