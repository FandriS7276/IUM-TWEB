/**
 * routes/likes.ts — Movie like/unlike endpoints.
 *
 * Mounted at /api/movies by routes/index.ts, so full paths are:
 *   POST /api/movies/:movieId/like        — toggle like (auth required)
 *   GET  /api/movies/:movieId/like-status — check like status (public, optional auth)
 */

import { Router } from 'express';
import { requireAuth } from '../controller/reviewWriteController';
import { likeLimiter, toggleLike, getLikeStatus } from '../controller/likeController';

const router = Router();

// Toggle like — requires login + per-IP rate limit + per-user Redis cooldown
// Express 5: async errors are automatically forwarded to the error handler
router.post('/:movieId/like', requireAuth, likeLimiter, toggleLike);

// Like status check — public endpoint, req.user is optional
router.get('/:movieId/like-status', getLikeStatus);

export default router;
