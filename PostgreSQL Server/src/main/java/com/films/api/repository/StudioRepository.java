package com.films.api.repository;

import com.films.api.entity.Studio;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface StudioRepository extends JpaRepository<Studio, Long> {

    List<Studio> findByMovieIdOrderByStudio(Integer movieId);
}
