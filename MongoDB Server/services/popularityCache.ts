/**
 * services/popularityCache.ts — Tracks and ranks popular movies using Redis.
 *
 * Popularity is tracked via counters (views + likes per movie) and then ranked
 * by a weighted score. The architecture has three layers:
 *
 *   1. TRACKER — increments counters on every user action (view/like)
 *      Keys: `counter:daily:views:{title}`, `counter:daily:likes:{title}`
 *      Active movie sets: `active:daily`, `active:weekly` (tracks which movies
 *      had activity so the cron job only processes relevant ones)
 *
 *   2. REFRESH (cron) — runs nightly/weekly to collapse counters into ranked
 *      Redis sorted sets (ZSETs). Score formula: views*1 + likes*3 + freshCount*0.5
 *      Likes are weighted 3× more than views because they signal stronger intent.
 *      Previous rankings are preserved as `popular:daily:previous` / `popular:weekly:previous`
 *      so "yesterday" and "last week" endpoints remain available after each reset.
 *
 *   3. HOT list — a rolling 4-hour window of trending activity using a ZSET
 *      where the score is a unix timestamp + action bonus. No cron needed —
 *      the TTL on the key handles expiry automatically.
 *
 *   4. OUTPUT — read functions called by route handlers to return enriched results.
 */

import client from '../database/redisClient';
import { getMovieStats } from './statsCache';
import { enrichWithStats, EnrichedMovie } from '../utils/enrichment';

// ─── Redis key constants ──────────────────────────────────────────────────────

const DAILY_ZSET     = 'popular:daily:zset';
const WEEKLY_ZSET    = 'popular:weekly:zset';
const DAILY_PREVIOUS = 'popular:daily:previous';
const WEEKLY_PREVIOUS= 'popular:weekly:previous';
const ACTIVE_DAILY   = 'active:daily';
const ACTIVE_WEEKLY  = 'active:weekly';
const HOT_ZSET       = 'hot:short:zset';
const HOT_TTL        = 4 * 60 * 60;  // 4 hours in seconds

// ─── Tracker ─────────────────────────────────────────────────────────────────

/**
 * Adds a movie to the hot list with the given bonus score.
 * Score = current unix timestamp + bonus, so newer activity always ranks higher.
 * The bonus differentiates action types: a like (300) outweighs a view (100).
 * The ZSET TTL is reset on every write, keeping the hot list alive as long as
 * there is activity.
 */
export function addToHot(title: string, bonus = 100): Promise<unknown> {
    const score = Date.now() / 1000 + bonus;  // Unix timestamp in seconds
    return client.multi()
        .zAdd(HOT_ZSET, { score, value: title })
        .expire(HOT_ZSET, HOT_TTL)  // Refresh the 4-hour TTL on every write
        .exec();
}

/**
 * Called every time a user opens a movie page.
 * Increments both daily and weekly view counters and marks the movie as active
 * so the cron job knows to include it in the next ranking pass.
 *
 * `multi()` batches all 4 Redis commands into a single atomic pipeline —
 * either all succeed or none do, preventing partial counter updates.
 */
export async function trackView(title: string): Promise<void> {
    if (!title) return;
    await client.multi()
        .incr(`counter:daily:views:${title}`)
        .incr(`counter:weekly:views:${title}`)
        .sAdd(ACTIVE_DAILY,  title)
        .sAdd(ACTIVE_WEEKLY, title)
        .exec();
    await addToHot(title, 100);
}

/**
 * Called every time a user clicks the like button on a movie.
 * Same structure as trackView but with a higher hot-list bonus (300 vs 100)
 * to reflect that a like is a stronger signal of interest than a passive view.
 */
export async function trackLike(title: string): Promise<void> {
    if (!title) return;
    await client.multi()
        .incr(`counter:daily:likes:${title}`)
        .incr(`counter:weekly:likes:${title}`)
        .sAdd(ACTIVE_DAILY,  title)
        .sAdd(ACTIVE_WEEKLY, title)
        .exec();
    await addToHot(title, 300);
}

// ─── Refresh (cron jobs) ──────────────────────────────────────────────────────

/**
 * Runs every night at 00:05 UTC (scheduled in app.ts).
 * Reads all daily counters, computes a weighted score per movie, writes the
 * ranked ZSET, archives the current rankings to DAILY_PREVIOUS, then clears
 * all counters and the active set for the next day.
 */
