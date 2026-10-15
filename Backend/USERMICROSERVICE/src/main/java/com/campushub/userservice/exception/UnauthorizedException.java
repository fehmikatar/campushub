package com.campushub.userservice.exception;

import org.springframework.http.HttpStatus;

/**
 * Generic "authentication failed" exception (bad credentials, invalid/expired token).
 * Distinct from {@link ForbiddenOperationException}: this means the
 * caller's identity could not be established, not that an established identity lacks permission.
 */
public class UnauthorizedException extends ApplicationException {

    public UnauthorizedException(String message) {
        super(ErrorCode.UNAUTHORIZED, HttpStatus.UNAUTHORIZED, message);
    }

}
