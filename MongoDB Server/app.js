require('dotenv').config();   // ← this line loads environment variables from .env file into process.env,
// allowing us to use process.env.PORT, process.env.MONGODB_URI etc. in our code without hardcoding sensitive info.
// Make sure to create a .env file with the appropriate variables and never commit it to version control!


// Dependencies
var express = require('express');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

// Security & performance middleware
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const corsOptions = require('./config/cors');


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

// Chat implementation
// app.js or server.js
const { Server } = require('socket.io');
const io = new Server(server, { cors: { origin: "*" } }); // adjust cors later

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join movie room
  socket.on('joinMovie', (movieTitle) => {
    socket.join(`movie-${movieTitle}`);
    console.log(`${socket.id} joined movie-${movieTitle}`);
  });

  // Send chat message
  socket.on('chatMessage', ({ movieTitle, message, user }) => {
    io.to(`movie-${movieTitle}`).emit('chatMessage', { user, message, timestamp: new Date() });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Database connection
const dbConnect = require('./database/dbConnect');

// Start server after DB connection is established
(async () => {
  try {
    await dbConnect();  // waits for connection to succeed or fail before starting server – prevents "server running but DB dead" scenario
    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => {
      console.log(`Server live on http://localhost:${PORT}`);
      console.log(`Time check: ${new Date().toISOString()}`);
    });
  } catch (err) {
    console.error('Server start aborted – DB connection failed:', err.message);
    console.error('Full error:', err.stack);
    process.exit(1);
  }
})();

module.exports = app;
