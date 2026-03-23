package com.films.api.dto;

import java.util.List;

/**
 * Tier 2 payload — fetched on hover to populate the floating overlay.
 * Carries genres, a truncated description, rating, year, and runtime
 * without the heavy satellite data (actors, crew, releases, etc.).
 *
 * The description is capped at 200 characters server-side so the
 * overlay renders a concise summary. The full text lives in the
 * MovieDetailDTO (Tier 3).
 */
public record MovieHoverDTO(
        Integer      id,
        String       name,
        List<String> genres,
        String       description,
        Double       rating,
        Integer      year,
        Integer      runtime
) {}
