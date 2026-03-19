import { Request, Response } from 'express';
import { PipelineStage } from 'mongoose';
import OscarModel from '../schema/oscarSchema';
import { extractPagination, buildPaginatedResponse, emptyPaginatedResponse } from '../utils/pagination';
import { handleError } from '../utils/handler';
import { validateCategory } from '../utils/validation';
import { parseSortBy, toInMemoryComparator } from '../utils/sortParser';
import { getOscarsCacheKey, CACHE_TTL_SECONDS } from '../services/oscarCache';
import { getSnubbedTitles } from '../services/snubbedCache';
import { enrichWithStats, EnrichedMovie } from '../utils/enrichment';
import client from '../database/redisClient';

const ALLOWED_OSCAR_SORT_FIELDS = [
    'winsCount',
    'totalNominations',
    'year_film',
    'film'
];

interface OscarGrouped {
    film: string;
    year_film: number;
    winsCount: number;
    totalNominations: number;
    awards: Array<{
        category: string;
        year_ceremony: number;
        name: string;
        winner: boolean;
        ceremony: number;
    }>;
}

// Get all oscars awards or filtered
export const getAllOscars = async (req: Request, res: Response): Promise<void> => {
    try {
        const { page, limit, skip } = extractPagination(req.query);

        const { year_ceremony, category, winner, from_date, to_date, sortBy } = req.query as Record<string, string | undefined>;
        const filter: Record<string, unknown> = {};

        if (year_ceremony) {
            const year = Number(year_ceremony);
            if (isNaN(year) || year < 1929 || year > new Date().getFullYear()) {
                res.status(400).json({ success: false, message: 'Invalid year_ceremony: must be a valid year' });
                return;
            }
            filter.year_ceremony = year;
        }

        if (category) {
            try {
                filter.category = validateCategory(category);
            } catch (err) {
                res.status(400).json({ success: false, message: (err as Error).message });
                return;
            }
        }

        if (winner !== undefined) {
            filter.winner = winner === 'true';
        }

        if (from_date || to_date) {
            const yearFilter: Record<string, number> = {};
            if (from_date) {
                const from = Number(from_date);
                if (!isNaN(from)) yearFilter.$gte = from;
            }
            if (to_date) {
                const to = Number(to_date);
                if (!isNaN(to)) yearFilter.$lte = to;
            }
            if (Object.keys(yearFilter).length > 0) {
                filter.year_film = yearFilter;
            }
        }

        // Try cache after validation
        const cacheKey = getOscarsCacheKey(req.query);
        let groupedData: OscarGrouped[] | null = null;
        const cached = await client.get(cacheKey);
        if (cached) {
            groupedData = JSON.parse(cached) as OscarGrouped[];
        } else {
            const pipeline = [
                { $match: filter },
                {
                    $group: {
                        _id: { film: '$film', year_film: '$year_film' },
                        awards: {
                            $push: {
                                category: '$category',
                                year_ceremony: '$year_ceremony',
                                name: '$name',
                                winner: '$winner',
                                ceremony: '$ceremony'
                            }
                        },
                        winsCount: { $sum: { $cond: [{ $eq: ['$winner', true] }, 1, 0] } },
                        totalNominations: { $sum: 1 }
                    }
                },
                {
                    $set: {
                        awards: {
                            $sortArray: {
                                input: '$awards',
                                sortBy: { winner: -1, year_ceremony: -1, ceremony: -1 }
                            }
                        }
                    }
                },
                { $sort: { year_ceremony: -1 as const, film: 1 as const } }
            ] as PipelineStage[];

            const results = await OscarModel.aggregate(pipeline);

            if (results.length === 0) {
                res.json(emptyPaginatedResponse(limit));
                return;
            }

            groupedData = results.map(r => ({
                film: r._id.film,
                year_film: r._id.year_film,
                winsCount: r.winsCount,
                totalNominations: r.totalNominations,
                awards: r.awards
            }));

            await client.set(cacheKey, JSON.stringify(groupedData), { EX: CACHE_TTL_SECONDS });
        }

        let formatted = [...groupedData];

        if (sortBy) {
            try {
                const specs = parseSortBy(sortBy, ALLOWED_OSCAR_SORT_FIELDS);
                const comparator = toInMemoryComparator(specs);
                formatted.sort((a, b) => {
                    const primary = comparator(a as unknown as Record<string, unknown>, b as unknown as Record<string, unknown>);
                    return primary !== 0 ? primary : a.film.localeCompare(b.film);
                });
            } catch (err) {
                res.status(400).json({
                    success: false,
                    message: (err as Error).message,
                    example: 'winsCount-desc,year_film-asc'
                });
                return;
            }
        }

        const total = formatted.length;
        const paginated = formatted.slice(skip, skip + limit);

        res.json(
            buildPaginatedResponse(paginated, total, page, limit, {
                appliedFilters: req.query,
                appliedSort: sortBy || 'year_ceremony-desc, film-asc',
                note: 'Awards are pre-sorted: wins first, then newest ceremony'
            })
        );
    } catch (err) {
        handleError(res, err as Error & { status?: number }, 'Failed to retrieve Oscars');
    }
};

