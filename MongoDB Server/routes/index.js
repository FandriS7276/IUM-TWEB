var express = require('express');
var router = express.Router();

// Domain-specific routers
router.use('/reviews', require('./reviews'));
router.use('/awards', require('./oscar'));
router.use('/popular', require('./popular'));
router.use('/movies', require('./movies'));
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

// Optional: 404 catch-all (already in app.js, but can leave here too)
router.use((req, res) => {
    res.status(404).json({ success: false, message: 'Endpoint not found' });
});

module.exports = router;