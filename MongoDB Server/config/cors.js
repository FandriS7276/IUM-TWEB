const corsOptions = {
    origin: 'http://localhost:3000',  // Accept requests from localhost:3000
    methods: 'GET,POST',              // Type of requests that are acceptable
    allowedHeaders: 'Content-Type',
};

module.exports = corsOptions;