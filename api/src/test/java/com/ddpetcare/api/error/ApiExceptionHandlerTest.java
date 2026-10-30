package com.ddpetcare.api.error;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.SQLException;

import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ProblemDetail;

class ApiExceptionHandlerTest {

    private final ApiExceptionHandler handler = new ApiExceptionHandler();

    @Test
    void duplicatePhoneFromTheDatabaseIsAConflict() {
        ProblemDetail problem = handler.dataIntegrity(violationOf("clients_phone_key"));

        assertThat(problem.getStatus()).isEqualTo(409);
        assertThat(problem.getTitle()).isEqualTo("Phone already on file");
    }

    @Test
    void anyOtherConstraintViolationIsAServerError() {
        ProblemDetail problem = handler.dataIntegrity(violationOf("booking_stays_price_check"));

        assertThat(problem.getStatus()).isEqualTo(500);
    }

    @Test
    void unexpectedExceptionIsAGenericServerError() {
        ProblemDetail problem = handler.unexpected(new RuntimeException("secret detail"));

        assertThat(problem.getStatus()).isEqualTo(500);
        assertThat(problem.getTitle()).isEqualTo("Internal error");
        assertThat(String.valueOf(problem.getDetail())).doesNotContain("secret detail");
        assertThat(problem.toString()).doesNotContain("secret detail");
    }

    private static DataIntegrityViolationException violationOf(String constraint) {
        SQLException sql = new SQLException("Failing row contains (Sarah Lee, 07700 900123)");
        return new DataIntegrityViolationException("could not execute statement",
                new ConstraintViolationException("could not execute statement", sql, constraint));
    }
}
