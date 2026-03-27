import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useLocation } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { getToken } from './api';

export type NotifyPayload = {
  type: string;
  title?: string;
  message?: string;
  data?: {
    gameId?: string;
    requestId?: number;
    difficulty?: string;
    winnerId?: number | null;
  };
};

type ToastItem = { id: number; title: string; message: string };

type SocketContextValue = {
  socket: Socket | null;
  connected: boolean;
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
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeq = useRef(0);
  const location = useLocation();
  const pathRef = useRef(location.pathname);

  useEffect(() => {
    pathRef.current = location.pathname;
  }, [location.pathname]);

  const pushToast = useCallback((title: string, message: string) => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t, { id, title, message }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 5200);
  }, []);

  const showBrowserNotify = useCallback((title: string, body: string) => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    try {
      new Notification(title, { body });
    } catch {
      /* ignore */
    }
  }, []);

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
      pushToast(title, message);
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
  }, [pushToast, showBrowserNotify]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <strong>{t.title}</strong>
            <p>{t.message}</p>
          </div>
        ))}
      </div>
    </SocketContext.Provider>
  );
}

export function requestNotificationPermission() {
  if (typeof Notification === 'undefined') return Promise.resolve('denied');
  return Notification.requestPermission();
}
