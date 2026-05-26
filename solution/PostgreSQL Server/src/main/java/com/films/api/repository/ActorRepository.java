package com.films.api.repository;

import com.films.api.entity.Actor;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Derived query: Spring generates
 *   SELECT * FROM actors WHERE movie_id = ? ORDER BY name
 */
public interface ActorRepository extends JpaRepository<Actor, Long> {

    List<Actor> findByMovieIdOrderByName(Integer movieId);

    /** Batch fetch actors for multiple movie IDs in one query. */
    List<Actor> findByMovieIdIn(List<Integer> movieIds);
}