export async function refreshDailyPopularity(): Promise<void> {
    console.log('🔥 Refreshing DAILY popular...');
    try {
        const titles = await client.sMembers(ACTIVE_DAILY);
        if (!titles.length) { console.log('No activity today → skipping'); return; }

        // Fetch all view and like counters in a single pipeline to minimise round-trips
        const pipe = client.multi();
        titles.forEach(t => {
            pipe.get(`counter:daily:views:${t}`);
            pipe.get(`counter:daily:likes:${t}`);
        });
        // exec() returns results in the same order commands were queued;
        // map to string | null, treating any pipeline Error as a missing value
        const raw = (await pipe.exec()).map(r => (r instanceof Error ? null : r) as string | null);

        const scoreMap: Record<string, number> = {};
        let idx = 0;
        for (const title of titles) {
            const views = Number(raw[idx++] || 0);
            const likes = Number(raw[idx++] || 0);
            const fresh = (await getMovieStats(title)).freshCount || 0;
            // Weighted score: likes matter 3× more than views; critical acclaim adds a boost
            scoreMap[title] = views * 1 + likes * 3 + fresh * 0.5;
        }

        // Write ranked scores to the ZSET (sorted by score ascending; zRevRange reads highest first)
        const zPipe = client.multi();
        Object.entries(scoreMap).forEach(([title, score]) => {
            if (score > 0) zPipe.zAdd(DAILY_ZSET, { score, value: title });
        });
        await zPipe.exec();

        // Copy current rankings to PREVIOUS before resetting, so "yesterday" stays available
        await client.del(DAILY_PREVIOUS);
        await client.zUnionStore(DAILY_PREVIOUS, [{ key: DAILY_ZSET, weight: 1 }]);

        // Clean up: delete counters and the active set so tomorrow starts fresh
        const cleanup = client.multi();
        cleanup.del(ACTIVE_DAILY);
        titles.forEach(t => {
            cleanup.del(`counter:daily:views:${t}`);
            cleanup.del(`counter:daily:likes:${t}`);
        });
        await cleanup.exec();

        console.log(`Daily popular updated — ${titles.length} movies ranked`);
    } catch (err) {
        console.error('Daily popularity refresh failed:', err);
    }
}

/**
 * Runs every Sunday at 00:05 UTC (scheduled in app.ts).
 * Same logic as `refreshDailyPopularity` but operates on weekly counters.
 */
export async function refreshWeeklyPopularity(): Promise<void> {
    console.log('🔥 Refreshing WEEKLY popular...');
    try {
        const titles = await client.sMembers(ACTIVE_WEEKLY);
        if (!titles.length) { console.log('No weekly activity → skipping'); return; }

        const pipe = client.multi();
        titles.forEach(t => {
            pipe.get(`counter:weekly:views:${t}`);
            pipe.get(`counter:weekly:likes:${t}`);
        });
        const raw = (await pipe.exec()).map(r => (r instanceof Error ? null : r) as string | null);

        const scoreMap: Record<string, number> = {};
        let idx = 0;
        for (const title of titles) {
            const views = Number(raw[idx++] || 0);
            const likes = Number(raw[idx++] || 0);
            const fresh = (await getMovieStats(title)).freshCount || 0;
            scoreMap[title] = views * 1 + likes * 3 + fresh * 0.5;
        }

        const zAddPipe = client.multi();
        Object.entries(scoreMap).forEach(([title, score]) => {
            if (score > 0) zAddPipe.zAdd(WEEKLY_ZSET, { score, value: title });
        });
        await zAddPipe.exec();

        await client.del(WEEKLY_PREVIOUS);
        await client.zUnionStore(WEEKLY_PREVIOUS, [{ key: WEEKLY_ZSET, weight: 1 }]);

        const cleanup = client.multi();
        cleanup.del(ACTIVE_WEEKLY);
        titles.forEach(t => {
            cleanup.del(`counter:weekly:views:${t}`);
            cleanup.del(`counter:weekly:likes:${t}`);
        });
        await cleanup.exec();

        console.log(`Weekly popular updated — ${titles.length} movies ranked`);
    } catch (err) {
        console.error('Weekly popularity refresh failed:', err);
    }
}

// ─── Output (read functions) ──────────────────────────────────────────────────

/**
 * `zRevRange` returns members of a ZSET ordered from highest to lowest score.
 * `start`/`end` are 0-based index offsets, so page 2 with limit 20
 * becomes start=20, end=39 — exactly one page's worth of results.
 */
export async function getPopularDaily(page = 1, limit = 20): Promise<EnrichedMovie[]> {
    const start = (page - 1) * limit;
    const titles = (await client.zRevRange(DAILY_ZSET, start, start + limit - 1)) as string[];
    return enrichWithStats(titles);
}

export async function getPopularWeekly(page = 1, limit = 20): Promise<EnrichedMovie[]> {
    const start = (page - 1) * limit;
    const titles = (await client.zRevRange(WEEKLY_ZSET, start, start + limit - 1)) as string[];
    return enrichWithStats(titles);
}

export async function getYesterdayPopular(limit = 10): Promise<EnrichedMovie[]> {
    const titles = (await client.zRevRange(DAILY_PREVIOUS, 0, limit - 1)) as string[];
    return enrichWithStats(titles);
}

export async function getLastWeekPopular(limit = 10): Promise<EnrichedMovie[]> {
    const titles = (await client.zRevRange(WEEKLY_PREVIOUS, 0, limit - 1)) as string[];
    return enrichWithStats(titles);
}

/** Returns the hottest movies within the last 4-hour rolling window. */
export async function getHotMovies(limit = 10): Promise<EnrichedMovie[]> {
    const titles = (await client.zRevRange(HOT_ZSET, 0, limit - 1)) as string[];
    return enrichWithStats(titles);
}
