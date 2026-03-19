/**
 * schema/oscarSchema.ts — Mongoose schema for the Oscar awards collection.
 *
 * Maps to the `oscarCollection` in MongoDB, which contains one document per
 * nomination (not per film). A single film can appear multiple times — once
 * for each category it was nominated in, across different ceremony years.
 *
 * All fields are optional at the schema level because the dataset may have
 * incomplete rows; required validation is handled at the application layer
 * where appropriate.
 */

import { Schema, model, Document } from 'mongoose';

// ─── Interfaces ──────────────────────────────────────────────────────────────

/** Plain data shape — use for lean() results or typed aggregation outputs. */
export interface IOscar {
    year_film?: number;       // The year the film was released
    year_ceremony?: number;   // The year the ceremony was held (usually year_film + 1)
    ceremony?: number;        // Ceremony number (1st, 2nd, … 96th, etc.)
    category?: string;        // e.g. "BEST PICTURE", "BEST DIRECTOR"
    name?: string;            // Nominee name (person or entity receiving the nomination)
    film?: string;            // Film title
    winner?: boolean;         // true = won, false = nominated but did not win
}

/** Full Mongoose document — includes _id, save(), etc. */
export interface IOscarDocument extends IOscar, Document {}

// ─── Schema ──────────────────────────────────────────────────────────────────

const oscar = new Schema<IOscarDocument>({
    year_film:    Number,
    year_ceremony: Number,
    ceremony:     Number,
    category:     String,
    name:         String,
    film:         String,
    winner:       Boolean
}, {
    // Points to the existing collection name in MongoDB
    collection: 'oscarCollection'
});

// ─── Indexes ─────────────────────────────────────────────────────────────────
//
// All indexes are derived from the query patterns in oscarController:
//  - getAllOscars       → $match on winner, year_ceremony, category, year_film
//                         default $sort on year_ceremony + film
//  - getControversialOscarWinners → $match { winner: true }, $lookup on film
//  - getMostNominatedMovies       → $group by film (no pre-filter, full scan)
//  - getSnubbedMovies             → driven by snubbedCache title list

/**
 * winner — the most selective boolean filter in the collection.
 *
 * `getControversialOscarWinners` opens with `{ $match: { winner: true } }` on
 * every cold-start aggregation. Without this index Mongo scans the entire
 * collection; with it the match resolves via an O(log n) index seek.
 *
 * Covers:  $match { winner: true/false } in aggregation pipelines
 *          GET /oscars?winner=true|false
 */
oscar.index({ winner: 1 });

/**
 * year_ceremony — filtered in getAllOscars and used as the default sort field
 * (`$sort { year_ceremony: -1, film: 1 }` in the aggregation pipeline).
 *
 * Descending direction aligns with the default sort so MongoDB can walk the
 * index in order without an in-memory sort step on the filtered result set.
 *
 * Covers:  GET /oscars?year_ceremony=YYYY
 *          Default aggregation sort
 */
oscar.index({ year_ceremony: -1 });

/**
 * category — equality filter used in getAllOscars after validateCategory().
 * Oscar categories are high-cardinality strings ("BEST PICTURE", "BEST ACTOR",
 * etc.), so a single-field index eliminates most of the collection on a match.
 *
 * Covers:  GET /oscars?category=BEST+PICTURE
 */
oscar.index({ category: 1 });

/**
 * film — used in three places: the $group _id, the $lookup join key in
 * getControversialOscarWinners (let: { filmTitle: { $toLower: '$film' } }),
 * and the default sort. An index on `film` lets the $lookup resolve quickly
 * and supports the alphabetical tie-break sort inside getAllOscars.
 *
 * Covers:  $group _id: '$film'
 *          $sort { film: 1 } tie-break
 *          $lookup on film title
 */
oscar.index({ film: 1 });

/**
 * year_film — used for the date range filter (from_date / to_date map to
 * year_film in getAllOscars). A range query on an unindexed numeric field
 * requires a full collection scan; the index converts it to a bounded seek.
 *
 * Covers:  GET /oscars?from_date=1990&to_date=2000  (maps to year_film $gte/$lte)
 */
oscar.index({ year_film: 1 });

/**
 * winner + film — compound index for the controversial-winners aggregation.
 *
 * The pipeline starts with `{ $match: { winner: true } }` and then groups /
 * sorts by film. Having both fields in one index means the engine can satisfy
 * the boolean filter *and* deliver results pre-sorted by film without a
 * secondary sort pass.
 *
 * Covers:  { $match: { winner: true } } → $group by film (getControversialOscarWinners)
 */
oscar.index({ winner: 1, film: 1 });

export default model<IOscarDocument>('oscarCollection', oscar);
