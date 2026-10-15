package com.campushub.userservice.security;

import com.campushub.userservice.user.Role;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Date;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtServiceTest {

    private static final String SECRET = "test-only-jwt-signing-secret-at-least-32-bytes-long";
    private static final Instant NOW = Instant.parse("2026-01-01T00:00:00Z");

    private Clock clock;
    private JwtService jwtService;

    @BeforeEach
    void setUp() {
        clock = Clock.fixed(NOW, ZoneOffset.UTC);
        jwtService = new JwtService(properties(SECRET, "campushub-user-service", Duration.ofHours(1)), clock);
    }

    @ParameterizedTest
    @EnumSource(Role.class)
    void issuedTokenParsesBackToTheSameUserRoleAndIssueTime(Role role) {
        UUID userId = UUID.randomUUID();

        JwtService.ParsedAccessToken parsed = jwtService.parse(jwtService.issueAccessToken(userId, role));

        assertThat(parsed.userId()).isEqualTo(userId);
        assertThat(parsed.role()).isEqualTo(role);
        assertThat(parsed.issuedAt()).isEqualTo(NOW);
        assertThat(parsed.jti()).isNotBlank();
    }

    @Test
    void tokenContainsOnlyIdentityClaimsAndNoPersonalData() {
        String token = jwtService.issueAccessToken(UUID.randomUUID(), Role.ETUDIANT);
        String payload = new String(Base64.getUrlDecoder().decode(token.split("\\.")[1]), StandardCharsets.UTF_8);

        assertThat(payload).contains("\"sub\"", "\"role\":\"ETUDIANT\"", "\"iss\":\"campushub-user-service\"", "\"exp\"")
                .doesNotContain("password", "email", "nom", "matricule");
    }

    @Test
    void expiredTokenIsRejected() {
        String token = jwtService.issueAccessToken(UUID.randomUUID(), Role.ETUDIANT);
        JwtService later = new JwtService(properties(SECRET, "campushub-user-service", Duration.ofHours(1)),
                Clock.fixed(NOW.plus(Duration.ofHours(1)).plusSeconds(1), ZoneOffset.UTC));

        assertThatThrownBy(() -> later.parse(token)).isInstanceOf(JwtException.class);
    }

    @Test
    void malformedTokenIsRejected() {
        assertThatThrownBy(() -> jwtService.parse("not-a-jwt")).isInstanceOf(JwtException.class);
    }

    @Test
    void tokenSignedWithADifferentKeyIsRejected() {
        JwtService other = new JwtService(properties("a-completely-different-32-byte-signing-secret!!",
                "campushub-user-service", Duration.ofHours(1)), clock);

        assertThatThrownBy(() -> jwtService.parse(other.issueAccessToken(UUID.randomUUID(), Role.ADMIN)))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void tamperedPayloadIsRejected() {
        String[] parts = jwtService.issueAccessToken(UUID.randomUUID(), Role.ETUDIANT).split("\\.");

        assertThatThrownBy(() -> jwtService.parse(parts[0] + "." + parts[1] + "x." + parts[2]))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void tokenFromAnotherIssuerIsRejectedEvenWithAValidSignature() {
        // e.g. a token from the former H&B Travel backend ("hb-travel-backend") signed with the same key.
        JwtService foreign = new JwtService(properties(SECRET, "hb-travel-backend", Duration.ofHours(1)), clock);

        assertThatThrownBy(() -> jwtService.parse(foreign.issueAccessToken(UUID.randomUUID(), Role.ADMIN)))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void tokenWithAnUnknownRoleIsRejected() {
        SecretKey key = Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8));
        String token = Jwts.builder()
                .subject(UUID.randomUUID().toString())
                .claim("role", "CUSTOMER")
                .issuer("campushub-user-service")
                .issuedAt(Date.from(NOW))
                .expiration(Date.from(NOW.plusSeconds(900)))
                .signWith(key)
                .compact();

        assertThatThrownBy(() -> jwtService.parse(token)).isInstanceOf(JwtException.class);
    }

    @Test
    void aMissingOrShortSecretPreventsStartup() {
        assertThatThrownBy(() -> properties(null, "x", Duration.ofHours(1)).validate())
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> properties("too-short", "x", Duration.ofHours(1)).validate())
                .isInstanceOf(IllegalStateException.class);
    }

    private static JwtProperties properties(String secret, String issuer, Duration ttl) {
        JwtProperties properties = new JwtProperties();
        properties.setSecret(secret);
        properties.setIssuer(issuer);
        properties.setAccessTokenTtl(ttl);
        return properties;
    }

}
