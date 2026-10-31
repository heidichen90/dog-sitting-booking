package com.ddpetcare.api.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ddpetcare.api.DatabaseTest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// Profiles "test" (inherited) + "prod": the test database, with the production settings on top.
@ActiveProfiles("prod")
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class ProdProfileTest extends DatabaseTest {

    @DynamicPropertySource
    static void bcryptOwner(DynamicPropertyRegistry registry) {
        registry.add("owner.password-hash", () -> "{bcrypt}" + new BCryptPasswordEncoder().encode(OWNER_PASSWORD));
    }

    @AfterEach
    void cleanUp() {
        jdbc.sql("DELETE FROM spring_session").update();
    }

    @Test
    void apiDocsAndSwaggerUiAreOff() throws Exception {
        getJson("/v3/api-docs").andExpect(status().isNotFound());
        getJson("/swagger-ui.html").andExpect(status().isNotFound());
    }

    @Test
    void theSessionCookieIsSecure() throws Exception {
        MvcResult result = login(OWNER, OWNER_PASSWORD).andExpect(status().isNoContent()).andReturn();

        assertThat(result.getResponse().getHeaders(HttpHeaders.SET_COOKIE))
                .filteredOn(header -> header.startsWith("SESSION="))
                .singleElement().asString()
                .contains("Secure");
    }

    @Test
    void theCsrfCookieIsSecure() throws Exception {
        MvcResult result = mvc.perform(MockMvcRequestBuilders.get("/actuator/health")).andReturn();

        assertThat(result.getResponse().getHeaders(HttpHeaders.SET_COOKIE))
                .filteredOn(header -> header.startsWith("XSRF-TOKEN="))
                .singleElement().asString()
                .contains("Secure");
    }
}
