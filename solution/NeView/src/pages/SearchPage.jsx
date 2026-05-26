/**
 * SearchPage
 * -----------
 * Displays search results in a grid. Reads the `q` and `genre`
 * query params and fetches matching movies from the backends.
 *
 * Search strategy:
 *  - When a query `q` is present  → GET /movies/search (PostgreSQL, returns
 *    rich data: poster, rating, year). Gives accurate title-match results.
 *    Renders MovieCards.
 *  - When no query (Browse All)   → GET /reviews/recent (MongoDB), shows the
 *    most recent individual reviews as ReviewCards — not grouped by movie.
 *    Each card shows the movie title + reviewer, links to that specific review.
 */
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from '../components/Icons';
import MovieCard from '../components/MovieCard';
import ReviewCard from '../components/ReviewCard';
import { reviewsAPI, moviesAPI } from '../services/api';
import './SearchPage.css';

export default function SearchPage() {
  const [params] = useSearchParams();
  const query = params.get('q') || '';
  const genre = params.get('genre') || '';

  // Movie results (title search mode)
  const [movieResults, setMovieResults] = useState([]);
  // Review results (Browse All mode)
  const [reviewResults, setReviewResults] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /** true when we're in Browse All mode (no search query) */
  const isBrowseAll = !query && !genre;

  useEffect(() => {
    const controller = new AbortController();

    const fetchResults = async () => {
      setLoading(true);
      setError('');
      setMovieResults([]);
      setReviewResults([]);

      try {
        if (query) {
          // ── Title search via PostgreSQL ────────────────────────────────
          // moviesAPI.search returns { count, results: [ { id, name, date, rating, poster } ] }
          const { data } = await moviesAPI.search(query, 50);
          const movies = data.results || [];

          setMovieResults(
            movies.map((m) => ({
              id:          encodeURIComponent(m.name),
              name:        m.name,
              description: '',
              poster:      m.poster || '',
              genres:      [],
              rating:      m.rating ?? 0,
              tomatometer: null,
              likes:       0,
            }))
          );
        } else {
          // ── Browse All — individual reviews ────────────────────────────
          // Fetch a broad set of recent reviews as individual ReviewCards.
          // Each card is a single review (movie title + reviewer), NOT grouped.
          const { data } = await reviewsAPI.getAll(
            { limit: 100, sortBy: 'review_date-desc' },
            { signal: controller.signal }
          );
          const reviews = data.data || data.results || [];
          setReviewResults(reviews);
        }
      } catch (err) {
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        console.error('Search failed:', err);
        setError(
          err.code === 'ERR_NETWORK'
            ? 'Unable to connect to the server.'
            : 'Failed to load results.'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
    return () => controller.abort();
  }, [query, genre]);

  const heading = genre
    ? genre
    : query
      ? `Results for "${query}"`
      : 'Browse All Reviews';

  const totalCount = query ? movieResults.length : reviewResults.length;

  return (
    <main className="search-page">
      <div className="container">
        <div className="search-page__header">
          <Search size={24} />
          <h1 className="search-page__title">{heading}</h1>
          <span className="search-page__count">
            {loading ? '…' : `${totalCount} ${query ? 'title' : 'review'}${totalCount !== 1 ? 's' : ''}`}
          </span>
        </div>

        {loading && (
          <p style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>
            {query ? 'Searching…' : 'Loading reviews…'}
          </p>
        )}

        {error && (
          <p style={{ textAlign: 'center', color: '#e74c3c', padding: '2rem' }}>{error}</p>
        )}

        {/* ── Movie search results (title query mode) ──────────────── */}
        {!loading && !error && query && movieResults.length > 0 && (
          <div className="search-page__grid">
            {movieResults.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </div>
        )}

        {/* ── Individual review cards (Browse All mode) ─────────────── */}
        {!loading && !error && !query && reviewResults.length > 0 && (
          <div className="search-page__review-grid">
            {reviewResults.map((review) => (
              <ReviewCard key={review._id} review={review} />
            ))}
          </div>
        )}

        {!loading && !error && totalCount === 0 && (
          <p className="search-page__empty">
            {query
              ? 'No movies found. Try a different search term.'
              : 'No reviews found.'}
          </p>
        )}
      </div>
    </main>
  );
}
