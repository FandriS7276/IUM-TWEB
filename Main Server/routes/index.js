var express = require('express');
var router = express.Router();

/* homepage */
router.get('/', async function(req, res) {
  try {
    const response = await fetch('http://localhost:4000/api/movies');
    const movie = await response.json();

    res.render('index', { movie });
  } catch (err) {
    res.status(500).send('Errore nel contattare MongoDB Server');
  }
});

module.exports = router;
