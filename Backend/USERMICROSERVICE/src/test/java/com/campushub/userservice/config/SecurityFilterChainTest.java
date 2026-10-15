package com.campushub.userservice.config;

import com.campushub.userservice.support.AbstractMockedRepositorySecurityTest;
import com.campushub.userservice.user.AccountStatus;
import com.campushub.userservice.user.Role;
import com.campushub.userservice.user.User;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.Date;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** JWT validation and the 401/403 contract, through the real security filter chain. */
class SecurityFilterChainTest extends AbstractMockedRepositorySecurityTest {

    private static final String ME = "/api/v1/users/me";

    @Autowired
    private Clock clock;
    @Value("${campushub.security.jwt.secret}")
    private String jwtSecret;

    @Test
    void healthAndApiDocsArePublic() throws Exception {
        mockMvc.perform(get("/actuator/health")).andExpect(status().isOk());
        mockMvc.perform(get("/v3/api-docs")).andExpect(status().isOk());
    }

    @Test
    void noTokenGives401InTheStandardErrorFormat() throws Exception {
        mockMvc.perform(get(ME))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"))
                .andExpect(jsonPath("$.status").value(401));
    }

    @Test
    void aValidTokenIsAccepted() throws Exception {
        User user = user(UUID.randomUUID(), Role.ETUDIANT);

        mockMvc.perform(get(ME).header("Authorization", bearerFor(user)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(user.getEmail()));
    }

    @Test
    void malformedTamperedExpiredAndForeignTokensAreRejected() throws Exception {
        UUID id = UUID.randomUUID();
        when(userRepository.findById(id)).thenReturn(Optional.of(user(id, Role.ADMIN)));
        Instant now = Instant.now(clock);
        String valid = jwtService.issueAccessToken(id, Role.ADMIN);

        String[] rejected = {
                "not-a-jwt",
                valid.substring(0, valid.length() - 2) + (valid.endsWith("A") ? "BB" : "AA"),
                craft(id, jwtSecret, "campushub-user-service", now.minusSeconds(7200), now.minusSeconds(60)),
                craft(id, "a-completely-different-32-byte-signing-secret!!", "campushub-user-service", now, now.plusSeconds(900)),
                craft(id, jwtSecret, "hb-travel-backend", now, now.plusSeconds(900)),
                craft(id, jwtSecret, null, now, now.plusSeconds(900))};

        for (String token : rejected) {
            mockMvc.perform(get(ME).header("Authorization", "Bearer " + token)).andExpect(status().isUnauthorized());
        }
    }

    @Test
    void malformedAuthorizationHeadersAreTreatedAsNoCredentials() throws Exception {
        User user = user(UUID.randomUUID(), Role.ETUDIANT);
        String valid = bearerFor(user).substring("Bearer ".length());

        for (String header : new String[]{"", "Bearer", "Bearer ", "Basic " + valid, "bearer " + valid, valid, "Bearer null"}) {
            mockMvc.perform(get(ME).header("Authorization", header)).andExpect(status().isUnauthorized());
        }
    }

    @Test
    void aTokenStopsWorkingAsSoonAsTheAccountIsSuspended() throws Exception {
        UUID id = UUID.randomUUID();
        String token = jwtService.issueAccessToken(id, Role.ENSEIGNANT);
        when(userRepository.findById(id)).thenReturn(Optional.of(user(id, Role.ENSEIGNANT, AccountStatus.SUSPENDED)));

        mockMvc.perform(get(ME).header("Authorization", "Bearer " + token)).andExpect(status().isUnauthorized());
    }

    @Test
    void aTokenIssuedForAnOldRoleStopsWorkingAfterARoleChange() throws Exception {
        UUID id = UUID.randomUUID();
        String adminToken = jwtService.issueAccessToken(id, Role.ADMIN);
        when(userRepository.findById(id)).thenReturn(Optional.of(user(id, Role.ETUDIANT)));

        mockMvc.perform(get(ME).header("Authorization", "Bearer " + adminToken)).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/admin/users").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void aTokenIssuedBeforeAPasswordChangeIsRejected() throws Exception {
        UUID id = UUID.randomUUID();
        User user = user(id, Role.ETUDIANT);
        String oldToken = jwtService.issueAccessToken(id, Role.ETUDIANT);
        user.changePassword("new-hash", Instant.now(clock).plusSeconds(5));
        when(userRepository.findById(id)).thenReturn(Optional.of(user));

        mockMvc.perform(get(ME).header("Authorization", "Bearer " + oldToken)).andExpect(status().isUnauthorized());
    }

    @Test
    void aTokenForAPendingRegistrationIsRejected() throws Exception {
        UUID id = UUID.randomUUID();
        String token = jwtService.issueAccessToken(id, Role.ETUDIANT);
        when(userRepository.findById(id)).thenReturn(Optional.of(user(id, Role.ETUDIANT, AccountStatus.PENDING_APPROVAL)));

        mockMvc.perform(get(ME).header("Authorization", "Bearer " + token)).andExpect(status().isUnauthorized());
    }

    @Test
    void aStudentOnAnAdminEndpointGets403InTheStandardErrorFormat() throws Exception {
        mockMvc.perform(get("/api/v1/admin/users").header("Authorization", bearerFor(user(UUID.randomUUID(), Role.ETUDIANT))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"))
                .andExpect(jsonPath("$.status").value(403));
    }

    private String craft(UUID userId, String secret, String issuer, Instant issuedAt, Instant expiry) {
        var builder = Jwts.builder()
                .subject(userId.toString())
                .claim("role", Role.ADMIN.name())
                .issuedAt(Date.from(issuedAt))
                .expiration(Date.from(expiry))
                .signWith(Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8)));
        if (issuer != null) {
            builder = builder.issuer(issuer);
        }
        return builder.compact();
    }

}
