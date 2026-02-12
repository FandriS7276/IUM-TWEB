var express = require('express');
var router = express.Router();
var oscarController = require('../controller/oscarController');
var rotomController = require('../controller/rotomController');

router.get('/oscar', oscarController.getOscar);
router.get('/rotom', rotomController.getRotom);
router.get('/controversial-winners', oscarController.getControversialWinners);
router.get('/snubbed-movies', rotomController.getSnubbedMovies);
router.get('/reviews-by-type', rotomController.getReviewsByType);