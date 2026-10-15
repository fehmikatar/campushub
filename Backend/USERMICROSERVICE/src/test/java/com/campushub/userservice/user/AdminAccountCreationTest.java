package com.campushub.userservice.user;

import com.campushub.userservice.support.AbstractMockedRepositorySecurityTest;
import com.campushub.userservice.support.EntityIdSupport;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Additional administrators are created at any time through {@code POST /api/v1/admin/users}
 * (not by {@code AdminBootstrap}, which only ever creates the first one), and only by an
 * authenticated ADMIN.
 */
class AdminAccountCreationTest extends AbstractMockedRepositorySecurityTest {

    private static final String SECOND_ADMIN_PASSWORD = "second-admin-password-1";

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Test
    void anAdministratorCreatesAnotherAdministratorWhoCanThenLogInAndAdminister() throws Exception {
        when(userRepository.save(any())).thenAnswer(inv -> {
            User saved = inv.getArgument(0);
            EntityIdSupport.assignId(saved, UUID.randomUUID());
            return saved;
        });

        mockMvc.perform(json(post("/api/v1/admin/users"), secondAdmin())
                        .header("Authorization", bearerFor(user(UUID.randomUUID(), Role.ADMIN))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.role").value("ADMIN"))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.service").value("Scolarite"))
                .andExpect(jsonPath("$.email").value("claire.bernard@campushub.test"))
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist());

        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(saved.capture());
        User secondAdmin = saved.getValue();
        assertThat(secondAdmin.getRole()).isEqualTo(Role.ADMIN);
        assertThat(secondAdmin.getStatus()).isEqualTo(AccountStatus.ACTIVE);
        assertThat(secondAdmin.getPasswordHash()).startsWith("$2a$");
        assertThat(passwordEncoder.matches(SECOND_ADMIN_PASSWORD, secondAdmin.getPasswordHash())).isTrue();

        // The new administrator logs in with the password chosen at creation...
        when(userRepository.findByEmail("claire.bernard@campushub.test")).thenReturn(Optional.of(secondAdmin));
        String body = mockMvc.perform(json(post("/api/v1/auth/login"),
                        Map.of("email", "claire.bernard@campushub.test", "password", SECOND_ADMIN_PASSWORD)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String token = objectMapper.readTree(body).get("accessToken").asText();
        assertThat(jwtService.parse(token).role()).isEqualTo(Role.ADMIN);

        // ...and that token opens the admin endpoints.
        when(userRepository.findById(secondAdmin.getId())).thenReturn(Optional.of(secondAdmin));
        when(userRepository.findAll(any(Pageable.class))).thenAnswer(inv -> new PageImpl<User>(List.of(), inv.getArgument(0), 0));
        mockMvc.perform(get("/api/v1/admin/users").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    @Test
    void theAdministrativeDepartmentIsRequired() throws Exception {
        String bearer = bearerFor(user(UUID.randomUUID(), Role.ADMIN));
        Map<String, Object> withoutService = new HashMap<>(secondAdmin());
        withoutService.remove("service");

        mockMvc.perform(json(post("/api/v1/admin/users"), withoutService).header("Authorization", bearer))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("BAD_REQUEST"));
        verify(userRepository, never()).save(any());
    }

    @Test
    void aDuplicateEmailIs409() throws Exception {
        when(userRepository.existsByEmail("claire.bernard@campushub.test")).thenReturn(true);

        mockMvc.perform(json(post("/api/v1/admin/users"), secondAdmin())
                        .header("Authorization", bearerFor(user(UUID.randomUUID(), Role.ADMIN))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONFLICT"));
        verify(userRepository, never()).save(any());
    }

    @Test
    void invalidPasswordEmailOrRoleIs400() throws Exception {
        String bearer = bearerFor(user(UUID.randomUUID(), Role.ADMIN));

        Map<String, Object> weakPassword = new HashMap<>(secondAdmin());
        weakPassword.put("password", "short");
        mockMvc.perform(json(post("/api/v1/admin/users"), weakPassword).header("Authorization", bearer))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

        Map<String, Object> badEmail = new HashMap<>(secondAdmin());
        badEmail.put("email", "not-an-email");
        mockMvc.perform(json(post("/api/v1/admin/users"), badEmail).header("Authorization", bearer))
                .andExpect(status().isBadRequest());

        Map<String, Object> unknownRole = new HashMap<>(secondAdmin());
        unknownRole.put("role", "SUPERADMIN");
        mockMvc.perform(json(post("/api/v1/admin/users"), unknownRole).header("Authorization", bearer))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));

        verify(userRepository, never()).save(any());
    }

    @Test
    void unauthenticatedCallersCannotCreateAnAdministrator() throws Exception {
        mockMvc.perform(json(post("/api/v1/admin/users"), secondAdmin()))
                .andExpect(status().isUnauthorized());
        verify(userRepository, never()).save(any());
    }

    @ParameterizedTest
    @EnumSource(value = Role.class, names = {"ETUDIANT", "ENSEIGNANT"})
    void studentsAndTeachersCannotCreateAnAdministrator(Role role) throws Exception {
        mockMvc.perform(json(post("/api/v1/admin/users"), secondAdmin())
                        .header("Authorization", bearerFor(user(UUID.randomUUID(), role))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        verify(userRepository, never()).save(any());
    }

    @Test
    void publicRegistrationNeverCreatesAnAdministrator() throws Exception {
        when(userRepository.save(any())).thenAnswer(inv -> {
            User saved = inv.getArgument(0);
            EntityIdSupport.assignId(saved, UUID.randomUUID());
            return saved;
        });
        Map<String, Object> body = new HashMap<>(secondAdmin());

        mockMvc.perform(json(post("/api/v1/auth/register"), body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.role").value("ETUDIANT"))
                .andExpect(jsonPath("$.status").value("PENDING_APPROVAL"))
                .andExpect(jsonPath("$.service").doesNotExist());
    }

    private static Map<String, Object> secondAdmin() {
        return Map.of(
                "email", "Claire.Bernard@CampusHub.test",
                "password", SECOND_ADMIN_PASSWORD,
                "role", "ADMIN",
                "nom", "Bernard",
                "prenom", "Claire",
                "service", "Scolarite");
    }

}
