package com.campushub.userservice.security;

import com.campushub.userservice.user.Role;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

/**
 * Issues and validates HS256 access tokens. Claims are deliberately minimal — {@code sub} (user
 * id), {@code role}, {@code iss}, {@code iat}, {@code exp}, {@code jti} — and never contain a
 * password or personal data, since anyone holding a JWT can read it.
 *
 * <p>There is no refresh token: when the access token expires, the user logs in again.
 */
@Component
public class JwtService {

    private final JwtProperties jwtProperties;
    private final Clock clock;
    private final SecretKey signingKey;

    public JwtService(JwtProperties jwtProperties, Clock clock) {
        this.jwtProperties = jwtProperties;
        this.clock = clock;
        this.signingKey = Keys.hmacShaKeyFor(jwtProperties.getSecret().getBytes(StandardCharsets.UTF_8));
    }

    public String issueAccessToken(UUID userId, Role role) {
        Instant now = Instant.now(clock);
        return Jwts.builder()
                .subject(userId.toString())
                .claim("role", role.name())
                .id(UUID.randomUUID().toString())
                .issuer(jwtProperties.getIssuer())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(jwtProperties.getAccessTokenTtl())))
                .signWith(signingKey)
                .compact();
    }

    /**
     * Verifies the signature, the issuer and the expiry (against the injected {@link Clock}, so
     * tests can move time), then the presence and format of {@code sub} and {@code role}. Any
     * failure is a {@link JwtException}.
     */
    public ParsedAccessToken parse(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(signingKey)
                .requireIssuer(jwtProperties.getIssuer())
                .clock(() -> Date.from(Instant.now(clock)))
                .build()
                .parseSignedClaims(token)
                .getPayload();

        String roleClaim = claims.get("role", String.class);
        if (roleClaim == null || claims.getSubject() == null || claims.getIssuedAt() == null) {
            throw new JwtException("Missing required claims");
        }

        try {
            return new ParsedAccessToken(UUID.fromString(claims.getSubject()), Role.valueOf(roleClaim),
                    claims.getIssuedAt().toInstant(), claims.getId());
        } catch (IllegalArgumentException e) {
            throw new JwtException("Malformed claim value", e);
        }
    }

    public long accessTokenTtlSeconds() {
        return jwtProperties.getAccessTokenTtl().toSeconds();
    }

    public record ParsedAccessToken(UUID userId, Role role, Instant issuedAt, String jti) {
    }

}
