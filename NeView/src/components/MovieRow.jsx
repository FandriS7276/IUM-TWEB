/**
 * MovieRow Component
 * -------------------
 * Horizontal scrollable row of MovieCards, exactly like Netflix genre rows.
 * Includes left/right arrow buttons that scroll by a full viewport-width
 * of cards. The arrows only appear on hover.
 */
import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from './Icons';
import MovieCard from './MovieCard';
import './MovieRow.css';

const SCROLL_AMOUNT = 800; // pixels per arrow click

export default function MovieRow({ title, movies = [] }) {
  const rowRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Update arrow visibility after each scroll
  const updateArrows = () => {
    const el = rowRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  };

  const scroll = (direction) => {
    const el = rowRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * SCROLL_AMOUNT, behavior: 'smooth' });
    // Delayed check so the smooth scroll has time to settle
    setTimeout(updateArrows, 400);
  };

  return (
    <section className="movie-row">
      <h2 className="movie-row__title">{title}</h2>

      <div className="movie-row__wrapper">
        {/* Left arrow */}
        {canScrollLeft && (
          <button
            className="movie-row__arrow movie-row__arrow--left"
            onClick={() => scroll(-1)}
            aria-label="Scroll left"
          >
            <ChevronLeft size={36} />
          </button>
        )}

        {/* Scrollable track */}
        <div className="movie-row__track" ref={rowRef} onScroll={updateArrows}>
          {movies.map((movie) => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </div>

        {/* Right arrow */}
        {canScrollRight && (
          <button
            className="movie-row__arrow movie-row__arrow--right"
            onClick={() => scroll(1)}
            aria-label="Scroll right"
          >
            <ChevronRight size={36} />
          </button>
        )}
      </div>
    </section>
  );
}
