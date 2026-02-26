var express = require('express');
var router = express.Router();
const oscarController = require('../controller/oscarController');
const rottenController = require('../controller/rottenController');

// Oscar endpoints
router.get('/awards/oscar', oscarController.getAllOscars);
router.get('/awards/controversial-winners', oscarController.getControversialOscarWinners);

// Rotten Tomatoes endpoints
router.get('/reviews', rottenController.getAllReviews);
router.get('/snubbed-movies', rottenController.getSnubbedMovies);
router.get('/reviews-by-type', rottenController.getReviewsByType);
router.get('/reviews/movie/:movieTitle', rottenController.getReviewsByMovie);
router.get('/reviews/movie/:movieTitle/stats', rottenController.getMovieReviewStats);
module.exports = router;