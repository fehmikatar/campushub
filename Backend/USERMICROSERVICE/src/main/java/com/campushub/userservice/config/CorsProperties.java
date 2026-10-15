package com.campushub.userservice.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/** Explicit CORS allow-list for the frontend origin(s) ({@code CORS_ALLOWED_ORIGINS}). No wildcard. */
@ConfigurationProperties(prefix = "campushub.security.cors")
public class CorsProperties {

    private List<String> allowedOrigins = List.of();

    public List<String> getAllowedOrigins() {
        return allowedOrigins;
    }

    public void setAllowedOrigins(List<String> allowedOrigins) {
        this.allowedOrigins = allowedOrigins;
    }

}
