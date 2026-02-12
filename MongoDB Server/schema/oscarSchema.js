import mongoose from "mongoose";

const oscar = new mongoose.Schema({
    year_film: Number,
    year_ceremony: Number,
    ceremony: Number,
    category: String,
    name: String,
    film: String,
    winner: Boolean
}, {
    collection: 'oscarCollection'
});

module.exports = mongoose.model('oscarCollection', oscar);