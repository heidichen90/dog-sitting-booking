package com.ddpetcare.api.auth;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import com.ddpetcare.api.error.LoginThrottledException;
import org.junit.jupiter.api.Test;

class LoginThrottleTest {

    private final MutableClock clock = new MutableClock();
    private final LoginThrottle throttle = new LoginThrottle(clock);

    private void fail(int times) {
        for (int i = 0; i < times; i++) {
            throttle.recordFailure();
        }
    }

    @Test
    void fourFailuresStillAllowAnotherAttempt() {
        fail(4);
        assertThatCode(throttle::checkAllowed).doesNotThrowAnyException();
    }

    @Test
    void theFifthFailureBlocksAttemptsFor15Minutes() {
        fail(5);
        assertThatThrownBy(throttle::checkAllowed).isInstanceOf(LoginThrottledException.class);

        clock.advance(Duration.ofMinutes(15).minusSeconds(1));
        assertThatThrownBy(throttle::checkAllowed).isInstanceOf(LoginThrottledException.class);

        clock.advance(Duration.ofSeconds(1));
        assertThatCode(throttle::checkAllowed).doesNotThrowAnyException();
    }

    @Test
    void failuresOlderThan15MinutesDontCount() {
        fail(4);
        clock.advance(Duration.ofMinutes(15));
        fail(1);
        assertThatCode(throttle::checkAllowed).doesNotThrowAnyException();
    }

    @Test
    void aSuccessfulLoginResetsTheCount() {
        fail(4);
        throttle.recordSuccess();
        fail(4);
        assertThatCode(throttle::checkAllowed).doesNotThrowAnyException();
    }

    private static final class MutableClock extends Clock {
        private Instant now = Instant.parse("2030-01-01T00:00:00Z");

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
