const client = require('../database/redisClient');

const ALL_MOVIES_KEY = 'movies:all-titles:set';

// Full sync of all movie titles from the other DB to Redis (called at startup)
async function syncAllMovieTitles() {
    console.log('🔥 Performing full sync of movie titles from other DB to Redis...');

    try {
        // Pull all titles from the other DB via API (adjust URL to your other DB endpoint)
        const res = await fetch(process.env.INTERNAL_TOKEN); // Expect JSON array of strings
        if (!res.ok) throw new Error('Failed to fetch movie titles from other DB');

        const titles = await res.json();

        // Normalize and store in Redis set
        const normalizedTitles = titles.map(t => t.trim().toLowerCase());

        await client.del(ALL_MOVIES_KEY);
        if (normalizedTitles.length > 0) {
        await client.sAdd(ALL_MOVIES_KEY, normalizedTitles);
        }

        console.log(`✅ Full sync complete: ${normalizedTitles.length} movie titles added to Redis`);
        return normalizedTitles;
    }
    catch (err) {
        console.error('Full movie title sync failed:', err);
        throw err;
    }
}

// Add a single movie title to Redis (called via push from other DB)
async function addMovieTitle(title) {
    if (!title) throw new Error('Missing title');

    const normalized = title.trim().toLowerCase();
    await client.sAdd(ALL_MOVIES_KEY, normalized);

    console.log(`✅ Added new movie title "${normalized}" to Redis validation set`);
}

module.exports = {
    syncAllMovieTitles,
    addMovieTitle
};