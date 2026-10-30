package com.ddpetcare.api.client;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClientRepository extends JpaRepository<Client, Long> {

    Optional<Client> findByPhone(String phone);

    @EntityGraph(attributePaths = "dogs")
    List<Client> findAllByOrderByNameAscIdAsc();
}
