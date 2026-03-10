var express = require('express');
var router = express.Router();

// Domain-specific routers
router.use('/reviews', require('./reviews'));
router.use('/awards', require('./oscar'));
router.use('/popular', require('./popular'));
router.use('/user', require('./users.js'));

// Optional: root health check
router.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'API is live',
        version: '1.0',
        endpoints: [
        '/reviews', '/awards', '/popular', '/movies', '/user'
        ]
    });
});


// TODO .env INTERNAL_TOKEN missing
router.post('/internal/sync-movie', async (req, res) => {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${process.env.INTERNAL_TOKEN}`) {
        return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const { title } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'Invalid title' });

    await movieCache.addMovieTitle(title);
    res.status(200).json({ success: true });
});

module.exports = router;