package com.campushub.userservice.user.dto;

import com.campushub.userservice.user.AccountStatus;
import com.campushub.userservice.user.Role;
import com.campushub.userservice.user.User;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;
import java.util.UUID;

/**
 * A user as returned by the API. Never contains the password hash. Only the attribute owned by
 * the user's role appears ({@code matricule} / {@code specialite} / {@code service}); null fields
 * are omitted from the JSON.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record UserResponse(
        UUID id,
        String email,
        String nom,
        String prenom,
        Role role,
        AccountStatus status,
        String matricule,
        String specialite,
        String service,
        Instant createdAt
) {

    public static UserResponse from(User user) {
        return new UserResponse(user.getId(), user.getEmail(), user.getNom(), user.getPrenom(), user.getRole(),
                user.getStatus(), user.getMatricule(), user.getSpecialite(), user.getService(), user.getCreatedAt());
    }

}
