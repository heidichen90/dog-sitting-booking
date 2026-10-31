package com.ddpetcare.api.booking;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;

import com.ddpetcare.api.DatabaseTest;
import org.junit.jupiter.api.Test;

class ListBookingsTest extends DatabaseTest {

    private static final LocalDate MON = LocalDate.of(2026, 11, 2);

    @Test
    void listsNewestFirstWithClientDogAndStays() throws Exception {
        long client = insertClient("Sarah Lee", null);
        long dog = insertDog(client, "Biscuit");
        long older = insertBooking(client, dog);
        insertStay(older, MON, MON, "35.00", "0", "35.00");
        long newer = insertBooking(client, dog);
        insertStay(newer, MON, MON.plusDays(2), "40.00", "0", "80.00");
        insertStay(newer, MON.plusDays(7), MON.plusDays(7), "35.00", "0", "35.00");

        getJson("/api/bookings")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].id").value(newer))
                .andExpect(jsonPath("$[0].client.name").value("Sarah Lee"))
                .andExpect(jsonPath("$[0].dog.name").value("Biscuit"))
                .andExpect(jsonPath("$[0].stays.length()").value(2))
                .andExpect(jsonPath("$[0].total").value(115.0))
                .andExpect(jsonPath("$[1].id").value(older));
    }

    @Test
    void ordersByCreatedAtEvenWhenIdsDisagree() throws Exception {
        long client = insertClient("Sarah Lee", null);
        long dog = insertDog(client, "Biscuit");
        long newest = insertBooking(client, dog);
        long oldest = insertBooking(client, dog);
        jdbc.sql("UPDATE bookings SET created_at = '2026-01-02T00:00:00Z' WHERE id = ?").param(newest).update();
        jdbc.sql("UPDATE bookings SET created_at = '2026-01-01T00:00:00Z' WHERE id = ?").param(oldest).update();

        getJson("/api/bookings")
                .andExpect(jsonPath("$[0].id").value(newest))
                .andExpect(jsonPath("$[1].id").value(oldest));
    }

    @Test
    void returnsEmptyListWhenNoBookings() throws Exception {
        getJson("/api/bookings")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void getsOneBookingWithDerivedServiceAndTimes() throws Exception {
        long client = insertClient("Sarah Lee", null);
        long booking = insertBooking(client, insertDog(client, "Biscuit"));
        long dayCare = insertStay(booking, MON, MON, "35.00", "0", "35.00");
        insertStay(booking, MON.plusDays(7), MON.plusDays(9), "40.00", "15.00", "95.00");
        jdbc.sql("UPDATE booking_stays SET drop_off_time = '09:00', pick_up_time = '17:30' WHERE id = ?")
                .param(dayCare).update();

        getJson("/api/bookings/" + booking)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(booking))
                .andExpect(jsonPath("$.stays[0].service").value("day_care"))
                .andExpect(jsonPath("$.stays[0].dropOffTime").value("09:00"))
                .andExpect(jsonPath("$.stays[0].pickUpTime").value("17:30"))
                .andExpect(jsonPath("$.stays[1].service").value("boarding"))
                .andExpect(jsonPath("$.total").value(130.0));
    }

    @Test
    void totalExcludesCancelledStays() throws Exception {
        long client = insertClient("Sarah Lee", null);
        long booking = insertBooking(client, insertDog(client, "Biscuit"));
        insertStay(booking, MON, MON, "35.00", "0", "35.00");
        long cancelled = insertStay(booking, MON.plusDays(1), MON.plusDays(1), "35.00", "0", "35.00");
        jdbc.sql("UPDATE booking_stays SET status = 'cancelled' WHERE id = ?").param(cancelled).update();

        getJson("/api/bookings/" + booking)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(35.0))
                .andExpect(jsonPath("$.stays[1].status").value("cancelled"));
    }

    @Test
    void unknownBookingIsNotFound() throws Exception {
        getJson("/api/bookings/999999999")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Booking 999999999 not found"));
    }
}
