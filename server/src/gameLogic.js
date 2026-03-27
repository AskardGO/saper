/** @typedef {'easy' | 'medium' | 'hard'} Difficulty */

export const DIFFICULTIES = {
  easy: { width: 9, height: 9, mines: 10, label: 'Лёгкий' },
  medium: { width: 16, height: 16, mines: 40, label: 'Средний' },
  hard: { width: 30, height: 16, mines: 99, label: 'Сложный' },
};

function make2d(h, w, fill) {
  return Array.from({ length: h }, () => Array(w).fill(fill));
}

/** Размещение мин после первого хода: клетка (sr,sc) и соседи без мин */
export function placeMines(width, height, mineCount, safeR, safeC) {
  const mines = make2d(height, width, false);
  const excluded = new Set();
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = safeR + dr;
      const c = safeC + dc;
      if (r >= 0 && r < height && c >= 0 && c < width) {
        excluded.add(`${r},${c}`);
      }
    }
  }
  const candidates = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (!excluded.has(`${r},${c}`)) candidates.push([r, c]);
    }
  }
  const n = Math.min(mineCount, candidates.length);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (let k = 0; k < n; k++) {
    const [r, c] = candidates[k];
    mines[r][c] = true;
  }
  return mines;
}

function countAdjacentMines(mines, r, c) {
  const h = mines.length;
  const w = mines[0].length;
  let n = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < h && nc >= 0 && nc < w && mines[nr][nc]) n++;
    }
  }
  return n;
}

/** Flood fill reveal для пустых зон */
export function computeReveal(mines, revealed, startR, startC) {
  const h = mines.length;
  const w = mines[0].length;
  if (mines[startR][startC]) {
    revealed[startR][startC] = true;
    return;
  }
  const stack = [[startR, startC]];
  while (stack.length) {
    const [r, c] = stack.pop();
    if (r < 0 || r >= h || c < 0 || c >= w) continue;
    if (revealed[r][c]) continue;
    if (mines[r][c]) continue;
    revealed[r][c] = true;
    const adj = countAdjacentMines(mines, r, c);
    if (adj === 0) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          stack.push([r + dr, c + dc]);
        }
      }
    }
  }
}

export function countSafeUnrevealed(mines, revealed) {
  const h = mines.length;
  const w = mines[0].length;
  let left = 0;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (!mines[r][c] && !revealed[r][c]) left++;
    }
  }
  return left;
}

/**
 * @param {Difficulty} difficulty
 * @param {number} player1Id
 * @param {number} player2Id
 */
export function createInitialState(difficulty, player1Id, player2Id) {
  const cfg = DIFFICULTIES[difficulty];
  if (!cfg) throw new Error('bad difficulty');
  const { width, height, mines } = cfg;
  return {
    difficulty,
    width,
    height,
    mineCount: mines,
    minesPlaced: false,
    mines: null,
    revealed: make2d(height, width, false),
    flagged: make2d(height, width, false),
    player1Id,
    player2Id,
    currentTurnUserId: player1Id,
    status: 'playing',
    winnerId: null,
    firstMoveDone: false,
  };
}

/**
 * @param {ReturnType<typeof createInitialState>} state
 * @param {number} userId
 * @param {'reveal' | 'flag'} action
 * @param {number} r
 * @param {number} c
 */
export function applyMove(state, userId, action, r, c) {
  const uid = Number(userId);
  if (state.status !== 'playing') {
    return { ok: false, error: 'Игра уже завершена' };
  }
  if (state.currentTurnUserId !== uid) {
    return { ok: false, error: 'Сейчас не ваш ход' };
  }
  const { width, height } = state;
  if (r < 0 || r >= height || c < 0 || c >= width) {
    return { ok: false, error: 'Неверные координаты' };
  }

  if (action === 'flag') {
    if (state.revealed[r][c]) {
      return { ok: false, error: 'Клетка уже открыта' };
    }
    state.flagged[r][c] = !state.flagged[r][c];
    state.currentTurnUserId =
      state.player1Id === uid ? state.player2Id : state.player1Id;
    return { ok: true, state };
  }

  // reveal
  if (state.revealed[r][c] || state.flagged[r][c]) {
    return { ok: false, error: 'Нельзя открыть эту клетку' };
  }

  if (!state.minesPlaced) {
    state.mines = placeMines(width, height, state.mineCount, r, c);
    state.minesPlaced = true;
    state.firstMoveDone = true;
  }

  const mines = state.mines;
  if (mines[r][c]) {
    state.revealed[r][c] = true;
    state.status = 'finished';
    state.winnerId = state.player1Id === uid ? state.player2Id : state.player1Id;
    return { ok: true, state, exploded: [r, c] };
  }

  computeReveal(mines, state.revealed, r, c);

  const left = countSafeUnrevealed(mines, state.revealed);
  if (left === 0) {
    state.status = 'finished';
    state.winnerId = uid;
    return { ok: true, state, win: true };
  }

  state.currentTurnUserId =
    state.player1Id === uid ? state.player2Id : state.player1Id;
  return { ok: true, state };
}

/** Публичное представление для клиента (мины скрыты до конца игры, кроме подорванной клетки) */
export function publicGameView(state, viewerId) {
  const vid = Number(viewerId);
  const h = state.height;
  const w = state.width;
  const mines = state.mines;
  const finished = state.status === 'finished';
  const cells = [];
  for (let r = 0; r < h; r++) {
    const row = [];
    for (let c = 0; c < w; c++) {
      const rev = state.revealed[r][c];
      const flg = state.flagged[r][c];
      let adjacent = null;
      let showMine = false;
      if (mines) {
        if (finished) {
          showMine = mines[r][c];
          if (rev && !mines[r][c]) adjacent = countAdjacentMines(mines, r, c);
        } else if (rev) {
          if (mines[r][c]) showMine = true;
          else adjacent = countAdjacentMines(mines, r, c);
        }
      }
      row.push({
        r,
        c,
        revealed: rev,
        flagged: flg,
        adjacent,
        mine: showMine,
      });
    }
    cells.push(row);
  }

  return {
    difficulty: state.difficulty,
    width: w,
    height: h,
    cells,
    currentTurnUserId: state.currentTurnUserId,
    yourTurn: state.currentTurnUserId === vid,
    status: state.status,
    winnerId: state.winnerId,
    player1Id: state.player1Id,
    player2Id: state.player2Id,
    minesPlaced: state.minesPlaced,
  };
}
