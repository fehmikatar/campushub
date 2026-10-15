package com.campushub.userservice.auth.dto;

/** {@code expiresInSeconds}: after that, the client must log in again (there is no refresh token). */
public record LoginResponse(String accessToken, String tokenType, long expiresInSeconds) {

    public static LoginResponse bearer(String accessToken, long expiresInSeconds) {
        return new LoginResponse(accessToken, "Bearer", expiresInSeconds);
    }

}
