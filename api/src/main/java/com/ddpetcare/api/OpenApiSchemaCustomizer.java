package com.ddpetcare.api;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.SpecVersion;
import io.swagger.v3.oas.models.media.Schema;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.stereotype.Component;

// OpenAPI 3.1 has no "nullable": a nullable field's type is a list that includes "null", and swagger-core
// drops @Schema(nullable = true) from 3.1 output. So required and nullable fields are set on the model here.
@Component
@SuppressWarnings("rawtypes")
class OpenApiSchemaCustomizer implements OpenApiCustomizer {

    private static final String TIME_PATTERN = "^([01][0-9]|2[0-3]):[0-5][0-9]$";

    private static final List<String> ALL_PROPERTIES_REQUIRED = List.of("BookingResponse", "StayResponse",
            "ClientSummary", "DogSummary", "ClientResponse", "DogResponse", "FieldError", "ExistingClient");

    private static final Map<String, List<String>> REQUIRED = Map.of(
            "Problem", List.of("title", "status", "detail", "instance"),
            "ValidationProblem", List.of("title", "status", "detail", "instance"),
            "ConflictProblem", List.of("title", "status", "detail", "instance"));

    // New nullable response fields must be added here.
    private static final Map<String, List<String>> NULLABLE = Map.of(
            "BookingResponse", List.of("notes", "paidAt"),
            "ClientSummary", List.of("phone"),
            "ClientResponse", List.of("phone"),
            "CreateBookingRequest", List.of("notes"));

    private static final Map<String, List<String>> TIMES = Map.of(
            "StayResponse", List.of("dropOffTime", "pickUpTime"),
            "StayRequest", List.of("dropOffTime", "pickUpTime"));

    @Override
    public void customise(OpenAPI openApi) {
        Map<String, Schema> schemas = openApi.getComponents().getSchemas();
        ALL_PROPERTIES_REQUIRED.forEach(name -> schema(schemas, name)
                .setRequired(new ArrayList<>(property(schemas, name).keySet())));
        REQUIRED.forEach((name, fields) -> schema(schemas, name).setRequired(new ArrayList<>(fields)));
        NULLABLE.forEach((name, fields) -> fields.forEach(field -> allowNull(property(schemas, name, field))));
        TIMES.forEach((name, fields) -> fields.forEach(field -> {
            property(schemas, name, field);
            schema(schemas, name).getProperties().put(field, time());
        }));
        // @Size(max) resets the minItems that @NotEmpty sets.
        property(schemas, "CreateBookingRequest", "stays").setMinItems(1);
    }

    private static Schema<?> schema(Map<String, Schema> schemas, String name) {
        Schema<?> schema = schemas.get(name);
        if (schema == null) {
            throw new IllegalStateException("No OpenAPI schema named " + name);
        }
        return schema;
    }

    private static Map<String, Schema> property(Map<String, Schema> schemas, String name) {
        Map<String, Schema> properties = schema(schemas, name).getProperties();
        if (properties == null) {
            throw new IllegalStateException("No properties on OpenAPI schema " + name);
        }
        return properties;
    }

    private static Schema<?> property(Map<String, Schema> schemas, String name, String field) {
        Map<String, Schema> properties = schema(schemas, name).getProperties();
        Schema<?> property = properties == null ? null : properties.get(field);
        if (property == null) {
            throw new IllegalStateException("No property " + field + " on OpenAPI schema " + name);
        }
        return property;
    }

    private static void allowNull(Schema<?> property) {
        Set<String> types = new LinkedHashSet<>();
        if (property.getTypes() != null) {
            types.addAll(property.getTypes());
        } else if (property.getType() != null) {
            types.add(property.getType());
        }
        types.add("null");
        property.setTypes(types);
    }

    private static Schema<String> time() {
        Schema<String> time = new Schema<>(SpecVersion.V31);
        time.setTypes(new LinkedHashSet<>(List.of("string", "null")));
        time.setPattern(TIME_PATTERN);
        time.setExample("09:00");
        return time;
    }
}
