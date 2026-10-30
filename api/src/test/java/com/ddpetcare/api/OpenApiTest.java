package com.ddpetcare.api;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;

class OpenApiTest extends DatabaseTest {

    @Test
    void documentsTheFiveEndpoints() throws Exception {
        getJson("/v3/api-docs")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/clients'].get").exists())
                .andExpect(jsonPath("$.paths['/bookings'].get").exists())
                .andExpect(jsonPath("$.paths['/bookings'].post").exists())
                .andExpect(jsonPath("$.paths['/bookings/{id}'].get").exists())
                .andExpect(jsonPath("$.paths['/bookings/{id}/cancel'].post").exists())
                .andExpect(jsonPath("$.components.schemas.ClientRef.properties.idOrName").doesNotExist());
    }
}
