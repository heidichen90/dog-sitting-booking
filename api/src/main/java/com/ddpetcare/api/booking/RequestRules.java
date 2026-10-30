package com.ddpetcare.api.booking;

import static java.lang.annotation.ElementType.TYPE;
import static java.lang.annotation.RetentionPolicy.RUNTIME;

import java.lang.annotation.Documented;
import java.lang.annotation.Retention;
import java.lang.annotation.Target;
import java.time.temporal.ChronoUnit;

import com.ddpetcare.api.booking.CreateBookingRequest.ClientRef;
import com.ddpetcare.api.booking.CreateBookingRequest.DogRef;
import com.ddpetcare.api.booking.CreateBookingRequest.StayRequest;
import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;

final class RequestRules {

    static final int MAX_NIGHTS = 60;
    static final int MIN_YEAR = 2000;
    static final int MAX_YEAR = 2100;

    private RequestRules() {
    }

    @Documented
    @Target(TYPE)
    @Retention(RUNTIME)
    @Constraint(validatedBy = ClientRefValidator.class)
    @interface ValidClientRef {
        String message() default "give either id, or name with an optional phone";

        Class<?>[] groups() default {};

        Class<? extends Payload>[] payload() default {};
    }

    @Documented
    @Target(TYPE)
    @Retention(RUNTIME)
    @Constraint(validatedBy = DogRefValidator.class)
    @interface ValidDogRef {
        String message() default "give either id or name";

        Class<?>[] groups() default {};

        Class<? extends Payload>[] payload() default {};
    }

    @Documented
    @Target(TYPE)
    @Retention(RUNTIME)
    @Constraint(validatedBy = StayDatesValidator.class)
    @interface ValidStayDates {
        String message() default "invalid stay dates";

        Class<?>[] groups() default {};

        Class<? extends Payload>[] payload() default {};
    }

    static class ClientRefValidator implements ConstraintValidator<ValidClientRef, ClientRef> {
        @Override
        public boolean isValid(ClientRef ref, ConstraintValidatorContext context) {
            return ref.id() != null ? ref.name() == null && ref.phone() == null : ref.name() != null;
        }
    }

    static class DogRefValidator implements ConstraintValidator<ValidDogRef, DogRef> {
        @Override
        public boolean isValid(DogRef ref, ConstraintValidatorContext context) {
            return (ref.id() == null) != (ref.name() == null);
        }
    }

    static class StayDatesValidator implements ConstraintValidator<ValidStayDates, StayRequest> {
        @Override
        public boolean isValid(StayRequest stay, ConstraintValidatorContext context) {
            if (stay.dropOffDate() == null || stay.pickUpDate() == null) {
                return true;
            }
            context.disableDefaultConstraintViolation();
            if (stay.dropOffDate().getYear() < MIN_YEAR || stay.dropOffDate().getYear() > MAX_YEAR) {
                return violation(context, "dropOffDate", "must be between " + MIN_YEAR + " and " + MAX_YEAR);
            }
            if (stay.pickUpDate().isBefore(stay.dropOffDate())) {
                return violation(context, "pickUpDate", "must not be before dropOffDate");
            }
            if (ChronoUnit.DAYS.between(stay.dropOffDate(), stay.pickUpDate()) > MAX_NIGHTS) {
                return violation(context, "pickUpDate", "must be at most " + MAX_NIGHTS + " nights after dropOffDate");
            }
            if (stay.dropOffDate().equals(stay.pickUpDate()) && stay.dropOffTime() != null
                    && stay.pickUpTime() != null && !stay.pickUpTime().isAfter(stay.dropOffTime())) {
                return violation(context, "pickUpTime", "on a same-day stay, must be after dropOffTime");
            }
            return true;
        }

        private static boolean violation(ConstraintValidatorContext context, String property, String message) {
            context.buildConstraintViolationWithTemplate(message).addPropertyNode(property).addConstraintViolation();
            return false;
        }
    }
}
