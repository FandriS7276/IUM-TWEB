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

export default model<IOscarDocument>('oscarCollection', oscar);
