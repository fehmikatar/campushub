package com.campushub.userservice.user.dto;

import com.campushub.userservice.user.AccountStatus;
import jakarta.validation.constraints.NotNull;

/** {@code PATCH /api/v1/admin/users/{id}/status}: {@code ACTIVE} (reactivate) or {@code SUSPENDED}. */
public record ChangeStatusRequest(@NotNull AccountStatus status) {
}
