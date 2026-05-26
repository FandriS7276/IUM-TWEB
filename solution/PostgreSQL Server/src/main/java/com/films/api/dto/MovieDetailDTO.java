package com.films.api.dto;

import java.util.List;

/**
 * Full movie payload — everything the frontend needs for a detail view.
 *
 * The `name` field is intentionally placed at the top level (not nested)
 * because it doubles as the join key for the reviews / Oscars service,
 * which indexes data by film title rather than by our internal integer ID.
 *
 * Jackson serialises this record to JSON automatically because Spring Boot
 * includes the Jackson library via spring-boot-starter-web.
 */
public record MovieDetailDTO(
        // ── Identity ───────────────────────────────────────────────────────
        Integer id,
        String  name,          // primary join key for external services

        // ── Core metadata ──────────────────────────────────────────────────
        Integer year,
        String  tagline,
        String  description,
        Integer runtime,
        Double  rating,
        String  poster,
        Integer likes,

        // ── Simple string lists ────────────────────────────────────────────
        List<String> genres,
        List<String> themes,
        List<String> countries,
        List<String> studios,

        // ── Structured lists ───────────────────────────────────────────────
        List<LanguageDTO> languages,
        List<ReleaseDTO>  releases,
        List<ActorDTO>    actors,
        List<ActorDTO>    crew      // ActorDTO shape works for crew too (name + role)
) {}
