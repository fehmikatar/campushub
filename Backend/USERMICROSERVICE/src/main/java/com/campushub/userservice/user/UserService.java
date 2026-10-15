package com.campushub.userservice.user;

import com.campushub.userservice.exception.BadRequestException;
import com.campushub.userservice.exception.ResourceNotFoundException;
import com.campushub.userservice.security.PasswordPolicy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

/**
 * What every user can do on their own account. The user id always comes from the authenticated
 * token, never from the request, so nobody can address someone else's account here.
 */
@Service
public class UserService {

    private static final Logger log = LoggerFactory.getLogger(UserService.class);

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final PasswordPolicy passwordPolicy;
    private final Clock clock;

    public UserService(UserRepository userRepository, PasswordEncoder passwordEncoder,
                       PasswordPolicy passwordPolicy, Clock clock) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.passwordPolicy = passwordPolicy;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public User get(UUID userId) {
        return requireUser(userId);
    }

    /** Only nom and prenom; everything else is managed by an administrator. */
    @Transactional
    public User updateOwnProfile(UUID userId, String nom, String prenom) {
        User user = requireUser(userId);
        user.changeName(nom, prenom);
        return user;
    }

    /**
     * Requires the current password. Every access token issued before now, including the one
     * used for this request, stops working: the user logs in again with the new password.
     */
    @Transactional
    public void changeOwnPassword(UUID userId, String currentPassword, String newPassword) {
        User user = requireUser(userId);
        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            log.info("Password change rejected: wrong current password (id={})", userId);
            throw new BadRequestException("Current password is incorrect");
        }
        passwordPolicy.validate(newPassword);

        // Truncated to the second because a JWT's iat has one-second precision.
        user.changePassword(passwordEncoder.encode(newPassword), Instant.now(clock).truncatedTo(ChronoUnit.SECONDS));
        log.info("Password changed (id={})", userId);
    }

    private User requireUser(UUID userId) {
        return userRepository.findById(userId).orElseThrow(() -> new ResourceNotFoundException("User not found"));
    }

}
