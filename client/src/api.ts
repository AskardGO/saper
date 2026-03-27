const TOKEN_KEY = 'saper_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || res.statusText);
  }
  return data as T;
}

export type User = { id: number; username: string; created_at: string };

export async function register(username: string, password: string) {
  return request<{ user: User; token: string }>('/api/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function login(username: string, password: string) {
  return request<{ user: User; token: string }>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function fetchMe() {
  return request<{ user: User }>('/api/me');
}

export type DifficultyInfo = {
  id: string;
  label: string;
  width: number;
  height: number;
  mines: number;
};

export async function fetchDifficulties() {
  return request<{ difficulties: DifficultyInfo[] }>('/api/difficulties');
}

export type FriendEntry = {
  id: number;
  peerId: number;
  username: string;
  since: string;
};

export type PendingIn = {
  id: number;
  fromId: number;
  username: string;
  created_at: string;
};

export type PendingOut = {
  id: number;
  toId: number;
  username: string;
  created_at: string;
};

export async function fetchFriends() {
  return request<{
    friends: FriendEntry[];
    incoming: PendingIn[];
    outgoing: PendingOut[];
  }>('/api/friends');
}

export async function sendFriendRequest(username: string) {
  return request<{ ok: boolean }>('/api/friends/request', {
    method: 'POST',
    body: JSON.stringify({ username }),
  });
}

export async function acceptFriend(id: number) {
  return request<{ ok: boolean }>(`/api/friends/accept/${id}`, {
    method: 'POST',
  });
}

export async function declineFriend(id: number) {
  return request<{ ok: boolean }>(`/api/friends/decline/${id}`, {
    method: 'POST',
  });
}

export type GameCell = {
  r: number;
  c: number;
  revealed: boolean;
  flagged: boolean;
  adjacent: number | null;
  mine: boolean;
};

export type GameView = {
  difficulty: string;
  width: number;
  height: number;
  cells: GameCell[][];
  currentTurnUserId: number;
  yourTurn: boolean;
  status: string;
  winnerId: number | null;
  player1Id: number;
  player2Id: number;
  minesPlaced: boolean;
};

export async function inviteGame(peerId: number, difficulty: string) {
  return request<{ gameId: string; status: string }>('/api/games/invite', {
    method: 'POST',
    body: JSON.stringify({ peerId, difficulty }),
  });
}

export async function acceptGameInvite(gameId: string) {
  return request<{ ok: boolean; gameId: string; status: string }>(
    `/api/games/${encodeURIComponent(gameId)}/accept`,
    { method: 'POST' },
  );
}

export async function declineGameInvite(gameId: string) {
  return request<{ ok: boolean }>(
    `/api/games/${encodeURIComponent(gameId)}/decline`,
    { method: 'POST' },
  );
}

export async function fetchGame(gameId: string) {
  return request<{
    gameId: string;
    view: GameView;
    status: 'pending' | 'active' | 'finished';
    player1Username?: string;
    player2Username?: string;
  }>(`/api/games/${encodeURIComponent(gameId)}`);
}

export type GameListItem = {
  id: string;
  player1Id: number;
  player2Id: number;
  difficulty: string;
  status: string;
  winnerId: number | null;
  createdAt: string;
};

export async function fetchGames() {
  return request<{ games: GameListItem[] }>('/api/games');
}
