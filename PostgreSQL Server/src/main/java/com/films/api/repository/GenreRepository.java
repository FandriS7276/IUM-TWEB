package com.films.api.repository;

import com.films.api.entity.Genre;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface GenreRepository extends JpaRepository<Genre, Long> {

    List<Genre> findByMovieIdOrderByGenre(Integer movieId);

    /** Batch fetch genres for multiple movie IDs in one query. */
    List<Genre> findByMovieIdIn(List<Integer> movieIds);
}
