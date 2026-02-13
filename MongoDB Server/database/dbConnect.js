const mongoose = require('mongoose');

/*const path = require("path");
mongoose.connect('mongodb://127.0.0.1:27017/MongoDB')
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error(err));
*/
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
          // your options...
        });
        console.log('MongoDB connected successfully');
    }
    catch (err) {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    }
};

module.exports = connectDB;