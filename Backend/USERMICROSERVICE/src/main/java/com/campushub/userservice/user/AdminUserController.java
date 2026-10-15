package com.campushub.userservice.user;

import com.campushub.userservice.security.AuthenticatedUser;
import com.campushub.userservice.user.dto.AdminUpdateUserRequest;
import com.campushub.userservice.user.dto.ChangeRoleRequest;
import com.campushub.userservice.user.dto.ChangeStatusRequest;
import com.campushub.userservice.user.dto.CreateUserRequest;
import com.campushub.userservice.user.dto.PageResponse;
import com.campushub.userservice.user.dto.UserResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * User administration, ADMIN only: {@code SecurityConfig} protects {@code /api/v1/admin/**}, and
 * the class-level {@code @PreAuthorize} keeps the rule even if the path changes one day.
 */
@RestController
@RequestMapping("/api/v1/admin/users")
@PreAuthorize("hasRole('ADMIN')")
@SecurityRequirement(name = "bearerAuth")
public class AdminUserController {

    private final AdminUserService adminUserService;

    public AdminUserController(AdminUserService adminUserService) {
        this.adminUserService = adminUserService;
    }

    /** e.g. {@code ?status=PENDING_APPROVAL} lists the registrations waiting for approval. */
    @GetMapping
    public PageResponse<UserResponse> list(@RequestParam(required = false) Role role,
                                           @RequestParam(required = false) AccountStatus status,
                                           @RequestParam(defaultValue = "0") int page,
                                           @RequestParam(defaultValue = "20") int size) {
        return PageResponse.from(adminUserService.list(role, status, page, size), UserResponse::from);
    }

    @GetMapping("/{id}")
    public UserResponse get(@PathVariable UUID id) {
        return UserResponse.from(adminUserService.get(id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public UserResponse create(@AuthenticationPrincipal AuthenticatedUser admin, @Valid @RequestBody CreateUserRequest request) {
        return UserResponse.from(adminUserService.create(admin.userId(), new AdminUserService.NewUser(
                request.email(), request.password(), request.role(), request.nom(), request.prenom(),
                request.specialite(), request.service())));
    }

    @PutMapping("/{id}")
    public UserResponse update(@AuthenticationPrincipal AuthenticatedUser admin, @PathVariable UUID id,
                               @Valid @RequestBody AdminUpdateUserRequest request) {
        return UserResponse.from(adminUserService.update(admin.userId(), id, request.nom(), request.prenom(),
                request.email(), request.specialite(), request.service()));
    }

    @PatchMapping("/{id}/approve")
    public UserResponse approve(@AuthenticationPrincipal AuthenticatedUser admin, @PathVariable UUID id) {
        return UserResponse.from(adminUserService.approve(admin.userId(), id));
    }

    @PatchMapping("/{id}/role")
    public UserResponse changeRole(@AuthenticationPrincipal AuthenticatedUser admin, @PathVariable UUID id,
                                   @Valid @RequestBody ChangeRoleRequest request) {
        return UserResponse.from(adminUserService.changeRole(admin.userId(), id, request.role(),
                request.specialite(), request.service()));
    }

    @PatchMapping("/{id}/status")
    public UserResponse changeStatus(@AuthenticationPrincipal AuthenticatedUser admin, @PathVariable UUID id,
                                     @Valid @RequestBody ChangeStatusRequest request) {
        return UserResponse.from(adminUserService.changeStatus(admin.userId(), id, request.status()));
    }

}
