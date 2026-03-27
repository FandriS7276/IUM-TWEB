/**
 * controller/reviewReadController.ts — Handles read operations on the reviews collection.
 *
 * This controller is intentionally thin — it only handles HTTP concerns:
 *   1. Extract and validate query parameters.
 *   2. Delegate to the review cache service (services/reviewCache.ts).
 *   3. Return the response with the correct status code.
 *
 * All caching, query building, and database access logic lives in
 * services/reviewCache.ts, following the same separation-of-concerns
 * pattern used by the Oscar endpoints (oscarCache.ts).
 */

import { Request, Response } from 'express';
import { extractPagination } from '../utils/pagination';
import { handleError } from '../utils/handler';
import { getCachedReviews } from '../services/reviewCache';
import { getMovieStats } from '../services/statsCache';
import RottenReview from '../schema/rottenSchema';
import client from '../database/redisClient';

// ─── Recent Movies ────────────────────────────────────────────────────────────

const RECENT_MOVIES_TTL = 300; // 5 minutes — balances freshness with performance

/**
 * GET /reviews/recent-movies?limit=N
 *
 * Returns unique movie titles that were most recently reviewed, ordered by
 * their latest review date descending. This is intentionally cheaper than
 * GET /reviews (no review_content, no $facet count) — it only needs titles.
 *
 * The aggregation pipeline:
 *   1. $sort review_date DESC → uses the existing { review_date: -1 } index.
 *   2. $group by movie_title, keeping $first review_date (= most recent per title).
 *   3. $sort the grouped titles by their latest review date.
 *   4. $limit to the requested count.
 *
 * Results are cached in Redis for 5 minutes so repeated homepage loads
 * never hit MongoDB more than once per 5-minute window.
 */
export const getRecentMovies = async (req: Request, res: Response): Promise<void> => {
    try {
        const limit = Math.min(Number(req.query.limit) || 20, 100);
        const cacheKey = `reviews:recent-movies:${limit}`;

        const cached = await client.get(cacheKey);
        if (cached) {
            res.json(JSON.parse(cached));
            return;
        }

        const results = await RottenReview.aggregate([
            { $sort:  { review_date: -1 } },
            { $group: { _id: '$movie_title', latestReview: { $first: '$review_date' } } },
            { $sort:  { latestReview: -1 } },
            { $limit: limit },
            { $project: { _id: 0, movie_title: '$_id' } },
        ]);

        const response = { success: true, data: results };
        client.setEx(cacheKey, RECENT_MOVIES_TTL, JSON.stringify(response)).catch(() => {});
        res.json(response);
    } catch (err) {
        handleError(res, err as Error & { status?: number }, 'Failed to get recent movies');
    }
};

// ─── Movie Review Stats ───────────────────────────────────────────────────────

/**
 * GET /reviews/stats?movie_title=X
 *
 * Returns pre-computed tomatometer stats for a single movie title.
 * Delegates to getMovieStats() in statsCache.ts which uses a 24-hour
 * Redis cache backed by a single MongoDB aggregation on cache miss.
 *
 * This replaces the old pattern of two parallel limit=1 review queries
 * on the movie detail page — those fired separate $facet aggregations
 * every 2 minutes (review cache TTL), while this endpoint caches for 24 h.
 */
export const getMovieReviewStats = async (req: Request, res: Response): Promise<void> => {
    try {
        const { movie_title } = req.query as { movie_title?: string };

        if (!movie_title?.trim()) {
            res.status(400).json({ success: false, message: 'movie_title is required' });
            return;
        }

        const stats = await getMovieStats(movie_title.trim());
        const total = stats.freshCount + stats.rottenCount;
        res.json({
            success: true,
            stats: {
                ...stats,
                // Ensure tomatometer is null (not 0) when a movie has no reviews,
                // so the frontend can distinguish "unrated" from "0% rotten"
                tomatometer: total > 0 ? stats.tomatometer : null,
            },
        });
    } catch (err) {
        handleError(res, err as Error & { status?: number }, 'Failed to get movie stats');
    }
};

// ─── Recent Reviews (with review data) ───────────────────────────────────────

const RECENT_REVIEWS_TTL = 300; // 5 minutes — same as recent-movies

/**
 * GET /reviews/recent?limit=N
 *
 * Returns the N most recent reviews with only the fields needed by the
 * homepage ReviewCard component: _id, movie_title, critic_name, review_type,
 * and a truncated review_content (max 200 chars).
 *
 * This is lightweight by design — no $facet, no full content, no pagination.
 * Cached in Redis for 5 minutes.
 */
export const getRecentReviews = async (req: Request, res: Response): Promise<void> => {
    try {
        const limit = Math.min(Number(req.query.limit) || 20, 100);
        const cacheKey = `reviews:recent-reviews:${limit}`;

        const cached = await client.get(cacheKey);
        if (cached) {
            res.json(JSON.parse(cached));
            return;
        }

        const results = await RottenReview.find({})
            .sort({ review_date: -1 })
            .limit(limit)
            .select('_id movie_title critic_name review_type review_content')
            .lean();

        // Truncate review_content to 200 chars for the card preview
        const truncated = results.map((r: any) => ({
            _id: r._id,
            movie_title: r.movie_title,
            critic_name: r.critic_name,
            review_type: r.review_type,
            review_content: r.review_content
                ? r.review_content.length > 200
                    ? r.review_content.slice(0, 200) + '…'
                    : r.review_content
                : '',
        }));

        const response = { success: true, data: truncated };
        client.setEx(cacheKey, RECENT_REVIEWS_TTL, JSON.stringify(response)).catch(() => {});
        res.json(response);
    } catch (err) {
        handleError(res, err as Error & { status?: number }, 'Failed to get recent reviews');
    }
};

export const getReviews = async (req: Request, res: Response): Promise<void> => {
    try {
        const { page, limit, skip } = extractPagination(req.query);

        const { review_type, top_critic, from_date, to_date, sortBy, movie_title } =
            req.query as Record<string, string | undefined>;

        const result = await getCachedReviews({
            movie_title, review_type, top_critic,
            from_date, to_date, sortBy,
            page, limit, skip
        });

        res.status(result.status).json(result.response);
    } catch (err) {
        const e = err as Error & { status?: number };
        if (e.status === 400)
            res.status(400).json({ success: false, message: e.message });
        else
            handleError(res, e, 'Failed to retrieve reviews');
    }
};
