package com.ddpetcare.api.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;

import com.ddpetcare.api.DatabaseTest;
import com.ddpetcare.api.TestRequests;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// Spring Session writes in its own transaction, so these tests commit spring_session rows and clean up.
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class LoginTest extends DatabaseTest {

    private static final int THIRTY_DAYS = 30 * 24 * 60 * 60;

    @AfterEach
    void cleanUp() {
        jdbc.sql("DELETE FROM spring_session").update();
    }

    private Cookie loginAsOwner() throws Exception {
        Cookie session = login(OWNER, OWNER_PASSWORD).andExpect(status().isNoContent())
                .andReturn().getResponse().getCookie("SESSION");
        assertThat(session).isNotNull();
        return session;
    }

    private Cookie xsrfCookie(Cookie session) throws Exception {
        Cookie xsrf = mvc.perform(get("/api/me").cookie(session)).andReturn().getResponse().getCookie("XSRF-TOKEN");
        assertThat(xsrf).isNotNull();
        return xsrf;
    }

    private static String loginBody(String username, String password) {
        return TestRequests.load("auth/login.json", Map.of("username", username, "password", password));
    }

    private static String lastXsrfValue(MockHttpServletResponse response) {
        List<String> xsrf = response.getHeaders(HttpHeaders.SET_COOKIE).stream()
                .filter(header -> header.startsWith("XSRF-TOKEN="))
                .toList();
        assertThat(xsrf).isNotEmpty();
        String last = xsrf.getLast();
        int end = last.indexOf(';');
        return last.substring("XSRF-TOKEN=".length(), end < 0 ? last.length() : end);
    }

    private long sessionCount() {
        return jdbc.sql("SELECT count(*) FROM spring_session").query(Long.class).single();
    }

    @Test
    void correctLoginSetsAnHttpOnlyLaxSessionCookieAndMeReturnsTheOwner() throws Exception {
        MvcResult result = login(OWNER, OWNER_PASSWORD)
                .andExpect(status().isNoContent())
                .andExpect(cookie().httpOnly("SESSION", true))
                .andExpect(cookie().maxAge("SESSION", THIRTY_DAYS))
                .andReturn();
        assertThat(result.getResponse().getHeaders(HttpHeaders.SET_COOKIE))
                .filteredOn(header -> header.startsWith("SESSION="))
                .singleElement().asString()
                .contains("SameSite=Lax")
                .doesNotContain("Secure");

        mvc.perform(get("/api/me").cookie(result.getResponse().getCookie("SESSION")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value(OWNER));
    }

    @Test
    void wrongPasswordAndWrongUsernameGetTheSame401() throws Exception {
        for (String[] attempt : new String[][] {{OWNER, "wrong-password"}, {"someone-else", OWNER_PASSWORD}}) {
            login(attempt[0], attempt[1])
                    .andExpect(status().isUnauthorized())
                    .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.title").value("Invalid username or password"))
                    .andExpect(cookie().doesNotExist("SESSION"));
        }
        assertThat(sessionCount()).isZero();
    }

    @Test
    void loginStoresOneSessionRowForTheOwnerWithA30DayTimeout() throws Exception {
        loginAsOwner();

        assertThat(jdbc.sql("SELECT principal_name, max_inactive_interval FROM spring_session")
                .query((rs, row) -> rs.getString(1) + "/" + rs.getInt(2))
                .list()).containsExactly(OWNER + "/" + THIRTY_DAYS);
    }

    @Test
    void logoutDeletesTheSessionRowAndTheCookieStopsWorking() throws Exception {
        Cookie session = loginAsOwner();
        Cookie xsrf = xsrfCookie(session);

        mvc.perform(post("/api/logout").cookie(session, xsrf).header("X-XSRF-TOKEN", xsrf.getValue()))
                .andExpect(status().isNoContent());

        assertThat(sessionCount()).isZero();
        mvc.perform(get("/api/me").cookie(session)).andExpect(status().isUnauthorized());
    }

    @Test
    void aPostNeedsTheXsrfCookieCopiedIntoTheHeader() throws Exception {
        Cookie session = loginAsOwner();
        Cookie xsrf = xsrfCookie(session);

        mvc.perform(post("/api/bookings/999999/cancel").cookie(session, xsrf))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.title").value("Forbidden"));
        // 404 means the request got past both the CSRF check and the login check.
        mvc.perform(post("/api/bookings/999999/cancel").cookie(session, xsrf).header("X-XSRF-TOKEN", xsrf.getValue()))
                .andExpect(status().isNotFound());
    }

    @Test
    void loginReplacesTheOldXsrfTokenWithOneThatWorksStraightAway() throws Exception {
        MockHttpServletResponse response = mvc.perform(post("/api/login")
                        .cookie(new Cookie("XSRF-TOKEN", "token-from-before-login"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody(OWNER, OWNER_PASSWORD)))
                .andExpect(status().isNoContent())
                .andReturn().getResponse();
        String token = lastXsrfValue(response);
        assertThat(token).isNotEmpty().isNotEqualTo("token-from-before-login");

        mvc.perform(post("/api/bookings/999999/cancel")
                        .cookie(response.getCookie("SESSION"), new Cookie("XSRF-TOKEN", token))
                        .header("X-XSRF-TOKEN", token))
                .andExpect(status().isNotFound());
    }

    @Test
    void blankOrOversizedCredentialsAre400sNotFailedLogins() throws Exception {
        String[][] attempts = {{"", OWNER_PASSWORD, "username"}, {OWNER, "", "password"},
                {OWNER, "a".repeat(73), "password"}};
        for (String[] attempt : attempts) {
            login(attempt[0], attempt[1])
                    .andExpect(status().isBadRequest())
                    .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.title").value("Invalid request"))
                    .andExpect(jsonPath("$.errors[0].field").value(attempt[2]))
                    .andExpect(cookie().doesNotExist("SESSION"));
        }
        assertThat(sessionCount()).isZero();
    }

    @Test
    void logoutExpiresTheSessionCookie() throws Exception {
        Cookie session = loginAsOwner();
        Cookie xsrf = xsrfCookie(session);

        mvc.perform(post("/api/logout").cookie(session, xsrf).header("X-XSRF-TOKEN", xsrf.getValue()))
                .andExpect(status().isNoContent())
                .andExpect(cookie().maxAge("SESSION", 0));
    }

    @Test
    void loggingInAgainWithAnExistingSessionGivesANewIdAndRetiresTheOldOne() throws Exception {
        Cookie first = loginAsOwner();

        Cookie second = mvc.perform(post("/api/login").cookie(first)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody(OWNER, OWNER_PASSWORD)))
                .andExpect(status().isNoContent())
                .andReturn().getResponse().getCookie("SESSION");

        assertThat(second).isNotNull();
        assertThat(second.getValue()).isNotEqualTo(first.getValue());
        mvc.perform(get("/api/me").cookie(first)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/me").cookie(second)).andExpect(status().isOk());
    }
}
