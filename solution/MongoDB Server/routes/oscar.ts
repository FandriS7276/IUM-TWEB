import { Router } from 'express';
import { getAllOscars, getControversialOscarWinners, getMostNominatedMovies, getSnubbedMovies } from '../controller/oscarController';

const router = Router();

// GET /awards/oscar (all Oscars or filtered)
router.get('/oscar', getAllOscars);

// GET /awards/controversial-winners
router.get('/controversial-winners', getControversialOscarWinners);

// GET /awards/never-winning-nominees
router.get('/never-winning-nominees', getMostNominatedMovies);

// GET /awards/snubbed
router.get('/snubbed', getSnubbedMovies);

export default router;
