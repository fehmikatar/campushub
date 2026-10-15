package com.campushub.userservice.exception;

import org.springframework.http.HttpStatus;

/**
 * Generic "the operation is not allowed" exception for business-rule authorization failures
 * (distinct from Spring Security's own 403 for a missing role). Services throw this
 * directly rather than defining their own forbidden-operation exception type.
 */
public class ForbiddenOperationException extends ApplicationException {

    public ForbiddenOperationException(String message) {
        super(ErrorCode.FORBIDDEN, HttpStatus.FORBIDDEN, message);
    }

}
