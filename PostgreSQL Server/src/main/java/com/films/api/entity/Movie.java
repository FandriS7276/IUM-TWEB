package com.films.api.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Maps to the "movies" table.
 * Column names match movies_cleaned.csv exactly: id, name, date, tagline,
 * description, minute, rating — so pgAdmin can import the CSV with zero
 * column remapping.
 */
@Entity
@Table(name = "movies")
@Getter
@Setter
@NoArgsConstructor
public class Movie {

    @Id
    @Column(name = "id")
    private Integer id;

    @Column(name = "name", nullable = false)
    private String name;

    /** CSV column: "date" (stored as "2023.0"; PostgreSQL casts to INTEGER on import) */
    @Column(name = "date")
    private Integer date;

    @Column(name = "tagline")
    private String tagline;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    /** CSV column: "minute" — runtime in minutes */
    @Column(name = "minute")
    private Integer minute;

    @Column(name = "rating", columnDefinition = "NUMERIC")
    private Double rating;
}
