import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { db } from './db.js';
import {
  authMiddleware,
  signToken,
  verifyToken,
  hashPassword,
  verifyPassword,
} from './auth.js';
import {
  DIFFICULTIES,
  createInitialState,
  applyMove,
  publicGameView,
} from './gameLogic.js';

const PORT = Number(process.env.PORT) || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const isProd = process.env.NODE_ENV === 'production';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, '../../client/dist');

const app = express();
if (isProd) {
  app.use(cors({ origin: true, credentials: true }));
} else {
  app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
}
app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).type('text/plain').send('ok');
});

function rowUser(row) {
  return { id: row.id, username: row.username, created_at: row.created_at };
}

// --- Auth ---
app.post('/api/register', (req, res) => {
  const { username, password } = req.body || {};
  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    username.length < 2 ||
    username.length > 32 ||
    password.length < 4
  ) {
    return res.status(400).json({
      error: 'Логин 2–32 символа, пароль не короче 4 символов',
    });
  }
  const hash = hashPassword(password);
  try {
    const info = db
      .prepare(
        'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      )
      .run(username.trim(), hash);
    const user = db
      .prepare('SELECT id, username, created_at FROM users WHERE id = ?')
      .get(info.lastInsertRowid);
    const token = signToken(user.id, user.username);
    return res.json({ user: rowUser(user), token });
  } catch (e) {
    if (String(e).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Такой логин уже занят' });
    }
    console.error(e);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Неверные данные' });
  }
  const user = db
    .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE')
    .get(username.trim());
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  const token = signToken(user.id, user.username);
  const pub = db
    .prepare('SELECT id, username, created_at FROM users WHERE id = ?')
    .get(user.id);
  return res.json({ user: rowUser(pub), token });
});

app.get('/api/me', authMiddleware, (req, res) => {
  const user = db
    .prepare('SELECT id, username, created_at FROM users WHERE id = ?')
    .get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  res.json({ user: rowUser(user) });
});

app.get('/api/difficulties', (_req, res) => {
  res.json({
    difficulties: Object.entries(DIFFICULTIES).map(([key, v]) => ({
      id: key,
      label: v.label,
      width: v.width,
      height: v.height,
      mines: v.mines,
    })),
  });
});

// --- Friends ---
app.get('/api/friends', authMiddleware, (req, res) => {
  const uid = req.user.id;
  const rows = db
    .prepare(
      `
    SELECT fr.id, fr.from_id, fr.to_id, fr.status, fr.created_at,
           uf.username AS from_username, ut.username AS to_username
    FROM friend_requests fr
    JOIN users uf ON uf.id = fr.from_id
    JOIN users ut ON ut.id = fr.to_id
    WHERE fr.from_id = ? OR fr.to_id = ?
  `,
    )
    .all(uid, uid);

  const friends = [];
  const incoming = [];
  const outgoing = [];
  for (const r of rows) {
    if (r.status === 'accepted') {
      const peerId = r.from_id === uid ? r.to_id : r.from_id;
      const peerName = r.from_id === uid ? r.to_username : r.from_username;
      friends.push({
        id: r.id,
        peerId,
        username: peerName,
        since: r.created_at,
      });
    } else if (r.status === 'pending') {
      if (r.to_id === uid) {
        incoming.push({
          id: r.id,
          fromId: r.from_id,
          username: r.from_username,
          created_at: r.created_at,
        });
      } else {
        outgoing.push({
          id: r.id,
          toId: r.to_id,
          username: r.to_username,
          created_at: r.created_at,
        });
      }
    }
  }
  res.json({ friends, incoming, outgoing });
});

