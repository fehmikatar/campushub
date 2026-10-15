package com.campushub.userservice.security;

import java.util.Locale;

/**
 * Normalizes email addresses to a single canonical form before uniqueness checks/persistence, so
 * {@code Alice@Example.com} and {@code alice@example.com} always resolve to the same
 * account.
 */
public final class EmailNormalizer {

    private EmailNormalizer() {
    }

    public static String normalize(String rawEmail) {
        if (rawEmail == null) {
            return null;
        }
        return rawEmail.trim().toLowerCase(Locale.ROOT);
    }

}
