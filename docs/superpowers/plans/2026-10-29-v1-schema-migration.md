# V1 Schema Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect `api/` to Postgres and create the approved schema (clients, dogs, bookings, booking_stays, blocked_dates) with one Flyway migration. Every constraint is covered by an integration test.

**Architecture:** Flyway runs `V1__initial_schema.sql` when Spring Boot starts. Datasource credentials come from environment variables. Locally they're loaded from the gitignored `db.dev.local` through `spring.config.import`. Tests use the `test` profile against `dd_pet_care_test`. That database is cleaned and re-migrated once per test run, and every test rolls back its own transaction. There are no entities or JPA yet; tests use `JdbcClient` with plain SQL.

**Tech Stack:** Spring Boot 4.1.2 (upgraded from 3.4.1 in Task 0.5), Java 21, Maven wrapper, Flyway 12.4.0 (managed by Boot), springdoc-openapi 3.2.0, PostgreSQL 18 (Postgres.app locally; `postgres:18` service container in CI), JUnit 5 + AssertJ.

**Spec:** `docs/superpowers/specs/2026-10-29-backend-schema-design.md`

**Ground rules (from CLAUDE.md):** no commits without the project owner approving the message. Never touch prod. Schema changes happen only through Flyway.

---

## Local state before starting (already done, verify only)

- Postgres.app PG 18.6 on `localhost:5432`.
- Role `ddpet_dev` (login, not a superuser) owns `dd_pet_care_dev` and `dd_pet_care_test`. Both are empty.
- `db.dev.local` (repo root, gitignored by `*.local`, mode 600) contains `DB_URL=jdbc:postgresql://localhost:5432/dd_pet_care_dev`, `DB_USERNAME`, `DB_PASSWORD`. **Never print its values.**
- psql binary: `/Applications/Postgres.app/Contents/Versions/18/bin/psql` (not on PATH).

## File map

| File | Action | Responsibility |
|---|---|---|
| `api/pom.xml` | Modify | Add jdbc starter, flyway-core, flyway-database-postgresql, postgresql driver |
| `api/src/main/resources/application.yml` | Modify | Datasource from env vars; import `../db.dev.local` if present |
| `api/src/test/resources/application-test.yml` | Create | Test profile: test DB URL, allow Flyway clean |
| `api/src/test/java/com/ddpetcare/api/DatabaseTest.java` | Create | Base class for all Spring tests: test profile, clean DB, rollback, insert helpers |
| `api/src/test/java/com/ddpetcare/api/CleanTestDatabase.java` | Create | Flyway strategy: clean + migrate, refusing any non-`_test` DB |
| `api/src/test/java/com/ddpetcare/api/ApiApplicationTests.java` | Modify | Extend `DatabaseTest` so it never runs against the dev DB |
| `api/src/test/java/com/ddpetcare/api/TestDatabaseConnectionTest.java` | Create | Proves tests hit `dd_pet_care_test` |
| `api/src/main/resources/db/migration/V1__initial_schema.sql` | Create | The whole schema, built up across Tasks 2–5 |
| `api/src/test/java/com/ddpetcare/api/schema/ClientsAndDogsSchemaTest.java` | Create | clients + dogs constraints |
| `api/src/test/java/com/ddpetcare/api/schema/BookingsSchemaTest.java` | Create | bookings constraints |
| `api/src/test/java/com/ddpetcare/api/schema/BookingStaysSchemaTest.java` | Create | booking_stays constraints |
| `api/src/test/java/com/ddpetcare/api/schema/BlockedDatesSchemaTest.java` | Create | blocked_dates constraints |
| `api/src/test/java/com/ddpetcare/api/schema/EarningsQueriesTest.java` | Create | Monthly and per-client earnings work on this schema |
| `.github/workflows/api.yml` | Modify | Postgres 18 service container + test env vars |
| `api/CLAUDE.md` | Modify | Document DB setup and the test base-class rule |
| `docs/superpowers/specs/2026-10-29-backend-schema-design.md` | Modify | Replace the "Spring profiles dev/prod" line with the env-var approach |

`V1__initial_schema.sql` is edited across Tasks 2–5. That's safe because it's applied only to the test DB, which is cleaned on every run. It's applied to the dev DB only in Task 7, after it's final.

---

### Task 0: Commit the spec

- [ ] **Step 1: Ask the project owner to approve the commit**

