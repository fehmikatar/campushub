package com.campushub.userservice.user;

import com.campushub.userservice.security.AuthenticatedUser;
import com.campushub.userservice.security.RateLimitProperties;
import com.campushub.userservice.security.RateLimiter;
import com.campushub.userservice.user.dto.ChangePasswordRequest;
import com.campushub.userservice.user.dto.MessageResponse;
import com.campushub.userservice.user.dto.UpdateProfileRequest;
import com.campushub.userservice.user.dto.UserResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The caller's own account, for every role. The user always comes from the token. */
@RestController
@RequestMapping("/api/v1/users/me")
@SecurityRequirement(name = "bearerAuth")
public class UserController {

    private final UserService userService;
    private final RateLimiter rateLimiter;
    private final RateLimitProperties rateLimitProperties;

    public UserController(UserService userService, RateLimiter rateLimiter, RateLimitProperties rateLimitProperties) {
        this.userService = userService;
        this.rateLimiter = rateLimiter;
        this.rateLimitProperties = rateLimitProperties;
    }

    @GetMapping
    public UserResponse me(@AuthenticationPrincipal AuthenticatedUser principal) {
        return UserResponse.from(userService.get(principal.userId()));
    }

    @PutMapping
    public UserResponse updateMe(@AuthenticationPrincipal AuthenticatedUser principal,
                                 @Valid @RequestBody UpdateProfileRequest request) {
        return UserResponse.from(userService.updateOwnProfile(principal.userId(), request.nom(), request.prenom()));
    }

    /** Rate-limited per user: otherwise a stolen token could be used to guess the current password. */
    @PutMapping("/password")
    public MessageResponse changePassword(@AuthenticationPrincipal AuthenticatedUser principal,
                                          @Valid @RequestBody ChangePasswordRequest request) {
        rateLimiter.checkAndRecord("change-password", principal.userId().toString(),
                rateLimitProperties.getPasswordChangeMaxAttempts());
        userService.changeOwnPassword(principal.userId(), request.currentPassword(), request.newPassword());
        return new MessageResponse("Password changed. Please log in again with your new password.");
    }

}
