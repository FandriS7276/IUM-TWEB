/**
 * database/redisClient.ts — Creates and exports the Redis client singleton.
 *
 * Redis is used throughout the app as an in-memory cache for:
 *   - Movie stats (freshCount, tomatometer, etc.) — avoids repeated aggregations
 *   - Popularity rankings (sorted sets for daily/weekly/hot lists)
 *   - Oscar query results (cached for 90 days)
 *   - Movie title sets (for validation and snubbed/nominated lookups)
 *
 * A single shared client is exported so all services reuse the same connection
 * pool rather than opening a new TCP connection per module.
 *
 * The connection is established immediately via the IIFE at the bottom.
 * If Redis is unavailable, the event listeners log the error but don't crash —
 * the reconnect strategy will keep retrying automatically.
 */

import { createClient } from 'redis';
import 'dotenv/config';
const isProduction = process.env.NODE_ENV === 'production';

const client = isProduction
    ? createClient({
        username: 'default',
        password: process.env.REDIS_PASS,
        socket: {
            host: 'redis-19946.crce218.eu-central-1-1.ec2.cloud.redislabs.com',
            port: 19946,
        },
    })
    : createClient({
        url: process.env.REDIS_URL ?? 'redis://localhost:6379',
        socket: {
            reconnectStrategy: (retries: number) => Math.min(retries * 100, 3000),
        },
    });

client.on('error',       (err: Error) => console.error('Redis Client Error', err));
client.on('connect',     ()           => console.log('Redis connected 🔥'));
client.on('reconnecting',()           => console.log('Redis reconnecting...'));

// Connect immediately when this module is first imported.
// The IIFE (Immediately Invoked Function Expression) is needed because
// top-level await is not available in CommonJS modules.
(async () => {
    await client.connect();
})();

export default client;
