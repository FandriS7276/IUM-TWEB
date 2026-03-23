/**
 * HeroBanner Component
 * ---------------------
 * Full-viewport hero section that auto-rotates through trending movies,
 * Netflix-style. Fetches data from GET /popular/trending on mount.
 *
 * Shows movie title as background with a gradient overlay, description,
 * and CTA buttons. Falls back to a gradient background when no poster
 * is available.
 *
 * Supports drag-to-swipe: users can click-drag or touch-swipe horizontally
 * to navigate between slides. A 50px threshold prevents accidental swipes.
 * Auto-rotation pauses briefly after a manual interaction.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Info } from './Icons';
import { popularAPI, moviesAPI } from '../services/api';
import './HeroBanner.css';

const ROTATION_INTERVAL = 8000;
const SWIPE_THRESHOLD = 50; // minimum px drag to count as a swipe

export default function HeroBanner() {
  const [movies, setMovies] = useState([]);
  const [current, setCurrent] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const navigate = useNavigate();

  // Refs for drag/swipe tracking
  const heroRef = useRef(null);
  const dragStartX = useRef(null);
  const isDragging = useRef(false);
  const timerRef = useRef(null);

  /**
   * Fetch trending movies from the backend for the hero carousel,
   * then enrich with poster/description/genre data from PostgreSQL.
   */
  useEffect(() => {
    (async () => {
      try {
        const { data } = await popularAPI.trending({ limit: 5 });
        const items = data.data || data.results || [];
        if (items.length === 0) return;

        // Normalise the MongoDB popular data into a flat shape
        const normalised = items.map((item) => ({
          name: item.title || item.name || item.movie_title || 'Untitled',
          tomatometer: item.stats?.tomatometer ?? null,
          freshCount: item.stats?.freshCount ?? 0,
          rottenCount: item.stats?.rottenCount ?? 0,
        }));

        // Enrich with PostgreSQL data (poster, description, genres, rating, runtime)
        try {
          const titles = normalised.map((m) => m.name);
          const pgRes = await moviesAPI.getBatch(titles);
          const pgMovies = pgRes.data?.movies || [];

          const pgMap = {};
          pgMovies.forEach((m) => {
            if (m.name) pgMap[m.name.toLowerCase()] = m;
          });

          const enriched = normalised.map((movie) => {
            const pg = pgMap[movie.name.toLowerCase()];
            if (!pg) return movie;
            return {
              ...movie,
              id: pg.id,
              poster: pg.poster,
              description: pg.description,
              genres: pg.genres,
              rating: pg.rating,
              year: pg.year,
              minute: pg.runtime,
            };
          });

          setMovies(enriched);
        } catch {
          // PostgreSQL enrichment failed — use MongoDB data alone
          setMovies(normalised);
        }
      } catch (err) {
        console.error('Failed to load hero banner data:', err);
      }
    })();
  }, []);

  // Current movie being displayed
  const movie = movies[current] || null;

  /**
   * Navigate to next/prev slide with a brief CSS fade transition.
   * direction: 1 = next, -1 = prev
   */
  const goToSlide = useCallback(
    (direction) => {
      if (transitioning || movies.length === 0) return;
      setTransitioning(true);
      setTimeout(() => {
        setCurrent((prev) => {
          const next = prev + direction;
          if (next < 0) return movies.length - 1;
          return next % movies.length;
        });
        setTransitioning(false);
      }, 400);
    },
    [transitioning, movies.length]
  );

  // Auto-rotate featured movies
  useEffect(() => {
    if (movies.length <= 1) return;
    timerRef.current = setInterval(() => goToSlide(1), ROTATION_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [goToSlide, movies.length]);

  /**
   * Restarts the auto-rotation timer so manual interactions
   * don't cause an immediate auto-advance.
   */
  const resetTimer = useCallback(() => {
    clearInterval(timerRef.current);
    if (movies.length > 1) {
      timerRef.current = setInterval(() => goToSlide(1), ROTATION_INTERVAL);
    }
  }, [goToSlide, movies.length]);

  // ── Mouse drag handlers ──────────────────────────────────────
  const handlePointerDown = useCallback((e) => {
    if (e.button && e.button !== 0) return;
    dragStartX.current = e.clientX ?? e.touches?.[0]?.clientX;
    isDragging.current = false;
  }, []);

  const handlePointerMove = useCallback((e) => {
    if (dragStartX.current === null) return;
    const x = e.clientX ?? e.touches?.[0]?.clientX;
    if (Math.abs(x - dragStartX.current) > 10) {
      isDragging.current = true;
    }
  }, []);

  const handlePointerUp = useCallback(
    (e) => {
      if (dragStartX.current === null) return;
      const endX = e.clientX ?? e.changedTouches?.[0]?.clientX;
      const delta = endX - dragStartX.current;

      if (Math.abs(delta) >= SWIPE_THRESHOLD) {
        goToSlide(delta < 0 ? 1 : -1);
        resetTimer();
      }

      dragStartX.current = null;
      isDragging.current = false;
    },
    [goToSlide, resetTimer]
  );

  /**
   * Prevent click navigation when the user was dragging.
   */
  const handleClickCapture = useCallback((e) => {
    if (isDragging.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, []);

  // ── Empty state while loading or if no data ──────────────────
  if (!movie) {
    return (
      <section className="hero">
        <div
          className="hero__backdrop"
          style={{
            backgroundImage: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
          }}
        />
        <div className="hero__gradient" />
        <div className="hero__content">
          <h1 className="hero__title">NeView</h1>
          <p className="hero__description">Loading trending movies...</p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="hero"
      ref={heroRef}
      onMouseDown={handlePointerDown}
      onMouseMove={handlePointerMove}
      onMouseUp={handlePointerUp}
      onTouchStart={handlePointerDown}
      onTouchMove={handlePointerMove}
      onTouchEnd={handlePointerUp}
      onClickCapture={handleClickCapture}
      style={{ userSelect: 'none' }}
    >
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
        <h1 className="hero__title">{movie.name || movie.movie_title || movie.title}</h1>

        <div className="hero__meta">
          {movie.tomatometer !== null && movie.tomatometer !== undefined && (
            <span className="hero__badge hero__badge--tomato">
              {movie.tomatometer >= 60 ? '🍅' : '🤢'} {movie.tomatometer}%
            </span>
          )}
          {movie.year && <span className="hero__badge">{movie.year}</span>}
          {movie.minute && <span className="hero__badge">{movie.minute} min</span>}
          {(movie.genres || []).map((g) => (
            <span key={g} className="hero__genre-tag">
              {g}
            </span>
          ))}
        </div>

        <p className="hero__description">
          {movie.description || movie.review_content || ''}
        </p>

        <div className="hero__actions">
          <button
            className="hero__btn hero__btn--play"
            onClick={() => navigate(`/movie/${encodeURIComponent(movie.name || movie.movie_title || movie.title)}`)}
          >
            <Play size={20} fill="black" /> Play
          </button>
          <button
            className="hero__btn hero__btn--info"
            onClick={() => navigate(`/movie/${encodeURIComponent(movie.name || movie.movie_title || movie.title)}`)}
          >
            <Info size={20} /> More Info
          </button>
        </div>
      </div>

      {/* Slide indicators */}
      {movies.length > 1 && (
        <div className="hero__indicators">
          {movies.map((_, i) => (
            <button
              key={i}
              className={`hero__indicator ${i === current ? 'hero__indicator--active' : ''}`}
              onClick={() => {
                setTransitioning(true);
                setTimeout(() => {
                  setCurrent(i);
                  setTransitioning(false);
                }, 400);
                resetTimer();
              }}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
