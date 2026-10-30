package com.ddpetcare.api;

import java.math.BigDecimal;
import java.time.LocalDate;

import com.jayway.jsonpath.JsonPath;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(CleanTestDatabase.class)
@Transactional
public abstract class DatabaseTest {

    @Autowired
    protected JdbcClient jdbc;

    @Autowired
    protected MockMvc mvc;

    @PersistenceContext
    protected EntityManager em;

    protected ResultActions getJson(String path) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.get(path));
    }

    protected ResultActions postJson(String path, String json) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.post(path).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    protected ResultActions postEmpty(String path) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.post(path));
    }

    protected static long idOf(ResultActions result) throws Exception {
        return ((Number) JsonPath.read(result.andReturn().getResponse().getContentAsString(), "$.id")).longValue();
    }

    // JPA updates are only written at flush; call this before reading them back with jdbc.
    protected void flushAndClear() {
        em.flush();
        em.clear();
    }

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
