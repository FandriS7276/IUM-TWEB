/**
 * services/oscarCache.ts — Oscar-related caches and category management.
 *
 * This service handles two distinct concerns:
 *
 * 1. Nominated-but-not-winning cache (`nominated:movies:set`)
 *    A Redis set of movies that were nominated for an Oscar but never won.
 *    Used by the "never-winning nominees" endpoint.
 *
 * 2. Valid category list (`VALID_CATEGORIES`)
 *    An in-memory array of all known Oscar categories (e.g. "BEST PICTURE").
 *    Populated at startup from the database and kept live via a MongoDB change
 *    stream — if a new category is inserted, the array updates automatically
 *    without a server restart.
 *
 * 3. Oscar query result cache (`oscars:grouped:*`)
 *    Grouped Oscar data is expensive to aggregate. Results are cached in Redis
 *    for 90 days (the dataset rarely changes). The cache key is derived from
 *    the filter parameters so different filter combinations have separate entries.
 */

import client from '../database/redisClient';
import OscarCollection from '../schema/oscarSchema';

const NOMINATED_KEY = 'nominated:movies:set';

// ─── Nominated cache ──────────────────────────────────────────────────────────

/**
 * Rebuilds the set of nominated-but-not-winning movies in Redis.
 * Nominated = appeared in any Oscar nomination. Winning = won at least once.
 * The result is `nominated - winning`.
 */
export async function refreshNominatedCache(): Promise<string[] | undefined> {
    console.log('Refreshing nominated-but-not-winning cache...');

    try {
        const winningMovies   = await OscarCollection.distinct('film', { winner: true }) as string[];
        // distinct() with no filter returns all unique film names across the entire collection
        const nominatedMovies = await OscarCollection.distinct('film') as string[];

        const nominatedOnly = nominatedMovies.filter(title => !winningMovies.includes(title));

        await client.del(NOMINATED_KEY);
        if (nominatedOnly.length > 0) {
            await client.sAdd(NOMINATED_KEY, nominatedOnly);
        }

        console.log(`Nominated cache refreshed: ${nominatedOnly.length} movies`);
        return nominatedOnly;
    } catch (err) {
        console.error('Error refreshing nominated cache:', err);
    }
}

/** Returns nominated-but-not-winning titles. Rebuilds the cache if empty. */
export async function getNominatedTitles(): Promise<string[]> {
    try {
        const titles = await client.sMembers(NOMINATED_KEY);
        if (titles.length === 0) return (await refreshNominatedCache()) ?? [];
        return titles;
    } catch (err) {
        console.error('Error getting nominated titles:', (err as Error).message);
        return [];
    }
}

// ─── Valid categories (live, in-memory) ──────────────────────────────────────

/**
 * Live list of all Oscar category names in uppercase.
 * Exported so `utils/validation.ts` can check user-supplied category filters
 * against the real data without a database query on every request.
 */
export let VALID_CATEGORIES: string[] = [];

type CategoryChangeCallback = (categories: string[]) => void;
const categoryChangeListeners: CategoryChangeCallback[] = [];

/** Register a callback to be called whenever the category list changes. */
export function onCategoriesChange(callback: CategoryChangeCallback): void {
    categoryChangeListeners.push(callback);
}

function notifyCategoryChange(): void {
    categoryChangeListeners.forEach(cb => cb(VALID_CATEGORIES));
}

/** Fetches distinct category values from MongoDB and updates VALID_CATEGORIES. */
async function loadValidCategories(): Promise<void> {
    const categories = await OscarCollection.distinct('category') as string[];
    VALID_CATEGORIES = categories.map(c => c.toUpperCase());
}

/**
 * Initialises the category watcher.
 * - Loads categories from the database on startup
 * - Sets up a MongoDB change stream to detect new categories being inserted
 * - Falls back to polling every 60 seconds if the change stream errors out
 *   (change streams require a replica set; polling works on standalone MongoDB)
 */
export async function initCategoryWatcher(): Promise<void> {
    await loadValidCategories();

    const changeStream = OscarCollection.watch([
        // Only react to changes that include a `category` field
        { $match: { 'fullDocument.category': { $exists: true } } }
    ]);

    changeStream.on('change', async (change) => {
        console.log('📡 Oscar category change detected:', change.operationType);
        await loadValidCategories();
        notifyCategoryChange();
    });

    changeStream.on('error', (err: Error) => {
        console.error('Change stream error — falling back to polling:', err);
        setInterval(loadValidCategories, 60_000);
    });
}

// ─── Oscar query result caching ───────────────────────────────────────────────

const CACHE_PREFIX = 'oscars:grouped:';

/**
 * 90 days in seconds. Oscar data is historical and rarely changes,
 * so a long TTL is safe and avoids unnecessary re-aggregations.
 */
export const CACHE_TTL_SECONDS = 90 * 24 * 60 * 60;

/** Shape of query parameters that affect which Oscars are returned. */
export interface OscarCacheQuery {
    year_film?: string | number;
    year_ceremony?: string | number;
    winner?: string | boolean;
    category?: string;
    from_date?: string | number;
    to_date?: string | number;
    [key: string]: unknown;
}

/**
 * Derives a stable Redis cache key from the filter parameters.
 * Pagination (page, limit) and sorting (sortBy) are excluded because they
 * don't change which movies match — we cache the full result set and paginate
 * it in memory. Keys are alphabetically sorted so `winner=true&category=X`
 * and `category=X&winner=true` produce the same cache key.
 */
export function getOscarsCacheKey(query: OscarCacheQuery = {}): string {
    const filterOnly: Partial<OscarCacheQuery> = {
        year_film:    query.year_film,
        year_ceremony: query.year_ceremony,
        winner:       query.winner,
        category:     query.category,
        from_date:    query.from_date,
        to_date:      query.to_date
    };

    // Remove undefined/null fields so they don't contribute to the key
    (Object.keys(filterOnly) as (keyof OscarCacheQuery)[]).forEach(k => {
        if (filterOnly[k] == null) delete filterOnly[k];
    });

    const sortedQuery = JSON.stringify(filterOnly, Object.keys(filterOnly).sort());
    return `${CACHE_PREFIX}${sortedQuery}`;
}
