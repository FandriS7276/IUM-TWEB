// utils/sortBuilder.js
/**
 * Builds a safe MongoDB sort object from a client-provided sortBy string.
 * Supports multi-field sorting with explicit or default directions.
 *
 * @param {Object} options
 * @param {string} [options.sortByQuery]          - Raw ?sortBy=... value (may be undefined)
 * @param {Record<string, string>} options.validFieldsMap
 *        Mapping: clientField → dbField  e.g. { date: 'review_date', title: 'movie_title' }
 * @param {Record<string, 'asc' | 'desc'>} [options.defaultDirection = {}]
 *        Per-field default when direction is omitted  e.g. { date: 'desc', name: 'asc' }
 * @param {Object} [options.defaultSort = {}]
 *        Fallback sort when sortBy is missing/empty
 * @param {boolean} [options.addIdTieBreaker = true]
 *        Append {_id: 1} for stable pagination (strongly recommended)
 * @returns {Object} MongoDB sort document e.g. { review_date: -1, movie_title: 1 }
 * @throws {Error} with user-friendly message → catch and return 400
 */
function buildMongoSort({
    sortByQuery,
    validFieldsMap,
    defaultDirection = {},
    defaultSort = {},
    addIdTieBreaker = true,
}){
    if (!sortByQuery?.trim()) {
        return { ...defaultSort };
    }

    const mongoSort = {};

    // Split on commas, trim, remove empty
    const parts = sortByQuery
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);

    for (const part of parts) {
        let fieldName = part;
        let direction = 'asc'; // fallback

        // Handle explicit direction suffix
        if (part.includes('-')) {
        const [fieldPart, dirPart] = part.split('-').map((s) => s.trim());
        if (dirPart) {
            fieldName = fieldPart;
            direction = dirPart.toLowerCase() === 'desc' ? 'desc' : 'asc';
        }
        }

        const dbField = validFieldsMap[fieldName];
        if (!dbField) {
        const allowed = Object.keys(validFieldsMap).join(', ');
        throw new Error(
            `Invalid sort field '${fieldName}'. Allowed fields: ${allowed}`
        );
        }

        if (!['asc', 'desc'].includes(direction)) {
        throw new Error(
            `Invalid direction '${direction}' for field '${fieldName}'. Use -asc or -desc (or omit for default).`
        );
        }

        // Apply explicit direction or per-field default
        const finalDir =
        direction === 'desc' || defaultDirection[fieldName] === 'desc' ? -1 : 1;

        mongoSort[dbField] = finalDir;
    }

    // Stable pagination tie-breaker (very important when skipping / using cursors later)
    if (addIdTieBreaker && !mongoSort._id) {
        mongoSort._id = 1;
    }

    return mongoSort;
}

module.exports = { buildMongoSort };