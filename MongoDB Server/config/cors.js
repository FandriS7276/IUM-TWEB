require('dotenv').config();  // ← this line loads environment variables from .env file into process.env,
// allowing us to use process.env.PORT, process.env.MONGODB_URI etc. in our code without hardcoding sensitive info.
// Make sure to create a .env file with the appropriate variables and never commit it to version control!

const allowedOrigins = [
    process.env.FRONTEND_URL,
];

module.exports = {
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, Postman)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
        callback(null, true);
        } else {
        callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,                        // ← add this for cookies/tokens
    optionsSuccessStatus: 204                 // modern browsers prefer 204 for OPTIONS
};