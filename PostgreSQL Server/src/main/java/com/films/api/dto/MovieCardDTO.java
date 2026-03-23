package com.films.api.dto;

import java.util.List;

/**
 * Lightweight movie payload used for batch lookups from the homepage.
 * Carries enough data for a movie card (poster, description, genres)
 * without the heavy satellite data (actors, crew, releases, etc.).
 */
public record MovieCardDTO(
        Integer      id,
        String       name,
        Integer      year,
        Double       rating,
        String       poster,
        String       description,
        List<String> genres,
        Integer      runtime
) {}
