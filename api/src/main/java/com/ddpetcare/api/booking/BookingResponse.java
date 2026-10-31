package com.ddpetcare.api.booking;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Comparator;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;

public record BookingResponse(
        Long id,
        @Schema(allowableValues = {"confirmed", "cancelled"}) String status,
        String notes,
        Instant paidAt,
        Instant createdAt,
        ClientSummary client,
        DogSummary dog,
        BigDecimal total,
        List<StayResponse> stays) {

    public record ClientSummary(Long id, String name, String phone) {
    }

    public record DogSummary(Long id, String name) {
    }

    public record StayResponse(
            Long id,
            @Schema(allowableValues = {"day_care", "boarding"}) String service,
            LocalDate dropOffDate,
            @JsonFormat(pattern = "HH:mm") LocalTime dropOffTime,
            LocalDate pickUpDate,
            @JsonFormat(pattern = "HH:mm") LocalTime pickUpTime,
            BigDecimal unitRate,
            BigDecimal pickupDropoffFee,
            BigDecimal price,
            @Schema(allowableValues = {"confirmed", "cancelled"}) String status) {

        static StayResponse from(BookingStay stay) {
            return new StayResponse(stay.getId(), stay.isDayCare() ? "day_care" : "boarding",
                    stay.getDropOffDate(), stay.getDropOffTime(), stay.getPickUpDate(), stay.getPickUpTime(),
                    stay.getUnitRate(), stay.getPickupDropoffFee(), stay.getPrice(), stay.getStatus().dbValue());
        }
    }

    static BookingResponse from(Booking booking) {
        return new BookingResponse(
                booking.getId(),
                booking.getStatus().dbValue(),
                booking.getNotes(),
                booking.getPaidAt(),
                booking.getCreatedAt(),
                new ClientSummary(booking.getClient().getId(), booking.getClient().getName(),
                        booking.getClient().getPhone()),
                new DogSummary(booking.getDog().getId(), booking.getDog().getName()),
                booking.total(),
                booking.getStays().stream()
                        .sorted(Comparator.comparing(BookingStay::getDropOffDate).thenComparing(BookingStay::getId))
                        .map(StayResponse::from)
                        .toList());
    }
}
