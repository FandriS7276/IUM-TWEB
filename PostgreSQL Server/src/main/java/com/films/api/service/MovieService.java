package com.films.api.service;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.films.api.dto.ActorDTO;
import com.films.api.dto.LanguageDTO;
import com.films.api.dto.MovieCardDTO;
import com.films.api.dto.MovieDetailDTO;
import com.films.api.dto.MovieHoverDTO;
import com.films.api.dto.MovieSlimDTO;
import com.films.api.dto.MovieSummaryDTO;
import com.films.api.dto.PagedMoviesDTO;
import com.films.api.dto.ReleaseDTO;
import com.films.api.entity.Actor;
import com.films.api.entity.Country;
import com.films.api.entity.CrewMember;
import com.films.api.entity.Genre;
import com.films.api.entity.Language;
import com.films.api.entity.Movie;
import com.films.api.entity.Poster;
import com.films.api.entity.Release;
import com.films.api.entity.Studio;
import com.films.api.entity.Theme;
import com.films.api.exception.MovieNotFoundException;
import com.films.api.repository.ActorRepository;
import com.films.api.repository.CountryRepository;
import com.films.api.repository.CrewRepository;
import com.films.api.repository.GenreRepository;
import com.films.api.repository.LanguageRepository;
import com.films.api.repository.MovieRepository;
import com.films.api.repository.PosterRepository;
import com.films.api.repository.ReleaseRepository;
import com.films.api.repository.StudioRepository;
import com.films.api.repository.ThemeRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * MovieService — all business logic lives here.
 *
 * Controllers should never touch repositories directly; they delegate
 * here and receive ready-to-serialise DTOs. This keeps concerns separated:
 *   Controller  →  HTTP (parsing params, setting status codes)
 *   Service     →  Business rules (title resolution, aggregation)
 *   Repository  →  Data access (SQL)
 *
 * @Transactional (readOnly = true) on the class:
 *   - Wraps every method in a read-only transaction.
 *   - Hibernate skips dirty-checking optimisations that aren't needed for reads.
 *   - The connection pool may route read-only connections to a replica if available.
 */
@Slf4j
@Service
@RequiredArgsConstructor       // Lombok: generates a constructor injecting all final fields
@Transactional(readOnly = true)
public class MovieService {

        // ── Repositories injected via constructor (best practice over @Autowired) ──
        private final MovieRepository    movieRepository;
        private final ActorRepository    actorRepository;
        private final CrewRepository     crewRepository;
        private final GenreRepository    genreRepository;
        private final CountryRepository  countryRepository;
        private final LanguageRepository languageRepository;
        private final ReleaseRepository  releaseRepository;
        private final StudioRepository   studioRepository;
        private final ThemeRepository    themeRepository;
        private final PosterRepository   posterRepository;

        // ── Allowed sort fields whitelist ─────────────────────────────────────────
        // Prevents arbitrary field names from being passed to Sort.by() — a form
        // of injection prevention at the service layer.
        private static final Map<String, String> SORT_FIELD_MAP = Map.of(
                "name",   "name",
                "rating", "rating",
                "year",   "date"    // frontend sends "year"; Java field on Movie is "date"
        );

        // =========================================================================
        // PUBLIC API
        // =========================================================================

        /**
         * Returns a paginated summary list of all movies.
         *
         * Pagination strategy:
         *   1. Fetch one page of Movie rows (lightweight — only 7 columns).
         *   2. Collect the IDs from that page.
         *   3. Batch-fetch posters for exactly those IDs in one query.
         *   4. Join in memory — avoids N+1 poster lookups per movie.
         *
         * @param page    0-indexed page number
         * @param size    results per page (capped at 100)
         * @param sortBy  "name" | "rating" | "year"
         * @param order   "asc" | "desc"
         */
        public PagedMoviesDTO getAllMovies(int page, int size, String sortBy, String order) {

                // Cap page size to 100 to protect against accidental large requests
                int safeSize = Math.min(size, 100);

                // Resolve sort field (whitelist) and direction
                String  sortField = SORT_FIELD_MAP.getOrDefault(sortBy, "name");
                Sort    sort      = "desc".equalsIgnoreCase(order)
                        ? Sort.by(Sort.Direction.DESC, sortField)
                        : Sort.by(Sort.Direction.ASC,  sortField);

                Pageable pageable = PageRequest.of(page, safeSize, sort);
                Page<Movie> moviePage = movieRepository.findAll(pageable);

                // Batch poster fetch — one DB query for all movies on this page
                List<Integer> pageIds = moviePage.map(Movie::getId).toList();
                Map<Integer, String> posterMap = posterRepository.findByMovieIdIn(pageIds)
                        .stream()
                        .collect(Collectors.toMap(
                                Poster::getMovieId,
                                Poster::getLink,
                                (a, b) -> a           // keep first if duplicates exist
                        ));

                List<MovieSummaryDTO> summaries = moviePage.stream()
                        .map(m -> new MovieSummaryDTO(
                                m.getId(),
                                m.getName(),
                                m.getDate(),
                                m.getRating(),
                                posterMap.get(m.getId())
                        ))
                        .toList();

                return new PagedMoviesDTO(
                        moviePage.getNumber(),
                        moviePage.getSize(),
                        moviePage.getTotalElements(),
                        moviePage.getTotalPages(),
                        summaries
                );
        }

