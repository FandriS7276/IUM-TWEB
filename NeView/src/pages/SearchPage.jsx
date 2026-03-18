/**
 * SearchPage
 * -----------
 * Displays search results in a grid. Reads the `q` and `genre`
 * query params. Uses placeholder data until the backend is live.
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from '../components/Icons';
import MovieCard from '../components/MovieCard';
import { GENRE_ROWS, FEATURED_MOVIES } from '../services/placeholders';
import './SearchPage.css';

const ALL_MOVIES = [
  ...FEATURED_MOVIES,
  ...GENRE_ROWS.flatMap((r) => r.movies),
];

// De-duplicate by id
const UNIQUE = [...new Map(ALL_MOVIES.map((m) => [m.id, m])).values()];

export default function SearchPage() {
  const [params] = useSearchParams();
  const query = params.get('q') || '';
  const genre = params.get('genre') || '';

  const results = useMemo(() => {
    let pool = UNIQUE;

    if (genre) {
      pool = pool.filter((m) =>
        m.genres.some((g) => g.toLowerCase().includes(genre.toLowerCase()))
      );
    }

    if (query) {
      const q = query.toLowerCase();
      pool = pool.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.genres.some((g) => g.toLowerCase().includes(q))
      );
    }

    return pool;
  }, [query, genre]);

  const heading = genre ? genre : query ? `Results for "${query}"` : 'Browse All';

  return (
    <main className="search-page">
      <div className="container">
        <div className="search-page__header">
          <Search size={24} />
          <h1 className="search-page__title">{heading}</h1>
          <span className="search-page__count">{results.length} title{results.length !== 1 ? 's' : ''}</span>
        </div>

        {results.length > 0 ? (
          <div className="search-page__grid">
            {results.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </div>
        ) : (
          <p className="search-page__empty">
            No movies found. Try a different search or check back once the database is connected.
          </p>
        )}
      </div>
    </main>
  );
}
