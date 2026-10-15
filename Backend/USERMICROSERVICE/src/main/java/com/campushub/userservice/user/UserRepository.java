package com.campushub.userservice.user;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByEmail(String normalizedEmail);

    boolean existsByEmail(String normalizedEmail);

    boolean existsByRole(Role role);

    Page<User> findByRole(Role role, Pageable pageable);

    Page<User> findByStatus(AccountStatus status, Pageable pageable);

    Page<User> findByRoleAndStatus(Role role, AccountStatus status, Pageable pageable);

}
