/**
 * services/reviewCache.ts — Cached review queries, separated from the controller.
 *
 * Follows the same separation-of-concerns pattern as oscarCache.ts:
 *   Controller → handles HTTP (parsing params, setting status codes)
 *   Service    → handles query building, caching, database access
 *
 * Architecture:
 *   1. Build a deterministic Redis cache key from all filter/sort/page params.
 *   2. On cache hit: return the cached JSON (sub-millisecond).
 *   3. On cache miss: run the data query and count query in parallel, then
 *      cache the result and return.
 *
 * Count strategy (the key performance decision):
 *   - No filters → estimatedDocumentCount(), cached 10 min. O(1) metadata read.
 *   - With filters → countDocuments(filter), cached 5 min per unique filter set.
 *   Running these separately (not inside $facet) means a slow count never
 *   blocks the page data from returning, and counts are cached independently
 *   so subsequent pages of the same filter reuse the count without re-querying.
 *
 * Cache TTL is 2 minutes — fresh enough for a review site, but eliminates
 * redundant MongoDB queries from rapid page-loads and scroll-throughs.
 */

import RottenReview from '../schema/rottenSchema';
import client from '../database/redisClient';
import { parseSortBy, toMongoSort, MongoSortObject } from '../utils/sortParser';
import { buildPaginatedResponse, emptyPaginatedResponse, PaginatedResponse } from '../utils/pagination';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Redis cache TTL for review queries (seconds). 2 minutes keeps data fresh
 *  while eliminating redundant MongoDB queries from rapid page-loads. */
export const REVIEW_CACHE_TTL = 120;

/** TTL for the unfiltered total count (seconds). The total doc count changes
 *  slowly (only on new review submissions), so 10 min is safe. */
const TOTAL_COUNT_TTL = 600;

/** TTL for filtered counts (seconds). Filters can match fewer docs, and
 *  new reviews could shift the count, so 5 min is a reasonable compromise. */
const FILTERED_COUNT_TTL = 300;

/** Prefix for review cache keys — makes it easy to flush all review caches
 *  if needed (e.g. after a bulk import) with SCAN + DEL. */
export const CACHE_PREFIX = 'reviews:query:';

/** Separate prefix for count-only cache entries so they can be managed
 *  (and flushed) independently from paginated data keys. */
const COUNT_PREFIX = 'reviews:count:';

/** Only these fields may be used for sorting */
const ALLOWED_SORT_FIELDS = ['review_date', 'review_score', 'review_type'];

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ReviewQueryParams {
    movie_title?: string;
    review_type?: string;
    top_critic?: string;
    from_date?: string;
    to_date?: string;
    sortBy?: string;
    page: number;
    limit: number;
    skip: number;
}

export interface ReviewQueryResult {
    response: PaginatedResponse;
    status: number;
    error?: string;
}

// ─── Cache key builders ──────────────────────────────────────────────────────

/**
 * Builds a deterministic cache key from the query parameters.
 * Same filters + sort + page always produce the same key.
 */
export function buildCacheKey(params: ReviewQueryParams): string {
    const parts = [
        params.movie_title || '',
        params.review_type || '',
        params.top_critic  || '',
        params.from_date   || '',
        params.to_date     || '',
        params.sortBy      || 'review_date-desc',
        String(params.page),
        String(params.limit),
    ];
    return `${CACHE_PREFIX}${parts.join(':')}`;
}

/**
 * Builds a cache key for a count-only entry (no page/sort — counts are
 * page-independent and sort-independent, so the key only encodes the filter).
 */
function buildCountKey(params: Pick<ReviewQueryParams, 'movie_title' | 'review_type' | 'top_critic' | 'from_date' | 'to_date'>): string {
    const parts = [
        params.movie_title || '',
        params.review_type || '',
        params.top_critic  || '',
        params.from_date   || '',
        params.to_date     || '',
    ];
    return `${COUNT_PREFIX}${parts.join(':')}`;
}

// ─── Count helper ────────────────────────────────────────────────────────────

/**
 * Returns the total document count for the given filter, using Redis as a
 * cache layer to avoid re-running expensive countDocuments() on every request.
 *
 * Strategy:
 *   - Empty filter → estimatedDocumentCount() (O(1) metadata read, 10 min TTL)
 *   - With filter  → countDocuments(filter) with collation if needed (5 min TTL)
 *
 * Both paths write back to Redis so subsequent pages of the same filter
 * get the count from cache without touching MongoDB.
 */
async function getCachedCount(
    filter: Record<string, unknown>,
    params: Pick<ReviewQueryParams, 'movie_title' | 'review_type' | 'top_critic' | 'from_date' | 'to_date'>,
    useCollation: boolean
): Promise<number> {
    const countKey = buildCountKey(params);

    const cached = await client.get(countKey);
    if (cached !== null) return Number(cached);

    const isUnfiltered = Object.keys(filter).length === 0;

    let total: number;
    if (isUnfiltered) {
        // estimatedDocumentCount reads collection metadata — effectively O(1).
        // It may be slightly off if documents were recently inserted/deleted,
        // but for a paginated feed this is an acceptable trade-off.
        total = await RottenReview.estimatedDocumentCount();
        client.setEx(countKey, TOTAL_COUNT_TTL, String(total)).catch(() => {});
    } else {
        const countQuery = RottenReview.countDocuments(filter);
        if (useCollation) countQuery.collation({ locale: 'en', strength: 2 });
        total = await countQuery;
        client.setEx(countKey, FILTERED_COUNT_TTL, String(total)).catch(() => {});
    }

    return total;
}

