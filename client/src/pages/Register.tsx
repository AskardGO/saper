import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register, setToken } from '../api';

export default function Register() {
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
      const { token } = await register(username, password);
      setToken(token);
      nav('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card narrow">
      <h1>Регистрация</h1>
      <p className="muted small">
        Подтверждение почты не требуется — только логин и пароль.
      </p>
      <form onSubmit={onSubmit} className="form">
        <label>
          Логин
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            minLength={2}
            maxLength={32}
          />
        </label>
        <label>
          Пароль
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={4}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? '…' : 'Создать аккаунт'}
        </button>
      </form>
      <p className="muted">
        Уже есть аккаунт? <Link to="/login">Войти</Link>
      </p>
    </div>
  );
}
