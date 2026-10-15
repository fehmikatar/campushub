package com.campushub.userservice.exception;

/** Stable, client-facing error codes carried by every {@link ApiErrorResponse}. */
public enum ErrorCode {

    VALIDATION_ERROR,
    MALFORMED_REQUEST,
    NOT_FOUND,
    CONFLICT,
    BAD_REQUEST,
    FORBIDDEN,
    UNAUTHORIZED,
    METHOD_NOT_ALLOWED,
    TOO_MANY_REQUESTS,
    INTERNAL_ERROR

}
