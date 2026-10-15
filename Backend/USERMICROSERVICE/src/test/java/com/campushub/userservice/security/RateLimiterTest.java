package com.campushub.userservice.security;

import com.campushub.userservice.exception.TooManyRequestsException;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RateLimiterTest {

    private static final Instant START = Instant.parse("2026-01-01T00:00:00Z");

    private final AtomicReference<Instant> now = new AtomicReference<>(START);
    private final RateLimiter limiter = new RateLimiter(movableClock(), properties());

    @Test
    void allowsUpToTheMaximumThenRejects() {
        for (int i = 0; i < 5; i++) {
            limiter.checkAndRecord("login", "1.2.3.4", 5);
        }
        assertThatThrownBy(() -> limiter.checkAndRecord("login", "1.2.3.4", 5))
                .isInstanceOf(TooManyRequestsException.class);
    }

    @Test
    void differentClientsAndOperationsAreCountedSeparately() {
        for (int i = 0; i < 5; i++) {
            limiter.checkAndRecord("login", "1.2.3.4", 5);
        }
        assertThatCode(() -> limiter.checkAndRecord("login", "5.6.7.8", 5)).doesNotThrowAnyException();
        assertThatCode(() -> limiter.checkAndRecord("register", "1.2.3.4", 5)).doesNotThrowAnyException();
    }

    @Test
    void theWindowExpiresSoThereIsNoPermanentLockout() {
        for (int i = 0; i < 5; i++) {
            limiter.checkAndRecord("login", "9.9.9.9", 5);
        }
        assertThatThrownBy(() -> limiter.checkAndRecord("login", "9.9.9.9", 5)).isInstanceOf(TooManyRequestsException.class);

        now.set(START.plus(Duration.ofMinutes(16)));
        assertThatCode(() -> limiter.checkAndRecord("login", "9.9.9.9", 5)).doesNotThrowAnyException();
    }

    private static RateLimitProperties properties() {
        RateLimitProperties properties = new RateLimitProperties();
        properties.setWindow(Duration.ofMinutes(15));
        return properties;
    }

    private Clock movableClock() {
        return new Clock() {
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
                return now.get();
            }
        };
    }

}
