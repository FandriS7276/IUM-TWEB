const client = require('../database/redisClient');
const rottenReview = require('../schema/rottenSchema');
const oscarCollection = require('../schema/oscarSchema');

// Redis key for the snubbed movie titles
const SNUBBED_KEY = 'snubbed:movies:set';


// Refreshes the list of snubbed movies. It can only be called manually
// Stores only movie titles - anything else is not needed
async function refreshSnubbedCache() {
    try {
        console.log('Refreshing snubbed cache...');
    
        // Get all movies that have won an Oscar at least once
        const winningMovies = await oscarCollection.distinct('film', { winner: true });
    
        // Get all movies that have at least one Fresh review (loved by critics)
        const freshMovies = await rottenReview.distinct('movie_title', { review_type: 'Fresh' });
    
        // Snubbed movies are those that have at least one Fresh review but never won an Oscar
        const snubbedTitles = freshMovies.filter(title => !winningMovies.includes(title));
    
        // Clear the existing Redis set and add the new snubbed titles
        await client.del(SNUBBED_KEY);
    
        if (snubbedTitles.length > 0) {
            // sAdd adds multiple members to the set in one command
            await client.sAdd(SNUBBED_KEY, snubbedTitles);
        }
    
        console.log(`Snubbed cache refreshed: ${snubbedTitles.length} movies`);
        return snubbedTitles;
    }
    catch {
        console.error('Error refreshing snubbed cache: ', err.message);
    }
}


// Gets all snubbed movies in an unsorted array
async function getSnubbedMovies() {
    try {
        const titles = await client.sMembers(SNUBBED_KEY);
        
        if (titles.length === 0) {
            return await refreshSnubbedCache();
        }
        
        return titles;
    } catch (err) {
        console.error('Error getting snubbed titles:', err.message);
        return []; // Graceful degradation
    }
}

module.exports = {
    refreshSnubbedCache,
    getSnubbedMovies,
    getSnubbedCount
};