import { Router, Request, Response } from 'express';
import reviewsRouter from './reviews';
import oscarRouter from './oscar';
import popularRouter from './popular';
import usersRouter from './users';
import { addMovieTitle } from '../services/movieCache';

const router = Router();

// Domain-specific routers
router.use('/reviews', reviewsRouter);
router.use('/awards', oscarRouter);
router.use('/popular', popularRouter);
router.use('/user', usersRouter);

// Root health check
router.get('/', (req: Request, res: Response) => {
    res.json({
        success: true,
        message: 'API is live',
        version: '1.0',
        endpoints: ['/reviews', '/awards', '/popular', '/movies', '/user']
    });
});

// POST /internal/sync-movie
router.post('/internal/sync-movie', async (req: Request, res: Response) => {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${process.env.INTERNAL_TOKEN}`) {
        res.status(403).json({ success: false, message: 'Unauthorized' });
        return;
    }

    const { title } = req.body as { title?: string };
    if (!title) {
        res.status(400).json({ success: false, message: 'Invalid title' });
        return;
    }

    await addMovieTitle(title);
    res.status(200).json({ success: true });
});

export default router;
