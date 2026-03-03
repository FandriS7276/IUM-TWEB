/**
 * Extracts and validates pagination params from req.query
 * @param {Object} query - req.query
 * @param {number} [defaultLimit=20] - default items per page
 * @param {number} [maxLimit=200] - hard max to prevent abuse
 * @returns {{ page: number, limit: number, skip: number }}
 */
function extractPagination(query, defaultLimit = 20, maxLimit = 500) {
    // Applying defaults
    const rawPage = query.page !== undefined ? Number(query.page) : 1;
    const rawLimit = query.limit !== undefined ? Number(query.limit) : defaultLimit;

    // Early validation - fail fast before any math
    if (
        isNaN(rawPage)  ||
        isNaN(rawLimit) ||
        rawPage  < 1    ||
        rawLimit < 1    ||
        rawLimit > maxLimit
    ) {
        const error = new Error(
        `Invalid pagination: page must be >= 1, limit must be between 1 and ${maxLimit}`
        );
        error.status = 400;
        throw error;
    }

    // Safe math now that we know inputs are valid numbers
    const page  = Math.floor(rawPage);
    const limit = Math.floor(rawLimit);
    const skip  = (page - 1) * limit;

    return { page, limit, skip };
}

/**
 * Builds standard empty pagination response
 * @param {number} limit
 * @returns {Object} ready-to-send JSON
 */
function emptyPaginatedResponse(limit = 20) {
    return {
        success: true,
        data: [],
        pagination: {
            totalDocs: 0,
            currentPage: 1,
            totalPages: 0,
            hasNext: false,
            hasPrev: false,
            perPage: limit
        },
        metadata: {
            fetchedAt: new Date().toISOString(),
            resultCount: 0
        }
    };
    }

    /**
     * Builds full paginated response
     * @param {Array} data - paginated items
     * @param {number} totalDocs - total matching items before pagination
     * @param {number} page
     * @param {number} limit
     * @param {Object} [extraMetadata={}] - anything else for metadata
     * @returns {Object} ready-to-send JSON
     */
    function buildPaginatedResponse(data, totalDocs, page, limit, extraMetadata = {}) {
    return {
        success: true,
        data,
        pagination: {
            totalDocs,
            currentPage: page,
            totalPages: Math.ceil(totalDocs / limit),
            hasNext: page * limit < totalDocs,
            hasPrev: page > 1,
            perPage: limit
        },
        metadata: {
            fetchedAt: new Date().toISOString(),
            resultCount: data.length,
            ...extraMetadata
        }
    };
}

module.exports = {
    extractPagination,
    emptyPaginatedResponse,
    buildPaginatedResponse
};