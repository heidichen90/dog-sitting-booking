package com.ddpetcare.api.schema;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;

import com.ddpetcare.api.DatabaseTest;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

class BookingsSchemaTest extends DatabaseTest {

    @Test
    void newBookingIsConfirmedAndUnpaid() {
        long sarah = insertClient("Sarah", null);
        long booking = insertBooking(sarah, insertDog(sarah, "Bella"));

        Map<String, Object> row = jdbc.sql("SELECT status, paid_at FROM bookings WHERE id = ?")
                .param(booking).query().singleRow();

        assertThat(row.get("status")).isEqualTo("confirmed");
        assertThat(row.get("paid_at")).isNull();
    }

    @Test
    void rejectsUnknownStatus() {
        long sarah = insertClient("Sarah", null);
        long booking = insertBooking(sarah, insertDog(sarah, "Bella"));

        assertThatThrownBy(() -> jdbc.sql("UPDATE bookings SET status = 'pending' WHERE id = ?")
                        .param(booking).update())
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("bookings_status_check");
    }

    @Test
    void rejectsDogBelongingToAnotherClient() {
        long sarah = insertClient("Sarah", null);
        long tomsDog = insertDog(insertClient("Tom", null), "Rex");

        assertThatThrownBy(() -> insertBooking(sarah, tomsDog))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("bookings_dog_belongs_to_client_fkey");
    }

    @Test
    void rejectsDeletingDogWithBookings() {
        long sarah = insertClient("Sarah", null);
        long bella = insertDog(sarah, "Bella");
        insertBooking(sarah, bella);

        assertThatThrownBy(() -> jdbc.sql("DELETE FROM dogs WHERE id = ?").param(bella).update())
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("bookings_dog_belongs_to_client_fkey");
    }
}
