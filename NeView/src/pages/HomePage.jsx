/**
 * HomePage
 * ---------
 * The main landing page — Netflix-style layout with a hero banner
 * at the top followed by horizontally scrollable movie rows.
 *
 * Fetches real data from the backend's popular and reviews endpoints.
 * Each row corresponds to a different popularity timeframe.
 */
import { useState, useEffect } from 'react';
import HeroBanner from '../components/HeroBanner';
import MovieRow from '../components/MovieRow';
import { popularAPI, reviewsAPI, moviesAPI } from '../services/api';

export default function HomePage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    /**
     * Fetches movie data from multiple backend endpoints in parallel,
     * then enriches it with poster/description/genre data from PostgreSQL.
     *
     * Flow:
     *   1. Fire all popularity + review requests in parallel.
     *   2. Collect all unique movie titles across every row.
     *   3. Batch-fetch card data from PostgreSQL (poster, description, genres, rating).
     *   4. Merge the PostgreSQL data into each movie item.
     *   5. Set the enriched rows for rendering.
     *
     * Uses Promise.allSettled so a single failing endpoint doesn't
     * break the entire page — fulfilled results are shown, rejected
     * ones are silently skipped.
     */
    const fetchHomeData = async () => {
      try {
        const [trendingRes, todayRes, weekRes, yesterdayRes, reviewsRes] =
          await Promise.allSettled([
            popularAPI.trending({ limit: 20 }),
            popularAPI.today({ limit: 20 }),
            popularAPI.thisWeek({ limit: 20 }),
            popularAPI.yesterday({ limit: 20 }),
            reviewsAPI.getAll({ limit: 20, sortBy: 'review_date-desc' }),
          ]);

        const homeRows = [];

        // Helper: extract data array from a settled promise result
        const extract = (result) => {
          if (result.status === 'fulfilled') {
            const payload = result.value.data;
            return payload.data || payload.results || [];
          }
          return [];
        };

        /**
         * Normalises a popular-endpoint item (EnrichedMovie from MongoDB)
         * into a flat object that MovieCard can consume.
         *
         * Input shape:  { title: "Fight Club", stats: { tomatometer, freshCount, ... } }
         * Output shape: { name: "Fight Club", tomatometer: 86, ... }
         */
        const normalisePopular = (item) => ({
          name: item.title || item.name || item.movie_title || 'Untitled',
          tomatometer: item.stats?.tomatometer ?? null,
          freshCount: item.stats?.freshCount ?? 0,
          rottenCount: item.stats?.rottenCount ?? 0,
          totalReviews: item.stats?.totalReviews ?? 0,
        });

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
          homeRows.push({ title: 'Yesterday\'s Hits', movies: yesterday });
        }

        // Recent reviews — extract unique movie titles as a "Recently Reviewed" row
        const reviews = extract(reviewsRes);
        if (reviews.length > 0) {
          const seen = new Set();
          const recentMovies = reviews
            .filter((r) => {
              if (seen.has(r.movie_title)) return false;
              seen.add(r.movie_title);
              return true;
            })
            .map((r) => ({
              id: r._id,
              name: r.movie_title,
              description: r.review_content,
              review_type: r.review_type,
              critic_name: r.critic_name,
              publisher_name: r.publisher_name,
            }));

          homeRows.push({ title: 'Recently Reviewed', movies: recentMovies });
        }

        // ── Enrich with PostgreSQL slim data (poster + id ONLY) ──────
        // Tier 1: Only fetch what the static card needs — poster and id.
        // Genres, descriptions, and ratings are loaded lazily on hover
        // (Tier 2) by the MovieCard component itself.
        const allTitles = new Set();
        homeRows.forEach((row) =>
          row.movies.forEach((m) => {
            const t = m.name || m.movie_title;
            if (t) allTitles.add(t);
          })
        );

        if (allTitles.size > 0) {
          try {
            const { data } = await moviesAPI.getSlimBatch([...allTitles]);
            const pgMovies = data.movies || [];

            // Build a lookup by lowercase title for case-insensitive merging
            const pgMap = {};
            pgMovies.forEach((m) => {
              if (m.name) pgMap[m.name.toLowerCase()] = m;
            });

            // Merge only id + poster — everything else loads on hover
            homeRows.forEach((row) => {
              row.movies = row.movies.map((movie) => {
                const key = (movie.name || movie.movie_title || '').toLowerCase();
                const pg = pgMap[key];
                if (!pg) return movie;
                return {
                  ...movie,
                  id: pg.id,
                  poster: pg.poster,
                };
              });
            });
          } catch (pgErr) {
            // PostgreSQL enrichment is non-critical — cards still render
            // with title + tomatometer even if the slim batch call fails.
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
            Loading movies...
          </p>
        )}

        {error && (
          <p style={{ textAlign: 'center', color: '#e74c3c', padding: '2rem' }}>
            {error}
          </p>
        )}

        {rows.map((row) => (
          <MovieRow key={row.title} title={row.title} movies={row.movies} />
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
