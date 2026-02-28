const client = require('../database/redisClient');
const oscarCollection = require('../schema/oscarSchema');

// Redis key for the nominated-but-not-winning movie titles
const NOMINATED_KEY = 'nominated:movies:set';

// Refreshes the list of nominated-but-not-winning movies. It can only be called manually
// Stores only movie titles - anything else is not needed
async function refreshNominatedCache() {
    console.log('Refreshing nominated-but-not-winning cache...');

    // All movies that were ever nominated (have any oscar entry)
    const nominatedMovies = await oscarCollection.distinct('film');

    // Movies that actually won at least once
    const winningMovies = await oscarCollection.distinct('film', { winner: true });

    // Nominated but never won
    const nominatedButNotWinning = nominatedMovies.filter(title => !winningMovies.includes(title));

    // Store as simple set
    await client.del(NOMINATED_KEY);
    if (nominatedButNotWinning.length > 0) {
        await client.sAdd(NOMINATED_KEY, nominatedButNotWinning);
    }

    console.log(`Nominated cache refreshed: ${nominatedButNotWinning.length} movies`);
}

// Gets all nominated-but-not-winning movies in an unsorted array
async function getNominatedTitles() {
    return await client.sMembers(NOMINATED_KEY); // Get all members of the set
}

module.exports = {
    refreshNominatedCache,
    getNominatedTitles
};