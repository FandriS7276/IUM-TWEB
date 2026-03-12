const VALID_CATEGORIES = require('../services/oscarCache').VALID_CATEGORIES || [];

// Validate if specified category exists
function validateCategory(category) {
    const normalized = category.trim().toUpperCase();
    
    if (!VALID_CATEGORIES.includes(normalized)) {
        throw new Error(`Invalid category: "${category}". Allowed: ${VALID_CATEGORIES.join(', ')}`);
    }

    return normalized; // return cleaned version for filter
}

module.exports = {
    validateCategory
};