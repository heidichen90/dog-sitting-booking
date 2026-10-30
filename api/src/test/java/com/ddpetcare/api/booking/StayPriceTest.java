package com.ddpetcare.api.booking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;

class StayPriceTest {

    private static final LocalDate MON = LocalDate.of(2026, 11, 2);

    @Test
    void dayCareChargesOneUnit() {
        assertThat(BookingStay.price(MON, MON, new BigDecimal("35.00"), BigDecimal.ZERO))
                .isEqualTo(new BigDecimal("35.00"));
    }

    @Test
    void boardingChargesPerNightPlusFee() {
        assertThat(BookingStay.price(MON, MON.plusDays(2), new BigDecimal("40.00"), new BigDecimal("15.00")))
                .isEqualTo(new BigDecimal("95.00"));
    }

    @Test
    void decimalRatesStayExact() {
        assertThat(BookingStay.price(MON, MON.plusDays(3), new BigDecimal("33.30"), BigDecimal.ZERO))
                .isEqualTo(new BigDecimal("99.90"));
    }

    @Test
    void dayCareWithFeeChargesOneUnitPlusFee() {
        assertThat(BookingStay.price(MON, MON, new BigDecimal("35.00"), new BigDecimal("15.00")))
                .isEqualTo(new BigDecimal("50.00"));
    }

    @Test
    void rateWithoutDecimalsIsStoredWithTwo() {
        BookingStay stay = new BookingStay(null, MON, null, MON.plusDays(1), null,
                new BigDecimal("40"), new BigDecimal("0"));

        assertThat(stay.getUnitRate()).isEqualTo(new BigDecimal("40.00"));
        assertThat(stay.getPickupDropoffFee()).isEqualTo(new BigDecimal("0.00"));
    }

    @Test
    void rateWithMoreThanTwoDecimalsIsRejected() {
        assertThatThrownBy(() -> BookingStay.price(MON, MON.plusDays(1), new BigDecimal("33.333"), BigDecimal.ZERO))
                .isInstanceOf(ArithmeticException.class);
    }
}
