package com.ddpetcare.api.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

class OwnerAccountTest {

    private final SecurityConfig config = new SecurityConfig();

    private static MockEnvironment environment(String... profiles) {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles(profiles);
        return environment;
    }

    @Test
    void productionRefusesAPlainPassword() {
        assertThatThrownBy(() -> config.userDetailsService("ddpetcare", "{noop}secret", environment("prod")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("{bcrypt}");
    }

    @Test
    void productionAcceptsABcryptHash() {
        String hash = "{bcrypt}" + new BCryptPasswordEncoder().encode("secret");

        assertThat(config.userDetailsService("ddpetcare", hash, environment("prod"))
                .loadUserByUsername("ddpetcare").getPassword()).isEqualTo(hash);
    }

    @Test
    void outsideProductionAPlainPasswordIsAllowed() {
        assertThat(config.userDetailsService("ddpetcare", "{noop}secret", environment())
                .loadUserByUsername("ddpetcare").getPassword()).isEqualTo("{noop}secret");
    }
}
