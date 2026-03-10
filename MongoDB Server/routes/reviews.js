const express = require('express');
const router = express.Router();

const reviewRead = require('../controller/reviewReadController');
const reviewWrite = require('../controller/reviewWriteController');

// GET /reviews (list/filter)
router.get('/', reviewRead.getReviews);

// POST /reviews (create)
router.post('/',
    reviewWrite.requireAuth,
    reviewWrite.writeLimiter,
    reviewWrite.validateReview,
    reviewWrite.createReview
);

// TODO stubs - implement when ready
router.put('/:id', reviewWrite.requireAuth, reviewWrite.writeLimiter, reviewWrite.updateReview);
router.delete('/:id', reviewWrite.requireAuth, reviewWrite.writeLimiter, reviewWrite.deleteReview);
router.post('/:id/like', reviewWrite.requireAuth, reviewWrite.writeLimiter, reviewWrite.likeReview);
router.post('/:id/report', reviewWrite.requireAuth, reviewWrite.writeLimiter, reviewWrite.reportReview);

module.exports = router;