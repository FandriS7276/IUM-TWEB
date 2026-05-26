/**
 * ProfilePage
 * -------------
 * Authenticated user profile view with avatar, bio, and
 * sections for review history. Fetches profile data from
 * GET /user/profile on mount.
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { User, Star, MessageCircle, Film, Settings } from '../components/Icons';
import { reviewsAPI } from '../services/api';
import './ProfilePage.css';

export default function ProfilePage() {
  const { user } = useAuth();
  const [userReviews, setUserReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(false);

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
            <span className="profile-stat__value">{userReviews.length}</span>
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

        {/* Reviews section */}
        <section className="profile-section">
          <h2 className="profile-section__title">My Reviews</h2>
          {userReviews.length > 0 ? (
            <div className="md-reviews-list">
              {userReviews.map((r) => (
                <div key={r._id} className="md-review">
                  <div className="md-review__header">
                    <span
                      className={`md-review__type ${
                        r.review_type === 'Fresh'
                          ? 'md-review__type--fresh'
                          : 'md-review__type--rotten'
                      }`}
                    >
                      {r.review_type === 'Fresh' ? '🍅' : '🤢'}
                    </span>
                    <div>
                      <p className="md-review__critic">{r.movie_title}</p>
                      <p className="md-review__pub">
                        {r.review_date
                          ? new Date(r.review_date).toLocaleDateString()
                          : ''}
                      </p>
                    </div>
                    {r.review_score && (
                      <span className="md-review__score">{r.review_score}</span>
                    )}
                  </div>
                  <p className="md-review__content">{r.review_content}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="profile-section__empty">
              {loadingReviews
                ? 'Loading your reviews...'
                : 'You haven\'t written any reviews yet.'}
            </p>
          )}
        </section>

        {/* Watchlist section */}
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
