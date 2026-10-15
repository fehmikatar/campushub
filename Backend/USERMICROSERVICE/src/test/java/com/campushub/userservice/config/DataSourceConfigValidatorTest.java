package com.campushub.userservice.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Spring Boot binds an unresolvable {@code ${DB_PASSWORD}} as the literal string
 * {@code "${DB_PASSWORD}"} rather than failing, so these cases are the difference between a clear
 * "you forgot an environment variable" and a misleading "Access denied" from MySQL.
 */
class DataSourceConfigValidatorTest {

    private static final String URL =
            "jdbc:mysql://localhost:3306/campushub_users?connectionTimeZone=UTC";

    @Test
    void fullyConfiguredDatasourcePassesValidation() {
        MockEnvironment environment = environmentWith(URL, "campushub_app", "a-real-password");

        assertThatCode(() -> new DataSourceConfigValidator(environment).validate())
                .doesNotThrowAnyException();
    }

    @Test
    void unresolvedPasswordPlaceholderIsRejectedAsMissing() {
        MockEnvironment environment = environmentWith(URL, "campushub_app", "${DB_PASSWORD}");

        assertThatThrownBy(() -> new DataSourceConfigValidator(environment).validate())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("spring.datasource.password")
                .hasMessageContaining("DB_PASSWORD");
    }

    @Test
    void unresolvedPlaceholderNestedInsideTheUrlIsRejected() {
        MockEnvironment environment = environmentWith(
                "jdbc:mysql://${DB_HOST}:3306/campushub_users", "campushub_app", "a-real-password");

        assertThatThrownBy(() -> new DataSourceConfigValidator(environment).validate())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("spring.datasource.url");
    }

    @Test
    void blankPasswordIsRejected() {
        MockEnvironment environment = environmentWith(URL, "campushub_app", "   ");

        assertThatThrownBy(() -> new DataSourceConfigValidator(environment).validate())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("DB_PASSWORD");
    }

    @Test
    void missingUsernameIsRejected() {
        MockEnvironment environment = new MockEnvironment();
        environment.setProperty("spring.datasource.url", URL);
        environment.setProperty("spring.datasource.password", "a-real-password");

        assertThatThrownBy(() -> new DataSourceConfigValidator(environment).validate())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("DB_USERNAME");
    }

    @Test
    void errorMessagePointsTheDeveloperAtTheReadmeNotJustAtThePropertyName() {
        MockEnvironment environment = environmentWith(URL, "campushub_app", "${DB_PASSWORD}");

        assertThatThrownBy(() -> new DataSourceConfigValidator(environment).validate())
                .hasMessageContaining("refusing to start")
                .hasMessageContaining("MySQL configuration");
    }

    private MockEnvironment environmentWith(String url, String username, String password) {
        MockEnvironment environment = new MockEnvironment();
        environment.setProperty("spring.datasource.url", url);
        environment.setProperty("spring.datasource.username", username);
        environment.setProperty("spring.datasource.password", password);
        return environment;
    }

}
