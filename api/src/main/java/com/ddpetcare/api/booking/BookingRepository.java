package com.ddpetcare.api.booking;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BookingRepository extends JpaRepository<Booking, Long> {

    @EntityGraph(attributePaths = {"client", "dog", "stays"})
    List<Booking> findAllByOrderByCreatedAtDescIdDesc();

    @EntityGraph(attributePaths = {"client", "dog", "stays"})
    Optional<Booking> findWithDetailsById(Long id);
}
