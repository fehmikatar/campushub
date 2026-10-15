package com.campushub.userservice.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Student self-registration. There is deliberately no {@code role}, {@code status} or
 * {@code matricule} field: the account is always ETUDIANT / PENDING_APPROVAL, and the matricule
 * is generated when an administrator approves it.
 */
public record RegisterRequest(
        @NotBlank @Size(max = 100) String nom,
        @NotBlank @Size(max = 100) String prenom,
        @NotBlank @Email @Size(max = 255) String email,
        @NotBlank @Size(min = 12, max = 128) String password
) {
}
