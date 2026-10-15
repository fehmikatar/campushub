package com.campushub.userservice.auth;

import com.campushub.userservice.config.AdminBootstrapProperties;
import com.campushub.userservice.exception.BadRequestException;
import com.campushub.userservice.security.PasswordPolicy;
import com.campushub.userservice.user.AccountStatus;
import com.campushub.userservice.user.Role;
import com.campushub.userservice.user.User;
import com.campushub.userservice.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminBootstrapTest {

    private UserRepository userRepository;
    private AdminBootstrapProperties properties;
    private BCryptPasswordEncoder passwordEncoder;
    private AdminBootstrap bootstrap;

    @BeforeEach
    void setUp() {
        userRepository = mock(UserRepository.class);
        when(userRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        properties = new AdminBootstrapProperties();
        passwordEncoder = new BCryptPasswordEncoder();
        bootstrap = new AdminBootstrap(userRepository, passwordEncoder, new PasswordPolicy(), properties);
    }

    @Test
    void doesNothingWhenNotConfigured() {
        bootstrap.bootstrap();

        verify(userRepository, never()).save(any());
    }

    @Test
    void createsAnActiveAdministratorWithAnEncodedPassword() {
        configure("Root.Admin@CampusHub.test", "bootstrap-password-123");

        bootstrap.bootstrap();

        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(saved.capture());
        User admin = saved.getValue();
        assertThat(admin.getRole()).isEqualTo(Role.ADMIN);
        assertThat(admin.getStatus()).isEqualTo(AccountStatus.ACTIVE);
        assertThat(admin.getEmail()).isEqualTo("root.admin@campushub.test");
        assertThat(passwordEncoder.matches("bootstrap-password-123", admin.getPasswordHash())).isTrue();
    }

    @Test
    void neverCreatesASecondAdministrator() {
        configure("root.admin@campushub.test", "bootstrap-password-123");
        when(userRepository.existsByRole(Role.ADMIN)).thenReturn(true);

        bootstrap.bootstrap();

        verify(userRepository, never()).save(any());
    }

    @Test
    void refusesAWeakConfiguredPassword() {
        configure("root.admin@campushub.test", "admin");

        assertThatThrownBy(() -> bootstrap.bootstrap()).isInstanceOf(BadRequestException.class);
        verify(userRepository, never()).save(any());
    }

    private void configure(String email, String password) {
        properties.setEmail(email);
        properties.setPassword(password);
    }

}
