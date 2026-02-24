const rottenReview =require('../schema/rottenSchema')

//Get all rotten tomatoes
exports.getAllRottenReviews = async (req,res) => {
    try{
        // Get page & limit from URL query (?page=2&limit=50), default to page 1, 100 per page
        const page = Number(req.query.page) || 1;    // Default to page 1 if not specified
        const limit = Math.min(Number(req.query.limit) || 100, 500);// Default to 100 reviews per page if not specified,
                                                                    // can be adjusted by client with ?limit=50 for example (max 500 to prevent abuse)

        // Basic validation for page and limit (ensure they are positive integers and limit is not too high to prevent abuse
        // as DoS attack with very high limit could crash the server by trying to load too many documents in memory)
        if (page < 1 || isNaN(page) || limit < 1 || isNaN(limit) || limit > 500) {
            return res.status(400).json({
                success: false,
                message: 'Invalid pagination parameters: page must be >= 1, limit must be between 1 and 500'
            });
        }

        const skip = (page - 1) * limit;

        const reviews = await rottenReview
                        .find()
                        .sort({ review_date: -1 }) // Newest reviews first
                        .skip(skip)
                        .limit(limit);

        const total = await rottenReview.countDocuments();

        res.status(200).json({
            success: true,
            data: reviews,
            pagination: {
                totalDocs: total,
                currentPage: page,
                totalPages: Math.ceil(total / limit),   // Total pages based on count and limit, rounded by Math.ceil to ensure we have enough pages for all docs
                hasNext: page * limit < total,          // True if there are more pages after current
                hasPrev: page > 1,                      // True if there are pages before current
                perPage: limit
            },

            // Optional metadata for frontend, e.g., when data was fetched, how many results returned etc. Can be useful for debugging or UI display
            metadata: {
                fetchedAt: new Date().toISOString(),
                resultCount: reviews.length
            }
        });
    }
    catch (err) {
    console.error('Error fetching Rotten reviews:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        // Checks if app is running in "development" mode
        // If yes → send the real error message (helps debugging)
        // If no (production) → hide the error details (security: don't leak stack traces/database paths to users/hackers)
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}

//Shows the most loved movies that have not won or been nominated for an oscar
exports.getSnubbedMovies = async (req, res) => {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Math.min(Number(req.query.limit) || 100, 500);

        if (page < 1 || isNaN(page) || limit < 1 || isNaN(limit) || limit > 500) {
            return res.status(400).json({
                success: false,
                message: 'Invalid pagination parameters: page must be >= 1, limit must be between 1 and 500'
            });
        }

        const skip = (page - 1) * limit;

        const snubbed = await rottenReview
            .aggregate([
                // Filter by fresh reviews
                { $match: { review_type: 'Fresh' } },
                {
                    $lookup: {
                        from: "Oscar",
                        localField: "movie_title",
                        foreignField: "film",
                        as: "oscar_info"
                    }
                },
                // Excluding those who have won or been nominated for an oscar
                { $match: { oscar_info: { $size: 0 } } },
                { $limit: 50 }
            ])

        res.status(200).json({
            success: true,
            count: snubbed.length,
            data: snubbed,
            metadata: {
                fetchedAt: new Date().toISOString()
            }
        });
    }
    catch (err) {
        console.error('Error fetching snubbed movies:', err);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};

//Dynamic filtering for specific movies by review type or title
exports.getReviewsByType = async (req, res) => {
    try {
        const { title, type } = req.query; // type can only be 'Fresh' o 'Rotten'
        const filter = {};
        if (title) filter.movie_title = new RegExp(title, 'i')
        if (type) filter.review_type = type;

        const reviews = await rottenReview.find(filter).limit(50);

        res.json({
            success: true,
            count: reviews.length,
            data: reviews,
            metadata: {
                fetchedAt: new Date().toISOString(),
                query: { title: req.query.title, type: req.query.type }
            }
        });
    }
    catch (err) {
    console.error('Error fetching reviews by type:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve reviews by type/title',
            error: err.message
        });
    }
};

exports.getReviewsByMovie = async (req, res) => {
    try {
        const { movieTitle } = req.params;  // from URL: /api/reviews/movie/Oppenheimer
    
        if (!movieTitle || movieTitle.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'movieTitle is required in the URL path'
            });
        }
    
        // ─── Pagination ────────────────────────────────────────
        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 200);
        const skip = (page - 1) * limit;
        
        // ─── Filter: exact movie title (case-insensitive) ───────
        const filter = {
            movie_title: { $regex: `^${movieTitle.trim()}$`, $options: 'i' }
        };

        // Optional: add review_type filter from query if user wants
        if (req.query.review_type) {
            if (!['Fresh', 'Rotten'].includes(req.query.review_type)) {
                return res.status(400).json({
                    success: false,
                    message: 'review_type must be Fresh or Rotten'
                });
            }
            filter.review_type = req.query.review_type;
        }

        // ─── Sorting (default newest) ───────────────────────────
        const sort = { review_date: -1 };
        if (req.query.sortBy === 'score') {
            sort.review_score = -1; // highest first
        }

        // ─── Query ──────────────────────────────────────────────
        const reviews = await rottenReview
            .find(filter)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await rottenReview.countDocuments(filter);

        res.status(200).json({
            success: true,
            data: reviews,
            pagination: {
                totalDocs: total,
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                hasNext: page * limit < total,
                hasPrev: page > 1,
                perPage: limit
            },
            metadata: {
                fetchedAt: new Date().toISOString(),
                resultCount: reviews.length,
                movieTitleSearched: movieTitle,
                appliedFilters: filter,
                appliedSort: sort
            }
        });
    } catch (err) {
        console.error('Error in getReviewsByMovie:', err);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};