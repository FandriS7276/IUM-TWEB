/**
 * MovieCard Component — Progressive Loading Edition
 * ---------------------------------------------------
 * Netflix-style movie thumbnail with a floating hover overlay that
 * lazily loads data in tiers to minimize initial page load time.
 *
 * Data loading tiers:
 *  - Tier 1 (card render): poster + title only — loaded by HomePage
 *  - Tier 2 (hover):       genres, short description, rating — fetched on hover
 *  - Tier 2.5 (expand):    full description — fetched automatically on overlay open
 *  - Tier 3 (play):        full detail page — navigates to /movie/:id
 *
 * Hover behavior:
 *  - 600ms delay before showing — prevents accidental popups
 *  - Dismisses immediately on scroll; re-hovering allowed 300ms after scroll stops
 *  - Portal to document.body escapes carousel's overflow:hidden
 *  - 100ms grace period on leave to handle jitter
 *
 * Caching:
 *  - Hover data is cached in a ref so re-hovering the same card
 *    doesn't fire another API request. The browser's HTTP cache
 *    (Cache-Control: max-age=3600) provides a second layer.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Star, ThumbsUp, ThumbsDown, Play, ChevronDown, ChevronUp } from './Icons';
import { moviesAPI } from '../services/api';
import './MovieCard.css';

/** Delay before the overlay appears (ms) */
const HOVER_DELAY = 600;

/** Grace period before closing after mouse leaves (ms) */
const LEAVE_GRACE = 100;

function TomatometerBadge({ score }) {
  if (score === null || score === undefined) return null;
  const isFresh = score >= 60;
  return (
    <span className={`mc-badge ${isFresh ? 'mc-badge--fresh' : 'mc-badge--rotten'}`}>
      {isFresh ? '🍅' : '🤢'} {Math.round(score)}%
    </span>
  );
}

