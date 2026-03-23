package com.films.api.repository;

import com.films.api.entity.Theme;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ThemeRepository extends JpaRepository<Theme, Long> {

    List<Theme> findByMovieIdOrderByTheme(Integer movieId);
}
