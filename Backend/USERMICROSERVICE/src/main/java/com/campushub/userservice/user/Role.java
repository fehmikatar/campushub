package com.campushub.userservice.user;

/**
 * The three CampusHub roles. Each user has exactly one. Spring Security sees them as
 * {@code ROLE_<name>} authorities ({@link #authority()}), so {@code hasRole('ADMIN')} matches
 * {@link #ADMIN}.
 */
public enum Role {

    ETUDIANT,
    ENSEIGNANT,
    ADMIN;

    public String authority() {
        return "ROLE_" + name();
    }

}
