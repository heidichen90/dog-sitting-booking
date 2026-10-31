package com.ddpetcare.api;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashMap;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import org.junit.jupiter.api.Test;

class OpenApiSchemaCustomizerTest {

    @Test
    void failsLoudlyWhenANamedSchemaIsMissing() {
        OpenAPI openApi = new OpenAPI().components(new Components().schemas(new HashMap<>()));

        IllegalStateException e = assertThrows(IllegalStateException.class,
                () -> new OpenApiSchemaCustomizer().customise(openApi));

        assertTrue(e.getMessage().contains("No OpenAPI schema named"), e.getMessage());
    }
}
