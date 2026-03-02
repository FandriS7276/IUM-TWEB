var express = require('express');
var router = express.Router();
const oscarController = require('../controller/oscarController');
const reviewReadController = require('../controller/reviewReadController');
const reviewWriteController = require('../controller/reviewWriteController');

// Oscar endpoints
router.get('/awards/oscar', oscarController.getAllOscars);
router.get('/awards/controversial-winners', oscarController.getControversialOscarWinners);

// Rotten Tomatoes endpoints
router.get('/reviews', reviewReadController.getAllReviews);
router.get('/reviews/snubbed', reviewReadController.getSnubbedMovies);
router.get('/reviews/by-type', reviewReadController.getReviewsByType);
router.get('/reviews/movie/:movieTitle', reviewReadController.getReviewsByMovie);
router.get('/reviews/movie/:movieTitle/stats', reviewReadController.getMovieReviewStats);

// Review creation endpoint
router.post('/reviews', requireAuth, writeLimiter, validateReview, reviewWriteController.createReview);
router.post('/reviews/:id/like', requireAuth, writeLimiter, reviewWriteController.likeReview);
router.post('/reviews/:id/report', requireAuth, writeLimiter, reviewWriteController.reportReview);

module.exports = router;