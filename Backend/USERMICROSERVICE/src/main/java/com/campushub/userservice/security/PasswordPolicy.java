package com.campushub.userservice.security;

import com.campushub.userservice.exception.BadRequestException;
import org.springframework.stereotype.Component;

/**
 * Server-side password policy. Deliberately length-based only (12-128 chars) rather than
 * mandating symbol/uppercase/number combinations, which push users toward predictable
 * substitutions without meaningfully improving resistance to guessing/brute force.
 */
@Component
public class PasswordPolicy {

    public static final int MIN_LENGTH = 12;
    public static final int MAX_LENGTH = 128;

    public void validate(String rawPassword) {
        if (rawPassword == null || rawPassword.isBlank()) {
            throw new BadRequestException("Password must not be blank");
        }
        if (rawPassword.length() < MIN_LENGTH) {
            throw new BadRequestException("Password must be at least " + MIN_LENGTH + " characters long");
        }
        if (rawPassword.length() > MAX_LENGTH) {
            throw new BadRequestException("Password must be at most " + MAX_LENGTH + " characters long");
        }
        if (rawPassword.strip().length() != rawPassword.length()) {
            throw new BadRequestException("Password must not have leading or trailing whitespace");
        }
    }

}
