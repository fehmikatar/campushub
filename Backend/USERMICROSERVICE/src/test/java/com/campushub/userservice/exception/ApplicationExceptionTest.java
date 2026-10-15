package com.campushub.userservice.exception;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import static org.assertj.core.api.Assertions.assertThat;

class ApplicationExceptionTest {

    @Test
    void resourceNotFoundExceptionCarriesNotFoundMetadata() {
        ResourceNotFoundException ex = new ResourceNotFoundException("thing missing");

        assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.NOT_FOUND);
        assertThat(ex.getHttpStatus()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(ex.getMessage()).isEqualTo("thing missing");
    }

    @Test
    void conflictExceptionCarriesConflictMetadata() {
        ConflictException ex = new ConflictException("already exists");

        assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.CONFLICT);
        assertThat(ex.getHttpStatus()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(ex.getMessage()).isEqualTo("already exists");
    }

    @Test
    void badRequestExceptionCarriesBadRequestMetadata() {
        BadRequestException ex = new BadRequestException("invalid input");

        assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.BAD_REQUEST);
        assertThat(ex.getHttpStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(ex.getMessage()).isEqualTo("invalid input");
    }

    @Test
    void forbiddenOperationExceptionCarriesForbiddenMetadata() {
        ForbiddenOperationException ex = new ForbiddenOperationException("operation not allowed");

        assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.FORBIDDEN);
        assertThat(ex.getHttpStatus()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(ex.getMessage()).isEqualTo("operation not allowed");
    }

}
