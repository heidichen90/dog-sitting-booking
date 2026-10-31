package com.ddpetcare.api.auth;

import java.security.Principal;
import java.util.List;

import com.ddpetcare.api.error.ProblemSchemas.Problem;
import com.ddpetcare.api.error.ProblemSchemas.ValidationProblem;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.web.authentication.session.ChangeSessionIdAuthenticationStrategy;
import org.springframework.security.web.authentication.session.CompositeSessionAuthenticationStrategy;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfAuthenticationStrategy;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class LoginController {

    private final AuthenticationManager authenticationManager;
    private final LoginThrottle throttle;
    private final SessionAuthenticationStrategy sessionStrategy;
    private final SecurityContextRepository contextRepository = new HttpSessionSecurityContextRepository();
    private final SecurityContextHolderStrategy contextHolder = SecurityContextHolder.getContextHolderStrategy();

    public LoginController(AuthenticationManager authenticationManager, LoginThrottle throttle,
                           CsrfTokenRepository csrfTokens) {
        this.authenticationManager = authenticationManager;
        this.throttle = throttle;
        this.sessionStrategy = new CompositeSessionAuthenticationStrategy(List.of(
                new ChangeSessionIdAuthenticationStrategy(), new CsrfAuthenticationStrategy(csrfTokens)));
    }

    @PostMapping("/login")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "login", summary = "Log in as the owner; sets the SESSION cookie")
    @ApiResponse(responseCode = "204", description = "Logged in")
    @ApiResponse(responseCode = "400", description = "Blank or oversized username or password",
            content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                    schema = @Schema(implementation = ValidationProblem.class)))
    @ApiResponse(responseCode = "401", description = "Wrong username or password",
            content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                    schema = @Schema(implementation = Problem.class)))
    @ApiResponse(responseCode = "429", description = "5 failed logins in 15 minutes; try again later",
            content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                    schema = @Schema(implementation = Problem.class)))
    public void login(@Valid @RequestBody LoginRequest login, HttpServletRequest request,
                      HttpServletResponse response) {
        throttle.checkAllowed();
        Authentication authentication;
        try {
            authentication = authenticationManager.authenticate(
                    UsernamePasswordAuthenticationToken.unauthenticated(login.username(), login.password()));
        } catch (AuthenticationException e) {
            throttle.recordFailure();
            throw new BadCredentialsException("Invalid username or password");
        }
        throttle.recordSuccess();
        sessionStrategy.onAuthentication(authentication, request, response);
        // The CSRF strategy clears the old XSRF-TOKEN cookie and defers the new token; load it so it's written now.
        ((CsrfToken) request.getAttribute(CsrfToken.class.getName())).getToken();
        SecurityContext context = contextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        contextHolder.setContext(context);
        contextRepository.saveContext(context, request, response);
    }

    @GetMapping("/me")
    @Operation(operationId = "getMe", summary = "The logged-in owner")
    @ApiResponse(responseCode = "200", description = "The owner",
            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = MeResponse.class)))
    public MeResponse me(Principal principal) {
        return new MeResponse(principal.getName());
    }
}
