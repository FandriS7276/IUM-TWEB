/**
 * utils/pagination.ts — Reusable pagination helpers for all list endpoints.
 *
 * Every list endpoint (reviews, oscars, popular movies, etc.) should use these
 * helpers so pagination logic is consistent and validated in one place.
 *
 * Flow:
 *   1. `extractPagination(req.query)` — validates page/limit from the query string
 *      and returns { page, limit, skip } ready for .skip()/.limit() in Mongo queries.
 *   2. After fetching, wrap results with `buildPaginatedResponse(...)` or return
 *      `emptyPaginatedResponse()` if nothing was found.
 */

// ParsedQs is the type Express gives to req.query — values can be strings,
// arrays, or nested objects depending on how the URL was encoded
import { ParsedQs } from 'qs';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PaginationParams {
    page: number;
    limit: number;
    skip: number;   // Pre-computed offset: (page - 1) * limit
}

export interface PaginationMeta {
    totalDocs: number;
    currentPage: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
    perPage: number;
}

/**
 * Generic paginated response shape returned by all list endpoints.
 * `T` is the item type (e.g. IOscarDocument, EnrichedMovie).
 */
export interface PaginatedResponse<T = unknown> {
    success: boolean;
    data: T[];
    pagination: PaginationMeta;
    metadata: {
        fetchedAt: string;
        resultCount: number;
        [key: string]: unknown;   // Extra fields passed via extraMetadata
    };
}

// ─── Functions ───────────────────────────────────────────────────────────────

/**
 * Extracts and validates `page` and `limit` from req.query.
 * Throws a 400 error (with `.status = 400`) if values are out of range,
 * so controllers can catch it and return a proper validation error.
 *
 * @param query        - req.query from Express
 * @param defaultLimit - Items per page when `limit` is not provided (default 20)
 * @param maxLimit     - Hard cap to prevent clients from requesting huge pages (default 500)
 */
export function extractPagination(
    query: ParsedQs,
    defaultLimit = 20,
    maxLimit = 500
): PaginationParams {
    const rawPage  = query.page  !== undefined ? Number(query.page)  : 1;
    const rawLimit = query.limit !== undefined ? Number(query.limit) : defaultLimit;

    // Validate before doing any math — NaN, negatives, and oversized limits all fail here
    if (
        isNaN(rawPage)  ||
        isNaN(rawLimit) ||
        rawPage  < 1    ||
        rawLimit < 1    ||
        rawLimit > maxLimit
    ) {
        const error = Object.assign(
            new Error(`Invalid pagination: page must be >= 1, limit must be between 1 and ${maxLimit}`),
            { status: 400 }
        );
        throw error;
    }

    const page  = Math.floor(rawPage);
    const limit = Math.floor(rawLimit);
    const skip  = (page - 1) * limit;

    return { page, limit, skip };
}

/**
 * Returns an empty paginated response for when no documents match the query.
 * Avoids running a countDocuments() call when the data array is already empty.
 */
export function emptyPaginatedResponse(limit = 20): PaginatedResponse<never> {
    return {
        success: true,
        data: [],
        pagination: {
            totalDocs: 0,
            currentPage: 1,
            totalPages: 0,
            hasNext: false,
            hasPrev: false,
            perPage: limit
        },
        metadata: {
            fetchedAt: new Date().toISOString(),
            resultCount: 0
        }
    };
}

/**
 * Builds the standard paginated response object.
 *
 * @param data          - The current page of items
 * @param totalDocs     - Total matching documents (used to compute totalPages / hasNext)
 * @param page          - Current page number
 * @param limit         - Items per page
 * @param extraMetadata - Any extra fields to include in the `metadata` block
 *                        (e.g. appliedFilters, appliedSort)
 */
export function buildPaginatedResponse<T>(
    data: T[],
    totalDocs: number,
    page: number,
    limit: number,
    extraMetadata: Record<string, unknown> = {}
): PaginatedResponse<T> {
    return {
        success: true,
        data,
        pagination: {
            totalDocs,
            currentPage: page,
            totalPages: Math.ceil(totalDocs / limit),
            hasNext:  page * limit < totalDocs,
            hasPrev:  page > 1,
            perPage:  limit
        },
        metadata: {
            fetchedAt:   new Date().toISOString(),
            resultCount: data.length,
            ...extraMetadata
        }
    };
}
