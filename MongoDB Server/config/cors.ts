/**
 * config/cors.ts — CORS (Cross-Origin Resource Sharing) configuration.
 *
 * Browsers block requests made from one origin (e.g. http://localhost:3000)
 * to a different origin (e.g. http://localhost:4000) unless the server
 * explicitly allows it via CORS headers. This config tells Express which
 * origins, methods, and headers are permitted.
 *
 * FRONTEND_URL is read from .env so the allowed origin can differ between
 * environments (localhost in dev, the real domain in production) without
 * changing code.
 */

// dotenv/config is imported for its side effect: it loads .env into process.env
// so FRONTEND_URL is available when this module is first required
import 'dotenv/config';
import { CorsOptions } from 'cors';

// Only the frontend origin is allowed — everything else gets a CORS error.
// Undefined entries are filtered out at runtime (handles missing .env gracefully).
const allowedOrigins: (string | undefined)[] = [
    process.env.FRONTEND_URL,
];

const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin header (mobile apps, curl, Postman, server-to-server)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },

    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],

    // Required for the browser to send/receive cookies and Authorization headers
    credentials: true,

    // 204 (No Content) is preferred over 200 for OPTIONS preflight responses
    // because some older browsers mishandle a 200 on a preflight
    optionsSuccessStatus: 204
};

export default corsOptions;