// ─── Controversial winners ────────────────────────────────────────────────────

/**
 * Oscar winners that also have Rotten reviews — sorted by rotten review count.
 * Cached for 1 hour because Rotten Tomatoes reviews change more frequently
 * than Oscar data.
 */
const CONTROVERSIAL_CACHE_KEY = 'oscars:controversial';
const CONTROVERSIAL_CACHE_TTL = 60 * 60; // 1 hour

export const getControversialOscarWinners = async (req: Request, res: Response): Promise<void> => {
    try {
        const cached = await client.get(CONTROVERSIAL_CACHE_KEY);
        if (cached) {
            res.json(JSON.parse(cached));
            return;
        }

        const controversial = await OscarModel.aggregate([
            { $match: { winner: true } },
            {
                $lookup: {
                    from: 'rottenCollection',
                    let: { filmTitle: { $toLower: '$film' } },
                    pipeline: [
                        { $match: { $expr: { $eq: [{ $toLower: '$movie_title' }, '$$filmTitle'] } } },
                        { $match: { review_type: 'Rotten' } },
                        { $limit: 5 }
                    ],
                    as: 'rotten_reviews'
                }
            },
            { $match: { 'rotten_reviews.0': { $exists: true } } },
            { $addFields: { rotten_count: { $size: '$rotten_reviews' } } },
            { $sort: { rotten_count: -1 } },
            { $limit: 20 },
            {
                $project: {
                    year: '$year_film',
                    category: 1,
                    film: 1,
                    winner: 1,
                    rotten_reviews: {
                        $map: {
                            input: '$rotten_reviews',
                            as: 'r',
                            in: { title: '$$r.movie_title', score: '$$r.review_score', content: '$$r.review_content' }
                        }
                    }
                }
            }
        ]);

        const response = {
            success: true,
            data: controversial,
            metadata: { fetchedAt: new Date().toISOString(), resultCount: controversial.length }
        };

        // Only cache non-empty results — caching an empty response would lock out
        // real data until TTL expires if the aggregation ran before data was ready.
        if (controversial.length > 0) {
            await client.set(CONTROVERSIAL_CACHE_KEY, JSON.stringify(response), { EX: CONTROVERSIAL_CACHE_TTL });
        }
        res.json(response);
    } catch (err) {
        handleError(res, err as Error & { status?: number }, 'Failed to retrieve controversial winners');
    }
};

// ─── Never-winning nominees ───────────────────────────────────────────────────

interface NominatedMovie {
    film: string;
    nominations: number;
    stats: EnrichedMovie['stats'];
}

