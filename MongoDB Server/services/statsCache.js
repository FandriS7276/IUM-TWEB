const client = require('../database/redisClient');

// Prefix for all movie stats keys (helps organize and avoid collisions)
const STATS_PREFIX = 'movie:stats:';

// Lock refreshes in case of a cold start / empty cache so high traffic of a popular movie does NOT aggregate on multiple requests at the same time
const REFRESH_LOCK_TTL = 10;

/*
 * Refreshes stats for ONE specific movie. Called on cache miss (when we ask for a movie that
 * ain't in Redis yet). Runs a small aggregate query only on that movie's reviews — very fast.
 */
async function refreshMovieStats(movieTitle) {

    // Build the aggregation pipeline — only look at documents for this exact movie
    const pipeline = [
        { $match: { movie_title: movieTitle } },
        {
            $group: {
                _id: null,
                totalReviews: { $sum: 1 },
                // Count how many "Fresh" reviews are from top critics: cond uses a [condition, then, else] count only reviews that are Fresh type
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

    // Run the aggregation on the RottenReview collection to return an array with a single document containing all the stats for this movie
    const result = await rottenReview.aggregate(pipeline);
    const stats = result[0] || {totalReviews: 0,
                                freshCount: 0,
                                rottenCount: 0,
                                tomatometer: 0,
                                topCriticFreshCount: 0,
                                latestReview: null };
                                
    // Store the stats in Redis as a hash (key = movie:stats:{movieTitle}, fields = stat names, values = stat values)
    const key = `${STATS_PREFIX}${movieTitle}`;

    // hSet stores object fields as hash fields
    await client.hSet(key, stats);
    return stats;
}

// Get stats for one movie. First check Redis -> if there, return instantly.
// If miss → compute + store + return.
async function getMovieStats(movieTitle) {
    const key = `${STATS_PREFIX}${movieTitle}`;
    const cached = await client.hGetAll(key); // get all fields from hash

    // Condition in case we got the data
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