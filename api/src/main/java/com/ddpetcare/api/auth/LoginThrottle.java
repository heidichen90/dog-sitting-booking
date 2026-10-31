package com.ddpetcare.api.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;

import com.ddpetcare.api.error.LoginThrottledException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

// In memory, which is enough with at most one Cloud Run instance; a restart resets it (spec: accepted).
@Component
public class LoginThrottle {

    static final int MAX_FAILURES = 5;
    static final Duration WINDOW = Duration.ofMinutes(15);

    private final Clock clock;
    private final Deque<Instant> failures = new ArrayDeque<>();
    private Instant blockedUntil = Instant.MIN;

    @Autowired
    public LoginThrottle() {
        this(Clock.systemUTC());
    }

    LoginThrottle(Clock clock) {
        this.clock = clock;
    }

    public synchronized void checkAllowed() {
        if (clock.instant().isBefore(blockedUntil)) {
            throw new LoginThrottledException();
        }
    }

    public synchronized void recordFailure() {
        Instant now = clock.instant();
        failures.addLast(now);
        while (!failures.peekFirst().isAfter(now.minus(WINDOW))) {
            failures.removeFirst();
        }
        if (failures.size() >= MAX_FAILURES) {
            blockedUntil = now.plus(WINDOW);
            failures.clear();
        }
    }

    public synchronized void recordSuccess() {
        failures.clear();
        blockedUntil = Instant.MIN;
    }
}
