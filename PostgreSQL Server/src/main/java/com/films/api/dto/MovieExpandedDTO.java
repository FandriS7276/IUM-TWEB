package com.films.api.dto;

import java.util.List;

/**
 * Tier 2.5 payload — fetched when the user clicks the chevron-down on the
 * hover overlay.  Carries the full (untruncated) description, the genre list,
 * and the leading cast so the expanded card section feels like a mini-detail
 * view without loading the full Tier 3 MovieDetailDTO (which also includes
 * crew, releases, themes, countries, languages, studios).
 */
public record MovieExpandedDTO(
        Integer      id,
        String       name,
        Integer      year,
        Double       rating,
        String       poster,
        String       description,    // full text — no 200-char truncation
        List<String> genres,
        Integer      runtime,
        Integer      likes,
        List<ActorDTO> actors        // leading cast (name + role)
) {}
