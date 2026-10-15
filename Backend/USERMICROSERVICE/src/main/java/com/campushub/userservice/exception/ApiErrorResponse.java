package com.campushub.userservice.exception;

import java.time.Instant;
import java.util.List;

/**
 * The single JSON error format of the API, produced by {@link GlobalExceptionHandler} and by the
 * security handlers for 401/403:
 *
 * <pre>
 * { "timestamp": "...", "status": 403, "code": "FORBIDDEN", "message": "...", "fieldErrors": [] }
 * </pre>
 */
public record ApiErrorResponse(
        Instant timestamp,
        int status,
        ErrorCode code,
        String message,
        List<FieldValidationError> fieldErrors
) {

    public static ApiErrorResponse of(int status, ErrorCode code, String message) {
        return new ApiErrorResponse(Instant.now(), status, code, message, List.of());
    }

    public static ApiErrorResponse ofFieldErrors(int status, ErrorCode code, String message,
                                                 List<FieldValidationError> fieldErrors) {
        return new ApiErrorResponse(Instant.now(), status, code, message, fieldErrors);
    }

}
