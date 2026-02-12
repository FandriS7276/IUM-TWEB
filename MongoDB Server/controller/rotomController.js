const rotomScheme =require('../schema/rotomSchema')
//Shows all rotten tomatoes

exports.getRotom = async (req,res) => {
    try{
        const rotom = await rotomScheme.find().limit(100);
        res.json({
            success: true,
            data:{
                reviews : rotom,
            },
        });
    }catch (error){
        res.status(500).json({
            success: false,
            message: 'not found',
            error:error.message,
        });
    }
}

//Shows the most loved movies that have not won or been nominated for an oscar


exports.getSnubbedMovies = async (req, res) => {
    try {
        const snubbed = await rotomScheme.aggregate([
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
        ]);

        res.json({ success: true, count: snubbed.length, data: snubbed });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

//Dynamic filtering for specific movies by review type

exports.getReviewsByType = async (req, res) => {
    try {
        const { title, type } = req.query; // type can only be 'Fresh' o 'Rotten'
        const filter = {};
        if (title) filter.movie_title = new RegExp(title, 'i')
        if (type) filter.review_type = type;

        const reviews = await rotomScheme.find(filter).limit(50);

        res.json({
            success: true,
            count: reviews.length,
            data: reviews
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};


