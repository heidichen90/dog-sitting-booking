package com.ddpetcare.api.schema;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;

import com.ddpetcare.api.DatabaseTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class EarningsQueriesTest extends DatabaseTest {

    @BeforeEach
    void seed() {
        long sarah = insertClient("Sarah", null);
        long sarahsBooking = insertBooking(sarah, insertDog(sarah, "Bella"));
        insertStay(sarahsBooking, LocalDate.of(2027, 1, 30), LocalDate.of(2027, 2, 2), "40.00", "0", "120.00");
        insertStay(sarahsBooking, LocalDate.of(2027, 2, 5), LocalDate.of(2027, 2, 5), "35.00", "0", "35.00");
        long cancelledStay = insertStay(sarahsBooking, LocalDate.of(2027, 2, 6), LocalDate.of(2027, 2, 6), "35.00", "0", "35.00");
        jdbc.sql("UPDATE booking_stays SET status = 'cancelled' WHERE id = ?").param(cancelledStay).update();

        long tom = insertClient("Tom", null);
        long tomsBooking = insertBooking(tom, insertDog(tom, "Rex"));
        insertStay(tomsBooking, LocalDate.of(2027, 2, 7), LocalDate.of(2027, 2, 7), "35.00", "0", "35.00");
        jdbc.sql("UPDATE bookings SET status = 'cancelled' WHERE id = ?").param(tomsBooking).update();
    }

    @Test
    void monthlyEarningsCountWholeStayInDropOffMonthAndSkipCancelled() {
        List<String> months = jdbc.sql("""
                        SELECT to_char(date_trunc('month', s.drop_off_date), 'YYYY-MM') || '=' || SUM(s.price)
                        FROM booking_stays s
                        JOIN bookings b ON b.id = s.booking_id
                        WHERE s.status = 'confirmed' AND b.status = 'confirmed'
                        GROUP BY date_trunc('month', s.drop_off_date)
                        ORDER BY date_trunc('month', s.drop_off_date)""")
                .query(String.class)
                .list();

        assertThat(months).containsExactly("2027-01=120.00", "2027-02=35.00");
    }

    @Test
    void earningsPerClientSkipCancelled() {
        List<String> clients = jdbc.sql("""
                        SELECT c.name || '=' || SUM(s.price)
                        FROM booking_stays s
                        JOIN bookings b ON b.id = s.booking_id
                        JOIN clients c ON c.id = b.client_id
                        WHERE s.status = 'confirmed' AND b.status = 'confirmed'
                        GROUP BY c.id, c.name
                        ORDER BY c.name""")
                .query(String.class)
                .list();

        assertThat(clients).containsExactly("Sarah=155.00");
    }
}
