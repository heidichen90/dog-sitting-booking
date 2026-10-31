package com.ddpetcare.api.auth;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.PropertyMapper;
import org.springframework.boot.session.autoconfigure.DefaultCookieSerializerCustomizer;
import org.springframework.boot.web.server.Cookie;
import org.springframework.boot.web.server.autoconfigure.ServerProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.RequestCacheConfigurer;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.web.servlet.HandlerExceptionResolver;

@Configuration
public class SecurityConfig {

    // 401s and 403s raised in the filter chain go through ApiExceptionHandler, so they're ProblemDetails too.
    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, CsrfTokenRepository csrfTokens,
            @Qualifier("handlerExceptionResolver") HandlerExceptionResolver errors) throws Exception {
        http
                .authorizeHttpRequests(requests -> requests
                        .requestMatchers(HttpMethod.POST, "/api/login").permitAll()
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                        .requestMatchers("/v3/api-docs", "/v3/api-docs/**", "/swagger-ui.html", "/swagger-ui/**")
                        .permitAll()
                        .requestMatchers("/error").permitAll()
                        .anyRequest().authenticated())
                .csrf(csrf -> csrf.spa().csrfTokenRepository(csrfTokens).ignoringRequestMatchers("/api/login"))
                .addFilterAfter(new CsrfCookieFilter(), CsrfFilter.class)
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint((request, response, ex) ->
                                errors.resolveException(request, response, null, ex))
                        .accessDeniedHandler((request, response, ex) ->
                                errors.resolveException(request, response, null, ex)))
                .logout(logout -> logout
                        .logoutUrl("/api/logout")
                        .logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT)))
                .requestCache(RequestCacheConfigurer::disable);
        return http.build();
    }

    // Boot only maps server.servlet.session.cookie.* onto Spring Session's cookie when it runs the embedded
    // server; under MockMvc it reads the (empty) servlet context instead. Applying them here keeps both the same.
    @Bean
    DefaultCookieSerializerCustomizer sessionCookie(ServerProperties server) {
        Cookie cookie = server.getServlet().getSession().getCookie();
        PropertyMapper map = PropertyMapper.get();
        return serializer -> {
            serializer.setCookieName(cookie.getName());
            map.from(cookie::getHttpOnly).to(serializer::setUseHttpOnlyCookie);
            map.from(cookie::getSecure).to(serializer::setUseSecureCookie);
            map.from(cookie::getSameSite).as(Cookie.SameSite::attributeValue).to(serializer::setSameSite);
            map.from(cookie::getMaxAge).asInt(Duration::toSeconds).to(serializer::setCookieMaxAge);
        };
    }

    @Bean
    CsrfTokenRepository csrfTokenRepository() {
        return CookieCsrfTokenRepository.withHttpOnlyFalse();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }

    @Bean
    UserDetailsService userDetailsService(@Value("${owner.username}") String username,
                                          @Value("${owner.password-hash}") String passwordHash) {
        return new InMemoryUserDetailsManager(User.withUsername(username).password(passwordHash).build());
    }

    @Bean
    AuthenticationManager authenticationManager(UserDetailsService owner, PasswordEncoder passwordEncoder) {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider(owner);
        provider.setPasswordEncoder(passwordEncoder);
        return new ProviderManager(provider);
    }
}
