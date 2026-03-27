import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { getToken } from './api';
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

export default function App() {
  return (
    <div className="app-shell">
      <header className="top-bar">
        <Link to="/" className="logo">
          Сапёр онлайн
        </Link>
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
