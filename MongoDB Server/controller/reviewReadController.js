const rottenReview = require('../schema/rottenSchema')
const { extractPagination, buildPaginatedResponse, emptyPaginatedResponse } = require('../utils/pagination');
const { handleError } = require('../utils/handler');
const { parseSortBy, toMongoSort } = require('../utils/sortParser');

const ALLOWED_SORT_FIELDS = [
    'review_date',
    'review_score',     // only useful if you store it as number
    'review_type',
];

//Get all reviews or filtered
exports.getReviews = async (req,res) => {
    try{
        // Extract + validate pagination (throws 400 if bad)
        const { page, limit, skip } = extractPagination(req.query);

        // Build safe filter from query params
        const { review_type, top_critic, from_date, to_date, sortBy } = req.query;
        const filter = {};
        let mongoSort = { review_date: -1 }; // Default sort

        // Validate and add filters if provided
        if (review_type) {
            if (!['Fresh', 'Rotten'].includes(review_type)) {
                return res.status(400).json({ success: false, message: 'Invalid review_type filter' });
            }
            filter.review_type = review_type;
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

        if (sortBy) {
            try {
                const specs = parseSortBy(sortBy, ALLOWED_SORT_FIELDS);
                mongoSort = toMongoSort(specs);
            }
            catch (err){
                return res.status(400).json({
                    success: false,
                    message: err.message,
                    example: 'review_date-desc,review_score-asc'
                });
            }
        }

        // Fetching reviews with pagination and sorting by newest first
        const reviews = await rottenReview
            .find(filter)
            .sort(mongoSort) // Newest reviews first
            .skip(skip)
            .limit(limit)
            .lean() // lean() returns plain JS objects instead of Mongoose documents, more efficient if we don't need Mongoose methods
            .select('movie_title review_type review_date critic_name publisher_name review_content review_score'); // Only return these fields (exclude _id, user_id, etc.)

        // Early return if no reviews found to avoid extra countDocuments query
        if (reviews.length === 0) {
            return res.status(200).json(emptyPaginatedResponse(limit));
        }

        // Get total count for pagination metadata
        const total = await rottenReview.countDocuments(filter);

        // Build and send paginated response
        res.status(200).json(buildPaginatedResponse(
            reviews,
            total,
            page,
            limit,
            {
                appliedFilters:{review_type, top_critic, from_date, to_date},
                appliedSort: sortBy || 'review_date-desc'
            }
        ));
    }
    catch (err) {
        if (err.status === 400)
            return res.status(400).json({ success: false, message: err.message });
        
        handleError(res, err, 'Failed to retrieve reviews data')
    }
};