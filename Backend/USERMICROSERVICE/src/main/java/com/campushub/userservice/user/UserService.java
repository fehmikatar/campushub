package com.campushub.userservice.user;

import com.campushub.userservice.exception.ResourceNotFoundException;
import com.campushub.userservice.security.TokenIdentity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Profil de l'utilisateur connecté. L'id vient toujours du token, jamais de la requête.
 * Le profil est créé au premier appel, à partir du token Keycloak.
 */
@Service
public class UserService {

    private final UserRepository userRepository;

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    /** Crée le profil au premier appel ; ensuite, rôle et email suivent Keycloak. */
    @Transactional
    public User getOrCreate(TokenIdentity identity) {
        User user = userRepository.findById(identity.userId()).orElse(null);
        if (user == null) {
            return userRepository.save(new User(identity.userId(), identity.email(),
                    identity.nom(), identity.prenom(), identity.role()));
        }
        user.syncFromToken(identity.email(), identity.role());
        return user;
    }

    /** Seuls nom et prénom sont modifiables ici. */
    @Transactional
    public User updateOwnProfile(TokenIdentity identity, String nom, String prenom) {
        User user = getOrCreate(identity);
        user.changeName(nom, prenom);
        return user;
    }

    @Transactional(readOnly = true)
    public User getPublic(UUID userId) {
        return userRepository.findById(userId).orElseThrow(() -> new ResourceNotFoundException("User not found"));
    }

}