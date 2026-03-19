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

// Build the allowed-origins list from environment variables.
//
// FRONTEND_URL   → Primary frontend origin.
//                  Set to your deployed URL on Render (e.g. https://neview.vercel.app).
//                  Set to http://localhost:5173 in your local .env when running
//                  the backend locally.
//
// EXTRA_ORIGINS  → Optional comma-separated list of *additional* origins.
//                  Use this on Render to also allow your local dev machine:
//                    EXTRA_ORIGINS=http://localhost:5173,http://localhost:3000
//                  This is intentional — a Render free-tier project means you
//                  are the only one with the API URL, so allowing localhost is
//                  an acceptable trade-off for development convenience.
//
// Automatically added in non-production environments (local backend run):
//   localhost:5173 (Vite default) and localhost:3000 (CRA / other ports).
//
// All undefined / empty entries are filtered out so a missing env var never
// causes an accidental wildcard allow.
const allowedOrigins: string[] = [
    process.env.FRONTEND_URL,

    // EXTRA_ORIGINS: comma-separated list of additional origins (works in all envs,
    // including production on Render — useful for allowing localhost when developing
    // the frontend against the live backend).
    ...(process.env.EXTRA_ORIGINS ?? '').split(',').map(o => o.trim()),

    // Auto-allow localhost in non-production environments (running the backend
    // locally). These are never included when NODE_ENV=production on Render.
    ...(process.env.NODE_ENV !== 'production'
        ? ['http://localhost:5173', 'http://localhost:3000']
        : []),
].filter((o): o is string => Boolean(o));

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
