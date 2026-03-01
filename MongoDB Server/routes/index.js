var express = require('express');
var router = express.Router();
const oscarController = require('../controller/oscarController');
const reviewReadController = require('../controller/reviewReadController');

// Oscar endpoints
router.get('/awards/oscar', oscarController.getAllOscars);
router.get('/awards/controversial-winners', oscarController.getControversialOscarWinners);

// Rotten Tomatoes endpoints
router.get('/reviews', reviewReadController.getAllReviews);
router.get('/snubbed-movies', reviewReadController.getSnubbedMovies);
router.get('/reviews-by-type', reviewReadController.getReviewsByType);
router.get('/reviews/movie/:movieTitle', reviewReadController.getReviewsByMovie);
router.get('/reviews/movie/:movieTitle/stats', reviewReadController.getMovieReviewStats);
module.exports = router;