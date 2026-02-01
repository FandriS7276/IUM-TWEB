import mongoose from "mongoose";

const movieSchema = new mongoose.Schema({
    rotten_tomatoes_link: String,
    movie_title: String,
    critic_name:String,
    top_critic: Boolean,
    publisher_name: String,
    review_type: {
        type: String,
        required: true,
        enum: {
            values: ['Fresh', 'Rotten'],
            message: '{VALUE} non è un tipo di recensione valido. Usa "Fresh" o "Rotten".'
        },
        trim: true // Rimuove eventuali spazi bianchi accidentali
    },
    review_score: String,
    review_date: Date,
    review_content: String
}, {
    collection: 'RottenTomatoes'
});