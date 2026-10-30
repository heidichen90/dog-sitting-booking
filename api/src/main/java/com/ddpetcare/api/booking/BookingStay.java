package com.ddpetcare.api.booking;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;

import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(name = "booking_stays")
public class BookingStay {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "booking_id")
    private Booking booking;

    private LocalDate dropOffDate;
    private LocalTime dropOffTime;
    private LocalDate pickUpDate;
    private LocalTime pickUpTime;
    private BigDecimal unitRate;
    private BigDecimal pickupDropoffFee;
    private BigDecimal price;

    @Convert(converter = StatusConverter.class)
    private Status status = Status.CONFIRMED;

    @CreationTimestamp
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;

    protected BookingStay() {
    }

    BookingStay(Booking booking, LocalDate dropOffDate, LocalTime dropOffTime,
                LocalDate pickUpDate, LocalTime pickUpTime, BigDecimal unitRate, BigDecimal pickupDropoffFee) {
        this.booking = booking;
        this.dropOffDate = dropOffDate;
        this.dropOffTime = dropOffTime;
        this.pickUpDate = pickUpDate;
        this.pickUpTime = pickUpTime;
        this.unitRate = unitRate.setScale(2, RoundingMode.UNNECESSARY);
        this.pickupDropoffFee = pickupDropoffFee.setScale(2, RoundingMode.UNNECESSARY);
        this.price = price(dropOffDate, pickUpDate, unitRate, pickupDropoffFee);
    }

    // Must match the booking_stays_price_check constraint in V1.
    static BigDecimal price(LocalDate dropOffDate, LocalDate pickUpDate, BigDecimal unitRate, BigDecimal fee) {
        long units = Math.max(ChronoUnit.DAYS.between(dropOffDate, pickUpDate), 1);
        return unitRate.multiply(BigDecimal.valueOf(units)).add(fee).setScale(2, RoundingMode.UNNECESSARY);
    }

    public boolean isDayCare() {
        return dropOffDate.equals(pickUpDate);
    }

    public Long getId() {
        return id;
    }

    public LocalDate getDropOffDate() {
        return dropOffDate;
    }

    public LocalTime getDropOffTime() {
        return dropOffTime;
    }

    public LocalDate getPickUpDate() {
        return pickUpDate;
    }

    public LocalTime getPickUpTime() {
        return pickUpTime;
    }

    public BigDecimal getUnitRate() {
        return unitRate;
    }

    public BigDecimal getPickupDropoffFee() {
        return pickupDropoffFee;
    }

    public BigDecimal getPrice() {
        return price;
    }

    void cancel() {
        status = Status.CANCELLED;
    }

    public Status getStatus() {
        return status;
    }
}
