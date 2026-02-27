const client = require('./redisClient');

const STATS_PREFIX = 'movie:stats:';
const STATS_TTL = 3600; // 1 hour

async function refreshMovieStats(movieTitle) {
    const pipeline = [
        { $match: { movie_title: movieTitle } },
        {
            $group: {
                _id: null,
                totalReviews: { $sum: 1 },
                freshCount: { $sum: { $cond: [{ $eq: ['$review_type', 'Fresh'] }, 1, 0] } },
                rottenCount: { $sum: { $cond: [{ $eq: ['$review_type', 'Rotten'] }, 1, 0] } },
                topCriticFresh: {
                    $sum: { $cond: [{ $and: [{ $eq: ['$review_type', 'Fresh'] }, { $eq: ['$top_critic', true] }] }, 1, 0] }
                },
                latestReview: { $max: '$review_date' }
            }
        },
        {
            $project: {
                totalReviews: 1,
                freshCount: 1,
                rottenCount: 1,
                tomatometer: {
                    $cond: [{ $eq: ['$totalReviews', 0] }, 0, { $multiply: [{ $divide: ['$freshCount', '$totalReviews'] }, 100] }]
                },
                topCriticFreshCount: 1,
                latestReview: 1
            }
        }
    ];

    const result = await rottenReview.aggregate(pipeline);
    const stats = result[0] || { totalReviews: 0, freshCount: 0, rottenCount: 0, tomatometer: 0, topCriticFreshCount: 0, latestReview: null };

    await client.hSet(`${STATS_PREFIX}${movieTitle}`, stats);
    await client.expire(`${STATS_PREFIX}${movieTitle}`, STATS_TTL);

    return stats;
}

async function getMovieStats(movieTitle) {
    const key = `${STATS_PREFIX}${movieTitle}`;
    const cached = await client.hGetAll(key);

    if (Object.keys(cached).length > 0) {
        return {
            totalReviews: Number(cached.totalReviews),
            freshCount: Number(cached.freshCount),
            rottenCount: Number(cached.rottenCount),
            tomatometer: Number(cached.tomatometer),
            topCriticFreshCount: Number(cached.topCriticFreshCount),
            latestReview: cached.latestReview || null
        };
    }

    // Cache miss → compute & store
    return await refreshMovieStats(movieTitle);
}

module.exports = {
    refreshMovieStats,
    getMovieStats
};