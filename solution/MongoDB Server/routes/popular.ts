import { Router, Request, Response } from 'express';
import { handleError } from '../utils/handler';
import * as popularityCache from '../services/popularityCache';

const router = Router();

// GET /popular/today
router.get('/today', async (req: Request, res: Response) => {
    try {
        const data = await popularityCache.getPopularDaily(
            Number(req.query.page) || 1,
            Number(req.query.limit) || 20
        );
        res.json({ success: true, data });
    } catch (err) {
        handleError(res, err as Error & { status?: number }, 'Failed to load popular today');
    }
});

// GET /popular/this-week
router.get('/this-week', async (req: Request, res: Response) => {
    try {
        const data = await popularityCache.getPopularWeekly(
            Number(req.query.page) || 1,
            Number(req.query.limit) || 20
        );
        res.json({ success: true, data });
    } catch (err) {
        handleError(res, err as Error & { status?: number }, 'Failed to load popular this week');
    }
});

// GET /popular/trending (hot right now)
router.get('/trending', async (req: Request, res: Response) => {
    try {
        const data = await popularityCache.getHotMovies(
            Number(req.query.limit) || 10
        );
        res.json({ success: true, data });
    } catch (err) {
        handleError(res, err as Error & { status?: number }, 'Failed to load trending movies');
    }
});

// GET /popular/yesterday
router.get('/yesterday', async (req: Request, res: Response) => {
    try {
        const data = await popularityCache.getYesterdayPopular(
            Number(req.query.limit) || 10
        );
        res.json({ success: true, data });
    } catch (err) {
        handleError(res, err as Error & { status?: number }, 'Failed to load yesterday popular');
    }
});

// GET /popular/last-week
router.get('/last-week', async (req: Request, res: Response) => {
    try {
        const data = await popularityCache.getLastWeekPopular(
            Number(req.query.limit) || 10
        );
        res.json({ success: true, data });
    } catch (err) {
        handleError(res, err as Error & { status?: number }, 'Failed to load last week popular');
    }
});

export default router;
