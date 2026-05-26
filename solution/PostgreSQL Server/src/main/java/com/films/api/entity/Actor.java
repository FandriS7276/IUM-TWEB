package com.films.api.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Maps to the "actors" table.
 *
 * DB columns: row_id (BIGSERIAL, not in CSV), id (movie FK = CSV "id"), name, role
 *
 * @Id maps to "row_id" — the auto-generated surrogate PK, invisible to pgAdmin imports.
 * movieId maps to column "id" — matching the CSV header directly.
 * Spring Data derived queries use the Java field name "movieId":
 *   findByMovieId...  →  WHERE id = ?
 */
@Entity
@Table(name = "actors")
@Getter
@Setter
@NoArgsConstructor
public class Actor {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "row_id")
    private Long rowId;

    /** Java field: movieId → DB column: id (matches CSV header "id") */
    @Column(name = "id", nullable = false)
    private Integer movieId;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "role")
    private String role;
}
