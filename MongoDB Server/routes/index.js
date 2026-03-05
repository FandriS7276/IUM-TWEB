var express = require('express');
var router = express.Router();
const oscarController = require('../controller/oscarController');
const reviewReadController = require('../controller/reviewReadController');
const reviewWriteController = require('../controller/reviewWriteController');

// Oscar endpoints
router.get('/awards/oscar', oscarController.getAllOscars);
router.get('/awards/controversial-winners', oscarController.getControversialOscarWinners);
router.get('/awards/never-winning-nominees', oscarController.getMostNominatedMovies);

// Rotten Tomatoes endpoints
router.get('/reviews', reviewReadController.getReviews);

// Review creation endpoint
router.post('/reviews', reviewWriteController.createReview);
router.put('/reviews/:id', reviewWriteController.updateReview);
router.delete('/reviews/:id', reviewWriteController.deleteReview);
router.post('/reviews/:id/like', reviewWriteController.likeReview);
router.post('/reviews/:id/report', reviewWriteController.reportReview)

// TODO review tracking endpoints

// Tracking endpoints
router.get('/popular/today', trackerController.getPopularToday);
router.get('/popular/this-week', trackerController.getPopularThisWeek);
module.exports = router;