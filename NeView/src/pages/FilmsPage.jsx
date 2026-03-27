/**
 * FilmsPage
 * ----------
 * Displays the full catalogue of films from the PostgreSQL backend.
 * Supports sorting only — no genre or rating filters.
 *
 * Sort options:
 *   Title A–Z / Z–A  → sortBy=name, order=asc|desc
 *   Year Newest/Oldest → sortBy=year, order=desc|asc
 *
 * Data flow:
 *   moviesAPI.getAll({ page, size, sortBy, order }) → paginated grid of MovieCards
 */
import { useState, useEffect, useRef } from 'react';
import { Film } from '../components/Icons';
import MovieCard from '../components/MovieCard';
import Pagination from '../components/Pagination';
import { moviesAPI } from '../services/api';
import { usePerPage } from '../hooks/usePerPage';
import './FilmsPage.css';

const SORT_OPTIONS = [
  { value: 'name-asc',  label: 'Title (A–Z)'     },
  { value: 'name-desc', label: 'Title (Z–A)'     },
  { value: 'year-desc', label: 'Year (Newest)'   },
  { value: 'year-asc',  label: 'Year (Oldest)'   },
];

export default function FilmsPage() {
  const [sortBy, setSortBy]       = useState('name-asc');
  const [page, setPage]           = useState(1);
  const [perPage, setPerPage]     = usePerPage();
  const [movies, setMovies]       = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const abortRef                  = useRef(null);

  useEffect(() => {
    const [sortField, order] = sortBy.split('-');

    // Cancel any in-flight request for stale params
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const fetchFilms = async () => {
      setLoading(true);
      setError('');

      try {
        const { data } = await moviesAPI.getAll({
          page,
          size:   perPage,
          sortBy: sortField,
          order,
        });

        // Normalise the response to a MovieCard-compatible shape
        const raw = data.movies || data.results || data.content || [];
        const mapped = raw.map((m) => ({
          id:          m.id,
          name:        m.name || m.title || '',
          poster:      m.poster || '',
          rating:      m.rating ?? 0,
          likes:       m.likes  ?? 0,
          genres:      m.genres ?? [],
          description: m.description || '',
          tomatometer: null,
        }));

        setMovies(mapped);

        // Build a pagination object compatible with the Pagination component
        if (data.pagination) {
          setPagination(data.pagination);
        } else {
          const total      = data.count ?? data.total ?? data.totalElements ?? mapped.length;
          const totalPages = Math.max(1, Math.ceil(total / perPage));
          setPagination({
            currentPage: page,
            totalPages,
            totalDocs:   total,
            hasPrev:     page > 1,
            hasNext:     page < totalPages,
          });
        }
      } catch (err) {
        // Ignore aborted requests (user changed sort/page quickly)
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        setError(
          err.code === 'ERR_NETWORK'
            ? 'Unable to connect to the server.'
            : 'Failed to load films.'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchFilms();
    return () => controller.abort();
  }, [sortBy, page, perPage]);

  const handleSortChange = (value) => {
    setSortBy(value);
    setPage(1); // Reset to first page whenever sort changes
  };

  const handlePerPageChange = (value) => {
    setPerPage(value);
    setPage(1);
  };

  return (
    <main className="films-page">
      <div className="container">

        {/* ── Header ───────────────────────────────────────────── */}
        <div className="films-page__header">
          <Film size={24} />
          <h1 className="films-page__title">Films</h1>

          {/* Sort control — the only toolbar action on this page */}
          <label className="films-page__sort-label">
            Sort by
            <select
              className="films-page__sort-select"
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value)}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
        </div>

        {/* ── States ───────────────────────────────────────────── */}
        {loading && (
          <p className="films-page__status">Loading films…</p>
        )}

        {error && (
          <p className="films-page__status films-page__status--error">{error}</p>
        )}

        {/* ── Results grid ─────────────────────────────────────── */}
        {!loading && !error && movies.length > 0 && (
          <>
            <div className="films-page__grid">
              {movies.map((movie) => (
                <MovieCard key={movie.id ?? movie.name} movie={movie} />
              ))}
            </div>

            <Pagination
              pagination={pagination}
              onPageChange={setPage}
              perPage={perPage}
              onPerPageChange={handlePerPageChange}
            />
          </>
        )}

        {!loading && !error && movies.length === 0 && (
          <p className="films-page__status">No films found.</p>
        )}

      </div>
    </main>
  );
}
