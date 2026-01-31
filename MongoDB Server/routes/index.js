var express = require('express');
var router = express.Router();

const mongoose = require('mongoose');

const movieSchema = new mongoose.Schema({
  movie_title: String,
  review_date: Date,
  review_score: String
}, {
  collection: 'RottenTomatoes'
});

const Movie = mongoose.model('Movie', movieSchema);


router.get('/api/movies', async function(req, res) {
  try {
    const movie = await Movie.findOne();
    res.json(movie);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
