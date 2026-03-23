package com.films.api.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "posters")
@Getter
@Setter
@NoArgsConstructor
public class Poster {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "row_id")
    private Long rowId;

    @Column(name = "id", nullable = false)
    private Integer movieId;

    @Column(name = "link", nullable = false)
    private String link;
}
