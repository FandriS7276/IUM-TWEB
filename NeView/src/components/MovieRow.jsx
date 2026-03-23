/**
 * MovieRow Component
 * -------------------
 * Horizontal scrollable row of MovieCards, Netflix genre-row style.
 *
 * Lazy loading:
 *  - Uses IntersectionObserver to defer rendering cards until the row
 *    scrolls into (or near) the viewport. The rootMargin of 200px
 *    means cards start loading ~200px before they become visible,
 *    so the user never sees a blank row.
 *
 * Scrolling methods supported:
 *  1. Arrow buttons (click)
 *  2. Mouse drag (click-drag horizontally) — free-flowing, no snap
 *  3. Scroll wheel (vertical deltaY → horizontal scrollLeft)
 *  4. Touch/swipe (native touch scrolling via CSS overflow-x)
 *
 * No scroll-snap is applied — the carousel scrolls freely without
 * magnetizing to card boundaries, keeping the experience smooth.
 */
import { useRef, useState, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from './Icons';
import MovieCard from './MovieCard';
import './MovieRow.css';

const SCROLL_AMOUNT = 800;

export default function MovieRow({ title, movies = [] }) {
  const rowRef = useRef(null);
  const sectionRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // ── Lazy loading: only render cards when row is near viewport ──
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    // IntersectionObserver fires when the row enters the viewport
    // (or within 200px of it). Once visible, we never go back to
    // invisible — the cards stay rendered even if scrolled away.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect(); // one-shot — never re-observe
        }
      },
      {
        // Start loading 200px before the row actually enters the viewport.
        // This gives images a head start so users see posters, not blanks.
        rootMargin: '200px',
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Drag-to-scroll state ──────────────────────────────────────
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragScrollLeft = useRef(0);

  /** Recalculate whether arrows should be visible */
  const updateArrows = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  }, []);

  // Check arrows on mount and when movies change
  useEffect(() => {
    if (isVisible) updateArrows();
  }, [movies, updateArrows, isVisible]);

  /** Arrow-button scroll */
  const scroll = (direction) => {
    const el = rowRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * SCROLL_AMOUNT, behavior: 'smooth' });
    setTimeout(updateArrows, 400);
  };

  // ── Mouse drag handlers ───────────────────────────────────────
  const handleMouseDown = useCallback((e) => {
    const el = rowRef.current;
    if (!el) return;
    isDragging.current = true;
    dragStartX.current = e.pageX - el.offsetLeft;
    dragScrollLeft.current = el.scrollLeft;
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging.current) return;
    e.preventDefault();
    const el = rowRef.current;
    if (!el) return;
    const x = e.pageX - el.offsetLeft;
    const walk = (x - dragStartX.current) * 1.5;
    el.scrollLeft = dragScrollLeft.current - walk;
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    updateArrows();
  }, [updateArrows]);

  // ── Wheel → horizontal scroll conversion ─────────────────────
  const handleWheel = useCallback((e) => {
    const el = rowRef.current;
    if (!el) return;

    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
      updateArrows();
    }
  }, [updateArrows]);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  return (
    <section className="movie-row" ref={sectionRef}>
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

        {/* Scrollable track with drag support */}
        <div
          className="movie-row__track"
          ref={rowRef}
          onScroll={updateArrows}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {isVisible
            ? movies.map((movie, index) => (
                <MovieCard key={movie._id || movie.id || index} movie={movie} />
              ))
            : /* Placeholder slots preserve layout height while invisible */
              movies.map((_, index) => (
                <div
                  key={index}
                  className="movie-card"
                  style={{ visibility: 'hidden' }}
                />
              ))
          }
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
