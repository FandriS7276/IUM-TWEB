/**
 * controller/likeController.ts — Handles like/unlike toggle for movies.
 *
 * Flow for POST /api/movies/:movieId/like:
 *   1. requireAuth blocks unauthenticated requests (reused from reviewWriteController)
 *   2. likeLimiter checks Redis for a 5-second per-user-per-movie cooldown
 *   3. MongoDB is checked for an existing like document
 *   4. Like is toggled (created or deleted)
 *   5. Redis rate-limit key is set AFTER a successful write
 *   6. A BullMQ event is published for the async PostgreSQL sync
 *
 * Flow for GET /api/movies/:movieId/like-status:
 *   Returns whether the current user has liked the movie. No writes.
 *
 * Why set the rate limit AFTER the write?
 *   If the write fails, the user shouldn't be locked out of retrying.
 *   The lock only applies once a successful toggle has been recorded.
 *
 * Why use COUNT in the worker instead of increment/decrement?
 *   Idempotency: if the same event is retried (network blip, worker restart),
 *   re-running a COUNT + SET is always correct. Increment/decrement would
 *   drift on retries.
 */

import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { Types } from 'mongoose';
import Like from '../schema/likeSchema';
import redisClient from '../database/redisClient';
import { publishLikeEvent, pgPool } from '../services/likeSync';
import { trackLike } from '../services/popularityCache';

// ─── Constants ────────────────────────────────────────────────────────────────

const LIKE_COOLDOWN_SECONDS = 5;

// ─── Rate-limit middleware (global API safety net) ────────────────────────────

/**
 * Express-rate-limit for the like route — 20 requests per minute per IP.
 * This is a coarse guard on top of the fine-grained Redis per-user cooldown.
 */
export const likeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: { success: false, message: 'Too many like requests, slow down.' },
    keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
});

// ─── Per-user Redis cooldown ──────────────────────────────────────────────────

/**
 * Checks whether the user is in a cooldown window for this specific movie.
 * Returns the remaining TTL in seconds, or 0 if they're free to proceed.
 */
async function getLikeCooldown(userId: string, movieId: number): Promise<number> {
    const key = `ratelimit:like:${userId}:${movieId}`;
    const ttl = await redisClient.ttl(key);
    // ttl is -2 (key missing) or -1 (no expiry) or >0 (seconds remaining)
    return ttl > 0 ? ttl : 0;
}

/**
 * Sets the 5-second cooldown lock after a successful like/unlike.
 * Uses SET with EX so Redis auto-cleans it — no manual deletion needed.
 */
async function setLikeCooldown(userId: string, movieId: number): Promise<void> {
    const key = `ratelimit:like:${userId}:${movieId}`;
    await redisClient.set(key, '1', { expiration: { type: 'EX', value: LIKE_COOLDOWN_SECONDS } });
}

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * POST /api/movies/:movieId/like
 * Toggles like/unlike for the authenticated user.
 */
export const toggleLike = async (req: Request, res: Response): Promise<void> => {
    const rawUserId = req.user!.id;
    const userId = new Types.ObjectId(rawUserId);
    const movieId = parseInt(req.params['movieId'] as string, 10);

    if (isNaN(movieId)) {
        res.status(400).json({ success: false, message: 'Invalid movie ID' });
        return;
    }

    // Per-user-per-movie cooldown check (fine-grained, bypasses the global limiter)
    let cooldown = 0;
    try {
        cooldown = await getLikeCooldown(rawUserId, movieId);
    } catch {
        // Redis unavailable — let the request through.
        // The MongoDB unique index is the safety net.
        console.warn('[likeController] Redis cooldown check failed, proceeding without it.');
    }

    if (cooldown > 0) {
        res.status(429).json({
            success: false,
            message: 'Please wait before toggling your like.',
            retryAfter: cooldown,
        });
        return;
    }

    // Toggle: check existing like, then create or delete
    const existingLike = await Like.findOne({ userId, movieId });
    let liked: boolean;
    let action: 'like' | 'unlike';

    if (existingLike) {
        await Like.deleteOne({ _id: existingLike._id });
        action = 'unlike';
        liked = false;
    } else {
        try {
            await Like.create({ userId, movieId });
            action = 'like';
            liked = true;
        } catch (err: unknown) {
            // Unique index violation — race condition, treat as already liked
            if ((err as { code?: number }).code === 11000) {
                res.status(200).json({ success: true, liked: true, message: 'Already liked' });
                return;
            }
            throw err;
        }
    }

    // Lock cooldown AFTER a successful write
    try {
        await setLikeCooldown(rawUserId, movieId);
    } catch {
        console.warn('[likeController] Redis cooldown set failed (non-fatal).');
    }

    // Publish async event — PostgreSQL sync happens in the background
    try {
        await publishLikeEvent(action, movieId);
    } catch {
        console.warn('[likeController] Queue publish failed (non-fatal). Reconciliation will correct.');
    }

    // Track popularity — fetch title from PostgreSQL then update Redis counters
    if (action === 'like') {
        try {
            const result = await pgPool.query<{ name: string }>('SELECT name FROM movies WHERE id = $1', [movieId]);
            if (result.rows[0]) {
                await trackLike(result.rows[0].name);
            }
        } catch {
            console.warn('[likeController] trackLike failed (non-fatal).');
        }
    }

    res.status(200).json({ success: true, liked, action });
};

/**
 * GET /api/movies/:movieId/like-status
 * Returns whether the current user has liked this movie.
 * Unauthenticated users always get liked: false.
 */
export const getLikeStatus = async (req: Request, res: Response): Promise<void> => {
    const movieId = parseInt(req.params['movieId'] as string, 10);

    if (isNaN(movieId)) {
        res.status(400).json({ success: false, message: 'Invalid movie ID' });
        return;
    }

    if (!req.user) {
        res.status(200).json({ success: true, liked: false });
        return;
    }

    const existingLike = await Like.findOne({ userId: new Types.ObjectId(req.user.id), movieId }).lean();
    res.status(200).json({ success: true, liked: !!existingLike });
};
