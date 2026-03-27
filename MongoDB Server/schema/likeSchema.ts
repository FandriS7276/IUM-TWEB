/**
 * schema/likeSchema.ts — Mongoose schema for movie likes.
 *
 * Each document records that a specific user liked a specific movie.
 * MongoDB is the source of truth for individual like records.
 * PostgreSQL's movies.likes column holds the aggregate count, kept in sync
 * asynchronously by the BullMQ worker in services/likeSync.ts.
 *
 * movieId is the PostgreSQL movies.id (INTEGER) — stored as a plain Number.
 * No need to replicate movie data here; the id is all that's required
 * to link the like to the correct row in PostgreSQL.
 *
 * The compound unique index on { userId, movieId } enforces one-like-per-user
 * per movie at the database level. This is the last line of defense if the
 * Redis rate limiter is temporarily unavailable or a race condition occurs.
 */

import { Schema, Types, model, Document } from 'mongoose';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface ILike {
    /** References the MongoDB User _id. */
    userId: Types.ObjectId;
    /** References the PostgreSQL movies.id (INTEGER). */
    movieId: number;
}

export interface ILikeDocument extends ILike, Document {
    createdAt: Date;
    updatedAt: Date;
}

// ─── Schema definition ────────────────────────────────────────────────────────

const likeSchema = new Schema<ILikeDocument>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        movieId: {
            type: Number,
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

// CRITICAL: Prevents double-likes even if Redis fails or a race condition hits.
// MongoDB enforces uniqueness at the storage layer.
likeSchema.index({ userId: 1, movieId: 1 }, { unique: true });

// Secondary index for fast COUNT queries used by the worker and reconciliation job.
likeSchema.index({ movieId: 1 });

export default model<ILikeDocument>('Like', likeSchema);
