package com.ddpetcare.api;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

class OpenApiTest extends DatabaseTest {

    private static final String SCHEMAS = "$.components.schemas.";
    private static final String CREATE = "$.paths['/api/bookings'].post.responses";
    private static final String TIME_PATTERN = "^([01][0-9]|2[0-3]):[0-5][0-9]$";

    private ResultActions apiDocs() throws Exception {
        return getJson("/v3/api-docs").andExpect(status().isOk());
    }

    @Test
    void documentsTheFiveEndpointsUnderApiWithReadableOperationIds() throws Exception {
        apiDocs()
                .andExpect(jsonPath("$.openapi").value(startsWith("3.1")))
                .andExpect(jsonPath("$.paths['/api/clients'].get.operationId").value("listClients"))
                .andExpect(jsonPath("$.paths['/api/bookings'].get.operationId").value("listBookings"))
                .andExpect(jsonPath("$.paths['/api/bookings'].post.operationId").value("createBooking"))
                .andExpect(jsonPath("$.paths['/api/bookings/{id}'].get.operationId").value("getBooking"))
                .andExpect(jsonPath("$.paths['/api/bookings/{id}/cancel'].post.operationId").value("cancelBooking"))
                .andExpect(jsonPath("$.paths['/clients']").doesNotExist())
                .andExpect(jsonPath("$.paths['/bookings']").doesNotExist())
                .andExpect(jsonPath(SCHEMAS + "ClientRef.properties.idOrName").doesNotExist());
    }

    @Test
    void successResponsesAreJson() throws Exception {
        apiDocs()
                .andExpect(jsonPath("$.paths['/api/clients'].get.responses['200'].content['application/json']").exists())
                .andExpect(jsonPath("$.paths['/api/clients'].get.responses['200'].content['*/*']").doesNotExist())
                .andExpect(jsonPath("$.paths['/api/bookings'].get.responses['200'].content['application/json']").exists())
                .andExpect(jsonPath("$.paths['/api/bookings/{id}'].get.responses['200'].content['application/json']")
                        .exists())
                .andExpect(jsonPath(
                        "$.paths['/api/bookings/{id}/cancel'].post.responses['200'].content['application/json']")
                        .exists());
    }

    @Test
    void createIsDocumentedAs201WithLocation() throws Exception {
        apiDocs()
                .andExpect(jsonPath(CREATE + "['201'].headers.Location").exists())
                .andExpect(jsonPath(CREATE + "['201'].content['application/json'].schema['$ref']")
                        .value("#/components/schemas/BookingResponse"))
                .andExpect(jsonPath(CREATE + "['200']").doesNotExist());
    }

    @Test
    void errorResponsesAreDocumented() throws Exception {
        apiDocs()
                .andExpect(jsonPath(CREATE + "['400'].content['application/problem+json'].schema['$ref']")
                        .value("#/components/schemas/ValidationProblem"))
                .andExpect(jsonPath(CREATE + "['404'].content['application/problem+json'].schema['$ref']")
                        .value("#/components/schemas/Problem"))
                .andExpect(jsonPath(CREATE + "['409'].content['application/problem+json'].schema['$ref']")
                        .value("#/components/schemas/ConflictProblem"))
                .andExpect(jsonPath("$.paths['/api/bookings/{id}'].get.responses['404']").exists())
                .andExpect(jsonPath("$.paths['/api/bookings/{id}/cancel'].post.responses['404']").exists())
                .andExpect(jsonPath(SCHEMAS + "ValidationProblem.properties.errors.items['$ref']")
                        .value("#/components/schemas/FieldError"))
                .andExpect(jsonPath(SCHEMAS + "FieldError.required", containsInAnyOrder("field", "message")))
                .andExpect(jsonPath(SCHEMAS + "ConflictProblem.properties.existingClient['$ref']")
                        .value("#/components/schemas/ExistingClient"))
                .andExpect(jsonPath(SCHEMAS + "ExistingClient.required", containsInAnyOrder("id", "name")))
                .andExpect(jsonPath(SCHEMAS + "Problem.required",
                        containsInAnyOrder("title", "status", "detail", "instance")))
                .andExpect(jsonPath(SCHEMAS + "ValidationProblem.required",
                        containsInAnyOrder("title", "status", "detail", "instance")))
                .andExpect(jsonPath(SCHEMAS + "ConflictProblem.required",
                        containsInAnyOrder("title", "status", "detail", "instance")));
    }

