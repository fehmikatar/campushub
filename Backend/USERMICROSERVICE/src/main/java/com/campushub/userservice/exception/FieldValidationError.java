package com.campushub.userservice.exception;

public record FieldValidationError(String field, String message) {
}
