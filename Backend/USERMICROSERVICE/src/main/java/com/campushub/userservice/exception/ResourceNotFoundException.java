package com.campushub.userservice.exception;

import org.springframework.http.HttpStatus;

/**
 * Generic "the requested resource does not exist" exception. Business modules throw this
 * directly (e.g. {@code throw new ResourceNotFoundException("Hotel " + id + " not found")})
 * rather than defining their own not-found exception type.
 */
public class ResourceNotFoundException extends ApplicationException {

    public ResourceNotFoundException(String message) {
        super(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, message);
    }

}
