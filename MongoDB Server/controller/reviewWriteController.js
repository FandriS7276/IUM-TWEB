const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const rottenReview = require('../schema/rottenSchema');
const client = require('../database/redisClient');

// Auth middleware
const requireAuth = (req, res, next) => {
    if (!req.user)
        return res.status(401).json({ success: false, message: 'Login required' });
    next();
};

// Rate limiter for creating reviews - max 5 reviews per 15 minutes per user/IP
const writeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 reviews max
    keyGenerator: (req) => req.user?.id || req.ip, // tie to logged-in user if possible
    message: { success: false, message: 'Too many reviews. Wait 15 min.' }
});

// Reviews validation middleware
const validateReview = [
    body('movie_title').trim().notEmpty().escape(),
    body('review_type').isIn(['Fresh', 'Rotten']),
    body('review_content').trim().isLength({ min: 5, max: 2000 }).escape(),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()){
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        next();
    }
];

// POST /api/reviews - create review
router.post('/',
    requireAuth,          // 1. Must be logged in
    writeLimiter,         // 2. Rate limit
    validateReview,       // 3. Validate input
    createReview          // 4. Actual logic
);

// POST /api/reviews/:id/like - like a review (stub)
router.post('/:id/like',
    requireAuth,
    writeLimiter,
    likeReview
);

// POST /api/reviews/:id/report - report a review (stub)
router.post('/:id/report',
    requireAuth,
    writeLimiter,
    reportReview
);

// Review creation endpoint
exports.createReview = async (req, res) => {
    try {

        // 1. Validation + auth already in middleware (good)
        const {
            movie_title,
            review_type,
            top_critic = false,
            review_content,
            review_score
        } = req.body;

        // 2. Save review to Mongo
        const newReview = new rottenReview({
            movie_title,
            review_type,
            top_critic,
            review_content,
            review_score,
            user_id: req.user.id, // tie review to user
            review_date: new Date()
        });
        await newReview.save();

        // 3. Atomic increments in Redis (fast, no race conditions)
        const key = `movie:stats:${movie_title}`;

        await client.multi()
            .hIncrBy(key, 'totalReviews', 1)
            .hIncrBy(key, review_type === 'Fresh' ? 'freshCount' : 'rottenCount', 1)
            .hIncrBy(key, top_critic && review_type === 'Fresh' ? 'topCriticFreshCount' : 'dummy', 0) // dummy for conditional
            .exec();

        // 4. Update tomatometer live
        const current = await client.hGetAll(key);
        const total = Number(current.totalReviews || 1);
        const fresh = Number(current.freshCount || 0);
        const tomatometer = total > 0 ? (fresh / total) * 100 : 0;
        await client.hSet(key, 'tomatometer', tomatometer.toFixed(1));

        res.status(201).json({
            success: true,
            message: 'Review created',
            data: newReview
        });
    }
    catch (err) {
        console.error('Error creating review:', err);
        res.status(500).json({ success: false, message: 'Failed to create review' });
    }
};

exports.reportReview = async (req, res) => {
    try {
        const {review_id} = req.params;
        res.status(200).json({ success: true, message: `Review ${review_id} reported` });
    }
    catch (err) {
        console.error('Error reporting review:', err);
        res.status(500).json({ success: false, message: 'Failed to report review' });
    }
}