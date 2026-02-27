const client = require('./redisClient');
const oscarCollection = require('../schema/oscarSchema');
const rottenReview = require('../schema/rottenSchema');

const SNUBBED_KEY = 'snubbed:movies'; // Sorted Set: score = freshCount, member = movie_title

async function refreshSnubbedCache() {
    console.log('Refreshing snubbed cache...');

    const winningMovies = await oscarCollection.distinct('film', { winner: true });

    const freshMovies = await rottenReview.distinct('movie_title', { review_type: 'Fresh' });

    const snubbedTitles = freshMovies.filter(title => !winningMovies.includes(title));

    if (snubbedTitles.length === 0) return;

    // Get current freshCount for each (from stats or direct aggregate)
    const pipeline = [
        { $match: { movie_title: { $in: snubbedTitles }, review_type: 'Fresh' } },
        { $group: { _id: '$movie_title', freshCount: { $sum: 1 } } },
        { $project: { movie_title: '$_id', freshCount: 1, _id: 0 } }
    ];

    const result = await rottenReview.aggregate(pipeline);

    await client.del(SNUBBED_KEY);

    const multi = client.multi();
    result.forEach(({ movie_title, freshCount }) => {
        multi.zAdd(SNUBBED_KEY, { score: freshCount, value: movie_title });
    });
    await multi.exec();

    console.log(`Snubbed cache refreshed: ${result.length} movies`);
}

async function getSnubbedMovies(page = 1, limit = 20) {
    const start = (page - 1) * limit;
    const end = start + limit - 1;
    return await client.zRange(SNUBBED_KEY, start, end, { REV: true }); // descending by score
}

async function getSnubbedCount() {
    return await client.zCard(SNUBBED_KEY);
}

module.exports = {
    refreshSnubbedCache,
    getSnubbedMovies,
    getSnubbedCount
};