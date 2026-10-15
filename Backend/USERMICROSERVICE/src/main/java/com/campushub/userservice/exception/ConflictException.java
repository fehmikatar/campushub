package com.campushub.userservice.exception;

import org.springframework.http.HttpStatus;

/**
 * Generic "the request conflicts with the current state of the resource" exception (e.g.
 * duplicate creation, concurrent modification). Business modules throw this directly rather than
 * defining their own conflict exception type.
 */
public class ConflictException extends ApplicationException {

    public ConflictException(String message) {
        super(ErrorCode.CONFLICT, HttpStatus.CONFLICT, message);
    }

}
