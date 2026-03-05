const { getMovieStats } = require('../services/statsCache');

/**
 * Enriches array of movie titles with current stats + sorts by freshCount descending
 * @param {string[]} titles - array of movie titles
 * @returns {Array<Object>} enriched stats objects (sorted)
 */
async function enrichWithStats(titles) {
    if (!titles.length) return [];
    const stats = await Promise.all(titles.map(getMovieStats));
    return titles.map((title, i) => ({
        title,
        stats: stats[i] || { freshCount: 0, tomatometer: 0, totalReviews: 0 }
    }));
}


module.exports = { enrichWithStats };