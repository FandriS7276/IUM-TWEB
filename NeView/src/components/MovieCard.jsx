/**
 * MovieCard Component
 * --------------------
 * Netflix-style movie thumbnail that expands on hover to reveal
 * additional details: description, tomatometer, average rating,
 * likes count, and genre tags.
 *
 * The expansion is achieved with CSS transforms (scale + translate)
 * so the card "pops out" of the row without disrupting the grid layout.
 * A short delay prevents accidental triggers during fast scrolling.
 */
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, ThumbsUp, Play, ChevronDown } from './Icons';
import './MovieCard.css';

// ── Tomatometer display helper ───────────────────────────────────
function TomatometerBadge({ score }) {
  if (score === null || score === undefined) return null;
  const isFresh = score >= 60;
  return (
    <span className={`mc-badge ${isFresh ? 'mc-badge--fresh' : 'mc-badge--rotten'}`}>
      {isFresh ? '🍅' : '🤢'} {score}%
    </span>
  );
}

export default function MovieCard({ movie }) {
  const [hovered, setHovered] = useState(false);
  const hoverTimeout = useRef(null);
  const navigate = useNavigate();

  // Delay hover-in to prevent flickering during fast scrolls
  const handleMouseEnter = () => {
    hoverTimeout.current = setTimeout(() => setHovered(true), 300);
  };

  const handleMouseLeave = () => {
    clearTimeout(hoverTimeout.current);
    setHovered(false);
  };

  const goToMovie = () => navigate(`/movie/${movie.id}`);

  return (
    <div
      className={`movie-card ${hovered ? 'movie-card--expanded' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* ── Poster / Thumbnail ─────────────────────────────────── */}
      <div className="movie-card__poster" onClick={goToMovie}>
        {movie.poster ? (
          <img src={movie.poster} alt={movie.name} loading="lazy" />
        ) : (
          /* Gradient placeholder when no poster is available */
          <div className="movie-card__placeholder">
            <span className="movie-card__placeholder-title">{movie.name}</span>
          </div>
        )}
      </div>

      {/* ── Expanded info panel (visible on hover) ─────────────── */}
      {hovered && (
        <div className="movie-card__info">
          {/* Action buttons row */}
          <div className="movie-card__buttons">
            <button className="movie-card__circle-btn movie-card__circle-btn--play" onClick={goToMovie} aria-label="Play">
              <Play size={16} fill="black" />
            </button>
            <button className="movie-card__circle-btn" aria-label="Like">
              <ThumbsUp size={14} />
            </button>
            <div style={{ flex: 1 }} />
            <button className="movie-card__circle-btn" onClick={goToMovie} aria-label="More info">
              <ChevronDown size={16} />
            </button>
          </div>

          {/* Metadata badges */}
          <div className="movie-card__meta">
            <TomatometerBadge score={movie.tomatometer} />

            {movie.rating > 0 && (
              <span className="mc-badge mc-badge--rating">
                <Star size={12} fill="var(--star)" stroke="var(--star)" /> {movie.rating.toFixed(1)}
              </span>
            )}

            {movie.likes > 0 && (
              <span className="mc-badge mc-badge--likes">
                <ThumbsUp size={11} /> {movie.likes.toLocaleString()}
              </span>
            )}
          </div>

          {/* Description excerpt */}
          <p className="movie-card__desc">{movie.description}</p>

          {/* Genre tags */}
          <div className="movie-card__genres">
            {movie.genres.map((g) => (
              <span key={g} className="movie-card__genre-dot">
                {g}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
