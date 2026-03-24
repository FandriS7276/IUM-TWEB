package com.films.api.dto;

/**
 * Ultra-lightweight movie payload for initial card rendering.
 * Contains ONLY what the static card needs: id, name, and poster URL.
 *
 * This is the Tier 1 payload — used by the homepage batch endpoint
 * to paint movie cards as fast as possible without fetching
 * descriptions, genres, ratings, or any satellite data.
 *
 * ~200 bytes per movie vs ~1.5 KB for the full MovieCardDTO.
 */
public record MovieSlimDTO(
        Integer id,
        String  name,
        String  poster,
        Integer likes
) {}
