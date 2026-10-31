package com.ddpetcare.api.auth;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.web.server.autoconfigure.ServerProperties;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.session.web.http.CookieSerializer.CookieValue;
import org.springframework.session.web.http.DefaultCookieSerializer;

class SessionCookieTest {

    @Test
    void unsetCookiePropertiesKeepSpringSessionsDefaults() {
        ServerProperties server = new ServerProperties();
        server.getServlet().getSession().getCookie().setName("SESSION");
        DefaultCookieSerializer serializer = new DefaultCookieSerializer();

        new SecurityConfig().sessionCookie(server).customize(serializer);

        MockHttpServletResponse response = new MockHttpServletResponse();
        serializer.writeCookieValue(new CookieValue(new MockHttpServletRequest(), response, "abc"));
        assertThat(response.getHeader(HttpHeaders.SET_COOKIE))
                .startsWith("SESSION=")
                .contains("HttpOnly")
                .contains("SameSite=Lax")
                .doesNotContain("Max-Age");
    }
}
