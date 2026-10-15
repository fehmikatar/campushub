package com.campushub.userservice.user.dto;

import com.campushub.userservice.user.Role;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * {@code PATCH /api/v1/admin/users/{id}/role}. The previous role's attribute is cleared;
 * {@code specialite} may be given when the new role is ENSEIGNANT and {@code service} when it is
 * ADMIN. Changing to ETUDIANT generates a new matricule.
 */
public record ChangeRoleRequest(
        @NotNull Role role,
        @Size(max = 100) String specialite,
        @Size(max = 100) String service
) {
}
