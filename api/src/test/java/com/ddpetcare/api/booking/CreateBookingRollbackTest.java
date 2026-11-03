package com.ddpetcare.api.booking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ddpetcare.api.DatabaseTest;
import com.ddpetcare.api.TestRequests;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// Runs outside the test transaction so the service's own transaction really commits or rolls back.
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class CreateBookingRollbackTest extends DatabaseTest {

    @AfterEach
    void cleanUp() {
        jdbc.sql("TRUNCATE booking_stays, bookings, dogs, clients RESTART IDENTITY CASCADE").update();
    }

    @Test
    void failureAfterCreatingClientLeavesNoRows() throws Exception {
        postJson("/api/bookings", TestRequests.load("bookings/create-new-client-unknown-dog.json"))
                .andExpect(status().isNotFound());

        assertThat(jdbc.sql("SELECT count(*) FROM clients WHERE phone = '+447700900999'")
                .query(Long.class).single()).isZero();
        assertThat(jdbc.sql("SELECT count(*) FROM bookings").query(Long.class).single()).isZero();
    }
}
