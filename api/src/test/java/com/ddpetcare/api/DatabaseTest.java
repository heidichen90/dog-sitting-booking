package com.ddpetcare.api;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;

import com.jayway.jsonpath.JsonPath;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.servlet.http.Cookie;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(CleanTestDatabase.class)
@Transactional
public abstract class DatabaseTest {

    // Matches owner.* in application-test.yml.
    protected static final String OWNER = "ddpetcare";
    protected static final String OWNER_PASSWORD = "test-password";
    protected static final String CSRF_TOKEN = "test-csrf-token";

    @Autowired
    protected JdbcClient jdbc;

    @Autowired
    protected MockMvc mvc;

    @PersistenceContext
    protected EntityManager em;

    // Every helper request is the logged-in owner with a CSRF token; raw mvc.perform(...) stays anonymous.
    // The token is a real cookie + header pair: spring-security-test's csrf() permanently swaps the shared
    // CsrfFilter's repository for a session-backed one, which would break the XSRF-TOKEN cookie for later tests.
    protected ResultActions perform(MockHttpServletRequestBuilder request) throws Exception {
        return mvc.perform(request.with(user(OWNER))
                .cookie(new Cookie("XSRF-TOKEN", CSRF_TOKEN))
                .header("X-XSRF-TOKEN", CSRF_TOKEN));
    }

    protected ResultActions getJson(String path) throws Exception {
        return perform(MockMvcRequestBuilders.get(path));
    }

    protected ResultActions postJson(String path, String json) throws Exception {
        return perform(MockMvcRequestBuilders.post(path).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    protected ResultActions postEmpty(String path) throws Exception {
        return perform(MockMvcRequestBuilders.post(path));
    }

    /** A real, anonymous POST /api/login (no mock user, no CSRF token). */
    protected ResultActions login(String username, String password) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.post("/api/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(TestRequests.load("auth/login.json", Map.of("username", username, "password", password))));
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
