# Booking API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add JPA entities and five REST endpoints (`GET /clients`, `POST /bookings`, `GET /bookings`, `GET /bookings/{id}`, `POST /bookings/{id}/cancel`) so the frontend can replace `localStorage` in the next plan.

**Architecture:** Packages by feature (`client`, `booking`, `error`). Controllers take and return Java records. Services hold the rules and run in transactions. JPA repositories sit underneath, and entities never leave the service. Flyway still owns the schema; Hibernate only validates it (`ddl-auto: validate`). One `@RestControllerAdvice` turns every error into `ProblemDetail` JSON.

**Tech Stack:** Spring Boot 4.1.2, Java 21, Spring Data JPA (Hibernate 7, managed by Boot), Bean Validation (Hibernate Validator), Jackson 3, PostgreSQL 18, JUnit 5, MockMvc, AssertJ.

**Spec:** `docs/superpowers/specs/2026-10-30-booking-api-design.md`

> **Note (post-review):** The implementation diverged from some snippets below during code review. Changes: money stored at scale 2; unmodifiable entity collections; stays sorted in responses; owner-approved request limits and `HH:mm` times; class-level validators in `booking/RequestRules.java` that report on real field names, replacing the `@AssertTrue` methods; typed error records; constraint matching by name with no row data logged; a catch-all 500 handler. The code and the spec are authoritative.

**Branch:** `feat/booking-api` (spec already committed as `daa0af1`).

**Ground rules (from CLAUDE.md):** no commits without the project owner approving the message. No dependencies beyond the two approved in the spec. Never touch prod. Schema changes happen only through Flyway, and this plan needs none.

---

## Things to know before starting

- **Run Maven from `api/`.** `application.yml` imports `../db.dev.local` relative to the working directory.
- **Every Spring test extends `DatabaseTest`.** Each test runs in one transaction that is rolled back.
- **MockMvc runs in the same thread as the test,** so the service's `@Transactional` joins the test transaction. Consequences:
  - JPA inserts with identity IDs hit the database immediately, so plain-SQL reads see them.
  - JPA *updates* (such as cancel) are only written at flush. Call `flushAndClear()` (added in Task 3) before reading with `jdbc` after an update.
  - `now()` in SQL returns the transaction start time, so rows inserted in one test share a `created_at`. That's why ordering always has an `id` tie-breaker.
- **`CreateBookingRollbackTest` opts out of the test transaction** (`Propagation.NOT_SUPPORTED`), so the service's own transaction really commits or rolls back.
- **Jackson 3** is the JSON library in Boot 4, but annotations are still imported from `com.fasterxml.jackson.annotation`.
- **JSON numbers:** `BigDecimal` 95.00 is written as `95.00`, and `jsonPath` reads it as the double `95.0`.

## Clarification of the spec

The race-condition 409 (the `clients_phone_key` unique constraint firing) can't name the existing client. When it fires, the Hibernate session is already broken, so it can't look anything up. The handler returns 409 without `existingClient` in that case. The normal path, a phone already on file before insert, includes `existingClient` as the spec says.

## File map

| File | Action | Responsibility |
|---|---|---|
| `api/pom.xml` | Modify | Add `spring-boot-starter-data-jpa`, `spring-boot-starter-validation` |
| `api/src/main/resources/application.yml` | Modify | `ddl-auto: validate`, `open-in-view: false` |
| `api/src/test/resources/application-test.yml` | Modify | Hibernate statistics on (for the query-count test) |
| `api/src/main/java/com/ddpetcare/api/booking/Status.java` | Create | `CONFIRMED` / `CANCELLED` with their lowercase DB values |
| `api/src/main/java/com/ddpetcare/api/booking/StatusConverter.java` | Create | Stores `Status` as lowercase text |
| `api/src/main/java/com/ddpetcare/api/client/Client.java` | Create | `clients` entity |
| `api/src/main/java/com/ddpetcare/api/client/Dog.java` | Create | `dogs` entity |
| `api/src/main/java/com/ddpetcare/api/booking/Booking.java` | Create | `bookings` entity; owns stays; `cancel()`, `total()` |
| `api/src/main/java/com/ddpetcare/api/booking/BookingStay.java` | Create | `booking_stays` entity; price calculation |
| `api/src/main/java/com/ddpetcare/api/client/ClientRepository.java` | Create | Find by phone; list with dogs |
| `api/src/main/java/com/ddpetcare/api/client/DogRepository.java` | Create | Find a client's dog by name |
| `api/src/main/java/com/ddpetcare/api/booking/BookingRepository.java` | Create | List and find with client, dog and stays in one query |
| `api/src/main/java/com/ddpetcare/api/client/ClientResponse.java` | Create | `GET /clients` item |
| `api/src/main/java/com/ddpetcare/api/client/ClientService.java` | Create | Lists clients |
| `api/src/main/java/com/ddpetcare/api/client/ClientController.java` | Create | `GET /clients` |
| `api/src/main/java/com/ddpetcare/api/booking/CreateBookingRequest.java` | Create | Create request plus its validation rules |
| `api/src/main/java/com/ddpetcare/api/booking/BookingResponse.java` | Create | Booking JSON shape |
| `api/src/main/java/com/ddpetcare/api/booking/BookingService.java` | Create | Create, list, get, cancel |
| `api/src/main/java/com/ddpetcare/api/booking/BookingController.java` | Create | `/bookings` endpoints |
| `api/src/main/java/com/ddpetcare/api/error/NotFoundException.java` | Create | → 404 |
| `api/src/main/java/com/ddpetcare/api/error/InvalidRequestException.java` | Create | → 400 |
| `api/src/main/java/com/ddpetcare/api/error/PhoneInUseException.java` | Create | → 409 with existing client |
| `api/src/main/java/com/ddpetcare/api/error/ApiExceptionHandler.java` | Create | All errors → `ProblemDetail` |
| `api/src/test/java/com/ddpetcare/api/DatabaseTest.java` | Modify | Add MockMvc, `EntityManager`, HTTP helpers, `flushAndClear()` |
| `api/src/test/java/com/ddpetcare/api/TestRequests.java` | Create | Loads request JSON files and fills `{{placeholders}}` |
| `api/src/test/resources/requests/bookings/*.json` | Create | One request body per scenario |
| `api/src/test/java/com/ddpetcare/api/booking/StayPriceTest.java` | Create | Pricing, no Spring |
| `api/src/test/java/com/ddpetcare/api/client/ListClientsTest.java` | Create | `GET /clients` |
| `api/src/test/java/com/ddpetcare/api/booking/CreateBookingTest.java` | Create | Create happy paths |
| `api/src/test/java/com/ddpetcare/api/booking/ClientAndDogResolutionTest.java` | Create | Existing/new client and dog, reuse, 404, 400, 409 |
| `api/src/test/java/com/ddpetcare/api/booking/CreateBookingValidationTest.java` | Create | 400 cases |
| `api/src/test/java/com/ddpetcare/api/booking/CreateBookingRollbackTest.java` | Create | Failed create leaves no rows |
| `api/src/test/java/com/ddpetcare/api/booking/ListBookingsTest.java` | Create | List, get, total, ordering, service, time format |
| `api/src/test/java/com/ddpetcare/api/booking/CancelBookingTest.java` | Create | Cancel, twice, `updated_at`, 404 |
| `api/src/test/java/com/ddpetcare/api/booking/BookingQueryCountTest.java` | Create | No N+1 |
| `api/src/test/java/com/ddpetcare/api/error/ApiExceptionHandlerTest.java` | Create | Constraint-violation mapping (not in the spec's list; the only way to test the race-case 409) |
| `api/src/test/java/com/ddpetcare/api/OpenApiTest.java` | Create | `/v3/api-docs` lists the five endpoints |
| `api/CLAUDE.md` | Modify | Document JPA and test conventions |

---

### Task 1: Dependencies and JPA settings

**Files:** modify `api/pom.xml`, `api/src/main/resources/application.yml`, `api/src/test/resources/application-test.yml`

- [ ] **Step 1: Add the two approved starters to `api/pom.xml`**

Insert after the `spring-boot-starter-jdbc` dependency:
```xml
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>
```

- [ ] **Step 2: Configure JPA in `application.yml`**

Add under `spring:` (same level as `datasource:`):
```yaml
  jpa:
    open-in-view: false
    hibernate:
      ddl-auto: validate
```

- [ ] **Step 3: Turn on Hibernate statistics for tests**

Replace `api/src/test/resources/application-test.yml` with:
```yaml
spring:
  datasource:
    url: ${TEST_DB_URL:jdbc:postgresql://localhost:5432/dd_pet_care_test}
  flyway:
    clean-disabled: false
  jpa:
    properties:
      hibernate:
        generate_statistics: true

logging:
  level:
    org.hibernate.engine.internal.StatisticalLoggingSessionEventListener: WARN
```
The logging line stops Hibernate printing session metrics after every request.

- [ ] **Step 4: Run the full suite. Every existing test must still pass.**

Run: `cd api && ./mvnw -B verify`
Expected: BUILD SUCCESS, with the same test count as before. The log shows Flyway migrating before Hibernate starts. If Hibernate fails at startup, stop and report: with no entities yet, it should have nothing to validate.

---

### Task 2: Pricing, status and entities

**Files:** create `booking/Status.java`, `booking/StatusConverter.java`, `booking/BookingStay.java`, `booking/Booking.java`, `booking/BookingRepository.java`, `client/Client.java`, `client/Dog.java`, `client/ClientRepository.java`, `client/DogRepository.java`; test `booking/StayPriceTest.java`

All paths are under `api/src/main/java/com/ddpetcare/api/` (main) or `api/src/test/java/com/ddpetcare/api/` (test).

- [ ] **Step 1: Write the failing pricing test**

`booking/StayPriceTest.java`:
```java
package com.ddpetcare.api.booking;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;

class StayPriceTest {

    private static final LocalDate MON = LocalDate.of(2026, 11, 2);

    @Test
    void dayCareChargesOneUnit() {
        assertThat(BookingStay.price(MON, MON, new BigDecimal("35.00"), BigDecimal.ZERO))
                .isEqualTo(new BigDecimal("35.00"));
    }

    @Test
    void boardingChargesPerNightPlusFee() {
        assertThat(BookingStay.price(MON, MON.plusDays(2), new BigDecimal("40.00"), new BigDecimal("15.00")))
                .isEqualTo(new BigDecimal("95.00"));
    }

    @Test
    void decimalRatesStayExact() {
        assertThat(BookingStay.price(MON, MON.plusDays(3), new BigDecimal("33.30"), BigDecimal.ZERO))
                .isEqualTo(new BigDecimal("99.90"));
    }
}
```
`isEqualTo` on `BigDecimal` also checks the scale, so `99.9` would fail. The result must be exactly `99.90`.

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd api && ./mvnw -B test -Dtest=StayPriceTest`
Expected: compilation failure, `cannot find symbol: class BookingStay`.

- [ ] **Step 3: Create `Status` and its converter**

`booking/Status.java`:
```java
package com.ddpetcare.api.booking;

import java.util.Arrays;

public enum Status {
    CONFIRMED("confirmed"),
    CANCELLED("cancelled");

    private final String dbValue;

    Status(String dbValue) {
        this.dbValue = dbValue;
    }

    public String dbValue() {
        return dbValue;
    }

    static Status fromDbValue(String value) {
        return Arrays.stream(values())
                .filter(s -> s.dbValue.equals(value))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown status: " + value));
    }
}
```

`booking/StatusConverter.java`:
```java
package com.ddpetcare.api.booking;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter
public class StatusConverter implements AttributeConverter<Status, String> {

    @Override
    public String convertToDatabaseColumn(Status status) {
        return status.dbValue();
    }

    @Override
    public Status convertToEntityAttribute(String value) {
        return Status.fromDbValue(value);
    }
}
```

- [ ] **Step 4: Create the client-side entities**

`client/Client.java`:
```java
package com.ddpetcare.api.client;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(name = "clients")
public class Client {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;

    private String phone;

    @OneToMany(mappedBy = "client")
    @OrderBy("name")
    private List<Dog> dogs = new ArrayList<>();

    @CreationTimestamp
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;

    protected Client() {
    }

    public Client(String name, String phone) {
        this.name = name;
        this.phone = phone;
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getPhone() {
        return phone;
    }

    public List<Dog> getDogs() {
        return dogs;
    }
}
```

`client/Dog.java`:
```java
package com.ddpetcare.api.client;

import java.time.Instant;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(name = "dogs")
public class Dog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "client_id")
    private Client client;

    private String name;

    @CreationTimestamp
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;

    protected Dog() {
    }

    public Dog(Client client, String name) {
        this.client = client;
        this.name = name;
    }

    public Long getId() {
        return id;
    }

    public Client getClient() {
        return client;
    }

    public String getName() {
        return name;
    }
}
```

- [ ] **Step 5: Create the booking entities**

`booking/BookingStay.java`:
```java
package com.ddpetcare.api.booking;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;

