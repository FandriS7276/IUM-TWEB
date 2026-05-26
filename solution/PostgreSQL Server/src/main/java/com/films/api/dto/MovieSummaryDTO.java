package com.films.api.dto;

/**
 * Lightweight movie representation used in the paginated list endpoint.
 * Only carries the fields needed for a catalogue/card view — NOT the heavy
 * satellite data (actors, crew, releases, etc.).
 *
 * Also used as the "suggestion" payload when a title lookup returns no
 * exact match, so the frontend can offer spelling corrections.
 */
public record MovieSummaryDTO(
        Integer id,
        String  name,
        Integer year,
        Double  rating,
        String  poster   // may be null if no poster is in the dataset
) {}