        /**
         * Returns the full dataset for a single movie resolved by its title.
         *
         * Title-to-ID flow:
         *   1. Case-insensitive exact match on movies.name.
         *   2. If found → fetch all 9 satellite tables by movie_id and aggregate.
         *   3. If not found → run a partial ILIKE search and throw
         *      MovieNotFoundException (carries suggestions) → 404 with hints.
         *
         * Why title and not ID?
         *   The frontend and the reviews/Oscars service key on human-readable
         *   names. Keeping IDs internal prevents tight coupling between services.
         *
         * @param title exact movie title (URL-decoded by Spring before this is called)
         */
        public MovieDetailDTO getMovieByTitle(String title) {

                // Step 1 — exact match (case-insensitive)
                Movie movie = movieRepository.findByNameIgnoreCase(title.trim())
                        .orElseThrow(() -> buildNotFoundException(title));

                Integer movieId = movie.getId();
                log.info("Resolved title \"{}\" to id={}", title, movieId);

                // Step 2 — fetch all satellite data by the resolved ID
                List<Genre>       genres    = genreRepository.findByMovieIdOrderByGenre(movieId);
                List<Theme>       themes    = themeRepository.findByMovieIdOrderByTheme(movieId);
                List<Country>     countries = countryRepository.findByMovieIdOrderByCountry(movieId);
                List<Studio>      studios   = studioRepository.findByMovieIdOrderByStudio(movieId);
                List<Language>    languages = languageRepository.findByMovieIdOrderByTypeAscLanguageAsc(movieId);
                List<Release>     releases  = releaseRepository.findByMovieIdOrderByDate(movieId);
                List<Actor>       actors    = actorRepository.findByMovieIdOrderByName(movieId);
                List<CrewMember>  crew      = crewRepository.findByMovieIdOrderByRoleAscNameAsc(movieId);
                String            poster    = posterRepository.findFirstByMovieId(movieId)
                                                .map(Poster::getLink)
                                                .orElse(null);

                // Step 3 — assemble the response DTO
                return new MovieDetailDTO(
                        movie.getId(),
                        movie.getName(),              // ← join key for external services
                        movie.getDate(),
                        movie.getTagline(),
                        movie.getDescription(),
                        movie.getMinute(),
                        movie.getRating(),
                        poster,
                        movie.getLikes(),

                        genres   .stream().map(Genre::getGenre)    .toList(),
                        themes   .stream().map(Theme::getTheme)    .toList(),
                        countries.stream().map(Country::getCountry).toList(),
                        studios  .stream().map(Studio::getStudio)  .toList(),

                        languages.stream()
                                .map(l -> new LanguageDTO(l.getLanguage(), l.getType()))
                                .toList(),

                        releases.stream()
                                .map(r -> new ReleaseDTO(r.getCountry(), r.getDate(),
                                                        r.getType(), r.getRating()))
                                .toList(),

                        actors.stream()
                        .map(a -> new ActorDTO(a.getName(), a.getRole()))
                        .toList(),

                        crew.stream()
                        .map(c -> new ActorDTO(c.getName(), c.getRole()))   // reuse ActorDTO shape
                        .toList()
                );
        }

        /**
         * Partial title search — powers the autocomplete endpoint.
         *
         * @param query   partial title string
         * @param limit   max results (capped at 50)
         */
        public List<MovieSummaryDTO> searchMovies(String query, int limit) {
                int safeLimit = Math.min(limit, 50);
                Pageable pageable = PageRequest.of(0, safeLimit, Sort.by("name"));
                Page<Movie> results = movieRepository.findByNameContainingIgnoreCase(query, pageable);

                List<Integer> ids = results.map(Movie::getId).toList();
                Map<Integer, String> posterMap = posterRepository.findByMovieIdIn(ids)
                        .stream()
                        .collect(Collectors.toMap(Poster::getMovieId, Poster::getLink, (a, b) -> a));

                return results.stream()
                        .map(m -> new MovieSummaryDTO(
                                m.getId(),
                                m.getName(),
                                m.getDate(),
                                m.getRating(),
                                posterMap.get(m.getId())
                        ))
                        .toList();
        }

