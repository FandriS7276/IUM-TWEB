/**
 * services/likeSync.ts — BullMQ queue, worker, and reconciliation job for
 * keeping PostgreSQL movies.likes in sync with MongoDB Like documents.
 *
 * Architecture:
 *   Producer  (publishLikeEvent)  — called by likeController after each toggle
 *   Worker    (startLikeSyncWorker) — BullMQ consumer; queries MongoDB COUNT
 *                                     and writes it to PostgreSQL
 *   Reconcile (reconcileLikeCounts) — full correction sweep, scheduled nightly
 *
 * Why BullMQ uses its own Redis connection:
 *   The app's existing redisClient uses the `redis` package (v5). BullMQ
 *   requires an ioredis-compatible connection and manages that internally
 *   when given plain connection options. Both connections point to the same
 *   Redis server — BullMQ just handles queue-specific protocol concerns.
 *
 * Why COUNT instead of increment/decrement in the worker?
 *   Idempotency. If a job is retried (crash, network blip), re-running
 *   COUNT + SET produces the correct result every time. Increment/decrement
 *   would drift on retries.
 *
 * Why a nightly reconciliation on top of the worker?
 *   Belt-and-suspenders. Any jobs that exhaust all retries and land in the
 *   dead-letter queue will be corrected automatically at 3 AM.
 */

import { Queue, Worker, Job } from 'bullmq';
import { Pool } from 'pg';
import Like from '../schema/likeSchema';

// ─── Redis connection for BullMQ ──────────────────────────────────────────────

const isProduction = process.env.NODE_ENV === 'production';

/**
 * BullMQ connection options — mirrors the same Redis instance as redisClient.ts
 * but uses BullMQ's own ioredis-compatible connection config format.
 */
const bullMQConnection = isProduction
    ? {
          username: 'default',
          password: process.env.REDIS_PASS,
          host: 'redis-19946.crce218.eu-central-1-1.ec2.cloud.redislabs.com',
          port: 19946,
      }
    : {
          host: process.env.REDIS_HOST ?? 'localhost',
          port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
      };

// ─── PostgreSQL connection pool ───────────────────────────────────────────────

/**
 * Direct connection to the PostgreSQL database (Java Spring Boot manages the
 * schema, but Node.js can connect to the same DB directly with pg).
 * Add these vars to MongoDB Server/.env:
 *   PG_HOST, PG_PORT, PG_DATABASE, PG_USER, PG_PASSWORD
 */
export const pgPool = new Pool({
    host:     process.env.DB_HOST     ?? 'localhost',
    port:     parseInt(process.env.DB_PORT ?? '5432', 10),
    database: process.env.DB_DATABASE ?? 'movies_db',
    user:     process.env.DB_USER     ?? 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    max: 5, // Small pool — this is a background worker, not the main API
});

// ─── Queue ────────────────────────────────────────────────────────────────────

const likeQueue = new Queue('like-sync', {
    connection: bullMQConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 }, // 1s → 2s → 4s
        removeOnComplete: { count: 500 },
        removeOnFail:     { count: 2000 },
    },
});

/**
 * Publishes a like/unlike event to the queue.
 * The worker reads this and updates PostgreSQL likes count.
 */
export async function publishLikeEvent(action: 'like' | 'unlike', movieId: number): Promise<void> {
    await likeQueue.add('sync-likes-count', { action, movieId });
}

// ─── Worker ───────────────────────────────────────────────────────────────────

/**
 * Starts the BullMQ worker. Called once at app startup from app.ts.
 * The worker runs in the same process as the Express server.
 */
export function startLikeSyncWorker(): void {
    const worker = new Worker(
        'like-sync',
        async (job: Job) => {
            const { movieId } = job.data as { action: string; movieId: number };

            // Count the real likes in MongoDB (source of truth)
            const count = await Like.countDocuments({ movieId });

            // Write the accurate count to PostgreSQL
            await pgPool.query(
                'UPDATE movies SET likes = $1 WHERE id = $2',
                [count, movieId]
            );

            return { movieId, newCount: count };
        },
        {
            connection: bullMQConnection,
            concurrency: 5,
        }
    );

    worker.on('completed', (job: Job, result: { movieId: number; newCount: number }) => {
        console.log(`[like-sync] Movie ${result.movieId} → likes = ${result.newCount}`);
    });

    worker.on('failed', (job: Job | undefined, err: Error) => {
        console.error(`[like-sync] Job failed (movie ${job?.data?.movieId ?? '?'}): ${err.message}`);
    });

    console.log('[like-sync] Worker started.');
}

// ─── Reconciliation ───────────────────────────────────────────────────────────

/**
 * Full reconciliation sweep: aggregates all like counts from MongoDB and
 * batch-corrects PostgreSQL. Designed to be called by the cron in app.ts.
 *
 * Only updates rows where the count actually differs, so it's cheap when
 * the worker has been doing its job correctly.
 */
export async function reconcileLikeCounts(): Promise<void> {
    console.log('[reconciliation] Starting likes count sweep...');
    const start = Date.now();

    // Aggregate true counts per movie from MongoDB
    const counts = await Like.aggregate<{ _id: number; count: number }>([
        { $group: { _id: '$movieId', count: { $sum: 1 } } },
    ]);

    const client = await pgPool.connect();
    let corrected = 0;

    try {
        await client.query('BEGIN');

        // Correct any movie that has likes in MongoDB
        for (const { _id: movieId, count } of counts) {
            const result = await client.query(
                'UPDATE movies SET likes = $1 WHERE id = $2 AND likes != $1',
                [count, movieId]
            );
            corrected += result.rowCount ?? 0;
        }

        // Zero-out movies that have likes > 0 in PostgreSQL but no likes in MongoDB
        // (all their likes were removed and the worker may have missed it)
        if (counts.length > 0) {
            const likedMovieIds = counts.map((c) => c._id);
            const resetResult = await client.query(
                'UPDATE movies SET likes = 0 WHERE likes > 0 AND id != ALL($1::int[])',
                [likedMovieIds]
            );
            corrected += resetResult.rowCount ?? 0;
        } else {
            // No likes at all — zero everything out
            const resetResult = await client.query(
                'UPDATE movies SET likes = 0 WHERE likes > 0'
            );
            corrected += resetResult.rowCount ?? 0;
        }

        await client.query('COMMIT');

        const elapsed = ((Date.now() - start) / 1000).toFixed(2);
        console.log(
            `[reconciliation] Done in ${elapsed}s. ` +
            `Processed ${counts.length} movies with likes, corrected ${corrected} rows.`
        );
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[reconciliation] Failed, rolled back:', (err as Error).message);
        throw err;
    } finally {
        client.release();
    }
}
