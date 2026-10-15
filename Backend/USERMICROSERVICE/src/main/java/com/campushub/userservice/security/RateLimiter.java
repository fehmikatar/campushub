package com.campushub.userservice.security;

import com.campushub.userservice.exception.TooManyRequestsException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Small in-memory, fixed-window limiter against password guessing on login, registration and
 * password change. The window simply expires — there is no permanent lockout an attacker could
 * use against a real user.
 *
 * <p>Limits: state lives in this one process, so running several instances multiplies the
 * effective limit, and behind a reverse proxy every client shares the proxy's address. Both are
 * acceptable for a single-instance deployment.
 */
@Component
public class RateLimiter {

    private static final Logger log = LoggerFactory.getLogger(RateLimiter.class);

    private final Clock clock;
    private final RateLimitProperties properties;
    private final ConcurrentHashMap<String, AtomicReference<Window>> windows = new ConcurrentHashMap<>();

    public RateLimiter(Clock clock, RateLimitProperties properties) {
        this.clock = clock;
        this.properties = properties;
    }

    /** Counts one attempt for ({@code operation}, {@code key}) and throws once the limit is exceeded. */
    public void checkAndRecord(String operation, String key, int maxAttempts) {
        Instant now = Instant.now(clock);
        Duration window = properties.getWindow();

        AtomicReference<Window> ref = windows.computeIfAbsent(operation + ":" + key,
                k -> new AtomicReference<>(new Window(now, 0)));
        Window updated = ref.updateAndGet(current ->
                Duration.between(current.start, now).compareTo(window) >= 0
                        ? new Window(now, 1)
                        : new Window(current.start, current.count + 1));

        if (updated.count > maxAttempts) {
            log.warn("Rate limit exceeded for operation '{}'", operation);
            throw new TooManyRequestsException("Too many requests - please try again later");
        }
    }

    private record Window(Instant start, int count) {
    }

}
