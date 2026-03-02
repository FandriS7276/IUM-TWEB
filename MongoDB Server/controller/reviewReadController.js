const rottenReview =require('../schema/rottenSchema')
const { extractPagination, buildPaginatedResponse, emptyPaginatedResponse } = require('../utils/pagination');

//Get all reviews or filtered
exports.getReviews = async (req,res) => {
    try{
        // Extract + validate pagination (throws 400 if bad)
        const { page, limit, skip } = extractPagination(req.query);

        // Build safe filter from query params
        const { movie_title, review_type, top_critic, from_date, to_date, sortBy } = req.query;
        const filter = {};
        let sort = {review_date: -1}; // Default

        // Validate and add filters if provided
        if (review_type) {
            if (!['Fresh', 'Rotten'].includes(review_type)) {
                return res.status(400).json({ success: false, message: 'Invalid review_type filter' });
            }
            filter.review_type = review_type;
        }
        if (movie_title) {
            filter.movie_title = movie_title.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'); // Escape regex special chars
            filter.movie_title = { $regex: `^${filter.movie_title}$`, $options: 'i' }; // Case-insensitive exact match
        }
        if (top_critic !== undefined) {
            const isTop = top_critic === 'true' || top_critic === true;
            filter.top_critic = isTop;  // true = only top, false = exclude top
        }
        if (from_date || to_date) {
            filter.review_date = {};
            if (from_date) {
                const from = new Date(from_date);
                if (!isNaN(from))
                    filter.review_date.$gte = from;
            }
            if (to_date) {
                const to = new Date(to_date);
                if (!isNaN(to))
                    filter.review_date.$lte = to;
            }
            if (Object.keys(filter.review_date).length === 0) {
                delete filter.review_date; // Remove if no valid dates
            }
        }
        if (sortBy){
            const validSorts = {
                'date-desc': { review_date: -1 },
                'date-asc':  { review_date:  1 },
                'fresh-desc': { freshCount: -1 }, // requires index or computed field
                'tomatometer-desc': { tomatometer: -1 } // requires computed field
            };
            if (!validSorts[sortBy]){
                return res.status(400).json({ success: false, message: `Invalid sort_by. Valid: ${Object.keys(validSorts).join(', ')}` });
            }
            sort = validSorts[sortBy];
        }

        // Fetching reviews with pagination and sorting by newest first
        const reviews = await rottenReview
            .find(filter)
            .sort(sort) // Newest reviews first
            .skip(skip)
            .limit(limit)
            .lean() // lean() returns plain JS objects instead of Mongoose documents, more efficient if we don't need Mongoose methods
            .select('movie_title review_type review_date critic_name publisher_name review_content review_score'); // Only return these fields (exclude _id, user_id, etc.)

        // Early return if no reviews found to avoid extra countDocuments query
        if (reviews.length === 0) {
            return res.status(200).json(emptyPaginatedResponse(limit));
        }

        // Get total count for pagination metadata
        const total = await rottenReview.countDocuments();

        // Build and send paginated response
        res.status(200).json(buildPaginatedResponse(reviews, total, page, limit, {appliedFilters:{review_type, movie_title, top_critic, from_date, to_date}, appliedSort: sort}));
    }
    catch (err) {
        if (err.status === 400)
            return res.status(400).json({ success: false, message: err.message });
        
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
};