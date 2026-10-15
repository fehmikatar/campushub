package com.campushub.userservice.user;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Year;
import java.time.ZoneOffset;

/**
 * Generates student matricules of the form {@code ETU<year><number>}, e.g. {@code ETU20260001}.
 * The number restarts at 1 every calendar year.
 *
 * <p><b>Why it is concurrency-safe.</b> Each year has one row in {@code matricule_counters}. The
 * upsert below creates that row with 1, or increments it, in a single statement, and in doing so
 * takes an exclusive lock on the row. A second approval running at the same time blocks on that
 * lock until the first transaction commits, then increments the committed value. Two approvals
 * can therefore never read the same number. The {@code SELECT ... FOR UPDATE} reads the value
 * this transaction just wrote. {@code uq_users_matricule} is a final safety net.
 *
 * <p>It must run inside the caller's transaction ({@link Propagation#MANDATORY}) so the lock is
 * held until the student row carrying the matricule is committed. If that transaction rolls
 * back, the increment rolls back with it, so no number is lost.
 */
@Component
public class MatriculeGenerator {

    static final String PREFIX = "ETU";

    private static final String INCREMENT = """
            INSERT INTO matricule_counters (academic_year, last_number) VALUES (?, 1)
            ON DUPLICATE KEY UPDATE last_number = last_number + 1
            """;
    private static final String READ = "SELECT last_number FROM matricule_counters WHERE academic_year = ? FOR UPDATE";

    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;

    public MatriculeGenerator(JdbcTemplate jdbcTemplate, Clock clock) {
        this.jdbcTemplate = jdbcTemplate;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public String next() {
        int year = Year.now(clock.withZone(ZoneOffset.UTC)).getValue();
        jdbcTemplate.update(INCREMENT, year);
        Integer number = jdbcTemplate.queryForObject(READ, Integer.class, year);
        return format(year, number);
    }

    static String format(int year, int number) {
        return String.format("%s%d%04d", PREFIX, year, number);
    }

}