// ─── Core query function ────────────────────────────────────────────────────

/**
 * Fetches reviews with Redis caching. Data query and count query are run in
 * parallel so a slow count never blocks the page data.
 *
 * Count strategy:
 *   - No active filters → estimatedDocumentCount() (O(1), 10 min cache)
 *   - With filters      → countDocuments(filter) (5 min cache, keyed by filter only,
 *                         so pages 2, 3, 4… of the same filter reuse the same count)
 *
 * Returns a ReviewQueryResult with:
 *   - status: HTTP status code (200 or 400)
 *   - response: the paginated response JSON
 *   - error: validation error message (only when status=400)
 *
 * The caller (controller) just needs to do:
 *   const result = await getCachedReviews(params);
 *   res.status(result.status).json(result.response);
 */
export async function getCachedReviews(params: ReviewQueryParams): Promise<ReviewQueryResult> {
    const { page, limit, skip, movie_title, review_type, top_critic, from_date, to_date, sortBy } = params;

    // ── Check Redis cache first ──────────────────────────────────
    const cacheKey = buildCacheKey(params);

    const cached = await client.get(cacheKey);
    if (cached) {
        return { status: 200, response: JSON.parse(cached) };
    }

    // ── Build filter ─────────────────────────────────────────────
    const filter: Record<string, unknown> = {};
    let mongoSort: MongoSortObject = { review_date: -1 };
    let useCollation = false;

    if (movie_title) {
        const trimmed = movie_title.trim();
        if (!trimmed) {
            return {
                status: 400,
                response: { success: false, message: 'movie_title cannot be blank' } as unknown as PaginatedResponse
            };
        }
        if (trimmed.length > 200) {
            return {
                status: 400,
                response: { success: false, message: 'movie_title exceeds maximum length of 200 characters' } as unknown as PaginatedResponse
            };
        }
        // Plain equality match — case-insensitivity handled by collation
        filter.movie_title = trimmed;
        useCollation = true;
    }

    if (review_type) {
        if (!['Fresh', 'Rotten'].includes(review_type)) {
            return {
                status: 400,
                response: { success: false, message: 'Invalid review_type filter' } as unknown as PaginatedResponse
            };
        }
        filter.review_type = review_type as 'Fresh' | 'Rotten';
    }

    if (top_critic !== undefined) {
        filter.top_critic = top_critic === 'true';
    }

    if (from_date || to_date) {
        const dateFilter: Record<string, Date> = {};
        if (from_date) {
            const from = new Date(from_date);
            if (!isNaN(from.getTime())) dateFilter.$gte = from;
        }
        if (to_date) {
            const to = new Date(to_date);
            if (!isNaN(to.getTime())) dateFilter.$lte = to;
        }
        if (Object.keys(dateFilter).length > 0) filter.review_date = dateFilter;
    }

    // ── Sort ─────────────────────────────────────────────────────
    if (sortBy) {
        try {
            mongoSort = toMongoSort(parseSortBy(sortBy, ALLOWED_SORT_FIELDS));
        } catch (err) {
            return {
                status: 400,
                response: {
                    success: false,
                    message: (err as Error).message,
                    example: 'review_date-desc,review_score-asc'
                } as unknown as PaginatedResponse
            };
        }
    }

    // ── Data query + count in parallel ───────────────────────────
    //
    // Previously this was a single $facet aggregation. The problem: $facet's
    // $count branch scans every matched document even when the data branch only
    // needs `limit` of them. On the unfiltered "all reviews" route this meant a
    // full collection scan (~900k docs) on every cache miss — hence 5+ seconds.
    //
    // Now we run two independent queries concurrently via Promise.all():
    //   1. data query — fast index scan, returns only `limit` documents
    //   2. count      — getCachedCount() uses estimatedDocumentCount() when
    //                   unfiltered (O(1)), or countDocuments(filter) with its
    //                   own Redis cache when filtered.
    //
    // Both results arrive together. If the count is already in Redis (e.g.
    // page 2 of the same filter), the count promise resolves in ~1ms from cache.

    const dataQuery = RottenReview.find(filter)
        .sort(mongoSort as any)
        .skip(skip)
        .limit(limit)
        .select('movie_title review_type review_date critic_name publisher_name review_content review_score _id')
        .lean();

    if (useCollation) {
        dataQuery.collation({ locale: 'en', strength: 2 });
    }

    const [reviews, total] = await Promise.all([
        dataQuery,
        getCachedCount(filter, { movie_title, review_type, top_critic, from_date, to_date }, useCollation),
    ]);

    if (reviews.length === 0) {
        const response = emptyPaginatedResponse(limit);
        // Cache empty results too — prevents repeated queries for
        // non-existent titles from hitting MongoDB every time.
        await client.setEx(cacheKey, REVIEW_CACHE_TTL, JSON.stringify(response));
        return { status: 200, response };
    }

    const response = buildPaginatedResponse(reviews, total, page, limit, {
        appliedFilters: { movie_title, review_type, top_critic, from_date, to_date },
        appliedSort:    sortBy || 'review_date-desc'
    });

    // ── Cache the response in Redis ──────────────────────────────
    await client.setEx(cacheKey, REVIEW_CACHE_TTL, JSON.stringify(response));

    return { status: 200, response };
}
