const path = require('path');
const oscarCollection = require('../schema/oscarSchema');


const CACHE_FILE = path.join(__dirname, 'snubbedCache.json');
let snubbedCache = null;

async function loadSnubbedCache() {
    try {
        const data = await fs.readFile(CACHE_FILE, 'utf8');
        snubbedCache = JSON.parse(data);

        console.log(`Snubbed cache loaded: ${snubbedCache.length} movies`);
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log('No snubbed cache file yet — will build on refresh');
            snubbedCache = [];
        }
        else {
            console.error('Failed to load snubbed cache:', err);
        }
    }
}

async function refreshSnubbedCache() {
    console.log('Refreshing snubbed cache...');

    // All movies that are Fresh but never won
    const freshMovies = await rottenReview.distinct('movie_title', { review_type: 'Fresh' });
    
    // All movies that actually WON something (winner: true)
    const winningMovies = await oscarCollection.distinct('film', { winner: true });
    
    // Snubbed movies = Fresh movies that never won
    const snubbedTitles = freshMovies.filter(title => !winningMovies.includes(title));

    await fs.writeFile(CACHE_FILE, JSON.stringify(snubbedTitles, null, 2));
    snubbedCache = snubbedTitles;

    console.log(`Snubbed cache refreshed: ${snubbedTitles.length} movies (no wins)`);
}

module.exports = {
    loadSnubbedCache,
    refreshSnubbedCache,
    getSnubbedMovies: () => snubbedCache || []
};