/**
 * routes/users.ts — User authentication and profile routes.
 *
 * Public routes:
 *   POST /user/register — Create a new account
 *   POST /user/login    — Authenticate and receive a JWT
 *
 * Protected routes (require valid JWT):
 *   GET  /user/profile  — Retrieve the authenticated user's profile
 */

import { Router } from 'express';
import { register, login, getProfile } from '../controller/userController';

const router = Router();

// Public endpoints — no auth required
router.post('/register', register);
router.post('/login', login);

// Protected endpoint — requires valid JWT (checked inside getProfile)
router.get('/profile', getProfile);

export default router;
