package com.ddpetcare.api.client;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ClientService {

    private final ClientRepository clients;

    public ClientService(ClientRepository clients) {
        this.clients = clients;
    }

    @Transactional(readOnly = true)
    public List<ClientResponse> list() {
        return clients.findAllByOrderByNameAscIdAsc().stream().map(ClientResponse::from).toList();
    }
}
