import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Socket } from 'socket.io-client';
import { fetchGame, fetchMe, type GameView } from '../api';
import { createGameSocket } from '../socket';

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const [view, setView] = useState<GameView | null>(null);
  const [gameStatus, setGameStatus] = useState<'active' | 'finished' | null>(
    null,
  );
  const [p1, setP1] = useState<string>('');
  const [p2, setP2] = useState<string>('');
  const [myId, setMyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;

    (async () => {
      try {
        const [me, data] = await Promise.all([fetchMe(), fetchGame(gameId)]);
        if (cancelled) return;
        setMyId(me.user.id);
        setView(data.view);
        setGameStatus(data.status);
        setP1(data.player1Username || '');
        setP2(data.player2Username || '');
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Не удалось загрузить игру');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gameId]);

  useEffect(() => {
    if (!gameId || gameStatus !== 'active') return;
    let socket: Socket | null = null;
    let cancelled = false;

    socket = createGameSocket();
    socketRef.current = socket;

    socket.on('connect_error', () => {
      if (!cancelled) setError('Нет соединения с сервером');
    });

    socket.on('game:update', (payload: { view: GameView }) => {
      if (payload?.view) {
        setView(payload.view);
        if (payload.view.status === 'finished') {
          setGameStatus('finished');
        }
      }
    });

    socket.emit(
      'game:join',
      gameId,
      (res: { error?: string; view?: GameView }) => {
        if (res?.error) setError(res.error);
        if (res?.view) setView(res.view);
      },
    );

    return () => {
      cancelled = true;
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [gameId, gameStatus]);

  function sendMove(action: 'reveal' | 'flag', r: number, c: number) {
    if (!gameId || !socketRef.current || !view) return;
    if (!view.yourTurn || view.status !== 'active') return;

    socketRef.current.emit(
      'game:move',
      { gameId, action, r, c },
      (res: { error?: string; view?: GameView }) => {
        if (res?.error) setError(res.error);
        if (res?.view) {
          setView(res.view);
          if (res.view.status === 'finished') setGameStatus('finished');
        }
      },
    );
  }

  function onCellClick(r: number, c: number) {
    setError(null);
    sendMove('reveal', r, c);
  }

  function onCellContext(e: React.MouseEvent, r: number, c: number) {
    e.preventDefault();
    setError(null);
    sendMove('flag', r, c);
  }

  if (!gameId) return null;

  const compact = view && (view.width > 20 || view.height > 20);
  const cellSize = compact ? '1.1rem' : '1.75rem';

  let statusText = '';
  if (view) {
    if (view.status === 'finished') {
      statusText =
        view.winnerId === myId
          ? 'Вы выиграли'
          : view.winnerId != null
            ? 'Вы проиграли'
            : 'Игра окончена';
    } else {
      statusText = view.yourTurn ? 'Ваш ход' : 'Ход соперника';
    }
  }

  return (
    <div className="game-page">
      <div className="row spread">
        <Link to="/">← На главную</Link>
        {view && (
          <span className="muted">
            {p1 || 'Игрок 1'} vs {p2 || 'Игрок 2'}
          </span>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      {view && (
        <>
          <p className="status-line">{statusText}</p>
          {view.status === 'active' && (
            <p className="muted small hint">
              ЛКМ — открыть клетку (завершает ход). ПКМ — флаг (тоже завершает
              ход).
            </p>
          )}
          <div
            className={`mine-grid ${compact ? 'compact' : ''}`}
            style={
              {
                gridTemplateColumns: `repeat(${view.width}, ${cellSize})`,
                '--cell': cellSize,
              } as React.CSSProperties
            }
          >
            {view.cells.map((row) =>
              row.map((cell) => (
                <button
                  key={`${cell.r}-${cell.c}`}
                  type="button"
                  className={[
                    'cell',
                    cell.revealed ? 'revealed' : 'covered',
                    cell.mine && cell.revealed ? 'exploded' : '',
                    cell.flagged ? 'flagged' : '',
                    cell.revealed &&
                      !cell.mine &&
                      cell.adjacent != null &&
                      cell.adjacent > 0
                      ? `n${cell.adjacent}`
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  disabled={view.status !== 'active' || !view.yourTurn}
                  onClick={() => onCellClick(cell.r, cell.c)}
                  onContextMenu={(e) => onCellContext(e, cell.r, cell.c)}
                >
                  {cell.flagged && !cell.revealed && '⚑'}
                  {cell.revealed &&
                    !cell.mine &&
                    cell.adjacent != null &&
                    cell.adjacent > 0 &&
                    cell.adjacent}
                  {cell.revealed && cell.mine && '●'}
                </button>
              )),
            )}
          </div>
        </>
      )}

      {!view && !error && <p className="muted">Загрузка…</p>}
    </div>
  );
}
