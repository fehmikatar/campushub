package com.campushub.userservice.auth;

import com.campushub.userservice.exception.ConflictException;
import com.campushub.userservice.exception.ForbiddenOperationException;
import com.campushub.userservice.exception.UnauthorizedException;
import com.campushub.userservice.security.EmailNormalizer;
import com.campushub.userservice.security.JwtService;
import com.campushub.userservice.security.PasswordPolicy;
import com.campushub.userservice.user.AccountStatus;
import com.campushub.userservice.user.Role;
import com.campushub.userservice.user.User;
import com.campushub.userservice.user.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Student self-registration and email/password login. */
@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);
    private static final String INVALID_CREDENTIALS = "Invalid email or password";

    /**
     * A real BCrypt hash (cost 10) of a value no account has. When the email is unknown, the
     * password is still compared against it, so "unknown email" and "wrong password" take the
     * same time and cannot be told apart by measuring the response.
     */
    private static final String DUMMY_PASSWORD_HASH =
            "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final PasswordPolicy passwordPolicy;
    private final JwtService jwtService;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder,
                       PasswordPolicy passwordPolicy, JwtService jwtService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.passwordPolicy = passwordPolicy;
        this.jwtService = jwtService;
    }

    /**
     * Always creates an ETUDIANT account in PENDING_APPROVAL, whatever the request contains. It
     * cannot log in until an administrator approves it, which also assigns the matricule.
     */
    @Transactional
    public User register(String nom, String prenom, String rawEmail, String rawPassword) {
        String email = EmailNormalizer.normalize(rawEmail);
        if (userRepository.existsByEmail(email)) {
            throw new ConflictException("An account with this email already exists");
        }
        passwordPolicy.validate(rawPassword);

        User student = userRepository.save(new User(
                email, passwordEncoder.encode(rawPassword), nom, prenom, Role.ETUDIANT, AccountStatus.PENDING_APPROVAL));
        log.info("Student registered, awaiting approval (id={})", student.getId());
        return student;
    }

    /**
     * The password is checked first, and both failure cases ("no such email", "wrong password")
     * give the same 401, so the API never reveals whether an email is registered. Only after the
     * password is proven correct does the caller learn the account's status.
     */
    @Transactional(readOnly = true)
    public String login(String rawEmail, String rawPassword) {
        User user = userRepository.findByEmail(EmailNormalizer.normalize(rawEmail)).orElse(null);

        // Always run BCrypt, even for an unknown email, so both failure paths cost the same.
        String hashToCompare = user == null ? DUMMY_PASSWORD_HASH : user.getPasswordHash();
        boolean passwordMatches = passwordEncoder.matches(rawPassword, hashToCompare) && user != null;
        if (!passwordMatches) {
            log.info("Login failed: invalid credentials");
            throw new UnauthorizedException(INVALID_CREDENTIALS);
        }

        switch (user.getStatus()) {
            case PENDING_APPROVAL -> throw new ForbiddenOperationException(
                    "Your registration is awaiting approval by an administrator");
            case SUSPENDED -> throw new ForbiddenOperationException("This account is suspended");
            case ACTIVE -> { }
        }

        log.info("Login succeeded (id={}, role={})", user.getId(), user.getRole());
        return jwtService.issueAccessToken(user.getId(), user.getRole());
    }

}
