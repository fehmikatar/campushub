package com.campushub.userservice.security;

import jakarta.annotation.PostConstruct;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.charset.StandardCharsets;
import java.time.Duration;

/**
 * JWT settings bound from {@code campushub.security.jwt.*}. The secret comes from the
 * {@code JWT_SECRET} environment variable; startup fails if it is missing or shorter than the 32
 * bytes HMAC-SHA256 requires.
 */
@ConfigurationProperties(prefix = "campushub.security.jwt")
public class JwtProperties {

    private static final int MIN_SECRET_BYTES = 32;

    private String secret;
    private Duration accessTokenTtl = Duration.ofHours(1);
    private String issuer = "campushub-user-service";

    @PostConstruct
    void validate() {
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException(
                    "campushub.security.jwt.secret must be configured (set JWT_SECRET) - refusing to start without a JWT signing key");
        }
        if (secret.getBytes(StandardCharsets.UTF_8).length < MIN_SECRET_BYTES) {
            throw new IllegalStateException(
                    "campushub.security.jwt.secret must be at least " + MIN_SECRET_BYTES
                            + " bytes long for HMAC-SHA256 - refusing to start with a weak JWT signing key");
        }
    }

    public String getSecret() {
        return secret;
    }

    public void setSecret(String secret) {
        this.secret = secret;
    }

    public Duration getAccessTokenTtl() {
        return accessTokenTtl;
    }

    public void setAccessTokenTtl(Duration accessTokenTtl) {
        this.accessTokenTtl = accessTokenTtl;
    }

    public String getIssuer() {
        return issuer;
    }

    public void setIssuer(String issuer) {
        this.issuer = issuer;
    }

}
