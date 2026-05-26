package com.films.api.repository;

import com.films.api.entity.CrewMember;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CrewRepository extends JpaRepository<CrewMember, Long> {

    List<CrewMember> findByMovieIdOrderByRoleAscNameAsc(Integer movieId);
}
