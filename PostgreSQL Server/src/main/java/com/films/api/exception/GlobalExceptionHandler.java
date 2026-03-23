package com.films.api.exception;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.time.Instant;
import java.util.Map;

/**
 * Centralised error handling — the Spring Boot equivalent of Express middleware.
 *
 * @RestControllerAdvice intercepts exceptions thrown by any @RestController
 * and converts them to structured JSON responses. This keeps controllers
 * clean (no try/catch blocks) and guarantees a consistent error envelope.
 *
 * Error envelope shape:
 *   { "timestamp": "...", "status": 4xx/5xx, "error": "...", "suggestions": [...] }
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    /**
     * Handles title-not-found — returns 404 with partial-match suggestions
     * so the frontend can show a "did you mean?" correction.
     */
    @ExceptionHandler(MovieNotFoundException.class)
    public ResponseEntity<Map<String, Object>> handleMovieNotFound(MovieNotFoundException ex) {
        log.info("Movie lookup failed: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of(
                "timestamp",   Instant.now().toString(),
                "status",      404,
                "error",       ex.getMessage(),
                "suggestions", ex.getSuggestions()
        ));
    }

    /**
     * Handles missing required query parameters (e.g. ?q= is absent).
     */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<Map<String, Object>> handleMissingParam(
            MissingServletRequestParameterException ex) {
        return ResponseEntity.badRequest().body(Map.of(
                "timestamp", Instant.now().toString(),
                "status",    400,
                "error",     "Required parameter \"" + ex.getParameterName() + "\" is missing."
        ));
    }

    /**
     * Handles wrong type for path/query variables (e.g. /movies/NaN).
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> handleTypeMismatch(
            MethodArgumentTypeMismatchException ex) {
        return ResponseEntity.badRequest().body(Map.of(
                "timestamp", Instant.now().toString(),
                "status",    400,
                "error",     "Invalid value for parameter \"" + ex.getName() + "\"."
        ));
    }

    /**
     * Catch-all for any unhandled exception.
     * Stack traces are logged server-side but NEVER exposed to clients.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleGeneric(Exception ex) {
        log.error("Unhandled exception", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
                "timestamp", Instant.now().toString(),
                "status",    500,
                "error",     "An unexpected error occurred."
        ));
    }
}
