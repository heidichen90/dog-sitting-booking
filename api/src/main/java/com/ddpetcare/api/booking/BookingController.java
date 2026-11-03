package com.ddpetcare.api.booking;

import java.net.URI;
import java.util.List;

import com.ddpetcare.api.error.ProblemSchemas.ConflictProblem;
import com.ddpetcare.api.error.ProblemSchemas.Problem;
import com.ddpetcare.api.error.ProblemSchemas.ValidationProblem;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/bookings")
public class BookingController {

    private final BookingService service;

    public BookingController(BookingService service) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "createBooking", summary = "Create a booking with its stays")
    @ApiResponse(responseCode = "201", description = "The new booking",
            headers = @Header(name = "Location", description = "/api/bookings/{id}",
                    schema = @Schema(type = "string")),
            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = BookingResponse.class)))
    @ApiResponse(responseCode = "400", description = "Invalid request",
            content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                    schema = @Schema(implementation = ValidationProblem.class)))
    @ApiResponse(responseCode = "404", description = "Unknown client or dog id",
            content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                    schema = @Schema(implementation = Problem.class)))
    @ApiResponse(responseCode = "409", description = "A new client's phone is already on file",
            content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                    schema = @Schema(implementation = ConflictProblem.class)))
    public ResponseEntity<BookingResponse> create(@Valid @RequestBody CreateBookingRequest request) {
        BookingResponse booking = service.create(request);
        return ResponseEntity.created(URI.create("/api/bookings/" + booking.id())).body(booking);
    }

    @GetMapping
    @Operation(operationId = "listBookings", summary = "All bookings, newest first, cancelled included")
    public List<BookingResponse> list() {
        return service.list();
    }

    @GetMapping("/{id}")
    @Operation(operationId = "getBooking", summary = "One booking")
    @ApiResponse(responseCode = "200", description = "The booking",
            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = BookingResponse.class)))
    @ApiResponse(responseCode = "404", description = "Unknown booking id",
            content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                    schema = @Schema(implementation = Problem.class)))
    public BookingResponse get(@PathVariable long id) {
        return service.get(id);
    }

    @PostMapping("/{id}/cancel")
    @Operation(operationId = "cancelBooking", summary = "Cancel a booking and all its stays")
    @ApiResponse(responseCode = "200", description = "The cancelled booking",
            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                    schema = @Schema(implementation = BookingResponse.class)))
    @ApiResponse(responseCode = "404", description = "Unknown booking id",
            content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                    schema = @Schema(implementation = Problem.class)))
    public BookingResponse cancel(@PathVariable long id) {
        return service.cancel(id);
    }
}
