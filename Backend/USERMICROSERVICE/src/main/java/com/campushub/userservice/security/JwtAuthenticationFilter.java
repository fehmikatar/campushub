package com.campushub.userservice.security;

import com.campushub.userservice.user.User;
import com.campushub.userservice.user.UserRepository;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/**
 * Reads {@code Authorization: Bearer <token>}, validates the JWT, then re-reads the user from the
 * database. A token is accepted only if the user still exists, is {@code ACTIVE}, still has the
 * role written in the token, and the token was issued after the last password change. So in
 * this service, a suspension, a role change or a password change takes effect on the very next
 * request, even though the token itself has not expired.
 *
 * <p>Never throws: an invalid token simply leaves the request unauthenticated, and
 * {@link RestAuthenticationEntryPoint} answers 401 if the endpoint requires authentication.
 */
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(JwtAuthenticationFilter.class);
    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtService jwtService;
    private final UserRepository userRepository;

    public JwtAuthenticationFilter(JwtService jwtService, UserRepository userRepository) {
        this.jwtService = jwtService;
        this.userRepository = userRepository;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith(BEARER_PREFIX)) {
            authenticate(header.substring(BEARER_PREFIX.length()));
        }
        filterChain.doFilter(request, response);
    }

    private void authenticate(String token) {
        try {
            JwtService.ParsedAccessToken parsed = jwtService.parse(token);
            User user = userRepository.findById(parsed.userId()).orElse(null);
            if (user == null || !user.isActive() || user.getRole() != parsed.role() || issuedBeforePasswordChange(parsed, user)) {
                return;
            }

            AuthenticatedUser principal = new AuthenticatedUser(user.getId(), user.getEmail(), user.getRole());
            var authentication = new UsernamePasswordAuthenticationToken(
                    principal, null, List.of(new SimpleGrantedAuthority(user.getRole().authority())));
            SecurityContextHolder.getContext().setAuthentication(authentication);
        } catch (JwtException | IllegalArgumentException e) {
            log.debug("Rejected invalid access token: {}", e.getMessage());
        }
    }

    /**
     * A token must be issued strictly <em>after</em> {@code tokensValidAfter}. A JWT {@code iat} has
     * one-second precision and {@code tokensValidAfter} is stored truncated to the second, so a
     * token issued in the same second as the password change is rejected too (a login in that
     * same second has to be repeated a moment later).
     */
    private boolean issuedBeforePasswordChange(JwtService.ParsedAccessToken parsed, User user) {
        return user.getTokensValidAfter() != null && !parsed.issuedAt().isAfter(user.getTokensValidAfter());
    }

}
