package com.films.api.exception;

import com.films.api.dto.MovieSummaryDTO;
import lombok.Getter;

import java.util.List;

/**
 * Thrown by MovieService when a title lookup fails.
 *
 * Carries a list of partial-match suggestions so the global exception
 * handler can return them in the 404 response body — saving the frontend
 * from needing a second "search" round-trip just to show corrections.
 */
@Getter
public class MovieNotFoundException extends RuntimeException {

    /** Up to 5 partial-match results for the "did you mean?" UX */
    private final List<MovieSummaryDTO> suggestions;

    public MovieNotFoundException(String title, List<MovieSummaryDTO> suggestions) {
        super("No movie found with title: \"" + title + "\"");
        this.suggestions = suggestions;
    }
}
