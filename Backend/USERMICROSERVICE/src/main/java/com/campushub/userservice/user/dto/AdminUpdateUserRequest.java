package com.campushub.userservice.user.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * {@code PUT /api/v1/admin/users/{id}}: edits a user's profile. The role and status have their
 * own endpoints, and the matricule is never edited by hand.
 *
 * <p>{@code specialite} (ENSEIGNANT) and {@code service} (ADMIN): omitted ({@code null}) keeps the
 * current value and {@code ""} clears it, so correcting a name cannot erase them by accident.
 */
public record AdminUpdateUserRequest(
        @NotBlank @Size(max = 100) String nom,
        @NotBlank @Size(max = 100) String prenom,
        @NotBlank @Email @Size(max = 255) String email,
        @Size(max = 100) String specialite,
        @Size(max = 100) String service
) {
}
