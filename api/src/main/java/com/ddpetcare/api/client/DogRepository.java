package com.ddpetcare.api.client;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface DogRepository extends JpaRepository<Dog, Long> {

    // Same normalisation as the dogs_client_id_lower_name_key unique index.
    @Query("select d from Dog d where d.client = :client and lower(trim(d.name)) = lower(trim(:name))")
    Optional<Dog> findByClientAndName(Client client, String name);
}
