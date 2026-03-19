/**
 * controller/reviewReadController.ts — Handles read operations on the reviews collection.
 *
 * Exposes a single endpoint (`getReviews`) that supports optional filtering by
 * review type, top-critic status, and date range, plus sorting and pagination.
 * All query parameters are validated before reaching the database — invalid
 * inputs return a 400 with a descriptive message rather than a Mongo error.
 *
 * `.lean()` is used on the query so Mongoose returns plain JS objects instead
 * of full Document instances — faster and lower memory when we only need to
 * read fields, not call save() or other document methods.
 */

import { Request, Response } from 'express';
import RottenReview from '../schema/rottenSchema';
import { extractPagination, buildPaginatedResponse, emptyPaginatedResponse } from '../utils/pagination';
import { handleError } from '../utils/handler';
import { parseSortBy, toMongoSort, MongoSortObject } from '../utils/sortParser';

// Only these fields may be used for sorting — prevents clients from sorting
// by internal fields like _id or by fields not covered by an index
const ALLOWED_SORT_FIELDS = ['review_date', 'review_score', 'review_type'];

export const getReviews = async (req: Request, res: Response): Promise<void> => {
    try {
        const { page, limit, skip } = extractPagination(req.query);

        const { review_type, top_critic, from_date, to_date, sortBy, movie_title } =
            req.query as Record<string, string | undefined>;

        const filter: Record<string, unknown> = {};
        let mongoSort: MongoSortObject = { review_date: -1 };  // Default: newest first

        // ── Filters ──────────────────────────────────────────────────────────

        if (movie_title) {
            // ── Input hardening ───────────────────────────────────────────────
            // Reject blank-after-trim or suspiciously long titles before they
            // reach the database. Real movie titles are well under 200 characters;
            // anything longer is either malformed input or a probing attempt.
            const trimmed = movie_title.trim();
            if (!trimmed) {
                res.status(400).json({ success: false, message: 'movie_title cannot be blank' });
                return;
            }
            if (trimmed.length > 200) {
                res.status(400).json({ success: false, message: 'movie_title exceeds maximum length of 200 characters' });
                return;
            }

            // Escape all special regex metacharacters so user input is treated
            // as a literal string, not a regex pattern (prevents ReDoS).
            // The `^...$` anchors enforce exact match so "Alien" doesn't also
            // return "Aliens". The index on movie_title handles the O(log n) lookup.
            const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            filter.movie_title = { $regex: new RegExp(`^${escaped}$`, 'i') };
        }

        if (review_type) {
            if (!['Fresh', 'Rotten'].includes(review_type)) {
                res.status(400).json({ success: false, message: 'Invalid review_type filter' });
                return;
            }
            filter.review_type = review_type as 'Fresh' | 'Rotten';
        }

        if (top_critic !== undefined) {
            // Coerce the string "true"/"false" from the query string to a boolean
            filter.top_critic = top_critic === 'true';
        }

        if (from_date || to_date) {
            const dateFilter: Record<string, Date> = {};
            if (from_date) {
                const from = new Date(from_date);
                // new Date() doesn't throw on invalid strings — check explicitly
                if (!isNaN(from.getTime())) dateFilter.$gte = from;
            }
            if (to_date) {
                const to = new Date(to_date);
                if (!isNaN(to.getTime())) dateFilter.$lte = to;
            }
            if (Object.keys(dateFilter).length > 0) filter.review_date = dateFilter;
        }

        // ── Sort ─────────────────────────────────────────────────────────────

        if (sortBy) {
            try {
                mongoSort = toMongoSort(parseSortBy(sortBy, ALLOWED_SORT_FIELDS));
            } catch (err) {
                res.status(400).json({
                    success: false,
                    message: (err as Error).message,
                    example: 'review_date-desc,review_score-asc'
                });
                return;
            }
        }

        // ── Query ─────────────────────────────────────────────────────────────

        const reviews = await RottenReview
            .find(filter)
            .sort(mongoSort)
            .skip(skip)
            .limit(limit)
            .lean()
            // Only return the fields the frontend actually needs — excludes internal
            // fields like __v and keeps the response payload small
            .select('movie_title review_type review_date critic_name publisher_name review_content review_score');

        // Early-exit before running countDocuments (an extra DB round-trip) when empty
        if (reviews.length === 0) {
            res.status(200).json(emptyPaginatedResponse(limit));
            return;
        }

        const total = await RottenReview.countDocuments(filter);

        res.status(200).json(buildPaginatedResponse(reviews, total, page, limit, {
            appliedFilters: { movie_title, review_type, top_critic, from_date, to_date },
            appliedSort:    sortBy || 'review_date-desc'
        }));
    } catch (err) {
        const e = err as Error & { status?: number };
        if (e.status === 400)
            res.status(400).json({ success: false, message: e.message });
        else
            handleError(res, e, 'Failed to retrieve reviews');
    }
};
