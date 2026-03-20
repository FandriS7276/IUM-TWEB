/**
 * utils/enrichment.ts — Enriches movie title arrays with live stats from Redis.
 *
 * Many endpoints store only movie titles in Redis (sorted sets, plain sets).
 * Titles alone are not useful to the frontend, so this utility pairs each
 * title with its current review stats before sending the response.
 *
 * Batched concurrency:
 *   Titles are processed in chunks of BATCH_SIZE. Within each chunk, lookups
 *   run concurrently via Promise.all. This bounds the number of simultaneous
 *   MongoDB aggregations on a cold Redis start (e.g. fresh Docker run) while
 *   still being fast once the cache is warm — Redis hits resolve in <1ms.
 *
 *   A flat Promise.all over hundreds of titles caused OOM crashes in Docker:
 *   every title missed the cold cache and fired a simultaneous full-collection
 *   scan, exhausting the MongoDB connection pool and Node.js heap memory.
 *
 * Title normalisation:
 *   statsCache.getMovieStats() normalises titles internally (lowercase + trim)
 *   so "The Godfather" and "the godfather" resolve to the same cache entry.
 *   The original un-normalised title is preserved in the `title` field.
 */

import { getMovieStats, MovieStats } from '../services/statsCache';

/** A movie title paired with its current aggregated review stats. */
export interface EnrichedMovie {
    title: string;
    stats: MovieStats;
}

/**
 * Max simultaneous getMovieStats() calls per batch.
 * Each cache miss triggers one MongoDB aggregation — keep this low enough
 * that a cold-start run of 300+ titles doesn't flood the connection pool.
 * Tune upward if you have a large MongoDB connection pool configured.
 */
const BATCH_SIZE = 15;

/**
 * Takes an array of movie titles and returns EnrichedMovie objects in the
 * same order, each pairing the title with its stats.
 *
 * Processes titles in batches of BATCH_SIZE to prevent OOM on cold starts.
 * Within each batch lookups are concurrent, so warm-cache calls are fast.
 */
export async function enrichWithStats(titles: string[]): Promise<EnrichedMovie[]> {
    if (!titles.length) return [];

    const results: EnrichedMovie[] = [];

    for (let i = 0; i < titles.length; i += BATCH_SIZE) {
        const batch     = titles.slice(i, i + BATCH_SIZE);
        const batchStats = await Promise.all(batch.map(getMovieStats));
        batch.forEach((title, j) => results.push({ title, stats: batchStats[j] }));
    }

    return results;
}
