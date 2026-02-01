const mongoose = require('mongoose');

const path = require("path");
mongoose.connect('mongodb://127.0.0.1:27017/MongoDB')
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error(err));