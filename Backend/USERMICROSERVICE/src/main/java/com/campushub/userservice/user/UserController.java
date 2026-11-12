package com.campushub.userservice.user;

import com.campushub.userservice.security.TokenIdentity;
import com.campushub.userservice.user.dto.UpdateProfileRequest;
import com.campushub.userservice.user.dto.UserResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Le profil de l'appelant, pour tous les rôles. L'utilisateur vient toujours du token. */
@RestController
@RequestMapping("/api/v1/users/me")
@SecurityRequirement(name = "bearerAuth")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping
    public UserResponse me(@AuthenticationPrincipal Jwt jwt) {
        return UserResponse.from(userService.getOrCreate(TokenIdentity.from(jwt)));
    }

    @PutMapping
    public UserResponse updateMe(@AuthenticationPrincipal Jwt jwt,
                                 @Valid @RequestBody UpdateProfileRequest request) {
        return UserResponse.from(
                userService.updateOwnProfile(TokenIdentity.from(jwt), request.nom(), request.prenom()));
    }

}