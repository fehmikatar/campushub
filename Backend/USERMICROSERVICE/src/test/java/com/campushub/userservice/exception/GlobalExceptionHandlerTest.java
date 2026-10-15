package com.campushub.userservice.exception;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BindingResult;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Verifies the shape of the global error contract directly against the handler methods,
 * without needing a business controller to trigger the exceptions through HTTP.
 */
class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void validationErrorsAreMappedToFieldErrors() {
        FieldError fieldError = new FieldError("request", "email", "must not be blank");
        BindingResult bindingResult = mock(BindingResult.class);
        when(bindingResult.getFieldErrors()).thenReturn(List.of(fieldError));

        MethodArgumentNotValidException ex = mock(MethodArgumentNotValidException.class);
        when(ex.getBindingResult()).thenReturn(bindingResult);

        ResponseEntity<ApiErrorResponse> response = handler.handleValidation(ex);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        ApiErrorResponse body = response.getBody();
        assertThat(body).isNotNull();
        assertThat(body.code()).isEqualTo(ErrorCode.VALIDATION_ERROR);
        assertThat(body.fieldErrors()).hasSize(1);
        assertThat(body.fieldErrors().get(0).field()).isEqualTo("email");
        assertThat(body.fieldErrors().get(0).message()).isEqualTo("must not be blank");
    }

    @Test
    void applicationExceptionsAreMappedUsingTheirOwnErrorCodeAndStatus() {
        ResponseEntity<ApiErrorResponse> response =
                handler.handleApplicationException(new ResourceNotFoundException("thing missing"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        ApiErrorResponse body = response.getBody();
        assertThat(body).isNotNull();
        assertThat(body.code()).isEqualTo(ErrorCode.NOT_FOUND);
        assertThat(body.message()).isEqualTo("thing missing");
    }

    @Test
    void methodNotSupportedIsMappedToMethodNotAllowedCode() {
        HttpRequestMethodNotSupportedException ex = new HttpRequestMethodNotSupportedException("POST");

        ResponseEntity<ApiErrorResponse> response = handler.handleMethodNotSupported(ex);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.METHOD_NOT_ALLOWED);
        ApiErrorResponse body = response.getBody();
        assertThat(body).isNotNull();
        assertThat(body.code()).isEqualTo(ErrorCode.METHOD_NOT_ALLOWED);
    }

    @Test
    void malformedRequestIsMappedToBadRequest() {
        HttpMessageNotReadableException ex = mock(HttpMessageNotReadableException.class);

        ResponseEntity<ApiErrorResponse> response = handler.handleMalformedRequest(ex);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().code()).isEqualTo(ErrorCode.MALFORMED_REQUEST);
    }

    @Test
    void dataIntegrityViolationsAreMappedToConflictWithoutLeakingDatabaseDetails() {
        ResponseEntity<ApiErrorResponse> response = handler.handleDataIntegrityViolation(
                new DataIntegrityViolationException("Duplicate entry 'user@example.com' for key 'uq_user_accounts_email'"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        ApiErrorResponse body = response.getBody();
        assertThat(body).isNotNull();
        assertThat(body.code()).isEqualTo(ErrorCode.CONFLICT);
        assertThat(body.message()).doesNotContain("uq_user_accounts_email");
    }

    @Test
    void accessDeniedFromMethodSecurityIsMappedToForbiddenNotInternalError() {
        ResponseEntity<ApiErrorResponse> response = handler.handleAccessDenied(new AccessDeniedException("denied"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        ApiErrorResponse body = response.getBody();
        assertThat(body).isNotNull();
        assertThat(body.code()).isEqualTo(ErrorCode.FORBIDDEN);
    }

    @Test
    void unexpectedErrorsAreMappedToInternalServerErrorWithoutLeakingDetails() {
        ResponseEntity<ApiErrorResponse> response = handler.handleUnexpected(new RuntimeException("db password: secret"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        ApiErrorResponse body = response.getBody();
        assertThat(body).isNotNull();
        assertThat(body.code()).isEqualTo(ErrorCode.INTERNAL_ERROR);
        assertThat(body.message()).doesNotContain("secret");
    }

}
