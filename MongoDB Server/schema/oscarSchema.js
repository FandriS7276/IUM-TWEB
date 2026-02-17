const mongoose = require('mongoose');

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

export default mongoose.model('oscarCollection', oscar);