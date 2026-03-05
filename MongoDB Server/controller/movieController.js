const { enrichWithStats } = require {'../services/popularityCache.js'};

async function getPopularDaily(page = 1, limit = 20) {
    const start = (page - 1) * limit;
    const end   = start + limit - 1;
    const titles = await client.zRevRange(DAILY_ZSET, start, end);
    if (!titles.length)
        console.log('Hot ZSET empty — possible cold start');
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
    getPopularDaily,
    getPopularWeekly,
    getYesterdayPopular,
    getLastWeekPopular,
    getHotMovies
}