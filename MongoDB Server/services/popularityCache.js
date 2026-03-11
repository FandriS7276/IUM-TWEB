const client = require('../database/redisClient');
const { getMovieStats } = require('./statsCache');
const { enrichWithStats } = require('../utils/enrichment.js');

const DAILY_ZSET        = 'popular:daily:zset';
const WEEKLY_ZSET       = 'popular:weekly:zset';
const DAILY_PREVIOUS    = 'popular:daily:previous';
const WEEKLY_PREVIOUS   = 'popular:weekly:previous';

const ACTIVE_DAILY      = 'active:daily';
const ACTIVE_WEEKLY     = 'active:weekly';

// Recent hot movies
const HOT_ZSET = 'hot:short:zset';          // rolling hot list
const HOT_TTL = 4 * 60 * 60;                // 4 hours in seconds

// Update tracking for hot (call inside trackView & trackLike)
function addToHot(title, bonus = 100) {
    const now = Date.now() / 1000;            // unix timestamp in seconds
    const score = now + bonus;                // newer = higher score, bonus = action weight
    return client.multi()
        .zAdd(HOT_ZSET, { score, value: title })
        .expire(HOT_ZSET, HOT_TTL)              // keep the whole set alive
        .exec();
}

// Views tracking (called every time someone opens a movie page)
async function trackView(title) {
    if (!title)
        return; // Doesn't crash on empty title
    const multi = client.multi();
    multi.incr(`counter:daily:views:${title}`);     // +1 daily views
    multi.incr(`counter:weekly:views:${title}`);    // +1 weekly views
    multi.sAdd(ACTIVE_DAILY, title);                // Remember this movie was active today
    multi.sAdd(ACTIVE_WEEKLY, title);               // Rememner this movie was active this week
    await multi.exec();                             // Execute all 4 command lines together as an atomic transaction

    // Adding counter to the hotlist too
    await addToHot(title, 100);
}


// Like tracking (called every time someone clicks on like button in movie page)
async function trackLike(title) {
    if (!title)
        return;
    const multi = client.multi();
    multi.incr(`counter:daily:likes:${title}`);
    multi.incr(`counter:weekly:likes:${title}`);
    multi.sAdd(ACTIVE_DAILY, title);
    multi.sAdd(ACTIVE_WEEKLY, title);
    await multi.exec();

    // Giving likes more value for the hotlist
    await addToHot(title, 300);
}

// Daily refresh (cron: 5 0 * * *) - runs every night at 00:05
async function refreshDailyPopularity() {
    console.log('🔥 Refreshing DAILY popular...');

    // Checks for any activity during the day
    const titles = await client.sMembers(ACTIVE_DAILY);
    if (!titles.length) {
        console.log('No activity today → skipping');
        return; // Skip if no movie has received either a like or a view click
    }

    // Get ALL view & like counts in ONE pipeline
    const pipe = client.multi();
    titles.forEach(t => {
        pipe.get(`counter:daily:views:${t}`);
        pipe.get(`counter:daily:likes:${t}`);
    });

    const raw = await pipe.exec(); // raw will receive all the raw values saved in the counters
    if (raw.some(([err]) => err !== null)) {
        console.error('Failed refreshing daily populars', raw);
    }

    // Build a map with each movie's score (avoid calling getMovieStats in loop if possible)
    const scoreMap = {};
    let idx = 0;
    for (const title of titles) {
        const views  = Number(raw[idx++][1] || 0);
        const likes  = Number(raw[idx++][1] || 0);
        const fresh = (await getMovieStats(title)).freshCount || 0;

        scoreMap[title] = (views * 1) + (likes * 3) + (fresh * 0.5);
    }

    // Build sorted list (ZSET) in redis
    const zPipe = client.multi();
    Object.entries(scoreMap).forEach(([title, score]) => {
        if (score > 0) zPipe.zAdd(DAILY_ZSET, { score, value: title });
    });
    await zPipe.exec();

    // Save previous day before reset
    await client.del(DAILY_PREVIOUS);
    await client.zUnionStore(DAILY_PREVIOUS, [{ key: DAILY_ZSET, weight: 1 }]);

    // Clean everything
    const cleanupPipe = client.multi();
    cleanupPipe.del(ACTIVE_DAILY);
    titles.forEach(t => {
        cleanupPipe.del(`counter:daily:views:${t}`);
        cleanupPipe.del(`counter:daily:likes:${t}`);
    });
    await cleanupPipe.exec();

    console.log(`Daily popular updated — ${titles.length} movies ranked`);
}

