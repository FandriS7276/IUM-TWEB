/**
 * utils/validation.ts — Application-level validation helpers.
 *
 * Currently provides Oscar category validation. VALID_CATEGORIES is a live
 * array maintained by oscarCache: it is populated at startup from the database
 * and updated automatically whenever the Oscar collection changes (via a
 * MongoDB change stream). This means validation stays in sync with the actual
 * data without needing restarts or manual config changes.
 */

import { VALID_CATEGORIES } from '../services/oscarCache';

/**
 * Checks whether a category string is present in the live Oscar category list.
 * Normalises to uppercase before comparing so "best picture" and "BEST PICTURE"
 * are treated as the same value.
 *
 * @returns The normalised (uppercase) category string if valid
 * @throws  Error with a human-readable message if the category is unknown
 */
export function validateCategory(category: string): string {
    const normalized = category.trim().toUpperCase();

    if (!VALID_CATEGORIES.includes(normalized)) {
        throw new Error(
            `Invalid category: "${category}". Allowed: ${VALID_CATEGORIES.join(', ')}`
        );
    }

    return normalized;
}
