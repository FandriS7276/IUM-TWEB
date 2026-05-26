/**
 * services/statsCache.ts — Per-movie review statistics, backed by Redis.
 *
 * Stats are computed by aggregating the rottenCollection and stored as a Redis
 * hash (HSET) keyed by a normalised movie title. A hash is used instead of a
 * plain JSON string so individual fields can be read cheaply with HGET if
 * needed in the future without parsing the full blob.
 *
 * ── Title-only matching ──────────────────────────────────────────────────────
 * Movies are identified purely by title — there is no shared ID between
 * oscarCollection, rottenCollection, and the external movies dataset.
 * All titles are normalised to lowercase+trim before lookup so that "The
 * Godfather", "the godfather", and "THE GODFATHER" all resolve to the same
 * cache entry and the same MongoDB query.
 *
 * Known limitation: two films with the same title but different release years
 * (e.g. "Scarface" 1932 and "Scarface" 1983) cannot be distinguished. Their
 * reviews will be aggregated together. Resolving this would require a shared
 * movie ID across collections, which the current datasets do not have.
 *
 * ── Cache lifetime ───────────────────────────────────────────────────────────
 * Stats keys have no TTL — they persist until Redis is flushed or a title is
 * explicitly deleted. This is intentional: review stats for older films rarely
 * change, and the dataset is append-only (new reviews come in, old ones are
 * not removed). If you add a nightly review import, consider adding a TTL or
 * calling refreshMovieStats() after each import.
 */

import client from '../database/redisClient';
import RottenReview from '../schema/rottenSchema';

const STATS_PREFIX = 'movie:stats:';

/** TTL for stats cache entries (seconds). 24 hours ensures fresh data after
 *  daily review imports while avoiding repeated aggregations within a day. */
const STATS_TTL = 24 * 60 * 60;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MovieStats {
    totalReviews: number;
    freshCount: number;
    rottenCount: number;
    /** Percentage of Fresh reviews, 0–100. Zero when there are no reviews. */
    tomatometer: number;
    topCriticFreshCount: number;
    latestReview: string | null;
}

