package com.campushub.userservice.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * First administrator, from {@code CAMPUSHUB_ADMIN_EMAIL} / {@code CAMPUSHUB_ADMIN_PASSWORD}.
 * Both empty by default, so nothing is created unless an operator sets them. See
 * {@code AdminBootstrap}.
 */
@ConfigurationProperties(prefix = "campushub.admin-bootstrap")
public class AdminBootstrapProperties {

    private String email;
    private String password;
    private String nom = "Administrateur";
    private String prenom = "CampusHub";

    public boolean isConfigured() {
        return email != null && !email.isBlank() && password != null && !password.isBlank();
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public String getNom() {
        return nom;
    }

    public void setNom(String nom) {
        this.nom = nom;
    }

    public String getPrenom() {
        return prenom;
    }

    public void setPrenom(String prenom) {
        this.prenom = prenom;
    }

}
