package com.campushub.userservice.security;

import com.campushub.userservice.user.Role;

import java.util.UUID;

/**
 * The authenticated principal set by {@link JwtAuthenticationFilter}. Controllers get it with
 * {@code @AuthenticationPrincipal AuthenticatedUser} instead of decoding the token themselves.
 */
public record AuthenticatedUser(UUID userId, String email, Role role) {
}
