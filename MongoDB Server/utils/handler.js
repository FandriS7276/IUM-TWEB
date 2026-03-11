const handleError = (res, err, defaultMessage) => {
    console.error(`Error: ${err.message}`, err.stack);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || defaultMessage,
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
        // Checks if app is running in "development" mode
        // If yes → send the real error message (helps debugging)
        // If no (production) → hide the error details (security: don't leak stack traces/database paths to users/hackers)
    });
};

module.exports = { handleError };