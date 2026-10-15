package com.campushub.userservice.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/** Attempt limits per client within one time window, bound from {@code campushub.security.rate-limit.*}. */
@ConfigurationProperties(prefix = "campushub.security.rate-limit")
public class RateLimitProperties {

    private int loginMaxAttempts = 10;
    private int registerMaxAttempts = 5;
    private int passwordChangeMaxAttempts = 5;
    private Duration window = Duration.ofMinutes(15);

    public int getLoginMaxAttempts() {
        return loginMaxAttempts;
    }

    public void setLoginMaxAttempts(int loginMaxAttempts) {
        this.loginMaxAttempts = loginMaxAttempts;
    }

    public int getRegisterMaxAttempts() {
        return registerMaxAttempts;
    }

    public void setRegisterMaxAttempts(int registerMaxAttempts) {
        this.registerMaxAttempts = registerMaxAttempts;
    }

    public int getPasswordChangeMaxAttempts() {
        return passwordChangeMaxAttempts;
    }

    public void setPasswordChangeMaxAttempts(int passwordChangeMaxAttempts) {
        this.passwordChangeMaxAttempts = passwordChangeMaxAttempts;
    }

    public Duration getWindow() {
        return window;
    }

    public void setWindow(Duration window) {
        this.window = window;
    }

}
