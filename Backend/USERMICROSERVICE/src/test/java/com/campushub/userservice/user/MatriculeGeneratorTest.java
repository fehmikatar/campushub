package com.campushub.userservice.user;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Format and the SQL sequence. Concurrency against a real MySQL server is covered by
 * {@code MySqlVerificationTest#concurrentMatriculeGenerationNeverProducesADuplicate}.
 */
class MatriculeGeneratorTest {

    @Test
    void formatIsPrefixYearAndFourDigitNumber() {
        assertThat(MatriculeGenerator.format(2026, 1)).isEqualTo("ETU20260001");
        assertThat(MatriculeGenerator.format(2026, 42)).isEqualTo("ETU20260042");
        assertThat(MatriculeGenerator.format(2026, 12345)).isEqualTo("ETU202612345");
    }

    @Test
    void incrementsTheCounterOfTheCurrentYearThenReadsItUnderTheRowLock() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(), eq(Integer.class), eq(2027))).thenReturn(7);
        Clock clock = Clock.fixed(Instant.parse("2027-03-15T10:00:00Z"), ZoneOffset.UTC);

        String matricule = new MatriculeGenerator(jdbc, clock).next();

        assertThat(matricule).isEqualTo("ETU20270007");
        var order = inOrder(jdbc);
        order.verify(jdbc).update(contains("ON DUPLICATE KEY UPDATE last_number = last_number + 1"), eq(2027));
        order.verify(jdbc).queryForObject(contains("FOR UPDATE"), eq(Integer.class), eq(2027));
    }

}
