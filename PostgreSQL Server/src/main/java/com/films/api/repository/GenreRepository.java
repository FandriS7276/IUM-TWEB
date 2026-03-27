package com.films.api.repository;

import com.films.api.entity.Genre;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface GenreRepository extends JpaRepository<Genre, Long> {

    List<Genre> findByMovieIdOrderByGenre(Integer movieId);

    /** Batch fetch genres for multiple movie IDs in one query. */
    List<Genre> findByMovieIdIn(List<Integer> movieIds);

    /**
     * Returns movie IDs for a given genre, ordered by movie rating descending.
     * Used by the genre carousel feature on the homepage.
     * The join with movies ensures we sort by rating and cap results efficiently.
     */
    @Query(value = """
            SELECT g.id FROM genres g
            INNER JOIN movies m ON m.id = g.id
            WHERE LOWER(g.genre) = LOWER(:genre)
            ORDER BY m.rating DESC NULLS LAST
            LIMIT :limit
            """, nativeQuery = true)
    List<Integer> findTopMovieIdsByGenre(@Param("genre") String genre, @Param("limit") int limit);
}
