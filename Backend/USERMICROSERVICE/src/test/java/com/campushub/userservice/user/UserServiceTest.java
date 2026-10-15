package com.campushub.userservice.user;

import com.campushub.userservice.exception.BadRequestException;
import com.campushub.userservice.security.PasswordPolicy;
import com.campushub.userservice.support.EntityIdSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class UserServiceTest {

    private static final String CURRENT_PASSWORD = "current-password-123";
    private static final Instant NOW = Instant.parse("2026-05-04T10:15:30.123456Z");

    private BCryptPasswordEncoder passwordEncoder;
    private UserService service;
    private User student;

    @BeforeEach
    void setUp() {
        UserRepository userRepository = mock(UserRepository.class);
        passwordEncoder = new BCryptPasswordEncoder();
        service = new UserService(userRepository, passwordEncoder, new PasswordPolicy(), Clock.fixed(NOW, ZoneOffset.UTC));

        student = new User("alice@example.com", passwordEncoder.encode(CURRENT_PASSWORD), "Martin", "Alice",
                Role.ETUDIANT, AccountStatus.ACTIVE);
        student.changeRole(Role.ETUDIANT, "ETU20260001", null, null);
        EntityIdSupport.assignId(student, UUID.randomUUID());
        when(userRepository.findById(student.getId())).thenReturn(Optional.of(student));
    }

    @Test
    void updatingTheOwnProfileChangesTheNameOnly() {
        service.updateOwnProfile(student.getId(), "Martin-Durand", "Alice");

        assertThat(student.getNom()).isEqualTo("Martin-Durand");
        assertThat(student.getRole()).isEqualTo(Role.ETUDIANT);
        assertThat(student.getMatricule()).isEqualTo("ETU20260001");
        assertThat(student.getEmail()).isEqualTo("alice@example.com");
    }

    @Test
    void passwordChangeStoresTheNewBcryptHashAndInvalidatesEarlierTokens() {
        service.changeOwnPassword(student.getId(), CURRENT_PASSWORD, "brand-new-password-1");

        assertThat(passwordEncoder.matches("brand-new-password-1", student.getPasswordHash())).isTrue();
        assertThat(passwordEncoder.matches(CURRENT_PASSWORD, student.getPasswordHash())).isFalse();
        assertThat(student.getTokensValidAfter())
                .as("truncated to the second, like a JWT iat")
                .isEqualTo(Instant.parse("2026-05-04T10:15:30Z"));
    }

    @Test
    void passwordChangeRequiresTheCurrentPassword() {
        assertThatThrownBy(() -> service.changeOwnPassword(student.getId(), "wrong-password-12", "brand-new-password-1"))
                .isInstanceOf(BadRequestException.class);

        assertThat(passwordEncoder.matches(CURRENT_PASSWORD, student.getPasswordHash())).isTrue();
        assertThat(student.getTokensValidAfter()).isNull();
    }

    @Test
    void theNewPasswordMustMeetThePolicy() {
        assertThatThrownBy(() -> service.changeOwnPassword(student.getId(), CURRENT_PASSWORD, "short"))
                .isInstanceOf(BadRequestException.class);
    }

}
