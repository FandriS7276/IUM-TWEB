/**
 * SignInPage
 * -----------
 * Full-screen sign-in form with a cinematic background.
 * On successful login the JWT + user data are persisted
 * via AuthContext and the user is redirected home.
 *
 * No demo mode — requires a real backend connection.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import './AuthPages.css';

export default function SignInPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data } = await authAPI.signIn(form);
      login(data.user, data.token);
      navigate('/');
    } catch (err) {
      // Map specific backend error messages to user-friendly feedback
      if (err.code === 'ERR_NETWORK') {
        setError('Unable to connect to the server. Please check if the backend is running.');
      } else {
        setError(err.response?.data?.message || 'Invalid credentials. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-page__bg" />
      <div className="auth-page__overlay" />

      <div className="auth-card">
        <h1 className="auth-card__title">Sign In</h1>

        {error && <p className="auth-card__error">{error}</p>}

        <form className="auth-card__form" onSubmit={handleSubmit}>
          <div className="auth-card__field">
            <input
              type="email"
              name="email"
              placeholder="Email address"
              value={form.email}
              onChange={handleChange}
              required
              autoComplete="email"
            />
          </div>

          <div className="auth-card__field">
            <input
              type="password"
              name="password"
              placeholder="Password"
              value={form.password}
              onChange={handleChange}
              required
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="auth-card__submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="auth-card__footer">
          New to NeView?{' '}
          <Link to="/signup" className="auth-card__link">Sign up now</Link>.
        </p>
      </div>
    </div>
  );
}
