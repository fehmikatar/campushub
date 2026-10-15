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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The REST contract and the role matrix, end to end through the real controllers and services. */
class UserApiTest extends AbstractMockedRepositorySecurityTest {

    @Autowired
    private PasswordEncoder passwordEncoder;

    // -------------------------------------------------------------------------------------
    // Registration -> approval -> login
    // -------------------------------------------------------------------------------------

    @Test
    void registrationCreatesAPendingStudentEvenIfTheClientAsksForMore() throws Exception {
        when(userRepository.save(any())).thenAnswer(inv -> withId(inv.getArgument(0)));
        Map<String, Object> body = new HashMap<>(Map.of(
                "nom", "Martin", "prenom", "Alice", "email", "alice@example.com", "password", "a-long-enough-password"));
        body.put("role", "ADMIN");
        body.put("status", "ACTIVE");
        body.put("matricule", "ETU20269999");

        mockMvc.perform(json(post("/api/v1/auth/register"), body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.role").value("ETUDIANT"))
                .andExpect(jsonPath("$.status").value("PENDING_APPROVAL"))
                .andExpect(jsonPath("$.matricule").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist());

        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(saved.capture());
        assertThat(saved.getValue().getRole()).isEqualTo(Role.ETUDIANT);
        assertThat(saved.getValue().getStatus()).isEqualTo(AccountStatus.PENDING_APPROVAL);
    }

    @Test
    void registrationValidatesItsInput() throws Exception {
        mockMvc.perform(json(post("/api/v1/auth/register"), Map.of("nom", "", "prenom", "Alice",
                        "email", "not-an-email", "password", "short")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors.length()").value(3));
    }

    @Test
    void aPendingStudentCannotLogInThenCanAfterApproval() throws Exception {
        UUID studentId = UUID.randomUUID();
        User student = new User("alice@example.com", passwordEncoder.encode("alice-password-123"), "Martin", "Alice",
                Role.ETUDIANT, AccountStatus.PENDING_APPROVAL);
        EntityIdSupport.assignId(student, studentId);
        when(userRepository.findByEmail("alice@example.com")).thenReturn(Optional.of(student));
        when(userRepository.findById(studentId)).thenReturn(Optional.of(student));
        Map<String, String> credentials = Map.of("email", "alice@example.com", "password", "alice-password-123");

        mockMvc.perform(json(post("/api/v1/auth/login"), credentials))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("Your registration is awaiting approval by an administrator"));

        when(matriculeGenerator.next()).thenReturn("ETU20260001");
        mockMvc.perform(patch("/api/v1/admin/users/" + studentId + "/approve")
                        .header("Authorization", bearerFor(user(UUID.randomUUID(), Role.ADMIN))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.matricule").value("ETU20260001"));

        mockMvc.perform(json(post("/api/v1/auth/login"), credentials))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.expiresInSeconds").value(3600));
    }

    @Test
    void wrongCredentialsGive401() throws Exception {
        when(userRepository.findByEmail("nobody@example.com")).thenReturn(Optional.empty());

        mockMvc.perform(json(post("/api/v1/auth/login"), Map.of("email", "nobody@example.com", "password", "whatever-123")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid email or password"));
    }

    // -------------------------------------------------------------------------------------
    // Own profile, every role
    // -------------------------------------------------------------------------------------

    @ParameterizedTest
    @EnumSource(Role.class)
    void everyRoleReadsItsOwnProfileWithoutThePasswordHash(Role role) throws Exception {
        User user = user(UUID.randomUUID(), role);

        mockMvc.perform(get("/api/v1/users/me").header("Authorization", bearerFor(user)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(user.getId().toString()))
                .andExpect(jsonPath("$.role").value(role.name()))
                .andExpect(jsonPath("$.nom").value("Martin"))
                .andExpect(jsonPath("$.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.password").doesNotExist());
    }

    @Test
    void aStudentUpdatesTheirNameButCannotChangeRoleMatriculeOrEmail() throws Exception {
        User student = user(UUID.randomUUID(), Role.ETUDIANT);
        Map<String, Object> body = Map.of("nom", "Martin-Durand", "prenom", "Alice",
                "role", "ADMIN", "matricule", "ETU20269999", "email", "other@example.com", "status", "ACTIVE");

        mockMvc.perform(json(put("/api/v1/users/me"), body).header("Authorization", bearerFor(student)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nom").value("Martin-Durand"))
                .andExpect(jsonPath("$.role").value("ETUDIANT"))
                .andExpect(jsonPath("$.matricule").value("ETU20260001"));

        assertThat(student.getRole()).isEqualTo(Role.ETUDIANT);
        assertThat(student.getMatricule()).isEqualTo("ETU20260001");
        assertThat(student.getEmail()).isNotEqualTo("other@example.com");
    }

    @Test
    void passwordChangeWorksAndTheOldTokenIsRejectedAfterwards() throws Exception {
        UUID id = UUID.randomUUID();
        User teacher = new User("jean@example.com", passwordEncoder.encode("current-password-123"), "Dupont", "Jean",
                Role.ENSEIGNANT, AccountStatus.ACTIVE);
        EntityIdSupport.assignId(teacher, id);
        String bearer = bearerFor(teacher);

        mockMvc.perform(json(put("/api/v1/users/me/password"),
                        Map.of("currentPassword", "current-password-123", "newPassword", "a-brand-new-password"))
                        .header("Authorization", bearer))
                .andExpect(status().isOk());
        assertThat(passwordEncoder.matches("a-brand-new-password", teacher.getPasswordHash())).isTrue();

        // Issued before the change (or in the same second): no longer accepted.
        mockMvc.perform(get("/api/v1/users/me").header("Authorization", bearer)).andExpect(status().isUnauthorized());
    }

    @Test
    void aWrongCurrentPasswordIsRejected() throws Exception {
        User teacher = new User("jean@example.com", passwordEncoder.encode("current-password-123"), "Dupont", "Jean",
                Role.ENSEIGNANT, AccountStatus.ACTIVE);
        EntityIdSupport.assignId(teacher, UUID.randomUUID());

        mockMvc.perform(json(put("/api/v1/users/me/password"),
                        Map.of("currentPassword", "wrong-password-123", "newPassword", "a-brand-new-password"))
                        .header("Authorization", bearerFor(teacher)))
                .andExpect(status().isBadRequest());
    }

    // -------------------------------------------------------------------------------------
    // Admin endpoints: 401 / 403 / allowed
    // -------------------------------------------------------------------------------------

    @Test
    void adminEndpointsRequireAuthentication() throws Exception {
        for (MockHttpServletRequestBuilder request : adminRequests(UUID.randomUUID())) {
            mockMvc.perform(request).andExpect(status().isUnauthorized());
        }
    }

    @ParameterizedTest
    @EnumSource(value = Role.class, names = {"ETUDIANT", "ENSEIGNANT"})
    void studentsAndTeachersAreForbiddenFromEveryAdminEndpoint(Role role) throws Exception {
        String bearer = bearerFor(user(UUID.randomUUID(), role));
        for (MockHttpServletRequestBuilder request : adminRequests(UUID.randomUUID())) {
            mockMvc.perform(request.header("Authorization", bearer))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        }
        verify(matriculeGenerator, never()).next();
    }

    @Test
    void aPendingStudentCannotApproveThemselves() throws Exception {
        UUID id = UUID.randomUUID();
        User pending = user(id, Role.ETUDIANT, AccountStatus.PENDING_APPROVAL);
        when(userRepository.findById(id)).thenReturn(Optional.of(pending));
        String token = jwtService.issueAccessToken(id, Role.ETUDIANT);

        mockMvc.perform(patch("/api/v1/admin/users/" + id + "/approve").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
        assertThat(pending.getStatus()).isEqualTo(AccountStatus.PENDING_APPROVAL);
    }

    @Test
    void anAdministratorListsPendingRegistrations() throws Exception {
        UUID pendingId = UUID.randomUUID();
        when(userRepository.findByStatus(eq(AccountStatus.PENDING_APPROVAL), any(Pageable.class)))
                .thenAnswer(inv -> new PageImpl<>(List.of(user(pendingId, Role.ETUDIANT, AccountStatus.PENDING_APPROVAL)),
                        inv.getArgument(1), 1));

        mockMvc.perform(get("/api/v1/admin/users?status=PENDING_APPROVAL")
                        .header("Authorization", bearerFor(user(UUID.randomUUID(), Role.ADMIN))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].id").value(pendingId.toString()))
                .andExpect(jsonPath("$.content[0].status").value("PENDING_APPROVAL"))
                .andExpect(jsonPath("$.content[0].passwordHash").doesNotExist())
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void anAdministratorCreatesTeacherAndAdministratorAccounts() throws Exception {
        String bearer = bearerFor(user(UUID.randomUUID(), Role.ADMIN));
        when(userRepository.save(any())).thenAnswer(inv -> withId(inv.getArgument(0)));

        mockMvc.perform(json(post("/api/v1/admin/users"), Map.of("email", "jean@example.com", "password", "initial-password-123",
                        "role", "ENSEIGNANT", "nom", "Dupont", "prenom", "Jean", "specialite", "Informatique"))
                        .header("Authorization", bearer))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.role").value("ENSEIGNANT"))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.specialite").value("Informatique"));

        mockMvc.perform(json(post("/api/v1/admin/users"), Map.of("email", "claire@example.com", "password", "initial-password-123",
                        "role", "ADMIN", "nom", "Bernard", "prenom", "Claire", "service", "Scolarite"))
                        .header("Authorization", bearer))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.role").value("ADMIN"))
                .andExpect(jsonPath("$.service").value("Scolarite"));
    }

    @Test
    void anAdministratorChangesRolesButNotTheirOwn() throws Exception {
        UUID adminId = UUID.randomUUID();
        String bearer = bearerFor(user(adminId, Role.ADMIN));
        UUID teacherId = UUID.randomUUID();
        when(userRepository.findById(teacherId)).thenReturn(Optional.of(user(teacherId, Role.ENSEIGNANT)));

        mockMvc.perform(json(patch("/api/v1/admin/users/" + teacherId + "/role"), Map.of("role", "ADMIN", "service", "Direction"))
                        .header("Authorization", bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("ADMIN"))
                .andExpect(jsonPath("$.service").value("Direction"));

        mockMvc.perform(json(patch("/api/v1/admin/users/" + adminId + "/role"), Map.of("role", "ETUDIANT"))
                        .header("Authorization", bearer))
                .andExpect(status().isForbidden());
    }

    @Test
    void anAdministratorSuspendsAndReactivatesAnAccount() throws Exception {
        String bearer = bearerFor(user(UUID.randomUUID(), Role.ADMIN));
        UUID studentId = UUID.randomUUID();
        User student = user(studentId, Role.ETUDIANT);
        when(userRepository.findById(studentId)).thenReturn(Optional.of(student));

        mockMvc.perform(json(patch("/api/v1/admin/users/" + studentId + "/status"), Map.of("status", "SUSPENDED"))
                        .header("Authorization", bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SUSPENDED"));

        mockMvc.perform(json(patch("/api/v1/admin/users/" + studentId + "/status"), Map.of("status", "ACTIVE"))
                        .header("Authorization", bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"));
    }

    @Test
    void anAdministratorEditsAProfile() throws Exception {
        String bearer = bearerFor(user(UUID.randomUUID(), Role.ADMIN));
        UUID teacherId = UUID.randomUUID();
        User teacher = user(teacherId, Role.ENSEIGNANT);
        when(userRepository.findById(teacherId)).thenReturn(Optional.of(teacher));

        mockMvc.perform(json(put("/api/v1/admin/users/" + teacherId), Map.of("nom", "Dupont", "prenom", "Jean",
                        "email", teacher.getEmail(), "specialite", "Mathematiques"))
                        .header("Authorization", bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.specialite").value("Mathematiques"));
    }

    @Test
    void badIdsAndUnknownEnumValuesAre400NotServerErrors() throws Exception {
        String bearer = bearerFor(user(UUID.randomUUID(), Role.ADMIN));

        mockMvc.perform(get("/api/v1/admin/users/not-a-uuid").header("Authorization", bearer))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
        mockMvc.perform(get("/api/v1/admin/users?role=CUSTOMER").header("Authorization", bearer))
                .andExpect(status().isBadRequest());
        mockMvc.perform(json(patch("/api/v1/admin/users/" + UUID.randomUUID() + "/status"), Map.of("status", "DISABLED"))
                        .header("Authorization", bearer))
                .andExpect(status().isBadRequest());
    }

    @Test
    void anUnknownUserIs404() throws Exception {
        mockMvc.perform(get("/api/v1/admin/users/" + UUID.randomUUID())
                        .header("Authorization", bearerFor(user(UUID.randomUUID(), Role.ADMIN))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    // -------------------------------------------------------------------------------------

    private MockHttpServletRequestBuilder[] adminRequests(UUID target) throws Exception {
        return new MockHttpServletRequestBuilder[]{
                get("/api/v1/admin/users"),
                get("/api/v1/admin/users/" + target),
                json(post("/api/v1/admin/users"), Map.of("email", "x@example.com", "password", "initial-password-123",
                        "role", "ADMIN", "nom", "X", "prenom", "Y")),
                json(put("/api/v1/admin/users/" + target), Map.of("nom", "X", "prenom", "Y", "email", "x@example.com")),
                json(patch("/api/v1/admin/users/" + target + "/role"), Map.of("role", "ADMIN")),
                json(patch("/api/v1/admin/users/" + target + "/status"), Map.of("status", "SUSPENDED")),
                patch("/api/v1/admin/users/" + target + "/approve")};
    }

    private static User withId(User user) {
        EntityIdSupport.assignId(user, UUID.randomUUID());
        return user;
    }

}
