package com.campushub.userservice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * CampusHub User Service.
 *
 * <p>{@link UserDetailsServiceAutoConfiguration} is excluded: without it Spring Boot would create
 * an in-memory user with a generated password printed in the logs. Authentication here is JWT
 * only, so that credential would serve no purpose and is better not to exist at all (see
 * {@code DefaultSecurityUserAbsenceTest}).
 */
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
@ConfigurationPropertiesScan
public class UserServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(UserServiceApplication.class, args);
    }

}
