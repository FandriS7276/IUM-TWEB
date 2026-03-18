/**
 * database/dbConnect.ts — Establishes the Mongoose connection to MongoDB.
 *
 * Called once at server startup (in app.ts) before the HTTP server begins
 * listening. If the connection fails, the error is re-thrown so the startup
 * IIFE can catch it, log it, and exit — preventing the server from starting
 * in a broken state where routes would silently fail on every DB operation.
 */

import mongoose from 'mongoose';

const connectDB = async (): Promise<void> => {
    try {
        // MONGODB_URI comes from .env, e.g. "mongodb://127.0.0.1:27017/dbconnect"
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log('MongoDB connected 🔥');
    } catch (err) {
        console.error('MongoDB connection FAILED:', (err as Error).message);
        // Re-throw so the caller (app.ts startup IIFE) can decide how to handle it
        throw err;
    }
};

export default connectDB;
