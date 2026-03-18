/**
 * HomePage
 * ---------
 * The main landing page — Netflix-style layout with a hero banner
 * at the top followed by horizontally scrollable genre rows.
 */
import HeroBanner from '../components/HeroBanner';
import MovieRow from '../components/MovieRow';
import { GENRE_ROWS } from '../services/placeholders';

export default function HomePage() {
  return (
    <main className="home-page">
      <HeroBanner />

      <div className="home-page__rows">
        {GENRE_ROWS.map((row) => (
          <MovieRow key={row.title} title={row.title} movies={row.movies} />
        ))}
      </div>
    </main>
  );
}
