package com.campushub.userservice.auth;

import com.campushub.userservice.support.AbstractMockedRepositorySecurityTest;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;

import java.util.Map;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The limiter is wired to the real login endpoint (its own context, with a low limit). */
@TestPropertySource(properties = "campushub.security.rate-limit.login-max-attempts=3")
class LoginRateLimitTest extends AbstractMockedRepositorySecurityTest {

    @Test
    void repeatedLoginAttemptsAreAnsweredWith429() throws Exception {
        when(userRepository.findByEmail(anyString())).thenReturn(Optional.empty());
        Map<String, String> body = Map.of("email", "guess@example.com", "password", "guess-password-1");

        for (int i = 0; i < 3; i++) {
            mockMvc.perform(json(post("/api/v1/auth/login"), body)).andExpect(status().isUnauthorized());
        }
        mockMvc.perform(json(post("/api/v1/auth/login"), body))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("TOO_MANY_REQUESTS"));
    }

}
