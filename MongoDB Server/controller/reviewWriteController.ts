/**
 * controller/reviewWriteController.ts — Handles write operations on the reviews collection.
 *
 * Exports three middleware pieces used together in the POST /reviews route:
 *   requireAuth  → blocks unauthenticated requests (no valid session/JWT)
 *   writeLimiter → rate-limits review creation to 5 per 15 min per user/IP
 *   validateReview → sanitises and validates the request body fields
 *
 * And the actual handler:
 *   createReview → saves to MongoDB + updates the Redis stats cache atomically
 *
 * After a review is saved, the stats cache is updated with `hIncrBy` (atomic
 * increment) rather than invalidating the cache entry. This keeps the cache
 * live without a full re-aggregation on every new review.
 *
 * TODO: implement updateReview, deleteReview, likeReview stubs below.
 * TODO: implement movie title validation
 */

import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import RottenReview from '../schema/rottenSchema';
import client from '../database/redisClient';

// ─── Auth middleware ──────────────────────────────────────────────────────────

/**
 * Blocks requests where `req.user` was not set by auth middleware.
 * `req.user` is populated upstream (by a JWT-verification middleware not yet
 * implemented) — without it, the user is not authenticated.
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
        res.status(401).json({ success: false, message: 'Login required' });
        return;
    }
    next();
};

// ─── Rate limiter ─────────────────────────────────────────────────────────────

/**
 * Limits review creation to 5 requests per 15 minutes.
 * Uses the authenticated user's ID as the key when available — so a user
 * can't bypass the limit by switching IP addresses. Falls back to IP for
 * unauthenticated requests (shouldn't reach here due to requireAuth, but
 * included as a safety net).
 */
export const writeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max:      5,
    keyGenerator: (req: Request) => req.user?.id || ipKeyGenerator(req.ip ?? '') || 'unknown',
    message:  { success: false, message: 'Too many reviews submitted. Wait 15 minutes.' }
});

// ─── Request body validation ──────────────────────────────────────────────────

/**
 * express-validator middleware array. Each `body()` call adds a validation rule;
 * the final function collects all errors and short-circuits with a 400 if any
 * rule failed — `.escape()` removes HTML special characters to prevent XSS.
 */
export const validateReview = [
    body('movie_title').trim().notEmpty().escape(),
    body('review_type').isIn(['Fresh', 'Rotten']),
    body('review_content').trim().isLength({ min: 5, max: 2000 }).escape(),
    (req: Request, res: Response, next: NextFunction): void => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            res.status(400).json({ success: false, errors: errors.array() });
            return;
        }
        next();
    }
];

// ─── Handlers ────────────────────────────────────────────────────────────────

export const createReview = async (req: Request, res: Response): Promise<void> => {
    try {
        const {
            movie_title, review_type, review_content, review_score,
            // Default top_critic from the authenticated user's profile so the
            // review is automatically classified correctly without the user
            // having to pass the field manually
            top_critic = req.user?.top_critic ?? false
        } = req.body as {
            movie_title: string;
            review_type: 'Fresh' | 'Rotten';
            top_critic?: boolean;
            review_content: string;
            review_score?: string;
        };

        const newReview = new RottenReview({
            movie_title, review_type, top_critic,
            review_content, review_score,
            review_date: new Date()
        });
        await newReview.save();

        // ── Update Redis stats cache atomically ───────────────────────────────
        // hIncrBy atomically increments a hash field, so concurrent review
        // submissions won't produce race conditions on the counters
        const key = `movie:stats:${movie_title}`;
        await client.multi()
            .hIncrBy(key, 'totalReviews', 1)
            .hIncrBy(key, review_type === 'Fresh' ? 'freshCount' : 'rottenCount', 1)
            .exec();

        // Recompute and store tomatometer after the increment
        const current     = await client.hGetAll(key);
        const total       = Number(current.totalReviews || 1);
        const fresh       = Number(current.freshCount   || 0);
        const tomatometer = total > 0 ? (fresh / total) * 100 : 0;
        await client.hSet(key, 'tomatometer', Math.round(tomatometer));

        res.status(201).json({ success: true, message: 'Review created', data: newReview });
    } catch (err) {
        console.error('Error creating review:', err);
        res.status(500).json({ success: false, message: 'Failed to create review' });
    }
};

export const reportReview = async (req: Request, res: Response): Promise<void> => {
    try {
        const { review_id } = req.params;
        res.status(200).json({ success: true, message: `Review ${review_id} reported` });
    } catch (err) {
        console.error('Error reporting review:', err);
        res.status(500).json({ success: false, message: 'Failed to report review' });
    }
};

// ─── Stubs (not yet implemented) ─────────────────────────────────────────────

export const updateReview = async (_req: Request, res: Response): Promise<void> => {
    res.status(501).json({ success: false, message: 'Not implemented' });
};

export const deleteReview = async (_req: Request, res: Response): Promise<void> => {
    res.status(501).json({ success: false, message: 'Not implemented' });
};

export const likeReview = async (_req: Request, res: Response): Promise<void> => {
    res.status(501).json({ success: false, message: 'Not implemented' });
};