/**
 * Oscar-nominated films that never won a single award, sorted by nomination
 * count descending. Uses a $group aggregation so each film's total nomination
 * count is available in the response.
 *
 * The full enriched list is cached for 90 days alongside the Oscar query cache
 * — Oscar data only changes once a year so there is no need to re-fetch sooner.
 * Pagination is applied in memory from the cached array.
 */
const NOMINATED_CACHE_KEY = 'nominated:homepage:sorted';

export const getMostNominatedMovies = async (req: Request, res: Response): Promise<void> => {
    try {
        const { page, limit, skip } = extractPagination(req.query);

        let allData: NominatedMovie[] | null = null;

        const cached = await client.get(NOMINATED_CACHE_KEY);
        if (cached) {
            allData = JSON.parse(cached) as NominatedMovie[];
        } else {
            // Group every Oscar record by film title.
            // wins counts records where winner === true; films with wins > 0 are excluded.
            const results = await OscarModel.aggregate([
                {
                    $group: {
                        _id: '$film',
                        nominations: { $sum: 1 },
                        wins: { $sum: { $cond: [{ $eq: ['$winner', true] }, 1, 0] } }
                    }
                },
                { $match: { wins: 0 } },
                { $sort: { nominations: -1 } }
            ]);

            if (results.length === 0) {
                res.json(emptyPaginatedResponse(limit));
                return;
            }

            const titles = results.map((r: { _id: string }) => r._id);
            const enriched = await enrichWithStats(titles);

            allData = results.map((r: { _id: string; nominations: number }, i: number) => ({
                film: r._id,
                nominations: r.nominations,
                stats: enriched[i].stats
            }));

            // Only persist non-empty results to avoid caching a cold-start miss
            if (allData.length > 0) {
                await client.set(NOMINATED_CACHE_KEY, JSON.stringify(allData), { EX: CACHE_TTL_SECONDS });
            }
        }

        const total = allData.length;
        const paginated = allData.slice(skip, skip + limit);

        res.json(
            buildPaginatedResponse(paginated, total, page, limit, {
                note: 'Sorted by nomination count descending'
            })
        );
    } catch (err) {
        handleError(res, err as Error & { status?: number }, 'Failed to retrieve never-winning nominees');
    }
};

// ─── Snubbed movies ───────────────────────────────────────────────────────────

/**
 * Movies with at least one Fresh Rotten Tomatoes review that never won an Oscar
 * — "critically loved but Oscar-snubbed". Sorted by tomatometer descending.
 *
 * Title list comes from the Redis set maintained by snubbedCache. The full
 * enriched result is cached for 90 days (same reasoning as the nominated cache).
 * Pagination is applied in memory from the cached array.
 */
const SNUBBED_CACHE_KEY = 'snubbed:homepage:sorted';

export const getSnubbedMovies = async (req: Request, res: Response): Promise<void> => {
    try {
        const { page, limit, skip } = extractPagination(req.query);

        let allData: EnrichedMovie[] | null = null;

        const cached = await client.get(SNUBBED_CACHE_KEY);
        if (cached) {
            allData = JSON.parse(cached) as EnrichedMovie[];
        } else {
            const titles = await getSnubbedTitles();
            if (titles.length === 0) {
                res.json(emptyPaginatedResponse(limit));
                return;
            }

            const enriched = await enrichWithStats(titles);
            // Sort highest tomatometer first so the most acclaimed snubbed films come first
            enriched.sort((a, b) => b.stats.tomatometer - a.stats.tomatometer);
            allData = enriched;

            // Only persist non-empty results to avoid caching a cold-start miss
            if (allData.length > 0) {
                await client.set(SNUBBED_CACHE_KEY, JSON.stringify(allData), { EX: CACHE_TTL_SECONDS });
            }
        }

        const total = allData.length;
        const paginated = allData.slice(skip, skip + limit);

        res.json(
            buildPaginatedResponse(paginated, total, page, limit, {
                note: 'Sorted by tomatometer descending'
            })
        );
    } catch (err) {
        handleError(res, err as Error & { status?: number }, 'Failed to retrieve snubbed movies');
    }
};
