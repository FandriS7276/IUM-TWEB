/**
 * MovieDetailPage
 * ----------------
 * Full movie detail view with:
 *  - Hero section: tomatometer + review counts (fetched via two lightweight parallel calls)
 *  - Review filter/sort bar: type, top-critic toggle, sort order, date range
 *  - Server-side paginated review list (GET /reviews with real pagination params)
 *  - Create-review form (requires auth; JWT injected by Axios interceptor)
 *  - Real-time Socket.IO chat room per movie
 *
 * Architecture decisions
 * ─────────────────────
 * 1. STATS vs DISPLAY are decoupled into two separate effect "domains":
 *    - Stats effect fires once per movie title using two limit=1 requests in
 *      parallel (review_type=Fresh and review_type=Rotten). The `totalDocs`
 *      from each response gives us the real counts without fetching all data.
 *      This means tomatometer is always the overall score, not just the score
 *      of the visible filtered page.
 *
 *    - Reviews effect fires on every page/sort/filter change using a proper
 *      paginated request. The response carries a `pagination` envelope from
 *      buildPaginatedResponse() which the shared <Pagination> component reads.
 *
 * 2. Every filter/sort change resets `page` to 1 — mandatory because the new
 *    filter set might have fewer total pages than the current offset.
 *
 * 3. AbortController is used on the reviews effect to cancel stale in-flight
 *    requests whenever the user changes filters rapidly or navigates away.
 *
 * 4. The per-page preference is stored in localStorage via `usePerPage` so it
 *    survives page reloads and is shared with every other paginated view.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import {
  ThumbsUp,
  ThumbsDown,
  Send,
  MessageCircle,
  Award,
} from '../components/Icons';
import { useAuth } from '../context/AuthContext';
import { useSocketChat } from '../hooks/useSocketChat';
import { usePerPage } from '../hooks/usePerPage';
import { reviewsAPI, moviesAPI, popularAPI } from '../services/api';
import Pagination from '../components/Pagination';
import './MovieDetailPage.css';

// ─── Sort options — values are the exact sortBy strings the backend accepts ──

/**
 * Each `value` is forwarded verbatim to the backend's `sortBy` query param.
 * The backend validates these against ALLOWED_SORT_FIELDS in sortParser.ts.
 */
