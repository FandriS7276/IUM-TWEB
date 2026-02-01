const oscarScheme =require('../scheme/oscarScheme')

//Get all oscars awards

exports.getOscar = async (req,res) => {
    try{
        const CollectionTheOscarAwards = await  oscarScheme.find().limit(100);
        res.json({
            success: true,
            data:{
                theOscarAwards : CollectionTheOscarAwards,
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
        const controversial = await oscarScheme.aggregate([
            { $match: { winner: true } }, // Solo i vincitori dell'Oscar
            {
                $lookup: {
                    from: "rottentomatoesreviews",
                    localField: "film",
                    foreignField: "title",
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