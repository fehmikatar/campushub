package com.campushub.userservice.config;

import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.context.EnvironmentAware;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Fails startup with an actionable message when a datasource connection property was never
 * supplied, mirroring the fail-fast validation {@code JwtProperties} already performs for the
 * JWT secret.
 *
 * <p>This exists because Spring Boot's placeholder resolution is deliberately lenient where it
 * matters most: an unresolvable {@code ${DB_PASSWORD}} is <em>not</em> an error to the
 * {@code Binder} that populates {@code DataSourceProperties} — it simply binds the literal text
 * {@code "${DB_PASSWORD}"} as the value. Without this check the application goes on to open a
 * connection using that literal string as the password and fails much later with a misleading
 * {@code Access denied for user 'campushub_app'@'localhost'}, sending the developer looking for a
 * wrong password or a missing GRANT instead of a missing environment variable.
 *
 * <p>Implemented as a {@link BeanFactoryPostProcessor} rather than a {@code @PostConstruct}
 * component because it has to run <em>before</em> any datasource-backed bean is created: Flyway's
 * {@code flywayInitializer} opens a connection during ordinary bean instantiation, so a plain
 * component would report the problem only after Flyway had already failed with the very
 * connection error this class exists to pre-empt. Bean-factory post-processors are instantiated
 * before {@code AutowiredAnnotationBeanPostProcessor} is registered, so the {@link Environment} is
 * received through {@link EnvironmentAware} rather than constructor injection.
 *
 * <p>Inactive on the {@code test} profile, which excludes datasource autoconfiguration entirely
 * (see application-test.yml) and therefore has no connection properties to validate.
 */
@Component
@Profile("!test")
public class DataSourceConfigValidator implements BeanFactoryPostProcessor, EnvironmentAware {

    private static final String UNRESOLVED_PLACEHOLDER_PREFIX = "${";

    /** Property -> the environment variable(s) a developer should set to supply it. */
    private static final Map<String, String> REQUIRED_PROPERTIES = new LinkedHashMap<>(Map.of(
            "spring.datasource.url", "DB_URL, or DB_HOST/DB_PORT/DB_NAME",
            "spring.datasource.username", "DB_USERNAME",
            "spring.datasource.password", "DB_PASSWORD"));

    private Environment environment;

    /** Used by Spring: bean-factory post-processors are instantiated without dependency injection. */
    public DataSourceConfigValidator() {
    }

    /** Used by tests, which supply a {@code MockEnvironment} directly. */
    DataSourceConfigValidator(Environment environment) {
        this.environment = environment;
    }

    @Override
    public void setEnvironment(Environment environment) {
        this.environment = environment;
    }

    @Override
    public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) {
        validate();
    }

    void validate() {
        REQUIRED_PROPERTIES.forEach((property, environmentVariables) -> {
            if (isMissing(resolveOrNull(property))) {
                throw new IllegalStateException(
                        "Database configuration is incomplete: '" + property + "' is not set. "
                                + "Supply it via the " + environmentVariables + " environment variable"
                                + (property.endsWith("password")
                                        ? ", or a git-ignored config/application-local.yml"
                                        : "")
                                // Plain ASCII: this message is read in a Windows console, where a
                                // non-ASCII dash renders as a replacement character.
                                + " - refusing to start. See the README section "
                                + "\"MySQL configuration\".");
            }
        });
    }

    /**
     * Both ways an unsupplied placeholder can surface are treated as "not configured":
     *
     * <ul>
     *   <li>{@link Environment#getProperty} resolves placeholders <em>strictly</em> and throws
     *       {@link IllegalArgumentException} when one cannot be resolved;</li>
     *   <li>Spring Boot's {@code Binder} resolves them <em>leniently</em> and yields the literal
     *       text {@code "${DB_PASSWORD}"}.</li>
     * </ul>
     *
     * Only the second path reaches the datasource, which is why the misleading "Access denied"
     * happens without this class — but both are handled so the check does not depend on which
     * resolver runs first.
     */
    private String resolveOrNull(String property) {
        try {
            return environment.getProperty(property);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private boolean isMissing(String value) {
        return value == null || value.isBlank() || value.contains(UNRESOLVED_PLACEHOLDER_PREFIX);
    }

}
