package com.ddpetcare.api.schema;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;

import com.ddpetcare.api.DatabaseTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

class BookingStaysSchemaTest extends DatabaseTest {

    private static final LocalDate MON = LocalDate.of(2027, 3, 1);
    private static final LocalDate THU = MON.plusDays(3);

    private long booking;

    @BeforeEach
    void createBooking() {
        long sarah = insertClient("Sarah", null);
        booking = insertBooking(sarah, insertDog(sarah, "Bella"));
    }

    @Test
    void acceptsDayCareStay() {
        insertStay(booking, MON, MON, "35.00", "0", "35.00");
    }

    @Test
    void acceptsBoardingWithPickupFee() {
        insertStay(booking, MON, THU, "40.00", "15.00", "135.00");
    }

    @Test
    void rejectsPriceThatDoesNotMatchRate() {
        assertThatThrownBy(() -> insertStay(booking, MON, THU, "40.00", "0", "100.00"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("booking_stays_price_check");
    }

    @Test
    void rejectsPickUpBeforeDropOff() {
        assertThatThrownBy(() -> insertStay(booking, THU, MON, "35.00", "0", "35.00"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("booking_stays_dates_check");
    }

    @Test
    void rejectsNegativeRate() {
        assertThatThrownBy(() -> insertStay(booking, MON, MON, "-10.00", "50.00", "40.00"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("booking_stays_unit_rate_check");
    }

    @Test
    void rejectsNegativeFee() {
        assertThatThrownBy(() -> insertStay(booking, MON, MON, "50.00", "-10.00", "40.00"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("booking_stays_pickup_dropoff_fee_check");
    }

    @Test
    void rejectsSameDayPickUpBeforeDropOffTime() {
        assertThatThrownBy(() -> insertTimedStay(MON, LocalTime.of(14, 0), MON, LocalTime.of(9, 0), "35.00", "35.00"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("booking_stays_same_day_times_check");
    }

    @Test
    void allowsOneTimeStillTbd() {
        insertTimedStay(MON, LocalTime.of(9, 0), MON, null, "35.00", "35.00");
    }

    @Test
    void allowsEarlierPickUpTimeOnLaterDay() {
        insertTimedStay(MON, LocalTime.of(14, 0), THU, LocalTime.of(9, 0), "40.00", "120.00");
    }

    @Test
    void rejectsSameDayEqualTimes() {
        assertThatThrownBy(() -> insertTimedStay(MON, LocalTime.of(9, 0), MON, LocalTime.of(9, 0), "35.00", "35.00"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("booking_stays_same_day_times_check");
    }

    @Test
    void rejectsUnknownStatus() {
        long stay = insertStay(booking, MON, MON, "35.00", "0", "35.00");

        assertThatThrownBy(() -> jdbc.sql("UPDATE booking_stays SET status = 'done' WHERE id = ?")
                        .param(stay).update())
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("booking_stays_status_check");
    }

    @Test
    void rejectsStayForMissingBooking() {
        assertThatThrownBy(() -> insertStay(-1L, MON, MON, "35.00", "0", "35.00"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("booking_stays_booking_id_fkey");
    }

    private void insertTimedStay(LocalDate dropOffDate, LocalTime dropOffTime,
                                 LocalDate pickUpDate, LocalTime pickUpTime, String unitRate, String price) {
        jdbc.sql("""
                        INSERT INTO booking_stays
                            (booking_id, drop_off_date, drop_off_time, pick_up_date, pick_up_time, unit_rate, price)
                        VALUES (?, ?, ?, ?, ?, ?, ?)""")
                .params(booking, dropOffDate, dropOffTime, pickUpDate, pickUpTime,
                        new BigDecimal(unitRate), new BigDecimal(price))
                .update();
    }
}
