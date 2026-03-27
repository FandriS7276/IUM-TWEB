import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import cron from 'node-cron';
import http from 'http';

import corsOptions from './config/cors';
import { authenticateToken } from './config/auth';
import { initSocket } from './services/socket';
import connectDB from './database/dbConnect';
import { syncAllMovieTitles } from './services/movieCache';
import { refreshDailyPopularity, refreshWeeklyPopularity } from './services/popularityCache';
import { initCategoryWatcher } from './services/oscarCache';
import apiRouter from './routes/index';
import { refreshSnubbedCache } from './services/snubbedCache';
import { startLikeSyncWorker, reconcileLikeCounts } from './services/likeSync';

// Cron scheduler - refreshes daily and weekly caches
cron.schedule('5 0 * * *', async () => {
    try {
        await refreshDailyPopularity();
    } catch (err) {
        console.error('Daily popularity refresh failed:', err);
    }
}, { timezone: 'UTC' });

cron.schedule('5 0 * * 0', async () => {
    try {
        await refreshWeeklyPopularity();
    } catch (err) {
        console.error('Weekly popularity refresh failed:', err);
    }
}, { timezone: 'UTC' });

// Nightly reconciliation — corrects any PostgreSQL likes drift at 3:00 AM UTC
cron.schedule('0 3 * * *', async () => {
    try {
        await reconcileLikeCounts();
    } catch (err) {
        console.error('Likes reconciliation failed:', err);
    }
}, { timezone: 'UTC' });

const app = express();

// Only count write operations (POST, PUT, PATCH, DELETE) against rate limits.
// GET/HEAD/OPTIONS are read-only and should never lock out a browsing user.
const isWriteRequest = (req: Request): boolean =>
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method);

// Broad safety net: max 200 write requests per 15 minutes per IP.
// Browsing (GET) is completely exempt — only mutations count.
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    skip: (req: Request) => !isWriteRequest(req),
    message: {
        success: false,
        message: 'Too many requests, please try again after 15 minutes',
    }
});

// API-level write limiter: max 60 write requests per minute per IP.
// Prevents burst abuse (e.g. rapid review/like spam) without affecting reads.
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    skip: (req: Request) => !isWriteRequest(req),
    message: { success: false, message: 'API rate limit hit – slow down' },
});

app.use(helmet());
app.use(compression());
app.use(cors(corsOptions));
app.use(limiter);
app.use('/api', apiLimiter);

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// JWT authentication — runs on every request but only attaches req.user
// when a valid Bearer token is present. Does NOT block unauthenticated requests.
app.use(authenticateToken);

// Routes
app.use('/api', apiRouter);

// 404 handler
app.use((req: Request, res: Response, next: NextFunction) => {
    res.status(404).json({ success: false, message: 'Endpoint not found' });
});

// Error handler
app.use((err: Error & { status?: number }, req: Request, res: Response, next: NextFunction) => {
    console.error(err.stack);
    const status = err.status || 500;
    res.status(status).json({
        success: false,
        message: status === 500 ? 'Internal server error' : err.message,
        ...(process.env.NODE_ENV === 'development' && { error: err.stack })
    });
});

// Create HTTP server and initialize Socket.IO
const server = http.createServer(app);
initSocket(server);

// Start server after DB connection is established
(async () => {
    try {
        await connectDB();
        /* TODO - temporary comment till SQL server deploy
        await syncAllMovieTitles().catch((err) => {
            console.warn('Movie title sync skipped (non-fatal):', (err as Error).message);
        });*/
        await initCategoryWatcher();
        await refreshSnubbedCache();
        startLikeSyncWorker();

        const PORT = process.env.PORT || 4000;
        server.listen(PORT, () => {
            console.log(`Server live on http://localhost:${PORT}`);
            console.log(`Time check: ${new Date().toISOString()}`);
        });
    } catch (err) {
        console.error('Server start aborted – DB connection failed:', (err as Error).message);
        console.error('Full error:', (err as Error).stack);
        process.exit(1);
    }
})();

export default app;
