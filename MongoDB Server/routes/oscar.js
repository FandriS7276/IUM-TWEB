const express = require('express');
const router = express.Router();
const oscarController = require('../controller/oscarController');

// GET /awards/oscar (all Oscars or filtered)
router.get('/oscar', oscarController.getAllOscars);

// GET /awards/controversial-winners
router.get('/controversial-winners', oscarController.getControversialOscarWinners);

// GET /awards/never-winning-nominees
router.get('/never-winning-nominees', oscarController.getMostNominatedMovies);

module.exports = router;