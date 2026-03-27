import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { requestNotificationPermission, useSocket } from '../SocketContext';
import {
  acceptFriend,
  declineFriend,
  fetchDifficulties,
  fetchFriends,
  fetchGames,
  fetchMe,
  inviteGame,
  sendFriendRequest,
  setToken,
  type DifficultyInfo,
  type FriendEntry,
  type GameListItem,
  type PendingIn,
  type User,
} from '../api';

export default function Home() {
  const { pushInfoToast } = useSocket();
  const [me, setMe] = useState<User | null>(null);
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [incoming, setIncoming] = useState<PendingIn[]>([]);
  const [outgoing, setOutgoing] = useState<{ id: number; username: string }[]>(
    [],
  );
  const [games, setGames] = useState<GameListItem[]>([]);
  const [difficulties, setDifficulties] = useState<DifficultyInfo[]>([]);
  const [friendName, setFriendName] = useState('');
  const [invitePeerId, setInvitePeerId] = useState<number | ''>('');
  const [inviteDifficulty, setInviteDifficulty] = useState('easy');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notifPerm, setNotifPerm] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  );

  const load = useCallback(async () => {
    const [u, f, d, g] = await Promise.all([
      fetchMe(),
      fetchFriends(),
      fetchDifficulties(),
      fetchGames(),
    ]);
    setMe(u.user);
    setFriends(f.friends);
    setIncoming(f.incoming);
    setOutgoing(f.outgoing.map((o) => ({ id: o.id, username: o.username })));
    setDifficulties(d.difficulties);
    setGames(g.games);
  }, []);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : 'Ошибка загрузки'));
  }, [load]);

  useEffect(() => {
    const handler = () => {
      loadRef.current().catch((e) =>
        setErr(e instanceof Error ? e.message : 'Ошибка загрузки'),
      );
    };
    window.addEventListener('saper:refresh', handler);
    return () => window.removeEventListener('saper:refresh', handler);
  }, []);

  async function onAddFriend(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    try {
      await sendFriendRequest(friendName);
      setFriendName('');
      setMsg('Заявка отправлена');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка');
    }
  }

  async function onAccept(id: number) {
    setErr(null);
    await acceptFriend(id);
    await load();
  }

  async function onDecline(id: number) {
    setErr(null);
    await declineFriend(id);
    await load();
  }

  function logout() {
    setToken(null);
    window.location.href = '/login';
  }

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (invitePeerId === '') return;
    try {
      await inviteGame(Number(invitePeerId), inviteDifficulty);
      pushInfoToast(
        'Вызов отправлен',
        'Ждём, пока соперник примет бой нажатием «Принять»',
      );
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось создать игру');
    }
  }

  return (
    <div className="home-layout">
      <section className="card">
        <div className="row spread">
          <h1>Привет, {me?.username}</h1>
          <span className="row header-actions">
            {notifPerm !== 'granted' && (
              <button
                type="button"
                className="ghost small-btn"
                onClick={() => {
                  requestNotificationPermission().then((p) => setNotifPerm(p));
                }}
              >
                Включить уведомления
              </button>
            )}
            <button type="button" className="ghost" onClick={logout}>
              Выйти
            </button>
          </span>
        </div>
        <p className="muted">
          Игра только онлайн: вы и друг ходите по очереди (открытие клетки или
          флаг).
        </p>
      </section>

      <section className="card">
        <h2>Друзья</h2>
        <form onSubmit={onAddFriend} className="inline-form">
          <input
            placeholder="Логин друга"
            value={friendName}
            onChange={(e) => setFriendName(e.target.value)}
          />
          <button type="submit">Добавить</button>
        </form>
        {incoming.length > 0 && (
          <div className="block">
            <h3>Входящие заявки</h3>
            <ul className="list">
              {incoming.map((r) => (
                <li key={r.id} className="row spread">
                  <span>{r.username}</span>
                  <span>
                    <button type="button" onClick={() => onAccept(r.id)}>
                      Принять
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => onDecline(r.id)}
                    >
                      Отклонить
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {outgoing.length > 0 && (
          <div className="block">
            <h3>Исходящие</h3>
            <ul className="list">
              {outgoing.map((o) => (
                <li key={o.id}>{o.username} — ожидает</li>
              ))}
            </ul>
          </div>
        )}
        <h3>Ваши друзья</h3>
        {friends.length === 0 ? (
          <p className="muted">Пока никого. Добавьте друга по логину.</p>
        ) : (
          <ul className="list friends">
            {friends.map((f) => (
              <li key={f.id}>
                <strong>{f.username}</strong>
                <span className="muted small"> id: {f.peerId}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Новая игра</h2>
        <form onSubmit={onInvite} className="form">
          <label>
            Друг
            <select
              value={invitePeerId === '' ? '' : String(invitePeerId)}
              onChange={(e) =>
                setInvitePeerId(e.target.value ? Number(e.target.value) : '')
              }
              required
            >
              <option value="">— выберите —</option>
              {friends.map((f) => (
                <option key={f.peerId} value={f.peerId}>
                  {f.username}
                </option>
              ))}
            </select>
          </label>
          <label>
            Сложность
            <select
              value={inviteDifficulty}
              onChange={(e) => setInviteDifficulty(e.target.value)}
            >
              {difficulties.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label} ({d.width}×{d.height}, {d.mines} мин)
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Пригласить в игру</button>
        </form>
      </section>

      <section className="card">
        <h2>Последние партии</h2>
        {games.length === 0 ? (
          <p className="muted">Пока нет игр.</p>
        ) : (
          <ul className="list games">
            {games.map((g) => (
              <li key={g.id}>
                {g.status === 'cancelled' ? (
                  <span className="muted">
                    {g.difficulty} · отменена
                    <span className="muted small"> {g.createdAt}</span>
                  </span>
                ) : (
                  <>
                    <Link to={`/game/${g.id}`}>
                      {g.difficulty} ·{' '}
                      {g.status === 'pending' && 'ждёт ответа'}
                      {g.status === 'active' && 'идёт'}
                      {g.status === 'finished' && 'завершена'}
                      {g.winnerId != null && ` · победитель #${g.winnerId}`}
                    </Link>
                    <span className="muted small"> {g.createdAt}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {msg && <p className="success">{msg}</p>}
      {err && <p className="error">{err}</p>}
    </div>
  );
}
