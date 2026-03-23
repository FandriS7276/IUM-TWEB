package com.films.api.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;

@Entity
@Table(name = "releases")
@Getter
@Setter
@NoArgsConstructor
public class Release {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "row_id")
    private Long rowId;

    @Column(name = "id", nullable = false)
    private Integer movieId;

    @Column(name = "country")
    private String country;

    /** CSV column: "date" — maps to PostgreSQL DATE type via Hibernate */
    @Column(name = "date")
    private LocalDate date;

    @Column(name = "type")
    private String type;

    @Column(name = "rating")
    private String rating;
}
