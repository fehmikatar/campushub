package com.campushub.userservice.user.dto;

import com.campushub.userservice.user.User;

import java.util.UUID;

/** Seulement ce qu'on peut montrer à un autre service (Notification) : pas d'email. */
public record PublicUserResponse(UUID id, String prenom, String nom) {

    public static PublicUserResponse from(User user) {
        return new PublicUserResponse(user.getId(), user.getPrenom(), user.getNom());
    }

}