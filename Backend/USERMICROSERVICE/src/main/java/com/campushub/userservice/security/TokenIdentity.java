package com.campushub.userservice.security;

import com.campushub.userservice.user.Role;
import org.springframework.security.oauth2.jwt.Jwt;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

/** Ce que le service lit dans le token Keycloak. */
public record TokenIdentity(UUID userId, String email, String prenom, String nom, Role role) {

    public static TokenIdentity from(Jwt jwt) {
        String given = jwt.getClaimAsString("given_name");
        String family = jwt.getClaimAsString("family_name");
        String username = jwt.getClaimAsString("preferred_username");
        return new TokenIdentity(
                UUID.fromString(jwt.getSubject()),
                EmailNormalizer.normalize(jwt.getClaimAsString("email")),
                given != null && !given.isBlank() ? given : (username != null ? username : "-"),
                family != null && !family.isBlank() ? family : "-",
                highestRole(jwt));
    }

    /** ADMIN > ENSEIGNANT > ETUDIANT (par défaut). */
    private static Role highestRole(Jwt jwt) {
        Map<String, Object> realmAccess = jwt.getClaimAsMap("realm_access");
        Object roles = realmAccess == null ? null : realmAccess.get("roles");
        if (roles instanceof Collection<?> list) {
            if (list.contains("ADMIN")) {
                return Role.ADMIN;
            }
            if (list.contains("ENSEIGNANT")) {
                return Role.ENSEIGNANT;
            }
        }
        return Role.ETUDIANT;
    }

}