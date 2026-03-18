/**
 * HeroBanner Component
 * ---------------------
 * Full-viewport hero section that auto-rotates through featured movies,
 * Netflix-style. Shows movie poster as background with a gradient overlay,
 * title, description, and CTA buttons.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Info } from './Icons';
import { FEATURED_MOVIES } from '../services/placeholders';
import './HeroBanner.css';

const ROTATION_INTERVAL = 8000; // ms between automatic slide changes

export default function HeroBanner() {
  const [current, setCurrent] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const navigate = useNavigate();
  const movie = FEATURED_MOVIES[current];

  // Auto-rotate featured movies
  const goNext = useCallback(() => {
    setTransitioning(true);
    setTimeout(() => {
      setCurrent((prev) => (prev + 1) % FEATURED_MOVIES.length);
      setTransitioning(false);
    }, 500);
  }, []);

  useEffect(() => {
    const timer = setInterval(goNext, ROTATION_INTERVAL);
    return () => clearInterval(timer);
  }, [goNext]);

  return (
    <section className="hero">
      {/* Background image with gradient overlay */}
      <div
        className={`hero__backdrop ${transitioning ? 'hero__backdrop--fading' : ''}`}
        style={{
          backgroundImage: movie.poster
            ? `url(${movie.poster})`
            : `linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)`,
        }}
      />
      <div className="hero__gradient" />

      {/* Content */}
      <div className="hero__content">
        <h1 className="hero__title">{movie.name}</h1>

        <div className="hero__meta">
          {movie.tomatometer !== null && (
            <span className="hero__badge hero__badge--tomato">
              {movie.tomatometer >= 60 ? '🍅' : '🤢'} {movie.tomatometer}%
            </span>
          )}
          <span className="hero__badge">{movie.date}</span>
          <span className="hero__badge">{movie.minute} min</span>
          {movie.genres.map((g) => (
            <span key={g} className="hero__genre-tag">{g}</span>
          ))}
        </div>

        <p className="hero__description">{movie.description}</p>

        <div className="hero__actions">
          <button
            className="hero__btn hero__btn--play"
            onClick={() => navigate(`/movie/${movie.id}`)}
          >
            <Play size={20} fill="black" /> Play
          </button>
          <button
            className="hero__btn hero__btn--info"
            onClick={() => navigate(`/movie/${movie.id}`)}
          >
            <Info size={20} /> More Info
          </button>
        </div>
      </div>

      {/* Slide indicators */}
      <div className="hero__indicators">
        {FEATURED_MOVIES.map((_, i) => (
          <button
            key={i}
            className={`hero__indicator ${i === current ? 'hero__indicator--active' : ''}`}
            onClick={() => {
              setTransitioning(true);
              setTimeout(() => { setCurrent(i); setTransitioning(false); }, 400);
            }}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>
    </section>
  );
}
