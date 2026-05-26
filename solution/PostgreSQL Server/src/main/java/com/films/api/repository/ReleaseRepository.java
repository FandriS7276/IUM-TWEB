package com.films.api.repository;

import com.films.api.entity.Release;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ReleaseRepository extends JpaRepository<Release, Long> {

    List<Release> findByMovieIdOrderByDate(Integer movieId);
}
