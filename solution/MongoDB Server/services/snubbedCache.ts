/**
 * services/snubbedCache.ts — Cache for "snubbed" movies.
 *
 * A snubbed movie is one that critics loved (has at least one Fresh review)
 * but never won an Oscar. The list is stored as a Redis set so lookups are O(1).
 *
 * The cache is populated lazily: `getSnubbedTitles()` triggers a refresh if
 * the set is empty (e.g. on first request or after a Redis restart). It can
 * also be refreshed manually by calling `refreshSnubbedCache()` directly.
 */

import client from '../database/redisClient';
import RottenReview from '../schema/rottenSchema';
import OscarCollection from '../schema/oscarSchema';

const SNUBBED_KEY = 'snubbed:movies:set';

/**
 * Rebuilds the snubbed movies set in Redis by:
 *   1. Fetching all movies that won at least one Oscar (winning movies)
 *   2. Fetching all movies with at least one Fresh review (critic-loved movies)
 *   3. Keeping only critic-loved movies that are NOT in the winning set
 *
 * `distinct()` returns unique values for a field across all documents —
 * equivalent to `SELECT DISTINCT film FROM oscarCollection WHERE winner = true`.
 */
export async function refreshSnubbedCache(): Promise<string[] | undefined> {
    try {
        console.log('Refreshing snubbed cache...');

        const winningMovies = await OscarCollection.distinct('film', { winner: true });
        const freshMovies   = await RottenReview.distinct('movie_title', { review_type: 'Fresh' });

        const snubbedTitles = (freshMovies as string[]).filter(
            title => !(winningMovies as string[]).includes(title)
        );

        // Replace the existing set atomically
        await client.del(SNUBBED_KEY);
        if (snubbedTitles.length > 0) {
            await client.sAdd(SNUBBED_KEY, snubbedTitles);
        }

        console.log(`Snubbed cache refreshed: ${snubbedTitles.length} movies`);
        return snubbedTitles;
    } catch (err) {
        console.error('Error refreshing snubbed cache:', (err as Error).message);
    }
}

/**
 * Returns all snubbed movie titles. Triggers a cache rebuild if the Redis set
 * is empty (lazy initialisation). Returns an empty array on error so callers
 * can show an empty state rather than crashing.
 */
export async function getSnubbedTitles(): Promise<string[]> {
    try {
        const titles = await client.sMembers(SNUBBED_KEY);

        if (titles.length === 0) {
            // Cache miss — compute and store for next request
            return (await refreshSnubbedCache()) ?? [];
        }

        return titles;
    } catch (err) {
        console.error('Error getting snubbed titles:', (err as Error).message);
        return [];
    }
}
