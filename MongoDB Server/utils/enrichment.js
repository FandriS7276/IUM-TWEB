const { getAllStats } = require('../database/statsCache');

/**
 * Enriches array of movie titles with current stats + sorts by freshCount descending
 * @param {string[]} titles - array of movie titles
 * @returns {Array<Object>} enriched stats objects (sorted)
 */
async function enrichAndSortByFreshness(titles) {
    if (!titles?.length) return [];

    const allStats = await getAllStats();

    return titles
        .map(title => allStats[title])
        .filter(stat => stat !== null)           // skip movies without stats
        .sort((a, b) => b.freshCount - a.freshCount); // most liked first
}

module.exports = { enrichAndSortByFreshness };