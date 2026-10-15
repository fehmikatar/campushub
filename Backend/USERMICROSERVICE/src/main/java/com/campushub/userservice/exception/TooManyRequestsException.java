package com.campushub.userservice.exception;

import org.springframework.http.HttpStatus;

/**
 * Generic "rate limit exceeded" exception. Business/security modules throw this directly rather
 * than defining their own; see {@code com.campushub.userservice.security.RateLimiter}, the in-process limiter
 * that raises it for sensitive authentication endpoints.
 */
public class TooManyRequestsException extends ApplicationException {

    public TooManyRequestsException(String message) {
        super(ErrorCode.TOO_MANY_REQUESTS, HttpStatus.TOO_MANY_REQUESTS, message);
    }

}
