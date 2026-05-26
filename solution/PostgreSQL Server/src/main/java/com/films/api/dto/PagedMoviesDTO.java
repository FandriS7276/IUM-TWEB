package com.films.api.dto;

import java.util.List;

/**
 * Wrapper for paginated movie list responses.
 * Provides metadata the frontend needs to render pagination controls.
 */
public record PagedMoviesDTO(
        int                  page,
        int                  size,
        long                 totalElements,
        int                  totalPages,
        List<MovieSummaryDTO> movies
) {}
