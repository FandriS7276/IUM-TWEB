package com.films.api.controller;

import com.films.api.dto.MovieCardDTO;
import com.films.api.dto.MovieDetailDTO;
import com.films.api.dto.MovieHoverDTO;
import com.films.api.dto.MovieSlimDTO;
import com.films.api.dto.MovieSummaryDTO;
import com.films.api.dto.PagedMoviesDTO;
import com.films.api.service.MovieService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * REST controller for movie endpoints.
 *
 * Responsibilities (and ONLY these):
 *   1. Map HTTP verbs + URL patterns to service calls.
 *   2. Extract and validate incoming parameters.
 *   3. Wrap the service result in the correct HTTP response.
 *
 * No business logic, no SQL — that all lives in MovieService.
 *
 * Base path: /api/movies   (registered in @RequestMapping below)
 */
@RestController
@RequestMapping("/api/movies")
@RequiredArgsConstructor
public class MovieController {

    private final MovieService movieService;

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/movies
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Returns a paginated, sortable summary list of all movies.
     *
     * Query parameters (all optional):
     *   page    - 0-indexed page number          (default 0)
     *   size    - results per page               (default 20, capped at 100)
     *   sortBy  - name | rating | year           (default "name")
     *   order   - asc | desc                     (default "asc")
     *
     * Example: GET /api/movies?sortBy=rating&order=desc&page=0&size=20
     */
    @GetMapping
    public ResponseEntity<PagedMoviesDTO> getAllMovies(
            @RequestParam(defaultValue = "0")    int    page,
            @RequestParam(defaultValue = "20")   int    size,
            @RequestParam(defaultValue = "name") String sortBy,
            @RequestParam(defaultValue = "asc")  String order
    ) {
        PagedMoviesDTO result = movieService.getAllMovies(page, size, sortBy, order);
        return ResponseEntity.ok(result);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/movies/search?q=<partial title>
    //
    // ⚠  MUST be declared before /{title} so Spring matches "search" as a
    //    literal path segment, not as a {title} variable.
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Lightweight autocomplete / type-ahead search on movie titles.
     *
     * Query parameters:
     *   q       - partial title string  (required)
     *   limit   - max results           (default 10, capped at 50)
     *
     * Example: GET /api/movies/search?q=para&limit=5
     *
     * Response: { "count": 3, "results": [ { id, name, year, rating, poster } ] }
     */
    @GetMapping("/search")
    public ResponseEntity<Map<String, Object>> searchMovies(
            @RequestParam String q,
            @RequestParam(defaultValue = "10") int limit
    ) {
        List<MovieSummaryDTO> results = movieService.searchMovies(q.trim(), limit);
        return ResponseEntity.ok(Map.of(
                "count",   results.size(),
                "results", results
        ));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/movies/{title}
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Returns the full dataset for a single movie identified by its title.
     *
     * Title-based (not ID-based) so the frontend and external services
     * (reviews, Oscars) never need to know our internal integer IDs.
     *
     * Path variable:
     *   title - exact movie title, URL-encoded (spaces → %20 or +)
     *
     * Successful response (200):
     *   { "movie": { id, name, year, tagline, description, runtime, rating,
     *                poster, genres, themes, countries, studios,
     *                languages, releases, actors, crew } }
     *
     * Not-found response (404):
     *   { "error": "No movie found with title: ...",
     *     "suggestions": [ { id, name, year, rating } ] }
     *
     * Example: GET /api/movies/Fight%20Club
     *          GET /api/movies/Parasite
     */
    @GetMapping("/{title}")
    public ResponseEntity<Map<String, Object>> getMovieByTitle(
            @PathVariable String title
    ) {
        MovieDetailDTO movie = movieService.getMovieByTitle(title);
        return ResponseEntity.ok(Map.of("movie", movie));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POST /api/movies/batch
    //
    // ⚠  MUST be declared before /{title} so Spring matches "batch" as a
    //    literal path segment, not as a {title} variable.
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Batch-resolves movie titles into card-ready DTOs.
     *
     * Used by the frontend to enrich popularity data (which only has titles)
     * with posters, descriptions, genres, and ratings from PostgreSQL.
     *
     * Request body: { "titles": ["Movie A", "Movie B", ...] }
     *
     * Response: { "count": 3, "movies": [ { id, name, year, rating, poster,
     *             description, genres, runtime } ] }
     */
    @PostMapping("/batch")
    public ResponseEntity<Map<String, Object>> getMoviesBatch(
            @RequestBody Map<String, List<String>> body
    ) {
        List<String> titles = body.getOrDefault("titles", List.of());
        List<MovieCardDTO> movies = movieService.getMovieCardsByTitles(titles);
        return ResponseEntity.ok(Map.of(
                "count",  movies.size(),
                "movies", movies
        ));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POST /api/movies/batch/slim  (Tier 1 — card render)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Tier 1: Ultra-slim batch resolution for initial card rendering.
     *
     * Returns ONLY id, name, and poster for each matched title.
     * No description, no genres, no rating — just what the static card needs.
     *
     * Cache-Control: public, max-age=3600 (1 hour)
     *   Movie posters and titles rarely change, so browsers and CDNs can
     *   cache this response. "public" means shared caches (CDN, proxy) can
     *   store it too. "max-age=3600" means the browser won't even make a
     *   network request for 1 hour — the response comes straight from the
     *   browser's HTTP cache, making subsequent homepage loads instant.
     *
     * Request body: { "titles": ["Movie A", "Movie B", ...] }
     * Response:     { "count": 3, "movies": [ { id, name, poster } ] }
     */
    @PostMapping("/batch/slim")
    public ResponseEntity<Map<String, Object>> getSlimBatch(
            @RequestBody Map<String, List<String>> body
    ) {
        List<String> titles = body.getOrDefault("titles", List.of());
        List<MovieSlimDTO> movies = movieService.getSlimCardsByTitles(titles);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(1, TimeUnit.HOURS).cachePublic())
                .body(Map.of(
                        "count",  movies.size(),
                        "movies", movies
                ));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/movies/hover/{id}  (Tier 2 — hover overlay)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Tier 2: Hover data for a single movie — genres, short description, rating.
     *
     * Fetched on-demand when the user hovers over a card (600ms delay).
     * The description is truncated to 200 characters server-side.
     *
     * Cache-Control: public, max-age=3600 (1 hour)
     *   Same rationale as the slim batch — genres and descriptions are
     *   effectively static. Caching means a second hover on the same card
     *   resolves from the browser cache with zero network cost.
     *
     * Response: { id, name, genres, description, rating, year, runtime }
     */
    @GetMapping("/hover/{id}")
    public ResponseEntity<MovieHoverDTO> getHoverData(
            @PathVariable Integer id
    ) {
        MovieHoverDTO hover = movieService.getHoverData(id);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(1, TimeUnit.HOURS).cachePublic())
                .body(hover);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/movies/expanded/{id}  (Tier 2.5 — chevron-down expand)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Tier 2.5: Expanded card data — full description + genres.
     *
     * Fetched when the user clicks the chevron-down on the overlay.
     * Returns the untruncated description and full genre list without
     * the weight of the full detail endpoint (no actors, crew, releases).
     *
     * Cache-Control: public, max-age=1800 (30 minutes)
     *   Slightly shorter cache since this is a less-frequently-hit endpoint
     *   and we want description updates to propagate reasonably fast.
     *
     * Response: { id, name, year, rating, poster, description, genres, runtime }
     */
    @GetMapping("/expanded/{id}")
    public ResponseEntity<MovieCardDTO> getExpandedData(
            @PathVariable Integer id
    ) {
        MovieCardDTO expanded = movieService.getExpandedData(id);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(30, TimeUnit.MINUTES).cachePublic())
                .body(expanded);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POST /api/movies/{id}/like
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Increments the persistent like counter for a movie.
     *
     * Likes are stored directly in PostgreSQL (movies.likes column) instead
     * of ephemeral Redis counters. This means:
     *   - Likes survive Redis flushes and restarts.
     *   - One fewer Redis key per movie to maintain.
     *   - Atomic SQL UPDATE prevents lost-update race conditions.
     *
     * Redis still handles the popularity tracking (counters + hot list)
     * via the MongoDB backend's trackLike() function — this endpoint
     * only persists the permanent counter.
     *
     * Response: { "likes": 42 }
     */
    @PostMapping("/{id}/like")
    public ResponseEntity<Map<String, Object>> likeMovie(
            @PathVariable Integer id
    ) {
        int newCount = movieService.likeMovie(id);
        return ResponseEntity.ok(Map.of("likes", newCount));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /health  (lightweight liveness probe)
    // ─────────────────────────────────────────────────────────────────────────
    // Note: registered at app level in a separate mapping below because
    //       /health should not be under /api/movies.

}