import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(name = "booking_stays")
public class BookingStay {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "booking_id")
    private Booking booking;

    private LocalDate dropOffDate;
    private LocalTime dropOffTime;
    private LocalDate pickUpDate;
    private LocalTime pickUpTime;
    private BigDecimal unitRate;
    private BigDecimal pickupDropoffFee;
    private BigDecimal price;

    @Convert(converter = StatusConverter.class)
    private Status status = Status.CONFIRMED;

    @CreationTimestamp
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;

    protected BookingStay() {
    }

    BookingStay(Booking booking, LocalDate dropOffDate, LocalTime dropOffTime,
                LocalDate pickUpDate, LocalTime pickUpTime, BigDecimal unitRate, BigDecimal pickupDropoffFee) {
        this.booking = booking;
        this.dropOffDate = dropOffDate;
        this.dropOffTime = dropOffTime;
        this.pickUpDate = pickUpDate;
        this.pickUpTime = pickUpTime;
        this.unitRate = unitRate;
        this.pickupDropoffFee = pickupDropoffFee;
        this.price = price(dropOffDate, pickUpDate, unitRate, pickupDropoffFee);
    }

    // Must match the booking_stays_price_check constraint in V1.
    static BigDecimal price(LocalDate dropOffDate, LocalDate pickUpDate, BigDecimal unitRate, BigDecimal fee) {
        long units = Math.max(ChronoUnit.DAYS.between(dropOffDate, pickUpDate), 1);
        return unitRate.multiply(BigDecimal.valueOf(units)).add(fee).setScale(2, RoundingMode.UNNECESSARY);
    }

    public boolean isDayCare() {
        return dropOffDate.equals(pickUpDate);
    }

    public Long getId() {
        return id;
    }

    public LocalDate getDropOffDate() {
        return dropOffDate;
    }

    public LocalTime getDropOffTime() {
        return dropOffTime;
    }

    public LocalDate getPickUpDate() {
        return pickUpDate;
    }

    public LocalTime getPickUpTime() {
        return pickUpTime;
    }

    public BigDecimal getUnitRate() {
        return unitRate;
    }

    public BigDecimal getPickupDropoffFee() {
        return pickupDropoffFee;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public Status getStatus() {
        return status;
    }
}
```
`RoundingMode.UNNECESSARY` throws if rounding would be needed. That can't happen, because validation limits rates and fees to 2 decimals.

`booking/Booking.java`:
```java
package com.ddpetcare.api.booking;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

