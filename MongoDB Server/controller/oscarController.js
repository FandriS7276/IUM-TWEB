const oscar =require('../scheme/oscarScheme')

//Get all oscars awards

exports.getOscar = async (req,res) => {
    try{
        const CollectionTheOscarAwards = await  oscar.find().limit(100);
        res.json({
            success: true,
            data:{
                Oscar : CollectionTheOscarAwards,
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

//Movies that have won an oscar but have rotten reviews

exports.getControversialWinners = async (req, res) => {
    try {
        const controversial = await oscar.aggregate([
            { $match: { winner: true } }, // Filtering only the oscar winning movies
            {
                $lookup: {
                    from: "RottenTomatoes",
                    localField: "film",
                    foreignField: "movie_title",
                    as: "reviews"
                }
            },
            { $match: { "reviews.review_type": "Rotten" } },
            { $limit: 20 }
        ]);

        res.json({ success: true, data: controversial });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};