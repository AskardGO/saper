import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data.db');

export const db = new Database(dbPath);

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
    status TEXT NOT NULL CHECK (status IN ('active', 'finished')),
    winner_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (player1_id) REFERENCES users(id),
    FOREIGN KEY (player2_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_friend_from ON friend_requests(from_id);
  CREATE INDEX IF NOT EXISTS idx_friend_to ON friend_requests(to_id);
`);
