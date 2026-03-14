/**
 * @typedef {{ field: string, direction: 1 | -1 }} SortSpec
 */

/**
 * Strict parser - only accepts field-asc or field-desc format
 * @param {string | undefined} sortByQuery
 * @param {string[]} allowedFields
 * @returns {SortSpec[]}
 * @throws {Error} with user-friendly message
 */

// Turn unsafe client string in a safe, validated array of {field, direction}
function parseSortBy(sortByQuery, allowedFields) {
    if (!sortByQuery?.trim()) {
        return [];
    }

    const parts = sortByQuery.split(',').map(p => p.trim()).filter(Boolean);
    const result = [];

    for (const part of parts) {
        const match = part.match(/^([a-zA-Z0-9_]+)-(asc|desc)$/i);
        if (!match) {
            throw new Error(
                `Invalid sort format: "${part}". ` +
                `Expected: field-asc or field-desc`
            );
        }

        const [, field, dirRaw] = match;
        const dir = dirRaw.toLowerCase() === 'desc' ? -1 : 1;

        if (!allowedFields.includes(field)) {
            throw new Error(
                `Sort field "${field}" is not allowed. ` +
                `Permitted fields: ${allowedFields.join(', ')}`
            );
        }

        result.push({ field, direction: dir });
    }

    return result;
}

/**
 * Convert to MongoDB compatible object + stable _id tie-breaker
 * @param {SortSpec[]} specs
 * @returns {Record<string, 1 | -1>}
 */

// Turn validated array in { field: 1/-1, … } object that .sort() accepts
function toMongoSort(specs) {
    const obj = {};

    specs.forEach(({ field, direction }) => {
        obj[field] = direction;
    });

    // Almost always desirable for offset-based pagination
    if (Object.keys(obj).length > 0 && !obj._id) {
        obj._id = 1;
    }

    return obj;
}

/**
 * In-memory sort comparator (used after $lookup / Redis enrichment)
 * @param {SortSpec[]} specs
 * @returns {(a: any, b: any) => number}
 */

// Sort list based on tomatometer's Redis stats
// Turn validated array → (a,b) ⇒ number function for array.sort()
function toInMemoryComparator(specs) {
    if (specs.length === 0) return () => 0;

    return (a, b) => {
        for (const { field, direction } of specs) {
            let va = a[field];
            let vb = b[field];

            // Basic coercion - extend for dates/strings if needed
            if (va == null) va = direction === 1 ? Infinity : -Infinity;
            if (vb == null) vb = direction === 1 ? Infinity : -Infinity;

            if (va === vb) continue;

            const cmp = va < vb ? -1 : 1;
            return direction * cmp;   // flip when descending
        }

        return 0;
    };
}

module.exports = {
    parseSortBy,
    toMongoSort,
    toInMemoryComparator
};