const corsOptions = {
    origin: FRONTEND_URL,           // ← only allow requests from this URL (React app)
    methods: 'GET,POST',            // Type of requests that are acceptable
    optionsuccessStatus: 200        // For legacy browser support (some old browsers choke on 204)
};

module.exports = corsOptions;