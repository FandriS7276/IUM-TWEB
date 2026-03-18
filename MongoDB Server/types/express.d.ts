/**
 * types/express.d.ts — Global Express Request augmentation.
 *
 * Extends Express's built-in Request type so that `req.user` is available
 * and typed in every controller and middleware, without needing to cast.
 *
 * This object is populated by auth middleware after verifying a JWT token.
 * It holds only the minimal fields needed across request handlers —
 * not the full Mongoose document.
 */

declare global {
    namespace Express {
        interface Request {
            /**
             * Set by auth middleware after a valid JWT is verified.
             * Undefined on unauthenticated routes.
             */
            user?: {
                id: string;
                username: string;
                email: string;
                /**
                 * Mirrors `top_critic` in both userSchema and rottenSchema.
                 * Passed directly to new reviews: `top_critic: req.user.top_critic`.
                 */
                top_critic: boolean;
            };
        }
    }
}

export {};
