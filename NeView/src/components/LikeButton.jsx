import { useState, useEffect, useRef, useCallback } from "react";

const COOLDOWN_MS = 4800; // 4.8s — slightly under backend's 5s to avoid race

/**
 * LikeButton Component
 *
 * Features:
 * - Optimistic UI: count updates instantly on click
 * - Frontend cooldown: button disables for ~5 seconds after toggle
 * - Rollback on error: reverts if backend returns 429 or 500
 * - Visual feedback: countdown timer + disabled state
 *
 * Props:
 *   movieId    — PostgreSQL movie ID
 *   initialLiked — boolean, from GET /api/movies/:movieId/like-status
 *   initialCount — number, from the movie's likes_count field
 */
export default function LikeButton({ movieId, initialLiked = false, initialCount = 0 }) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [cooldown, setCooldown] = useState(0); // Seconds remaining
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);

  // Sync props when parent re-fetches
  useEffect(() => {
    setLiked(initialLiked);
    setCount(initialCount);
  }, [initialLiked, initialCount]);

  // Countdown timer logic
  useEffect(() => {
    if (cooldown <= 0) {
      clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [cooldown]);

  const handleToggleLike = useCallback(async () => {
    if (cooldown > 0 || loading) return;

    // Optimistic update
    const prevLiked = liked;
    const prevCount = count;
    setLiked(!liked);
    setCount(liked ? count - 1 : count + 1);
    setLoading(true);

    // Start cooldown immediately (frontend lock)
    setCooldown(Math.ceil(COOLDOWN_MS / 1000));

    try {
      const res = await fetch(`/api/movies/${movieId}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Send auth cookies
      });

      if (res.status === 429) {
        // Rate limited — rollback optimistic update
        setLiked(prevLiked);
        setCount(prevCount);

        const data = await res.json();
        // Set cooldown to whatever the server says
        setCooldown(data.retryAfter || Math.ceil(COOLDOWN_MS / 1000));
        return;
      }

      if (!res.ok) {
        // Server error — rollback
        setLiked(prevLiked);
        setCount(prevCount);
        setCooldown(0); // Allow immediate retry on server errors
        console.error("Like toggle failed:", res.status);
        return;
      }

      // Success — optimistic update was correct, nothing to do
      // The count from PostgreSQL will sync on next page load
    } catch (err) {
      // Network error — rollback
      setLiked(prevLiked);
      setCount(prevCount);
      setCooldown(0);
      console.error("Like toggle network error:", err);
    } finally {
      setLoading(false);
    }
  }, [movieId, liked, count, cooldown, loading]);

  const isDisabled = cooldown > 0 || loading;

  return (
    <button
      onClick={handleToggleLike}
      disabled={isDisabled}
      aria-label={liked ? "Unlike this movie" : "Like this movie"}
      aria-pressed={liked}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 16px",
        border: "none",
        borderRadius: "8px",
        cursor: isDisabled ? "not-allowed" : "pointer",
        opacity: isDisabled ? 0.6 : 1,
        backgroundColor: liked ? "#ef4444" : "#e5e7eb",
        color: liked ? "#ffffff" : "#374151",
        fontWeight: 600,
        fontSize: "14px",
        transition: "all 0.2s ease",
      }}
    >
      <span style={{ fontSize: "18px" }}>{liked ? "\u2764\uFE0F" : "\u{1F5A4}"}</span>
      <span>{count}</span>
      {cooldown > 0 && (
        <span style={{ fontSize: "12px", opacity: 0.7 }}>({cooldown}s)</span>
      )}
    </button>
  );
}
