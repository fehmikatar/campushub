package com.campushub.userservice.support;

import com.campushub.userservice.security.JwtService;
import com.campushub.userservice.user.AccountStatus;
import com.campushub.userservice.user.MatriculeGenerator;
import com.campushub.userservice.user.Role;
import com.campushub.userservice.user.User;
import com.campushub.userservice.user.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.when;

/**
 * Base for HTTP tests through the real Spring context: real security filter chain, JWT filter,
 * controllers and services. Only the database side is mocked — {@link UserRepository} and the
 * JDBC-based {@link MatriculeGenerator} — so no MySQL is needed.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class AbstractMockedRepositorySecurityTest {

    @MockitoBean
    protected UserRepository userRepository;

    @MockitoBean
    protected MatriculeGenerator matriculeGenerator;

    @Autowired
    protected MockMvc mockMvc;
    @Autowired
    protected JwtService jwtService;
    @Autowired
    protected ObjectMapper objectMapper;

    /** An ACTIVE user with the given role and a fixed id. */
    protected User user(UUID id, Role role) {
        return user(id, role, AccountStatus.ACTIVE);
    }

    protected User user(UUID id, Role role, AccountStatus status) {
        User user = new User(role.name().toLowerCase() + "-" + id + "@example.com", "hash", "Martin", "Alice", role, status);
        String matricule = role == Role.ETUDIANT && status != AccountStatus.PENDING_APPROVAL ? "ETU20260001" : null;
        user.changeRole(role, matricule, null, null);
        EntityIdSupport.assignId(user, id);
        return user;
    }

    /** Makes {@code user} findable by the JWT filter and returns a valid Bearer header for it. */
    protected String bearerFor(User user) {
        when(userRepository.findById(user.getId())).thenReturn(Optional.of(user));
        return "Bearer " + jwtService.issueAccessToken(user.getId(), user.getRole());
    }

    protected MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder builder, Object body) throws Exception {
        return builder.contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body));
    }

}
