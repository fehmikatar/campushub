package com.campushub.userservice.config;

import com.campushub.userservice.support.AbstractMockedRepositorySecurityTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.security.core.userdetails.UserDetailsService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Spring Boot's generated default user ("Using generated security password: ...") must not exist:
 * authentication is JWT only. See {@code UserServiceApplication}.
 */
class DefaultSecurityUserAbsenceTest extends AbstractMockedRepositorySecurityTest {

    @Autowired
    private ApplicationContext applicationContext;

    @Test
    void noUserDetailsServiceBeanExists() {
        assertThat(applicationContext.getBeanNamesForType(UserDetailsService.class)).isEmpty();
    }

    @Test
    void httpBasicCredentialsNeverAuthenticate() throws Exception {
        mockMvc.perform(get("/api/v1/users/me").with(httpBasic("user", "any-password")))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/admin/users").with(httpBasic("admin", "admin")))
                .andExpect(status().isUnauthorized());
    }

}