    @Test
    void everyResponseFieldIsRequired() throws Exception {
        String docs = apiDocs().andReturn().getResponse().getContentAsString();
        for (String name : List.of("BookingResponse", "StayResponse", "ClientSummary", "DogSummary",
                "ClientResponse", "DogResponse", "FieldError", "ExistingClient")) {
            Map<String, Object> properties = JsonPath.read(docs, "$.components.schemas." + name + ".properties");
            List<String> required = JsonPath.read(docs, "$.components.schemas." + name + ".required");
            assertThat(name, required, containsInAnyOrder(properties.keySet().toArray()));
        }
    }

    @Test
    void responseFieldsAreRequiredAndTheNullableOnesAllowNull() throws Exception {
        apiDocs()
                .andExpect(jsonPath(SCHEMAS + "BookingResponse.properties.notes.type",
                        containsInAnyOrder("string", "null")))
                .andExpect(jsonPath(SCHEMAS + "BookingResponse.properties.paidAt.type",
                        containsInAnyOrder("string", "null")))
                .andExpect(jsonPath(SCHEMAS + "ClientSummary.properties.phone.type",
                        containsInAnyOrder("string", "null")))
                .andExpect(jsonPath(SCHEMAS + "ClientResponse.properties.phone.type",
                        containsInAnyOrder("string", "null")))
                .andExpect(jsonPath(SCHEMAS + "StayResponse.properties.dropOffTime.type",
                        containsInAnyOrder("string", "null")))
                .andExpect(jsonPath(SCHEMAS + "StayResponse.properties.pickUpTime.type",
                        containsInAnyOrder("string", "null")))
                .andExpect(jsonPath(SCHEMAS + "BookingResponse.properties.createdAt.type", not(hasItem("null"))));
    }

    @Test
    void fixedValueListsAreEnums() throws Exception {
        apiDocs()
                .andExpect(jsonPath(SCHEMAS + "BookingResponse.properties.status.enum",
                        containsInAnyOrder("confirmed", "cancelled")))
                .andExpect(jsonPath(SCHEMAS + "StayResponse.properties.status.enum",
                        containsInAnyOrder("confirmed", "cancelled")))
                .andExpect(jsonPath(SCHEMAS + "StayResponse.properties.service.enum",
                        containsInAnyOrder("day_care", "boarding")));
    }

    @Test
    void requestSchemaHasMinItemsNullableNotesAndHhMmTimes() throws Exception {
        apiDocs()
                .andExpect(jsonPath(SCHEMAS + "CreateBookingRequest.properties.stays.minItems").value(1))
                .andExpect(jsonPath(SCHEMAS + "CreateBookingRequest.properties.notes.type",
                        containsInAnyOrder("string", "null")))
                .andExpect(jsonPath(SCHEMAS + "StayRequest.properties.dropOffTime.pattern").value(TIME_PATTERN))
                .andExpect(jsonPath(SCHEMAS + "StayRequest.properties.dropOffTime.type",
                        containsInAnyOrder("string", "null")))
                .andExpect(jsonPath(SCHEMAS + "StayRequest.properties.pickUpTime.pattern").value(TIME_PATTERN))
                .andExpect(jsonPath(SCHEMAS + "StayResponse.properties.dropOffTime.pattern").value(TIME_PATTERN))
                .andExpect(jsonPath(SCHEMAS + "StayResponse.properties.pickUpTime.pattern").value(TIME_PATTERN));
    }
}
