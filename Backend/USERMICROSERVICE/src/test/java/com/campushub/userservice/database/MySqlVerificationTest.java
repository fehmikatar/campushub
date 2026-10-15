package com.campushub.userservice.database;

import com.campushub.userservice.user.AccountStatus;
import com.campushub.userservice.user.MatriculeGenerator;
import com.campushub.userservice.user.Role;
import com.campushub.userservice.user.User;
import com.campushub.userservice.user.UserRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Runs against a real MySQL 8.4 database ({@code mvnw test -Pmysql-verify}, needs DB_PASSWORD).
 * The context only starts if Flyway applied V1-V2 and Hibernate's {@code ddl-auto: validate}
 * agrees with the resulting schema, which is itself part of the check.
 *
 * <p>Test rows use the {@value #EMAIL_PREFIX} email prefix and the counter year
 * {@value #TEST_YEAR}; both are removed afterwards, so real data and real matricule numbers are
 * never touched.
 */
@SpringBootTest
@ActiveProfiles("local")
@Tag("mysql")
class MySqlVerificationTest {

    private static final String EMAIL_PREFIX = "mysql-verification-";
    private static final int TEST_YEAR = 2999;

    @Autowired
    private JdbcTemplate jdbcTemplate;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private EntityManager entityManager;
    @Autowired
    private PlatformTransactionManager transactionManager;

    @AfterEach
    void cleanUp() {
        jdbcTemplate.update("DELETE FROM users WHERE email LIKE ?", EMAIL_PREFIX + "%");
        jdbcTemplate.update("DELETE FROM matricule_counters WHERE academic_year = ?", TEST_YEAR);
    }

    @Test
    void serverIsMySql84AndTheSessionRunsInUtc() {
        assertThat(jdbcTemplate.queryForObject("SELECT VERSION()", String.class)).startsWith("8.4");
        assertThat(jdbcTemplate.queryForObject("SELECT @@session.time_zone", String.class)).isEqualTo("+00:00");
    }

    @Test
    void flywayAppliedTheCampusHubMigrationsOnly() {
        List<Map<String, Object>> history = jdbcTemplate.queryForList(
                "SELECT version, success FROM flyway_schema_history WHERE version IS NOT NULL ORDER BY installed_rank");

        assertThat(history).extracting(row -> String.valueOf(row.get("version"))).containsExactly("1", "2");
        assertThat(history).allSatisfy(row -> assertThat(row.get("success")).isIn(true, 1, (byte) 1));
        assertThat(jdbcTemplate.queryForList("""
                SELECT TABLE_NAME FROM information_schema.TABLES
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> 'flyway_schema_history'
                """, String.class)).containsExactlyInAnyOrder("users", "matricule_counters");
    }

    @Test
    @Transactional
    void aUserRoundTripsWithItsUuidAndTimestamps() {
        User saved = userRepository.saveAndFlush(new User(EMAIL_PREFIX + "roundtrip@example.com", "hash",
                "Martin", "Alice", Role.ETUDIANT, AccountStatus.PENDING_APPROVAL));
        UUID id = saved.getId();
        entityManager.clear();

        User reloaded = userRepository.findById(id).orElseThrow();
        assertThat(reloaded.getId()).isEqualTo(id);
        assertThat(reloaded.getRole()).isEqualTo(Role.ETUDIANT);
        assertThat(reloaded.getStatus()).isEqualTo(AccountStatus.PENDING_APPROVAL);
        assertThat(reloaded.getCreatedAt()).isCloseTo(Instant.now(), org.assertj.core.api.Assertions.within(1, ChronoUnit.MINUTES));
    }

    @Test
    void checkConstraintsRejectInconsistentRows() {
        // Role/status values are case-sensitive.
        assertRejected("'etudiant'", "'PENDING_APPROVAL'", "NULL", "NULL", "NULL");
        assertRejected("'CUSTOMER'", "'ACTIVE'", "NULL", "NULL", "NULL");
        assertRejected("'ETUDIANT'", "'DISABLED'", "NULL", "NULL", "NULL");
        // Each attribute only for its role.
        assertRejected("'ENSEIGNANT'", "'ACTIVE'", "'ETU29990001'", "NULL", "NULL");
        assertRejected("'ETUDIANT'", "'ACTIVE'", "'ETU29990002'", "'Physique'", "NULL");
        assertRejected("'ENSEIGNANT'", "'ACTIVE'", "NULL", "NULL", "'Scolarite'");
        // Only students can be pending, and an approved student has a matricule.
        assertRejected("'ENSEIGNANT'", "'PENDING_APPROVAL'", "NULL", "NULL", "NULL");
        assertRejected("'ETUDIANT'", "'ACTIVE'", "NULL", "NULL", "NULL");
    }

    @Test
    void emailAndMatriculeAreUnique() {
        insert("a", "'ETUDIANT'", "'ACTIVE'", "'ETU29990001'", "NULL", "NULL");

        assertThatThrownBy(() -> insert("b", "'ETUDIANT'", "'ACTIVE'", "'etu29990001'", "NULL", "NULL"))
                .as("matricule uniqueness, case-insensitive").isInstanceOf(Exception.class);
        assertThatThrownBy(() -> insert("A", "'ETUDIANT'", "'PENDING_APPROVAL'", "NULL", "NULL", "NULL"))
                .as("email uniqueness").isInstanceOf(Exception.class);
    }

    /**
     * 8 threads x 25 approvals, each in its own transaction like a real approval. With the
     * row-locking upsert every number from 1 to 200 must come out exactly once.
     */
    @Test
    void concurrentMatriculeGenerationNeverProducesADuplicate() throws Exception {
        MatriculeGenerator generator = new MatriculeGenerator(jdbcTemplate,
                Clock.fixed(Instant.parse(TEST_YEAR + "-06-01T00:00:00Z"), ZoneOffset.UTC));
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        Set<String> matricules = ConcurrentHashMap.newKeySet();
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(8);
        List<Future<?>> futures = new ArrayList<>();

        for (int t = 0; t < 8; t++) {
            futures.add(pool.submit(() -> {
                start.await();
                for (int i = 0; i < 25; i++) {
                    String matricule = transaction.execute(status -> generator.next());
                    assertThat(matricules.add(matricule)).as("duplicate " + matricule).isTrue();
                }
                return null;
            }));
        }
        start.countDown();
        for (Future<?> future : futures) {
            future.get();
        }
        pool.shutdown();

        assertThat(matricules).hasSize(200).contains("ETU29990001", "ETU29990200");
    }

    @Test
    void aRolledBackApprovalDoesNotConsumeANumber() {
        MatriculeGenerator generator = new MatriculeGenerator(jdbcTemplate,
                Clock.fixed(Instant.parse(TEST_YEAR + "-06-01T00:00:00Z"), ZoneOffset.UTC));
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);

        transaction.executeWithoutResult(status -> {
            generator.next();
            status.setRollbackOnly();
        });

        String next = transaction.execute(status -> generator.next());
        assertThat(next).isEqualTo("ETU29990001");
    }

    private void assertRejected(String role, String status, String matricule, String specialite, String service) {
        assertThatThrownBy(() -> insert(UUID.randomUUID().toString(), role, status, matricule, specialite, service))
                .as("role=%s status=%s matricule=%s specialite=%s service=%s", role, status, matricule, specialite, service)
                .isInstanceOf(Exception.class);
    }

    private void insert(String emailSuffix, String role, String status, String matricule, String specialite, String service) {
        jdbcTemplate.update("INSERT INTO users (id, email, password_hash, nom, prenom, role, status, matricule, specialite, service)"
                        + " VALUES (?, ?, 'x', 'N', 'P', " + role + ", " + status + ", " + matricule + ", " + specialite + ", " + service + ")",
                UUID.randomUUID().toString(), EMAIL_PREFIX + emailSuffix + "@example.com");
    }

}
