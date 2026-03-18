/**
 * MovieDetailPage
 * ----------------
 * Full movie details page with:
 *  - Hero backdrop with poster + metadata
 *  - Cast & crew list
 *  - Tomatometer + ratings breakdown
 *  - User reviews section with create-review form
 *  - Real-time Socket.IO chat room per movie
 *
 * Uses placeholder data until the SQL backend is live.
 */
import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Star, ThumbsUp, ThumbsDown, Send, MessageCircle, Award, Clock, Calendar } from '../components/Icons';
import { useAuth } from '../context/AuthContext';
import { useSocketChat } from '../hooks/useSocketChat';
import { FEATURED_MOVIES, GENRE_ROWS, PLACEHOLDER_REVIEWS } from '../services/placeholders';
import './MovieDetailPage.css';

// Flatten all placeholder movies into a lookup map
const ALL_MOVIES = [
  ...FEATURED_MOVIES,
  ...GENRE_ROWS.flatMap((r) => r.movies),
];

export default function MovieDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();

  // Find the movie from placeholder data
  const movie = useMemo(
    () => ALL_MOVIES.find((m) => String(m.id) === id) || FEATURED_MOVIES[0],
    [id]
  );

  // Socket.IO chat
  const { messages, sendMessage } = useSocketChat(movie.name);
  const [chatInput, setChatInput] = useState('');

  // Review creation form state
  const [reviewForm, setReviewForm] = useState({ type: 'Fresh', score: '', content: '' });
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  const handleSendChat = (e) => {
    e.preventDefault();
    if (chatInput.trim()) {
      sendMessage(chatInput.trim(), user?.username || 'Anonymous');
      setChatInput('');
    }
  };

  const handleReviewSubmit = (e) => {
    e.preventDefault();
    // TODO: Call reviewsAPI.create() once backend auth is wired
    setReviewSubmitted(true);
    setTimeout(() => setReviewSubmitted(false), 3000);
    setReviewForm({ type: 'Fresh', score: '', content: '' });
  };

  return (
    <main className="movie-detail">
      {/* ── Hero section ──────────────────────────────────────── */}
      <section className="md-hero">
        <div
          className="md-hero__backdrop"
          style={{
            backgroundImage: movie.poster
              ? `url(${movie.poster})`
              : 'linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)',
          }}
        />
        <div className="md-hero__gradient" />

        <div className="md-hero__content">
          {/* Poster thumbnail */}
          <div className="md-hero__poster">
            {movie.poster ? (
              <img src={movie.poster} alt={movie.name} />
            ) : (
              <div className="md-hero__poster-placeholder">{movie.name[0]}</div>
            )}
          </div>

          {/* Info */}
          <div className="md-hero__info">
            <h1 className="md-hero__title">{movie.name}</h1>
            {movie.tagline && <p className="md-hero__tagline">&ldquo;{movie.tagline}&rdquo;</p>}

            <div className="md-hero__meta">
              <span><Calendar size={14} /> {movie.date}</span>
              <span><Clock size={14} /> {movie.minute} min</span>
              {movie.genres.map((g) => (
                <span key={g} className="md-hero__genre-tag">{g}</span>
              ))}
            </div>

            <p className="md-hero__desc">{movie.description}</p>

            {/* Stats row */}
            <div className="md-stats">
              {movie.tomatometer !== null && (
                <div className="md-stat">
                  <span className="md-stat__value" style={{ color: movie.tomatometer >= 60 ? 'var(--fresh)' : 'var(--rotten)' }}>
                    {movie.tomatometer >= 60 ? '🍅' : '🤢'} {movie.tomatometer}%
                  </span>
                  <span className="md-stat__label">Tomatometer</span>
                </div>
              )}
              <div className="md-stat">
                <span className="md-stat__value" style={{ color: 'var(--star)' }}>
                  <Star size={16} fill="var(--star)" /> {movie.rating.toFixed(1)}
                </span>
                <span className="md-stat__label">Avg Rating</span>
              </div>
              <div className="md-stat">
                <span className="md-stat__value">
                  <ThumbsUp size={16} /> {movie.likes.toLocaleString()}
                </span>
                <span className="md-stat__label">Likes</span>
              </div>
              <div className="md-stat">
                <span className="md-stat__value">{movie.totalReviews}</span>
                <span className="md-stat__label">Reviews</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Cast & Crew ───────────────────────────────────────── */}
      <section className="md-section container">
        <h2 className="md-section__title">Cast &amp; Crew</h2>
        <div className="md-cast-grid">
          {movie.crew.map((c, i) => (
            <div key={`crew-${i}`} className="md-cast-card">
              <div className="md-cast-card__avatar">{c.name[0]}</div>
              <div>
                <p className="md-cast-card__name">{c.name}</p>
                <p className="md-cast-card__role">{c.role}</p>
              </div>
            </div>
          ))}
          {movie.actors.map((a, i) => (
            <div key={`actor-${i}`} className="md-cast-card">
              <div className="md-cast-card__avatar">{a.name[0]}</div>
              <div>
                <p className="md-cast-card__name">{a.name}</p>
                <p className="md-cast-card__role">as {a.role}</p>
              </div>
            </div>
          ))}
          {movie.actors.length === 0 && movie.crew.length === 0 && (
            <p className="md-section__empty">Cast &amp; crew data will appear once the SQL backend is connected.</p>
          )}
        </div>
      </section>

      {/* ── Reviews ───────────────────────────────────────────── */}
      <section className="md-section container">
        <h2 className="md-section__title"><MessageCircle size={20} /> Reviews</h2>

        {/* Write a review (requires auth) */}
        {user ? (
          <form className="md-review-form" onSubmit={handleReviewSubmit}>
            <h3 className="md-review-form__heading">Write a Review</h3>

            <div className="md-review-form__row">
              <label className="md-review-form__toggle">
                <input
                  type="radio"
                  name="review_type"
                  value="Fresh"
                  checked={reviewForm.type === 'Fresh'}
                  onChange={() => setReviewForm((f) => ({ ...f, type: 'Fresh' }))}
                />
                <span className="md-review-form__chip md-review-form__chip--fresh">🍅 Fresh</span>
              </label>
              <label className="md-review-form__toggle">
                <input
                  type="radio"
                  name="review_type"
                  value="Rotten"
                  checked={reviewForm.type === 'Rotten'}
                  onChange={() => setReviewForm((f) => ({ ...f, type: 'Rotten' }))}
                />
                <span className="md-review-form__chip md-review-form__chip--rotten">🤢 Rotten</span>
              </label>

              <input
                type="text"
                className="md-review-form__score"
                placeholder="Score (e.g. 8/10)"
                value={reviewForm.score}
                onChange={(e) => setReviewForm((f) => ({ ...f, score: e.target.value }))}
              />
            </div>

            <textarea
              className="md-review-form__textarea"
              placeholder="Share your thoughts… (5-2000 characters)"
              value={reviewForm.content}
              onChange={(e) => setReviewForm((f) => ({ ...f, content: e.target.value }))}
              required
              minLength={5}
              maxLength={2000}
              rows={4}
            />

            <button type="submit" className="md-review-form__submit">
              {reviewSubmitted ? 'Review submitted!' : 'Submit Review'}
            </button>
          </form>
        ) : (
          <p className="md-section__signin-prompt">
            <Link to="/signin">Sign in</Link> to write a review.
          </p>
        )}

        {/* Existing reviews */}
        <div className="md-reviews-list">
          {PLACEHOLDER_REVIEWS.map((r) => (
            <div key={r._id} className="md-review">
              <div className="md-review__header">
                <span className={`md-review__type ${r.review_type === 'Fresh' ? 'md-review__type--fresh' : 'md-review__type--rotten'}`}>
                  {r.review_type === 'Fresh' ? '🍅' : '🤢'}
                </span>
                <div>
                  <p className="md-review__critic">
                    {r.critic_name}
                    {r.top_critic && <Award size={12} className="md-review__tc-badge" />}
                  </p>
                  <p className="md-review__pub">{r.publisher_name} &middot; {r.review_date}</p>
                </div>
                {r.review_score && <span className="md-review__score">{r.review_score}</span>}
              </div>
              <p className="md-review__content">{r.review_content}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Live Chat ─────────────────────────────────────────── */}
      <section className="md-section container">
        <h2 className="md-section__title"><MessageCircle size={20} /> Live Chat</h2>

        <div className="md-chat">
          <div className="md-chat__messages">
            {messages.length === 0 && (
              <p className="md-chat__empty">No messages yet. Be the first to say something!</p>
            )}
            {messages.map((msg, i) => (
              <div key={i} className="md-chat__msg">
                <span className="md-chat__user">{msg.user}</span>
                <span className="md-chat__text">{msg.message}</span>
                <span className="md-chat__time">
                  {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''}
                </span>
              </div>
            ))}
          </div>

          <form className="md-chat__input-row" onSubmit={handleSendChat}>
            <input
              type="text"
              className="md-chat__input"
              placeholder={user ? 'Type a message…' : 'Sign in to chat'}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={!user}
            />
            <button type="submit" className="md-chat__send" disabled={!user || !chatInput.trim()}>
              <Send size={18} />
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
