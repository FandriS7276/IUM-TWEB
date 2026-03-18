import { Router } from 'express';
import { getReviews } from '../controller/reviewReadController';
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