const SORT_OPTIONS = [
  { value: 'review_date-desc',  label: 'Newest First'       },
  { value: 'review_date-asc',   label: 'Oldest First'       },
  { value: 'review_score-desc', label: 'Score (High → Low)' },
  { value: 'review_score-asc',  label: 'Score (Low → High)' },
  { value: 'review_type-asc',   label: 'Fresh First'        },
  { value: 'review_type-desc',  label: 'Rotten First'       },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function MovieDetailPage() {
  const { id }   = useParams();
  const { user } = useAuth();
  const { perPage, setPerPage } = usePerPage();
  const location = useLocation();

  // Track whether we've already scrolled to a review anchor after loading
  const hasScrolledToAnchor = useRef(false);

  // The decoded movie title derived from the URL param (stable across renders)
  const decodedTitle = decodeURIComponent(id);

  // ── Core display state ──────────────────────────────────────────────────

  const [movieTitle, setMovieTitle] = useState('');
  const [reviews,    setReviews]    = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');

  // ── Tomatometer stats — independent of current page / filters ──────────

  const [stats, setStats] = useState({
    tomatometer:  null,
    freshCount:   0,
    rottenCount:  0,
    totalReviews: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  // ── PostgreSQL movie data ────────────────────────────────────────────────
  // Rich movie details (poster, tagline, description, genres, cast, crew…)
  // fetched from the PostgreSQL backend independently of the MongoDB reviews.
  const [movieData,        setMovieData]        = useState(null);
  const [movieDataLoading, setMovieDataLoading] = useState(true);

  // ── Pagination + filter + sort state ────────────────────────────────────

  /** Current page number. Always reset to 1 when filters or sort changes. */
  const [page, setPage] = useState(1);

  /** Active sort order — must be one of the values in SORT_OPTIONS. */
  const [sortBy, setSortBy] = useState('review_date-desc');

  /**
   * Active review filters.
   * Empty string means "no filter" — the key is omitted from the request.
   *   review_type : '' | 'Fresh' | 'Rotten'
   *   top_critic  : '' | 'true'
   *   from_date   : '' | ISO date string
   *   to_date     : '' | ISO date string
   */
  const [filters, setFilters] = useState({
    review_type: '',
    top_critic:  '',
    from_date:   '',
    to_date:     '',
  });

  // ── Socket chat state ────────────────────────────────────────────────────

  const { messages, sendMessage } = useSocketChat(movieTitle);
  const [chatInput, setChatInput] = useState('');

  // ── Review form state ────────────────────────────────────────────────────

  const [reviewForm,      setReviewForm]      = useState({ type: 'Fresh', score: '', content: '' });
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [submitError,     setSubmitError]     = useState('');

  // ── Per-review expand/collapse for long content ──────────────────────────
  // Map of review _id → boolean (true = expanded, undefined/false = collapsed)
  const [expandedReviews, setExpandedReviews] = useState({});

  const toggleReviewExpand = useCallback((id) => {
    setExpandedReviews((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Effect 0 — Record a page view for popularity tracking (fires once per title)
  //
  // Fire-and-forget: errors are swallowed so a Redis hiccup never affects the
  // user experience. The 202 response from the server means the write was
  // accepted asynchronously, so we don't need to wait for confirmation.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!decodedTitle) return;
    popularAPI.recordView(decodedTitle).catch(() => {});
  }, [decodedTitle]);

  // ─────────────────────────────────────────────────────────────────────────
  // Effect 1 — Fetch overall tomatometer stats (fires once per movie title)
  //
  // Uses GET /reviews/stats which delegates to statsCache.getMovieStats().
  // That cache has a 24-hour TTL vs the 2-minute review cache, so warm hits
  // are much more common. On a cold cache it runs ONE MongoDB aggregation
  // instead of the previous two parallel limit=1 $facet queries.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!decodedTitle) return;

    setMovieTitle(decodedTitle);
    setStatsLoading(true);

    let cancelled = false;

    (async () => {
      try {
        const { data } = await reviewsAPI.getStats(decodedTitle);

        if (cancelled) return;

        const s = data.stats ?? {};
        setStats({
          tomatometer:  s.tomatometer  ?? null,
          freshCount:   s.freshCount   ?? 0,
          rottenCount:  s.rottenCount  ?? 0,
          totalReviews: s.totalReviews ?? 0,
        });
      } catch {
        // Stats are non-critical — the hero still renders without them
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [decodedTitle]);

  // ─────────────────────────────────────────────────────────────────────────
  // Effect 2 — Fetch full movie data from PostgreSQL (fires once per title)
  //
  // Returns poster, tagline, description, genres, runtime, rating, cast, crew.
  // Runs independently of the MongoDB reviews — a failed fetch here never
  // blocks the reviews panel from showing.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!decodedTitle) return;

    let cancelled = false;
    setMovieDataLoading(true);

    (async () => {
      try {
        const { data } = await moviesAPI.getByTitle(decodedTitle);
        if (!cancelled) setMovieData(data.movie ?? null);
      } catch {
        // Non-critical — hero still works without PostgreSQL data
        if (!cancelled) setMovieData(null);
      } finally {
        if (!cancelled) setMovieDataLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [decodedTitle]);

  // ─────────────────────────────────────────────────────────────────────────
  // Effect 3 — Fetch paginated reviews (fires on page / filter / sort change)
  //
  // AbortController ensures stale requests from rapid filter changes are
  // cancelled before they can overwrite fresher data.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!decodedTitle) return;

    const controller = new AbortController();

    const fetchReviews = async () => {
      setLoading(true);
      setError('');

      // Build the query params — only include non-empty filter values so the
      // backend treats missing keys as "no filter" (not "filter by empty string").
      const params = { movie_title: decodedTitle, page, limit: perPage, sortBy };
      if (filters.review_type) params.review_type = filters.review_type;
      if (filters.top_critic)  params.top_critic  = filters.top_critic;
      if (filters.from_date)   params.from_date   = filters.from_date;
      if (filters.to_date)     params.to_date     = filters.to_date;

      try {
        const { data } = await reviewsAPI.getAll(params, { signal: controller.signal });

        // Backend returns: { success, data: [...], pagination: { … }, metadata: { … } }
        setReviews(data.data ?? []);
        setPagination(data.pagination ?? null);
      } catch (err) {
        // Ignore cancellation — it just means another request superseded this one
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;

        setError(
          err.code === 'ERR_NETWORK'
            ? 'Unable to connect to the server.'
            : (err.response?.data?.message ?? 'Failed to load reviews.')
        );
      } finally {
        setLoading(false);
      }
    };

    fetchReviews();

    return () => controller.abort();
  }, [decodedTitle, page, perPage, sortBy, filters]);

  // ─────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleSendChat = (e) => {
    e.preventDefault();
    if (chatInput.trim()) {
      sendMessage(chatInput.trim(), user?.username || 'Anonymous');
      setChatInput('');
    }
  };

  /**
   * Update a single filter value and reset to page 1.
   * The page reset is MANDATORY — if the new filter produces fewer pages than
   * the current page, the backend would receive an out-of-bounds offset.
   */
  const updateFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  /** Update sort order and reset to page 1. */
  const updateSort = useCallback((value) => {
    setSortBy(value);
    setPage(1);
  }, []);

  /** Reset all filters and sort back to defaults. */
  const resetFilters = useCallback(() => {
    setFilters({ review_type: '', top_critic: '', from_date: '', to_date: '' });
    setSortBy('review_date-desc');
    setPage(1);
  }, []);

  /**
   * Update the per-page limit and reset to page 1.
   * Without the page reset, the current offset would exceed the new total
   * pages for smaller limit values.
   */
  const handlePerPageChange = useCallback((value) => {
    setPerPage(value);
    setPage(1);
  }, [setPerPage]);

  /**
   * Submit a new review and navigate back to page 1 on success.
   * The page-1 reset ensures the user immediately sees their review at the top
   * of the default (newest-first) sort order.
   */
  const handleReviewSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setSubmitError('');

      try {
        await reviewsAPI.create({
          movie_title:    movieTitle,
          review_type:    reviewForm.type,
          review_content: reviewForm.content,
          review_score:   reviewForm.score || undefined,
        });

        setReviewSubmitted(true);
        setTimeout(() => setReviewSubmitted(false), 3000);
        setReviewForm({ type: 'Fresh', score: '', content: '' });

        // Go back to page 1 (newest-first) so the new review is visible
        setPage(1);
      } catch (err) {
        setSubmitError(err.response?.data?.message || 'Failed to submit review.');
      }
    },
    [movieTitle, reviewForm]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Effect — Scroll to a specific review when the URL contains a hash like
  // #review-<_id>. Runs once after reviews finish loading.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading || hasScrolledToAnchor.current) return;
    const hash = location.hash;
    if (!hash || !hash.startsWith('#review-')) return;

    // Small delay to ensure the DOM has rendered the review elements
    const timer = setTimeout(() => {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Add a brief highlight effect
        el.classList.add('md-review--highlighted');
        setTimeout(() => el.classList.remove('md-review--highlighted'), 2000);
      }
      hasScrolledToAnchor.current = true;
    }, 100);

    return () => clearTimeout(timer);
  }, [loading, location.hash]);

  // Whether any non-default filter or sort is active (used to show "Clear" button)
  const hasActiveFilters =
    filters.review_type ||
    filters.top_critic  ||
    filters.from_date   ||
    filters.to_date     ||
    sortBy !== 'review_date-desc';

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <main className="movie-detail">
      {/* ── Hero section ──────────────────────────────────────────────────── */}
      <section className="md-hero">
        {/* Backdrop — real poster blurred behind, fallback gradient */}
        <div
          className="md-hero__backdrop"
          style={{
            backgroundImage: movieData?.poster
              ? `url(${movieData.poster})`
              : 'linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)',
          }}
        />
        <div className="md-hero__gradient" />

        <div className="md-hero__content">
          {/* Poster — real image from PostgreSQL or initial-letter placeholder */}
          <div className="md-hero__poster">
            {movieData?.poster ? (
              <img src={movieData.poster} alt={movieTitle} />
            ) : (
              <div className="md-hero__poster-placeholder">
                {movieTitle ? movieTitle[0] : '?'}
              </div>
            )}
          </div>

          {/* Info + stats */}
          <div className="md-hero__info">
            <h1 className="md-hero__title">{movieTitle || 'Loading…'}</h1>

            {/* Tagline */}
            {movieData?.tagline && (
              <p className="md-hero__tagline">{movieData.tagline}</p>
            )}

            {/* Year · Runtime · Rating · Genres */}
            {movieData && !movieDataLoading && (
              <div className="md-hero__meta">
                {movieData.year    && <span>{movieData.year}</span>}
                {movieData.runtime && <span>{movieData.runtime} min</span>}
                {movieData.rating  && (
                  <span>⭐ {Number(movieData.rating).toFixed(1)}</span>
                )}
                {movieData.genres?.map((g) => (
                  <span key={g} className="md-hero__genre-tag">{g}</span>
                ))}
              </div>
            )}

            {/* Plot description */}
            {movieData?.description && (
              <p className="md-hero__desc">{movieData.description}</p>
            )}

            {/* Tomatometer + review counts */}
            <div className="md-stats">
              {stats.tomatometer !== null && (
                <div className="md-stat">
                  <span
                    className="md-stat__value"
                    style={{ color: stats.tomatometer >= 60 ? 'var(--fresh)' : 'var(--rotten)' }}
                  >
                    {stats.tomatometer >= 60 ? '🍅' : '🤢'} {Math.round(stats.tomatometer)}%
                  </span>
                  <span className="md-stat__label">Tomatometer</span>
                </div>
              )}
              <div className="md-stat">
                <span className="md-stat__value">
                  <ThumbsUp size={16} /> {statsLoading ? '…' : stats.freshCount}
                </span>
                <span className="md-stat__label">Fresh</span>
              </div>
              <div className="md-stat">
                <span className="md-stat__value">
                  <ThumbsDown size={16} /> {statsLoading ? '…' : stats.rottenCount}
                </span>
                <span className="md-stat__label">Rotten</span>
              </div>
              <div className="md-stat">
                <span className="md-stat__value">
                  {statsLoading ? '…' : stats.totalReviews}
                </span>
                <span className="md-stat__label">Total Reviews</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Reviews section ───────────────────────────────────────────────── */}
      <section className="md-section container">
        <h2 className="md-section__title">
          <MessageCircle size={20} /> Reviews
        </h2>

        {/* Write a review (authenticated users only) */}
        {user ? (
          <form className="md-review-form" onSubmit={handleReviewSubmit}>
            <h3 className="md-review-form__heading">Write a Review</h3>

            {submitError && (
              <p style={{ color: '#e74c3c', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                {submitError}
              </p>
            )}

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
              placeholder="Share your thoughts… (5–2000 characters)"
              value={reviewForm.content}
              onChange={(e) => setReviewForm((f) => ({ ...f, content: e.target.value }))}
              required
              minLength={5}
              maxLength={2000}
              rows={4}
            />

            <button type="submit" className="md-review-form__submit">
              {reviewSubmitted ? '✓ Review submitted!' : 'Submit Review'}
            </button>
          </form>
        ) : (
          <p className="md-section__signin-prompt">
            <Link to="/signin">Sign in</Link> to write a review.
          </p>
        )}

        {/* ── Filter / Sort toolbar ──────────────────────────────────────── */}
        <div className="md-reviews-toolbar">
          <div className="md-reviews-toolbar__filters">

            {/* Review type filter */}
            <label className="md-filter">
              <span className="md-filter__label">Type</span>
              <select
                className={`md-filter__select${filters.review_type ? ' md-filter__select--active' : ''}`}
                value={filters.review_type}
                onChange={(e) => updateFilter('review_type', e.target.value)}
              >
                <option value="">All</option>
                <option value="Fresh">🍅 Fresh</option>
                <option value="Rotten">🤢 Rotten</option>
              </select>
            </label>

            {/* Top critic filter */}
            <label className="md-filter">
              <span className="md-filter__label">Critics</span>
              <select
                className={`md-filter__select${filters.top_critic ? ' md-filter__select--active' : ''}`}
                value={filters.top_critic}
                onChange={(e) => updateFilter('top_critic', e.target.value)}
              >
                <option value="">All Critics</option>
                <option value="true">Top Critics Only</option>
              </select>
            </label>

            {/* Sort order */}
            <label className="md-filter">
              <span className="md-filter__label">Sort By</span>
              <select
                className={`md-filter__select${sortBy !== 'review_date-desc' ? ' md-filter__select--active' : ''}`}
                value={sortBy}
                onChange={(e) => updateSort(e.target.value)}
              >
                {SORT_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            {/* Date range — from */}
            <label className="md-filter">
              <span className="md-filter__label">From</span>
              <input
                type="date"
                className={`md-filter__input${filters.from_date ? ' md-filter__input--active' : ''}`}
                value={filters.from_date}
                onChange={(e) => updateFilter('from_date', e.target.value)}
              />
            </label>

            {/* Date range — to */}
            <label className="md-filter">
              <span className="md-filter__label">To</span>
              <input
                type="date"
                className={`md-filter__input${filters.to_date ? ' md-filter__input--active' : ''}`}
                value={filters.to_date}
                onChange={(e) => updateFilter('to_date', e.target.value)}
              />
            </label>
          </div>

          {hasActiveFilters && (
            <button className="md-reviews-toolbar__reset" onClick={resetFilters}>
              Clear Filters
            </button>
          )}
        </div>

        {/* ── Loading / Error states ─────────────────────────────────────── */}
        {loading && (
          <p style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>
            Loading reviews…
          </p>
        )}
        {error && (
          <p style={{ textAlign: 'center', color: '#e74c3c', padding: '2rem' }}>
            {error}
          </p>
        )}

        {/* ── Reviews list ──────────────────────────────────────────────── */}
        {!loading && !error && (
          <div className="md-reviews-list">
            {reviews.map((r) => {
              const isFresh     = r.review_type === 'Fresh';
              const content     = r.review_content || '';
              const PREVIEW_LEN = 220;
              const isLong      = content.length > PREVIEW_LEN;
              const isExpanded  = !!expandedReviews[r._id];

              return (
                <div
                  key={r._id}
                  id={`review-${r._id}`}
                  className={`md-review ${isFresh ? 'md-review--fresh' : 'md-review--rotten'}`}
                >
                  {/* ── Poster thumbnail ─────────────────────────────── */}
                  <div className="md-review__poster">
                    {movieData?.poster ? (
                      <img src={movieData.poster} alt={movieTitle} draggable="false" />
                    ) : (
                      <div className="md-review__poster-fallback">
                        {(movieTitle || '?')[0].toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* ── Card body ─────────────────────────────────────── */}
                  <div className="md-review__body">

                    {/* Movie title + fresh/rotten badge */}
                    <div className="md-review__top">
                      <span className="md-review__movie-title">{movieTitle}</span>
                      <span className={`md-review__type-badge ${isFresh ? 'md-review__type-badge--fresh' : 'md-review__type-badge--rotten'}`}>
                        {isFresh ? '🍅 Fresh' : '🤢 Rotten'}
                      </span>
                    </div>

                    {/* Reviewer info row */}
                    <div className="md-review__meta">
                      <span className="md-review__critic">
                        {r.critic_name || 'Anonymous'}
                        {r.top_critic && <Award size={11} className="md-review__tc-badge" />}
                      </span>
                      {r.publisher_name && (
                        <span className="md-review__pub"> &middot; {r.publisher_name}</span>
                      )}
                      {r.review_date && (
                        <span className="md-review__pub">
                          {' '}&middot; {new Date(r.review_date).toLocaleDateString()}
                        </span>
                      )}
                      {r.review_score && (
                        <span className="md-review__score">{r.review_score}</span>
                      )}
                    </div>

                    {/* Review content — truncated when long */}
                    <p className="md-review__content">
                      {isLong && !isExpanded ? content.slice(0, PREVIEW_LEN) + '…' : content}
                    </p>

                    {isLong && (
                      <button
                        className="md-review__toggle"
                        onClick={() => toggleReviewExpand(r._id)}
                      >
                        {isExpanded ? 'Show less ▲' : 'Read more ▼'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {reviews.length === 0 && (
              <p className="md-section__empty">
                {hasActiveFilters
                  ? 'No reviews match the current filters.'
                  : 'No reviews yet. Be the first to review this movie!'}
              </p>
            )}
          </div>
        )}

        {/* ── Pagination ────────────────────────────────────────────────── */}
        <Pagination
          pagination={pagination}
          onPageChange={setPage}
          perPage={perPage}
          onPerPageChange={handlePerPageChange}
        />
      </section>

      {/* ── Movie Details (populated from PostgreSQL) ──────────────────────── */}
      {movieData && !movieDataLoading && (
        <>
          {/* ── Cast & Crew ─────────────────────────────────────────────── */}
          {(movieData.actors?.length > 0 || movieData.crew?.length > 0) && (
            <section className="md-section container">
              <h2 className="md-section__title">Cast &amp; Crew</h2>
              {movieData.actors?.length > 0 && (
                <>
                  <h3 className="md-sub-heading">Cast</h3>
                  <div className="md-cast-grid" style={{ marginBottom: 'var(--space-lg)' }}>
                    {movieData.actors.slice(0, 12).map((a, i) => (
                      <div key={i} className="md-cast-card">
                        <div className="md-cast-card__avatar">
                          {a.name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="md-cast-card__name">{a.name}</p>
                          <p className="md-cast-card__role">{a.role}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {movieData.crew?.length > 0 && (
                <>
                  <h3 className="md-sub-heading">Crew</h3>
                  <div className="md-cast-grid">
                    {movieData.crew.slice(0, 12).map((c, i) => (
                      <div key={i} className="md-cast-card">
                        <div className="md-cast-card__avatar">
                          {c.name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="md-cast-card__name">{c.name}</p>
                          <p className="md-cast-card__role">{c.role}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          {/* ── Movie Info (Themes, Countries, Studios, Languages) ──────── */}
          {(movieData.themes?.length > 0 ||
            movieData.countries?.length > 0 ||
            movieData.studios?.length > 0 ||
            movieData.languages?.length > 0) && (
            <section className="md-section container">
              <h2 className="md-section__title">Movie Info</h2>

              <div className="md-info-grid">
                {/* Themes */}
                {movieData.themes?.length > 0 && (
                  <div className="md-info-block">
                    <h3 className="md-sub-heading">Themes</h3>
                    <div className="md-tag-list">
                      {movieData.themes.map((t) => (
                        <span key={t} className="md-tag">{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Countries */}
                {movieData.countries?.length > 0 && (
                  <div className="md-info-block">
                    <h3 className="md-sub-heading">Countries</h3>
                    <div className="md-tag-list">
                      {movieData.countries.map((c) => (
                        <span key={c} className="md-tag">{c}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Studios */}
                {movieData.studios?.length > 0 && (
                  <div className="md-info-block">
                    <h3 className="md-sub-heading">Studios</h3>
                    <div className="md-tag-list">
                      {movieData.studios.map((s) => (
                        <span key={s} className="md-tag md-tag--studio">{s}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Languages */}
                {movieData.languages?.length > 0 && (
                  <div className="md-info-block">
                    <h3 className="md-sub-heading">Languages</h3>
                    <div className="md-lang-list">
                      {movieData.languages.map((l, i) => (
                        <div key={i} className="md-lang-item">
                          <span className="md-lang-item__name">{l.language}</span>
                          {l.type && (
                            <span className="md-lang-item__type">{l.type}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── Releases ───────────────────────────────────────────────── */}
          {movieData.releases?.length > 0 && (
            <section className="md-section container">
              <h2 className="md-section__title">Releases</h2>
              <div className="md-releases-table-wrapper">
                <table className="md-releases-table">
                  <thead>
                    <tr>
                      <th>Country</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movieData.releases.map((r, i) => (
                      <tr key={i}>
                        <td>{r.country || '—'}</td>
                        <td>{r.date ? new Date(r.date).toLocaleDateString() : '—'}</td>
                        <td>{r.type || '—'}</td>
                        <td>
                          {r.rating ? (
                            <span className="md-release-rating">{r.rating}</span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {/* ── Live Chat ─────────────────────────────────────────────────────── */}
      <section className="md-section container">
        <h2 className="md-section__title">
          <MessageCircle size={20} /> Live Chat
        </h2>

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
            <button
              type="submit"
              className="md-chat__send"
              disabled={!user || !chatInput.trim()}
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
