import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login, setToken } from '../api';

export default function Login() {
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token } = await login(username, password);
      setToken(token);
      nav('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card narrow">
      <h1>Вход</h1>
      <form onSubmit={onSubmit} className="form">
        <label>
          Логин
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Пароль
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? '…' : 'Войти'}
        </button>
      </form>
      <p className="muted">
        Нет аккаунта? <Link to="/register">Регистрация</Link>
      </p>
    </div>
  );
}
