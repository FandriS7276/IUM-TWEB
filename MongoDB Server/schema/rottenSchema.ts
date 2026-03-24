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

// ─── Indexes ─────────────────────────────────────────────────────────────────
//
// All indexes are derived from the actual query patterns in reviewReadController.
// Adding them here (rather than via mongosh) means Mongoose calls ensureIndexes()
// on startup, so the indexes are always in sync with the schema definition.
//
// Rule of thumb applied: index every field that appears in a $match filter or
// a .sort() call; use compound indexes when the same request filters on one
// field and sorts on another, so MongoDB can satisfy both from a single index
// scan instead of a filter pass + an in-memory sort.

/**
 * movie_title — case-insensitive exact-match lookup.
 *
 * The collation (locale 'en', strength 2) is *required* for MongoDB to use
 * this index when the query contains a /^Title$/i regex. Without it the engine
 * falls back to a full 993 k-doc collection scan on every search request.
 *
 * Covers:  GET /reviews?movie_title=X
 */
rotten.index(
    { movie_title: 1 },
    { collation: { locale: 'en', strength: 2 } }
);

/**
 * review_date — supports the default sort (newest-first) applied to every
 * un-filtered paginated request, and the date-range filter (from_date / to_date).
 *
 * Descending direction matches the default sort direction so MongoDB can
 * walk the index in order without a blocking in-memory sort step.
 *
 * Covers:  GET /reviews (default sort)
 *          GET /reviews?from_date=X&to_date=Y
 */
rotten.index({ review_date: -1 });

/**
 * review_type + review_date — compound index for the common case where the
 * client filters by verdict (Fresh / Rotten) *and* the results are date-sorted.
 * The leading field eliminates non-matching docs; the trailing field satisfies
 * the sort so no in-memory sort is needed.
 *
 * Covers:  GET /reviews?review_type=Fresh   (leading prefix also usable alone)
 *          GET /reviews?review_type=Rotten&sortBy=review_date-desc
 */
rotten.index({ review_type: 1, review_date: -1 });

/**
 * top_critic + review_date — same compound rationale as review_type above.
 * The boolean cardinality is low (two values), so pairing it with review_date
 * lets MongoDB narrow to top/non-top critics and then walk the index in
 * date order — critical for the paginated feed where both filters are common.
 *
 * Covers:  GET /reviews?top_critic=true
 *          GET /reviews?top_critic=false&sortBy=review_date-desc
 */
rotten.index({ top_critic: 1, review_date: -1 });

/**
 * movie_title + review_date — compound index for the MovieDetailPage pattern
 * where reviews are filtered by title and sorted by date.
 *
 * Collation matches the single-field movie_title index above so MongoDB can
 * use this index for case-insensitive title lookups *and* date-sorted results
 * in a single index scan — no in-memory sort needed.
 *
 * Covers:  GET /reviews?movie_title=X&sortBy=review_date-desc
 *          (the most common query on the movie detail page)
 */
rotten.index(
    { movie_title: 1, review_date: -1 },
    { collation: { locale: 'en', strength: 2 } }
);

export default model<IRottenReviewDocument>('rottenCollection', rotten);