Proposed message:
```
docs: add backend schema design spec

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

- [ ] **Step 2: After approval, commit**

```bash
git add docs/superpowers/specs/2026-10-29-backend-schema-design.md docs/superpowers/plans/2026-10-29-v1-schema-migration.md
git commit -m "$(cat <<'EOF'
docs: add backend schema design spec

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 0.5: Upgrade api/ to Spring Boot 4.1.2

Spring Boot 3.4 is past its open-source support window. `api/` is still a bare scaffold, so this is the cheapest time to upgrade.

**Files:** `api/pom.xml`, `api/CLAUDE.md`

- [ ] **Step 1: Record the current baseline**

Run: `cd api && ./mvnw -B verify`
Expected: `BUILD SUCCESS` (1 test, `contextLoads`). If it fails, stop and report before changing anything.

- [ ] **Step 2: Update `api/pom.xml`**

- Parent version: `3.4.1` → `4.1.2`.
- `spring-boot-starter-web` → `spring-boot-starter-webmvc` (renamed in Boot 4).
- `springdoc-openapi-starter-webmvc-ui` version: `2.6.0` → `3.2.0` (the line built against Boot 4.1.2).
- Replace the single `spring-boot-starter-test` dependency with Boot 4's per-module test starters:
```xml
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-webmvc-test</artifactId>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-actuator-test</artifactId>
            <scope>test</scope>
        </dependency>
```

- [ ] **Step 3: Verify that the build and the running app still work**

Run: `cd api && ./mvnw -B verify`
Expected: `BUILD SUCCESS`, 1 test passing.

Then run `./mvnw -B spring-boot:run` in the background and check:
- `curl -s localhost:8080/actuator/health` → `{"status":"UP"}`
- `curl -s -o /dev/null -w '%{http_code}' localhost:8080/v3/api-docs` → `200`

Then stop the app.

- [ ] **Step 4: Update the stack line in `api/CLAUDE.md`**

`Spring Boot 3.4` → `Spring Boot 4.1`. Replace `spring-boot-starter-web` with `spring-boot-starter-webmvc` in the starters list.

- [ ] **Step 5: Propose the commit and commit after approval**

