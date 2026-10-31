package com.ddpetcare.api.error;

import java.util.List;

import com.ddpetcare.api.error.ApiExceptionHandler.ExistingClient;
import com.ddpetcare.api.error.ApiExceptionHandler.FieldError;
import io.swagger.v3.oas.annotations.media.Schema;

/** OpenAPI shapes of the ProblemDetail bodies that ApiExceptionHandler returns. Never instantiated. */
public final class ProblemSchemas {

    private ProblemSchemas() {
    }

    @Schema(description = "An error (RFC 9457 problem detail)")
    public record Problem(String type, String title, int status, String detail, String instance) {
    }

    @Schema(description = "A 400. errors lists each invalid field; it's absent for an unreadable body or a business-rule 400 (for example a dog that belongs to another client)")
    public record ValidationProblem(String type, String title, int status, String detail, String instance,
                                    List<FieldError> errors) {
    }

    @Schema(description = "A 409. existingClient is the client who has the phone; absent if two creates raced")
    public record ConflictProblem(String type, String title, int status, String detail, String instance,
                                  ExistingClient existingClient) {
    }
}
