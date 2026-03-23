package com.films.api.repository;

import com.films.api.entity.Poster;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PosterRepository extends JpaRepository<Poster, Long> {

    /** Returns one poster per movie (dataset has at most one per film) */
    Optional<Poster> findFirstByMovieId(Integer movieId);

    /**
     * Batch fetch posters for a list of IDs — used by the getAllMovies
     * endpoint to avoid N+1 queries on the summary list.
     */
    List<Poster> findByMovieIdIn(List<Integer> movieIds);
}
