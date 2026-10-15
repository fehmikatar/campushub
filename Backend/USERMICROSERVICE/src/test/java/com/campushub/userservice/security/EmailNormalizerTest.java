package com.campushub.userservice.security;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class EmailNormalizerTest {

    @Test
    void lowerCasesAndTrimsEmail() {
        assertThat(EmailNormalizer.normalize("  Alice@Example.COM  ")).isEqualTo("alice@example.com");
    }

    @Test
    void differentCasingResolvesToSameIdentity() {
        assertThat(EmailNormalizer.normalize("Alice@Example.com"))
                .isEqualTo(EmailNormalizer.normalize("alice@example.com"));
    }

    @Test
    void nullIsPassedThrough() {
        assertThat(EmailNormalizer.normalize(null)).isNull();
    }

}
