package com.campushub.userservice.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

/**
 * A CampusHub user (UML {@code Utilisateur}). The UML subclasses are represented by
 * {@link #role} plus the one attribute that role owns:
 * <ul>
 *   <li>{@code Etudiant} — {@link Role#ETUDIANT} + {@link #matricule} (generated on approval)</li>
 *   <li>{@code Enseignant} — {@link Role#ENSEIGNANT} + {@link #specialite}</li>
 *   <li>{@code Administrateur} — {@link Role#ADMIN} + {@link #service}</li>
 * </ul>
 * The database enforces that an attribute is only set for its own role (see V1__create_users.sql).
 *
 * <p>Other CampusHub services reference users by {@link #id} only. Never expose this entity
 * directly from a controller — {@code UserResponse} leaves out the password hash.
 */
@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** Always normalized (trimmed, lower-cased) — see {@code EmailNormalizer}. */
    @Column(name = "email", nullable = false, unique = true, length = 255)
    private String email;

    /** BCrypt hash, never the raw password. */
    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    @Column(name = "nom", nullable = false, length = 100)
    private String nom;

    @Column(name = "prenom", nullable = false, length = 100)
    private String prenom;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 20)
    private Role role;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private AccountStatus status;

    @Column(name = "matricule", unique = true, length = 20)
    private String matricule;

    @Column(name = "specialite", length = 100)
    private String specialite;

    @Column(name = "service", length = 100)
    private String service;

    /**
     * Only access tokens issued strictly after this instant are accepted (set, truncated to the
     * second, when the password changes).
     * Null means every unexpired token is accepted.
     */
    @Column(name = "tokens_valid_after")
    private Instant tokensValidAfter;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected User() {
        // JPA
    }

    public User(String email, String passwordHash, String nom, String prenom, Role role, AccountStatus status) {
        this.email = email;
        this.passwordHash = passwordHash;
        this.nom = nom;
        this.prenom = prenom;
        this.role = role;
        this.status = status;
    }

    public boolean isActive() {
        return status == AccountStatus.ACTIVE;
    }

    public void changeName(String nom, String prenom) {
        this.nom = nom;
        this.prenom = prenom;
    }

    public void changeEmail(String email) {
        this.email = email;
    }

    public void changePassword(String passwordHash, Instant tokensValidAfter) {
        this.passwordHash = passwordHash;
        this.tokensValidAfter = tokensValidAfter;
    }

    public void changeStatus(AccountStatus status) {
        this.status = status;
    }

    /**
     * Sets the role and the attributes together, so an attribute of the previous role can never
     * linger (the database would reject it anyway).
     */
    public void changeRole(Role role, String matricule, String specialite, String service) {
        this.role = role;
        this.matricule = matricule;
        this.specialite = specialite;
        this.service = service;
    }

    public void changeSpecialite(String specialite) {
        this.specialite = specialite;
    }

    public void changeService(String service) {
        this.service = service;
    }

    /** Approval of a self-registered student: the generated matricule plus activation. */
    public void approve(String matricule) {
        this.matricule = matricule;
        this.status = AccountStatus.ACTIVE;
    }

    public UUID getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public String getNom() {
        return nom;
    }

    public String getPrenom() {
        return prenom;
    }

    public Role getRole() {
        return role;
    }

    public AccountStatus getStatus() {
        return status;
    }

    public String getMatricule() {
        return matricule;
    }

    public String getSpecialite() {
        return specialite;
    }

    public String getService() {
        return service;
    }

    public Instant getTokensValidAfter() {
        return tokensValidAfter;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

}
