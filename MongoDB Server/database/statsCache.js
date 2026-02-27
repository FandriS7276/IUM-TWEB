const fs = require('fs').promises;
const path = require('path');
const rottenReview = require('../schema/rottenSchema');

const STATS_FILE = path.join(__dirname, 'statsCache.json');

let statsCache = null; // { "Oppenheimer": { freshCount: 342, tomatometer: 96.5, totalReviews: 355, ... } }

async function refreshStatsCache() {
    console.log('Refreshing hourly movie stats cache...');

    const pipeline = [
        {
            $group: {
                _id: '$movie_title',
                freshCount: {
                    $sum: { $cond: [{ $eq: ['$review_type', 'Fresh'] }, 1, 0] }
                },
                rottenCount: {
                    $sum: { $cond: [{ $eq: ['$review_type', 'Rotten'] }, 1, 0] }
                },
                totalReviews: { $sum: 1 },
                latestReview: { $max: '$review_date' }
            }
        },
        {
            $project: {
                movie_title: '$_id',
                freshCount: 1,
                rottenCount: 1,
                totalReviews: 1,
                tomatometer: {
                    $cond: [
                        { $eq: ['$totalReviews', 0] },
                        0,
                        { $multiply: [{ $divide: ['$freshCount', '$totalReviews'] }, 100] }
                    ]
                },
                latestReview: 1,
                _id: 0
            }
        },
      { $sort: { freshCount: -1 } } // most liked first
    ];

    const result = await rottenReview.aggregate(pipeline);

    // Convert to object for fast lookup
    statsCache = {};
    result.forEach(stat => {
        statsCache[stat.movie_title] = stat;
    });

    await fs.writeFile(STATS_FILE, JSON.stringify(statsCache, null, 2));

    console.log(`Stats cache refreshed: ${Object.keys(statsCache).length} movies`);
}

async function loadStatsCache() {
    try {
        const data = await fs.readFile(STATS_FILE, 'utf8');
        statsCache = JSON.parse(data);
        console.log(`Stats cache loaded: ${Object.keys(statsCache).length} movies`);
    } catch (err) {
        console.log('No stats cache file yet — will build on next refresh');
        statsCache = {};
    }
}

module.exports = {
    refreshStatsCache,
    loadStatsCache,
    getStats: (movieTitle) => statsCache[movieTitle] || null,
    getAllStats: () => statsCache
};