app.post('/api/friends/request', authMiddleware, (req, res) => {
  const { username } = req.body || {};
  if (typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ error: 'Укажите логин друга' });
  }
  const peer = db
    .prepare('SELECT id, username FROM users WHERE username = ? COLLATE NOCASE')
    .get(username.trim());
  if (!peer) return res.status(404).json({ error: 'Пользователь не найден' });
  if (peer.id === req.user.id) {
    return res.status(400).json({ error: 'Нельзя добавить себя' });
  }

  const existing = db
    .prepare(
      'SELECT id, status FROM friend_requests WHERE from_id = ? AND to_id = ?',
    )
    .get(req.user.id, peer.id);
  if (existing) {
    if (existing.status === 'pending') {
      return res.status(409).json({ error: 'Заявка уже отправлена' });
    }
    if (existing.status === 'accepted') {
      return res.status(409).json({ error: 'Уже в друзьях' });
    }
    db.prepare(
      'UPDATE friend_requests SET status = ?, created_at = datetime(\'now\') WHERE id = ?',
    ).run('pending', existing.id);
    return res.json({ ok: true, message: 'Заявка отправлена снова' });
  }

  const reverse = db
    .prepare(
      'SELECT id, status FROM friend_requests WHERE from_id = ? AND to_id = ?',
    )
    .get(peer.id, req.user.id);
  if (reverse) {
    if (reverse.status === 'pending') {
      return res.status(409).json({
        error: 'Этот пользователь уже отправил вам заявку — примите её в списке',
      });
    }
    if (reverse.status === 'accepted') {
      return res.status(409).json({ error: 'Уже в друзьях' });
    }
  }

  try {
    db.prepare(
      'INSERT INTO friend_requests (from_id, to_id, status) VALUES (?, ?, ?)',
    ).run(req.user.id, peer.id, 'pending');
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Не удалось отправить заявку' });
  }
});

app.post('/api/friends/accept/:id', authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM friend_requests WHERE id = ?').get(id);
  if (!row || row.to_id !== req.user.id || row.status !== 'pending') {
    return res.status(404).json({ error: 'Заявка не найдена' });
  }
  db.prepare('UPDATE friend_requests SET status = ? WHERE id = ?').run(
    'accepted',
    id,
  );
  res.json({ ok: true });
});

app.post('/api/friends/decline/:id', authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM friend_requests WHERE id = ?').get(id);
  if (!row || row.to_id !== req.user.id || row.status !== 'pending') {
    return res.status(404).json({ error: 'Заявка не найдена' });
  }
  db.prepare('DELETE FROM friend_requests WHERE id = ?').run(id);
  res.json({ ok: true });
});

// --- Games REST ---
function parseState(row) {
  return JSON.parse(row.state_json);
}

function saveGameState(gameId, state, status, winnerId) {
  db.prepare(
    'UPDATE games SET state_json = ?, status = ?, winner_id = ? WHERE id = ?',
  ).run(JSON.stringify(state), status, winnerId ?? null, gameId);
}

