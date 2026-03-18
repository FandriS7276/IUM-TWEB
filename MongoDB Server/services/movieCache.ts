/**
 * services/movieCache.ts — Maintains a Redis set of all valid movie titles.
 *
 * The review creation endpoint and other features need to validate that a movie
 * title actually exists. Rather than querying another database on every request,
 * we keep a Redis set (`movies:all-titles:set`) that is:
 *   - Fully synced at server startup via `syncAllMovieTitles()`
 *   - Kept up-to-date in real time via `addMovieTitle()`, which is called by
 *     the internal `/api/internal/sync-movie` endpoint whenever the other DB
 *     adds a new movie.
 *
 * Titles are stored normalized (trimmed, lowercase) so lookups are case-insensitive.
 */

import client from '../database/redisClient';

const ALL_MOVIES_KEY = 'movies:all-titles:set';

/**
 * Fetches all movie titles from the external database and replaces the Redis set.
 * Called once at server startup to ensure the set is fresh.
 * Throws on failure so the startup sequence can decide whether to abort.
 */
export async function syncAllMovieTitles(): Promise<string[]> {
    console.log('🔥 Performing full sync of movie titles from other DB to Redis...');

    try {
        // INTERNAL_TOKEN doubles as the URL for the other DB's movie list endpoint
        const res = await fetch(process.env.INTERNAL_TOKEN as string);
        if (!res.ok) throw new Error('Failed to fetch movie titles from other DB');

        const titles   = (await res.json()) as string[];
        const normalizedTitles = titles.map(t => t.trim().toLowerCase());

        // Replace the existing set atomically (del + sAdd)
        await client.del(ALL_MOVIES_KEY);
        if (normalizedTitles.length > 0) {
            // sAdd with an array adds all titles in a single Redis command
            await client.sAdd(ALL_MOVIES_KEY, normalizedTitles);
        }

        console.log(`✅ Full sync complete: ${normalizedTitles.length} titles in Redis`);
        return normalizedTitles;
    } catch (err) {
        console.error('Full movie title sync failed:', err);
        throw err;
    }
}

/**
 * Adds a single movie title to the Redis set.
 * Called by the internal sync endpoint when the other DB registers a new movie.
 */
export async function addMovieTitle(title: string): Promise<void> {
    if (!title) throw new Error('Missing title');

    const normalized = title.trim().toLowerCase();
    // sAdd is idempotent — adding an already-present member is a no-op
    await client.sAdd(ALL_MOVIES_KEY, normalized);

    console.log(`✅ Added new movie title "${normalized}" to Redis validation set`);
}
