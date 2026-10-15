package com.campushub.userservice.exception;

import org.springframework.http.HttpStatus;

/**
 * Generic "the request itself is invalid" exception, for semantic/business-rule violations that
 * Bean Validation cannot express. Business modules throw this directly rather than defining
 * their own bad-request exception type.
 */
public class BadRequestException extends ApplicationException {

    public BadRequestException(String message) {
        super(ErrorCode.BAD_REQUEST, HttpStatus.BAD_REQUEST, message);
    }

}
