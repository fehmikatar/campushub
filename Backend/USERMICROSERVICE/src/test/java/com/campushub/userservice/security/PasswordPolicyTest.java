package com.campushub.userservice.security;

import com.campushub.userservice.exception.BadRequestException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PasswordPolicyTest {

    private final PasswordPolicy policy = new PasswordPolicy();

    @Test
    void acceptsPasswordWithinBounds() {
        assertThatCode(() -> policy.validate("exactly-twelve")).doesNotThrowAnyException();
        assertThatCode(() -> policy.validate("a".repeat(128))).doesNotThrowAnyException();
    }

    @Test
    void rejectsTooShortPassword() {
        assertThatThrownBy(() -> policy.validate("short12345")).isInstanceOf(BadRequestException.class);
    }

    @Test
    void rejectsTooLongPassword() {
        assertThatThrownBy(() -> policy.validate("a".repeat(129))).isInstanceOf(BadRequestException.class);
    }

    @Test
    void rejectsBlankPassword() {
        assertThatThrownBy(() -> policy.validate("   ")).isInstanceOf(BadRequestException.class);
    }

    @Test
    void rejectsNullPassword() {
        assertThatThrownBy(() -> policy.validate(null)).isInstanceOf(BadRequestException.class);
    }

    @Test
    void rejectsLeadingOrTrailingWhitespace() {
        assertThatThrownBy(() -> policy.validate(" leading-whitespace-password")).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> policy.validate("trailing-whitespace-password ")).isInstanceOf(BadRequestException.class);
    }

}
