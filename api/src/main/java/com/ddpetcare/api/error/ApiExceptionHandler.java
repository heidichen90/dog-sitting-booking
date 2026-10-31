package com.ddpetcare.api.error;

import java.util.List;

import org.hibernate.exception.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(NotFoundException.class)
    ProblemDetail notFound(NotFoundException ex) {
        return problem(HttpStatus.NOT_FOUND, "Not found", ex.getMessage());
    }

    @ExceptionHandler(InvalidRequestException.class)
    ProblemDetail invalid(InvalidRequestException ex) {
        return problem(HttpStatus.BAD_REQUEST, "Invalid request", ex.getMessage());
    }

    @ExceptionHandler(PhoneInUseException.class)
    ProblemDetail phoneInUse(PhoneInUseException ex) {
        ProblemDetail problem = problem(HttpStatus.CONFLICT, "Phone already on file", ex.getMessage());
        problem.setProperty("existingClient", new ExistingClient(ex.getClientId(), ex.getClientName()));
        return problem;
    }

    // A duplicate phone reaching the database means two creates raced past the service's check.
    @ExceptionHandler(DataIntegrityViolationException.class)
    ProblemDetail dataIntegrity(DataIntegrityViolationException ex) {
        String constraint = constraintName(ex);
        if ("clients_phone_key".equals(constraint)) {
            return problem(HttpStatus.CONFLICT, "Phone already on file",
                    "This phone number already belongs to another client.");
        }
        log.error("Constraint violation not caught by validation: {}", constraint);
        return problem(HttpStatus.INTERNAL_SERVER_ERROR, "Internal error", "Something went wrong.");
    }

    @ExceptionHandler(Exception.class)
    ProblemDetail unexpected(Exception ex) {
        log.error("Unhandled exception", ex);
        return problem(HttpStatus.INTERNAL_SERVER_ERROR, "Internal error", "Something went wrong.");
    }

    // The exception message can contain the failing row (client names and phones), so only the constraint name is used.
    private static String constraintName(DataIntegrityViolationException ex) {
        for (Throwable cause = ex; cause != null; cause = cause.getCause()) {
            if (cause instanceof ConstraintViolationException violation && violation.getConstraintName() != null) {
                return violation.getConstraintName();
            }
        }
        return "unknown";
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        ProblemDetail problem = ex.getBody();
        problem.setTitle("Invalid request");
        List<FieldError> errors = ex.getBindingResult().getFieldErrors().stream()
                .map(error -> new FieldError(error.getField(), String.valueOf(error.getDefaultMessage())))
                .toList();
        problem.setProperty("errors", errors);
        return handleExceptionInternal(ex, problem, headers, status, request);
    }

    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(HttpMessageNotReadableException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        ProblemDetail problem = problem(HttpStatus.BAD_REQUEST, "Invalid request",
                "The request body is missing or not valid. Check the field formats (dates as yyyy-MM-dd, times as HH:mm).");
        return handleExceptionInternal(ex, problem, headers, HttpStatus.BAD_REQUEST, request);
    }

    public record FieldError(String field, String message) {
    }

    public record ExistingClient(long id, String name) {
    }

    private static ProblemDetail problem(HttpStatus status, String title, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(title);
        return problem;
    }
}
