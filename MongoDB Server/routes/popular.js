const express = require('express');
const router = express.Router();
const popularityCache = require('../services/popularityCache');

// GET /popular/today
router.get('/today', async (req, res) => {
    try {
        const data = await popularityCache.getPopularDaily(
            Number(req.query.page) || 1,
            Number(req.query.limit) || 20
        );
        res.json({ success: true, data });
    }
    catch (err) {
        handleError(res, err, 'Failed to load popular today');
    }
});

// GET /api/popular/this-week
router.get('/this-week', async (req, res) => {
    try {
        const data = await popularityCache.getPopularWeekly(
            Number(req.query.page) || 1,
            Number(req.query.limit) || 20
        );
        res.json({ success: true, data });
    } catch (err) {
        handleError(res, err, 'Failed to load popular this week');
    }
});

// GET /api/popular/trending (hot right now)
router.get('/trending', async (req, res) => {
    try {
        const data = await popularityCache.getHotMovies(
            Number(req.query.limit) || 10
        );
        res.json({ success: true, data });
    } catch (err) {
        handleError(res, err, 'Failed to load trending movies');
    }
});

// GET /api/popular/yesterday
router.get('/yesterday', async (req, res) => {
    try {
        const data = await popularityCache.getYesterdayPopular(
            Number(req.query.limit) || 10
        );
        res.json({ success: true, data });
    } catch (err) {
        handleError(res, err, 'Failed to load yesterday popular');
    }
});

// GET /api/popular/last-week
router.get('/last-week', async (req, res) => {
    try {
        const data = await popularityCache.getLastWeekPopular(
            Number(req.query.limit) || 10
        );
        res.json({ success: true, data });
    } catch (err) {
        handleError(res, err, 'Failed to load last week popular');
    }
});

module.exports = router;