var express = require('express');
var router = express.Router();
var oscarController = require('../controller/oscarController');
var rotomController = require('../controller/rotomController');

router.get('/api/oscar', oscarController.getAllOscars);
router.get('/api/rotom', rotomController.getAllRottenReviews);
router.get('/api/controversial-winners', oscarController.getControversialOscarWinners);
router.get('/api/snubbed-movies', rotomController.getSnubbedMovies);
router.get('/api/reviews-by-type', rotomController.getReviewsByType);