import com.ddpetcare.api.client.Client;
import com.ddpetcare.api.client.Dog;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(name = "bookings")
public class Booking {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "client_id")
    private Client client;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "dog_id")
    private Dog dog;

    @Convert(converter = StatusConverter.class)
    private Status status = Status.CONFIRMED;

    private String notes;

    private Instant paidAt;

    @OneToMany(mappedBy = "booking", cascade = CascadeType.PERSIST)
    @OrderBy("dropOffDate, id")
    private List<BookingStay> stays = new ArrayList<>();

    @CreationTimestamp
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;

    protected Booking() {
    }

    public Booking(Client client, Dog dog, String notes) {
        this.client = client;
        this.dog = dog;
        this.notes = notes;
    }

    public void addStay(LocalDate dropOffDate, LocalTime dropOffTime, LocalDate pickUpDate, LocalTime pickUpTime,
                        BigDecimal unitRate, BigDecimal pickupDropoffFee) {
        stays.add(new BookingStay(this, dropOffDate, dropOffTime, pickUpDate, pickUpTime, unitRate, pickupDropoffFee));
    }

    public void cancel() {
        status = Status.CANCELLED;
    }

    public BigDecimal total() {
        return stays.stream()
                .filter(stay -> stay.getStatus() == Status.CONFIRMED)
                .map(BookingStay::getPrice)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    public Long getId() {
        return id;
    }

    public Client getClient() {
        return client;
    }

    public Dog getDog() {
        return dog;
    }

    public Status getStatus() {
        return status;
    }

    public String getNotes() {
        return notes;
    }

    public Instant getPaidAt() {
        return paidAt;
    }

    public List<BookingStay> getStays() {
        return stays;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
```
`bookings` has a composite foreign key `(dog_id, client_id)`. Each association maps only its own column, and the database enforces that the dog belongs to the client.

- [ ] **Step 6: Create the repositories**

`client/ClientRepository.java`:
```java
package com.ddpetcare.api.client;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClientRepository extends JpaRepository<Client, Long> {

    Optional<Client> findByPhone(String phone);

    @EntityGraph(attributePaths = "dogs")
    List<Client> findAllByOrderByNameAscIdAsc();
}
```

`client/DogRepository.java`:
```java
package com.ddpetcare.api.client;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface DogRepository extends JpaRepository<Dog, Long> {

    // Same normalisation as the dogs_client_id_lower_name_key unique index.
    @Query("select d from Dog d where d.client = :client and lower(trim(d.name)) = lower(trim(:name))")
    Optional<Dog> findByClientAndName(Client client, String name);
}
```

`booking/BookingRepository.java`:
```java
package com.ddpetcare.api.booking;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BookingRepository extends JpaRepository<Booking, Long> {

    @EntityGraph(attributePaths = {"client", "dog", "stays"})
    List<Booking> findAllByOrderByCreatedAtDescIdDesc();

    @EntityGraph(attributePaths = {"client", "dog", "stays"})
    Optional<Booking> findWithDetailsById(Long id);
}
```

- [ ] **Step 7: Run the pricing test, then the whole suite**

Run: `cd api && ./mvnw -B test -Dtest=StayPriceTest`
Expected: 3 tests pass.

Run: `cd api && ./mvnw -B verify`
Expected: BUILD SUCCESS. Every Spring test starts Hibernate with `ddl-auto: validate`, which checks all four entities against the V1 tables. If validation fails on a column type (for example `text` vs `varchar`, or `timestamptz` vs `Instant`), stop and report the exact message. Don't change the schema or add `columnDefinition` without approval.

- [ ] **Step 8: Propose the commit and commit after approval**

```
feat(api): add JPA entities for clients, dogs and bookings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
Files: `api/pom.xml api/src/main/resources/application.yml api/src/test/resources/application-test.yml api/src/main/java/com/ddpetcare/api/booking api/src/main/java/com/ddpetcare/api/client api/src/test/java/com/ddpetcare/api/booking/StayPriceTest.java`

---

### Task 3: Test helpers

**Files:** modify `api/src/test/java/com/ddpetcare/api/DatabaseTest.java`; create `api/src/test/java/com/ddpetcare/api/TestRequests.java`

- [ ] **Step 1: Add MockMvc and helpers to `DatabaseTest`**

Replace the class header and fields (everything above `insertClient`) with:
```java
package com.ddpetcare.api;

import java.math.BigDecimal;
import java.time.LocalDate;

import com.jayway.jsonpath.JsonPath;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(CleanTestDatabase.class)
@Transactional
public abstract class DatabaseTest {

    @Autowired
    protected JdbcClient jdbc;

    @Autowired
    protected MockMvc mvc;

    @PersistenceContext
    protected EntityManager em;

    protected ResultActions getJson(String path) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.get(path));
    }

    protected ResultActions postJson(String path, String json) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.post(path).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    protected ResultActions postEmpty(String path) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.post(path));
    }

    protected static long idOf(ResultActions result) throws Exception {
        return ((Number) JsonPath.read(result.andReturn().getResponse().getContentAsString(), "$.id")).longValue();
    }

    // JPA updates are only written at flush; call this before reading them back with jdbc.
    protected void flushAndClear() {
        em.flush();
        em.clear();
    }
```
Keep `insertClient`, `insertDog`, `insertBooking` and `insertStay` unchanged below.

`@AutoConfigureMockMvc` sits on the base class so every test shares one Spring context. A second context would clean and re-migrate the test database again.

- [ ] **Step 2: Create `TestRequests`**

```java
package com.ddpetcare.api;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

public final class TestRequests {

    private TestRequests() {
    }

    public static String load(String name) {
        return load(name, Map.of());
    }

    /** Loads src/test/resources/requests/{name} and replaces each {{key}} with its value. */
    public static String load(String name, Map<String, Object> values) {
        try (InputStream in = TestRequests.class.getResourceAsStream("/requests/" + name)) {
            if (in == null) {
                throw new IllegalArgumentException("No request file: " + name);
            }
            String json = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            for (Map.Entry<String, Object> entry : values.entrySet()) {
                json = json.replace("{{" + entry.getKey() + "}}", String.valueOf(entry.getValue()));
            }
            if (json.contains("{{")) {
                throw new IllegalArgumentException("Unfilled placeholder in " + name);
            }
            return json;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
```

- [ ] **Step 3: Run the suite to confirm nothing broke**

Run: `cd api && ./mvnw -B verify`
Expected: BUILD SUCCESS, same test count.

---

### Task 4: `GET /clients`

**Files:** create `client/ClientResponse.java`, `client/ClientService.java`, `client/ClientController.java`; test `client/ListClientsTest.java`

- [ ] **Step 1: Write the failing test**

`api/src/test/java/com/ddpetcare/api/client/ListClientsTest.java`:
```java
package com.ddpetcare.api.client;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ddpetcare.api.DatabaseTest;
import org.junit.jupiter.api.Test;

class ListClientsTest extends DatabaseTest {

    @Test
    void listsClientsByNameWithTheirDogs() throws Exception {
        long zoe = insertClient("Zoe Hart", "+447700900111");
        insertDog(zoe, "Rex");
        insertDog(zoe, "Ace");
        insertClient("Amy Pond", null);

        getJson("/clients")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].name").value("Amy Pond"))
                .andExpect(jsonPath("$[0].phone").isEmpty())
                .andExpect(jsonPath("$[0].dogs.length()").value(0))
                .andExpect(jsonPath("$[1].id").value(zoe))
                .andExpect(jsonPath("$[1].phone").value("+447700900111"))
                .andExpect(jsonPath("$[1].dogs[0].name").value("Ace"))
                .andExpect(jsonPath("$[1].dogs[1].name").value("Rex"));
    }

    @Test
    void returnsEmptyListWhenNoClients() throws Exception {
        getJson("/clients")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd api && ./mvnw -B test -Dtest=ListClientsTest`
Expected: FAIL with status 404 (no handler for `/clients`).

- [ ] **Step 3: Implement**

`client/ClientResponse.java`:
```java
package com.ddpetcare.api.client;

import java.util.List;

public record ClientResponse(Long id, String name, String phone, List<DogResponse> dogs) {

    public record DogResponse(Long id, String name) {
    }

    static ClientResponse from(Client client) {
        return new ClientResponse(client.getId(), client.getName(), client.getPhone(),
                client.getDogs().stream().map(dog -> new DogResponse(dog.getId(), dog.getName())).toList());
    }
}
```

`client/ClientService.java`:
```java
package com.ddpetcare.api.client;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ClientService {

    private final ClientRepository clients;

    public ClientService(ClientRepository clients) {
        this.clients = clients;
    }

    @Transactional(readOnly = true)
    public List<ClientResponse> list() {
        return clients.findAllByOrderByNameAscIdAsc().stream().map(ClientResponse::from).toList();
    }
}
```

`client/ClientController.java`:
```java
package com.ddpetcare.api.client;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/clients")
public class ClientController {

    private final ClientService service;

    public ClientController(ClientService service) {
        this.service = service;
    }

    @GetMapping
    public List<ClientResponse> list() {
        return service.list();
    }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd api && ./mvnw -B test -Dtest=ListClientsTest`
Expected: 2 tests pass.

---

### Task 5: `POST /bookings` happy paths

**Files:** create `booking/CreateBookingRequest.java`, `booking/BookingResponse.java`, `booking/BookingService.java`, `booking/BookingController.java`, `error/NotFoundException.java`, `error/ApiExceptionHandler.java`; test `booking/CreateBookingTest.java`; request files `create-existing-client-new-dog.json`, `create-new-client-new-dog.json`

Request files live in `api/src/test/resources/requests/bookings/`.

- [ ] **Step 1: Write the request files**

`create-existing-client-new-dog.json`:
```json
{
  "client": { "id": {{clientId}} },
  "dog": { "name": "Biscuit" },
  "notes": "  Allergic to chicken  ",
  "stays": [
    { "dropOffDate": "2026-11-02", "dropOffTime": "09:00",
      "pickUpDate": "2026-11-04", "pickUpTime": null,
      "unitRate": 40.00, "pickupDropoffFee": 15.00 }
  ]
}
```

`create-new-client-new-dog.json`:
```json
{
  "client": { "name": "  Sarah Lee ", "phone": "+447700900123" },
  "dog": { "name": "Biscuit" },
  "stays": [
    { "dropOffDate": "2026-11-02", "dropOffTime": "09:00",
      "pickUpDate": "2026-11-04", "pickUpTime": null,
      "unitRate": 40.00, "pickupDropoffFee": 15.00 },
    { "dropOffDate": "2026-11-10", "dropOffTime": "08:00",
      "pickUpDate": "2026-11-10", "pickUpTime": "17:00",
      "unitRate": 35.00, "pickupDropoffFee": 0 }
  ]
}
```

- [ ] **Step 2: Write the failing test**

`api/src/test/java/com/ddpetcare/api/booking/CreateBookingTest.java`:
```java
package com.ddpetcare.api.booking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import com.ddpetcare.api.DatabaseTest;
import com.ddpetcare.api.TestRequests;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

class CreateBookingTest extends DatabaseTest {

    @Test
    void createsBookingForExistingClientWithNewDog() throws Exception {
        long client = insertClient("Sarah Lee", "+447700900123");

        ResultActions result = postJson("/bookings",
                TestRequests.load("bookings/create-existing-client-new-dog.json", Map.of("clientId", client)));

        long id = idOf(result);
        result.andExpect(status().isCreated())
                .andExpect(header().string("Location", "/bookings/" + id))
                .andExpect(jsonPath("$.status").value("confirmed"))
                .andExpect(jsonPath("$.notes").value("Allergic to chicken"))
                .andExpect(jsonPath("$.paidAt").value(nullValue()))
                .andExpect(jsonPath("$.createdAt").isNotEmpty())
                .andExpect(jsonPath("$.client.id").value(client))
                .andExpect(jsonPath("$.dog.name").value("Biscuit"))
                .andExpect(jsonPath("$.total").value(95.0))
                .andExpect(jsonPath("$.stays.length()").value(1))
                .andExpect(jsonPath("$.stays[0].id").isNumber())
                .andExpect(jsonPath("$.stays[0].service").value("boarding"))
                .andExpect(jsonPath("$.stays[0].dropOffDate").value("2026-11-02"))
                .andExpect(jsonPath("$.stays[0].dropOffTime").value("09:00"))
                .andExpect(jsonPath("$.stays[0].pickUpTime").value(nullValue()))
                .andExpect(jsonPath("$.stays[0].unitRate").value(40.0))
                .andExpect(jsonPath("$.stays[0].pickupDropoffFee").value(15.0))
                .andExpect(jsonPath("$.stays[0].price").value(95.0))
                .andExpect(jsonPath("$.stays[0].status").value("confirmed"));

        assertThat(jdbc.sql("SELECT count(*) FROM dogs WHERE client_id = ?").param(client)
                .query(Long.class).single()).isEqualTo(1);
    }

    @Test
    void createsNewClientAndDogWithSeveralStays() throws Exception {
        ResultActions result = postJson("/bookings", TestRequests.load("bookings/create-new-client-new-dog.json"));

        result.andExpect(status().isCreated())
                .andExpect(jsonPath("$.client.id").isNumber())
                .andExpect(jsonPath("$.client.name").value("Sarah Lee"))
                .andExpect(jsonPath("$.client.phone").value("+447700900123"))
                .andExpect(jsonPath("$.dog.id").isNumber())
                .andExpect(jsonPath("$.notes").value(nullValue()))
                .andExpect(jsonPath("$.total").value(130.0))
                .andExpect(jsonPath("$.stays.length()").value(2))
                .andExpect(jsonPath("$.stays[1].service").value("day_care"))
                .andExpect(jsonPath("$.stays[1].pickUpTime").value("17:00"))
                .andExpect(jsonPath("$.stays[1].price").value(35.0));

        assertThat(jdbc.sql("SELECT name FROM clients WHERE phone = '+447700900123'")
                .query(String.class).single()).isEqualTo("Sarah Lee");
        assertThat(jdbc.sql("SELECT count(*) FROM booking_stays WHERE booking_id = ?").param(idOf(result))
                .query(Long.class).single()).isEqualTo(2);
    }
}
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `cd api && ./mvnw -B test -Dtest=CreateBookingTest`
Expected: FAIL with status 404 (no handler for `/bookings`).

- [ ] **Step 4: Create the request record**

`booking/CreateBookingRequest.java`:
```java
package com.ddpetcare.api.booking;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public record CreateBookingRequest(
        @NotNull @Valid ClientRef client,
        @NotNull @Valid DogRef dog,
        String notes,
        @NotEmpty List<@NotNull @Valid StayRequest> stays) {

    /** An existing client ({@code id}) or a new one ({@code name}, optional {@code phone}). */
    public record ClientRef(
            Long id,
            String name,
            @Pattern(regexp = "^\\+[1-9][0-9]{7,14}$", message = "must be in international format, e.g. +447700900123")
            String phone) {

        @JsonIgnore
        @AssertTrue(message = "give either id, or name with an optional phone")
        public boolean isIdOrName() {
            return id != null ? name == null && phone == null : name != null;
        }

        @JsonIgnore
        @AssertTrue(message = "must not be blank")
        public boolean isNameNotBlank() {
            return name == null || !name.isBlank();
        }
    }

    /** An existing dog ({@code id}) or a new one ({@code name}). */
    public record DogRef(Long id, String name) {

        @JsonIgnore
        @AssertTrue(message = "give either id or name")
        public boolean isIdOrName() {
            return (id == null) != (name == null);
        }

        @JsonIgnore
        @AssertTrue(message = "must not be blank")
        public boolean isNameNotBlank() {
            return name == null || !name.isBlank();
        }
    }

    /** A null time means "time to be confirmed". */
    public record StayRequest(
            @NotNull LocalDate dropOffDate,
            LocalTime dropOffTime,
            @NotNull LocalDate pickUpDate,
            LocalTime pickUpTime,
            @NotNull @DecimalMin("0") @Digits(integer = 6, fraction = 2) BigDecimal unitRate,
            @NotNull @DecimalMin("0") @Digits(integer = 6, fraction = 2) BigDecimal pickupDropoffFee) {

        @JsonIgnore
        @AssertTrue(message = "pickUpDate must not be before dropOffDate")
        public boolean isPickUpOnOrAfterDropOff() {
            return dropOffDate == null || pickUpDate == null || !pickUpDate.isBefore(dropOffDate);
        }

        @JsonIgnore
        @AssertTrue(message = "on a same-day stay, pickUpTime must be after dropOffTime")
        public boolean isPickUpTimeAfterDropOffTime() {
            return dropOffDate == null || !dropOffDate.equals(pickUpDate)
                    || dropOffTime == null || pickUpTime == null
                    || pickUpTime.isAfter(dropOffTime);
        }
    }
}
```
`@JsonIgnore` keeps the rule methods out of the JSON and the OpenAPI schema. Bean Validation still sees them through their `is…` names, so they appear in errors as fields such as `client.idOrName` or `stays[0].pickUpOnOrAfterDropOff`.

- [ ] **Step 5: Create the response record**

`booking/BookingResponse.java`:
```java
package com.ddpetcare.api.booking;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonFormat;

public record BookingResponse(
        Long id,
        String status,
        String notes,
        Instant paidAt,
        Instant createdAt,
        ClientSummary client,
        DogSummary dog,
        BigDecimal total,
        List<StayResponse> stays) {

    public record ClientSummary(Long id, String name, String phone) {
    }

    public record DogSummary(Long id, String name) {
    }

    public record StayResponse(
            Long id,
            String service,
            LocalDate dropOffDate,
            @JsonFormat(pattern = "HH:mm") LocalTime dropOffTime,
            LocalDate pickUpDate,
            @JsonFormat(pattern = "HH:mm") LocalTime pickUpTime,
            BigDecimal unitRate,
            BigDecimal pickupDropoffFee,
            BigDecimal price,
            String status) {

        static StayResponse from(BookingStay stay) {
            return new StayResponse(stay.getId(), stay.isDayCare() ? "day_care" : "boarding",
                    stay.getDropOffDate(), stay.getDropOffTime(), stay.getPickUpDate(), stay.getPickUpTime(),
                    stay.getUnitRate(), stay.getPickupDropoffFee(), stay.getPrice(), stay.getStatus().dbValue());
        }
    }

    static BookingResponse from(Booking booking) {
        return new BookingResponse(
                booking.getId(),
                booking.getStatus().dbValue(),
                booking.getNotes(),
                booking.getPaidAt(),
                booking.getCreatedAt(),
                new ClientSummary(booking.getClient().getId(), booking.getClient().getName(),
                        booking.getClient().getPhone()),
                new DogSummary(booking.getDog().getId(), booking.getDog().getName()),
                booking.total(),
                booking.getStays().stream().map(StayResponse::from).toList());
    }
}
```

- [ ] **Step 6: Create `NotFoundException` and the exception handler**

`error/NotFoundException.java`:
```java
package com.ddpetcare.api.error;

public class NotFoundException extends RuntimeException {

    public NotFoundException(String message) {
        super(message);
    }
}
```

`error/ApiExceptionHandler.java`:
```java
package com.ddpetcare.api.error;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    @ExceptionHandler(NotFoundException.class)
    ProblemDetail notFound(NotFoundException ex) {
        return problem(HttpStatus.NOT_FOUND, "Not found", ex.getMessage());
    }

    private static ProblemDetail problem(HttpStatus status, String title, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(title);
        return problem;
    }
}
```
Extending `ResponseEntityExceptionHandler` makes Spring's own errors, such as malformed JSON, come back as `ProblemDetail` too.

- [ ] **Step 7: Create the service with simple client and dog resolution**

Task 6 replaces `resolveClient` and `resolveDog` with the full rules.

`booking/BookingService.java`:
```java
package com.ddpetcare.api.booking;

import com.ddpetcare.api.booking.CreateBookingRequest.ClientRef;
import com.ddpetcare.api.booking.CreateBookingRequest.DogRef;
import com.ddpetcare.api.booking.CreateBookingRequest.StayRequest;
import com.ddpetcare.api.client.Client;
import com.ddpetcare.api.client.ClientRepository;
import com.ddpetcare.api.client.Dog;
import com.ddpetcare.api.client.DogRepository;
import com.ddpetcare.api.error.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BookingService {

    private final BookingRepository bookings;
    private final ClientRepository clients;
    private final DogRepository dogs;

    public BookingService(BookingRepository bookings, ClientRepository clients, DogRepository dogs) {
        this.bookings = bookings;
        this.clients = clients;
        this.dogs = dogs;
    }

    @Transactional
    public BookingResponse create(CreateBookingRequest request) {
        Client client = resolveClient(request.client());
        Dog dog = resolveDog(client, request.dog());
        Booking booking = new Booking(client, dog, trimToNull(request.notes()));
        for (StayRequest stay : request.stays()) {
            booking.addStay(stay.dropOffDate(), stay.dropOffTime(), stay.pickUpDate(), stay.pickUpTime(),
                    stay.unitRate(), stay.pickupDropoffFee());
        }
        return BookingResponse.from(bookings.save(booking));
    }

    private Client resolveClient(ClientRef ref) {
        if (ref.id() != null) {
            return clients.findById(ref.id())
                    .orElseThrow(() -> new NotFoundException("Client " + ref.id() + " not found"));
        }
        return clients.save(new Client(ref.name().strip(), ref.phone()));
    }

    private Dog resolveDog(Client client, DogRef ref) {
        if (ref.id() != null) {
            return dogs.findById(ref.id())
                    .orElseThrow(() -> new NotFoundException("Dog " + ref.id() + " not found"));
        }
        return dogs.save(new Dog(client, ref.name().strip()));
    }

    private static String trimToNull(String text) {
        return text == null || text.isBlank() ? null : text.strip();
    }
}
```

- [ ] **Step 8: Create the controller**

`booking/BookingController.java`:
```java
package com.ddpetcare.api.booking;

import java.net.URI;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/bookings")
public class BookingController {

    private final BookingService service;

    public BookingController(BookingService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<BookingResponse> create(@Valid @RequestBody CreateBookingRequest request) {
        BookingResponse booking = service.create(request);
        return ResponseEntity.created(URI.create("/bookings/" + booking.id())).body(booking);
    }
}
```

- [ ] **Step 9: Run the test and confirm it passes**

Run: `cd api && ./mvnw -B test -Dtest=CreateBookingTest`
Expected: 2 tests pass. If `dropOffTime` comes back as `"09:00:00"`, `@JsonFormat` isn't being applied to the record component. Stop and report rather than changing the assertion.

---

### Task 6: Client and dog resolution rules

**Files:** create `error/InvalidRequestException.java`, `error/PhoneInUseException.java`; modify `error/ApiExceptionHandler.java`, `booking/BookingService.java`; test `booking/ClientAndDogResolutionTest.java`; request files below

- [ ] **Step 1: Write the request files**

In `api/src/test/resources/requests/bookings/`, each with this one stay:
```json
    { "dropOffDate": "2026-11-02", "dropOffTime": null,
      "pickUpDate": "2026-11-02", "pickUpTime": null,
      "unitRate": 35.00, "pickupDropoffFee": 0 }
```

`create-existing-client-existing-dog.json`:
```json
{
  "client": { "id": {{clientId}} },
  "dog": { "id": {{dogId}} },
  "stays": [
    { "dropOffDate": "2026-11-02", "dropOffTime": null,
      "pickUpDate": "2026-11-02", "pickUpTime": null,
      "unitRate": 35.00, "pickupDropoffFee": 0 }
  ]
}
```

`create-reuse-dog-different-case.json`:
```json
{
  "client": { "id": {{clientId}} },
  "dog": { "name": "  biscuit " },
  "stays": [
    { "dropOffDate": "2026-11-02", "dropOffTime": null,
      "pickUpDate": "2026-11-02", "pickUpTime": null,
      "unitRate": 35.00, "pickupDropoffFee": 0 }
  ]
}
```

`create-unknown-client.json`:
```json
{
  "client": { "id": 999999999 },
  "dog": { "name": "Biscuit" },
  "stays": [
    { "dropOffDate": "2026-11-02", "dropOffTime": null,
      "pickUpDate": "2026-11-02", "pickUpTime": null,
      "unitRate": 35.00, "pickupDropoffFee": 0 }
  ]
}
```

`create-unknown-dog.json`:
```json
{
  "client": { "id": {{clientId}} },
  "dog": { "id": 999999999 },
  "stays": [
    { "dropOffDate": "2026-11-02", "dropOffTime": null,
      "pickUpDate": "2026-11-02", "pickUpTime": null,
      "unitRate": 35.00, "pickupDropoffFee": 0 }
  ]
}
```

`create-dog-of-other-client.json`: identical to `create-existing-client-existing-dog.json` (the test supplies a dog from a different client):
```json
{
  "client": { "id": {{clientId}} },
  "dog": { "id": {{dogId}} },
  "stays": [
    { "dropOffDate": "2026-11-02", "dropOffTime": null,
      "pickUpDate": "2026-11-02", "pickUpTime": null,
      "unitRate": 35.00, "pickupDropoffFee": 0 }
  ]
}
```

`create-new-client-existing-dog.json`:
```json
{
  "client": { "name": "New Client" },
  "dog": { "id": {{dogId}} },
  "stays": [
    { "dropOffDate": "2026-11-02", "dropOffTime": null,
      "pickUpDate": "2026-11-02", "pickUpTime": null,
      "unitRate": 35.00, "pickupDropoffFee": 0 }
  ]
}
```

`create-phone-in-use.json`:
```json
{
  "client": { "name": "Sarah", "phone": "+447700900123" },
  "dog": { "name": "Biscuit" },
  "stays": [
    { "dropOffDate": "2026-11-02", "dropOffTime": null,
      "pickUpDate": "2026-11-02", "pickUpTime": null,
      "unitRate": 35.00, "pickupDropoffFee": 0 }
  ]
}
```

- [ ] **Step 2: Write the failing tests**

`api/src/test/java/com/ddpetcare/api/booking/ClientAndDogResolutionTest.java`:
```java
package com.ddpetcare.api.booking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import com.ddpetcare.api.DatabaseTest;
import com.ddpetcare.api.TestRequests;
import org.junit.jupiter.api.Test;

class ClientAndDogResolutionTest extends DatabaseTest {

    @Test
    void usesExistingClientAndDog() throws Exception {
        long client = insertClient("Sarah Lee", null);
        long dog = insertDog(client, "Biscuit");

        postJson("/bookings", TestRequests.load("bookings/create-existing-client-existing-dog.json",
                Map.of("clientId", client, "dogId", dog)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.client.id").value(client))
                .andExpect(jsonPath("$.dog.id").value(dog));
    }

    @Test
    void reusesDogWithSameNameIgnoringCaseAndSpaces() throws Exception {
        long client = insertClient("Sarah Lee", null);
        long dog = insertDog(client, "Biscuit");

        postJson("/bookings", TestRequests.load("bookings/create-reuse-dog-different-case.json",
                Map.of("clientId", client)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.dog.id").value(dog))
                .andExpect(jsonPath("$.dog.name").value("Biscuit"));

        assertThat(jdbc.sql("SELECT count(*) FROM dogs WHERE client_id = ?").param(client)
                .query(Long.class).single()).isEqualTo(1);
    }

    @Test
    void unknownClientIsNotFound() throws Exception {
        postJson("/bookings", TestRequests.load("bookings/create-unknown-client.json"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.title").value("Not found"))
                .andExpect(jsonPath("$.detail").value("Client 999999999 not found"));
    }

    @Test
    void unknownDogIsNotFound() throws Exception {
        long client = insertClient("Sarah Lee", null);

        postJson("/bookings", TestRequests.load("bookings/create-unknown-dog.json", Map.of("clientId", client)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Dog 999999999 not found"));
    }

    @Test
    void rejectsDogOfAnotherClient() throws Exception {
        long sarah = insertClient("Sarah Lee", null);
        long tom = insertClient("Tom Hall", null);
        long tomsDog = insertDog(tom, "Rex");

        postJson("/bookings", TestRequests.load("bookings/create-dog-of-other-client.json",
                Map.of("clientId", sarah, "dogId", tomsDog)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Invalid request"))
                .andExpect(jsonPath("$.detail").value(containsString("does not belong")));
    }

    @Test
    void rejectsNewClientWithExistingDog() throws Exception {
        long tom = insertClient("Tom Hall", null);
        long tomsDog = insertDog(tom, "Rex");

        postJson("/bookings", TestRequests.load("bookings/create-new-client-existing-dog.json",
                Map.of("dogId", tomsDog)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(containsString("does not belong")));
    }

    @Test
    void rejectsNewClientWhosePhoneIsAlreadyOnFile() throws Exception {
        long existing = insertClient("Sarah Lee", "+447700900123");

        postJson("/bookings", TestRequests.load("bookings/create-phone-in-use.json"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.title").value("Phone already on file"))
                .andExpect(jsonPath("$.existingClient.id").value(existing))
                .andExpect(jsonPath("$.existingClient.name").value("Sarah Lee"));

        assertThat(jdbc.sql("SELECT count(*) FROM clients").query(Long.class).single()).isEqualTo(1);
    }
}
```

- [ ] **Step 3: Run them and confirm the right ones fail**

Run: `cd api && ./mvnw -B test -Dtest=ClientAndDogResolutionTest`
Expected: `usesExistingClientAndDog`, `unknownClientIsNotFound` and `unknownDogIsNotFound` pass. The other four error out with an unhandled `DataIntegrityViolationException`; MockMvc rethrows it instead of returning a status:
- `reusesDog…`: the dog-name unique index.
- `rejectsDogOfAnotherClient` and `rejectsNewClientWithExistingDog`: the composite foreign key.
- `rejectsNewClientWhosePhone…`: `clients_phone_key`.

- [ ] **Step 4: Add the two exceptions**

`error/InvalidRequestException.java`:
```java
package com.ddpetcare.api.error;

public class InvalidRequestException extends RuntimeException {

    public InvalidRequestException(String message) {
        super(message);
    }
}
```

`error/PhoneInUseException.java`:
```java
package com.ddpetcare.api.error;

public class PhoneInUseException extends RuntimeException {

    private final long clientId;
    private final String clientName;

    public PhoneInUseException(long clientId, String clientName) {
        super("This phone number already belongs to " + clientName + ". Book for that client instead.");
        this.clientId = clientId;
        this.clientName = clientName;
    }

    public long getClientId() {
        return clientId;
    }

    public String getClientName() {
        return clientName;
    }
}
```

- [ ] **Step 5: Map them in `ApiExceptionHandler`**

Add these imports:
```java
import java.util.Map;
```
Add these methods after `notFound`:
```java
    @ExceptionHandler(InvalidRequestException.class)
    ProblemDetail invalid(InvalidRequestException ex) {
        return problem(HttpStatus.BAD_REQUEST, "Invalid request", ex.getMessage());
    }

    @ExceptionHandler(PhoneInUseException.class)
    ProblemDetail phoneInUse(PhoneInUseException ex) {
        ProblemDetail problem = problem(HttpStatus.CONFLICT, "Phone already on file", ex.getMessage());
        problem.setProperty("existingClient", Map.of("id", ex.getClientId(), "name", ex.getClientName()));
        return problem;
    }
```

- [ ] **Step 6: Replace `resolveClient` and `resolveDog` in `BookingService`**

Add these imports:
```java
import com.ddpetcare.api.error.InvalidRequestException;
import com.ddpetcare.api.error.PhoneInUseException;
```
Replace both methods with:
```java
    private Client resolveClient(ClientRef ref) {
        if (ref.id() != null) {
            return clients.findById(ref.id())
                    .orElseThrow(() -> new NotFoundException("Client " + ref.id() + " not found"));
        }
        if (ref.phone() != null) {
            clients.findByPhone(ref.phone()).ifPresent(existing -> {
                throw new PhoneInUseException(existing.getId(), existing.getName());
            });
        }
        return clients.save(new Client(ref.name().strip(), ref.phone()));
    }

    private Dog resolveDog(Client client, DogRef ref) {
        if (ref.id() != null) {
            Dog dog = dogs.findById(ref.id())
                    .orElseThrow(() -> new NotFoundException("Dog " + ref.id() + " not found"));
            if (!dog.getClient().getId().equals(client.getId())) {
                throw new InvalidRequestException(
                        "Dog " + dog.getId() + " does not belong to client " + client.getId());
            }
            return dog;
        }
        String name = ref.name().strip();
        return dogs.findByClientAndName(client, name).orElseGet(() -> dogs.save(new Dog(client, name)));
    }
```
For a new client paired with an existing dog `id`, the new client's id never matches the dog's owner, so the same check rejects it.

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `cd api && ./mvnw -B test -Dtest='ClientAndDogResolutionTest,CreateBookingTest'`
Expected: 9 tests pass.

---

### Task 7: Request validation

**Files:** modify `error/ApiExceptionHandler.java`; test `booking/CreateBookingValidationTest.java`; request files below

- [ ] **Step 1: Write the request files**

None use placeholders: every file describes a new client, so the test needs no setup rows. Each is otherwise a valid request with exactly one problem.

`create-no-stays.json`:
```json
{
  "client": { "name": "Sarah Lee" },
  "dog": { "name": "Biscuit" },
  "stays": []
}
```

`create-client-id-and-name.json`:
```json
{
  "client": { "id": 1, "name": "Sarah Lee" },
  "dog": { "name": "Biscuit" },
  "stays": [
    { "dropOffDate": "2026-11-02", "dropOffTime": null,
      "pickUpDate": "2026-11-02", "pickUpTime": null,
      "unitRate": 35.00, "pickupDropoffFee": 0 }
  ]
}
```

`create-dog-without-id-or-name.json`:
```json
{
  "client": { "name": "Sarah Lee" },
  "dog": { },
  "stays": [
    { "dropOffDate": "2026-11-02", "dropOffTime": null,
      "pickUpDate": "2026-11-02", "pickUpTime": null,
      "unitRate": 35.00, "pickupDropoffFee": 0 }
  ]
}
```

`create-blank-dog-name.json`:
```json
{
  "client": { "name": "Sarah Lee" },
  "dog": { "name": "   " },
  "stays": [
    { "dropOffDate": "2026-11-02", "dropOffTime": null,
      "pickUpDate": "2026-11-02", "pickUpTime": null,
      "unitRate": 35.00, "pickupDropoffFee": 0 }
  ]
}
```

`create-bad-phone.json`:
```json
{
  "client": { "name": "Sarah Lee", "phone": "07700900123" },
  "dog": { "name": "Biscuit" },
  "stays": [
    { "dropOffDate": "2026-11-02", "dropOffTime": null,
      "pickUpDate": "2026-11-02", "pickUpTime": null,
      "unitRate": 35.00, "pickupDropoffFee": 0 }
  ]
}
```

`create-missing-pickup-date.json`:
```json
{
  "client": { "name": "Sarah Lee" },
  "dog": { "name": "Biscuit" },
  "stays": [
    { "dropOffDate": "2026-11-02", "dropOffTime": null,
      "pickUpTime": null,
      "unitRate": 35.00, "pickupDropoffFee": 0 }
  ]
}
```

`create-pickup-before-dropoff.json`:
```json
{
  "client": { "name": "Sarah Lee" },
  "dog": { "name": "Biscuit" },
  "stays": [
    { "dropOffDate": "2026-11-04", "dropOffTime": null,
      "pickUpDate": "2026-11-02", "pickUpTime": null,
      "unitRate": 40.00, "pickupDropoffFee": 0 }
  ]
}
```

`create-same-day-pickup-before-dropoff.json`:
```json
{
  "client": { "name": "Sarah Lee" },
  "dog": { "name": "Biscuit" },
  "stays": [
    { "dropOffDate": "2026-11-02", "dropOffTime": "10:00",
      "pickUpDate": "2026-11-02", "pickUpTime": "09:00",
      "unitRate": 35.00, "pickupDropoffFee": 0 }
  ]
}
```

`create-negative-rate.json`:
```json
{
  "client": { "name": "Sarah Lee" },
  "dog": { "name": "Biscuit" },
  "stays": [
    { "dropOffDate": "2026-11-02", "dropOffTime": null,
      "pickUpDate": "2026-11-02", "pickUpTime": null,
      "unitRate": -1.00, "pickupDropoffFee": 0 }
  ]
}
```

`create-rate-three-decimals.json`:
```json
{
  "client": { "name": "Sarah Lee" },
  "dog": { "name": "Biscuit" },
  "stays": [
    { "dropOffDate": "2026-11-02", "dropOffTime": null,
      "pickUpDate": "2026-11-02", "pickUpTime": null,
      "unitRate": 35.005, "pickupDropoffFee": 0 }
  ]
}
```

`create-negative-fee.json`:
```json
{
  "client": { "name": "Sarah Lee" },
  "dog": { "name": "Biscuit" },
  "stays": [
    { "dropOffDate": "2026-11-02", "dropOffTime": null,
      "pickUpDate": "2026-11-02", "pickUpTime": null,
      "unitRate": 35.00, "pickupDropoffFee": -5 }
  ]
}
```

`create-malformed.json` (deliberately not valid JSON):
```
{ "client": { "name": "Sarah Lee" },
```

- [ ] **Step 2: Write the failing tests**

`api/src/test/java/com/ddpetcare/api/booking/CreateBookingValidationTest.java`:
```java
package com.ddpetcare.api.booking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ddpetcare.api.DatabaseTest;
import com.ddpetcare.api.TestRequests;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class CreateBookingValidationTest extends DatabaseTest {

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource({
            "create-no-stays.json,                         stays",
            "create-client-id-and-name.json,               client.idOrName",
            "create-dog-without-id-or-name.json,           dog.idOrName",
            "create-blank-dog-name.json,                   dog.nameNotBlank",
            "create-bad-phone.json,                        client.phone",
            "create-missing-pickup-date.json,              stays[0].pickUpDate",
            "create-pickup-before-dropoff.json,            stays[0].pickUpOnOrAfterDropOff",
            "create-same-day-pickup-before-dropoff.json,   stays[0].pickUpTimeAfterDropOffTime",
            "create-negative-rate.json,                    stays[0].unitRate",
            "create-rate-three-decimals.json,              stays[0].unitRate",
            "create-negative-fee.json,                     stays[0].pickupDropoffFee",
    })
    void rejectsInvalidRequest(String file, String field) throws Exception {
        postJson("/bookings", TestRequests.load("bookings/" + file))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Invalid request"))
                .andExpect(jsonPath("$.errors[*].field").value(hasItem(field)));

        assertThat(jdbc.sql("SELECT count(*) FROM clients").query(Long.class).single()).isZero();
    }

    @Test
    void rejectsMalformedJson() throws Exception {
        postJson("/bookings", TestRequests.load("bookings/create-malformed.json"))
                .andExpect(status().isBadRequest());
    }
}
```
`spring-boot-starter-test` already includes `junit-jupiter-params`, so `@ParameterizedTest` needs no new dependency.

- [ ] **Step 3: Run them and confirm they fail**

Run: `cd api && ./mvnw -B test -Dtest=CreateBookingValidationTest`
Expected: `rejectsMalformedJson` passes (`ResponseEntityExceptionHandler` already handles it). Every parameterized case fails on `$.title` or `$.errors`: Spring's default body has neither.

- [ ] **Step 4: Override validation errors in `ApiExceptionHandler`**

Add these imports:
```java
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.context.request.WebRequest;
```
Add this method:
```java
    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        ProblemDetail problem = ex.getBody();
        problem.setTitle("Invalid request");
        problem.setProperty("errors", ex.getBindingResult().getFieldErrors().stream()
                .map(error -> Map.of("field", error.getField(), "message", String.valueOf(error.getDefaultMessage())))
                .toList());
        return handleExceptionInternal(ex, problem, headers, status, request);
    }
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `cd api && ./mvnw -B test -Dtest=CreateBookingValidationTest`
Expected: 12 tests pass.

Most likely failure: a `NotReadablePropertyException` while Spring builds the field errors for nested records (`client.idOrName`). If that happens, stop and report the stack trace. The fix is a design choice (for example a `@JsonIgnore`-free getter, or reading Bean Validation violations directly), not something to guess.

---

### Task 8: A failed create saves nothing

**Files:** test `booking/CreateBookingRollbackTest.java`; request file `create-new-client-unknown-dog.json`

- [ ] **Step 1: Write the request file**

`create-new-client-unknown-dog.json`:
```json
{
  "client": { "name": "Rollback Client", "phone": "+447700900999" },
  "dog": { "id": 999999999 },
  "stays": [
    { "dropOffDate": "2026-11-02", "dropOffTime": null,
      "pickUpDate": "2026-11-02", "pickUpTime": null,
      "unitRate": 35.00, "pickupDropoffFee": 0 }
  ]
}
```
The service creates the new client first, then fails to find the dog. So the client row exists for a moment and must be rolled back.

- [ ] **Step 2: Write the test**

`api/src/test/java/com/ddpetcare/api/booking/CreateBookingRollbackTest.java`:
```java
package com.ddpetcare.api.booking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ddpetcare.api.DatabaseTest;
import com.ddpetcare.api.TestRequests;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// Runs outside the test transaction so the service's own transaction really commits or rolls back.
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class CreateBookingRollbackTest extends DatabaseTest {

    @Test
    void failureAfterCreatingClientLeavesNoRows() throws Exception {
        postJson("/bookings", TestRequests.load("bookings/create-new-client-unknown-dog.json"))
                .andExpect(status().isNotFound());

        assertThat(jdbc.sql("SELECT count(*) FROM clients WHERE phone = '+447700900999'")
                .query(Long.class).single()).isZero();
        assertThat(jdbc.sql("SELECT count(*) FROM bookings").query(Long.class).single()).isZero();
    }
}
```

- [ ] **Step 3: Run it**

Run: `cd api && ./mvnw -B test -Dtest=CreateBookingRollbackTest`
Expected: PASS. The behaviour already exists (the service is `@Transactional`), so this test guards it rather than driving new code. To prove it guards something, temporarily remove `@Transactional` from `BookingService.create`, re-run, and confirm it fails on the client count. Then restore it.

- [ ] **Step 4: Run the whole suite**

Run: `cd api && ./mvnw -B verify`
Expected: BUILD SUCCESS.

- [ ] **Step 5: Propose the commit and commit after approval**

```
feat(api): add create booking and list clients endpoints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
Files: `api/src/main/java api/src/test`

---

### Task 9: `GET /bookings` and `GET /bookings/{id}`

**Files:** modify `booking/BookingService.java`, `booking/BookingController.java`; test `booking/ListBookingsTest.java`

- [ ] **Step 1: Write the failing tests**

`api/src/test/java/com/ddpetcare/api/booking/ListBookingsTest.java`:
```java
package com.ddpetcare.api.booking;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;

import com.ddpetcare.api.DatabaseTest;
import org.junit.jupiter.api.Test;

class ListBookingsTest extends DatabaseTest {

    private static final LocalDate MON = LocalDate.of(2026, 11, 2);

    @Test
    void listsNewestFirstWithClientDogAndStays() throws Exception {
        long client = insertClient("Sarah Lee", null);
        long dog = insertDog(client, "Biscuit");
        long older = insertBooking(client, dog);
        insertStay(older, MON, MON, "35.00", "0", "35.00");
        long newer = insertBooking(client, dog);
        insertStay(newer, MON, MON.plusDays(2), "40.00", "0", "80.00");
        insertStay(newer, MON.plusDays(7), MON.plusDays(7), "35.00", "0", "35.00");

        getJson("/bookings")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].id").value(newer))
                .andExpect(jsonPath("$[0].client.name").value("Sarah Lee"))
                .andExpect(jsonPath("$[0].dog.name").value("Biscuit"))
                .andExpect(jsonPath("$[0].stays.length()").value(2))
                .andExpect(jsonPath("$[0].total").value(115.0))
                .andExpect(jsonPath("$[1].id").value(older));
    }

    @Test
    void returnsEmptyListWhenNoBookings() throws Exception {
        getJson("/bookings")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void getsOneBookingWithDerivedServiceAndTimes() throws Exception {
        long client = insertClient("Sarah Lee", null);
        long booking = insertBooking(client, insertDog(client, "Biscuit"));
        long dayCare = insertStay(booking, MON, MON, "35.00", "0", "35.00");
        insertStay(booking, MON.plusDays(7), MON.plusDays(9), "40.00", "15.00", "95.00");
        jdbc.sql("UPDATE booking_stays SET drop_off_time = '09:00', pick_up_time = '17:30' WHERE id = ?")
                .param(dayCare).update();

        getJson("/bookings/" + booking)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(booking))
                .andExpect(jsonPath("$.stays[0].service").value("day_care"))
                .andExpect(jsonPath("$.stays[0].dropOffTime").value("09:00"))
                .andExpect(jsonPath("$.stays[0].pickUpTime").value("17:30"))
                .andExpect(jsonPath("$.stays[1].service").value("boarding"))
                .andExpect(jsonPath("$.total").value(130.0));
    }

    @Test
    void totalExcludesCancelledStays() throws Exception {
        long client = insertClient("Sarah Lee", null);
        long booking = insertBooking(client, insertDog(client, "Biscuit"));
        insertStay(booking, MON, MON, "35.00", "0", "35.00");
        long cancelled = insertStay(booking, MON.plusDays(1), MON.plusDays(1), "35.00", "0", "35.00");
        jdbc.sql("UPDATE booking_stays SET status = 'cancelled' WHERE id = ?").param(cancelled).update();

        getJson("/bookings/" + booking)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(35.0))
                .andExpect(jsonPath("$.stays[1].status").value("cancelled"));
    }

    @Test
    void unknownBookingIsNotFound() throws Exception {
        getJson("/bookings/999999999")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Booking 999999999 not found"));
    }
}
```
`insertBooking` rows in one test share `created_at` (`now()` is the transaction start), so `listsNewestFirst…` depends on the `id` tie-breaker.

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd api && ./mvnw -B test -Dtest=ListBookingsTest`
Expected: FAIL. `GET /bookings` returns 405 Method Not Allowed: the path exists for `POST` only.

- [ ] **Step 3: Add `list` and `get` to `BookingService`**

Add this import:
```java
import java.util.List;
```
Add these methods after `create`:
```java
    @Transactional(readOnly = true)
    public List<BookingResponse> list() {
        return bookings.findAllByOrderByCreatedAtDescIdDesc().stream().map(BookingResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public BookingResponse get(long id) {
        return BookingResponse.from(findWithDetails(id));
    }

    private Booking findWithDetails(long id) {
        return bookings.findWithDetailsById(id)
                .orElseThrow(() -> new NotFoundException("Booking " + id + " not found"));
    }
```

- [ ] **Step 4: Add the endpoints to `BookingController`**

Add these imports:
```java
import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
```
Add these methods:
```java
    @GetMapping
    public List<BookingResponse> list() {
        return service.list();
    }

    @GetMapping("/{id}")
    public BookingResponse get(@PathVariable long id) {
        return service.get(id);
    }
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `cd api && ./mvnw -B test -Dtest=ListBookingsTest`
Expected: 5 tests pass.

---

### Task 10: `POST /bookings/{id}/cancel`

**Files:** modify `booking/BookingService.java`, `booking/BookingController.java`; test `booking/CancelBookingTest.java`

- [ ] **Step 1: Write the failing tests**

`api/src/test/java/com/ddpetcare/api/booking/CancelBookingTest.java`:
```java
package com.ddpetcare.api.booking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;

import com.ddpetcare.api.DatabaseTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class CancelBookingTest extends DatabaseTest {

    private static final LocalDate MON = LocalDate.of(2026, 11, 2);

    private long booking;

    @BeforeEach
    void createBooking() {
        long client = insertClient("Sarah Lee", null);
        booking = insertBooking(client, insertDog(client, "Biscuit"));
        insertStay(booking, MON, MON, "35.00", "0", "35.00");
    }

    @Test
    void cancelsTheBooking() throws Exception {
        postEmpty("/bookings/" + booking + "/cancel")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(booking))
                .andExpect(jsonPath("$.status").value("cancelled"));

        flushAndClear();
        assertThat(jdbc.sql("SELECT status FROM bookings WHERE id = ?").param(booking)
                .query(String.class).single()).isEqualTo("cancelled");
    }

    @Test
    void cancellingTwiceIsHarmless() throws Exception {
        postEmpty("/bookings/" + booking + "/cancel").andExpect(status().isOk());

        postEmpty("/bookings/" + booking + "/cancel")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("cancelled"));
    }

    @Test
    void cancelUpdatesUpdatedAt() throws Exception {
        jdbc.sql("UPDATE bookings SET updated_at = '2000-01-01T00:00:00Z' WHERE id = ?").param(booking).update();

        postEmpty("/bookings/" + booking + "/cancel").andExpect(status().isOk());

        flushAndClear();
        Instant updatedAt = jdbc.sql("SELECT updated_at FROM bookings WHERE id = ?").param(booking)
                .query(OffsetDateTime.class).single().toInstant();
        assertThat(updatedAt).isAfter(Instant.parse("2000-01-02T00:00:00Z"));
    }

    @Test
    void cancelledBookingStillAppearsInList() throws Exception {
        postEmpty("/bookings/" + booking + "/cancel").andExpect(status().isOk());

        getJson("/bookings")
                .andExpect(jsonPath("$[0].id").value(booking))
                .andExpect(jsonPath("$[0].status").value("cancelled"));
    }

    @Test
    void unknownBookingIsNotFound() throws Exception {
        postEmpty("/bookings/999999999/cancel")
                .andExpect(status().isNotFound());
    }
}
```
`updated_at` is first forced back to 2000 because `now()` in SQL equals the test transaction's start time. Comparing against `created_at` would prove nothing.

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd api && ./mvnw -B test -Dtest=CancelBookingTest`
Expected: FAIL with 404 (no handler for `/bookings/{id}/cancel`). `unknownBookingIsNotFound` passes by accident; that's fine.

- [ ] **Step 3: Add `cancel` to `BookingService`**

Add after `get`:
```java
    @Transactional
    public BookingResponse cancel(long id) {
        Booking booking = findWithDetails(id);
        booking.cancel();
        return BookingResponse.from(booking);
    }
```

- [ ] **Step 4: Add the endpoint to `BookingController`**

Add:
```java
    @PostMapping("/{id}/cancel")
    public BookingResponse cancel(@PathVariable long id) {
        return service.cancel(id);
    }
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `cd api && ./mvnw -B test -Dtest=CancelBookingTest`
Expected: 5 tests pass.

---

### Task 11: Listing doesn't do N+1 queries

**Files:** test `booking/BookingQueryCountTest.java`

- [ ] **Step 1: Write the test**

`api/src/test/java/com/ddpetcare/api/booking/BookingQueryCountTest.java`:
```java
package com.ddpetcare.api.booking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;

import com.ddpetcare.api.DatabaseTest;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class BookingQueryCountTest extends DatabaseTest {

    private static final LocalDate MON = LocalDate.of(2026, 11, 2);

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @Test
    void listingFiveBookingsUsesNoMoreQueriesThanOne() throws Exception {
        long client = insertClient("Sarah Lee", null);
        long dog = insertDog(client, "Biscuit");
        insertBookingWithStay(client, dog);
        long forOne = queriesToList();

        for (int i = 0; i < 4; i++) {
            insertBookingWithStay(client, dog);
        }
        long forFive = queriesToList();

        assertThat(forFive).isEqualTo(forOne);
    }

    private void insertBookingWithStay(long client, long dog) {
        insertStay(insertBooking(client, dog), MON, MON, "35.00", "0", "35.00");
    }

    private long queriesToList() throws Exception {
        em.clear();
        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.clear();
        getJson("/bookings").andExpect(status().isOk());
        return statistics.getPrepareStatementCount();
    }
}
```

- [ ] **Step 2: Run it**

Run: `cd api && ./mvnw -B test -Dtest=BookingQueryCountTest`
Expected: PASS. The entity graph from Task 2 already prevents N+1. To prove the test guards something, temporarily remove the `@EntityGraph` line above `findAllByOrderByCreatedAtDescIdDesc`, re-run, and confirm it fails (more queries for five bookings than for one). Then restore it.

---

### Task 12: OpenAPI and constraint-violation mapping

**Files:** modify `error/ApiExceptionHandler.java`; tests `OpenApiTest.java`, `error/ApiExceptionHandlerTest.java`

- [ ] **Step 1: Write the OpenAPI test**

`api/src/test/java/com/ddpetcare/api/OpenApiTest.java`:
```java
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
```
The last line checks that `@JsonIgnore` kept the validation methods out of the request schema the frontend will generate types from.

- [ ] **Step 2: Run it**

Run: `cd api && ./mvnw -B test -Dtest=OpenApiTest`
Expected: PASS. springdoc picks up the controllers automatically.

- [ ] **Step 3: Write the failing handler test**

`api/src/test/java/com/ddpetcare/api/error/ApiExceptionHandlerTest.java`:
```java
package com.ddpetcare.api.error;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ProblemDetail;

class ApiExceptionHandlerTest {

    private final ApiExceptionHandler handler = new ApiExceptionHandler();

    @Test
    void duplicatePhoneFromTheDatabaseIsAConflict() {
        ProblemDetail problem = handler.dataIntegrity(new DataIntegrityViolationException(
                "ERROR: duplicate key value violates unique constraint \"clients_phone_key\""));

        assertThat(problem.getStatus()).isEqualTo(409);
        assertThat(problem.getTitle()).isEqualTo("Phone already on file");
    }

    @Test
    void anyOtherConstraintViolationIsAServerError() {
        ProblemDetail problem = handler.dataIntegrity(new DataIntegrityViolationException(
                "ERROR: new row violates check constraint \"booking_stays_price_check\""));

        assertThat(problem.getStatus()).isEqualTo(500);
    }
}
```

- [ ] **Step 4: Run it and confirm it fails**

Run: `cd api && ./mvnw -B test -Dtest=ApiExceptionHandlerTest`
Expected: compilation failure, `cannot find symbol: method dataIntegrity`.

- [ ] **Step 5: Add the handler method**

Add these imports to `ApiExceptionHandler`:
```java
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
```
Add this field at the top of the class:
```java
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);
```
Add this method:
```java
    // A duplicate phone reaching the database means two creates raced past the service's check.
    @ExceptionHandler(DataIntegrityViolationException.class)
    ProblemDetail dataIntegrity(DataIntegrityViolationException ex) {
        if (String.valueOf(ex.getMostSpecificCause().getMessage()).contains("clients_phone_key")) {
            return problem(HttpStatus.CONFLICT, "Phone already on file",
                    "This phone number already belongs to another client.");
        }
        log.error("Constraint violation not caught by validation", ex);
        return problem(HttpStatus.INTERNAL_SERVER_ERROR, "Internal error", "Something went wrong.");
    }
```
`ResponseEntityExceptionHandler` declares a `logger` field already. Using a separately named `log` field avoids shadowing it.

- [ ] **Step 6: Run the whole suite**

Run: `cd api && ./mvnw -B verify`
Expected: BUILD SUCCESS. The test count is the previous total plus: `ListClientsTest` 2, `CreateBookingTest` 2, `ClientAndDogResolutionTest` 7, `CreateBookingValidationTest` 12, `CreateBookingRollbackTest` 1, `ListBookingsTest` 5, `CancelBookingTest` 5, `BookingQueryCountTest` 1, `OpenApiTest` 1, `ApiExceptionHandlerTest` 2, `StayPriceTest` 3.

- [ ] **Step 7: Start the app against the dev database and smoke-test it**

Run `cd api && ./mvnw -B spring-boot:run` in the background, then:
```bash
curl -s localhost:8080/actuator/health
curl -s localhost:8080/clients
curl -s localhost:8080/bookings
```
Expected: `{"status":"UP"}`, then `[]` twice (the dev database is empty). Stop the app. Don't POST to the dev database; that's the project owner's data.

- [ ] **Step 8: Propose the commit and commit after approval**

```
feat(api): add booking list, detail and cancel endpoints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
Files: `api/src/main/java api/src/test`

---

### Task 13: Docs

**Files:** `api/CLAUDE.md`

- [ ] **Step 1: Update `api/CLAUDE.md`**

- **Stack:** replace "Spring JDBC, Flyway, PostgreSQL driver (no JPA yet)" with "Spring Data JPA (Hibernate), Bean Validation, Flyway, PostgreSQL driver".
- **Current state:** replace the paragraph with: "Endpoints: `GET /clients`, `POST /bookings`, `GET /bookings`, `GET /bookings/{id}`, `POST /bookings/{id}/cancel` (design in `docs/superpowers/specs/2026-10-30-booking-api-design.md`). `blocked_dates` has no entity yet."
- **New `## Code conventions` section:**
  - Packages by feature (`client`, `booking`, `error`). Controller → service → repository.
  - Controllers take and return records; entities never leave a service.
  - Hibernate runs with `ddl-auto: validate`. It checks entities against Flyway's tables and never changes them.
  - `open-in-view` is off: load everything a response needs inside the service transaction, with an `@EntityGraph` for collections.
  - Money is `BigDecimal`.
  - Errors are `ProblemDetail`, via `error/ApiExceptionHandler`.
- **New lines under "Database":**
  - Test classes are split by behaviour (one class per behaviour, in the feature's package).
  - Request bodies live in `src/test/resources/requests/<feature>/<scenario>.json`, loaded with `TestRequests.load(name, Map.of(...))`. Runtime ids are written as `{{placeholders}}`.
  - In tests, JPA updates aren't written until flush. Call `flushAndClear()` before reading them back with `jdbc`.

- [ ] **Step 2: Propose the commit and commit after approval**

```
docs(api): document JPA and test conventions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
Files: `api/CLAUDE.md docs/superpowers/plans/2026-10-30-booking-api.md docs/superpowers/specs/2026-10-30-booking-api-design.md`

---

## Known risks to report at the end

- **Hibernate schema validation vs Postgres types.** `text` columns map to `String` and `timestamptz` to `Instant`. Both are expected to validate, but Task 2 is the first time it's checked. Don't work around a failure with `columnDefinition` without approval.
- **Validation errors on nested records.** Spring has to read record accessors to build field errors like `client.idOrName`. If it can't (Task 7), the fix is a design decision.
- **Race-case 409 has no `existingClient`.** See "Clarification of the spec" above.
- **`updated_at` only moves through JPA.** Raw-SQL updates (only tests do that today) don't bump it.
- **No CORS yet.** The browser can't call the API until the frontend plan adds it.
- **CI is unverified until the branch is pushed.**
