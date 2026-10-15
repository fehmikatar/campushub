package com.campushub.userservice.auth;

import com.campushub.userservice.exception.BadRequestException;
import com.campushub.userservice.exception.ConflictException;
import com.campushub.userservice.exception.ForbiddenOperationException;
import com.campushub.userservice.exception.UnauthorizedException;
import com.campushub.userservice.security.JwtProperties;
import com.campushub.userservice.security.JwtService;
import com.campushub.userservice.security.PasswordPolicy;
import com.campushub.userservice.support.EntityIdSupport;
import com.campushub.userservice.user.AccountStatus;
import com.campushub.userservice.user.Role;
import com.campushub.userservice.user.User;
import com.campushub.userservice.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AuthServiceTest {

    private static final String PASSWORD = "correct-horse-battery";

    private UserRepository userRepository;
    private PasswordEncoder passwordEncoder;
    private JwtService jwtService;
    private AuthService service;

    @BeforeEach
    void setUp() {
        userRepository = mock(UserRepository.class);
        when(userRepository.save(any())).thenAnswer(inv -> {
            User saved = inv.getArgument(0);
            EntityIdSupport.assignId(saved, UUID.randomUUID());
            return saved;
        });
        passwordEncoder = new BCryptPasswordEncoder();
        JwtProperties jwtProperties = new JwtProperties();
        jwtProperties.setSecret("test-only-jwt-signing-secret-at-least-32-bytes-long");
        jwtService = new JwtService(jwtProperties, Clock.fixed(Instant.parse("2026-01-01T00:00:00Z"), ZoneOffset.UTC));
        service = new AuthService(userRepository, passwordEncoder, new PasswordPolicy(), jwtService);
    }

    // -------------------------------------------------------------------------------------
    // Registration
    // -------------------------------------------------------------------------------------

    @Test
    void registrationCreatesAPendingStudentWithABcryptPasswordAndNoMatricule() {
        User student = service.register("Martin", "Alice", "  Alice.Martin@Example.com ", PASSWORD);

        assertThat(student.getRole()).isEqualTo(Role.ETUDIANT);
        assertThat(student.getStatus()).isEqualTo(AccountStatus.PENDING_APPROVAL);
        assertThat(student.getMatricule()).isNull();
        assertThat(student.getEmail()).isEqualTo("alice.martin@example.com");
        assertThat(student.getNom()).isEqualTo("Martin");
        assertThat(student.getPrenom()).isEqualTo("Alice");
        assertThat(student.getPasswordHash()).isNotEqualTo(PASSWORD).startsWith("$2a$");
        assertThat(passwordEncoder.matches(PASSWORD, student.getPasswordHash())).isTrue();
    }

    @Test
    void registrationWithAnExistingEmailIsAConflict() {
        when(userRepository.existsByEmail("alice@example.com")).thenReturn(true);

        assertThatThrownBy(() -> service.register("Martin", "Alice", "ALICE@example.com", PASSWORD))
                .isInstanceOf(ConflictException.class);
        verify(userRepository, never()).save(any());
    }

    @Test
    void registrationWithAWeakPasswordIsRejected() {
        assertThatThrownBy(() -> service.register("Martin", "Alice", "alice@example.com", "short"))
                .isInstanceOf(BadRequestException.class);
        verify(userRepository, never()).save(any());
    }

    // -------------------------------------------------------------------------------------
    // Login
    // -------------------------------------------------------------------------------------

    @ParameterizedTest
    @EnumSource(Role.class)
    void activeStudentTeacherAndAdministratorCanLogInAndGetATokenForTheirRole(Role role) {
        User user = account(role, AccountStatus.ACTIVE);

        String token = service.login("USER@example.com", PASSWORD);

        JwtService.ParsedAccessToken parsed = jwtService.parse(token);
        assertThat(parsed.userId()).isEqualTo(user.getId());
        assertThat(parsed.role()).isEqualTo(role);
    }

    @Test
    void aStudentAwaitingApprovalCannotLogIn() {
        account(Role.ETUDIANT, AccountStatus.PENDING_APPROVAL);

        assertThatThrownBy(() -> service.login("user@example.com", PASSWORD))
                .isInstanceOf(ForbiddenOperationException.class)
                .hasMessageContaining("awaiting approval");
    }

    @Test
    void aSuspendedAccountCannotLogIn() {
        account(Role.ENSEIGNANT, AccountStatus.SUSPENDED);

        assertThatThrownBy(() -> service.login("user@example.com", PASSWORD))
                .isInstanceOf(ForbiddenOperationException.class)
                .hasMessageContaining("suspended");
    }

    @Test
    void wrongPasswordAndUnknownEmailGiveTheSameAnswer() {
        account(Role.ETUDIANT, AccountStatus.ACTIVE);
        when(userRepository.findByEmail("nobody@example.com")).thenReturn(Optional.empty());

        Throwable wrongPassword = catchThrowable(() -> service.login("user@example.com", "not-the-password-1"));
        Throwable unknownEmail = catchThrowable(() -> service.login("nobody@example.com", PASSWORD));

        assertThat(wrongPassword).isInstanceOf(UnauthorizedException.class);
        assertThat(unknownEmail).isInstanceOf(UnauthorizedException.class).hasMessage(wrongPassword.getMessage());
    }

    @Test
    void aPendingAccountWithAWrongPasswordLearnsNothingAboutItsStatus() {
        account(Role.ETUDIANT, AccountStatus.PENDING_APPROVAL);

        assertThatThrownBy(() -> service.login("user@example.com", "not-the-password-1"))
                .isInstanceOf(UnauthorizedException.class);
    }

    @Test
    void anUnknownEmailStillRunsABcryptComparison() {
        PasswordEncoder spyEncoder = spy(new BCryptPasswordEncoder());
        AuthService withSpy = new AuthService(userRepository, spyEncoder, new PasswordPolicy(), jwtService);
        when(userRepository.findByEmail("nobody@example.com")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> withSpy.login("nobody@example.com", PASSWORD)).isInstanceOf(UnauthorizedException.class);
        verify(spyEncoder).matches(eq(PASSWORD), anyString());
    }

    private User account(Role role, AccountStatus status) {
        User user = new User("user@example.com", passwordEncoder.encode(PASSWORD), "Martin", "Alice", role, status);
        EntityIdSupport.assignId(user, UUID.randomUUID());
        when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(user));
        return user;
    }

}
