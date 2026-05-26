import { Router } from 'express';
import { getReviews, getRecentMovies, getRecentReviews, getMovieReviewStats } from '../controller/reviewReadController';
import {
    requireAuth,
    writeLimiter,
    validateReview,
    createReview,
    updateReview,
    deleteReview,
    likeReview,
    reportReview
} from '../controller/reviewWriteController';

const router = Router();

// GET /reviews/recent-movies — unique titles from most recent reviews (no review content)
// Must be declared before /:id routes so Express doesn't treat "recent-movies" as an id param.
router.get('/recent-movies', getRecentMovies);

// GET /reviews/recent — recent reviews with card data (critic_name, review_type, review_content)
router.get('/recent', getRecentReviews);

// GET /reviews/stats?movie_title=X — pre-computed tomatometer stats (24h cache)
router.get('/stats', getMovieReviewStats);

// GET /reviews (list/filter)
router.get('/', getReviews);

// POST /reviews (create)
router.post('/', requireAuth, writeLimiter, ...validateReview, createReview);

// TODO stubs - implement when ready
router.put('/:id', requireAuth, writeLimiter, updateReview);
router.delete('/:id', requireAuth, writeLimiter, deleteReview);
router.post('/:id/like', requireAuth, writeLimiter, likeReview);
router.post('/:id/report', requireAuth, writeLimiter, reportReview);

export default router;