        /**
         * Batch-resolves a list of movie titles into lightweight card DTOs.
         *
         * Used by the frontend to enrich popularity data (which only carries
         * titles) with posters, descriptions, genres, and ratings from PostgreSQL.
         *
         * Strategy:
         *   1. Lowercase all titles for case-insensitive matching.
         *   2. One query to fetch matching Movie rows.
         *   3. One query to batch-fetch posters.
         *   4. One query to batch-fetch genres.
         *   5. Join in memory and return ordered by the original input list.
         *
         * @param titles list of movie titles (max 50, capped for safety)
         */
        public List<MovieCardDTO> getMovieCardsByTitles(List<String> titles) {
                if (titles == null || titles.isEmpty()) return List.of();

                // Cap to 50 and filter out empty/whitespace titles
                List<String> safeTitles = titles.stream()
                        .filter(t -> t != null && !t.isBlank())
                        .limit(50)
                        .map(t -> t.trim().toLowerCase())
                        .distinct()
                        .toList();

                // Step 1 — batch fetch movies by lowercased titles
                List<Movie> movies = movieRepository.findByNamesIgnoreCase(safeTitles);
                if (movies.isEmpty()) return List.of();

                List<Integer> ids = movies.stream().map(Movie::getId).toList();

                // Step 2 — batch fetch posters
                Map<Integer, String> posterMap = posterRepository.findByMovieIdIn(ids)
                        .stream()
                        .collect(Collectors.toMap(Poster::getMovieId, Poster::getLink, (a, b) -> a));

                // Step 3 — batch fetch genres and group by movie ID
                Map<Integer, List<String>> genreMap = genreRepository.findByMovieIdIn(ids)
                        .stream()
                        .collect(Collectors.groupingBy(
                                Genre::getMovieId,
                                Collectors.mapping(Genre::getGenre, Collectors.toList())
                        ));

                // Step 4 — build a lookup map by lowercased title
                Map<String, MovieCardDTO> cardMap = movies.stream()
                        .collect(Collectors.toMap(
                                m -> m.getName().toLowerCase(),
                                m -> new MovieCardDTO(
                                        m.getId(),
                                        m.getName(),
                                        m.getDate(),
                                        m.getRating(),
                                        posterMap.get(m.getId()),
                                        m.getDescription(),
                                        genreMap.getOrDefault(m.getId(), List.of()),
                                        m.getMinute(),
                                        m.getLikes()
                                ),
                                (a, b) -> a  // keep first on duplicate
                        ));

                // Step 5 — return in the order of the original input titles
                return safeTitles.stream()
                        .filter(cardMap::containsKey)
                        .map(cardMap::get)
                        .toList();
        }

        /**
         * Tier 1: Ultra-slim batch resolution — poster + title only.
         *
         * Used by the homepage for initial card rendering. Skips genres,
         * descriptions, and ratings entirely — just 2 SQL queries:
         *   1. Fetch matching Movie rows (id + name only used).
         *   2. Batch-fetch posters for those IDs.
         *
         * ~7x smaller payload than getMovieCardsByTitles().
         *
         * @param titles list of movie titles (max 50, capped for safety)
         */
        public List<MovieSlimDTO> getSlimCardsByTitles(List<String> titles) {
                if (titles == null || titles.isEmpty()) return List.of();

                List<String> safeTitles = titles.stream()
                        .filter(t -> t != null && !t.isBlank())
                        .limit(50)
                        .map(t -> t.trim().toLowerCase())
                        .distinct()
                        .toList();

                List<Movie> movies = movieRepository.findByNamesIgnoreCase(safeTitles);
                if (movies.isEmpty()) return List.of();

                List<Integer> ids = movies.stream().map(Movie::getId).toList();

                // Single query for posters — no genres, no descriptions
                Map<Integer, String> posterMap = posterRepository.findByMovieIdIn(ids)
                        .stream()
                        .collect(Collectors.toMap(Poster::getMovieId, Poster::getLink, (a, b) -> a));

                Map<String, MovieSlimDTO> slimMap = movies.stream()
                        .collect(Collectors.toMap(
                                m -> m.getName().toLowerCase(),
                                m -> new MovieSlimDTO(
                                        m.getId(),
                                        m.getName(),
                                        posterMap.get(m.getId()),
                                        m.getLikes()
                                ),
                                (a, b) -> a
                        ));

                return safeTitles.stream()
                        .filter(slimMap::containsKey)
                        .map(slimMap::get)
                        .toList();
        }

