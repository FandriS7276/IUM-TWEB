package com.films.api.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.films.api.entity.Country;

public interface CountryRepository extends JpaRepository<Country, Long> {

    List<Country> findByMovieIdOrderByCountry(Integer movieId);
}
