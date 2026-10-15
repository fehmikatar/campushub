package com.campushub.userservice.user.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * {@code PUT /api/v1/users/me}. Only nom and prenom: the role, email, status and role-specific
 * attributes are managed by an administrator. Unknown JSON fields (e.g. {@code "role": "ADMIN"})
 * are ignored.
 */
public record UpdateProfileRequest(
        @NotBlank @Size(max = 100) String nom,
        @NotBlank @Size(max = 100) String prenom
) {
}
