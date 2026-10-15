package com.campushub.userservice.user.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** {@code currentPassword} is required, so a stolen token alone cannot take over the account. */
public record ChangePasswordRequest(
        @NotBlank String currentPassword,
        @NotBlank @Size(min = 12, max = 128) String newPassword
) {
}
