const oscar =require('../schema/oscarSchema')

//Get all oscars awards
exports.getAllOscars = async (req, res) => {
    try {
        // Get page & limit from URL query (?page=2&limit=50), default to page 1, 100 per page
        const page  = req.query.page  ? Number(req.query.page)  : 1;    // Default to page 1 if not specified
        const limit = req.query.limit ? Number(req.query.limit) : 100;  // Default to 100 reviews per page if not specified,
                                                                        // can be adjusted by client with ?limit=50 for example
                                                                        // (max 500 to prevent abuse)

        // Basic validation for page and limit
        if (page < 1 || isNaN(page) || limit < 1 || isNaN(limit) || limit > 500) {
            return res.status(400).json({
            success: false,
            message: 'Invalid pagination parameters: page must be >= 1, limit must be between 1 and 500'
            });
        }
        // This is the skip value: how many docs to IGNORE before starting results
        // Formula: (current page - 1) × items per page
        // page=1 → skip=0    page=2 → skip=100    page=3 → skip=200 etc.
        const skip = (page - 1) * limit;

        const oscars = await oscar
            .find()                             // all Oscars (add filters later if needed)
            .sort({ year_film: -1 })            // newest years first (good for movies)
            .skip(skip)                         // ← skips the calculated number
            .limit(limit);                      // ← caps how many we return

        // Bonus: total count for frontend to know total pages
        const total = await oscar.countDocuments();

        res.json({
            success: true,
            data: oscars,
            pagination: {
                totalDocs: total,
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                hasNext: page * limit < total,
                hasPrev: page > 1
            },
            metadata: {
                fetchedAt: new Date().toISOString(),
                resultCount: oscars.length
                }
        });
    }
    catch (err) {
        console.error('Error in fetching Oscars data:', err);   // ← helps you spot issues in logs
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve Oscars data',
            error: err.message                          // ← always send for now (safe while developing)
            // Checks if app is running in "development" mode
            // If yes → send the real error message (helps debugging)
            // If no (production) → hide the error details (security: don't leak stack traces/database paths to users/hackers)
            // error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
}
};

//Movies that have won an oscar but have rotten reviews
exports.getControversialOscarWinners = async (req, res) => {
try {
    const controversial = await oscar.aggregate([
        // Only winners first (cheap, fast filter)
        { $match: { winner: true } },

        // Optional: add index on film + winner if not already
        {
        $lookup: {
                from: "rottenCollection",                    // ← use real collection name
                let: { filmTitle: { $toLower: "$film" } },   // Normalize case
                pipeline: [
                    {
                    $match: {
                        $expr: { $eq: [{ $toLower: "$movie_title" }, "$$filmTitle"] }
                        }
                    },
                    { $match: { review_type: "Rotten" } },     // Only keep rotten ones
                    { $limit: 5 }                              // Optional: don't bring too many
                ],
                as: "rotten_reviews"
            }
        },

        { $match: { "rotten_reviews.0": { $exists: true } } }, // At least one rotten review

        { $limit: 20 },

        // Optional projection – clean output
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
        res.json({ success: true, data: controversial });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};