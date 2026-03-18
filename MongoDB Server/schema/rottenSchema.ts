/**
 * schema/rottenSchema.ts — Mongoose schema for the rotten reviews collection.
 *
 * Maps to `rottenCollection` in MongoDB, which contains critic reviews scraped
 * from Rotten Tomatoes and similar sites. Each document is one review by one
 * critic for one film.
 *
 * The `review_type` field uses an enum with a custom error message so that
 * invalid values are rejected at the database layer with a clear message,
 * not just a generic validation error.
 *
 * Note: `top_critic` here refers to the source dataset's classification
 * (professional critics from major publications). The same field name is used
 * in userSchema so that user-created reviews can be classified consistently.
 */

import { Schema, model, Document } from 'mongoose';

// ─── Interfaces ──────────────────────────────────────────────────────────────

/** Plain data shape — use for lean() results or typed query filters. */
export interface IRottenReview {
    rotten_tomatoes_link?: string;
    movie_title?: string;
    critic_name?: string;
    /** Whether the critic is classified as a "top critic" by the source site. */
    top_critic?: boolean;
    publisher_name?: string;
    /** The binary verdict: Fresh = positive review, Rotten = negative review. */
    review_type: 'Fresh' | 'Rotten';
    /** Raw score string as it appears on the source site (e.g. "8/10", "A-"). */
    review_score?: string;
    review_date?: Date;
    review_content?: string;
}

/** Full Mongoose document — includes _id, save(), etc. */
export interface IRottenReviewDocument extends IRottenReview, Document {}

// ─── Schema ──────────────────────────────────────────────────────────────────

const rotten = new Schema<IRottenReviewDocument>({
    rotten_tomatoes_link: String,
    movie_title:          String,
    critic_name:          String,
    top_critic:           Boolean,
    publisher_name:       String,
    review_type: {
        type:     String,
        required: true,
        enum: {
            values:  ['Fresh', 'Rotten'],
            // Custom message shown when a document fails validation
            message: '{VALUE} is not a valid review type. Use "Fresh" or "Rotten".'
        },
        trim: true  // Strip accidental leading/trailing whitespace from the value
    },
    review_score:   String,
    review_date:    Date,
    review_content: String
}, {
    collection: 'rottenCollection'
});

export default model<IRottenReviewDocument>('rottenCollection', rotten);
