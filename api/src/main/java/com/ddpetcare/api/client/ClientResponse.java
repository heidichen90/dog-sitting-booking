package com.ddpetcare.api.client;

import java.util.List;

public record ClientResponse(Long id, String name, String phone, List<DogResponse> dogs) {

    public record DogResponse(Long id, String name) {
    }

    static ClientResponse from(Client client) {
        return new ClientResponse(client.getId(), client.getName(), client.getPhone(),
                client.getDogs().stream().map(dog -> new DogResponse(dog.getId(), dog.getName())).toList());
    }
}