app.post('/api/games/invite', authMiddleware, (req, res) => {
  const { peerId, difficulty } = req.body || {};
  const pid = Number(peerId);
  if (!pid || pid === req.user.id) {
    return res.status(400).json({ error: 'Неверный собеседник' });
  }
  if (!DIFFICULTIES[difficulty]) {
    return res.status(400).json({ error: 'Неверная сложность' });
  }

  const okFriend = db
    .prepare(
      `SELECT 1 FROM friend_requests
       WHERE status = 'accepted' AND (
         (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)
       )`,
    )
    .get(req.user.id, pid, pid, req.user.id);
  if (!okFriend) {
    return res.status(403).json({ error: 'Можно играть только с другом из списка' });
  }

  const gameId = uuidv4();
  const state = createInitialState(difficulty, req.user.id, pid);
  db.prepare(
    `INSERT INTO games (id, player1_id, player2_id, difficulty, state_json, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
  ).run(gameId, req.user.id, pid, difficulty, JSON.stringify(state));

  res.json({ gameId, state: publicGameView(state, req.user.id) });
});

app.get('/api/games', authMiddleware, (req, res) => {
  const uid = req.user.id;
  const rows = db
    .prepare(
      `SELECT id, player1_id, player2_id, difficulty, status, winner_id, created_at
       FROM games WHERE player1_id = ? OR player2_id = ? ORDER BY created_at DESC LIMIT 50`,
    )
    .all(uid, uid);
  res.json({
    games: rows.map((g) => ({
      id: g.id,
      player1Id: g.player1_id,
      player2Id: g.player2_id,
      difficulty: g.difficulty,
      status: g.status,
      winnerId: g.winner_id,
      createdAt: g.created_at,
    })),
  });
});

app.get('/api/games/:id', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Игра не найдена' });
  const uid = req.user.id;
  if (row.player1_id !== uid && row.player2_id !== uid) {
    return res.status(403).json({ error: 'Нет доступа' });
  }
  const state = parseState(row);
  const u1 = db.prepare('SELECT username FROM users WHERE id = ?').get(row.player1_id);
  const u2 = db.prepare('SELECT username FROM users WHERE id = ?').get(row.player2_id);
  res.json({
    gameId: row.id,
    view: publicGameView(state, uid),
    status: row.status,
    player1Username: u1?.username,
    player2Username: u2?.username,
  });
});

if (isProd) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(path.join(clientDist, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: isProd
    ? { origin: true, methods: ['GET', 'POST'] }
    : { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
});

/** @type {Map<string, Set<string>>} */
const gameRooms = new Map();

function socketAuth(socket, next) {
  const token =
    socket.handshake.auth?.token ||
    socket.handshake.headers?.authorization?.replace('Bearer ', '');
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    return next(new Error('unauthorized'));
  }
  socket.userId = payload.sub;
  socket.username = payload.username;
  next();
}

io.use(socketAuth);

io.on('connection', (socket) => {
  socket.on('game:join', (gameId, cb) => {
    if (typeof gameId !== 'string' || typeof cb !== 'function') return;
    const row = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
    if (!row || row.status !== 'active') {
      return cb({ error: 'Игра недоступна' });
    }
    const uid = socket.userId;
    if (row.player1_id !== uid && row.player2_id !== uid) {
      return cb({ error: 'Нет доступа' });
    }
    socket.join(`game:${gameId}`);
    if (!gameRooms.has(gameId)) gameRooms.set(gameId, new Set());
    gameRooms.get(gameId).add(socket.id);
    const state = parseState(row);
    cb({
      ok: true,
      view: publicGameView(state, uid),
    });
    socket.to(`game:${gameId}`).emit('game:presence', {
      userId: uid,
      username: socket.username,
    });
  });

  socket.on('game:move', (move, cb) => {
    if (typeof cb !== 'function') return;
    const { gameId, action, r, c } = move || {};
    if (typeof gameId !== 'string' || !['reveal', 'flag'].includes(action)) {
      return cb({ error: 'Неверные данные' });
    }
    const row = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
    if (!row || row.status !== 'active') {
      return cb({ error: 'Игра недоступна' });
    }
    const uid = socket.userId;
    if (row.player1_id !== uid && row.player2_id !== uid) {
      return cb({ error: 'Нет доступа' });
    }
    let state = parseState(row);
    const result = applyMove(state, uid, action, Number(r), Number(c));
    if (!result.ok) {
      return cb({ error: result.error });
    }
    state = result.state;
    const status = state.status === 'finished' ? 'finished' : 'active';
    saveGameState(gameId, state, status, state.winnerId);

    const room = io.sockets.adapter.rooms.get(`game:${gameId}`);
    const updateMeta = {
      lastMove: { userId: uid, action, r: Number(r), c: Number(c) },
    };
    if (room) {
      for (const sid of room) {
        const s = io.sockets.sockets.get(sid);
        if (s?.userId) {
          s.emit('game:update', {
            ...updateMeta,
            view: publicGameView(state, s.userId),
          });
        }
      }
    }
    cb({ ok: true, view: publicGameView(state, uid) });
  });

  socket.on('disconnect', () => {
    for (const [gid, set] of gameRooms) {
      if (set.delete(socket.id) && set.size === 0) gameRooms.delete(gid);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Сервер: http://localhost:${PORT}`);
});
