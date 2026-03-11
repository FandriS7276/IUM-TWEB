const VALID_CATEGORIES = require('../services/oscarCache').VALID_CATEGORIES || [];

// Validate if specified category exists
function validateCategory(category) {
    if (!category)
        return null; // no filter = ok

    const normalized = category.trim().toUpperCase();
    
    if (!VALID_CATEGORIES.includes(normalized)) {
        throw new Error(`Invalid category: "${category}". Allowed: ${VALID_CATEGORIES.join(', ')}`);
    }

    return normalized; // return cleaned version for filter
}

// Validate if a film exists
async function isValidFilm(title) {
    if (!title) return false;

    const normalized = title.trim().toLowerCase();
    return await client.sIsMember(ALL_MOVIES_KEY, normalized);
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
    validateCategory,
    escapeRegex,
    isValidFilm
};