// ──────────────────────────────────────────────
// Weekly refresh (cron: 5 0 * * 0) - Sunday midnight
async function refreshWeeklyPopularity() {
    console.log('🔥 Refreshing WEEKLY popular...');

    const titles = await client.sMembers(ACTIVE_WEEKLY);
    if (!titles.length) {
        console.log('No weekly activity → skipping');
        return;
    }

    const pipe = client.multi();
    titles.forEach(t => {
        pipe.get(`counter:weekly:views:${t}`);
        pipe.get(`counter:weekly:likes:${t}`);
    });

    const raw = await pipe.exec();
    if (raw.some(([err]) => err !== null)) {
        console.error('Failed refreshing daily populars', raw);
    }

    const scoreMap = {};
    let idx = 0;
    for (const title of titles) {
        const views  = Number(raw[idx++][1] || 0);
        const likes  = Number(raw[idx++][1] || 0);
        const fresh = (await getMovieStats(title)).freshCount || 0;

        scoreMap[title] = (views * 1) + (likes * 3) + (fresh * 0.5);
    }

    const zAddPipe = client.multi();
    Object.entries(scoreMap).forEach(([title, score]) => {
        if (score > 0) zAddPipe.zAdd(WEEKLY_ZSET, { score, value: title });
    });
    await zAddPipe.exec();

    await client.del(WEEKLY_PREVIOUS);
    await client.zUnionStore(WEEKLY_PREVIOUS, [{ key: WEEKLY_ZSET, weight: 1 }]);

    const cleanupPipe = client.multi();
    cleanupPipe.del(ACTIVE_WEEKLY);
    titles.forEach(t => {
        cleanupPipe.del(`counter:weekly:views:${t}`);
        cleanupPipe.del(`counter:weekly:likes:${t}`);
    });
    await cleanupPipe.exec();

    console.log(`Weekly popular updated — ${titles.length} movies ranked`);
}


async function getPopularDaily(page = 1, limit = 20) {
    const start = (page - 1) * limit;
    const end   = start + limit - 1;
    const titles = await client.zRevRange(DAILY_ZSET, start, end);
    if (!titles.length)
        console.log('Hot ZSET empty - possible cold start');
    return await enrichWithStats(titles);
}

async function getPopularWeekly(page = 1, limit = 20) {
    const start = (page - 1) * limit;
    const end   = start + limit - 1;
    const titles = await client.zRevRange(WEEKLY_ZSET, start, end);
    return await enrichWithStats(titles);
}

async function getYesterdayPopular(limit = 10) {
    const titles = await client.zRevRange(DAILY_PREVIOUS, 0, limit - 1);
    return await enrichWithStats(titles);
}

async function getLastWeekPopular(limit = 10) {
    const titles = await client.zRevRange(WEEKLY_PREVIOUS, 0, limit - 1);
    return await enrichWithStats(titles);
}

// Read hot movies (sorted by recency + action weight)
async function getHotMovies(limit = 10) {
    const titles = await client.zRevRange(HOT_ZSET, 0, limit - 1);
    if (!titles.length)
        console.log('Hot ZSET empty — possible cold start');
    return await enrichWithStats(titles);
}

module.exports = {
    trackView,
    trackLike,
    refreshDailyPopularity,
    refreshWeeklyPopularity,
    getPopularDaily,
    getPopularWeekly,
    getYesterdayPopular,
    getLastWeekPopular,
    getHotMovies
};