require('dotenv').config();   // ← this line loads environment variables from .env file into process.env,
// allowing us to use process.env.PORT, process.env.MONGODB_URI etc. in our code without hardcoding sensitive info.
// Make sure to create a .env file with the appropriate variables and never commit it to version control!

var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

// Security & performance middleware
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const corsOptions = require('./config/cors');

// database connection
const database = require("./database/dbConnect");


var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var app = express();

// Rate limiting: max 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
  }
});


// Optional: stricter limit on API/search endpoints
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,                      // 1 minute
  max: 60,                                  // 60 req/min on API
  message: { success: false, message: 'API rate limit hit – slow down' },
});

// Apply security and performance middleware
app.use(helmet());
app.use(compression());
app.use(cors(corsOptions));

// Apply rate limiting to all requests and stricter limits to API routes
app.use(limiter);
app.use('/api', apiLimiter);


app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Routes
app.use('/api', require('./routes/index'));

// Modified error handling to return JSON instead of HTML, and to avoid leaking stack traces in production
// The default Express error handler sends an HTML page with the error message and stack trace,
// which is not ideal for an API server. This custom error handler will send a JSON response with a success flag,
// a user-friendly message, and optionally the stack trace if we're in development mode. This way, clients can easily
// parse the error response and we don't leak sensitive information in production.


// Better API-style error handler (near the bottom, before listen)
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: status === 500 ? 'Internal server error' : err.message,
    ...(process.env.NODE_ENV === 'development' && { error: err.stack })
  });
});

// 404 handler – also JSON
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

// Listening port and server start --> goes last because we want to ensure all middleware and routes are set up
// before accepting requests
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is live on http://localhost:${PORT}`);
  console.log(`Time check: ${new Date().toISOString()}`);  // optional flex
});

module.exports = app;
