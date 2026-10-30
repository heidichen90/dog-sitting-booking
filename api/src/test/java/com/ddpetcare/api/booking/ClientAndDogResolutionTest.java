package com.ddpetcare.api.booking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import com.ddpetcare.api.DatabaseTest;
import com.ddpetcare.api.TestRequests;
import org.junit.jupiter.api.Test;

class ClientAndDogResolutionTest extends DatabaseTest {

    @Test
    void usesExistingClientAndDog() throws Exception {
        long client = insertClient("Sarah Lee", null);
        long dog = insertDog(client, "Biscuit");

        postJson("/bookings", TestRequests.load("bookings/create-existing-client-existing-dog.json",
                Map.of("clientId", client, "dogId", dog)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.client.id").value(client))
                .andExpect(jsonPath("$.dog.id").value(dog));
    }

    @Test
    void reusesDogWithSameNameIgnoringCaseAndSpaces() throws Exception {
        long client = insertClient("Sarah Lee", null);
        long dog = insertDog(client, "Biscuit");

        postJson("/bookings", TestRequests.load("bookings/create-reuse-dog-different-case.json",
                Map.of("clientId", client)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.dog.id").value(dog))
                .andExpect(jsonPath("$.dog.name").value("Biscuit"));

        assertThat(jdbc.sql("SELECT count(*) FROM dogs WHERE client_id = ?").param(client)
                .query(Long.class).single()).isEqualTo(1);
    }

    @Test
    void unknownClientIsNotFound() throws Exception {
        postJson("/bookings", TestRequests.load("bookings/create-unknown-client.json"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.title").value("Not found"))
                .andExpect(jsonPath("$.detail").value("Client 999999999 not found"));
    }

    @Test
    void unknownDogIsNotFound() throws Exception {
        long client = insertClient("Sarah Lee", null);

        postJson("/bookings", TestRequests.load("bookings/create-unknown-dog.json", Map.of("clientId", client)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Dog 999999999 not found"));
    }

    @Test
    void rejectsDogOfAnotherClient() throws Exception {
        long sarah = insertClient("Sarah Lee", null);
        long tom = insertClient("Tom Hall", null);
        long tomsDog = insertDog(tom, "Rex");

        postJson("/bookings", TestRequests.load("bookings/create-dog-of-other-client.json",
                Map.of("clientId", sarah, "dogId", tomsDog)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Invalid request"))
                .andExpect(jsonPath("$.detail").value(containsString("does not belong")));
    }

    @Test
    void rejectsNewClientWithExistingDog() throws Exception {
        long tom = insertClient("Tom Hall", null);
        long tomsDog = insertDog(tom, "Rex");

        postJson("/bookings", TestRequests.load("bookings/create-new-client-existing-dog.json",
                Map.of("dogId", tomsDog)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(containsString("does not belong")));
    }

    @Test
    void rejectsNewClientWhosePhoneIsAlreadyOnFile() throws Exception {
        long existing = insertClient("Sarah Lee", "+447700900123");

        postJson("/bookings", TestRequests.load("bookings/create-phone-in-use.json"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.title").value("Phone already on file"))
                .andExpect(jsonPath("$.existingClient.id").value(existing))
                .andExpect(jsonPath("$.existingClient.name").value("Sarah Lee"));

        assertThat(jdbc.sql("SELECT count(*) FROM clients").query(Long.class).single()).isEqualTo(1);
    }
}
