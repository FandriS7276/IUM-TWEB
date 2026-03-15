const client = require('../database/redisClient');
const oscarCollection = require('../schema/oscarSchema');

// Redis key for the nominated-but-not-winning movie titles
const NOMINATED_KEY = 'nominated:movies:set';

// Refreshes the list of nominated-but-not-winning movies. Called manually
// Stores only movie titles - anything else is not needed
async function refreshNominatedCache() {
    console.log('Refreshing nominated-but-not-winning cache...');

    try {
        // Get all movies that won at least once
        const winningMovies = await oscarCollection.distinct('film', { winner: true });

        // All movies that were ever nominated (regardless of win status)
        const nominatedMovies = await oscarCollection.distinct('film');

        // Filtering nominations but NOT winning movies
        const nomitatedOnly = nominatedMovies.filter(title => !winningMovies.includes(title));

        // Store as simple set
        await client.del(NOMINATED_KEY);
        if (nomitatedOnly.length > 0) {
            await client.sAdd(NOMINATED_KEY, nomitatedOnly);
        }

        console.log(`Nominated cache refreshed: ${nomitatedOnly.length} movies`);
        return nominatedOnly;
    }
    catch (err) {
        console.error('Error refreshing nominated cache:', err);
    }
}

// Gets all nominated-but-not-winning movies in an unsorted array
async function getNominatedTitles() {
    try {
        const titles = await client.sMembers(NOMINATED_KEY);
        if (titles.length === 0) {
            return await refreshNominatedCache();
        }
        return titles;
    }
    catch (err) {
        console.error('Error getting nominated titles:', err.message);
        return []; // Return empty array so controller can show empty state
    }
}

// Start with empty array, populate from DB
let VALID_CATEGORIES = [];

const categoryChangeListeners = [];

function onCategoriesChange(callback) {
    categoryChangeListeners.push(callback);
}

function notifyCategoryChange() {
    categoryChangeListeners.forEach(cb => cb(VALID_CATEGORIES));
}

async function initCategoryWatcher() {
    // Initial load
    await loadValidCategories();
    
    // Watch for changes in oscar collection
    const changeStream = oscarCollection.watch([
        { $match: { 'fullDocument.category': { $exists: true } } }
    ]);
    
    changeStream.on('change', async (change) => {
        console.log('📡 Category change detected:', change.operationType);
        await loadValidCategories();
        notifyCategoryChange();
    });
    
    changeStream.on('error', (err) => {
        console.error('Change stream error:', err);
        // Fallback to periodic polling
        setInterval(loadValidCategories, 60000);
    });
}

// Caching grouped oscar searches
const CACHE_PREFIX = 'oscars:grouped:';
const CACHE_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

function getOscarsCacheKey(query = {}) {
    // Only filters matter for cache key - ignore page, limit and sortBy
    const filterOnly = {
        year_film: query.year_film,
        year_ceremony: query.year_ceremony,
        winner: query.winner,
        category: query.category,
        from_date: query.from_date,
        to_date: query.to_date
    }

    // Clean undefined or null cache keys
    Object.keys(relevant).forEach(k => {
        if (relevant[k] == null) delete relevant[k];
    });

    // Sort keys alphabetically → stable key regardless of query param order
    const sortedQuery = JSON.stringify(query, Object.keys(query).sort());
    return `${CACHE_PREFIX}${sortedQuery}`;
}

module.exports = {
    refreshNominatedCache,
    getNominatedTitles,
    initCategoryWatcher,
    getOscarsCacheKey,
    CACHE_TTL_SECONDS
};