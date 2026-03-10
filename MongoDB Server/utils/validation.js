const VALID_CATEGORIES = require('../services/oscarCache').VALID_CATEGORIES || [];

function validateCategory(category) {
    if (!category)
        return null; // no filter = ok

    const normalized = category.trim().toUpperCase();
    
    if (!VALID_CATEGORIES.includes(normalized)) {
        throw new Error(`Invalid category: "${category}". Allowed: ${VALID_CATEGORIES.join(', ')}`);
    }

    return normalized; // return cleaned version for filter
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
    validateCategory,
    escapeRegex
};