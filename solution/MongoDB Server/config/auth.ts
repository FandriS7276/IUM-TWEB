/**
 * config/auth.ts — JWT authentication middleware.
 *
 * Two middleware functions are exported:
 *
 *   1. `authenticateToken` — Extracts the JWT from the Authorization header,
 *      verifies it against JWT_SECRET, and attaches the decoded payload to
 *      `req.user`. If the token is missing or invalid the request continues
 *      WITHOUT a user (req.user remains undefined) — this allows public
 *      endpoints to still work while authenticated endpoints can check
 *      `req.user` downstream via `requireAuth`.
 *
 *   2. `generateTokens` — Creates a signed JWT access token containing the
 *      minimal user payload (id, username, email, top_critic). The token
 *      expires according to JWT_ACCESS_EXPIRES from .env (defaults to 15m).
 *
 * Why not block unauthenticated requests here?
 *   Many routes (GET /reviews, GET /popular) are public. By only attaching
 *   the user when a valid token exists, we avoid duplicating auth logic
 *   across routes. Protected routes use `requireAuth` from
 *   reviewWriteController.ts to enforce authentication.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { StringValue } from 'ms';

// ─── Environment constants ──────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret';
const JWT_ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || '15m';

// ─── Token payload shape ────────────────────────────────────────────────────

interface TokenPayload {
    id: string;
    username: string;
    email: string;
    top_critic: boolean;
}

// ─── Middleware: attach user from JWT ───────────────────────────────────────

/**
 * Parses the `Authorization: Bearer <token>` header and populates `req.user`
 * with the decoded payload when the token is valid. Silently skips invalid
 * or missing tokens so public routes remain accessible.
 */
export const authenticateToken = (req: Request, _res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        // No token → unauthenticated request (allowed for public endpoints)
        next();
        return;
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;

        // Populate req.user so downstream handlers can check authentication
        req.user = {
            id: decoded.id,
            username: decoded.username,
            email: decoded.email,
            top_critic: decoded.top_critic,
        };
    } catch {
        // Invalid/expired token → treat as unauthenticated rather than 401.
        // Protected routes will catch this via requireAuth and return 401.
    }

    next();
};

// ─── Token generation ───────────────────────────────────────────────────────

/**
 * Signs a JWT access token embedding the user's essential fields.
 * Called during login and registration to issue a token to the client.
 */
export const generateTokens = (user: TokenPayload): string => {
    const options: jwt.SignOptions = {
        expiresIn: JWT_ACCESS_EXPIRES as StringValue,
    };

    return jwt.sign(
        {
            id: user.id,
            username: user.username,
            email: user.email,
            top_critic: user.top_critic,
        },
        JWT_SECRET,
        options
    );
};
