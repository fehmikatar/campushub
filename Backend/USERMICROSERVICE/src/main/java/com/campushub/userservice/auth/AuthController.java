package com.campushub.userservice.auth;

import com.campushub.userservice.auth.dto.LoginRequest;
import com.campushub.userservice.auth.dto.LoginResponse;
import com.campushub.userservice.auth.dto.RegisterRequest;
import com.campushub.userservice.security.JwtService;
import com.campushub.userservice.security.RateLimitProperties;
import com.campushub.userservice.security.RateLimiter;
import com.campushub.userservice.user.dto.UserResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Public endpoints. Both are rate-limited per client address. */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService authService;
    private final JwtService jwtService;
    private final RateLimiter rateLimiter;
    private final RateLimitProperties rateLimitProperties;

    public AuthController(AuthService authService, JwtService jwtService,
                          RateLimiter rateLimiter, RateLimitProperties rateLimitProperties) {
        this.authService = authService;
        this.jwtService = jwtService;
        this.rateLimiter = rateLimiter;
        this.rateLimitProperties = rateLimitProperties;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public UserResponse register(@Valid @RequestBody RegisterRequest request, HttpServletRequest httpRequest) {
        rateLimiter.checkAndRecord("register", httpRequest.getRemoteAddr(), rateLimitProperties.getRegisterMaxAttempts());
        return UserResponse.from(authService.register(request.nom(), request.prenom(), request.email(), request.password()));
    }

    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request, HttpServletRequest httpRequest) {
        rateLimiter.checkAndRecord("login", httpRequest.getRemoteAddr(), rateLimitProperties.getLoginMaxAttempts());
        String token = authService.login(request.email(), request.password());
        return LoginResponse.bearer(token, jwtService.accessTokenTtlSeconds());
    }

}
