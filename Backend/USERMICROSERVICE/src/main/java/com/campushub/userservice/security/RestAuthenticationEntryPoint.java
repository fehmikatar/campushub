package com.campushub.userservice.security;

import com.campushub.userservice.exception.ApiErrorResponse;
import com.campushub.userservice.exception.ErrorCode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * 401 in the standard {@link ApiErrorResponse} format when a protected endpoint is called without
 * a valid token. Spring Security rejects these requests in its filter chain, before any
 * controller runs, so {@code GlobalExceptionHandler} never sees them.
 */
@Component
public class RestAuthenticationEntryPoint implements AuthenticationEntryPoint {

    private final ObjectMapper objectMapper;

    public RestAuthenticationEntryPoint(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
                         AuthenticationException authException) throws IOException {
        response.setStatus(HttpStatus.UNAUTHORIZED.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        ApiErrorResponse body = ApiErrorResponse.of(HttpStatus.UNAUTHORIZED.value(), ErrorCode.UNAUTHORIZED,
                "Authentication is required");
        response.getWriter().write(objectMapper.writeValueAsString(body));
    }

}
