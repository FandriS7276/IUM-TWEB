package com.films.api.dto;

import java.time.LocalDate;

public record ReleaseDTO(String country, LocalDate date, String type, String rating) {}
