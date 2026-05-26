package com.films.api.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "crew")
@Getter
@Setter
@NoArgsConstructor
public class CrewMember {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "row_id")
    private Long rowId;

    @Column(name = "id", nullable = false)
    private Integer movieId;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "role")
    private String role;
}
