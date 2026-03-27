import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { acceptGameInvite, declineGameInvite, getToken } from './api';

export type NotifyPayload = {
  type: string;
  title?: string;
  message?: string;
  data?: {
    gameId?: string;
    requestId?: number;
    difficulty?: string;
    winnerId?: number | null;
    fromUsername?: string;
  };
};

type ToastInfo = { id: number; kind: 'info'; title: string; message: string };
type ToastGameInvite = {
  id: number;
  kind: 'game_invite';
  gameId: string;
  title: string;
  message: string;
  difficulty?: string;
};
type ToastItem = ToastInfo | ToastGameInvite;

type SocketContextValue = {
  socket: Socket | null;
  connected: boolean;
  pushInfoToast: (title: string, message: string) => void;
};

const SocketContext = createContext<SocketContextValue | null>(null);

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error('useSocket must be used inside SocketProvider');
  }
  return ctx;
}

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [modalGameId, setModalGameId] = useState<string | null>(null);
  const toastSeq = useRef(0);
  const location = useLocation();
  const pathRef = useRef(location.pathname);

  useEffect(() => {
    pathRef.current = location.pathname;
  }, [location.pathname]);

  const removeToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const pushInfoToast = useCallback(
    (title: string, message: string) => {
      const id = ++toastSeq.current;
      setToasts((t) => [...t, { id, kind: 'info', title, message }]);
      window.setTimeout(() => removeToast(id), 4800);
    },
    [removeToast],
  );

  const showBrowserNotify = useCallback((title: string, body: string) => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    try {
      new Notification(title, { body });
    } catch {
      /* ignore */
    }
  }, []);

  const handleAcceptInvite = useCallback(
    async (gameId: string, toastId: number) => {
      try {
        await acceptGameInvite(gameId);
        removeToast(toastId);
        setModalGameId(gameId);
        window.dispatchEvent(
          new CustomEvent('saper:refresh', { detail: { type: 'game_accepted' } }),
        );
      } catch (e) {
        pushInfoToast(
          'Ошибка',
          e instanceof Error ? e.message : 'Не удалось принять',
        );
      }
    },
    [pushInfoToast, removeToast],
  );

  const handleDeclineInvite = useCallback(
    async (gameId: string, toastId: number) => {
      try {
        await declineGameInvite(gameId);
        removeToast(toastId);
        window.dispatchEvent(
          new CustomEvent('saper:refresh', { detail: { type: 'game_declined' } }),
        );
      } catch (e) {
        pushInfoToast(
          'Ошибка',
          e instanceof Error ? e.message : 'Не удалось отклонить',
        );
      }
    },
    [pushInfoToast, removeToast],
  );

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const s = io({
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    setSocket(s);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);

    const onNotify = (payload: NotifyPayload) => {
      const gid = payload.data?.gameId;

      if (payload.type === 'game_invite' && gid) {
        const title = payload.title || 'Вызов на бой';
        const message = payload.message || '';
        showBrowserNotify(title, message);
        setToasts((prev) => {
          if (prev.some((x) => x.kind === 'game_invite' && x.gameId === gid)) {
            return prev;
          }
          const id = ++toastSeq.current;
          return [
            ...prev,
            {
              id,
              kind: 'game_invite',
              gameId: gid,
              title,
              message,
              difficulty: payload.data?.difficulty,
            },
          ];
        });
        window.dispatchEvent(
          new CustomEvent('saper:refresh', { detail: { type: payload.type } }),
        );
        return;
      }

      if (payload.type === 'game_invite_accepted' && gid) {
        const title = payload.title || 'Вызов принят';
        const message = payload.message || '';
        pushInfoToast(title, message);
        showBrowserNotify(title, message);
        window.dispatchEvent(
          new CustomEvent('saper:game-accepted', { detail: { gameId: gid } }),
        );
        window.dispatchEvent(
          new CustomEvent('saper:refresh', { detail: { type: payload.type } }),
        );
        return;
      }

      if (payload.type === 'game_invite_declined' && gid) {
        const title = payload.title || 'Вызов отклонён';
        const message = payload.message || '';
        pushInfoToast(title, message);
        showBrowserNotify(title, message);
        window.dispatchEvent(
          new CustomEvent('saper:refresh', { detail: { type: payload.type } }),
        );
        return;
      }

      if (
        payload.type === 'game_turn' &&
        gid &&
        pathRef.current.startsWith(`/game/${gid}`)
      ) {
        window.dispatchEvent(
          new CustomEvent('saper:refresh', { detail: { type: payload.type } }),
        );
        return;
      }

      const title = payload.title || 'Уведомление';
      const message = payload.message || '';
      pushInfoToast(title, message);
      showBrowserNotify(title, message);

      window.dispatchEvent(
        new CustomEvent('saper:refresh', { detail: { type: payload.type } }),
      );
    };

    s.on('notify', onNotify);

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('notify', onNotify);
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [pushInfoToast, showBrowserNotify]);

  return (
    <SocketContext.Provider value={{ socket, connected, pushInfoToast }}>
      {children}

      {modalGameId && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="invite-modal-title"
          onClick={() => setModalGameId(null)}
        >
          <div
            className="modal-box"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="invite-modal-title">Бой принят</h2>
            <p className="muted">Перейти на поле сейчас?</p>
            <div className="modal-actions">
              <button
                type="button"
                onClick={() => {
                  const id = modalGameId;
                  setModalGameId(null);
                  navigate(`/game/${id}`);
                }}
              >
                Начать бой
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setModalGameId(null)}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) =>
          t.kind === 'info' ? (
            <div key={t.id} className="toast">
              <strong>{t.title}</strong>
              <p>{t.message}</p>
            </div>
          ) : (
            <div key={t.id} className="toast toast-invite">
              <strong>{t.title}</strong>
              <p>{t.message}</p>
              <div className="toast-actions">
                <button
                  type="button"
                  onClick={() => handleAcceptInvite(t.gameId, t.id)}
                >
                  Принять
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => handleDeclineInvite(t.gameId, t.id)}
                >
                  Отклонить
                </button>
              </div>
            </div>
          ),
        )}
      </div>
    </SocketContext.Provider>
  );
}

export function requestNotificationPermission() {
  if (typeof Notification === 'undefined') return Promise.resolve('denied');
  return Notification.requestPermission();
}
