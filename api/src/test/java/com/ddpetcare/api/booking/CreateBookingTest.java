package com.ddpetcare.api.booking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import com.ddpetcare.api.DatabaseTest;
import com.ddpetcare.api.TestRequests;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

class CreateBookingTest extends DatabaseTest {

    @Test
    void createsBookingForExistingClientWithNewDog() throws Exception {
        long client = insertClient("Sarah Lee", "+447700900123");

        ResultActions result = postJson("/api/bookings",
                TestRequests.load("bookings/create-existing-client-new-dog.json", Map.of("clientId", client)));

        result.andExpect(status().isCreated());
        long id = idOf(result);
        result.andExpect(status().isCreated())
                .andExpect(header().string("Location", "/api/bookings/" + id))
                .andExpect(jsonPath("$.status").value("confirmed"))
                .andExpect(jsonPath("$.notes").value("Allergic to chicken"))
                .andExpect(jsonPath("$.paidAt").value(nullValue()))
                .andExpect(jsonPath("$.createdAt").isNotEmpty())
                .andExpect(jsonPath("$.client.id").value(client))
                .andExpect(jsonPath("$.dog.name").value("Biscuit"))
                .andExpect(jsonPath("$.total").value(95.0))
                .andExpect(jsonPath("$.stays.length()").value(1))
                .andExpect(jsonPath("$.stays[0].id").isNumber())
                .andExpect(jsonPath("$.stays[0].service").value("boarding"))
                .andExpect(jsonPath("$.stays[0].dropOffDate").value("2026-11-02"))
                .andExpect(jsonPath("$.stays[0].dropOffTime").value("09:00"))
                .andExpect(jsonPath("$.stays[0].pickUpTime").value(nullValue()))
                .andExpect(jsonPath("$.stays[0].unitRate").value(40.0))
                .andExpect(jsonPath("$.stays[0].pickupDropoffFee").value(15.0))
                .andExpect(jsonPath("$.stays[0].price").value(95.0))
                .andExpect(jsonPath("$.stays[0].status").value("confirmed"));

        assertThat(jdbc.sql("SELECT count(*) FROM dogs WHERE client_id = ?").param(client)
                .query(Long.class).single()).isEqualTo(1);
    }

    @Test
    void createsNewClientAndDogWithSeveralStays() throws Exception {
        ResultActions result = postJson("/api/bookings", TestRequests.load("bookings/create-new-client-new-dog.json"));

        result.andExpect(status().isCreated())
                .andExpect(jsonPath("$.client.id").isNumber())
                .andExpect(jsonPath("$.client.name").value("Sarah Lee"))
                .andExpect(jsonPath("$.client.phone").value("+447700900123"))
                .andExpect(jsonPath("$.dog.id").isNumber())
                .andExpect(jsonPath("$.notes").value(nullValue()))
                .andExpect(jsonPath("$.total").value(130.0))
                .andExpect(jsonPath("$.stays.length()").value(2))
                .andExpect(jsonPath("$.stays[1].service").value("day_care"))
                .andExpect(jsonPath("$.stays[1].pickUpTime").value("17:00"))
                .andExpect(jsonPath("$.stays[1].price").value(35.0));

        assertThat(jdbc.sql("SELECT name FROM clients WHERE phone = '+447700900123'")
                .query(String.class).single()).isEqualTo("Sarah Lee");
        assertThat(jdbc.sql("SELECT count(*) FROM booking_stays WHERE booking_id = ?").param(idOf(result))
                .query(Long.class).single()).isEqualTo(2);
    }

    @Test
    void staysInResponseAreSortedByDropOffDate() throws Exception {
        postJson("/api/bookings", TestRequests.load("bookings/create-stays-out-of-date-order.json"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.stays.length()").value(2))
                .andExpect(jsonPath("$.stays[0].dropOffDate").value("2026-11-02"))
                .andExpect(jsonPath("$.stays[1].dropOffDate").value("2026-11-10"));
    }

    @Test
    void acceptsValuesAtTheLimits() throws Exception {
        ResultActions result = postJson("/api/bookings", TestRequests.load("bookings/create-at-limits.json"));

        result.andExpect(status().isCreated())
                .andExpect(jsonPath("$.stays.length()").value(31))
                .andExpect(jsonPath("$.stays[0].pickUpDate").value("2027-01-01"))
                .andExpect(jsonPath("$.stays[0].price").value(609999.39))
                .andExpect(jsonPath("$.total").value(611049.39));

        assertThat(jdbc.sql("SELECT max(price) FROM booking_stays WHERE booking_id = ?").param(idOf(result))
                .query(java.math.BigDecimal.class).single()).isEqualByComparingTo("609999.39");
    }
}
