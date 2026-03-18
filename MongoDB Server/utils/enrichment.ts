/**
 * utils/enrichment.ts — Enriches movie title arrays with live stats from Redis.
 *
 * Many endpoints store only movie titles in Redis (sorted sets, plain sets).
 * Titles alone are not useful to the frontend, so this utility pairs each
 * title with its current review stats before sending the response.
 *
 * Why Promise.all?
 *   Each movie's stats are independent — fetching movie A does not depend on
 *   movie B — so all lookups run concurrently. For a list of 20 movies this
 *   is ~20× faster than sequential awaits. The result array preserves
 *   insertion order, so callers can sort by stats immediately.
 *
 * Title normalisation:
 *   statsCache.getMovieStats() normalises the title internally (lowercase +
 *   trim) before building the Redis key and the MongoDB query. This means
 *   titles from different collections ("The Godfather", "the godfather") will
 *   all hit the same cache entry. The original, un-normalised title is still
 *   returned in the `title` field so the frontend displays it as-is.
 */

import { getMovieStats, MovieStats } from '../services/statsCache';

/** A movie title paired with its current aggregated review stats. */
export interface EnrichedMovie {
    title: string;
    stats: MovieStats;
}

/**
 * Takes an array of movie titles and returns EnrichedMovie objects in the
 * same order, each pairing the title with its stats.
 *
 * getMovieStats() always resolves to a valid MovieStats object — it returns
 * zeros when the title has no reviews and never returns undefined. If any
 * lookup throws (e.g. Redis is down), Promise.all rejects and the error
 * propagates to the caller to handle.
 */
export async function enrichWithStats(titles: string[]): Promise<EnrichedMovie[]> {
    if (!titles.length) return [];

    const stats = await Promise.all(titles.map(getMovieStats));

    return titles.map((title, i) => ({ title, stats: stats[i] }));
}
