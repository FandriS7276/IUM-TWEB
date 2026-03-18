import { Router, Request, Response, NextFunction } from 'express';

const router = Router();

// TODO stub - implement when ready
router.get('/', (req: Request, res: Response, next: NextFunction) => {
    res.send('respond with a resource');
});

export default router;
