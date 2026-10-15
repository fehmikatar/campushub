package com.campushub.userservice.user;

import com.campushub.userservice.exception.BadRequestException;
import com.campushub.userservice.exception.ConflictException;
import com.campushub.userservice.exception.ForbiddenOperationException;
import com.campushub.userservice.exception.ResourceNotFoundException;
import com.campushub.userservice.security.EmailNormalizer;
import com.campushub.userservice.security.PasswordPolicy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Account administration. Only administrators reach it ({@code /api/v1/admin/**} requires
 * ROLE_ADMIN in {@code SecurityConfig}, and {@code AdminUserController} repeats the rule), so this
 * class only enforces the rules that hold even for an administrator: nobody changes their own
 * role or status, and a pending student becomes active only through {@link #approve}.
 */
@Service
public class AdminUserService {

    static final int MAX_PAGE_SIZE = 100;

    private static final Logger log = LoggerFactory.getLogger(AdminUserService.class);

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final PasswordPolicy passwordPolicy;
    private final MatriculeGenerator matriculeGenerator;

    public AdminUserService(UserRepository userRepository, PasswordEncoder passwordEncoder,
                            PasswordPolicy passwordPolicy, MatriculeGenerator matriculeGenerator) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.passwordPolicy = passwordPolicy;
        this.matriculeGenerator = matriculeGenerator;
    }

    public record NewUser(String email, String password, Role role, String nom, String prenom,
                          String specialite, String service) {
    }

    /** Newest first; optional role/status filters; page &ge; 0 and 1 &le; size &le; 100 (clamped). */
    @Transactional(readOnly = true)
    public Page<User> list(Role role, AccountStatus status, int page, int size) {
        Pageable pageable = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), MAX_PAGE_SIZE),
                Sort.by(Sort.Direction.DESC, "createdAt"));
        if (role != null && status != null) {
            return userRepository.findByRoleAndStatus(role, status, pageable);
        }
        if (role != null) {
            return userRepository.findByRole(role, pageable);
        }
        if (status != null) {
            return userRepository.findByStatus(status, pageable);
        }
        return userRepository.findAll(pageable);
    }

    @Transactional(readOnly = true)
    public User get(UUID userId) {
        return requireUser(userId);
    }

    /** Active immediately; a student also gets a generated matricule, an ADMIN must have a service. */
    @Transactional
    public User create(UUID adminId, NewUser request) {
        String email = EmailNormalizer.normalize(request.email());
        requireEmailAvailable(email);
        passwordPolicy.validate(request.password());
        String specialite = attributeFor(Role.ENSEIGNANT, request.role(), "specialite", request.specialite());
        String service = attributeFor(Role.ADMIN, request.role(), "service", request.service());
        if (request.role() == Role.ADMIN && service == null) {
            throw new BadRequestException("'service' (administrative department) is required for ADMIN accounts");
        }
        String matricule = request.role() == Role.ETUDIANT ? matriculeGenerator.next() : null;

        User user = new User(email, passwordEncoder.encode(request.password()), request.nom(), request.prenom(),
                request.role(), AccountStatus.ACTIVE);
        user.changeRole(request.role(), matricule, specialite, service);
        user = userRepository.save(user);
        log.info("Administrator {} created user {} with role {}", adminId, user.getId(), user.getRole());
        return user;
    }

    /**
     * Approves a self-registered student: generates the matricule and activates the account in
     * one transaction. Only an ETUDIANT in PENDING_APPROVAL can be approved, so approving twice
     * is impossible.
     */
    @Transactional
    public User approve(UUID adminId, UUID userId) {
        User user = requireUser(userId);
        if (user.getRole() != Role.ETUDIANT || user.getStatus() != AccountStatus.PENDING_APPROVAL) {
            throw new BadRequestException("Only a student registration awaiting approval can be approved");
        }
        user.approve(matriculeGenerator.next());
        log.info("Administrator {} approved student {} (matricule {})", adminId, userId, user.getMatricule());
        return user;
    }

    /**
     * Edits nom, prenom, email and the attribute of the user's current role. For specialite and
     * service, {@code null} keeps the current value and {@code ""} clears it.
     */
    @Transactional
    public User update(UUID adminId, UUID userId, String nom, String prenom, String rawEmail,
                       String specialite, String service) {
        User user = requireUser(userId);
        String email = EmailNormalizer.normalize(rawEmail);
        if (!email.equals(user.getEmail())) {
            requireEmailAvailable(email);
            user.changeEmail(email);
        }
        user.changeName(nom, prenom);
        if (specialite != null) {
            user.changeSpecialite(attributeFor(Role.ENSEIGNANT, user.getRole(), "specialite", specialite));
        }
        if (service != null) {
            user.changeService(attributeFor(Role.ADMIN, user.getRole(), "service", service));
        }
        log.info("Administrator {} updated user {}", adminId, userId);
        return user;
    }

    /**
     * Changes the role. The previous role's attribute is cleared, and a user becoming ETUDIANT
     * gets a new matricule. Not allowed on oneself (no self-promotion, and the last administrator
     * cannot demote themselves), nor on a registration still awaiting approval.
     *
     * <p>Tokens issued for the old role stop working here immediately, because
     * {@code JwtAuthenticationFilter} compares the token's role with the database.
     */
    @Transactional
    public User changeRole(UUID adminId, UUID userId, Role newRole, String specialite, String service) {
        if (adminId.equals(userId)) {
            throw new ForbiddenOperationException("Administrators cannot change their own role");
        }
        User user = requireUser(userId);
        if (user.getStatus() == AccountStatus.PENDING_APPROVAL) {
            throw new BadRequestException("Approve this registration before changing its role");
        }
        if (user.getRole() == newRole) {
            return user;
        }
        String newSpecialite = attributeFor(Role.ENSEIGNANT, newRole, "specialite", specialite);
        String newService = attributeFor(Role.ADMIN, newRole, "service", service);
        Role previousRole = user.getRole();
        user.changeRole(newRole, newRole == Role.ETUDIANT ? matriculeGenerator.next() : null, newSpecialite, newService);
        log.info("Administrator {} changed the role of user {}: {} -> {}", adminId, userId, previousRole, newRole);
        return user;
    }

    /**
     * Suspends (SUSPENDED) or reactivates (ACTIVE) an account. A pending registration goes through
     * {@link #approve} instead, and nobody changes their own status.
     */
    @Transactional
    public User changeStatus(UUID adminId, UUID userId, AccountStatus newStatus) {
        if (adminId.equals(userId)) {
            throw new ForbiddenOperationException("Administrators cannot change their own status");
        }
        if (newStatus == AccountStatus.PENDING_APPROVAL) {
            throw new BadRequestException("Status can only be set to ACTIVE or SUSPENDED");
        }
        User user = requireUser(userId);
        if (user.getStatus() == AccountStatus.PENDING_APPROVAL) {
            throw new BadRequestException("Use the approve endpoint for a registration awaiting approval");
        }
        if (user.getStatus() != newStatus) {
            user.changeStatus(newStatus);
            log.info("Administrator {} set the status of user {} to {}", adminId, userId, newStatus);
        }
        return user;
    }

    /**
     * Returns the cleaned value of a role-specific attribute, or {@code null}. Rejects a value
     * given for the wrong role instead of silently dropping it.
     */
    private String attributeFor(Role owner, Role role, String name, String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        if (role != owner) {
            throw new BadRequestException("'" + name + "' only applies to " + owner + " accounts");
        }
        return value.strip();
    }

    private void requireEmailAvailable(String email) {
        if (userRepository.existsByEmail(email)) {
            throw new ConflictException("An account with this email already exists");
        }
    }

    private User requireUser(UUID userId) {
        return userRepository.findById(userId).orElseThrow(() -> new ResourceNotFoundException("User not found"));
    }

}
