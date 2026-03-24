/**
 * controller/reviewReadController.ts — Handles read operations on the reviews collection.
 *
 * This controller is intentionally thin — it only handles HTTP concerns:
 *   1. Extract and validate query parameters.
 *   2. Delegate to the review cache service (services/reviewCache.ts).
 *   3. Return the response with the correct status code.
 *
 * All caching, query building, and database access logic lives in
 * services/reviewCache.ts, following the same separation-of-concerns
 * pattern used by the Oscar endpoints (oscarCache.ts).
 */

import { Request, Response } from 'express';
import { extractPagination } from '../utils/pagination';
import { handleError } from '../utils/handler';
import { getCachedReviews } from '../services/reviewCache';

export const getReviews = async (req: Request, res: Response): Promise<void> => {
    try {
        const { page, limit, skip } = extractPagination(req.query);

        const { review_type, top_critic, from_date, to_date, sortBy, movie_title } =
            req.query as Record<string, string | undefined>;

        const result = await getCachedReviews({
            movie_title, review_type, top_critic,
            from_date, to_date, sortBy,
            page, limit, skip
        });

        res.status(result.status).json(result.response);
    } catch (err) {
        const e = err as Error & { status?: number };
        if (e.status === 400)
            res.status(400).json({ success: false, message: e.message });
        else
            handleError(res, e, 'Failed to retrieve reviews');
    }
};
