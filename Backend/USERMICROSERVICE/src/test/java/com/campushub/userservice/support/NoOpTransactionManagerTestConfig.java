package com.campushub.userservice.support;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;

/**
 * A transaction manager exists purely so {@code @Transactional} application-service methods
 * (e.g. {@code RegistrationService.register}) can be invoked at all under the "test" profile,
 * which has no real {@code DataSource}/JPA (see application-test.yml) and therefore no
 * {@link PlatformTransactionManager} bean from Spring Boot's own autoconfiguration. Without one,
 * Spring's transactional proxy throws {@code NoSuchBeanDefinitionException} the moment a
 * {@code @Transactional} method is called — this bean does nothing beyond satisfying that wiring
 * requirement; the repositories involved are themselves test doubles (Mockito mocks/{@code
 * @MockBean}), so there is no real transaction to demarcate.
 */
@Configuration
@Profile("test")
public class NoOpTransactionManagerTestConfig {

    @Bean
    public PlatformTransactionManager transactionManager() {
        return new AbstractPlatformTransactionManager() {
            @Override
            protected Object doGetTransaction() {
                return new Object();
            }

            @Override
            protected void doBegin(Object transaction, TransactionDefinition definition) {
                // no-op: nothing backs this "transaction"
            }

            @Override
            protected void doCommit(DefaultTransactionStatus status) {
                // no-op
            }

            @Override
            protected void doRollback(DefaultTransactionStatus status) {
                // no-op
            }
        };
    }

}
