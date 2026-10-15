package com.campushub.userservice.user.dto;

import com.campushub.userservice.user.Role;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * {@code POST /api/v1/admin/users}: the only way to create ENSEIGNANT and ADMIN accounts. The
 * account is active immediately. A student created here gets a generated matricule; there is no
 * matricule field because matricules are never chosen by hand. {@code specialite} is only allowed
 * for ENSEIGNANT; {@code service} (the administrative department) is required for ADMIN and
 * allowed only for ADMIN.
 */
public record CreateUserRequest(
        @NotBlank @Email @Size(max = 255) String email,
        @NotBlank @Size(min = 12, max = 128) String password,
        @NotNull Role role,
        @NotBlank @Size(max = 100) String nom,
        @NotBlank @Size(max = 100) String prenom,
        @Size(max = 100) String specialite,
        @Size(max = 100) String service
) {
}
