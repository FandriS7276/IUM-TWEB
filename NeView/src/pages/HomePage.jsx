/**
 * HomePage
 * ---------
 * Netflix-style landing page with:
 *  - HeroBanner: full-viewport carousel of trending movies (auto-rotating)
 *  - Popularity rows: Trending Now, Popular Today, This Week, Yesterday's Hits
 *  - Recently Reviewed Movies: movies that recently got reviews (MovieCards)
 *  - Recently Reviewed (individual reviews): latest reviews as ReviewCards
 *  - Genre carousels: one row per main genre, Netflix style
 *
 * Data loading strategy:
 *  1. Fire all popularity + review + genre requests in parallel.
 *  2. Collect unique movie titles from popularity + genre rows.
 *  3. Batch-fetch poster+id (slim) from PostgreSQL for those titles.
 *  4. Merge, render. ReviewCard rows skip the PG enrichment step entirely.
 *
 * Promise.allSettled ensures a single failing endpoint never kills the page.
 */
import { useState, useEffect } from 'react';
import HeroBanner from '../components/HeroBanner';
import MovieRow from '../components/MovieRow';
import { popularAPI, reviewsAPI, moviesAPI } from '../services/api';

/** Main genres to render as carousels. Order = display order. */
const GENRES = ['Action', 'Drama', 'Comedy', 'Thriller', 'Romance', 'Horror', 'Animation', 'Crime'];

export default function HomePage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchHomeData = async () => {
      try {
        // ── Fire all requests in parallel ─────────────────────────────────
        const [
          trendingRes,
          todayRes,
          weekRes,
          yesterdayRes,
          recentMoviesRes,   // unique movie titles recently reviewed → MovieCards
          recentReviewsRes,  // individual reviews → ReviewCards
          ...genreResults    // one result per GENRES entry
        ] = await Promise.allSettled([
          popularAPI.trending({ limit: 20 }),
          popularAPI.today({ limit: 20 }),
          popularAPI.thisWeek({ limit: 20 }),
          popularAPI.yesterday({ limit: 20 }),
          // Recently reviewed movies (unique titles only, cheap)
          reviewsAPI.getRecentMovies({ limit: 20 }),
          // Individual recent reviews (with content, for ReviewCards)
          reviewsAPI.getRecent({ limit: 20 }),
          // Genre rows — all fire in parallel
          ...GENRES.map((g) => moviesAPI.getByGenre(g, 20)),
        ]);

        // ── Helper: safely extract data array ─────────────────────────────
        const extract = (result) => {
          if (result.status === 'fulfilled') {
            const payload = result.value.data;
            return payload.data || payload.results || payload.movies || [];
          }
          return [];
        };

        // ── Normalise a popularity item into a flat MovieCard shape ────────
        const normalisePopular = (item) => ({
          name: item.title || item.name || item.movie_title || 'Untitled',
          tomatometer: item.stats?.tomatometer ?? null,
          freshCount:  item.stats?.freshCount ?? 0,
          rottenCount: item.stats?.rottenCount ?? 0,
          totalReviews: item.stats?.totalReviews ?? 0,
        });

        const homeRows = [];

        // ── Popularity rows ───────────────────────────────────────────────
        const trending = extract(trendingRes).map(normalisePopular);
        if (trending.length > 0) {
          homeRows.push({ title: 'Trending Now', movies: trending });
        }

        const today = extract(todayRes).map(normalisePopular);
        if (today.length > 0) {
          homeRows.push({ title: 'Popular Today', movies: today });
        }

        const week = extract(weekRes).map(normalisePopular);
        if (week.length > 0) {
          homeRows.push({ title: 'Popular This Week', movies: week });
        }

        const yesterday = extract(yesterdayRes).map(normalisePopular);
        if (yesterday.length > 0) {
          homeRows.push({ title: "Yesterday's Hits", movies: yesterday });
        }

        // ── Recently Reviewed Movies carousel (MovieCards) ────────────────
        // getRecentMovies returns unique movie titles sorted by most recent review.
        // We map to { name } shapes so the slim batch enrichment picks them up.
        const recentMovieItems = extract(recentMoviesRes);
        if (recentMovieItems.length > 0) {
          homeRows.push({
            title: 'Recently Reviewed',
            movies: recentMovieItems.map((item) => ({ name: item.movie_title })),
          });
        }

        // ── Genre carousels (MovieCards, sorted by rating) ────────────────
        // getByGenre returns slim data { id, name, poster, likes } already
        // enriched by PostgreSQL, so no second batch step needed.
        GENRES.forEach((genre, i) => {
          const genreMovies = extract(genreResults[i]);
          if (genreMovies.length > 0) {
            homeRows.push({
              title: genre,
              // Already has id + poster from getByGenre — skip PG enrichment
              movies: genreMovies.map((m) => ({
                id:     m.id,
                name:   m.name,
                poster: m.poster,
                likes:  m.likes ?? 0,
              })),
              alreadyEnriched: true, // flag to skip the slim batch step
            });
          }
        });

        // ── Recently Reviewed individual reviews (ReviewCards) ────────────
        const recentReviews = extract(recentReviewsRes);
        if (recentReviews.length > 0) {
          homeRows.push({
            title: 'Latest Reviews',
            movies: recentReviews,
            variant: 'review', // renders ReviewCard instead of MovieCard
          });
        }

        // ── Batch-enrich with PostgreSQL slim data (poster + id) ──────────
        // Only needed for rows that aren't already enriched (popularity rows
        // and Recently Reviewed Movies). Genre rows and review rows skip this.
        const titlesToEnrich = new Set();
        homeRows.forEach((row) => {
          if (row.variant === 'review') return;
          if (row.alreadyEnriched) return;
          row.movies.forEach((m) => {
            const t = m.name || m.movie_title;
            if (t) titlesToEnrich.add(t);
          });
        });

        if (titlesToEnrich.size > 0) {
          try {
            const { data } = await moviesAPI.getSlimBatch([...titlesToEnrich]);
            const pgMovies = data.movies || [];

            const pgMap = {};
            pgMovies.forEach((m) => {
              if (m.name) pgMap[m.name.toLowerCase()] = m;
            });

            homeRows.forEach((row) => {
              if (row.variant === 'review') return;
              if (row.alreadyEnriched) return;
              row.movies = row.movies.map((movie) => {
                const key = (movie.name || movie.movie_title || '').toLowerCase();
                const pg = pgMap[key];
                if (!pg) return movie;
                return { ...movie, id: pg.id, poster: pg.poster };
              });
            });
          } catch (pgErr) {
            console.warn('PostgreSQL slim batch enrichment failed:', pgErr);
          }
        }

        setRows(homeRows);
      } catch (err) {
        console.error('Failed to load home page data:', err);
        setError('Unable to load content. Please check if the backend is running.');
      } finally {
        setLoading(false);
      }
    };

    fetchHomeData();
  }, []);

  return (
    <main className="home-page">
      <HeroBanner />

      <div className="home-page__rows">
        {loading && (
          <p style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>
            Loading movies…
          </p>
        )}

        {error && (
          <p style={{ textAlign: 'center', color: '#e74c3c', padding: '2rem' }}>
            {error}
          </p>
        )}

        {rows.map((row) => (
          <MovieRow
            key={row.title}
            title={row.title}
            movies={row.movies}
            variant={row.variant}
          />
        ))}

        {!loading && !error && rows.length === 0 && (
          <p style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>
            No movies available yet. The database may be empty.
          </p>
        )}
      </div>
    </main>
  );
}
