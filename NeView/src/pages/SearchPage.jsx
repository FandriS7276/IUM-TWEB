/**
 * SearchPage
 * -----------
 * Displays search results in a grid. Reads the `q` and `genre`
 * query params and fetches matching movies from the backends.
 *
 * Search strategy:
 *  - When a query `q` is present  → GET /movies/search (PostgreSQL, returns
 *    rich data: poster, rating, year). Gives accurate title-match results.
 *  - When no query                → GET /reviews with pagination, deduplicated
 *    by movie_title (MongoDB, used for the Browse All view).
 *
 * Results are mapped to a MovieCard-compatible shape in both cases.
 */
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from '../components/Icons';
import MovieCard from '../components/MovieCard';
import { reviewsAPI, moviesAPI } from '../services/api';
import './SearchPage.css';


// TODO - selection based filters are white on white background. Fix and improve style
export default function SearchPage() {
  const [params] = useSearchParams();
  const query = params.get('q') || '';
  const genre = params.get('genre') || '';

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchResults = async () => {
      setLoading(true);
      setError('');

      try {
        if (query) {
          // ── Title search via PostgreSQL ────────────────────────────────
          // moviesAPI.search returns { count, results: [ { id, name, date, rating, poster } ] }
          // Map to MovieCard-compatible shape using the encoded title as the routing key.
          const { data } = await moviesAPI.search(query, 50);
          const movies = data.results || [];

          setResults(
            movies.map((m) => ({
              id:          encodeURIComponent(m.name),  // routing key → /movie/:title
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
          // ── Browse-all via MongoDB reviews ─────────────────────────────
          // Fetch a broad set of recent reviews and deduplicate by movie title
          // to show one card per film with the review snippet as the description.
          const { data } = await reviewsAPI.getAll({ limit: 200, sortBy: 'review_date-desc' });
          const reviews = data.data || data.results || [];

          const seen = new Map();
          reviews.forEach((r) => {
            if (!r.movie_title || seen.has(r.movie_title)) return;
            seen.set(r.movie_title, {
              id:             encodeURIComponent(r.movie_title),
              name:           r.movie_title,
              description:    r.review_content || '',
              review_type:    r.review_type,
              critic_name:    r.critic_name,
              publisher_name: r.publisher_name,
              poster:         '',
              genres:         [],
              rating:         0,
              tomatometer:    null,
              likes:          0,
            });
          });

          setResults([...seen.values()]);
        }
      } catch (err) {
        console.error('Search failed:', err);
        setError(
          err.code === 'ERR_NETWORK'
            ? 'Unable to connect to the server.'
            : 'Failed to load search results.'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [query, genre]);

  const heading = genre
    ? genre
    : query
      ? `Results for "${query}"`
      : 'Browse All';

  return (
    <main className="search-page">
      <div className="container">
        <div className="search-page__header">
          <Search size={24} />
          <h1 className="search-page__title">{heading}</h1>
          <span className="search-page__count">
            {loading ? '…' : `${results.length} title${results.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        {loading && (
          <p style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>Searching…</p>
        )}

        {error && (
          <p style={{ textAlign: 'center', color: '#e74c3c', padding: '2rem' }}>{error}</p>
        )}

        {!loading && !error && results.length > 0 && (
          <div className="search-page__grid">
            {results.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </div>
        )}

        {!loading && !error && results.length === 0 && (
          <p className="search-page__empty">No movies found. Try a different search term.</p>
        )}
      </div>
    </main>
  );
}
