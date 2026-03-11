const express = require('express');
const router = express.Router();
const popularityCache = require('../services/popularityCache');

// GET /popular/today
router.get('/today', async (req, res) => {
    const movies = await popularityCache.getPopularDaily(
        Number(req.query.page) || 1,
        Number(req.query.limit) || 20
    );
    res.json({ success: true, data: movies });
});

// GET /popular/this-week
router.get('/this-week', async (req, res) => {
    const movies = await popularityCache.getPopularWeekly(
        Number(req.query.page) || 1,
        Number(req.query.limit) || 20
    );
    res.json({ success: true, data: movies });
});

// GET /popular/trending (hot right now)
router.get('/trending', async (req, res) => {
    const movies = await popularityCache.getHotMovies(Number(req.query.limit) || 10);
    res.json({ success: true, data: movies });
});

// TODO previous day and week populars

module.exports = router;