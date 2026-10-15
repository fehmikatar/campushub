package com.campushub.userservice.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;
import java.time.Duration;

/**
 * Provides the single {@link Clock} bean application code should inject wherever it needs the
 * current time, instead of calling {@code Instant.now()} directly. Injecting a {@link Clock}
 * keeps time-sensitive business logic testable: tests can supply a fixed or offset clock instead
 * of depending on the real wall clock.
 *
 * <p><b>Time zone policy:</b> persisted technical timestamps (e.g. audit columns) always use UTC
 * via {@link java.time.Instant}. Business-local time rules that need a specific time zone should
 * apply an explicit {@link java.time.ZoneId} at the point of conversion, never hard-coded in
 * shared code, and should not convert everything to {@link java.time.LocalDateTime} up front.
 *
 * <p><b>Precision policy:</b> the clock ticks in whole microseconds, matching the
 * {@code DATETIME(6)} columns every temporal value is persisted into (see
 * V1__create_users.sql). {@link Clock#systemUTC()} alone resolves to 100ns on Windows,
 * and MySQL <em>rounds</em> — not truncates — anything finer than a microsecond on write, so an
 * untruncated instant can come back from the database up to 500ns away from the value still held
 * in memory. Truncating here makes what the application writes exactly what MySQL stores.
 */
@Configuration
public class ClockConfig {

    @Bean
    public Clock clock() {
        return Clock.tick(Clock.systemUTC(), Duration.ofNanos(1_000));
    }

}
