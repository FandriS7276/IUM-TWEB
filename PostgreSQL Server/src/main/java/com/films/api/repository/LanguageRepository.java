package com.films.api.repository;

import com.films.api.entity.Language;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LanguageRepository extends JpaRepository<Language, Long> {

    List<Language> findByMovieIdOrderByTypeAscLanguageAsc(Integer movieId);
}
