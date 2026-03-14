const oscar = require('../schema/oscarSchema')
const { extractPagination, buildPaginatedResponse, emptyPaginatedResponse } = require('../utils/pagination');
const { getMovieStats } = require('../services/statsCache');
const { handleError } = require('../utils/handler');
const { validateCategory } = require('../utils/validation');
const { buildMongoSort } = require('../utils/sortParser');


//Get all oscars awards or filtered
exports.getAllOscars = async (req, res) => {
    try {
        const { page, limit, skip } = extractPagination(req.query);

        // Build safe filter from query params
        const { year_ceremony, category, winner, from_date, to_date, sortBy } = req.query;
        const filter = {};

        // Validate and add filters
        if (year_ceremony) {
            const year = Number(year_ceremony);
            if (isNaN(year) || year < 1929 || year > new Date().getFullYear()) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid year_film: must be a valid year'
                });
            }
            filter.year_ceremony = year;
        }
        
        if (category) {
            try {
                filter.category = validateCategory(category); // throws if invalid
            }
            catch (err) {
                return res.status(400).json({
                    success: false,
                    message: err.message
                });
            }
        }

        if (winner !== undefined) {
            const isWinner = winner === 'true' || winner === true;
            filter.winner = isWinner;
        }

        if (from_date || to_date) {
            filter.year_film = {};
            if (from_date) {
                const from = new Number(from_date);
                if (!isNaN(from))
                    filter.year_film.$gte = from;
            }
            if (to_date) {
                const to = new Number(to_date);
                if (!isNaN(to))
                    filter.year_film.$lte = to;
            }
            if (Object.keys(filter.year_film).length === 0) {
                delete filter.year_film; // Remove if no valid dates
            }
        }

        let sort;
        try {
            sort = buildMongoSort({
                sortByQuery: req.query.sortBy,
                validFieldsMap: {
                year: 'year_film',
                ceremony: 'year_ceremony',
                category: 'category',
                film: 'film',
                name: 'name',
                winner: 'winner'
                },
                defaultDirection: {
                year: 'desc',
                ceremony: 'desc',
                category: 'asc',
                film: 'asc',
                name: 'asc',
                winner: 'desc'
                },
                defaultSort: { year_ceremony: -1, film: 1 },
                addIdTieBreaker: true,
            });
        }
        catch (err) {
            return res.status(400).json({
                success: false,
                message: err.message,
            });
        }
        const oscars = await oscar
            .find(filter)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .lean();
        
        // Early return if nothing found
        if (oscars.length === 0) {
            return res.json(emptyPaginatedResponse(limit));
        }

        const total = await oscar.countDocuments(filter);

        // Lazy stats only for the films in this page (fast)
        const uniqueFilms = [...new Set(oscars.map(a => a.film))];
        const enrichedFilms = await enrichedWithStats(uniqueFilms);

        const statsMap = {};
        await Promise.all(uniqueFilms.map(async title => {
            statsMap[title] = await getMovieStats(title);
        }));


        const data = oscars.map(award => ({
            ...award,
            stats: statsMap[award.film] || { tomatometer: 0, freshCount: 0, totalReviews: 0 }
        }));

        res.json(buildPaginatedResponse(data, total, page, limit));
    }
    catch (err) {
        handleError(res, err, 'Failed to retrieve Oscars')
    }
};
/*
// neverWinningNominees
exports.getNominatedMovies = async (req, res) => {
    try {
        const { page, limit, skip } = extractPagination(req.query);

        const titles = await getNominatedTitles(); // Get all nominated-but-not-winning movie titles from Redis set

        if (titles.length === 0) {
            return res.status(200).json({
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
                    resultCount: 0,
                }
            });
        }

        const allStats = await getAllStats(); // Get stats for all movies from Redis (or compute if not cached)

        const  enriched = titles
            .map(title => allStats[title]) // Enrich the titles with their stats (freshCount, tomatometer, etc.)
            .filter(stat => stat !== null) // Filter out any titles that didn't have stats (shouldn't happen if cache is consistent)
            .sort((a, b) => b.freshCount - a.freshCount); // Sort by freshCount desc (most loved first)
    }
    catch (err) {
        handleError(res, err, 'Failed to nominated movies')
    }
};

const { getSnubbedTitles } = require('../services/snubbedCache');
const { getAllStats } = require('../services/statsCache');

//Shows the most loved movies that have not won an oscar
exports.getSnubbedMovies = async (req, res) => {
    try {
        const { page, limit, skip } = extractPagination(req.query);

        const titles = await getSnubbedTitles(); // Get all snubbed movie titles from Redis set

        if (titles.length === 0) {
            return res.status(200).json({
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
                    resultCount: 0,
                    message: 'No snubbed movies found in cache'
                }
            });
        }

        const allStats = await getAllStats(); // Get stats for all movies from Redis (or compute if not cached)

        // Enrich the titles with their stats (freshCount, tomatometer, etc.) and sort by freshCount desc
        const enriched = titles
            .map(title => allStats[title])
            .filter(stat => stat !== null)
            .sort((a, b) => b.freshCount - a.freshCount); // sorting happens here in JS after we get all stats, since Redis doesn't support complex sorting on multiple fields easily

        const paginated = enriched.slice(skip, skip + limit);

        res.status(200).json({
            success: true,
            data: paginated,
            pagination: {
                totalDocs: enriched.length,
                currentPage: page,
                totalPages: Math.ceil(snubbedCache.length / limit),
                hasNext: page * limit < snubbedCache.length,
                hasPrev: page > 1,
                perPage: limit
            },
            metadata: {
                fetchedAt: new Date().toISOString(),
                resultCount: paginated.length,
                message: 'Snubbed movies retrieved from cache',
                appliedFilters: { oscar: false, sortedBy: 'freshCount desc' }
            }
        });
    }
    catch (err) {
        handleError(res, err, 'Failed to retrieve snubbed movies')
    }
};

//Movies that have won an oscar but have rotten reviews
exports.getControversialOscarWinners = async (req, res) => {
    try {
        const { page, limit, skip } = extractPagination(req.query);

        const controversial = await oscar.aggregate([
            // Only winners first (cheap, fast filter)
            { $match: { winner: true } },

            // Join with rotten reviews based on film title (case-insensitive)
            {
                $lookup: {
                    from: "rottenCollection",                    // ← use real collection name
                    let: { filmTitle: { $toLower: "$film" } },   // Normalize case
                    pipeline: [
                        {
                        $match: {
                            // $expr lets us use aggregation expressions (like $toLower, math, comparisons) inside a $match stage.
                            // { $eq: [ left, right ] } checks if left == right (equality).
                            $expr: { $eq: [{ $toLower: "$movie_title" }, "$$filmTitle"] }
                            }
                        },
                        { $match: { review_type: "Rotten" } },     // Only keep rotten ones
                        { $limit: 5 }                              // Optional: don't bring too many
                    ],
                    as: "rotten_reviews"
                }
            },

            // Only keep winners that have at least one rotten review (controversial)
            { $match: { "rotten_reviews.0": { $exists: true } } },

            // Optional: sort by number of rotten reviews (most controversial first)
            { $addFields: { rotten_count: { $size: "$rotten_reviews" } } },
            { $sort: { rotten_count: -1 } },

            // Optional: limit to top 20 most controversial winners (adjust as needed)
            { $limit: 20 },

            // Optional projection - clean output
            {
                $project: {
                    year: "$year_film",
                    category: 1,
                    film: 1,
                    winner: 1,
                    rotten_reviews: {
                        $map: {
                            input: "$rotten_reviews",
                            as: "r",
                            in: { title: "$$r.movie_title", score: "$$r.review_score", content: "$$r.review_content" }
                        }
                    }
                }
            }
        ]);
        res.json({
            success: true,
            data: controversial,
            metadata: {
                fetchedAt: new Date().toISOString(),
                resultCount: controversial.length
            }
        });
    }
    catch (err) {
        handleError(res, err, 'Failed to retrieve controversial winners')
    }
};
*/