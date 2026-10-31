package com.ddpetcare.api.error;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ddpetcare.api.DatabaseTest;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

class SpringErrorsStillMappedTest extends DatabaseTest {

    @Test
    void malformedPathVariableIsBadRequestNotServerError() throws Exception {
        getJson("/api/bookings/abc")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400));
    }

    @Test
    void unsupportedMethodIsMethodNotAllowed() throws Exception {
        mvc.perform(MockMvcRequestBuilders.delete("/api/bookings"))
                .andExpect(status().isMethodNotAllowed());
    }
}
