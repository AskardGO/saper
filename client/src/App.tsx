import { useState } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { getToken } from './api';
import { getGameAudio } from './gameAudio';
import { SocketProvider } from './SocketContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import GamePage from './pages/GamePage';

function Protected({ children }: { children: React.ReactNode }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }
  return <SocketProvider>{children}</SocketProvider>;
}

function AudioBar() {
  const [ambient, setAmbient] = useState(() => getGameAudio().isRunning());
  const [muted, setMuted] = useState(false);

  if (!getToken()) return null;

  function toggleAmbient() {
    const a = getGameAudio();
    if (a.isRunning()) {
      a.stop();
      setAmbient(false);
    } else {
      a.start();
      setAmbient(true);
    }
  }

  function toggleMute() {
    const a = getGameAudio();
    const next = !muted;
    a.setMuted(next);
    setMuted(next);
  }

  return (
    <div className="audio-bar" title="Синтез в духе 80-х (не оригинальный саундтрек сериала)">
      <button type="button" className="ghost audio-btn" onClick={toggleAmbient}>
        {ambient ? '⏹ Стоп' : '♪ Атмосфера'}
      </button>
      <button
        type="button"
        className="ghost audio-btn"
        onClick={toggleMute}
        title={muted ? 'Включить звук' : 'Выключить звук'}
      >
        {muted ? '🔇' : '🔊'}
      </button>
    </div>
  );
}

export default function App() {
  return (
    <div className="app-shell">
      <header className="top-bar top-bar-row">
        <Link to="/" className="logo">
          Сапёр онлайн
        </Link>
        <AudioBar />
      </header>
      <main className="main-area">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/"
            element={
              <Protected>
                <Home />
              </Protected>
            }
          />
          <Route
            path="/game/:gameId"
            element={
              <Protected>
                <GamePage />
              </Protected>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
