/**
 * utils/sortParser.ts — Safe, validated sort string parser.
 *
 * Clients send sort preferences as a query string like `?sortBy=winsCount-desc,year_film-asc`.
 * This utility parses that string into validated, typed structures that can be
 * used directly by MongoDB queries or in-memory array sorts.
 *
 * Why not just pass req.query.sort directly to .sort()?
 *   Passing unsanitised user input to MongoDB's sort() is a NoSQL injection risk.
 *   This parser enforces an allowlist of permitted field names, so clients can
 *   only sort by fields the controller explicitly permits.
 */

export type SortDirection = 1 | -1;

/** Parsed representation of a single sort criterion. */
export interface SortSpec {
    field: string;
    direction: SortDirection;  // 1 = ascending, -1 = descending
}

/** Format accepted by Mongoose's .sort() — e.g. { year_film: -1, film: 1 } */
export type MongoSortObject = Record<string, SortDirection>;

// ─── Functions ───────────────────────────────────────────────────────────────

/**
 * Parses a comma-separated sort string into an array of validated SortSpec objects.
 * Only field names present in `allowedFields` are accepted — others throw a 400.
 *
 * Expected format: `field-asc` or `field-desc`, comma-separated for multiple criteria.
 * Examples: `"winsCount-desc"`, `"year_film-asc,film-desc"`
 *
 * @throws Error with a user-friendly message if the format or field is invalid
 */
export function parseSortBy(sortByQuery: string | undefined, allowedFields: string[]): SortSpec[] {
    if (!sortByQuery?.trim()) return [];

    const parts = sortByQuery.split(',').map(p => p.trim()).filter(Boolean);
    const result: SortSpec[] = [];

    for (const part of parts) {
        // Only accept the exact pattern `fieldName-asc` or `fieldName-desc`
        const match = part.match(/^([a-zA-Z0-9_]+)-(asc|desc)$/i);
        if (!match) {
            throw new Error(
                `Invalid sort format: "${part}". Expected: field-asc or field-desc`
            );
        }

        const [, field, dirRaw] = match;
        const direction: SortDirection = dirRaw.toLowerCase() === 'desc' ? -1 : 1;

        // Allowlist check — rejects fields the client has no business sorting by
        if (!allowedFields.includes(field)) {
            throw new Error(
                `Sort field "${field}" is not allowed. Permitted: ${allowedFields.join(', ')}`
            );
        }

        result.push({ field, direction });
    }

    return result;
}

/**
 * Converts a SortSpec array into a MongoDB-compatible sort object.
 * Appends `_id: 1` as a tie-breaker to guarantee stable ordering across pages —
 * without it, items with equal sort values may appear on different pages randomly.
 */
export function toMongoSort(specs: SortSpec[]): MongoSortObject {
    const obj: MongoSortObject = {};
    specs.forEach(({ field, direction }) => { obj[field] = direction; });

    // Add _id tie-breaker only if we have at least one sort criterion
    if (Object.keys(obj).length > 0 && !obj._id) obj._id = 1;

    return obj;
}

/**
 * Converts a SortSpec array into a comparator function for Array.sort().
 * Used when sorting data that is already in memory (e.g. after Redis enrichment
 * or a MongoDB aggregation that returns all results at once).
 *
 * Null/undefined values are sorted to the end regardless of direction.
 */
export function toInMemoryComparator(
    specs: SortSpec[]
): (a: Record<string, unknown>, b: Record<string, unknown>) => number {
    if (specs.length === 0) return () => 0;

    return (a, b) => {
        for (const { field, direction } of specs) {
            let va = a[field] as number | null | undefined;
            let vb = b[field] as number | null | undefined;

            // Push nulls/undefineds to the end regardless of sort direction
            if (va == null) va = direction === 1 ? Infinity : -Infinity;
            if (vb == null) vb = direction === 1 ? Infinity : -Infinity;

            if (va === vb) continue;

            const cmp = va < vb ? -1 : 1;
            return direction * cmp;  // Flip sign for descending
        }
        return 0;
    };
}
