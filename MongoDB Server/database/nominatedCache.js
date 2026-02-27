const fs = require('fs').promises;
const path = require('path');
const oscarCollection = require('../schema/oscarSchema');

const CACHE_FILE = path.join(__dirname, 'nominatedCache.json');

let nominatedCache = null;

async function loadNominatedCache() {
    try {
        const data = await fs.readFile(CACHE_FILE, 'utf8');
        nominatedCache = JSON.parse(data);
        console.log(`Nominated cache loaded: ${nominatedCache.length} movies`);
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log('No nominated cache file yet');
            nominatedCache = [];
        }
        else {
            console.error('Failed to load nominated cache:', err);
        }
    }
}

async function refreshNominatedCache() {
    console.log('Refreshing nominated-but-not-winning cache...');

    // All movies that were nominated at least once (have any entry)
    const nominatedMovies = await oscarCollection.distinct('film');

    // Movies that actually WON something (winner: true)
    const winningMovies = await oscarCollection.distinct('film', { winner: true });

    // Nominated movies that never won
    const nominatedButNotWinning = nominatedMovies.filter(title => !winningMovies.includes(title));

    await fs.writeFile(CACHE_FILE, JSON.stringify(nominatedButNotWinning, null, 2));
    nominatedCache = nominatedButNotWinning;

    console.log(`Nominated cache refreshed: ${nominatedButNotWinning.length} movies`);
}

module.exports = {
    loadNominatedCache,
    refreshNominatedCache,
    getNominatedMovies: () => nominatedCache || []
};