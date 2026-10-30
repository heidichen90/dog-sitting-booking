package com.ddpetcare.api.booking;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import com.ddpetcare.api.booking.RequestRules.ValidClientRef;
import com.ddpetcare.api.booking.RequestRules.ValidDogRef;
import com.ddpetcare.api.booking.RequestRules.ValidStayDates;
import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreateBookingRequest(
        @NotNull @Valid ClientRef client,
        @NotNull @Valid DogRef dog,
        @Size(max = 2000) String notes,
        @NotEmpty @Size(max = 31) List<@NotNull @Valid StayRequest> stays) {

    private static final String NOT_BLANK = "(?U)(?s).*[^\\s\\x1C-\\x1F].*";

    /** An existing client ({@code id}) or a new one ({@code name}, optional {@code phone}). */
    @ValidClientRef
    public record ClientRef(
            Long id,
            @Pattern(regexp = NOT_BLANK, message = "must not be blank") @Size(max = 100) String name,
            @Pattern(regexp = "^\\+[1-9][0-9]{7,14}$", message = "must be in international format, e.g. +447700900123")
            String phone) {
    }

    /** An existing dog ({@code id}) or a new one ({@code name}). */
    @ValidDogRef
    public record DogRef(
            Long id,
            @Pattern(regexp = NOT_BLANK, message = "must not be blank") @Size(max = 100) String name) {
    }

    /** A null time means "time to be confirmed". Times are HH:mm. */
    @ValidStayDates
    public record StayRequest(
            @NotNull LocalDate dropOffDate,
            @JsonFormat(pattern = "HH:mm") LocalTime dropOffTime,
            @NotNull LocalDate pickUpDate,
            @JsonFormat(pattern = "HH:mm") LocalTime pickUpTime,
            @NotNull @DecimalMin("0") @DecimalMax("9999.99") @Digits(integer = 6, fraction = 2) BigDecimal unitRate,
            @NotNull @DecimalMin("0") @DecimalMax("9999.99") @Digits(integer = 6, fraction = 2) BigDecimal pickupDropoffFee) {
    }
}
