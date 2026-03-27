/**
 * routes/likes.ts — Movie activity endpoints (likes + view tracking).
 *
 * Mounted at /api/movies by routes/index.ts, so full paths are:
 *   POST /api/movies/view                 — record a page view (public)
 *   POST /api/movies/:movieId/like        — toggle like (auth required)
 *   GET  /api/movies/:movieId/like-status — check like status (public, optional auth)
 *
 * Note: /view must be declared before /:movieId/like so Express does not
 * try to match "view" as a movieId.
 */

import { Router } from 'express';
import { requireAuth } from '../controller/reviewWriteController';
import { viewLimiter, recordView, likeLimiter, toggleLike, getLikeStatus } from '../controller/likeController';

const router = Router();

// View tracking — public, rate-limited to 30 req/min per IP
router.post('/view', viewLimiter, recordView);

// Toggle like — requires login + per-IP rate limit + per-user Redis cooldown
// Express 5: async errors are automatically forwarded to the error handler
router.post('/:movieId/like', requireAuth, likeLimiter, toggleLike);

// Like status check — public endpoint, req.user is optional
router.get('/:movieId/like-status', getLikeStatus);

export default router;