```
build(api): upgrade to Spring Boot 4.1.2

Spring Boot 3.4 is out of open-source support. Upgrading while api/ is
still a bare scaffold: starter-web is renamed to starter-webmvc,
springdoc moves to 3.2.0 (its Boot 4 line), and the test starters are
split per module.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
Files: `api/pom.xml api/CLAUDE.md`

---

### Task 1: Database connection and test infrastructure

**Files:** `api/pom.xml`, `api/src/main/resources/application.yml`, `api/src/test/resources/application-test.yml`, `api/src/test/java/com/ddpetcare/api/{DatabaseTest,CleanTestDatabase,ApiApplicationTests,TestDatabaseConnectionTest}.java`

- [ ] **Step 1: Write the failing test**

`api/src/test/java/com/ddpetcare/api/TestDatabaseConnectionTest.java`:
```java
package com.ddpetcare.api;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class TestDatabaseConnectionTest extends DatabaseTest {

    @Test
    void connectsToTheTestDatabase() {
        String database = jdbc.sql("SELECT current_database()").query(String.class).single();

        assertThat(database).isEqualTo("dd_pet_care_test");
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd api && ./mvnw -B test -Dtest=TestDatabaseConnectionTest`
Expected: COMPILATION ERROR, because `DatabaseTest` doesn't exist yet.

- [ ] **Step 3: Add the dependencies**

In `api/pom.xml`, insert these after the `springdoc-openapi-starter-webmvc-ui` dependency. All versions are managed by Spring Boot:
```xml
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-jdbc</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-flyway</artifactId>
        </dependency>
        <dependency>
            <groupId>org.flywaydb</groupId>
            <artifactId>flyway-database-postgresql</artifactId>
        </dependency>
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
            <scope>runtime</scope>
        </dependency>
```
Add these after the existing test starters:
```xml
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-jdbc-test</artifactId>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-flyway-test</artifactId>
            <scope>test</scope>
        </dependency>
```

- [ ] **Step 4: Configure the datasource**

Replace `api/src/main/resources/application.yml` with:
```yaml
spring:
  application:
    name: api
  config:
    import: optional:file:../db.dev.local[.properties]
  datasource:
    url: ${DB_URL}
    username: ${DB_USERNAME}
    password: ${DB_PASSWORD}

management:
  endpoints:
    web:
      exposure:
        include: health
```

Create `api/src/test/resources/application-test.yml`:
```yaml
spring:
  datasource:
    url: ${TEST_DB_URL:jdbc:postgresql://localhost:5432/dd_pet_care_test}
  flyway:
    clean-disabled: false
```

- [ ] **Step 5: Create the test base class and clean strategy**

`api/src/test/java/com/ddpetcare/api/CleanTestDatabase.java`:
```java
package com.ddpetcare.api;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.flyway.autoconfigure.FlywayMigrationStrategy;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;

@TestConfiguration
class CleanTestDatabase {

    @Bean
    FlywayMigrationStrategy cleanThenMigrate(@Value("${spring.datasource.url}") String url) {
        // clean() drops everything in the schema; never let a misconfigured profile aim it at dev or prod.
        if (!url.endsWith("_test")) {
            throw new IllegalStateException("Refusing to clean a non-test database: " + url);
        }
        return flyway -> {
            flyway.clean();
            flyway.migrate();
        };
    }
}
```

`api/src/test/java/com/ddpetcare/api/DatabaseTest.java`:
```java
package com.ddpetcare.api;

import java.math.BigDecimal;
import java.time.LocalDate;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@ActiveProfiles("test")
@Import(CleanTestDatabase.class)
@Transactional
public abstract class DatabaseTest {

    @Autowired
    protected JdbcClient jdbc;

    protected long insertClient(String name, String phone) {
        return jdbc.sql("INSERT INTO clients (name, phone) VALUES (?, ?) RETURNING id")
                .params(name, phone)
                .query(Long.class)
                .single();
    }

    protected long insertDog(long clientId, String name) {
        return jdbc.sql("INSERT INTO dogs (client_id, name) VALUES (?, ?) RETURNING id")
                .params(clientId, name)
                .query(Long.class)
                .single();
    }

    protected long insertBooking(long clientId, long dogId) {
        return jdbc.sql("INSERT INTO bookings (client_id, dog_id) VALUES (?, ?) RETURNING id")
                .params(clientId, dogId)
                .query(Long.class)
                .single();
    }

    protected long insertStay(long bookingId, LocalDate dropOff, LocalDate pickUp,
                              String unitRate, String fee, String price) {
        return jdbc.sql("""
                        INSERT INTO booking_stays
                            (booking_id, drop_off_date, pick_up_date, unit_rate, pickup_dropoff_fee, price)
                        VALUES (?, ?, ?, ?, ?, ?)
                        RETURNING id""")
                .params(bookingId, dropOff, pickUp,
                        new BigDecimal(unitRate), new BigDecimal(fee), new BigDecimal(price))
                .query(Long.class)
                .single();
    }
}
```

Replace `api/src/test/java/com/ddpetcare/api/ApiApplicationTests.java` with:
```java
package com.ddpetcare.api;

import org.junit.jupiter.api.Test;

class ApiApplicationTests extends DatabaseTest {

    @Test
    void contextLoads() {
    }

}
```

- [ ] **Step 6: Run all tests and confirm they pass**

Run: `cd api && ./mvnw -B verify`
Expected: `BUILD SUCCESS` with 2 tests passing. If Flyway logs a warning about PostgreSQL 18 support, note it in the report. Any Flyway error is a failure.

- [ ] **Step 7: Propose the commit and commit after approval**

```
feat(api): connect to Postgres with Flyway and test database setup

Datasource comes from env vars (db.dev.local locally). Tests run on
dd_pet_care_test, cleaned and re-migrated once per run, and refuse to
clean any database whose name doesn't end in _test.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
Files: `api/pom.xml api/src/main/resources/application.yml api/src/test`

---

### Task 2: clients and dogs

**Files:** create `api/src/test/java/com/ddpetcare/api/schema/ClientsAndDogsSchemaTest.java` and `api/src/main/resources/db/migration/V1__initial_schema.sql`

- [ ] **Step 1: Write the failing tests**

```java
package com.ddpetcare.api.schema;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ddpetcare.api.DatabaseTest;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;

class ClientsAndDogsSchemaTest extends DatabaseTest {

    @Test
    void generatesClientIds() {
        long first = insertClient("Sarah", null);
        long second = insertClient("Tom", null);

        assertThat(second).isGreaterThan(first);
    }

    @Test
    void rejectsExplicitClientId() {
        assertThatThrownBy(() -> jdbc.sql("INSERT INTO clients (id, name) VALUES (999, 'Sarah')").update())
                .isInstanceOf(DataAccessException.class)
                .hasMessageContaining("non-DEFAULT");
    }

    @Test
    void rejectsBlankClientName() {
        assertThatThrownBy(() -> insertClient("   ", null))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("clients_name_not_blank");
    }

    @Test
    void allowsManyClientsWithoutPhone() {
        insertClient("Sarah", null);
        insertClient("Tom", null);
    }

    @Test
    void rejectsDuplicatePhone() {
        insertClient("Sarah", "+447700900001");

        assertThatThrownBy(() -> insertClient("Tom", "+447700900001"))
                .isInstanceOf(DuplicateKeyException.class)
                .hasMessageContaining("clients_phone_key");
    }

    @Test
    void rejectsDogForMissingClient() {
        assertThatThrownBy(() -> insertDog(-1L, "Bella"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("dogs_client_id_fkey");
    }

    @Test
    void rejectsBlankDogName() {
        long sarah = insertClient("Sarah", null);

        assertThatThrownBy(() -> insertDog(sarah, ""))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("dogs_name_not_blank");
    }

    @Test
    void rejectsDuplicateDogNameForSameClient() {
        long sarah = insertClient("Sarah", null);
        insertDog(sarah, "Bella");

        assertThatThrownBy(() -> insertDog(sarah, "Bella"))
                .isInstanceOf(DuplicateKeyException.class)
                .hasMessageContaining("dogs_client_id_name_key");
    }

    @Test
    void allowsSameDogNameForDifferentClients() {
        insertDog(insertClient("Sarah", null), "Bella");
        insertDog(insertClient("Tom", null), "Bella");
    }

    @Test
    void rejectsDeletingClientWithDogs() {
        long sarah = insertClient("Sarah", null);
        insertDog(sarah, "Bella");

        assertThatThrownBy(() -> jdbc.sql("DELETE FROM clients WHERE id = ?").param(sarah).update())
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("dogs_client_id_fkey");
    }
}
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd api && ./mvnw -B test -Dtest=ClientsAndDogsSchemaTest`
Expected: FAIL with `relation "clients" does not exist`.

- [ ] **Step 3: Create V1 with clients and dogs**

`api/src/main/resources/db/migration/V1__initial_schema.sql`:
```sql
CREATE TABLE clients (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       text        NOT NULL,
    phone      text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT clients_name_not_blank CHECK (btrim(name) <> ''),
    CONSTRAINT clients_phone_key UNIQUE (phone)
);

CREATE TABLE dogs (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_id  bigint      NOT NULL,
    name       text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT dogs_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients (id),
    CONSTRAINT dogs_name_not_blank CHECK (btrim(name) <> ''),
    CONSTRAINT dogs_client_id_name_key UNIQUE (client_id, name),
    CONSTRAINT dogs_id_client_id_key UNIQUE (id, client_id)
);
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd api && ./mvnw -B test -Dtest=ClientsAndDogsSchemaTest`
Expected: 10 tests pass.

---

### Task 3: bookings

**Files:** create `api/src/test/java/com/ddpetcare/api/schema/BookingsSchemaTest.java`; append to `V1__initial_schema.sql`

- [ ] **Step 1: Write the failing tests**

```java
package com.ddpetcare.api.schema;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;

import com.ddpetcare.api.DatabaseTest;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

class BookingsSchemaTest extends DatabaseTest {

    @Test
    void newBookingIsConfirmedAndUnpaid() {
        long sarah = insertClient("Sarah", null);
        long booking = insertBooking(sarah, insertDog(sarah, "Bella"));

        Map<String, Object> row = jdbc.sql("SELECT status, paid_at FROM bookings WHERE id = ?")
                .param(booking).query().singleRow();

        assertThat(row.get("status")).isEqualTo("confirmed");
        assertThat(row.get("paid_at")).isNull();
    }

    @Test
    void rejectsUnknownStatus() {
        long sarah = insertClient("Sarah", null);
        long booking = insertBooking(sarah, insertDog(sarah, "Bella"));

        assertThatThrownBy(() -> jdbc.sql("UPDATE bookings SET status = 'pending' WHERE id = ?")
                        .param(booking).update())
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("bookings_status_check");
    }

    @Test
    void rejectsDogBelongingToAnotherClient() {
        long sarah = insertClient("Sarah", null);
        long tomsDog = insertDog(insertClient("Tom", null), "Rex");

        assertThatThrownBy(() -> insertBooking(sarah, tomsDog))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("bookings_dog_belongs_to_client_fkey");
    }

    @Test
    void rejectsDeletingDogWithBookings() {
        long sarah = insertClient("Sarah", null);
        long bella = insertDog(sarah, "Bella");
        insertBooking(sarah, bella);

        assertThatThrownBy(() -> jdbc.sql("DELETE FROM dogs WHERE id = ?").param(bella).update())
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("bookings_dog_belongs_to_client_fkey");
    }

    @Test
    void rejectsDeletingClientWithBookings() {
        long sarah = insertClient("Sarah", null);
        insertBooking(sarah, insertDog(sarah, "Bella"));

        assertThatThrownBy(() -> jdbc.sql("DELETE FROM clients WHERE id = ?").param(sarah).update())
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd api && ./mvnw -B test -Dtest=BookingsSchemaTest`
Expected: FAIL with `relation "bookings" does not exist`.

- [ ] **Step 3: Append bookings to V1**

```sql

CREATE TABLE bookings (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_id  bigint      NOT NULL,
    dog_id     bigint      NOT NULL,
    status     text        NOT NULL DEFAULT 'confirmed',
    notes      text,
    paid_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT bookings_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients (id),
    CONSTRAINT bookings_dog_belongs_to_client_fkey FOREIGN KEY (dog_id, client_id) REFERENCES dogs (id, client_id),
    CONSTRAINT bookings_status_check CHECK (status IN ('confirmed', 'cancelled'))
);

CREATE INDEX bookings_client_id_idx ON bookings (client_id);
CREATE INDEX bookings_dog_id_idx ON bookings (dog_id);
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd api && ./mvnw -B test -Dtest=BookingsSchemaTest`
Expected: 5 tests pass.

---

### Task 4: booking_stays

**Files:** create `api/src/test/java/com/ddpetcare/api/schema/BookingStaysSchemaTest.java`; append to `V1__initial_schema.sql`

Each rejection test is built so that **only** the constraint under test fails. Postgres doesn't guarantee which constraint it reports when several fail.

- [ ] **Step 1: Write the failing tests**

```java
package com.ddpetcare.api.schema;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.time.LocalTime;

import com.ddpetcare.api.DatabaseTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

class BookingStaysSchemaTest extends DatabaseTest {

    private static final LocalDate MON = LocalDate.of(2027, 3, 1);
    private static final LocalDate THU = MON.plusDays(3);

    private long booking;

    @BeforeEach
    void createBooking() {
        long sarah = insertClient("Sarah", null);
        booking = insertBooking(sarah, insertDog(sarah, "Bella"));
    }

    @Test
    void acceptsDayCareStay() {
        insertStay(booking, MON, MON, "35.00", "0", "35.00");
    }

    @Test
    void acceptsBoardingWithPickupFee() {
        insertStay(booking, MON, THU, "40.00", "15.00", "135.00");
    }

    @Test
    void rejectsPriceThatDoesNotMatchRate() {
        assertThatThrownBy(() -> insertStay(booking, MON, THU, "40.00", "0", "100.00"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("booking_stays_price_check");
    }

    @Test
    void rejectsPickUpBeforeDropOff() {
        assertThatThrownBy(() -> insertStay(booking, THU, MON, "35.00", "0", "35.00"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("booking_stays_dates_check");
    }

    @Test
    void rejectsNegativeRate() {
        assertThatThrownBy(() -> insertStay(booking, MON, MON, "-10.00", "50.00", "40.00"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("booking_stays_unit_rate_check");
    }

    @Test
    void rejectsNegativeFee() {
        assertThatThrownBy(() -> insertStay(booking, MON, MON, "50.00", "-10.00", "40.00"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("booking_stays_fee_check");
    }

    @Test
    void rejectsSameDayPickUpBeforeDropOffTime() {
        assertThatThrownBy(() -> insertTimedDayCare(LocalTime.of(14, 0), LocalTime.of(9, 0)))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("booking_stays_same_day_times_check");
    }

    @Test
    void allowsOneTimeStillTbd() {
        insertTimedDayCare(LocalTime.of(9, 0), null);
    }

    @Test
    void rejectsUnknownStatus() {
        long stay = insertStay(booking, MON, MON, "35.00", "0", "35.00");

        assertThatThrownBy(() -> jdbc.sql("UPDATE booking_stays SET status = 'done' WHERE id = ?")
                        .param(stay).update())
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("booking_stays_status_check");
    }

    @Test
    void rejectsStayForMissingBooking() {
        assertThatThrownBy(() -> insertStay(-1L, MON, MON, "35.00", "0", "35.00"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("booking_stays_booking_id_fkey");
    }

    private void insertTimedDayCare(LocalTime dropOff, LocalTime pickUp) {
        jdbc.sql("""
                        INSERT INTO booking_stays
                            (booking_id, drop_off_date, drop_off_time, pick_up_date, pick_up_time, unit_rate, price)
                        VALUES (?, ?, ?, ?, ?, 35.00, 35.00)""")
                .params(booking, MON, dropOff, MON, pickUp)
                .update();
    }
}
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd api && ./mvnw -B test -Dtest=BookingStaysSchemaTest`
Expected: FAIL with `relation "booking_stays" does not exist`.

- [ ] **Step 3: Append booking_stays to V1**

```sql

CREATE TABLE booking_stays (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id         bigint        NOT NULL,
    drop_off_date      date          NOT NULL,
    drop_off_time      time,
    pick_up_date       date          NOT NULL,
    pick_up_time       time,
    unit_rate          numeric(8, 2) NOT NULL,
    pickup_dropoff_fee numeric(8, 2) NOT NULL DEFAULT 0,
    price              numeric(10, 2) NOT NULL,
    status             text          NOT NULL DEFAULT 'confirmed',
    created_at         timestamptz   NOT NULL DEFAULT now(),
    updated_at         timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT booking_stays_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings (id),
    CONSTRAINT booking_stays_status_check CHECK (status IN ('confirmed', 'cancelled')),
    CONSTRAINT booking_stays_unit_rate_check CHECK (unit_rate >= 0),
    CONSTRAINT booking_stays_fee_check CHECK (pickup_dropoff_fee >= 0),
    CONSTRAINT booking_stays_price_nonnegative_check CHECK (price >= 0),
    CONSTRAINT booking_stays_dates_check CHECK (pick_up_date >= drop_off_date),
    CONSTRAINT booking_stays_same_day_times_check CHECK (
        pick_up_date > drop_off_date
        OR drop_off_time IS NULL
        OR pick_up_time IS NULL
        OR pick_up_time > drop_off_time
    ),
    -- Units are nights for boarding, or 1 for same-day day care.
    CONSTRAINT booking_stays_price_check CHECK (
        price = greatest(pick_up_date - drop_off_date, 1) * unit_rate + pickup_dropoff_fee
    )
);

CREATE INDEX booking_stays_booking_id_idx ON booking_stays (booking_id);
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd api && ./mvnw -B test -Dtest=BookingStaysSchemaTest`
Expected: 10 tests pass.

---

### Task 5: blocked_dates

**Files:** create `api/src/test/java/com/ddpetcare/api/schema/BlockedDatesSchemaTest.java`; append to `V1__initial_schema.sql`

- [ ] **Step 1: Write the failing tests**

```java
package com.ddpetcare.api.schema;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;

import com.ddpetcare.api.DatabaseTest;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

class BlockedDatesSchemaTest extends DatabaseTest {

    private static final LocalDate START = LocalDate.of(2027, 8, 1);

    @Test
    void acceptsRangeWithReason() {
        insertBlocked(START, START.plusDays(13), "Holiday");
    }

    @Test
    void acceptsSingleDayWithoutReason() {
        insertBlocked(START, START, null);
    }

    @Test
    void rejectsEndBeforeStart() {
        assertThatThrownBy(() -> insertBlocked(START, START.minusDays(1), null))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("blocked_dates_range_check");
    }

    private void insertBlocked(LocalDate start, LocalDate end, String reason) {
        jdbc.sql("INSERT INTO blocked_dates (start_date, end_date, reason) VALUES (?, ?, ?)")
                .params(start, end, reason)
                .update();
    }
}
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd api && ./mvnw -B test -Dtest=BlockedDatesSchemaTest`
Expected: FAIL with `relation "blocked_dates" does not exist`.

- [ ] **Step 3: Append blocked_dates to V1**

```sql

CREATE TABLE blocked_dates (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    start_date date        NOT NULL,
    end_date   date        NOT NULL,
    reason     text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT blocked_dates_range_check CHECK (end_date >= start_date)
);
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd api && ./mvnw -B test -Dtest=BlockedDatesSchemaTest`
Expected: 3 tests pass.

---

### Task 6: Earnings queries work on this schema

This test checks the design rather than driving new code, so it is **expected to pass straight away**. If it fails, the schema doesn't meet the spec's reporting requirement: stop and report.

**Files:** create `api/src/test/java/com/ddpetcare/api/schema/EarningsQueriesTest.java`

- [ ] **Step 1: Write the test**

```java
package com.ddpetcare.api.schema;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;

import com.ddpetcare.api.DatabaseTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class EarningsQueriesTest extends DatabaseTest {

    @BeforeEach
    void seed() {
        long sarah = insertClient("Sarah", null);
        long sarahsBooking = insertBooking(sarah, insertDog(sarah, "Bella"));
        insertStay(sarahsBooking, LocalDate.of(2027, 1, 30), LocalDate.of(2027, 2, 2), "40.00", "0", "120.00");
        insertStay(sarahsBooking, LocalDate.of(2027, 2, 5), LocalDate.of(2027, 2, 5), "35.00", "0", "35.00");
        long cancelledStay = insertStay(sarahsBooking, LocalDate.of(2027, 2, 6), LocalDate.of(2027, 2, 6), "35.00", "0", "35.00");
        jdbc.sql("UPDATE booking_stays SET status = 'cancelled' WHERE id = ?").param(cancelledStay).update();

        long tom = insertClient("Tom", null);
        long tomsBooking = insertBooking(tom, insertDog(tom, "Rex"));
        insertStay(tomsBooking, LocalDate.of(2027, 2, 7), LocalDate.of(2027, 2, 7), "35.00", "0", "35.00");
        jdbc.sql("UPDATE bookings SET status = 'cancelled' WHERE id = ?").param(tomsBooking).update();
    }

    @Test
    void monthlyEarningsCountWholeStayInDropOffMonthAndSkipCancelled() {
        List<String> months = jdbc.sql("""
                        SELECT to_char(date_trunc('month', s.drop_off_date), 'YYYY-MM') || '=' || SUM(s.price)
                        FROM booking_stays s
                        JOIN bookings b ON b.id = s.booking_id
                        WHERE s.status = 'confirmed' AND b.status = 'confirmed'
                        GROUP BY date_trunc('month', s.drop_off_date)
                        ORDER BY date_trunc('month', s.drop_off_date)""")
                .query(String.class)
                .list();

        assertThat(months).containsExactly("2027-01=120.00", "2027-02=35.00");
    }

    @Test
    void earningsPerClientSkipCancelled() {
        List<String> clients = jdbc.sql("""
                        SELECT c.name || '=' || SUM(s.price)
                        FROM booking_stays s
                        JOIN bookings b ON b.id = s.booking_id
                        JOIN clients c ON c.id = b.client_id
                        WHERE s.status = 'confirmed' AND b.status = 'confirmed'
                        GROUP BY c.id, c.name
                        ORDER BY c.name""")
                .query(String.class)
                .list();

        assertThat(clients).containsExactly("Sarah=155.00");
    }
}
```

- [ ] **Step 2: Run the full suite**

Run: `cd api && ./mvnw -B verify`
Expected: `BUILD SUCCESS`, 32 tests (2 + 10 + 5 + 10 + 3 + 2).

- [ ] **Step 3: Self-check V1 against the spec**

Open `V1__initial_schema.sql` next to the spec's Tables and Indexes sections. Confirm every column, nullability, default, check, unique and FK in the spec is present. Confirm the indexes are exactly `bookings_client_id_idx`, `bookings_dog_id_idx` and `booking_stays_booking_id_idx` (dogs' client lookups are covered by the unique `(client_id, name)` index).

- [ ] **Step 4: Propose the commit and commit after approval**

```
feat(api): add V1 schema migration

Creates clients, dogs, bookings, booking_stays and blocked_dates with
database-enforced integrity: price must match rate x units + fee,
dogs must belong to the booking's client, no hard deletes of
referenced rows. Each constraint has an integration test.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
Files: `api/src/main/resources/db/migration api/src/test/java/com/ddpetcare/api/schema`

---

### Task 7: Apply V1 to the dev database

Do this only after Task 6 is committed. From here on, V1 is immutable.

- [ ] **Step 1: Start the app (runs Flyway against `dd_pet_care_dev`)**

Run: `cd api && ./mvnw -B spring-boot:run` in the background
Expected in the log: `Successfully applied 1 migration to schema "public", now at version v1`.

- [ ] **Step 2: Check the app is healthy, then stop it**

Run: `curl -s localhost:8080/actuator/health`
Expected: `{"status":"UP"}` (the DB health check is included). Then stop the app.

- [ ] **Step 3: Verify the tables exist and are owned by the app role**

Run: `/Applications/Postgres.app/Contents/Versions/18/bin/psql -d dd_pet_care_dev -c "\dt"`
Expected: `blocked_dates, booking_stays, bookings, clients, dogs, flyway_schema_history`, all owned by `ddpet_dev`.

- [ ] **Step 4: Ask the project owner to check in DBeaver**

Refresh **DD Pet Care — dev → … → public → Tables** (F5) and confirm the five tables appear. Optionally right-click `public` → **View Diagram** to see the relationships.

- [ ] **Step 5: Drop the leftover `ddpet_dev` database**

It's empty, but an idle `psql` session (heidi, started 18:09) holds it open. Ask the project owner to close that session, then run:
`/Applications/Postgres.app/Contents/Versions/18/bin/psql -d postgres -c "DROP DATABASE ddpet_dev;"`

---

### Task 8: CI runs the tests against Postgres 18

**Files:** modify `.github/workflows/api.yml`

- [ ] **Step 1: Add the service container and env**

Replace the `jobs:` block with:
```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: api
    services:
      postgres:
        image: postgres:18
        env:
          POSTGRES_USER: ddpet_test
          POSTGRES_PASSWORD: ddpet_test
          POSTGRES_DB: dd_pet_care_test
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U ddpet_test"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      DB_USERNAME: ddpet_test
      DB_PASSWORD: ddpet_test
      TEST_DB_URL: jdbc:postgresql://localhost:5432/dd_pet_care_test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '21'
          cache: maven
      - run: ./mvnw -B verify
```
The credentials are throwaway values for a container that exists only during the CI run. They aren't secrets.

- [ ] **Step 2: Validate locally**

Run: `cd api && ./mvnw -B verify` (must still pass). The workflow itself is verified on the first push. Report that it hasn't run yet.

---

### Task 9: Docs

**Files:** `api/CLAUDE.md`, the spec

- [ ] **Step 1: Update `api/CLAUDE.md`**

Make these changes:
- Stack: add "Spring JDBC, Flyway, PostgreSQL driver (no JPA yet)".
- Replace "Current state" with: schema exists via `V1__initial_schema.sql`; no entities or domain endpoints yet.
- Add these lines under "Database":
  - Local: Postgres.app PG 18. The app connects as role `ddpet_dev` (not a superuser), with credentials in the repo-root `db.dev.local` (gitignored; never print or commit it), imported by `application.yml`. Dev DB is `dd_pet_care_dev`; test DB is `dd_pet_care_test`.
  - Every Spring test must extend `DatabaseTest`. It activates the `test` profile, cleans and re-migrates the test DB once per run, and rolls back each test. A test that doesn't extend it would run against the dev DB.
  - A migration is immutable once it has been applied to the dev DB. Changes go in a new `V<n>__…` file.

- [ ] **Step 2: Update the spec**

In `docs/superpowers/specs/2026-10-29-backend-schema-design.md`, replace:
`- Spring profiles \`dev\` and \`prod\`. Database credentials come only from environment variables and are never committed.`
with:
`- Database credentials come only from environment variables (\`DB_URL\`, \`DB_USERNAME\`, \`DB_PASSWORD\`) and are never committed. Locally they're loaded from the gitignored \`db.dev.local\`; tests use the \`test\` profile.`

- [ ] **Step 3: Propose the commit and commit after approval**

```
ci(api): run tests against Postgres 18 and document DB setup

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
Files: `.github/workflows/api.yml api/CLAUDE.md docs/superpowers/specs/2026-10-29-backend-schema-design.md`

---

## Known risks to report at the end

- **Flyway and PostgreSQL 18.** Flyway 12.4.0 is expected to support PG 18 but hasn't been verified here. If it errors, stop and report; don't change versions without approval.
- **springdoc 3.2.0 is new** (released 2026-10-24). It's built against Boot 4.1.2 exactly. If Task 0.5's `/v3/api-docs` check fails, fall back to 3.1.1 (built on Boot 4.1.0) after approval.
- **CI is unverified until the first push.**
- **`updated_at` isn't maintained yet.** The spec keeps it current with JPA `@UpdateTimestamp`, which arrives with the entities in the next plan. Until then it only holds the insert time.
- **Shared Postgres role.** Prod hosting and roles aren't designed yet; the `ddpet_dev` role is local only.
