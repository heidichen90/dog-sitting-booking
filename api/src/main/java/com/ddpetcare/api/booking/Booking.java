package com.ddpetcare.api.booking;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import com.ddpetcare.api.client.Client;
import com.ddpetcare.api.client.Dog;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(name = "bookings")
public class Booking {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "client_id")
    private Client client;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "dog_id")
    private Dog dog;

    @Convert(converter = StatusConverter.class)
    private Status status = Status.CONFIRMED;

    private String notes;

    private Instant paidAt;

    @OneToMany(mappedBy = "booking", cascade = CascadeType.PERSIST)
    @OrderBy("dropOffDate, id")
    private List<BookingStay> stays = new ArrayList<>();

    @CreationTimestamp
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;

    protected Booking() {
    }

    public Booking(Client client, Dog dog, String notes) {
        this.client = client;
        this.dog = dog;
        this.notes = notes;
    }

    public void addStay(LocalDate dropOffDate, LocalTime dropOffTime, LocalDate pickUpDate, LocalTime pickUpTime,
                        BigDecimal unitRate, BigDecimal pickupDropoffFee) {
        stays.add(new BookingStay(this, dropOffDate, dropOffTime, pickUpDate, pickUpTime, unitRate, pickupDropoffFee));
    }

    public void cancel() {
        status = Status.CANCELLED;
    }

    public BigDecimal total() {
        return stays.stream()
                .filter(stay -> stay.getStatus() == Status.CONFIRMED)
                .map(BookingStay::getPrice)
                .reduce(BigDecimal.ZERO.setScale(2), BigDecimal::add);
    }

    public Long getId() {
        return id;
    }

    public Client getClient() {
        return client;
    }

    public Dog getDog() {
        return dog;
    }

    public Status getStatus() {
        return status;
    }

    public String getNotes() {
        return notes;
    }

    public Instant getPaidAt() {
        return paidAt;
    }

    public List<BookingStay> getStays() {
        return Collections.unmodifiableList(stays);
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
