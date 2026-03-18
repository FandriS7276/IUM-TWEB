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
 * The $match uses $expr + $toLower so the lookup is case-insensitive even if
 * movie_title values in the database have inconsistent capitalisation.
 * Trade-off: $expr prevents MongoDB from using a standard index on movie_title.
 * This is acceptable because results are cached in Redis and this pipeline only
 * runs on a cache miss (typically once per title per server lifecycle).
 */
export async function refreshMovieStats(movieTitle: string): Promise<MovieStats> {
    const normalised = normalise(movieTitle);

    const pipeline = [
        // Case-insensitive match: compares stored titles as lowercase against
        // the already-lowercase normalised title.
        { $match: { $expr: { $eq: [{ $toLower: '$movie_title' }, normalised] } } },
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
                    $cond: [
                        { $eq: ['$totalReviews', 0] },
                        0,
                        { $multiply: [{ $divide: ['$freshCount', '$totalReviews'] }, 100] }
                    ]
                },
                topCriticFreshCount: '$topCriticFresh',
                latestReview: 1
            }
        }
    ];

    const result = await RottenReview.aggregate<AggregationResult>(pipeline);

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
        tomatometer:        raw.tomatometer,
        topCriticFreshCount: raw.topCriticFreshCount,
        latestReview:       raw.latestReview
            ? (raw.latestReview as unknown as Date).toISOString()
            : null
    };

    // Store under the normalised key so future lookups hit regardless of
    // how the caller capitalises the title.
    const key = `${STATS_PREFIX}${normalised}`;
    await client.hSet(key, {
        totalReviews:        stats.totalReviews,
        freshCount:          stats.freshCount,
        rottenCount:         stats.rottenCount,
        tomatometer:         stats.tomatometer,
        topCriticFreshCount: stats.topCriticFreshCount,
        latestReview:        stats.latestReview ?? ''
    });

    return stats;
}

/**
 * Returns stats for a single movie title.
 *
 * Fast path (cache hit):  one Redis HGETALL — sub-millisecond.
 * Slow path (cache miss): MongoDB aggregation + Redis HSET, then cached
 *                         permanently until the server is restarted or the
 *                         key is manually evicted.
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
