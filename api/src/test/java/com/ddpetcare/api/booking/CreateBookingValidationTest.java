package com.ddpetcare.api.booking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.containsStringIgnoringCase;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ddpetcare.api.DatabaseTest;
import com.ddpetcare.api.TestRequests;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

class CreateBookingValidationTest extends DatabaseTest {

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource(delimiter = '|', value = {
            "create-no-stays.json | stays | must not be empty",
            "create-client-id-and-name.json | client | give either id, or name with an optional phone",
            "create-dog-without-id-or-name.json | dog | give either id or name",
            "create-blank-dog-name.json | dog.name | must not be blank",
            "create-bad-phone.json | client.phone | must be in international format, e.g. +447700900123",
            "create-missing-pickup-date.json | stays[0].pickUpDate | must not be null",
            "create-pickup-before-dropoff.json | stays[0].pickUpDate | must not be before dropOffDate",
            "create-same-day-pickup-before-dropoff.json | stays[0].pickUpTime | on a same-day stay, must be after dropOffTime",
            "create-negative-rate.json | stays[0].unitRate | must be greater than or equal to 0",
            "create-rate-three-decimals.json | stays[0].unitRate | numeric value out of bounds (<6 digits>.<2 digits> expected)",
            "create-negative-fee.json | stays[0].pickupDropoffFee | must be greater than or equal to 0",
            "create-too-many-stays.json | stays | size must be between 0 and 31",
            "create-stay-over-60-nights.json | stays[0].pickUpDate | must be at most 60 nights after dropOffDate",
            "create-rate-over-max.json | stays[0].unitRate | must be less than or equal to 9999.99",
            "create-fee-over-max.json | stays[0].pickupDropoffFee | must be less than or equal to 9999.99",
            "create-long-client-name.json | client.name | size must be between 0 and 100",
            "create-long-dog-name.json | dog.name | size must be between 0 and 100",
            "create-long-notes.json | notes | size must be between 0 and 2000",
            "create-blank-client-name.json | client.name | must not be blank",
            "create-client-name-unicode-spaces.json | client.name | must not be blank",
            "create-dog-name-unicode-spaces.json | dog.name | must not be blank",
            "create-client-name-control-char.json | client.name | must not be blank",
            "create-dog-name-control-char.json | dog.name | must not be blank",
            "create-client-id-and-phone.json | client | give either id, or name with an optional phone",
            "create-dropoff-year-out-of-range.json | stays[0].dropOffDate | must be between 2000 and 2100",
    })
    void rejectsInvalidRequest(String file, String field, String message) throws Exception {
        postJson("/api/bookings", TestRequests.load("bookings/" + file.strip()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Invalid request"))
                .andExpect(jsonPath("$.errors[?(@.field == '" + field.strip() + "')].message")
                        .value(hasItem(message.strip())));

        assertThat(jdbc.sql("SELECT count(*) FROM clients").query(Long.class).single()).isZero();
    }

    @ParameterizedTest
    @ValueSource(strings = {"create-malformed.json", "create-time-with-seconds.json", "create-bad-date.json"})
    void rejectsUnreadableBody(String file) throws Exception {
        postJson("/api/bookings", TestRequests.load("bookings/" + file))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Invalid request"))
                .andExpect(jsonPath("$.detail").value(not(containsStringIgnoringCase("json"))))
                .andExpect(jsonPath("$.detail").value(not(containsString("Exception"))));

        assertThat(jdbc.sql("SELECT count(*) FROM clients").query(Long.class).single()).isZero();
    }
}
