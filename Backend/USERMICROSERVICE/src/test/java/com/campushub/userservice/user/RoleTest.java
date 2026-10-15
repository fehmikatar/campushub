package com.campushub.userservice.user;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RoleTest {

    @Test
    void rolesAreExactlyTheThreeCampusHubRoles() {
        assertThat(Role.values()).extracting(Role::name).containsExactly("ETUDIANT", "ENSEIGNANT", "ADMIN");
    }

    @Test
    void eachRoleMapsToItsSpringSecurityAuthority() {
        assertThat(Role.ETUDIANT.authority()).isEqualTo("ROLE_ETUDIANT");
        assertThat(Role.ENSEIGNANT.authority()).isEqualTo("ROLE_ENSEIGNANT");
        assertThat(Role.ADMIN.authority()).isEqualTo("ROLE_ADMIN");
    }

    @Test
    void statusesAreExactlyTheThreeSimpleStatuses() {
        assertThat(AccountStatus.values()).extracting(AccountStatus::name)
                .containsExactly("PENDING_APPROVAL", "ACTIVE", "SUSPENDED");
    }

}
