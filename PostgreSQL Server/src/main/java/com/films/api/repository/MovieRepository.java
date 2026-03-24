package com.films.api.repository;

import com.films.api.entity.Movie;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import org.springframework.data.jpa.repository.Modifying;

import java.util.List;
import java.util.Optional;

/**
 * Spring Data JPA repository for the Movie entity.
 *
 * Why extend JpaRepository<Movie, Integer>?
 *   JpaRepository gives us save(), findById(), findAll(Pageable), delete(),
 *   count(), etc. for free — no SQL needed.
 *   The generic types are: <Entity type, PK type>.
 *
 * Method-name-based query derivation:
 *   Spring parses method names like findByNameIgnoreCase and automatically
 *   generates the JPQL — no @Query annotation needed for simple lookups.
 */
public interface MovieRepository extends JpaRepository<Movie, Integer> {

    /**
     * Exact title lookup (case-insensitive).
     *
     * This is step 1 of the title → ID resolution flow.
     * JPQL generated: SELECT m FROM Movie m WHERE LOWER(m.name) = LOWER(:name)
     *
     * @param name the exact movie title sent by the frontend
     */
    Optional<Movie> findByNameIgnoreCase(String name);

    /**
     * Partial title search — powers the autocomplete / search endpoint.
     *
     * Returns a Page<Movie> so the caller can control result size via Pageable.
     * The Pageable also carries the sort direction.
     *
     * JPQL generated: SELECT m FROM Movie m
     *                 WHERE LOWER(m.name) LIKE LOWER('%:name%')
     *                 ORDER BY <pageable sort>
     *
     * @param name    partial title string
     * @param pageable paging + sorting descriptor
     */
    Page<Movie> findByNameContainingIgnoreCase(String name, Pageable pageable);

    /**
     * Finds up to 5 partial matches — used to populate the "did you mean?"
     * suggestions when an exact title lookup returns nothing.
     *
     * Using a native query here so we can call LOWER() explicitly and
     * keep the result limited without a Pageable argument.
     *
     * @param title partial or misspelled title
     */
    @Query(value = """
            SELECT id, name, date, rating, NULL AS poster
            FROM movies
            WHERE name ILIKE CONCAT('%', :title, '%')
            ORDER BY LOWER(name)
            LIMIT 5
            """, nativeQuery = true)
    List<Object[]> findSuggestions(@Param("title") String title);

    /**
     * Batch exact-match lookup by a list of titles (case-insensitive).
     * Used by the /batch endpoint to resolve multiple movie titles in a
     * single query instead of N separate calls.
     *
     * JPQL generated: SELECT m FROM Movie m WHERE LOWER(m.name) IN (...)
     */
    @Query("SELECT m FROM Movie m WHERE LOWER(m.name) IN :names")
    List<Movie> findByNamesIgnoreCase(@Param("names") List<String> names);

    /**
     * Atomically increments the likes counter for a movie.
     *
     * Uses a native UPDATE ... SET likes = likes + 1 instead of
     * read-modify-write (findById → setLikes → save) to avoid lost-update
     * race conditions under concurrent likes.
     *
     * @return number of rows updated (1 if movie exists, 0 if not)
     */
    @Modifying
    @Query("UPDATE Movie m SET m.likes = m.likes + 1 WHERE m.id = :id")
    int incrementLikes(@Param("id") Integer id);
}
