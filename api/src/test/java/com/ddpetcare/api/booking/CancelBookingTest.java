package com.ddpetcare.api.booking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;

import com.ddpetcare.api.DatabaseTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class CancelBookingTest extends DatabaseTest {

    private static final LocalDate MON = LocalDate.of(2026, 11, 2);

    private long booking;

    @BeforeEach
    void createBooking() {
        long client = insertClient("Sarah Lee", null);
        booking = insertBooking(client, insertDog(client, "Biscuit"));
        insertStay(booking, MON, MON, "35.00", "0", "35.00");
    }

    @Test
    void cancelsTheBooking() throws Exception {
        postEmpty("/bookings/" + booking + "/cancel")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(booking))
                .andExpect(jsonPath("$.status").value("cancelled"));

        flushAndClear();
        assertThat(jdbc.sql("SELECT status FROM bookings WHERE id = ?").param(booking)
                .query(String.class).single()).isEqualTo("cancelled");
    }

    @Test
    void cancellingTwiceIsHarmless() throws Exception {
        postEmpty("/bookings/" + booking + "/cancel").andExpect(status().isOk());

        postEmpty("/bookings/" + booking + "/cancel")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("cancelled"));
    }

    @Test
    void secondCancelDoesNotBumpUpdatedAt() throws Exception {
        postEmpty("/bookings/" + booking + "/cancel").andExpect(status().isOk());
        flushAndClear();
        jdbc.sql("UPDATE bookings SET updated_at = '2000-01-01T00:00:00Z' WHERE id = ?").param(booking).update();

        postEmpty("/bookings/" + booking + "/cancel").andExpect(status().isOk());

        flushAndClear();
        Instant updatedAt = jdbc.sql("SELECT updated_at FROM bookings WHERE id = ?").param(booking)
                .query(OffsetDateTime.class).single().toInstant();
        assertThat(updatedAt).isEqualTo(Instant.parse("2000-01-01T00:00:00Z"));
    }

    @Test
    void cancelUpdatesUpdatedAt() throws Exception {
        jdbc.sql("UPDATE bookings SET updated_at = '2000-01-01T00:00:00Z' WHERE id = ?").param(booking).update();

        postEmpty("/bookings/" + booking + "/cancel").andExpect(status().isOk());

        flushAndClear();
        Instant updatedAt = jdbc.sql("SELECT updated_at FROM bookings WHERE id = ?").param(booking)
                .query(OffsetDateTime.class).single().toInstant();
        assertThat(updatedAt).isAfter(Instant.parse("2000-01-02T00:00:00Z"));
    }

    @Test
    void cancelledBookingStillAppearsInList() throws Exception {
        postEmpty("/bookings/" + booking + "/cancel").andExpect(status().isOk());

        getJson("/bookings")
                .andExpect(jsonPath("$[0].id").value(booking))
                .andExpect(jsonPath("$[0].status").value("cancelled"));
    }

    @Test
    void unknownBookingIsNotFound() throws Exception {
        postEmpty("/bookings/999999999/cancel")
                .andExpect(status().isNotFound());
    }
}
