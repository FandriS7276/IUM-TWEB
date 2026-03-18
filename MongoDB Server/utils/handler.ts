/**
 * utils/handler.ts — Centralised error response helper.
 *
 * Instead of writing res.status(500).json({...}) in every catch block,
 * controllers call `handleError(res, err, 'Friendly message')`. This ensures:
 *   - A consistent JSON shape for all error responses
 *   - Stack traces are included in development but hidden in production
 *     (prevents leaking internal paths/library names to clients)
 */

import { Response } from 'express';

/** Extends the built-in Error with an optional HTTP status code. */
export interface AppError extends Error {
    status?: number;
}

/**
 * Sends a JSON error response and logs the error to the console.
 *
 * @param res            - Express response object
 * @param err            - The caught error (may have a `.status` property)
 * @param defaultMessage - Fallback message shown if `err.message` is empty
 */
export const handleError = (res: Response, err: AppError, defaultMessage: string): void => {
    console.error(`Error: ${err.message}`, err.stack);

    res.status(err.status || 500).json({
        success: false,
        message: err.message || defaultMessage,
        // Only include the raw error message in development — in production,
        // this field is omitted so internal details don't reach the client
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
};
