const express = require('express');
const router = express.Router();

// Mount domain-specific routers
router.use('/reviews', require('./reviews'));
router.use('/awards', require('./oscar'));
router.use('/popular', require('./popular'));

// root health check
router.get('/', (req, res) => {
    res.json({ success: true, message: 'API is live', version: '1.0' });
});

module.exports = router;
module.exports = router;