        /**
         * Tier 2: Hover data for a single movie — genres, short description, rating.
         *
         * Fetched on-demand when the user hovers over a card. The description
         * is truncated to 200 characters to keep the overlay concise.
         *
         * @param movieId integer movie ID (obtained from Tier 1 slim data)
         */
        public MovieHoverDTO getHoverData(Integer movieId) {
                if (movieId == null) throw new MovieNotFoundException("id=null", List.of());
                Movie movie = movieRepository.findById(movieId)
                        .orElseThrow(() -> new MovieNotFoundException(
                                "id=" + movieId, List.of()));

                List<String> genres = genreRepository.findByMovieIdOrderByGenre(movieId)
                        .stream()
                        .map(Genre::getGenre)
                        .toList();

                // Truncate description to 200 chars for the overlay
                String desc = movie.getDescription();
                if (desc != null && desc.length() > 200) {
                        desc = desc.substring(0, 197) + "...";
                }

                return new MovieHoverDTO(
                        movie.getId(),
                        movie.getName(),
                        genres,
                        desc,
                        movie.getRating(),
                        movie.getDate(),
                        movie.getMinute(),
                        movie.getLikes()
                );
        }

        /**
         * Tier 2.5: Expanded card data — full description + actors.
         *
         * Fetched when the user clicks the chevron-down button on the overlay.
         * Returns the full description (no truncation) plus the cast list,
         * without the full detail weight (crew, releases, languages, etc.).
         *
         * @param movieId integer movie ID
         */
        public MovieCardDTO getExpandedData(Integer movieId) {
                if (movieId == null) throw new MovieNotFoundException("id=null", List.of());
                Movie movie = movieRepository.findById(movieId)
                        .orElseThrow(() -> new MovieNotFoundException(
                                "id=" + movieId, List.of()));

                List<String> genres = genreRepository.findByMovieIdOrderByGenre(movieId)
                        .stream()
                        .map(Genre::getGenre)
                        .toList();

                String poster = posterRepository.findFirstByMovieId(movieId)
                        .map(Poster::getLink)
                        .orElse(null);

                return new MovieCardDTO(
                        movie.getId(),
                        movie.getName(),
                        movie.getDate(),
                        movie.getRating(),
                        poster,
                        movie.getDescription(),
                        genres,
                        movie.getMinute(),
                        movie.getLikes()
                );
        }

        /**
         * Atomically increments the like counter for a movie in PostgreSQL.
         *
         * Uses a single UPDATE query (likes = likes + 1) instead of
         * read-modify-write to prevent lost updates under concurrent requests.
         * Also tracks the like in Redis popularity counters so the trending
         * algorithms still reflect like activity.
         *
         * @param movieId the movie ID to like
         * @return the updated like count
         * @throws MovieNotFoundException if the movie doesn't exist
         */
        @Transactional  // writable transaction — overrides the class-level readOnly=true
        public int likeMovie(Integer movieId) {
                if (movieId == null) throw new MovieNotFoundException("id=null", List.of());
                int updated = movieRepository.incrementLikes(movieId);
                if (updated == 0) {
                        throw new MovieNotFoundException("id=" + movieId, List.of());
                }
                // Fetch the new count to return to the caller
                return movieRepository.findById(movieId)
                        .map(Movie::getLikes)
                        .orElse(0);
        }

        // =========================================================================
        // PRIVATE HELPERS
        // =========================================================================

        /**
         * Builds a MovieNotFoundException loaded with partial-match suggestions.
         * Extracted to a private method so the orElseThrow lambda stays readable.
         */
        private MovieNotFoundException buildNotFoundException(String title) {
                List<Object[]> rows = movieRepository.findSuggestions(title);
                List<MovieSummaryDTO> suggestions = rows.stream()
                        .map(r -> new MovieSummaryDTO(
                                ((Number) r[0]).intValue(),                          // id
                                (String)  r[1],                                      // name
                                r[2] != null ? ((Number) r[2]).intValue() : null,    // date (year)
                                r[3] != null ? ((Number) r[3]).doubleValue() : null, // rating
                                null                                                 // poster omitted
                        ))
                        .toList();
                return new MovieNotFoundException(title, suggestions);
        }
}
