/**
 * utils/enrichment.ts — Enriches movie title arrays with live stats from Redis.
 *
 * Many endpoints store only movie titles in Redis (sorted sets, plain sets).
 * Titles alone are not useful to the frontend, so this utility pairs each
 * title with its current review stats before sending the response.
 *
 * Performance (v2 — batch aggregation):
 *   The original implementation called getMovieStats() per title in batches
 *   of 15. On a cold Redis cache, each cache miss triggered a separate
 *   MongoDB aggregation — 100 titles meant ~100 sequential queries.
 *
 *   The new getBatchMovieStats() does it in 3 operations total:
 *     1. One Redis pipeline to check all titles at once.
 *     2. One MongoDB $in aggregation for all cache misses.
 *     3. One Redis pipeline to store all new stats.
 *
 *   Cold-start enrichment of 100 titles: ~100 queries → 3 operations.
 *   Warm-cache enrichment: 1 Redis pipeline → sub-millisecond.
 */

import { getBatchMovieStats, MovieStats } from '../services/statsCache';

/** A movie title paired with its current aggregated review stats. */
export interface EnrichedMovie {
    title: string;
    stats: MovieStats;
}

/** Zero-value stats for titles that have no reviews. */
const ZERO_STATS: MovieStats = {
    totalReviews: 0, freshCount: 0, rottenCount: 0,
    tomatometer: 0, topCriticFreshCount: 0, latestReview: null
};

/**
 * Takes an array of movie titles and returns EnrichedMovie objects in the
 * same order, each pairing the title with its stats.
 *
 * Uses getBatchMovieStats() for a single-pass lookup instead of per-title
 * sequential calls. See statsCache.ts for the batch implementation details.
 */
export async function enrichWithStats(titles: string[]): Promise<EnrichedMovie[]> {
    if (!titles.length) return [];

    const statsMap = await getBatchMovieStats(titles);

    return titles.map(title => ({
        title,
        stats: statsMap.get(title) ?? { ...ZERO_STATS }
    }));
}
