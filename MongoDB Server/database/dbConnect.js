const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB connected 🔥');
    }
    catch (err) {
        console.error('MongoDB connection FAILED:', err.message);
        throw err;  // let caller (app.js) handle crash
    }
};
module.exports = connectDB;