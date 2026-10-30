package com.ddpetcare.api.booking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;

import com.ddpetcare.api.DatabaseTest;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class BookingQueryCountTest extends DatabaseTest {

    private static final LocalDate MON = LocalDate.of(2026, 11, 2);

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @Test
    void listingFiveBookingsUsesNoMoreQueriesThanOne() throws Exception {
        insertBookingWithStay(0);
        long forOne = queriesToList();

        for (int i = 1; i < 5; i++) {
            insertBookingWithStay(i);
        }
        long forFive = queriesToList();

        assertThat(forFive).isEqualTo(forOne);
    }

    private void insertBookingWithStay(int i) {
        long client = insertClient("Client " + i, null);
        long dog = insertDog(client, "Dog " + i);
        insertStay(insertBooking(client, dog), MON, MON, "35.00", "0", "35.00");
    }

    private long queriesToList() throws Exception {
        em.clear();
        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.clear();
        getJson("/bookings").andExpect(status().isOk());
        return statistics.getPrepareStatementCount();
    }
}
