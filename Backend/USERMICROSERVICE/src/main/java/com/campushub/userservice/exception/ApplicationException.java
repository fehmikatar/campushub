package com.campushub.userservice.exception;

import org.springframework.http.HttpStatus;

/**
 * Base type for exceptions that carry everything {@link GlobalExceptionHandler} needs to
 * translate them into a stable {@link ApiErrorResponse}, so services can throw and controllers
 * never have to convert exceptions to HTTP responses themselves.
 *
 * <p>Subclasses fix their own {@link ErrorCode} and {@link HttpStatus} via the protected
 * constructor — callers only ever supply a safe, client-facing message. This keeps the mapping
 * from exception type to error code/status stable and prevents a caller from, say, raising a
 * {@link ResourceNotFoundException} with a {@code CONFLICT} code.
 */
public abstract class ApplicationException extends RuntimeException {

    private final ErrorCode errorCode;
    private final HttpStatus httpStatus;

    protected ApplicationException(ErrorCode errorCode, HttpStatus httpStatus, String message) {
        super(message);
        this.errorCode = errorCode;
        this.httpStatus = httpStatus;
    }

    public ErrorCode getErrorCode() {
        return errorCode;
    }

    public HttpStatus getHttpStatus() {
        return httpStatus;
    }

}
