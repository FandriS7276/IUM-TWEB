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
 *   3. On cache miss: run a single $facet aggregation against MongoDB
 *      (combines data + count in one round-trip), cache the result, return.
 *
 * Cache TTL is 2 minutes — fresh enough for a review site, but eliminates
 * redundant MongoDB queries from rapid page-loads and scroll-throughs.
 */

import { PipelineStage } from 'mongoose';
import RottenReview from '../schema/rottenSchema';
import client from '../database/redisClient';
import { parseSortBy, toMongoSort, MongoSortObject } from '../utils/sortParser';
import { buildPaginatedResponse, emptyPaginatedResponse, PaginatedResponse } from '../utils/pagination';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Redis cache TTL for review queries (seconds). 2 minutes keeps data fresh
 *  while eliminating redundant MongoDB queries from rapid page-loads. */
export const REVIEW_CACHE_TTL = 120;

/** Prefix for review cache keys — makes it easy to flush all review caches
 *  if needed (e.g. after a bulk import) with SCAN + DEL. */
export const CACHE_PREFIX = 'reviews:query:';

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

// ─── Cache key builder ──────────────────────────────────────────────────────

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

// ─── Core query function ────────────────────────────────────────────────────

/**
 * Fetches reviews with Redis caching and a single $facet aggregation.
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

    // ── Single aggregation with $facet ───────────────────────────
    const pipeline: PipelineStage[] = [
        { $match: filter },
        {
            $facet: {
                data: [
                    { $sort: mongoSort },
                    { $skip: skip },
                    { $limit: limit },
                    {
                        $project: {
                            movie_title: 1,
                            review_type: 1,
                            review_date: 1,
                            critic_name: 1,
                            publisher_name: 1,
                            review_content: 1,
                            review_score: 1,
                            _id: 1,
                        }
                    }
                ],
                totalCount: [
                    { $count: 'count' }
                ]
            }
        }
    ];

    const aggregation = RottenReview.aggregate(pipeline);
    if (useCollation) {
        aggregation.collation({ locale: 'en', strength: 2 });
    }

    const [result] = await aggregation;
    const reviews = result.data || [];
    const total = result.totalCount[0]?.count ?? 0;

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
