var express = require('express');
var router = express.Router();
var oscarController = require('../controller/oscarController');
var rotomController = require('../controller/rotomController');

router.get('/oscar', oscarController.getAllOscars);
router.get('/rotom', rotomController.getAllRottenReviews);
router.get('/controversial-winners', oscarController.getControversialOscarWinners);
router.get('/snubbed-movies', rotomController.getSnubbedMovies);
router.get('/reviews-by-type', rotomController.getReviewsByType);