interface AggregationResult {
    _id: null;
    totalReviews: number;
    freshCount: number;
    rottenCount: number;
    topCriticFresh: number;
    tomatometer: number;
    topCriticFreshCount: number;
    latestReview: Date | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalises a movie title for consistent Redis keys and MongoDB queries.
 * All callers must go through this so "The Godfather" and "the godfather"
 * always resolve to the same cache entry.
 */
function normalise(title: string): string {
    return title.trim().toLowerCase();
}

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Runs the aggregation pipeline against rottenCollection and stores the result
 * in Redis. Called automatically by getMovieStats() on a cache miss.
 *
 * Uses .collation({ locale: 'en', strength: 2 }) so MongoDB resolves the
 * $match via the collation index on rottenCollection (defined in rottenSchema.ts)
 * instead of doing a full collection scan on every call.
 *
 * Why collation instead of $expr + $toLower?
 *   $expr with any computed expression ($toLower, $regexMatch, etc.) completely
 *   disables index usage — every call scanned ALL documents in rottenCollection.
 *   A collation-aware equality match on an indexed field is an O(log n) seek,
 *   which is the difference between ~1ms and ~500ms per title lookup.
 *
 * strength: 2 = case-insensitive + accent-insensitive, so "The Godfather",
 * "the godfather", and "THE GODFATHER" all hit the same index entry.
 */
export async function refreshMovieStats(movieTitle: string): Promise<MovieStats> {
    const normalised = normalise(movieTitle);

    const pipeline = [
        // Plain equality match — case-insensitivity is handled by the collation
        // applied to the whole aggregation call below, not computed inline.
        { $match: { movie_title: normalised } },
        {
            $group: {
                _id: null,
                totalReviews:  { $sum: 1 },
                freshCount:    { $sum: { $cond: [{ $eq: ['$review_type', 'Fresh'] },  1, 0] } },
                rottenCount:   { $sum: { $cond: [{ $eq: ['$review_type', 'Rotten'] }, 1, 0] } },
                topCriticFresh: {
                    $sum: {
                        $cond: [
                            { $and: [{ $eq: ['$review_type', 'Fresh'] }, { $eq: ['$top_critic', true] }] },
                            1, 0
                        ]
                    }
                },
                latestReview: { $max: '$review_date' }
            }
        },
        {
            $project: {
                totalReviews: 1,
                freshCount:   1,
                rottenCount:  1,
                // Tomatometer = (freshCount / totalReviews) * 100, guarded against
                // division by zero when a title has no reviews at all.
                tomatometer: {
                    $round: [
                        {
                            $cond: [
                                { $eq: ['$totalReviews', 0] },
                                0,
                                { $multiply: [{ $divide: ['$freshCount', '$totalReviews'] }, 100] }
                            ]
                        },
                        0
                    ]
                },
                topCriticFreshCount: '$topCriticFresh',
                latestReview: 1
            }
        }
    ];

    // collation must match the index definition in rottenSchema.ts exactly.
    // Without this, MongoDB ignores the collation index and falls back to a full scan.
    const result = await RottenReview.aggregate<AggregationResult>(pipeline)
        .collation({ locale: 'en', strength: 2 });

    // If no reviews exist for this title, return a zero-value stats object.
    // This is a valid state (e.g. a film in oscarCollection that never appeared
    // on Rotten Tomatoes) and should not be treated as an error.
    const raw = result[0] ?? {
        totalReviews: 0,
        freshCount: 0,
        rottenCount: 0,
        tomatometer: 0,
        topCriticFreshCount: 0,
        latestReview: null
    };

    const stats: MovieStats = {
        totalReviews:       raw.totalReviews,
        freshCount:         raw.freshCount,
        rottenCount:        raw.rottenCount,
        tomatometer:        Math.round(raw.tomatometer),
        topCriticFreshCount: raw.topCriticFreshCount,
        latestReview:       raw.latestReview
            ? (raw.latestReview as unknown as Date).toISOString()
            : null
    };

    // Store under the normalised key so future lookups hit regardless of
    // how the caller capitalises the title.
    // Set a 24-hour TTL so stats are refreshed daily after review imports,
    // rather than persisting forever and going stale.
    const key = `${STATS_PREFIX}${normalised}`;
    await client.hSet(key, {
        totalReviews:        stats.totalReviews,
        freshCount:          stats.freshCount,
        rottenCount:         stats.rottenCount,
        tomatometer:         stats.tomatometer,
        topCriticFreshCount: stats.topCriticFreshCount,
        latestReview:        stats.latestReview ?? ''
    });
    await client.expire(key, STATS_TTL);

    return stats;
}

/**
 * Returns stats for a single movie title.
 *
 * Fast path (cache hit):  one Redis HGETALL — sub-millisecond.
 * Slow path (cache miss): MongoDB aggregation + Redis HSET, then cached
 *                         for 24 hours.
 *
 * Always returns a valid MovieStats object — never throws and never returns
 * undefined. If the title has no reviews in rottenCollection, all numeric
 * fields are 0 and latestReview is null.
 */
export async function getMovieStats(movieTitle: string): Promise<MovieStats> {
    const key = `${STATS_PREFIX}${normalise(movieTitle)}`;
    const cached = await client.hGetAll(key);

    if (Object.keys(cached).length > 0) {
        return {
            totalReviews:        Number(cached.totalReviews),
            freshCount:          Number(cached.freshCount),
            rottenCount:         Number(cached.rottenCount),
            tomatometer:         Number(cached.tomatometer),
            topCriticFreshCount: Number(cached.topCriticFreshCount),
            latestReview:        cached.latestReview || null
        };
    }

    return refreshMovieStats(movieTitle);
}

// ─── Batch stats (for popularity enrichment) ─────────────────────────────────

const ZERO_STATS: MovieStats = {
    totalReviews: 0, freshCount: 0, rottenCount: 0,
    tomatometer: 0, topCriticFreshCount: 0, latestReview: null
};

/**
 * Returns stats for MULTIPLE movie titles in one shot.
 *
 * This replaces the old pattern of calling getMovieStats() in a loop,
 * which on a cold cache would fire N separate MongoDB aggregations —
 * one per title. With 100 titles, that's 100 sequential queries.
 *
 * This function:
 *   1. Checks Redis for all titles in a single pipeline (one round-trip).
 *   2. Collects titles that missed the cache.
 *   3. Runs ONE MongoDB aggregation with $match: { movie_title: { $in: [...] } }
 *      grouped by movie_title — resolves all cache misses in a single query.
 *   4. Stores all newly-computed stats back to Redis in a single pipeline.
 *
 * The result: cold-start enrichment of 100 titles goes from ~100 queries
 * to 1 Redis pipeline + 1 MongoDB aggregation + 1 Redis pipeline = 3 ops.
 */
export async function getBatchMovieStats(titles: string[]): Promise<Map<string, MovieStats>> {
    if (!titles.length) return new Map();

    const result = new Map<string, MovieStats>();
    const normalised = titles.map(t => ({ original: t, norm: normalise(t) }));

    // Step 1: Check Redis for all titles in one pipeline
    const redisPipe = client.multi();
    for (const { norm } of normalised) {
        redisPipe.hGetAll(`${STATS_PREFIX}${norm}`);
    }
    const redisResults = await redisPipe.exec();

    // Step 2: Separate cache hits from misses
    const missingTitles: { original: string; norm: string }[] = [];

    for (let i = 0; i < normalised.length; i++) {
        const cached = redisResults[i] as unknown as Record<string, string> | null;
        if (cached && typeof cached === 'object' && Object.keys(cached).length > 0) {
            result.set(normalised[i].original, {
                totalReviews:        Number(cached.totalReviews),
                freshCount:          Number(cached.freshCount),
                rottenCount:         Number(cached.rottenCount),
                tomatometer:         Number(cached.tomatometer),
                topCriticFreshCount: Number(cached.topCriticFreshCount),
                latestReview:        cached.latestReview || null
            });
        } else {
            missingTitles.push(normalised[i]);
        }
    }

    // All titles were cached — nothing to aggregate
    if (missingTitles.length === 0) return result;

    // Step 3: Single MongoDB aggregation for ALL missing titles
    // Uses $in with the collation index for case-insensitive matching,
    // then $group by movie_title to get per-title stats in one pass.
    const missingNorms = missingTitles.map(t => t.norm);

    interface BatchAggResult {
        _id: string;
        totalReviews: number;
        freshCount: number;
        rottenCount: number;
        topCriticFresh: number;
        latestReview: Date | null;
    }

    const pipeline = [
        { $match: { movie_title: { $in: missingNorms } } },
        {
            $group: {
                _id: '$movie_title',
                totalReviews:  { $sum: 1 },
                freshCount:    { $sum: { $cond: [{ $eq: ['$review_type', 'Fresh'] },  1, 0] } },
                rottenCount:   { $sum: { $cond: [{ $eq: ['$review_type', 'Rotten'] }, 1, 0] } },
                topCriticFresh: {
                    $sum: {
                        $cond: [
                            { $and: [{ $eq: ['$review_type', 'Fresh'] }, { $eq: ['$top_critic', true] }] },
                            1, 0
                        ]
                    }
                },
                latestReview: { $max: '$review_date' }
            }
        }
    ];

    const aggResults = await RottenReview.aggregate<BatchAggResult>(pipeline)
        .collation({ locale: 'en', strength: 2 });

    // Build a lookup map from the aggregation results
    const aggMap = new Map<string, BatchAggResult>();
    for (const row of aggResults) {
        aggMap.set(row._id.toLowerCase(), row);
    }

    // Step 4: Store all new stats in Redis in one pipeline
    const storePipe = client.multi();

    for (const { original, norm } of missingTitles) {
        const raw = aggMap.get(norm);
        const stats: MovieStats = raw ? {
            totalReviews:        raw.totalReviews,
            freshCount:          raw.freshCount,
            rottenCount:         raw.rottenCount,
            tomatometer:         raw.totalReviews > 0
                ? Math.round((raw.freshCount / raw.totalReviews) * 100) : 0,
            topCriticFreshCount: raw.topCriticFresh,
            latestReview:        raw.latestReview
                ? (raw.latestReview as unknown as Date).toISOString() : null
        } : { ...ZERO_STATS };

        result.set(original, stats);

        const key = `${STATS_PREFIX}${norm}`;
        storePipe.hSet(key, {
            totalReviews:        stats.totalReviews,
            freshCount:          stats.freshCount,
            rottenCount:         stats.rottenCount,
            tomatometer:         stats.tomatometer,
            topCriticFreshCount: stats.topCriticFreshCount,
            latestReview:        stats.latestReview ?? ''
        });
        storePipe.expire(key, STATS_TTL);
    }

    await storePipe.exec();

    return result;
}
