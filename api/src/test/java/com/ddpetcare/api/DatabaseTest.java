package com.ddpetcare.api;

import java.math.BigDecimal;
import java.time.LocalDate;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@ActiveProfiles("test")
@Import(CleanTestDatabase.class)
@Transactional
public abstract class DatabaseTest {

    @Autowired
    protected JdbcClient jdbc;

    protected long insertClient(String name, String phone) {
        return jdbc.sql("INSERT INTO clients (name, phone) VALUES (?, ?) RETURNING id")
                .params(name, phone)
                .query(Long.class)
                .single();
    }

    protected long insertDog(long clientId, String name) {
        return jdbc.sql("INSERT INTO dogs (client_id, name) VALUES (?, ?) RETURNING id")
                .params(clientId, name)
                .query(Long.class)
                .single();
    }

    protected long insertBooking(long clientId, long dogId) {
        return jdbc.sql("INSERT INTO bookings (client_id, dog_id) VALUES (?, ?) RETURNING id")
                .params(clientId, dogId)
                .query(Long.class)
                .single();
    }

    protected long insertStay(long bookingId, LocalDate dropOff, LocalDate pickUp,
                              String unitRate, String fee, String price) {
        return jdbc.sql("""
                        INSERT INTO booking_stays
                            (booking_id, drop_off_date, pick_up_date, unit_rate, pickup_dropoff_fee, price)
                        VALUES (?, ?, ?, ?, ?, ?)
                        RETURNING id""")
                .params(bookingId, dropOff, pickUp,
                        new BigDecimal(unitRate), new BigDecimal(fee), new BigDecimal(price))
                .query(Long.class)
                .single();
    }
}
