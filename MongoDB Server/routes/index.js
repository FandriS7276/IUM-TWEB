var express = require('express');
var router = express.Router();
var oscarController = require('../controller/oscarController');
var rottenController = require('../controller/rottenController');

router.get('/api/oscar', oscarController.getAllOscars);
router.get('/api/rotten', rottenController.getAllRottenReviews);
router.get('/api/controversial-winners', oscarController.getControversialOscarWinners);
router.get('/api/snubbed-movies', rottenController.getSnubbedMovies);
router.get('/api/reviews-by-type', rottenController.getReviewsByType);