/**
 * ProfilePage
 * -------------
 * Simple user profile view with avatar, bio, and placeholder
 * sections for review history and watchlist.
 */
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { User, Star, MessageCircle, Film, Settings } from '../components/Icons';
import './ProfilePage.css';

export default function ProfilePage() {
  const { user } = useAuth();

  // Redirect to sign-in if not authenticated
  if (!user) return <Navigate to="/signin" replace />;

  return (
    <main className="profile-page">
      <div className="container">
        {/* Profile header */}
        <div className="profile-header">
          <div className="profile-header__avatar">
            {user.avatar ? (
              <img src={user.avatar} alt={user.username} />
            ) : (
              <span>{user.username?.[0]?.toUpperCase() || 'U'}</span>
            )}
          </div>
          <div className="profile-header__info">
            <h1 className="profile-header__name">{user.username}</h1>
            <p className="profile-header__email">{user.email}</p>
            {user.top_critic && (
              <span className="profile-header__badge">Top Critic</span>
            )}
            {user.bio && <p className="profile-header__bio">{user.bio}</p>}
          </div>
        </div>

        {/* Stats row */}
        <div className="profile-stats">
          <div className="profile-stat">
            <MessageCircle size={20} />
            <span className="profile-stat__value">0</span>
            <span className="profile-stat__label">Reviews</span>
          </div>
          <div className="profile-stat">
            <Film size={20} />
            <span className="profile-stat__value">0</span>
            <span className="profile-stat__label">Watchlist</span>
          </div>
          <div className="profile-stat">
            <Star size={20} />
            <span className="profile-stat__value">0</span>
            <span className="profile-stat__label">Favorites</span>
          </div>
        </div>

        {/* Placeholder sections */}
        <section className="profile-section">
          <h2 className="profile-section__title">My Reviews</h2>
          <p className="profile-section__empty">
            Your reviews will appear here once the backend is fully connected.
          </p>
        </section>

        <section className="profile-section">
          <h2 className="profile-section__title">Watchlist</h2>
          <p className="profile-section__empty">
            Movies you add to your watchlist will show up here.
          </p>
        </section>
      </div>
    </main>
  );
}
