package com.campushub.userservice.auth;

import com.campushub.userservice.config.AdminBootstrapProperties;
import com.campushub.userservice.security.EmailNormalizer;
import com.campushub.userservice.security.PasswordPolicy;
import com.campushub.userservice.user.AccountStatus;
import com.campushub.userservice.user.Role;
import com.campushub.userservice.user.User;
import com.campushub.userservice.user.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Creates the first administrator at startup, only when {@code CAMPUSHUB_ADMIN_EMAIL} and
 * {@code CAMPUSHUB_ADMIN_PASSWORD} are both set and no administrator exists yet. The password
 * comes from the environment (never from the code), must pass {@link PasswordPolicy}, and is
 * never logged. Idempotent: an existing administrator is never touched. There is no public
 * endpoint that creates administrators.
 */
@Component
public class AdminBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminBootstrap.class);

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final PasswordPolicy passwordPolicy;
    private final AdminBootstrapProperties properties;

    public AdminBootstrap(UserRepository userRepository, PasswordEncoder passwordEncoder,
                          PasswordPolicy passwordPolicy, AdminBootstrapProperties properties) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.passwordPolicy = passwordPolicy;
        this.properties = properties;
    }

    @Override
    public void run(ApplicationArguments args) {
        bootstrap();
    }

    public void bootstrap() {
        if (!properties.isConfigured()) {
            return;
        }
        if (userRepository.existsByRole(Role.ADMIN)) {
            log.info("Admin bootstrap skipped: an administrator already exists");
            return;
        }
        String email = EmailNormalizer.normalize(properties.getEmail());
        if (userRepository.existsByEmail(email)) {
            log.warn("Admin bootstrap skipped: an account already uses the configured admin email");
            return;
        }
        passwordPolicy.validate(properties.getPassword());

        User admin = userRepository.save(new User(email, passwordEncoder.encode(properties.getPassword()),
                properties.getNom(), properties.getPrenom(), Role.ADMIN, AccountStatus.ACTIVE));
        log.info("Created the first administrator (id={})", admin.getId());
    }

}