export default function MovieCard({ movie }) {
  const [hovered, setHovered] = useState(false);
  const [overlayStyle, setOverlayStyle] = useState(null);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(movie.likes ?? 0);

  // ── Tier 2: hover data (lazily loaded) ───────────────────────
  const [hoverData, setHoverData] = useState(null);
  const [hoverLoading, setHoverLoading] = useState(false);
  const hoverCache = useRef(null); // persists across hover/unhover cycles

  // ── Tier 2.5: expanded data (lazily loaded on chevron click) ─
  const [expanded, setExpanded] = useState(false);
  const [expandedData, setExpandedData] = useState(null);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const expandedCache = useRef(null);

  const hoverTimeout = useRef(null);
  const leaveTimeout = useRef(null);
  const cardRef = useRef(null);
  const navigate = useNavigate();

  // ── Refs to avoid stale closures in event listeners ───────────
  /** Always holds the current `hovered` value without re-registering listeners */
  const hoveredRef = useRef(false);
  useEffect(() => { hoveredRef.current = hovered; }, [hovered]);

  /**
   * True while the user is actively scrolling (or within 300ms of the last
   * wheel event). Prevents the hover timer from firing during scroll inertia,
   * which was causing hovers to never show after a scroll gesture.
   */
  const isScrollingRef = useRef(false);
  const scrollEndTimer = useRef(null);

  // ── Dismiss overlay on scroll; block hovers briefly afterwards ─
  const dismissOverlay = useCallback(() => {
    // Always cancel any pending hover timer (fired during scroll inertia)
    clearTimeout(hoverTimeout.current);
    clearTimeout(leaveTimeout.current);

    // Dismiss the visible overlay if one is showing
    if (hoveredRef.current) {
      setHovered(false);
      setOverlayStyle(null);
      setExpanded(false);
    }

    // Block new hovers for 300ms after the last wheel/scroll event so that
    // scroll-inertia events don't immediately kill the next hover attempt.
    isScrollingRef.current = true;
    clearTimeout(scrollEndTimer.current);
    scrollEndTimer.current = setTimeout(() => {
      isScrollingRef.current = false;
    }, 300);
  }, []); // No state dependencies — uses refs to stay stable

  useEffect(() => {
    window.addEventListener('scroll', dismissOverlay, true);
    window.addEventListener('wheel', dismissOverlay, true);
    return () => {
      window.removeEventListener('scroll', dismissOverlay, true);
      window.removeEventListener('wheel', dismissOverlay, true);
    };
  }, [dismissOverlay]); // dismissOverlay is now stable — registers only once

  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      clearTimeout(hoverTimeout.current);
      clearTimeout(leaveTimeout.current);
    };
  }, []);

  /**
   * Fetch Tier 2 hover data when the overlay opens.
   * Uses a ref cache so we only fetch once per card instance.
   * The browser HTTP cache (Cache-Control: 1h) handles cross-session caching.
   */
  const fetchHoverData = useCallback(async () => {
    // Already cached in memory — use it immediately
    if (hoverCache.current) {
      setHoverData(hoverCache.current);
      return;
    }

    // Need an ID to fetch — if the card wasn't enriched with an ID
    // from the slim batch, we can't fetch hover data
    if (!movie.id) return;

    setHoverLoading(true);
    try {
      const { data } = await moviesAPI.getHoverData(movie.id);
      hoverCache.current = data;
      setHoverData(data);
      // Sync like count from the server (most up-to-date source)
      if (data.likes != null && !liked) setLikeCount(data.likes);
    } catch (err) {
      console.warn('Failed to fetch hover data:', err);
    } finally {
      setHoverLoading(false);
    }
  }, [movie.id]);

  /**
   * Fetch Tier 2.5 expanded data when the user clicks chevron-down.
   * Full description (untruncated) + genres.
   */
  const fetchExpandedData = useCallback(async () => {
    if (expandedCache.current) {
      setExpandedData(expandedCache.current);
      return;
    }

    if (!movie.id) return;

    setExpandedLoading(true);
    try {
      const { data } = await moviesAPI.getExpandedData(movie.id);
      expandedCache.current = data;
      setExpandedData(data);
    } catch (err) {
      console.warn('Failed to fetch expanded data:', err);
    } finally {
      setExpandedLoading(false);
    }
  }, [movie.id]);

  /**
   * Compute the overlay position based on where the static card
   * currently sits in the viewport. The overlay is 1.4x wider,
   * centered on the card, and clamped to viewport edges.
   */
  const computeOverlayPosition = useCallback(() => {
    if (!cardRef.current) return null;
    const rect = cardRef.current.getBoundingClientRect();
    const scale = 1.4;
    const expandedW = rect.width * scale;
    let left = rect.left - (expandedW - rect.width) / 2;
    const top = rect.top;
    const vw = window.innerWidth;
    if (left < 8) left = 8;
    if (left + expandedW > vw - 8) left = vw - 8 - expandedW;

    return {
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      width: `${expandedW}px`,
      zIndex: 9999,
    };
  }, []);

  /**
   * Show the overlay after HOVER_DELAY ms and trigger Tier 2 + 2.5 fetch.
   * Both fetches fire in parallel with the delay so data is often
   * ready by the time the overlay animates in.
   * Skips if the user is still in the scroll-cooldown window.
   */
  const showOverlay = useCallback(() => {
    // Don't show during or shortly after a scroll gesture
    if (isScrollingRef.current) return;
    clearTimeout(leaveTimeout.current);
    if (hovered) return;

    // Start fetching hover + expanded data immediately — don't wait for the delay.
    // The 600ms delay is for the visual overlay; the network requests
    // run in the background so full data is ready when the overlay appears.
    if (movie.id) {
      if (!hoverCache.current) fetchHoverData();
      if (!expandedCache.current) fetchExpandedData();
    }

    hoverTimeout.current = setTimeout(() => {
      const style = computeOverlayPosition();
      if (!style) return;
      setOverlayStyle(style);
      setHovered(true);
    }, HOVER_DELAY);
  }, [hovered, computeOverlayPosition, fetchHoverData, fetchExpandedData, movie.id]);

  /**
   * Schedule overlay close with a grace period so moving the
   * cursor within the overlay doesn't cause flicker.
   */
  const scheduleClose = useCallback(() => {
    clearTimeout(hoverTimeout.current);
    leaveTimeout.current = setTimeout(() => {
      setHovered(false);
      setOverlayStyle(null);
      setExpanded(false);
    }, LEAVE_GRACE);
  }, []);

  /** Cancel any pending close (mouse re-entered card or overlay). */
  const cancelClose = useCallback(() => {
    clearTimeout(leaveTimeout.current);
    clearTimeout(hoverTimeout.current);
  }, []);

  // Always use the URL-encoded movie name for navigation
  const movieId = encodeURIComponent(movie.name || movie.movie_title || movie.title || '');

  const goToMovie = useCallback(
    (e) => {
      e.stopPropagation();
      navigate(`/movie/${movieId}`);
    },
    [navigate, movieId],
  );

  const handleLike = useCallback(async (e) => {
    e.stopPropagation();
    if (liked || !movie.id) return; // Only allow liking once per session

    // Optimistic update — show the like immediately, revert on failure
    setLiked(true);
    setLikeCount((prev) => prev + 1);

    try {
      const { data } = await moviesAPI.likeMovie(movie.id);
      setLikeCount(data.likes); // Sync with server's authoritative count
    } catch (err) {
      console.warn('Failed to persist like:', err);
      setLiked(false);
      setLikeCount((prev) => prev - 1); // Revert optimistic update
    }
  }, [liked, movie.id]);

  /** Toggle the expanded section and fetch data if needed */
  const handleExpand = useCallback(
    (e) => {
      e.stopPropagation();
      if (!expanded) {
        fetchExpandedData();
      }
      setExpanded((prev) => !prev);
    },
    [expanded, fetchExpandedData],
  );

  // Resolve display name
  const displayName = movie.name || movie.movie_title || movie.title || 'Untitled';

  // Use hover data for overlay fields when available, fall back to movie prop.
  // Description is short by default (hoverData); clicking chevron sets expanded=true
  // which swaps in the full description from expandedData (pre-fetched in background).
  // expanded resets to false every time the overlay closes, so each new hover starts fresh.
  const overlayRating = hoverData?.rating ?? movie.rating;
  const overlayGenres = hoverData?.genres ?? movie.genres ?? [];
  const overlayDesc = expanded
    ? (expandedData?.description ?? hoverData?.description ?? movie.description)
    : (hoverData?.description ?? movie.description);

  // Shared poster rendering
  const renderPoster = () =>
    movie.poster ? (
      <img src={movie.poster} alt={displayName} loading="lazy" draggable="false" />
    ) : (
      <div className="movie-card__placeholder">
        <span className="movie-card__placeholder-title">{displayName}</span>
      </div>
    );

  // ── Overlay JSX (rendered via Portal to document.body) ────────
  const overlay = hovered && overlayStyle ? (
    <div
      className="movie-card-overlay"
      style={overlayStyle}
      onMouseEnter={cancelClose}
      onMouseMove={cancelClose}
      onMouseLeave={scheduleClose}
    >
      {/* Poster — clicking it navigates to the movie detail page */}
      <div
        className="movie-card-overlay__poster movie-card-overlay__poster--clickable"
        onClick={goToMovie}
        role="button"
        aria-label={`Go to ${displayName}`}
        title={`Go to ${displayName}`}
      >
        {renderPoster()}
      </div>

      {/* Info panel */}
      <div className="movie-card-overlay__info">
        <h3 className="movie-card-overlay__title">{displayName}</h3>

        {/* ── Action buttons ─────────────────────────────────── */}
        <div className="movie-card__buttons">
          {/* Play → movie detail page */}
          <button
            className="movie-card__circle-btn movie-card__circle-btn--play"
            onClick={goToMovie}
            aria-label="Play trailer"
            title="Play trailer"
          >
            <Play size={16} fill="black" />
          </button>

          {/* Like toggle */}
          <button
            className={`movie-card__circle-btn ${liked ? 'movie-card__circle-btn--liked' : ''}`}
            onClick={handleLike}
            aria-label={liked ? 'Unlike' : 'Like'}
            title={liked ? 'Remove from liked' : 'Like this movie'}
          >
            {liked ? <ThumbsDown size={14} /> : <ThumbsUp size={14} />}
          </button>

          <div style={{ flex: 1 }} />

          {/* Expand/collapse → toggles full description */}
          <button
            className="movie-card__circle-btn"
            onClick={handleExpand}
            aria-label={expanded ? 'Show less' : 'Show more'}
            title={expanded ? 'Show less' : 'Show more'}
          >
            {expanded
              ? <ChevronUp size={16} />
              : <ChevronDown size={16} />}
          </button>
        </div>

        {/* ── Metadata badges (Tier 2 — from hover data) ───── */}
        <div className="movie-card__meta">
          <TomatometerBadge score={movie.tomatometer} />
          {overlayRating != null && overlayRating > 0 && (
            <span className="mc-badge mc-badge--rating">
              <Star size={12} fill="var(--star)" stroke="var(--star)" /> {Number(overlayRating).toFixed(1)}
            </span>
          )}
          {likeCount > 0 && (
            <span className="mc-badge mc-badge--likes">
              <ThumbsUp size={11} /> {likeCount.toLocaleString()}
            </span>
          )}
          {movie.review_type && (
            <span className={`mc-badge ${movie.review_type === 'Fresh' ? 'mc-badge--fresh' : 'mc-badge--rotten'}`}>
              {movie.review_type === 'Fresh' ? '🍅' : '🤢'} {movie.review_type}
            </span>
          )}
          {hoverLoading && (
            <span className="mc-badge mc-badge--loading">Loading...</span>
          )}
        </div>

        {/* ── Genres (Tier 2 — from hover data) ────────────── */}
        {overlayGenres.length > 0 && (
          <div className="movie-card__genres">
            {overlayGenres.map((g) => (
              <span key={g} className="movie-card__genre-dot">{g}</span>
            ))}
          </div>
        )}

        {/* ── Description (Tier 2 short / Tier 2.5 full) ───── */}
        {overlayDesc && (
          <p className="movie-card__desc">{overlayDesc}</p>
        )}

        {/* ── Leading actors (Tier 2.5 — from expanded data) ── */}
        {expanded && expandedData?.actors?.length > 0 && (
          <div className="movie-card__actors">
            <span className="movie-card__actors-label">Cast: </span>
            {expandedData.actors.slice(0, 5).map((a, i) => (
              <span key={a.name} className="movie-card__actor">
                {a.name}{a.role ? ` (${a.role})` : ''}{i < Math.min(expandedData.actors.length, 5) - 1 ? ', ' : ''}
              </span>
            ))}
          </div>
        )}

        {/* ── Expanded section loading indicator ───────────── */}
        {expanded && expandedLoading && (
          <p className="movie-card__desc" style={{ opacity: 0.6 }}>
            Loading full details...
          </p>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      {/* ── Static card (Tier 1: poster + title only) */}
      <div
        ref={cardRef}
        className="movie-card"
        onMouseEnter={showOverlay}
        onMouseLeave={scheduleClose}
        onClick={goToMovie}
      >
        <div className="movie-card__poster">{renderPoster()}</div>
      </div>

      {/* ── Portal: overlay renders at document.body level ──── */}
      {createPortal(overlay, document.body)}
    </>
  );
}
