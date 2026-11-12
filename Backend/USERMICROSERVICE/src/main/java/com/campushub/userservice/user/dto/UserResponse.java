package com.campushub.userservice.user.dto;

import com.campushub.userservice.user.Role;
import com.campushub.userservice.user.User;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;
import java.util.UUID;

/** Profil renvoyé à son propriétaire. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record UserResponse(UUID id, String email, String nom, String prenom, Role role, Instant createdAt) {

    public static UserResponse from(User user) {
        return new UserResponse(user.getId(), user.getEmail(), user.getNom(), user.getPrenom(),
                user.getRole(), user.getCreatedAt());
    }

}