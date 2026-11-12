package com.campushub.userservice.user;

import com.campushub.userservice.user.dto.PublicUserResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/** Appelé par Notification, sans token : id, prénom et nom seulement. */
@RestController
@RequestMapping("/api/v1/users")
public class PublicUserController {

    private final UserService userService;

    public PublicUserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping("/{id}/public")
    public PublicUserResponse publicProfile(@PathVariable UUID id) {
        return PublicUserResponse.from(userService.getPublic(id));
    }

}