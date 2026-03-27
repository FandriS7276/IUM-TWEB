/**
 * ReviewCard Component
 * --------------------
 * Compact card for the homepage "Recently Reviewed" row.
 * Displays: reviewer name, fresh/rotten badge, truncated review body.
 *
 * Interactions:
 *  - Hover: shows a tooltip with the full review text
 *  - Click: navigates to /movie/:title#review-<_id> which scrolls to
 *           the specific review in the MovieDetailPage reviews section.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import './ReviewCard.css';

/** Delay before the tooltip appears (ms) */
const HOVER_DELAY = 400;

/** Grace period before closing after mouse leaves (ms) */
const LEAVE_GRACE = 100;

export default function ReviewCard({ review }) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState(null);
  const hoverTimeout = useRef(null);
  const leaveTimeout = useRef(null);
  const cardRef = useRef(null);
  const navigate = useNavigate();

  // Refs for scroll dismissal
  const tooltipVisibleRef = useRef(false);
  useEffect(() => { tooltipVisibleRef.current = tooltipVisible; }, [tooltipVisible]);

  // Dismiss tooltip on scroll
  const dismissTooltip = useCallback(() => {
    clearTimeout(hoverTimeout.current);
    clearTimeout(leaveTimeout.current);
    if (tooltipVisibleRef.current) {
      setTooltipVisible(false);
      setTooltipStyle(null);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', dismissTooltip, true);
    window.addEventListener('wheel', dismissTooltip, true);
    return () => {
      window.removeEventListener('scroll', dismissTooltip, true);
      window.removeEventListener('wheel', dismissTooltip, true);
    };
  }, [dismissTooltip]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeout(hoverTimeout.current);
      clearTimeout(leaveTimeout.current);
    };
  }, []);

  const showTooltip = useCallback(() => {
    clearTimeout(leaveTimeout.current);
    if (tooltipVisible) return;

    hoverTimeout.current = setTimeout(() => {
      if (!cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Position above the card if enough space, otherwise below
      let top = rect.top - 8;
      let left = rect.left + rect.width / 2 - 170; // center the 340px tooltip

      // Clamp horizontal
      if (left < 8) left = 8;
      if (left + 340 > vw - 8) left = vw - 8 - 340;

      // If not enough space above, show below
      if (top < 220) {
        top = rect.bottom + 8;
      } else {
        // Position above — estimate tooltip height and shift up
        top = rect.top - 180;
        if (top < 8) top = 8;
      }

      setTooltipStyle({
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        zIndex: 10000,
      });
      setTooltipVisible(true);
    }, HOVER_DELAY);
  }, [tooltipVisible]);

  const scheduleClose = useCallback(() => {
    clearTimeout(hoverTimeout.current);
    leaveTimeout.current = setTimeout(() => {
      setTooltipVisible(false);
      setTooltipStyle(null);
    }, LEAVE_GRACE);
  }, []);

  // Navigate to movie page with review anchor
  const handleClick = useCallback(() => {
    const movieTitle = encodeURIComponent(review.movie_title || '');
    navigate(`/movie/${movieTitle}#review-${review._id}`);
  }, [navigate, review.movie_title, review._id]);

  const isFresh = review.review_type === 'Fresh';

  // Tooltip portal
  const tooltip = tooltipVisible && tooltipStyle ? createPortal(
    <div className="review-card__tooltip" style={tooltipStyle}>
      <div className="review-card__tooltip-title">{review.movie_title}</div>
      <div className="review-card__tooltip-critic">
        {review.critic_name || 'Anonymous'} &middot; {isFresh ? '🍅 Fresh' : '🤢 Rotten'}
      </div>
      <div className="review-card__tooltip-body">
        {review.review_content || 'No review text available.'}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <div
        ref={cardRef}
        className={`review-card ${isFresh ? 'review-card--fresh' : 'review-card--rotten'}`}
        onMouseEnter={showTooltip}
        onMouseLeave={scheduleClose}
        onClick={handleClick}
      >
        {/* Header: movie title + fresh/rotten badge */}
        <div className="review-card__header">
          <span className="review-card__movie-title">{review.movie_title}</span>
          <span className={`review-card__badge ${isFresh ? 'review-card__badge--fresh' : 'review-card__badge--rotten'}`}>
            {isFresh ? '🍅 Fresh' : '🤢 Rotten'}
          </span>
        </div>

        {/* Reviewer name */}
        <div className="review-card__critic">
          by <span className="review-card__critic-name">{review.critic_name || 'Anonymous'}</span>
        </div>

        {/* Review body (truncated via CSS line-clamp) */}
        <p className="review-card__content">
          {review.review_content || 'No review text available.'}
        </p>
      </div>

      {tooltip}
    </>
  );
}
