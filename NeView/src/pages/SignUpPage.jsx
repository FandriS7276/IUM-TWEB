/**
 * SignUpPage
 * -----------
 * Registration form with username, email, password, and optional
 * "top critic" toggle. Mirrors the SignIn layout for consistency.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import './AuthPages.css';

export default function SignUpPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ username: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data } = await authAPI.signUp({
        username: form.username,
        email: form.email,
        password: form.password,
      });
      login(data.user, data.token);
      navigate('/');
    } catch (err) {
      if (err.code === 'ERR_NETWORK' || err.response?.status === 404) {
        // Demo mode fallback
        login(
          { id: 'demo', username: form.username, email: form.email, top_critic: false },
          'demo-token'
        );
        navigate('/');
      } else {
        setError(err.response?.data?.message || 'Registration failed. Please try again.');
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
        <h1 className="auth-card__title">Sign Up</h1>

        {error && <p className="auth-card__error">{error}</p>}

        <form className="auth-card__form" onSubmit={handleSubmit}>
          <div className="auth-card__field">
            <input
              type="text"
              name="username"
              placeholder="Username"
              value={form.username}
              onChange={handleChange}
              required
              autoComplete="username"
            />
          </div>

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
              placeholder="Password (min. 8 characters)"
              value={form.password}
              onChange={handleChange}
              required
              autoComplete="new-password"
            />
          </div>

          <div className="auth-card__field">
            <input
              type="password"
              name="confirmPassword"
              placeholder="Confirm password"
              value={form.confirmPassword}
              onChange={handleChange}
              required
              autoComplete="new-password"
            />
          </div>

          <button type="submit" className="auth-card__submit" disabled={loading}>
            {loading ? 'Creating account…' : 'Sign Up'}
          </button>
        </form>

        <p className="auth-card__footer">
          Already have an account?{' '}
          <Link to="/signin" className="auth-card__link">Sign in</Link>.
        </p>
      </div>
    </div>
  );
}
