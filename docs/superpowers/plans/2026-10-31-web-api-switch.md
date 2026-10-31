# Web API Switch-over Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the API under `/api`, make its OpenAPI output precise enough to generate TypeScript types from, and switch the `web/` booking form, confirmation and history from browser storage to that API, running locally against `api/` and Postgres.app.

**Architecture:** Part 1 changes the two controllers' `@RequestMapping`, adds springdoc annotations for operations, enums and error responses, and adds one `OpenApiCustomizer` that sets required/nullable fields, `HH:mm` time patterns and `minItems` on the generated model. Part 2 generates `web/src/api/schema.d.ts` from the running API with `openapi-typescript`, adds a small hand-written fetch client (`api/client.ts` + `ApiError`), and reworks the existing components in place: the form gets client and dog pickers (MUI `Autocomplete` with `freeSolo`) and builds one `CreateBookingRequest` with one stay per day; the confirmation and history render `BookingResponse`. Vite proxies `/api` to `localhost:8080`. Vitest + Testing Library + MSW test the website.

**Tech Stack:** Spring Boot 4.1.2, Java 21, springdoc-openapi 3.2.0 (swagger-core 2.2.55, OpenAPI 3.1 output), Jackson 3 (annotations still `com.fasterxml.jackson.annotation`). React 19.2, Vite 8.0, MUI 9 + MUI X date pickers 9, dayjs, TypeScript 5.9.3. New dev-only: openapi-typescript 7.13.0, vitest 4.1.12, @testing-library/react 16.3.3, @testing-library/dom 10.4.2, @testing-library/user-event 14.6.8, jsdom 29.1.1, msw 2.15.0.

**Spec:** docs/superpowers/specs/2026-10-31-web-api-switch-design.md

**Ground rules (from CLAUDE.md):** no commits without the project owner approving the message. No dependencies beyond the seven pinned below (`@testing-library/dom` is the peer of `@testing-library/react`; see "Clarifications"). Never read or print `db.dev.local`, never touch prod, and don't POST to the dev database (only the project owner does that, in the manual check). No schema change and no migration. MUI: only `Box` takes CSS-shaped props; everything else uses `sx`. TypeScript stays strict and pinned to 5.9.3. **Don't merge `feat/web-api` to `main`**: Vercel deploys `main`, and the live site must keep its browser-storage version until the API is hosted.

---

## Things to know before starting

- **Branch:** `feat/web-api`. Check with `git branch --show-current`.
- **Run Maven from `api/`.** `application.yml` imports `../db.dev.local` relative to the working directory. The API tests need Postgres.app running (they use `dd_pet_care_test`).
- **Jackson 3, Jackson 2 annotations.** Spring Boot 4 serialises with Jackson 3, but the records still import `com.fasterxml.jackson.annotation.JsonFormat` (see `BookingResponse.StayResponse`, `CreateBookingRequest.StayRequest`). Don't change those imports. OpenAPI annotations come from `io.swagger.v3.oas.annotations.*`, already on the classpath through the springdoc starter.
- **springdoc 3.2.0 writes OpenAPI 3.1.** In 3.1 there is no `nullable` keyword: a nullable field's `type` is a list that includes `"null"`. swagger-core's 3.1 serializer ignores `Schema.nullable` and `Schema.type` and writes `Schema.types` as `type` (checked with `javap` on `Schema31Mixin` in swagger-core-jakarta 2.2.55). So `@Schema(nullable = true)` silently does nothing. That is why Task 2 sets required and nullable in an `OpenApiCustomizer` that edits `types` directly. The customizer also fails loudly (`/v3/api-docs` returns 500) if a schema or property it names doesn't exist, so a rename can't drift silently.
- **springdoc caches the spec.** After changing annotations or the customizer, restart the API before running `npm run gen:api`.
- **Node.** CI runs Node 20 (`web.yml`). vitest 5, jsdom 30 and msw 3 need Node ≥ 22.12, so this plan pins the newest versions that still run on Node 20 (see the versions table in Task 3). The local machine has Node 23.11, which is outside the `engines` range of vitest 4 and jsdom 29 (`^20 || ^22 || >=24`), so `npm install` prints `EBADENGINE` warnings. They're warnings only; if tests misbehave locally, switch to Node 22 or 24 LTS before debugging anything else.
- **Testing without jest-dom.** `@testing-library/jest-dom` isn't approved. Use `getBy*` (it throws when the element is missing), `expect(...).toBeTruthy()`, `queryBy*` with `toBeNull()`, and read `.value` from `HTMLInputElement`s.
- **jsdom quirks the tests rely on:**
  - Node's `fetch` can't resolve a relative URL, so `api/client.ts` calls `fetch(new URL(path, window.location.origin))`. In the browser that's the same origin, so the Vite proxy and a future Vercel rewrite still apply. In tests the origin is `http://localhost:3000`, and MSW handlers written as `/api/...` match it.
  - `window.confirm` isn't implemented: spy on it with `vi.spyOn(window, 'confirm')`.
  - `window.matchMedia` doesn't exist, so the MUI X pickers render in mobile mode. Tests set a date by firing `change` on the picker's hidden `<input>` (the element the label's `for` points at) with the field's text format: `DD/MM/YYYY` for `DatePicker` and `DD/MM/YYYY HH:mm` for `DateTimePicker` under the `en-gb` locale. This is the field's own `onChange` path (`useFieldHiddenInputProps`); the helper is `setDate` in `BookingForm.test.tsx`.
- **Vitest doesn't typecheck.** Between Task 7 and Task 10 `npm run typecheck` fails while the components still use the old types; run only the test file you're working on until Task 10, then run every check.
- **`verbatimModuleSyntax` is on:** type-only imports must be `import type`. Runtime imports of local modules use the `.ts`/`.tsx` extension (the existing style); type imports from `./types` don't.
- **eslint-plugin-react-hooks 7** flags synchronous `setState` inside `useEffect`. `App` only sets state in promise callbacks inside its effect, and starts in the loading state.
- **Generated type names.** The client code is written against the names openapi-typescript produces from springdoc's schema names: `components["schemas"]["BookingResponse"]`, `["StayResponse"]`, `["ClientResponse"]`, `["DogResponse"]`, `["CreateBookingRequest"]`, `["StayRequest"]`, `["ValidationProblem"]`, `["ConflictProblem"]`, `["FieldError"]`, `["ExistingClient"]`. Task 5 checks them. If a name differs, change only the type paths (in `api/client.ts`, `types.ts` and `test/fixtures.ts`), not the code around them.

## Clarifications of the spec

1. **Error content type.** The spec says responses are declared as `application/json`. Success responses are. Errors are declared as `application/problem+json`, because that's the content type Spring sends for `ProblemDetail`; declaring them as `application/json` would document something the API doesn't do.
2. **Nullable request fields.** Section 1b lists nullable *response* fields. The website also sends `notes: null` and `dropOffTime`/`pickUpTime: null` in the request, so `CreateBookingRequest.notes` and `StayRequest.dropOffTime`/`pickUpTime` are documented as nullable too. Without that the generated request type wouldn't accept `null`.
3. **409 without `existingClient`.** The race-case 409 has no `existingClient` (booking API spec, "Future to-dos"), so `existingClient` is optional in the `ConflictProblem` schema, and the website falls back to the error banner when it's missing.
4. **400 without field errors.** "Dog belongs to another client" and an unreadable body are 400s with a `detail` but no `errors[]`. The website shows them in the banner with the title and the detail.
5. **Calendar UID.** Only `.ics` events carry a UID (`stay-{stayId}@dogsitting.app`). A Google Calendar template link has no UID parameter; it stays one link per day.
6. **A day with only one time.** The form always sends both times or neither, but the API allows one. The website treats a day with either time missing as "time TBD" for calendar events (all-day) and labels only the missing time "(time TBD)" in text.
7. **Wording.** The spec calls each stay a "day" (errors map to "day *i+1*"), so the form's "Booking *n*" cards become "Day *n*", "Add another booking" becomes "Add another day", and the submit button always says "Create Booking". The WhatsApp message text is kept as it is today ("Your 2 bookings are confirmed:", "— Booking 1 (Boarding) —"), because the spec says WhatsApp is unchanged. Notes are booking-level now, so the message lists them once, after the days.
8. **Picker components.** The spec's layout only lists new files under `api/` and `phone.ts`. The two pickers go in their own files (`ClientPicker.tsx`, `DogPicker.tsx`) so `BookingForm.tsx` stays readable; they're used only by the form.
9. **`@testing-library/dom`.** It isn't in the spec's approved list, but it is a required peer of `@testing-library/react` 16. Approved by the project owner on 2026-10-31, together with the version pins below.
10. **Refresh after cancel** reloads clients as well as bookings (one reload path in `App`). That's one extra GET, and it keeps the code to one effect.
11. **Total on confirmation** is shown for single-day bookings too ("…and the total"); today it's only shown for several.
12. **Duplicate-client warning (owner decision, 2026-10-31; not in the spec).** If the client picker holds a typed new name that matches an existing client's name (trimmed, inner whitespace collapsed, lowercased), an info box under the picker says "{Existing Name} is already a client — use them?" with a "Use {Existing Name}" button that switches to that client (`client: { id }`). With several matches it offers the first in `/api/clients` order and adds "Pick from the list to choose between clients named {name}". It doesn't block: submitting with the typed name still creates a new client, because two people can share a name. To make the check see what was typed, the pickers keep the raw text (leading and inner spaces included) as the new name; a whitespace-only name counts as missing, and the name is trimmed when sent. Built in Task 8 (`ClientPicker`), tested in `BookingForm.test.tsx`.

## File map

| File | Action | Responsibility |
|---|---|---|
| `api/src/main/java/com/ddpetcare/api/client/ClientController.java` | Modify | `/api/clients`; `listClients` operation id |
| `api/src/main/java/com/ddpetcare/api/booking/BookingController.java` | Modify | `/api/bookings`; `Location: /api/bookings/{id}`; operation ids; 201 + `Location`; 400/404/409 responses |
| `api/src/main/java/com/ddpetcare/api/booking/BookingResponse.java` | Modify | `status` and `service` enums |
| `api/src/main/java/com/ddpetcare/api/error/ApiExceptionHandler.java` | Modify | Make `FieldError` and `ExistingClient` public so the docs can reference them |
| `api/src/main/java/com/ddpetcare/api/error/ProblemSchemas.java` | Create | Documentation-only shapes of the 400/404/409 `ProblemDetail` bodies |
| `api/src/main/java/com/ddpetcare/api/OpenApiSchemaCustomizer.java` | Create | Required/nullable fields, `HH:mm` times, `minItems: 1` on stays |
| `api/src/main/resources/application.yml` | Modify | springdoc: OpenAPI 3.1, `application/json` by default, no generic advice responses |
| `api/src/test/java/com/ddpetcare/api/OpenApiTest.java` | Modify | Asserts every point of spec 1b |
| `api/src/test/java/com/ddpetcare/api/{booking,client,error}/*Test.java` (9 files) | Modify | `/api` paths |
| `web/package.json`, `web/package-lock.json` | Modify | 7 pinned dev dependencies; `test` and `gen:api` scripts |
| `web/vite.config.ts` | Modify | `/api` proxy; Vitest (jsdom, setup file) |
| `web/eslint.config.js` | Modify | Ignore the generated `schema.d.ts` |
| `web/src/test/setup.ts` | Create | Starts/stops MSW, cleans up after each test |
| `web/src/test/server.ts` | Create | The MSW server (no default handlers) |
| `web/src/test/Providers.tsx` | Create | `LocalizationProvider` wrapper for rendering in tests |
| `web/src/test/fixtures.ts` | Create | Sample clients and bookings in API shape |
| `web/src/phone.ts`, `web/src/phone.test.ts` | Create | UK phone input → E.164 |
| `web/src/api/schema.d.ts` | Create (generated) | Types from `/v3/api-docs` |
| `web/src/api/client.ts`, `web/src/api/client.test.ts` | Create | Typed fetch helper, `ApiError` |
| `web/src/types.ts` | Modify | Generated-type aliases; `BookingDraft` without notes; picker choice types |
| `web/src/utils.ts`, `web/src/utils.test.ts` | Modify / Create | Price preview, request building, error mapping, WhatsApp, calendar on API types |
| `web/src/components/ClientPicker.tsx` | Create | Client search-as-you-type (`Autocomplete`, `freeSolo`) |
| `web/src/components/DogPicker.tsx` | Create | Dog search-as-you-type for the chosen client |
| `web/src/components/BookingEntry.tsx` | Modify | One day; notes removed; fee error |
| `web/src/components/BookingForm.tsx`, `BookingForm.test.tsx` | Modify / Create | Pickers, notes, request, API errors, 409 switch |
| `web/src/components/Confirmation.tsx`, `Confirmation.test.tsx` | Modify / Create | Renders the API's booking |
| `web/src/components/BookingHistory.tsx`, `BookingHistory.test.tsx` | Modify / Create | One card per booking; Cancel |
| `web/src/App.tsx`, `web/src/App.test.tsx` | Modify / Create | Load, retry, create, cancel, refresh |
| `web/src/storage.ts` | Delete | Replaced by the API |
| `.github/workflows/web.yml` | Modify | `npm test` |
| `web/CLAUDE.md`, `api/CLAUDE.md`, `docs/superpowers/specs/2026-10-30-booking-api-design.md` | Modify | Docs |

---

## Part 1: API

### Task 1: Move the endpoints under `/api`

**Files:** modify `client/ClientController.java`, `booking/BookingController.java`, `OpenApiTest.java` and the nine test classes that call the endpoints.

- [ ] **Step 1: Point every test at `/api`**

```bash
cd api
sed -i '' -e 's#"/bookings#"/api/bookings#g' -e 's#"/clients#"/api/clients#g' \
  src/test/java/com/ddpetcare/api/booking/BookingQueryCountTest.java \
  src/test/java/com/ddpetcare/api/booking/CancelBookingTest.java \
  src/test/java/com/ddpetcare/api/booking/ClientAndDogResolutionTest.java \
  src/test/java/com/ddpetcare/api/booking/CreateBookingRollbackTest.java \
  src/test/java/com/ddpetcare/api/booking/CreateBookingTest.java \
  src/test/java/com/ddpetcare/api/booking/CreateBookingValidationTest.java \
  src/test/java/com/ddpetcare/api/booking/ListBookingsTest.java \
  src/test/java/com/ddpetcare/api/client/ListClientsTest.java \
  src/test/java/com/ddpetcare/api/error/SpringErrorsStillMappedTest.java
```
The patterns only match a double quote followed by `/bookings` or `/clients`, so `TestRequests.load("bookings/…")` resource names are untouched. This also updates the `Location` assertion in `CreateBookingTest` to `"/api/bookings/" + id`.

Then replace the method in `api/src/test/java/com/ddpetcare/api/OpenApiTest.java` (Task 2 extends this file):
```java
    @Test
    void documentsTheFiveEndpoints() throws Exception {
        getJson("/v3/api-docs")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/api/clients'].get").exists())
                .andExpect(jsonPath("$.paths['/api/bookings'].get").exists())
                .andExpect(jsonPath("$.paths['/api/bookings'].post").exists())
                .andExpect(jsonPath("$.paths['/api/bookings/{id}'].get").exists())
                .andExpect(jsonPath("$.paths['/api/bookings/{id}/cancel'].post").exists())
                .andExpect(jsonPath("$.components.schemas.ClientRef.properties.idOrName").doesNotExist());
    }
```

- [ ] **Step 2: Check nothing still uses the old paths**

Run: `grep -rn "\"/bookings\|\"/clients\|'/bookings\|'/clients" api/src/test` (from the repo root)
Expected: no output.

- [ ] **Step 3: Run the suite and watch it fail**

Run: `cd api && ./mvnw -B verify`
Expected: BUILD FAILURE. Every endpoint test fails with `Status expected:<…> but was:<404>` (or a missing `$.paths['/api/…']` in `OpenApiTest`). `SpringErrorsStillMappedTest` also fails: `/api/bookings/abc` and `DELETE /api/bookings` are 404s for now. Schema tests (`schema/*`) and `StayPriceTest` still pass.

- [ ] **Step 4: Change the two controllers**

In `ClientController.java`:
```java
@RequestMapping("/api/clients")
```
In `BookingController.java`:
```java
@RequestMapping("/api/bookings")
```
and in `create`:
```java
        return ResponseEntity.created(URI.create("/api/bookings/" + booking.id())).body(booking);
```

- [ ] **Step 5: Run the suite**

Run: `cd api && ./mvnw -B verify`
Expected: BUILD SUCCESS, with the same test count as before Step 1. `/actuator/health` and `/v3/api-docs` are unchanged (`OpenApiTest` still reads `/v3/api-docs`).

- [ ] **Step 6: Propose the commit and commit after approval**

```
refactor(api): move the endpoints under /api

/api/clients and /api/bookings: one Vite proxy rule now, one Vercel
rewrite later, and no clash with website routes. The health check and
/v3/api-docs stay where they are.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
Files: `api/src/main/java/com/ddpetcare/api/client/ClientController.java api/src/main/java/com/ddpetcare/api/booking/BookingController.java api/src/test/java`

---

### Task 2: Precise OpenAPI output

**Files:** modify `application.yml`, `booking/BookingController.java`, `client/ClientController.java`, `booking/BookingResponse.java`, `error/ApiExceptionHandler.java`; create `error/ProblemSchemas.java`, `OpenApiSchemaCustomizer.java`; test `OpenApiTest.java`.

**Approach (why a customizer):** annotations are used where swagger-core handles them reliably in 3.1: operation ids, the documented responses (201 + `Location`, 400/404/409 with their schemas) and `allowableValues` enums on the records. Required and nullable fields, the `HH:mm` time schema and `minItems` are set in one `OpenApiCustomizer` on the generated model, because:
- `@Schema(nullable = true)` is dropped from 3.1 output (see "Things to know"), so nullability has to be a `"null"` entry in `types`;
- `java.time.LocalTime`'s default schema isn't an `HH:mm` string, and replacing the property is deterministic;
- one list per schema is easier to review than 30 `requiredMode` annotations, and the customizer throws if a named schema or property disappears.

- [ ] **Step 1: Write the failing test**

Replace `api/src/test/java/com/ddpetcare/api/OpenApiTest.java`:
```java
package com.ddpetcare.api;

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
                .andExpect(jsonPath(SCHEMAS + "Problem.required", containsInAnyOrder("title", "status")));
    }

    @Test
    void responseFieldsAreRequiredAndTheNullableOnesAllowNull() throws Exception {
        apiDocs()
                .andExpect(jsonPath(SCHEMAS + "BookingResponse.required", containsInAnyOrder(
                        "id", "status", "notes", "paidAt", "createdAt", "client", "dog", "total", "stays")))
                .andExpect(jsonPath(SCHEMAS + "StayResponse.required", containsInAnyOrder(
                        "id", "service", "dropOffDate", "dropOffTime", "pickUpDate", "pickUpTime",
                        "unitRate", "pickupDropoffFee", "price", "status")))
                .andExpect(jsonPath(SCHEMAS + "ClientSummary.required", containsInAnyOrder("id", "name", "phone")))
                .andExpect(jsonPath(SCHEMAS + "DogSummary.required", containsInAnyOrder("id", "name")))
                .andExpect(jsonPath(SCHEMAS + "ClientResponse.required",
                        containsInAnyOrder("id", "name", "phone", "dogs")))
                .andExpect(jsonPath(SCHEMAS + "DogResponse.required", containsInAnyOrder("id", "name")))
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
```
`not(hasItem("null"))` passes whether swagger writes a single type as `"string"` or `["string"]`.

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd api && ./mvnw -B test -Dtest=OpenApiTest`
Expected: FAIL. At least the operation-id test (`operationId` is `list`/`create`/… or missing), the enum test, the 201 test and the required test fail. Some assertions (for example `minItems`) may already pass; that's fine.

- [ ] **Step 3: Configure springdoc**

Append to `api/src/main/resources/application.yml`:
```yaml

springdoc:
  api-docs:
    version: openapi_3_1
  default-produces-media-type: application/json
  override-with-generic-response: false
```
- `version` is already the springdoc 3 default; it's explicit because the customizer writes 3.1-style `type` lists.
- `default-produces-media-type` replaces springdoc's `*/*` on responses that don't declare content.
- `override-with-generic-response: false` stops springdoc copying `ApiExceptionHandler`'s handlers onto every operation (with guessed codes and the generic `ProblemDetail` schema). The documented errors are exactly the ones declared on each operation.

- [ ] **Step 4: Make the error records public**

In `api/src/main/java/com/ddpetcare/api/error/ApiExceptionHandler.java`, change the two nested records to:
```java
    public record FieldError(String field, String message) {
    }

    public record ExistingClient(long id, String name) {
    }
```

- [ ] **Step 5: Add the documentation-only problem shapes**

`api/src/main/java/com/ddpetcare/api/error/ProblemSchemas.java`:
```java
package com.ddpetcare.api.error;

import java.util.List;

import com.ddpetcare.api.error.ApiExceptionHandler.ExistingClient;
import com.ddpetcare.api.error.ApiExceptionHandler.FieldError;
import io.swagger.v3.oas.annotations.media.Schema;

/** OpenAPI shapes of the ProblemDetail bodies that ApiExceptionHandler returns. Never instantiated. */
public final class ProblemSchemas {

    private ProblemSchemas() {
    }

    @Schema(description = "An error (RFC 9457 problem detail)")
    public record Problem(String type, String title, int status, String detail, String instance) {
    }

    @Schema(description = "A 400. errors lists each invalid field; it's absent when the body couldn't be read")
    public record ValidationProblem(String type, String title, int status, String detail, String instance,
                                    List<FieldError> errors) {
    }

    @Schema(description = "A 409. existingClient is the client who has the phone; absent if two creates raced")
    public record ConflictProblem(String type, String title, int status, String detail, String instance,
                                  ExistingClient existingClient) {
    }
}
```

- [ ] **Step 6: Add the customizer**

`api/src/main/java/com/ddpetcare/api/OpenApiSchemaCustomizer.java`:
```java
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

    private static final Map<String, List<String>> REQUIRED = Map.ofEntries(
            Map.entry("BookingResponse",
                    List.of("id", "status", "notes", "paidAt", "createdAt", "client", "dog", "total", "stays")),
            Map.entry("ClientSummary", List.of("id", "name", "phone")),
            Map.entry("DogSummary", List.of("id", "name")),
            Map.entry("StayResponse", List.of("id", "service", "dropOffDate", "dropOffTime", "pickUpDate",
                    "pickUpTime", "unitRate", "pickupDropoffFee", "price", "status")),
            Map.entry("ClientResponse", List.of("id", "name", "phone", "dogs")),
            Map.entry("DogResponse", List.of("id", "name")),
            Map.entry("Problem", List.of("title", "status")),
            Map.entry("ValidationProblem", List.of("title", "status")),
            Map.entry("ConflictProblem", List.of("title", "status")),
            Map.entry("FieldError", List.of("field", "message")),
            Map.entry("ExistingClient", List.of("id", "name")));

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
        REQUIRED.forEach((name, fields) -> schema(schemas, name).setRequired(new ArrayList<>(fields)));
        NULLABLE.forEach((name, fields) -> fields.forEach(field -> allowNull(property(schemas, name, field))));
        TIMES.forEach((name, fields) -> fields.forEach(field -> {
            property(schemas, name, field);
            schema(schemas, name).getProperties().put(field, time());
        }));
        property(schemas, "CreateBookingRequest", "stays").setMinItems(1);
    }

    private static Schema<?> schema(Map<String, Schema> schemas, String name) {
        Schema<?> schema = schemas.get(name);
        if (schema == null) {
            throw new IllegalStateException("No OpenAPI schema named " + name);
        }
        return schema;
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
```

- [ ] **Step 7: Enums on the response records**

Replace `api/src/main/java/com/ddpetcare/api/booking/BookingResponse.java`:
```java
package com.ddpetcare.api.booking;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Comparator;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;

public record BookingResponse(
        Long id,
        @Schema(allowableValues = {"confirmed", "cancelled"}) String status,
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
            @Schema(allowableValues = {"day_care", "boarding"}) String service,
            LocalDate dropOffDate,
            @JsonFormat(pattern = "HH:mm") LocalTime dropOffTime,
            LocalDate pickUpDate,
            @JsonFormat(pattern = "HH:mm") LocalTime pickUpTime,
            BigDecimal unitRate,
            BigDecimal pickupDropoffFee,
            BigDecimal price,
            @Schema(allowableValues = {"confirmed", "cancelled"}) String status) {

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
                booking.getStays().stream()
                        .sorted(Comparator.comparing(BookingStay::getDropOffDate).thenComparing(BookingStay::getId))
                        .map(StayResponse::from)
                        .toList());
    }
}
```

- [ ] **Step 8: Operation ids and documented responses**

Replace `api/src/main/java/com/ddpetcare/api/client/ClientController.java`:
```java
package com.ddpetcare.api.client;

import java.util.List;

import io.swagger.v3.oas.annotations.Operation;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/clients")
public class ClientController {

    private final ClientService service;

    public ClientController(ClientService service) {
        this.service = service;
    }

    @GetMapping
    @Operation(operationId = "listClients", summary = "All clients with their dogs, sorted by name")
    public List<ClientResponse> list() {
        return service.list();
    }
}
```

Replace `api/src/main/java/com/ddpetcare/api/booking/BookingController.java`:
```java
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
```
`@ResponseStatus(HttpStatus.CREATED)` doesn't change behaviour (the `ResponseEntity` already says 201); it stops springdoc adding a default `200` next to the declared `201`.

- [ ] **Step 9: Run the OpenAPI test**

Run: `cd api && ./mvnw -B test -Dtest=OpenApiTest`
Expected: PASS, 7 tests.
If it fails, read the actual document: add `.andDo(org.springframework.test.web.servlet.result.MockMvcResultHandlers.print())` to `apiDocs()` temporarily and look at the body. Fix the annotation or customizer, not the assertion, unless the assertion is wrong about JSON shape only (for example a `$ref` written differently). Remove the `print()` again.

- [ ] **Step 10: Run the whole suite**

Run: `cd api && ./mvnw -B verify`
Expected: BUILD SUCCESS. The count is Task 1's total plus 6 (`OpenApiTest` went from 1 test to 7).

- [ ] **Step 11: Propose the commit and commit after approval**

```
feat(api): make the OpenAPI spec precise enough to generate types

Operation ids, enums for status and service, 201 with Location on
create, and the 400/404/409 problem shapes are declared with springdoc
annotations. Required and nullable fields, HH:mm times and minItems on
stays are set in OpenApiSchemaCustomizer, because OpenAPI 3.1 output
drops @Schema(nullable = true).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
Files: `api/src/main/resources/application.yml api/src/main/java/com/ddpetcare/api/OpenApiSchemaCustomizer.java api/src/main/java/com/ddpetcare/api/error/ProblemSchemas.java api/src/main/java/com/ddpetcare/api/error/ApiExceptionHandler.java api/src/main/java/com/ddpetcare/api/booking/BookingResponse.java api/src/main/java/com/ddpetcare/api/booking/BookingController.java api/src/main/java/com/ddpetcare/api/client/ClientController.java api/src/test/java/com/ddpetcare/api/OpenApiTest.java`

---

## Part 2: Website

### Task 3: Dev dependencies, scripts, proxy and test setup

**Files:** modify `web/package.json`, `web/package-lock.json`, `web/vite.config.ts`, `web/eslint.config.js`; create `web/src/test/setup.ts`, `web/src/test/server.ts`, `web/src/test/Providers.tsx`.

**Versions** (checked with `npm view <pkg> version` and `npm view <pkg> peerDependencies engines` on 2026-10-31):

| Package | Pin | Latest | Why this version |
|---|---|---|---|
| `openapi-typescript` | 7.13.0 | 7.13.0 | Latest. Peer `typescript: ^5.x`, so 5.9.3 is fine. No `engines` limit |
| `vitest` | 4.1.12 | 5.0.5 | 5.x needs Node `^22.12 \|\| ^24 \|\| >=26`; CI runs Node 20. 4.1.12 (newest 4.x, 2026-10-15) supports Node 20 and has peer `vite: ^6 \|\| ^7 \|\| ^8` |
| `@testing-library/react` | 16.3.3 | 16.3.3 | Latest. Peers React 19, `@types/react(-dom)` 19, `@testing-library/dom ^10` |
| `@testing-library/dom` | 10.4.2 | 10.4.2 | Latest; satisfies the `^10` peer above |
| `@testing-library/user-event` | 14.6.8 | 14.6.8 | Latest. Peer `@testing-library/dom >=7.21.4` |
| `jsdom` | 29.1.1 | 30.1.3 | 30.x needs Node `^22.22.2 \|\| ^24.15 \|\| >=26`. 29.1.1 supports `^20.19 \|\| ^22.13 \|\| >=24` |
| `msw` | 2.15.0 | 3.0.3 | 3.x needs Node ≥ 22.12 and changes major API. 2.15.0 (newest 2.x) has the `http`/`HttpResponse` API, Node ≥ 18, peer `typescript >= 4.8` |

None of them needs TypeScript 6 or 7. If the project owner moves CI to Node 22, vitest 5 / jsdom 30 / msw 3 become options, but that's a separate decision.

- [ ] **Step 1: Install the seven dev dependencies, pinned**

```bash
cd web
npm install -D --save-exact openapi-typescript@7.13.0 vitest@4.1.12 @testing-library/react@16.3.3 @testing-library/dom@10.4.2 @testing-library/user-event@14.6.8 jsdom@29.1.1 msw@2.15.0
```
Expected: `added N packages`. On Node 23 you'll also see `npm warn EBADENGINE` for `vitest` and `jsdom` (see "Things to know"). Check that `package.json` lists the seven under `devDependencies` with exact versions (no `^`), and nothing else changed in `dependencies`.

- [ ] **Step 2: Add the scripts**

In `web/package.json`, replace `"scripts"` with:
```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "gen:api": "openapi-typescript http://localhost:8080/v3/api-docs -o src/api/schema.d.ts"
  },
```

- [ ] **Step 3: Proxy and Vitest config**

Replace `web/vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:8080' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 15000,
  },
})
```
`testTimeout` is raised because form tests that drive MUI `Autocomplete` in jsdom can take a few seconds on CI.

- [ ] **Step 4: Ignore the generated types in ESLint**

In `web/eslint.config.js`, change the ignore line to:
```js
  globalIgnores(['dist', '.claude/', 'src/api/schema.d.ts']),
```

- [ ] **Step 5: Test setup files**

`web/src/test/server.ts`:
```ts
import { setupServer } from 'msw/node'

export const server = setupServer()
```

`web/src/test/setup.ts`:
```ts
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { server } from './server.ts'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

afterEach(() => {
  cleanup()
  server.resetHandlers()
  vi.restoreAllMocks()
})

afterAll(() => server.close())
```
Vitest globals are off, so Testing Library's automatic cleanup doesn't run; `cleanup()` is called here instead. `onUnhandledRequest: 'error'` makes a test fail if the code calls an endpoint the test didn't expect.

`web/src/test/Providers.tsx`:
```tsx
import type { ReactNode } from 'react'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import 'dayjs/locale/en-gb'

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="en-gb">
      {children}
    </LocalizationProvider>
  )
}
```
This matches `main.tsx`, so date fields use `DD/MM/YYYY`.

No commit yet: Task 4 adds the first test so `npm test` has something to run.

---

### Task 4: `phone.ts`

**Files:** create `web/src/phone.ts`, `web/src/phone.test.ts`.

- [ ] **Step 1: Write the failing test**

`web/src/phone.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { toE164 } from './phone.ts'

describe('toE164', () => {
  it('turns a UK mobile starting 07 into +447', () => {
    expect(toE164('07700 900123')).toBe('+447700900123')
  })

  it('adds the + to a number starting 447', () => {
    expect(toE164('447700900123')).toBe('+447700900123')
  })

  it('keeps an international number, removing spaces, dashes and brackets', () => {
    expect(toE164('+1 415 555 0100')).toBe('+14155550100')
    expect(toE164('+1 (415) 555-0100')).toBe('+14155550100')
  })

  it.each(['hello', '0770', '020 7946 0000', '+0123456789'])('rejects %s', (input) => {
    expect(toE164(input)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd web && npx vitest run src/phone.test.ts`
Expected: FAIL, `Failed to resolve import "./phone.ts"`. This is also the first proof that Vitest, jsdom and the MSW setup file load.

- [ ] **Step 3: Implement**

`web/src/phone.ts`:
```ts
const E164 = /^\+[1-9][0-9]{7,14}$/

export const PHONE_ERROR = 'Enter a UK mobile or international number'

/** What was typed, as E.164 (e.g. +447700900123), or null if it can't be one. */
export function toE164(input: string): string | null {
  const cleaned = input.replace(/[\s\-()]/g, '')
  let candidate = cleaned
  if (cleaned.startsWith('07')) candidate = `+44${cleaned.slice(1)}`
  else if (cleaned.startsWith('447')) candidate = `+${cleaned}`
  return E164.test(candidate) ? candidate : null
}
```

- [ ] **Step 4: Run the tests**

Run: `cd web && npm test`
Expected: `Test Files  1 passed (1)`, `Tests  7 passed (7)`.

---

### Task 5: Generate `schema.d.ts` from the running API

**Files:** create `web/src/api/schema.d.ts` (generated).

- [ ] **Step 1: Start the API against the dev database**

Postgres.app must be running. From the repo root, start it in the background (it reads its credentials from `db.dev.local` itself; don't open, print or copy that file):
```bash
cd api && ./mvnw -B spring-boot:run > "$TMPDIR/ddpet-api.log" 2>&1
```
Wait until `curl -s localhost:8080/actuator/health` prints `{"status":"UP"}`. If it never does, read the end of `$TMPDIR/ddpet-api.log` (it doesn't contain credentials) and stop to report; don't change any configuration to work around it.

Starting the app runs Flyway against the dev database. There's no new migration, so it only validates. Don't send any POST to it.

- [ ] **Step 2: Generate**

Run: `cd web && npm run gen:api`
Expected: `✨ openapi-typescript 7.13.0` then `🚀 http://localhost:8080/v3/api-docs → src/api/schema.d.ts`.

**Fallback** if the API can't be started here: ask the project owner to start it and run `curl -s localhost:8080/v3/api-docs -o web/api-docs.json`. Then:
```bash
cd web && npx openapi-typescript ./api-docs.json -o src/api/schema.d.ts && rm api-docs.json
```

- [ ] **Step 3: Stop the API**

Run: `kill $(lsof -ti tcp:8080)`
Expected: `curl -s localhost:8080/actuator/health` now fails to connect.

- [ ] **Step 4: Check the names and shapes the website relies on**

```bash
cd web
grep -nE '^\s+(BookingResponse|StayResponse|ClientResponse|DogResponse|CreateBookingRequest|StayRequest|ValidationProblem|ConflictProblem|FieldError|ExistingClient): \{' src/api/schema.d.ts
grep -nE '(paidAt|notes|phone|dropOffTime|pickUpTime)\??: ' src/api/schema.d.ts
grep -nE 'status: "confirmed" \| "cancelled"|service: "day_care" \| "boarding"' src/api/schema.d.ts
```
Expected:
- All ten schema names are listed.
- In `BookingResponse`, `StayResponse`, `ClientResponse` and `ClientSummary`, those fields are not optional (no `?`) and typed `string | null`. In `StayRequest`, `dropOffTime?: string | null`; in `CreateBookingRequest`, `notes?: string | null`.
- Both enums appear as string unions.

If a schema name differs (for example springdoc qualified a nested record), use the generated name in `api/client.ts`, `types.ts` and `test/fixtures.ts` when you write them; change nothing else. If a field is optional or not nullable when it should be, go back to Task 2: the fix belongs in the API, and `OpenApiTest` should have caught it.

---

### Task 6: `api/client.ts` and `ApiError`, plus CI

**Files:** create `web/src/api/client.ts`, `web/src/api/client.test.ts`, `web/src/test/fixtures.ts`; modify `.github/workflows/web.yml`.

- [ ] **Step 1: Fixtures**

`web/src/test/fixtures.ts`:
```ts
import type { components } from '../api/schema'

type Schemas = components['schemas']

export const sarah: Schemas['ClientResponse'] = {
  id: 1,
  name: 'Sarah Lee',
  phone: '+447700900123',
  dogs: [
    { id: 11, name: 'Biscuit' },
    { id: 12, name: 'Pepper' },
  ],
}

export const tom: Schemas['ClientResponse'] = {
  id: 2,
  name: 'Tom Hall',
  phone: null,
  dogs: [{ id: 21, name: 'Rex' }],
}

export const clients: Schemas['ClientResponse'][] = [sarah, tom]

export const booking: Schemas['BookingResponse'] = {
  id: 12,
  status: 'confirmed',
  notes: 'Allergic to chicken',
  paidAt: null,
  createdAt: '2030-10-30T09:12:00Z',
  client: { id: 1, name: 'Sarah Lee', phone: '+447700900123' },
  dog: { id: 11, name: 'Biscuit' },
  total: 130,
  stays: [
    {
      id: 31,
      service: 'boarding',
      dropOffDate: '2030-11-02',
      dropOffTime: '09:00',
      pickUpDate: '2030-11-04',
      pickUpTime: null,
      unitRate: 40,
      pickupDropoffFee: 15,
      price: 95,
      status: 'confirmed',
    },
    {
      id: 32,
      service: 'day_care',
      dropOffDate: '2030-11-10',
      dropOffTime: '08:30',
      pickUpDate: '2030-11-10',
      pickUpTime: '17:00',
      unitRate: 35,
      pickupDropoffFee: 0,
      price: 35,
      status: 'confirmed',
    },
  ],
}

export const cancelledBooking: Schemas['BookingResponse'] = {
  id: 13,
  status: 'cancelled',
  notes: null,
  paidAt: null,
  createdAt: '2030-10-29T10:00:00Z',
  client: { id: 2, name: 'Tom Hall', phone: null },
  dog: { id: 21, name: 'Rex' },
  total: 0,
  stays: [
    {
      id: 33,
      service: 'day_care',
      dropOffDate: '2030-11-12',
      dropOffTime: null,
      pickUpDate: '2030-11-12',
      pickUpTime: null,
      unitRate: 35,
      pickupDropoffFee: 0,
      price: 35,
      status: 'cancelled',
    },
  ],
}
```
Dates are in 2030 so the pickers' `disablePast` never interferes.

- [ ] **Step 2: Write the failing test**

`web/src/api/client.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../test/server.ts'
import { booking, clients } from '../test/fixtures.ts'
import { ApiError, cancelBooking, createBooking, listBookings, listClients } from './client.ts'
import type { components } from './schema'

const request: components['schemas']['CreateBookingRequest'] = {
  client: { id: 1 },
  dog: { id: 11 },
  notes: null,
  stays: [
    {
      dropOffDate: '2030-11-02',
      dropOffTime: null,
      pickUpDate: '2030-11-04',
      pickUpTime: null,
      unitRate: 40,
      pickupDropoffFee: 15,
    },
  ],
}

const problemHeaders = { 'Content-Type': 'application/problem+json' }

async function failure(call: Promise<unknown>): Promise<ApiError> {
  try {
    await call
  } catch (err) {
    if (err instanceof ApiError) return err
    throw err
  }
  throw new Error('Expected the call to fail')
}

describe('api client', () => {
  it('parses the client list', async () => {
    server.use(http.get('/api/clients', () => HttpResponse.json(clients)))

    expect(await listClients()).toEqual(clients)
  })

  it('parses a booking', async () => {
    server.use(http.get('/api/bookings', () => HttpResponse.json([booking])))

    expect(await listBookings()).toEqual([booking])
  })

  it('posts the request as JSON and returns the created booking', async () => {
    let sent: unknown
    let contentType: string | null = null
    server.use(
      http.post('/api/bookings', async ({ request: req }) => {
        sent = await req.json()
        contentType = req.headers.get('Content-Type')
        return HttpResponse.json(booking, { status: 201 })
      }),
    )

    expect(await createBooking(request)).toEqual(booking)
    expect(sent).toEqual(request)
    expect(contentType).toBe('application/json')
  })

  it('cancels by id', async () => {
    let cancelledId: string | undefined
    server.use(
      http.post('/api/bookings/:id/cancel', ({ params }) => {
        cancelledId = String(params.id)
        return HttpResponse.json({ ...booking, status: 'cancelled' })
      }),
    )

    expect((await cancelBooking(12)).status).toBe('cancelled')
    expect(cancelledId).toBe('12')
  })

  it('turns a 400 into fieldErrors', async () => {
    server.use(
      http.post('/api/bookings', () =>
        HttpResponse.json(
          {
            status: 400,
            title: 'Invalid request',
            errors: [{ field: 'stays[1].pickUpDate', message: 'must not be before dropOffDate' }],
          },
          { status: 400, headers: problemHeaders },
        ),
      ),
    )

    const err = await failure(createBooking(request))
    expect(err.status).toBe(400)
    expect(err.title).toBe('Invalid request')
    expect(err.fieldErrors).toEqual([{ field: 'stays[1].pickUpDate', message: 'must not be before dropOffDate' }])
    expect(err.existingClient).toBeNull()
  })

  it('turns a 409 into existingClient', async () => {
    server.use(
      http.post('/api/bookings', () =>
        HttpResponse.json(
          {
            status: 409,
            title: 'Phone already on file',
            detail: 'This phone number already belongs to Sarah Lee. Book for that client instead.',
            existingClient: { id: 1, name: 'Sarah Lee' },
          },
          { status: 409, headers: problemHeaders },
        ),
      ),
    )

    const err = await failure(createBooking(request))
    expect(err.status).toBe(409)
    expect(err.existingClient).toEqual({ id: 1, name: 'Sarah Lee' })
    expect(err.fieldErrors).toEqual([])
  })

  it('keeps the title and detail of other problems', async () => {
    server.use(
      http.post('/api/bookings/:id/cancel', () =>
        HttpResponse.json(
          { status: 404, title: 'Not found', detail: 'Booking 99 not found' },
          { status: 404, headers: problemHeaders },
        ),
      ),
    )

    const err = await failure(cancelBooking(99))
    expect(err.status).toBe(404)
    expect(err.title).toBe('Not found')
    expect(err.detail).toBe('Booking 99 not found')
  })

  it('turns a network failure into status 0', async () => {
    server.use(http.get('/api/bookings', () => HttpResponse.error()))

    const err = await failure(listBookings())
    expect(err.status).toBe(0)
    expect(err.title).toBe('Could not reach the server')
  })
})
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `cd web && npx vitest run src/api/client.test.ts`
Expected: FAIL, `Failed to resolve import "./client.ts"`.

- [ ] **Step 4: Implement**

`web/src/api/client.ts`:
```ts
import type { components } from './schema'

type Schemas = components['schemas']
type FieldError = Schemas['FieldError']
type ExistingClient = Schemas['ExistingClient']
type ProblemBody = Partial<Schemas['ValidationProblem'] & Schemas['ConflictProblem']>

export class ApiError extends Error {
  readonly status: number
  readonly title: string
  readonly detail: string | null
  readonly fieldErrors: FieldError[]
  readonly existingClient: ExistingClient | null

  constructor(
    status: number,
    title: string,
    detail: string | null = null,
    fieldErrors: FieldError[] = [],
    existingClient: ExistingClient | null = null,
  ) {
    super(title)
    this.name = 'ApiError'
    this.status = status
    this.title = title
    this.detail = detail
    this.fieldErrors = fieldErrors
    this.existingClient = existingClient
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    // An absolute URL, because Node's fetch (used by the tests) can't resolve a relative one.
    response = await fetch(new URL(path, window.location.origin), {
      ...init,
      headers: init.body
        ? { Accept: 'application/json', 'Content-Type': 'application/json' }
        : { Accept: 'application/json' },
    })
  } catch {
    throw new ApiError(0, 'Could not reach the server')
  }
  if (!response.ok) throw await problemFrom(response)
  return (await response.json()) as T
}

async function problemFrom(response: Response): Promise<ApiError> {
  let body: ProblemBody = {}
  try {
    body = (await response.json()) as ProblemBody
  } catch {
    // Not a problem-detail body, e.g. the dev proxy's own error page.
  }
  return new ApiError(
    response.status,
    body.title || response.statusText || `Request failed (${response.status})`,
    body.detail ?? null,
    Array.isArray(body.errors) ? body.errors : [],
    body.existingClient ?? null,
  )
}

export function listClients(): Promise<Schemas['ClientResponse'][]> {
  return request<Schemas['ClientResponse'][]>('/api/clients')
}

export function listBookings(): Promise<Schemas['BookingResponse'][]> {
  return request<Schemas['BookingResponse'][]>('/api/bookings')
}

export function createBooking(body: Schemas['CreateBookingRequest']): Promise<Schemas['BookingResponse']> {
  return request<Schemas['BookingResponse']>('/api/bookings', { method: 'POST', body: JSON.stringify(body) })
}

export function cancelBooking(id: number): Promise<Schemas['BookingResponse']> {
  return request<Schemas['BookingResponse']>(`/api/bookings/${id}/cancel`, { method: 'POST' })
}
```

- [ ] **Step 5: Run the tests**

Run: `cd web && npm test`
Expected: `Test Files  2 passed (2)`, `Tests  15 passed (15)`.

- [ ] **Step 6: Add `npm test` to CI**

In `.github/workflows/web.yml`, after `- run: npm run lint` add:
```yaml
      - run: npm test
```
Node stays at 20 (all pinned versions support it).

- [ ] **Step 7: Run every check**

Run: `cd web && npm run typecheck && npm run lint && npm run build && npm test`
Expected: all four succeed. The old components are untouched so far, so the typecheck still passes.

- [ ] **Step 8: Propose the commit and commit after approval**

`@testing-library/dom` and all seven pins are already approved (see "Clarifications" 9).
```
feat(web): add a typed API client, generated types and tests

schema.d.ts is generated from the API's /v3/api-docs with
openapi-typescript (npm run gen:api). api/client.ts wraps fetch and
turns problem responses into ApiError. phone.ts turns typed UK numbers
into E.164. Vitest, Testing Library and MSW are dev-only; npm test now
runs in CI.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
Files: `web/package.json web/package-lock.json web/vite.config.ts web/eslint.config.js web/src/test web/src/phone.ts web/src/phone.test.ts web/src/api .github/workflows/web.yml`

---

### Task 7: Types and utils on the API types

**Files:** modify `web/src/types.ts`, `web/src/utils.ts`; create `web/src/utils.test.ts`.

From here until Task 10, `npm run typecheck` fails because the components still use the old types. Run only the test file named in each step.

- [ ] **Step 1: Replace `web/src/types.ts`**

```ts
import type { Dayjs } from 'dayjs'
import type { components } from './api/schema'

type Schemas = components['schemas']

export type Booking = Schemas['BookingResponse']
export type Stay = Schemas['StayResponse']
export type Client = Schemas['ClientResponse']
export type Dog = Schemas['DogResponse']
export type CreateBookingRequest = Schemas['CreateBookingRequest']
export type StayRequest = Schemas['StayRequest']
export type FieldError = Schemas['FieldError']
export type ExistingClient = Schemas['ExistingClient']
export type Service = Stay['service']

/** One day being filled in on the form, before submission. */
export interface BookingDraft {
  id: number
  dropOff: Dayjs | null
  pickUp: Dayjs | null
  timesTbd: boolean
  pickupDropoff: boolean
}

/** The client picker's value: a client on file, or the name typed for a new one. */
export type ClientChoice = { kind: 'existing'; client: Client } | { kind: 'new'; name: string }

/** The dog picker's value: one of the chosen client's dogs, or the name typed for a new one. */
export type DogChoice = { kind: 'existing'; dog: Dog } | { kind: 'new'; name: string }

/** Fields shared by every day of one booking. */
export interface SharedBookingFields {
  client: ClientChoice | null
  phone: string
  dog: DogChoice | null
  notes: string
  dayRate: number | string
  overnightRate: number | string
}

export interface SharedFieldErrors {
  client?: string
  phone?: string
  dog?: string
  notes?: string
  dayRate?: string
  overnightRate?: string
}

export interface EntryFieldErrors {
  dropOff?: string
  pickUp?: string
  pickupDropoff?: string
}
```

- [ ] **Step 2: Write the failing utils tests**

`web/src/utils.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import {
  buildCreateRequest,
  buildICS,
  deriveService,
  generateGCalLink,
  generateWhatsAppMessage,
  mapFieldErrors,
  type BookingRequestInput,
} from './utils.ts'
import { booking, sarah } from './test/fixtures.ts'
import type { BookingDraft } from './types'

function day(dropOff: string, pickUp: string, overrides: Partial<BookingDraft> = {}): BookingDraft {
  return { id: 1, dropOff: dayjs(dropOff), pickUp: dayjs(pickUp), timesTbd: false, pickupDropoff: false, ...overrides }
}

const input: BookingRequestInput = {
  client: { kind: 'existing', client: sarah },
  phone: null,
  dog: { kind: 'existing', dog: sarah.dogs[0] },
  notes: '',
  dayRate: 35,
  overnightRate: 40,
  entries: [day('2030-11-02T09:00', '2030-11-02T17:30')],
}

describe('deriveService', () => {
  it('is day care on the same date, boarding across dates, and nothing when pick-up is first', () => {
    expect(deriveService(dayjs('2030-11-02T09:00'), dayjs('2030-11-02T17:00'))).toBe('day_care')
    expect(deriveService(dayjs('2030-11-02'), dayjs('2030-11-04'))).toBe('boarding')
    expect(deriveService(dayjs('2030-11-04'), dayjs('2030-11-02'))).toBeNull()
  })
})

describe('buildCreateRequest', () => {
  it('sends a picked client and dog as ids', () => {
    const request = buildCreateRequest(input)
    expect(request.client).toEqual({ id: 1 })
    expect(request.dog).toEqual({ id: 11 })
  })

  it('sends a new client with phone and a new dog by name, trimmed', () => {
    const request = buildCreateRequest({
      ...input,
      client: { kind: 'new', name: ' Jane Doe ' },
      phone: '+447700900456',
      dog: { kind: 'new', name: 'Rolo ' },
    })
    expect(request.client).toEqual({ name: 'Jane Doe', phone: '+447700900456' })
    expect(request.dog).toEqual({ name: 'Rolo' })
  })

  it('leaves phone out for a new client without one', () => {
    const request = buildCreateRequest({ ...input, client: { kind: 'new', name: 'Jane Doe' } })
    expect(request.client).toEqual({ name: 'Jane Doe' })
  })

  it('uses the day rate for day care', () => {
    expect(buildCreateRequest(input).stays[0].unitRate).toBe(35)
  })

  it('uses the overnight rate for a multi-night stay', () => {
    const request = buildCreateRequest({ ...input, entries: [day('2030-11-02T09:00', '2030-11-05T17:00')] })
    expect(request.stays[0].unitRate).toBe(40)
  })

  it('sends a 15.00 fee when the pickup tick box is ticked, else 0', () => {
    const request = buildCreateRequest({
      ...input,
      entries: [
        day('2030-11-02T09:00', '2030-11-02T17:00', { pickupDropoff: true }),
        day('2030-11-03T09:00', '2030-11-03T17:00', { id: 2 }),
      ],
    })
    expect(request.stays.map((stay) => stay.pickupDropoffFee)).toEqual([15, 0])
  })

  it('sends null times when times are TBD', () => {
    const request = buildCreateRequest({
      ...input,
      entries: [day('2030-11-02', '2030-11-04', { timesTbd: true })],
    })
    expect(request.stays[0]).toMatchObject({
      dropOffDate: '2030-11-02',
      dropOffTime: null,
      pickUpDate: '2030-11-04',
      pickUpTime: null,
    })
  })

  it('sends HH:mm times for a day with times', () => {
    expect(buildCreateRequest(input).stays[0]).toMatchObject({
      dropOffDate: '2030-11-02',
      dropOffTime: '09:00',
      pickUpDate: '2030-11-02',
      pickUpTime: '17:30',
    })
  })

  it('trims notes and sends blank notes as null', () => {
    expect(buildCreateRequest({ ...input, notes: '  Allergic to chicken ' }).notes).toBe('Allergic to chicken')
    expect(buildCreateRequest({ ...input, notes: '   ' }).notes).toBeNull()
  })
})

describe('mapFieldErrors', () => {
  it('maps API field paths to the form inputs they belong to', () => {
    const entries = [day('2030-11-02', '2030-11-02', { id: 7 }), day('2030-11-03', '2030-11-05', { id: 8 })]

    const mapped = mapFieldErrors(
      [
        { field: 'client.phone', message: 'bad phone' },
        { field: 'dog', message: 'give either id or name' },
        { field: 'notes', message: 'too long' },
        { field: 'stays[1].pickUpDate', message: 'too many nights' },
        { field: 'stays[0].unitRate', message: 'day rate too big' },
        { field: 'stays[1].unitRate', message: 'overnight rate too big' },
        { field: 'stays[0].pickupDropoffFee', message: 'negative' },
        { field: 'stays', message: 'must not be empty' },
        { field: 'somethingElse', message: 'odd' },
      ],
      entries,
    )

    expect(mapped.shared).toEqual({
      phone: 'bad phone',
      dog: 'give either id or name',
      notes: 'too long',
      dayRate: 'day rate too big',
      overnightRate: 'overnight rate too big',
    })
    expect(mapped.entries).toEqual({ 7: { pickupDropoff: 'negative' }, 8: { pickUp: 'too many nights' } })
    expect(mapped.stays).toBe('must not be empty')
    expect(mapped.unmapped).toEqual(['somethingElse: odd'])
  })
})

describe('calendar events', () => {
  it("gives each day's event a UID from its stay id", () => {
    expect(buildICS(booking, booking.stays[0])).toContain('UID:stay-31@dogsitting.app')
    expect(buildICS(booking, booking.stays[1])).toContain('UID:stay-32@dogsitting.app')
  })

  it('makes an all-day event when a time is TBD and a timed one otherwise', () => {
    const tbd = buildICS(booking, booking.stays[0])
    expect(tbd).toContain('DTSTART;VALUE=DATE:20301102')
    expect(tbd).toContain('DTEND;VALUE=DATE:20301105')

    const timed = buildICS(booking, booking.stays[1])
    expect(timed).toContain('DTSTART:20301110T083000')
    expect(timed).toContain('DTEND:20301110T170000')
    expect(timed).toContain('SUMMARY:Dog Sitting – Biscuit (Day Care)')
  })

  it('links one Google Calendar event per day', () => {
    const link = generateGCalLink(booking, booking.stays[1])
    expect(link).toContain('&dates=20301110T083000/20301110T170000')
    expect(link).toContain(encodeURIComponent('Dog Sitting – Biscuit (Day Care)'))
  })
})

describe('generateWhatsAppMessage', () => {
  it('lists each day with the server prices, the notes and the total', () => {
    const msg = generateWhatsAppMessage(booking)

    expect(msg).toContain('Hi Sarah Lee! 🐾')
    expect(msg).toContain('Your 2 bookings are confirmed:')
    expect(msg).toContain('— Booking 1 (Boarding) —')
    expect(msg).toContain('📅 Drop-off: Sat, 2 Nov 2030 at 9:00 AM')
    expect(msg).toContain('📅 Pick-up: Mon, 4 Nov 2030 (time TBD)')
    expect(msg).toContain('💷 Price: £95.00')
    expect(msg).toContain('🚗 Pickup & drop-off service: included')
    expect(msg).toContain('📝 Notes: Allergic to chicken')
    expect(msg).toContain('💷 Total: £130.00')
    expect(msg).toContain('We look forward to looking after Biscuit! 🐶')
  })
})
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `cd web && npx vitest run src/utils.test.ts`
Expected: FAIL. `buildCreateRequest`, `mapFieldErrors` and `buildICS` aren't exported yet (`is not a function`), and `deriveService` returns `"Day Care"` rather than `"day_care"`.

- [ ] **Step 4: Replace `web/src/utils.ts`**

```ts
import dayjs, { type Dayjs } from "dayjs";
import type {
  Booking,
  BookingDraft,
  ClientChoice,
  CreateBookingRequest,
  DogChoice,
  EntryFieldErrors,
  FieldError,
  Service,
  SharedFieldErrors,
  Stay,
  StayRequest,
} from "./types";

export const PICKUP_DROPOFF_FEE = 15;

export const SERVICE_LABEL: Record<Service, string> = {
  day_care: "Day Care",
  boarding: "Boarding",
};

export const SERVICE_COLOR: Record<Service, "success" | "warning"> = {
  day_care: "success",
  boarding: "warning",
};

function nightsBetween(dropOff: Dayjs | null, pickUp: Dayjs | null): number | null {
  if (!dropOff || !pickUp || !dropOff.isValid() || !pickUp.isValid()) return null;
  const nights = pickUp.startOf("day").diff(dropOff.startOf("day"), "day");
  return nights < 0 ? null : nights;
}

export function deriveService(dropOff: Dayjs | null, pickUp: Dayjs | null): Service | null {
  const nights = nightsBetween(dropOff, pickUp);
  if (nights === null) return null;
  return nights === 0 ? "day_care" : "boarding";
}

export function calcPrice(
  dropOff: Dayjs | null,
  pickUp: Dayjs | null,
  pickupDropoff: boolean,
  dayRate: number | string,
  overnightRate: number | string
): number | null {
  const nights = nightsBetween(dropOff, pickUp);
  if (nights === null) return null;
  const base = nights === 0 ? Number(dayRate) : nights * Number(overnightRate);
  return base + (pickupDropoff ? PICKUP_DROPOFF_FEE : 0);
}

export function priceBreakdown(
  dropOff: Dayjs | null,
  pickUp: Dayjs | null,
  pickupDropoff: boolean,
  dayRate: number | string,
  overnightRate: number | string
): string {
  const nights = nightsBetween(dropOff, pickUp);
  if (nights === null) return "";
  const parts: string[] = [];
  if (nights === 0) parts.push(`Day care × £${dayRate}`);
  else parts.push(`${nights} night${nights > 1 ? "s" : ""} × £${overnightRate}`);
  if (pickupDropoff) parts.push(`pickup/drop-off +£${PICKUP_DROPOFF_FEE}`);
  return parts.join(" · ");
}

export interface BookingRequestInput {
  client: ClientChoice;
  phone: string | null;
  dog: DogChoice;
  notes: string;
  dayRate: number;
  overnightRate: number;
  entries: BookingDraft[];
}

function clientRef(client: ClientChoice, phone: string | null): CreateBookingRequest["client"] {
  if (client.kind === "existing") return { id: client.client.id };
  const name = client.name.trim();
  return phone ? { name, phone } : { name };
}

function dogRef(dog: DogChoice): CreateBookingRequest["dog"] {
  return dog.kind === "existing" ? { id: dog.dog.id } : { name: dog.name.trim() };
}

function toStayRequest(entry: BookingDraft, dayRate: number, overnightRate: number): StayRequest {
  const { dropOff, pickUp } = entry;
  if (!dropOff || !pickUp) throw new Error("Validate the form before building the request");
  return {
    dropOffDate: dropOff.format("YYYY-MM-DD"),
    dropOffTime: entry.timesTbd ? null : dropOff.format("HH:mm"),
    pickUpDate: pickUp.format("YYYY-MM-DD"),
    pickUpTime: entry.timesTbd ? null : pickUp.format("HH:mm"),
    unitRate: dropOff.isSame(pickUp, "day") ? dayRate : overnightRate,
    pickupDropoffFee: entry.pickupDropoff ? PICKUP_DROPOFF_FEE : 0,
  };
}

export function buildCreateRequest(input: BookingRequestInput): CreateBookingRequest {
  const notes = input.notes.trim();
  return {
    client: clientRef(input.client, input.phone),
    dog: dogRef(input.dog),
    notes: notes || null,
    stays: input.entries.map((entry) => toStayRequest(entry, input.dayRate, input.overnightRate)),
  };
}

export interface MappedErrors {
  shared: SharedFieldErrors;
  entries: Record<number, EntryFieldErrors>;
  stays: string | null;
  unmapped: string[];
}

const SHARED_TARGETS = new Map<string, keyof SharedFieldErrors>([
  ["client", "client"],
  ["client.name", "client"],
  ["client.phone", "phone"],
  ["dog", "dog"],
  ["dog.name", "dog"],
  ["notes", "notes"],
]);

const STAY_TARGETS = new Map<string, keyof EntryFieldErrors>([
  ["dropOffDate", "dropOff"],
  ["dropOffTime", "dropOff"],
  ["pickUpDate", "pickUp"],
  ["pickUpTime", "pickUp"],
  ["pickupDropoffFee", "pickupDropoff"],
]);

/** Puts each API field error on the form input it names; anything else goes to `unmapped`. */
export function mapFieldErrors(errors: FieldError[], entries: BookingDraft[]): MappedErrors {
  const mapped: MappedErrors = { shared: {}, entries: {}, stays: null, unmapped: [] };
  for (const { field, message } of errors) {
    const stayField = /^stays\[(\d+)\]\.(\w+)$/.exec(field);
    const entry = stayField ? entries[Number(stayField[1])] : undefined;
    const stayProperty = stayField ? stayField[2] : undefined;
    const sharedTarget = SHARED_TARGETS.get(field);
    const stayTarget = stayProperty ? STAY_TARGETS.get(stayProperty) : undefined;
    if (sharedTarget) {
      mapped.shared[sharedTarget] = message;
    } else if (field === "stays") {
      mapped.stays = message;
    } else if (entry && stayProperty === "unitRate") {
      const rate = deriveService(entry.dropOff, entry.pickUp) === "day_care" ? "dayRate" : "overnightRate";
      mapped.shared[rate] = message;
    } else if (entry && stayTarget) {
      mapped.entries[entry.id] = { ...mapped.entries[entry.id], [stayTarget]: message };
    } else {
      mapped.unmapped.push(`${field}: ${message}`);
    }
  }
  return mapped;
}

function formatDateTime(date: string, time: string | null): string {
  if (!time) return dayjs(date).format("ddd, D MMM YYYY");
  return dayjs(`${date}T${time}`).format("ddd, D MMM YYYY [at] h:mm A");
}

/** A day's date and time for display; "(time TBD)" when the time isn't set. */
export function fmt(date: string, time: string | null): string {
  return time ? formatDateTime(date, time) : `${formatDateTime(date, null)} (time TBD)`;
}

export function generateWhatsAppMessage(booking: Booking): string {
  const { stays } = booking;
  const ownerName = booking.client.name;
  const dogName = booking.dog.name;
  const lines = [
    `Hi ${ownerName}! 🐾`,
    "",
    stays.length > 1 ? `Your ${stays.length} bookings are confirmed:` : "Your booking is confirmed:",
    `🐕 Dog: ${dogName}`,
    "",
  ];
  stays.forEach((stay, i) => {
    const service = SERVICE_LABEL[stay.service];
    if (stays.length > 1) lines.push(`— Booking ${i + 1} (${service}) —`);
    else lines.push(`📋 Service: ${service}`);
    lines.push(
      `📅 Drop-off: ${formatDateTime(stay.dropOffDate, stay.dropOffTime)}${stay.dropOffTime ? "" : " (time TBD)"}`,
      `📅 Pick-up: ${formatDateTime(stay.pickUpDate, stay.pickUpTime)}${stay.pickUpTime ? "" : " (time TBD)"}`,
      `💷 Price: £${stay.price.toFixed(2)}`
    );
    if (stay.pickupDropoffFee > 0) lines.push("🚗 Pickup & drop-off service: included");
    if (!stay.dropOffTime || !stay.pickUpTime) lines.push("⏰ Will confirm the exact time closer to the date");
    lines.push("");
  });
  if (booking.notes) lines.push(`📝 Notes: ${booking.notes}`, "");
  if (stays.length > 1) lines.push(`💷 Total: £${booking.total.toFixed(2)}`, "");
  lines.push(`We look forward to looking after ${dogName}! 🐶`);
  return lines.join("\n");
}

export function generateWhatsAppLink(msg: string): string {
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}

interface EventDates {
  allDay: boolean;
  start: string;
  end: string;
}

function eventDates(stay: Stay): EventDates {
  const { dropOffDate, dropOffTime, pickUpDate, pickUpTime } = stay;
  if (dropOffTime && pickUpTime) {
    return {
      allDay: false,
      start: dayjs(`${dropOffDate}T${dropOffTime}`).format("YYYYMMDDTHHmm00"),
      end: dayjs(`${pickUpDate}T${pickUpTime}`).format("YYYYMMDDTHHmm00"),
    };
  }
  return {
    allDay: true,
    start: dayjs(dropOffDate).format("YYYYMMDD"),
    end: dayjs(pickUpDate).add(1, "day").format("YYYYMMDD"),
  };
}

function calendarTitle(booking: Booking, stay: Stay): string {
  return `Dog Sitting – ${booking.dog.name} (${SERVICE_LABEL[stay.service]})`;
}

export function generateGCalLink(booking: Booking, stay: Stay): string {
  const { allDay, start, end } = eventDates(stay);
  const details = [
    `Owner: ${booking.client.name}`,
    `Price: £${stay.price.toFixed(2)}`,
    allDay ? "Times to be confirmed" : "",
    booking.notes ? `Notes: ${booking.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return (
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    `&text=${encodeURIComponent(calendarTitle(booking, stay))}` +
    `&dates=${start}/${end}` +
    `&details=${encodeURIComponent(details)}`
  );
}

export function buildICS(booking: Booking, stay: Stay, now: Dayjs = dayjs()): string {
  const { allDay, start, end } = eventDates(stay);
  const description = [
    `Owner: ${booking.client.name}`,
    `Price: £${stay.price.toFixed(2)}`,
    booking.notes ? `Notes: ${booking.notes}` : "",
  ]
    .filter(Boolean)
    .join("\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Dog Sitting Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:stay-${stay.id}@dogsitting.app`,
    `DTSTAMP:${now.format("YYYYMMDDTHHmm00")}`,
    allDay ? `DTSTART;VALUE=DATE:${start}` : `DTSTART:${start}`,
    allDay ? `DTEND;VALUE=DATE:${end}` : `DTEND:${end}`,
    `SUMMARY:${calendarTitle(booking, stay)}`,
    `DESCRIPTION:${description}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadICS(booking: Booking, stay: Stay): void {
  const blob = new Blob([buildICS(booking, stay)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${booking.dog.name.toLowerCase().replace(/\s+/g, "-")}-sitting.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```
What changed from today, and why:
- `deriveService` returns the API's `day_care`/`boarding`; labels and chip colours come from `SERVICE_LABEL`/`SERVICE_COLOR`.
- `fmt` takes a date and a nullable time instead of an ISO string and a TBD flag.
- The unused single-booking `generateWhatsAppMessage` is gone; the multi-day one takes its name and works on one `Booking`. The text is the same, except that notes appear once, after the days.
- Calendar helpers take a booking and one stay; `buildICS` is split out of `downloadICS` so the UID can be tested.
- New: `buildCreateRequest` and `mapFieldErrors`.

- [ ] **Step 5: Run the utils tests**

Run: `cd web && npx vitest run src/utils.test.ts`
Expected: `Tests  15 passed (15)`.

---

### Task 8: Pickers, day card and booking form

**Files:** create `web/src/components/ClientPicker.tsx`, `web/src/components/DogPicker.tsx`, `web/src/components/BookingForm.test.tsx`; modify `web/src/components/BookingEntry.tsx`, `web/src/components/BookingForm.tsx`.

- [ ] **Step 1: Write the failing form tests**

`web/src/components/BookingForm.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import BookingForm from './BookingForm.tsx'
import Providers from '../test/Providers.tsx'
import { server } from '../test/server.ts'
import { booking, clients } from '../test/fixtures.ts'
import type { Client, CreateBookingRequest } from '../types'

const problemHeaders = { 'Content-Type': 'application/problem+json' }

function renderForm(clientList: Client[] = clients) {
  const onCreated = vi.fn()
  render(<BookingForm clients={clientList} onCreated={onCreated} />, { wrapper: Providers })
  return { user: userEvent.setup(), onCreated }
}

function captureCreate(): CreateBookingRequest[] {
  const requests: CreateBookingRequest[] = []
  server.use(
    http.post('/api/bookings', async ({ request }) => {
      requests.push((await request.json()) as CreateBookingRequest)
      return HttpResponse.json(booking, { status: 201 })
    }),
  )
  return requests
}

// MUI X pickers keep a hidden <input> (the one the label points at) whose change event parses the field's text format.
function setDate(label: string, day: number, value: string) {
  fireEvent.change(screen.getAllByLabelText(label, { selector: 'input' })[day], { target: { value } })
}

function fillDay(day: number, dropOff: string, pickUp: string) {
  setDate('Drop-off Date', day, dropOff)
  setDate('Pick-up Date', day, pickUp)
}

const owner = () => screen.getByRole('combobox', { name: 'Owner' }) as HTMLInputElement
const dog = () => screen.getByRole('combobox', { name: 'Dog' }) as HTMLInputElement
const phone = () => screen.queryByLabelText('Phone (optional)') as HTMLInputElement | null

async function pickClient(user: UserEvent, typed: string, name: string) {
  await user.type(owner(), typed)
  await user.click(screen.getByRole('option', { name: new RegExp(name) }))
}

async function pickDog(user: UserEvent, typed: string, name: string) {
  await user.type(dog(), typed)
  await user.click(screen.getByRole('option', { name }))
}

const submit = (user: UserEvent) => user.click(screen.getByRole('button', { name: 'Create Booking' }))

describe('client and dog pickers', () => {
  it('suggests clients matching what is typed', async () => {
    const { user } = renderForm()

    await user.type(owner(), 'sar')

    expect(screen.getByRole('option', { name: /Sarah Lee/ })).toBeTruthy()
    expect(screen.queryByRole('option', { name: /Tom Hall/ })).toBeNull()
  })

  it('sends a picked client and dog as ids', async () => {
    const requests = captureCreate()
    const { user, onCreated } = renderForm()

    await pickClient(user, 'sar', 'Sarah Lee')
    await pickDog(user, 'bis', 'Biscuit')
    expect(phone()).toBeNull()
    fillDay(0, '02/11/2030', '04/11/2030')
    await submit(user)

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(booking))
    expect(requests[0].client).toEqual({ id: 1 })
    expect(requests[0].dog).toEqual({ id: 11 })
  })

  it('reveals Phone for a new client and sends name and phone', async () => {
    const requests = captureCreate()
    const { user } = renderForm()
    expect(phone()).toBeNull()

    await user.type(owner(), 'Jane Doe')
    await user.type(phone() as HTMLInputElement, '07700 900456')
    await user.type(dog(), 'Rolo')
    fillDay(0, '02/11/2030', '02/11/2030')
    await submit(user)

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0].client).toEqual({ name: 'Jane Doe', phone: '+447700900456' })
    expect(requests[0].dog).toEqual({ name: 'Rolo' })
  })

  it('rejects a phone that is not a UK mobile or international number, sending nothing', async () => {
    const requests = captureCreate()
    const { user } = renderForm()

    await user.type(owner(), 'Jane Doe')
    await user.type(phone() as HTMLInputElement, '020 7946 0000')
    await user.type(dog(), 'Rolo')
    fillDay(0, '02/11/2030', '02/11/2030')
    await submit(user)

    expect(await screen.findByText('Enter a UK mobile or international number')).toBeTruthy()
    expect(requests).toHaveLength(0)
  })

  it("lists only the chosen client's dogs", async () => {
    const { user } = renderForm()

    await pickClient(user, 'tom', 'Tom Hall')
    await user.type(dog(), 'r')
    expect(screen.getByRole('option', { name: 'Rex' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: 'Pepper' })).toBeNull()

    await user.clear(owner())
    await pickClient(user, 'sar', 'Sarah Lee')
    await user.clear(dog())
    await user.type(dog(), 'r')
    expect(screen.getByRole('option', { name: 'Pepper' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: 'Rex' })).toBeNull()
  })
})

describe('duplicate-client warning', () => {
  const messySarah = '  sarah   LEE '

  it('warns when a typed new name matches an existing client, ignoring case and spaces', async () => {
    const { user } = renderForm()

    await user.type(owner(), messySarah)

    expect(screen.getByText('Sarah Lee is already a client — use them?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Use Sarah Lee' })).toBeTruthy()
    expect(screen.queryByText(/Pick from the list/)).toBeNull()
  })

  it('switches the request to the existing client when the button is clicked', async () => {
    const requests = captureCreate()
    const { user, onCreated } = renderForm()

    await user.type(owner(), messySarah)
    await user.click(screen.getByRole('button', { name: 'Use Sarah Lee' }))
    expect(owner().value).toBe('Sarah Lee')
    expect(screen.queryByText(/is already a client/)).toBeNull()
    expect(phone()).toBeNull()
    await pickDog(user, 'bis', 'Biscuit')
    fillDay(0, '02/11/2030', '04/11/2030')
    await submit(user)

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(booking))
    expect(requests[0].client).toEqual({ id: 1 })
  })

  it('still creates a new client when submitted without using the button', async () => {
    const requests = captureCreate()
    const { user } = renderForm()

    await user.type(owner(), messySarah)
    await user.type(phone() as HTMLInputElement, '07700 900999')
    await user.type(dog(), 'Biscuit')
    fillDay(0, '02/11/2030', '04/11/2030')
    await submit(user)

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0].client).toEqual({ name: 'sarah   LEE', phone: '+447700900999' })
    expect(requests[0].dog).toEqual({ name: 'Biscuit' })
  })

  it('offers the first match and says to pick from the list when several clients share the name', async () => {
    const otherSarah: Client = { id: 3, name: 'Sarah  Lee', phone: null, dogs: [] }
    const { user } = renderForm([...clients, otherSarah])

    await user.type(owner(), messySarah)

    expect(screen.getByRole('button', { name: 'Use Sarah Lee' })).toBeTruthy()
    expect(screen.getByText('Pick from the list to choose between clients named Sarah Lee')).toBeTruthy()
  })
})

describe('errors from the API', () => {
  it("shows a field error under the input it names (stays[1].pickUpDate under day 2's pick-up)", async () => {
    server.use(
      http.post('/api/bookings', () =>
        HttpResponse.json(
          {
            status: 400,
            title: 'Invalid request',
            errors: [{ field: 'stays[1].pickUpDate', message: 'must be at most 60 nights after dropOffDate' }],
          },
          { status: 400, headers: problemHeaders },
        ),
      ),
    )
    const { user } = renderForm()

    await pickClient(user, 'sar', 'Sarah Lee')
    await pickDog(user, 'bis', 'Biscuit')
    await user.click(screen.getByRole('button', { name: 'Add another day' }))
    fillDay(0, '02/11/2030', '04/11/2030')
    fillDay(1, '10/11/2030', '12/11/2030')
    await submit(user)

    const day2 = screen.getByRole('region', { name: 'Day 2' })
    expect(await within(day2).findByText('must be at most 60 nights after dropOffDate')).toBeTruthy()
    const day1 = screen.getByRole('region', { name: 'Day 1' })
    expect(within(day1).queryByText('must be at most 60 nights after dropOffDate')).toBeNull()
  })

  it('offers to switch to the client who has the phone (409), sending nothing until resubmitted', async () => {
    const requests: CreateBookingRequest[] = []
    server.use(
      http.post('/api/bookings', async ({ request }) => {
        const body = (await request.json()) as CreateBookingRequest
        requests.push(body)
        if (body.client.id === undefined) {
          return HttpResponse.json(
            {
              status: 409,
              title: 'Phone already on file',
              detail: 'This phone number already belongs to Sarah Lee. Book for that client instead.',
              existingClient: { id: 1, name: 'Sarah Lee' },
            },
            { status: 409, headers: problemHeaders },
          )
        }
        return HttpResponse.json(booking, { status: 201 })
      }),
    )
    const { user, onCreated } = renderForm()

    await user.type(owner(), 'S Lee')
    await user.type(phone() as HTMLInputElement, '07700900123')
    await user.type(dog(), 'Biscuit')
    fillDay(0, '02/11/2030', '04/11/2030')
    await submit(user)

    expect(await screen.findByText(/This number belongs to/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Use Sarah Lee' }))
    expect(owner().value).toBe('Sarah Lee')
    expect(phone()).toBeNull()
    expect(requests).toHaveLength(1)

    await submit(user)
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(booking))
    expect(requests[1].client).toEqual({ id: 1 })
    expect(requests[1].dog).toEqual({ name: 'Biscuit' })
  })

  it('keeps everything typed when the network fails', async () => {
    server.use(http.post('/api/bookings', () => HttpResponse.error()))
    const { user } = renderForm()

    await pickClient(user, 'sar', 'Sarah Lee')
    await pickDog(user, 'bis', 'Biscuit')
    await user.type(screen.getByLabelText('Notes'), 'Allergic to chicken')
    fillDay(0, '02/11/2030', '04/11/2030')
    await submit(user)

    expect(await screen.findByText('Could not reach the server')).toBeTruthy()
    expect(owner().value).toBe('Sarah Lee')
    expect(dog().value).toBe('Biscuit')
    expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Allergic to chicken')
    const dropOff = screen.getAllByLabelText('Drop-off Date', { selector: 'input' })[0] as HTMLInputElement
    expect(dropOff.value).toBe('02/11/2030')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd web && npx vitest run src/components/BookingForm.test.tsx`
Expected: FAIL. `Unable to find an accessible element with the role "combobox" and name "Owner"` (the form still has free-text fields).

- [ ] **Step 3: `ClientPicker`**

`web/src/components/ClientPicker.tsx`:
```tsx
import { Alert, Autocomplete, Box, Button, TextField, Typography } from '@mui/material'
import type { Client, ClientChoice } from '../types'

interface ClientPickerProps {
  clients: Client[]
  value: ClientChoice | null
  onChange: (value: ClientChoice | null) => void
  error?: string
}

function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

export default function ClientPicker({ clients, value, onChange, error }: ClientPickerProps) {
  const sameName =
    value?.kind === 'new' && value.name.trim()
      ? clients.filter((c) => normaliseName(c.name) === normaliseName(value.name))
      : []
  const match = sameName[0]

  return (
    <Box sx={{ width: '100%' }}>
      <Autocomplete<Client, false, false, true>
        freeSolo
        fullWidth
        options={clients}
        value={value?.kind === 'existing' ? value.client : null}
        inputValue={value === null ? '' : value.kind === 'existing' ? value.client.name : value.name}
        getOptionLabel={(option) => (typeof option === 'string' ? option : option.name)}
        isOptionEqualToValue={(option, selected) => option.id === selected.id}
        onChange={(_, selected) => {
          if (selected === null) onChange(null)
          else if (typeof selected === 'string') onChange({ kind: 'new', name: selected })
          else onChange({ kind: 'existing', client: selected })
        }}
        onInputChange={(_, text, reason) => {
          if (reason === 'input') onChange(text ? { kind: 'new', name: text } : null)
          if (reason === 'clear') onChange(null)
        }}
        renderOption={(props, option) => {
          const { key, ...optionProps } = props
          return (
            <li key={key} {...optionProps}>
              {option.name}
              {option.phone && (
                <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                  {option.phone}
                </Typography>
              )}
            </li>
          )
        }}
        renderInput={(params) => <TextField {...params} label="Owner" error={!!error} helperText={error} />}
      />
      {match && (
        <Alert
          severity="info"
          sx={{ mt: 1 }}
          action={
            <Button color="inherit" size="small" onClick={() => onChange({ kind: 'existing', client: match })}>
              Use {match.name}
            </Button>
          }
        >
          {match.name} is already a client — use them?
          {sameName.length > 1 && (
            <Box>Pick from the list to choose between clients named {match.name}</Box>
          )}
        </Alert>
      )}
    </Box>
  )
}
```
- Typing makes the value a new client with exactly the text typed (spaces included, so the duplicate check sees them); picking a suggestion makes it an existing client. MUI's own `reset`/`selectOption` input events are ignored because the input text is derived from the value. `BookingForm` treats a blank new name as missing, and `buildCreateRequest` trims it before sending.
- **Duplicate-client warning (owner decision):** when the typed name matches an existing client's name after trimming, collapsing inner whitespace and lowercasing, an info box under the field offers "Use {name}", which switches to that client (`client: { id }`). With several matches it uses the first in `/api/clients` order and adds "Pick from the list to choose between clients named {name}". It never blocks submitting: two people can share a name, so submitting anyway sends `{ name, phone }`.
- `normaliseName` isn't exported, so the file still only exports a component (react-refresh lint rule).

- [ ] **Step 4: `DogPicker`**

`web/src/components/DogPicker.tsx`:
```tsx
import { Autocomplete, TextField } from '@mui/material'
import type { Dog, DogChoice } from '../types'

interface DogPickerProps {
  dogs: Dog[]
  value: DogChoice | null
  onChange: (value: DogChoice | null) => void
  error?: string
}

export default function DogPicker({ dogs, value, onChange, error }: DogPickerProps) {
  return (
    <Autocomplete<Dog, false, false, true>
      freeSolo
      fullWidth
      options={dogs}
      value={value?.kind === 'existing' ? value.dog : null}
      inputValue={value === null ? '' : value.kind === 'existing' ? value.dog.name : value.name}
      getOptionLabel={(option) => (typeof option === 'string' ? option : option.name)}
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      onChange={(_, selected) => {
        if (selected === null) onChange(null)
        else if (typeof selected === 'string') onChange({ kind: 'new', name: selected })
        else onChange({ kind: 'existing', dog: selected })
      }}
      onInputChange={(_, text, reason) => {
        if (reason === 'input') onChange(text ? { kind: 'new', name: text } : null)
        if (reason === 'clear') onChange(null)
      }}
      renderInput={(params) => <TextField {...params} label="Dog" error={!!error} helperText={error} />}
    />
  )
}
```

- [ ] **Step 5: Replace `web/src/components/BookingEntry.tsx`**

```tsx
import type { ChangeEvent } from 'react'
import {
  Box,
  Card,
  CardContent,
  Checkbox,
  Chip,
  FormControlLabel,
  FormHelperText,
  IconButton,
  Stack,
  Typography,
} from '@mui/material'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import DeleteOutlineIcon from '@mui/icons-material/Delete'
import dayjs, { type Dayjs } from 'dayjs'
import { SERVICE_COLOR, SERVICE_LABEL, calcPrice, deriveService, priceBreakdown } from '../utils.ts'
import type { BookingDraft, EntryFieldErrors } from '../types'

interface BookingEntryProps {
  entry: BookingDraft
  onChange: (updated: BookingDraft) => void
  onRemove: (() => void) | null
  index: number
  errors?: EntryFieldErrors
  dayRate: number | string
  overnightRate: number | string
}

export default function BookingEntry({
  entry,
  onChange,
  onRemove,
  index,
  errors = {},
  dayRate,
  overnightRate,
}: BookingEntryProps) {
  const handleChange =
    (field: 'dropOff' | 'pickUp') => (val: Dayjs | null) =>
      onChange({ ...entry, [field]: val })
  const handlePickupDropoffChange = (e: ChangeEvent<HTMLInputElement>) =>
    onChange({ ...entry, pickupDropoff: e.target.checked })
  const handleTimesTbdChange = (e: ChangeEvent<HTMLInputElement>) => {
    const tbd = e.target.checked
    const updated = { ...entry, timesTbd: tbd }
    if (tbd) {
      if (updated.dropOff) updated.dropOff = dayjs(updated.dropOff).startOf('day')
      if (updated.pickUp) updated.pickUp = dayjs(updated.pickUp).startOf('day')
    }
    onChange(updated)
  }

  const price = calcPrice(entry.dropOff, entry.pickUp, entry.pickupDropoff, dayRate, overnightRate)
  const service = deriveService(entry.dropOff, entry.pickUp)

  return (
    <Card component="section" aria-label={`Day ${index + 1}`} variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 700 }}>
              Day {index + 1}
            </Typography>
            {onRemove && (
              <IconButton size="small" color="error" onClick={onRemove} aria-label="Remove day">
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            )}
          </Stack>

          <FormControlLabel
            control={<Checkbox checked={entry.timesTbd} onChange={handleTimesTbdChange} size="small" />}
            label={
              <Typography variant="body2">
                Times TBD{' '}
                <Typography component="span" variant="body2" color="text.secondary">
                  (saves as all-day)
                </Typography>
              </Typography>
            }
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            {entry.timesTbd ? (
              <DatePicker
                label="Drop-off Date"
                value={entry.dropOff}
                onChange={handleChange('dropOff')}
                disablePast
                slotProps={{
                  textField: { fullWidth: true, size: 'small', error: !!errors.dropOff, helperText: errors.dropOff },
                }}
              />
            ) : (
              <DateTimePicker
                label="Drop-off Date & Time"
                value={entry.dropOff}
                onChange={handleChange('dropOff')}
                disablePast
                slotProps={{
                  textField: { fullWidth: true, size: 'small', error: !!errors.dropOff, helperText: errors.dropOff },
                }}
              />
            )}
            {entry.timesTbd ? (
              <DatePicker
                label="Pick-up Date"
                value={entry.pickUp}
                onChange={handleChange('pickUp')}
                disablePast
                minDate={entry.dropOff ?? undefined}
                slotProps={{
                  textField: { fullWidth: true, size: 'small', error: !!errors.pickUp, helperText: errors.pickUp },
                }}
              />
            ) : (
              <DateTimePicker
                label="Pick-up Date & Time"
                value={entry.pickUp}
                onChange={handleChange('pickUp')}
                disablePast
                minDateTime={entry.dropOff ?? undefined}
                slotProps={{
                  textField: { fullWidth: true, size: 'small', error: !!errors.pickUp, helperText: errors.pickUp },
                }}
              />
            )}
          </Stack>

          <Box>
            <FormControlLabel
              control={
                <Checkbox checked={entry.pickupDropoff} onChange={handlePickupDropoffChange} size="small" />
              }
              label={
                <Typography variant="body2">
                  Include pickup &amp; drop-off service{' '}
                  <Typography component="span" variant="body2" color="text.secondary">
                    (+£15)
                  </Typography>
                </Typography>
              }
            />
            {errors.pickupDropoff && <FormHelperText error>{errors.pickupDropoff}</FormHelperText>}
          </Box>

          {service && (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Chip label={SERVICE_LABEL[service]} size="small" color={SERVICE_COLOR[service]} />
              {price !== null && (
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  £{price.toFixed(2)}
                </Typography>
              )}
              {price !== null && (
                <Typography variant="caption" color="text.secondary">
                  {priceBreakdown(entry.dropOff, entry.pickUp, entry.pickupDropoff, dayRate, overnightRate)}
                </Typography>
              )}
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}
```
Compared with today: "Booking *n*" is "Day *n*" (a `<section>` named after it, so errors can be found per day), the per-day notes are gone, the fee checkbox can show an error, and the chip uses the API service values. The date pickers and price preview are unchanged.

- [ ] **Step 6: Replace `web/src/components/BookingForm.tsx`**

```tsx
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Alert, AlertTitle, Box, Button, Divider, Stack, TextField, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import PetsIcon from '@mui/icons-material/Pets'
import dayjs from 'dayjs'
import BookingEntry from './BookingEntry.tsx'
import ClientPicker from './ClientPicker.tsx'
import DogPicker from './DogPicker.tsx'
import { ApiError, createBooking } from '../api/client.ts'
import { PHONE_ERROR, toE164 } from '../phone.ts'
import { buildCreateRequest, calcPrice, mapFieldErrors } from '../utils.ts'
import type {
  Booking,
  BookingDraft,
  Client,
  ClientChoice,
  DogChoice,
  EntryFieldErrors,
  ExistingClient,
  SharedBookingFields,
  SharedFieldErrors,
} from '../types'

function newEntry(index: number): BookingDraft {
  return {
    id: Date.now() + index,
    dropOff: null,
    pickUp: null,
    timesTbd: true,
    pickupDropoff: false,
  }
}

const emptyShared: SharedBookingFields = {
  client: null,
  phone: '',
  dog: null,
  notes: '',
  dayRate: 35,
  overnightRate: 40,
}

/** A dog typed by name is kept for any client; a dog on file is kept only while its client stays chosen. */
function keepDog(dog: DogChoice | null, client: ClientChoice | null): DogChoice | null {
  if (dog?.kind !== 'existing') return dog
  return client?.kind === 'existing' && client.client.dogs.some((d) => d.id === dog.dog.id) ? dog : null
}

interface Banner {
  title: string
  lines: string[]
}

interface BookingFormProps {
  clients: Client[]
  onCreated: (booking: Booking) => void
}

export default function BookingForm({ clients, onCreated }: BookingFormProps) {
  const [shared, setShared] = useState<SharedBookingFields>(emptyShared)
  const [entries, setEntries] = useState<BookingDraft[]>([newEntry(0)])
  const [sharedErrors, setSharedErrors] = useState<SharedFieldErrors>({})
  const [entryErrors, setEntryErrors] = useState<Record<number, EntryFieldErrors>>({})
  const [staysError, setStaysError] = useState<string | null>(null)
  const [banner, setBanner] = useState<Banner | null>(null)
  const [conflict, setConflict] = useState<ExistingClient | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const setField =
    (field: 'phone' | 'notes' | 'dayRate' | 'overnightRate') => (e: ChangeEvent<HTMLInputElement>) =>
      setShared((s) => ({ ...s, [field]: e.target.value }))

  function setClient(client: ClientChoice | null) {
    setShared((s) => ({
      ...s,
      client,
      dog: keepDog(s.dog, client),
      phone: client?.kind === 'new' ? s.phone : '',
    }))
  }

  function setDog(dog: DogChoice | null) {
    setShared((s) => ({ ...s, dog }))
  }

  function updateEntry(id: number, updated: BookingDraft) {
    setEntries((es) => es.map((e) => (e.id === id ? updated : e)))
  }

  function removeEntry(id: number) {
    setEntries((es) => es.filter((e) => e.id !== id))
  }

  function addEntry() {
    setEntries((es) => [...es, newEntry(es.length)])
  }

  function validate() {
    const sErr: SharedFieldErrors = {}
    let phone: string | null = null
    if (!shared.client || (shared.client.kind === 'new' && !shared.client.name.trim())) sErr.client = 'Required'
    if (shared.client?.kind === 'new' && shared.phone.trim()) {
      phone = toE164(shared.phone)
      if (!phone) sErr.phone = PHONE_ERROR
    }
    if (!shared.dog || (shared.dog.kind === 'new' && !shared.dog.name.trim())) sErr.dog = 'Required'
    const dayRateNum = Number(shared.dayRate)
    if (!shared.dayRate || isNaN(dayRateNum) || dayRateNum <= 0) sErr.dayRate = 'Must be a positive number'
    const overnightRateNum = Number(shared.overnightRate)
    if (!shared.overnightRate || isNaN(overnightRateNum) || overnightRateNum <= 0)
      sErr.overnightRate = 'Must be a positive number'

    const eErr: Record<number, EntryFieldErrors> = {}
    entries.forEach((entry) => {
      const err: EntryFieldErrors = {}
      if (!entry.dropOff || !dayjs(entry.dropOff).isValid()) err.dropOff = 'Required'
      if (!entry.pickUp || !dayjs(entry.pickUp).isValid()) err.pickUp = 'Required'
      if (entry.dropOff && entry.pickUp && dayjs(entry.pickUp).isBefore(dayjs(entry.dropOff)))
        err.pickUp = 'Must be on or after drop-off'
      if (Object.keys(err).length) eErr[entry.id] = err
    })

    return { sErr, eErr, phone }
  }

  function showApiError(err: ApiError) {
    if (err.status === 409 && err.existingClient) {
      setConflict(err.existingClient)
      return
    }
    if (err.status === 400 && err.fieldErrors.length) {
      const mapped = mapFieldErrors(err.fieldErrors, entries)
      setSharedErrors(mapped.shared)
      setEntryErrors(mapped.entries)
      setStaysError(mapped.stays)
      if (mapped.unmapped.length) setBanner({ title: err.title, lines: mapped.unmapped })
      return
    }
    setBanner({ title: err.title, lines: err.detail ? [err.detail] : [] })
  }

  function switchToExistingClient(existing: ExistingClient) {
    const client = clients.find((c) => c.id === existing.id) ?? {
      id: existing.id,
      name: existing.name,
      phone: null,
      dogs: [],
    }
    setClient({ kind: 'existing', client })
    setConflict(null)
  }

  const totalPrice = entries.reduce(
    (sum, e) => sum + (calcPrice(e.dropOff, e.pickUp, e.pickupDropoff, shared.dayRate, shared.overnightRate) ?? 0),
    0,
  )

  async function handleSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const { sErr, eErr, phone } = validate()
    setSharedErrors(sErr)
    setEntryErrors(eErr)
    setStaysError(null)
    setBanner(null)
    setConflict(null)
    if (!shared.client || !shared.dog || Object.keys(sErr).length || Object.keys(eErr).length) return

    setSubmitting(true)
    try {
      const booking = await createBooking(
        buildCreateRequest({
          client: shared.client,
          phone,
          dog: shared.dog,
          notes: shared.notes,
          dayRate: Number(shared.dayRate),
          overnightRate: Number(shared.overnightRate),
          entries,
        }),
      )
      onCreated(booking)
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      showApiError(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate>
      <Stack spacing={2.5}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <ClientPicker clients={clients} value={shared.client} onChange={setClient} error={sharedErrors.client} />
          <DogPicker
            dogs={shared.client?.kind === 'existing' ? shared.client.client.dogs : []}
            value={shared.dog}
            onChange={setDog}
            error={sharedErrors.dog}
          />
        </Stack>

        {shared.client?.kind === 'new' && (
          <TextField
            label="Phone (optional)"
            type="tel"
            fullWidth
            value={shared.phone}
            onChange={setField('phone')}
            error={!!sharedErrors.phone}
            helperText={sharedErrors.phone}
          />
        )}

        {conflict && (
          <Alert
            severity="warning"
            action={
              <Button color="inherit" size="small" onClick={() => switchToExistingClient(conflict)}>
                Use {conflict.name}
              </Button>
            }
          >
            This number belongs to <strong>{conflict.name}</strong>. Use that client?
          </Alert>
        )}

        <TextField
          label="Notes"
          multiline
          rows={2}
          fullWidth
          value={shared.notes}
          onChange={setField('notes')}
          placeholder="Feeding instructions, medical needs…"
          error={!!sharedErrors.notes}
          helperText={sharedErrors.notes}
        />

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="Day Rate"
            fullWidth
            value={shared.dayRate}
            onChange={setField('dayRate')}
            error={!!sharedErrors.dayRate}
            helperText={sharedErrors.dayRate}
          />
          <TextField
            label="Overnight Rate"
            fullWidth
            value={shared.overnightRate}
            onChange={setField('overnightRate')}
            error={!!sharedErrors.overnightRate}
            helperText={sharedErrors.overnightRate}
          />
        </Stack>

        {staysError && (
          <Typography variant="body2" color="error">
            {staysError}
          </Typography>
        )}

        <Stack spacing={2}>
          {entries.map((entry, idx) => (
            <BookingEntry
              key={entry.id}
              entry={entry}
              index={idx}
              onChange={(updated) => updateEntry(entry.id, updated)}
              onRemove={entries.length > 1 ? () => removeEntry(entry.id) : null}
              errors={entryErrors[entry.id] ?? {}}
              dayRate={shared.dayRate}
              overnightRate={shared.overnightRate}
            />
          ))}
        </Stack>

        <Button variant="outlined" startIcon={<AddIcon />} onClick={addEntry} sx={{ alignSelf: 'flex-start' }}>
          Add another day
        </Button>

        {entries.length > 1 && totalPrice > 0 && (
          <>
            <Divider />
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Total ({entries.length} days)
              </Typography>
              <Typography variant="h6" color="primary" sx={{ fontWeight: 700 }}>
                £{totalPrice.toFixed(2)}
              </Typography>
            </Stack>
          </>
        )}

        {banner && (
          <Alert severity="error">
            <AlertTitle>{banner.title}</AlertTitle>
            {banner.lines.map((line) => (
              <Box key={line}>{line}</Box>
            ))}
          </Alert>
        )}

        <Button
          type="submit"
          variant="contained"
          size="large"
          startIcon={<PetsIcon />}
          disabled={submitting}
          sx={{ py: 1.5, borderRadius: 2, fontWeight: 700 }}
        >
          Create Booking
        </Button>
      </Stack>
    </Box>
  )
}
```
Notes: the form doesn't reset after success, because `App` replaces it with the confirmation and a fresh form mounts on "New Booking". The function that applies the 409 is deliberately not called `use…`: the hooks lint rule would treat it as a hook.

- [ ] **Step 7: Run the form tests**

Run: `cd web && npx vitest run src/components/BookingForm.test.tsx`
Expected: `Tests  12 passed (12)`.
If `setDate` can't find the hidden inputs or the value doesn't stick, inspect `screen.debug(undefined, 100000)` around a date field before changing anything else (see "Known risks").

---

### Task 9: Confirmation from the API's booking

**Files:** modify `web/src/components/Confirmation.tsx`; create `web/src/components/Confirmation.test.tsx`.

- [ ] **Step 1: Write the failing test**

`web/src/components/Confirmation.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Confirmation from './Confirmation.tsx'
import { booking } from '../test/fixtures.ts'

describe('Confirmation', () => {
  it("shows the server's client, dog, day prices and total", () => {
    render(<Confirmation booking={booking} onNewBooking={vi.fn()} />)

    expect(screen.getByText('Booking Confirmed!')).toBeTruthy()
    expect(screen.getByText('🐕 Biscuit · 👤 Sarah Lee')).toBeTruthy()
    expect(screen.getByText('£95.00')).toBeTruthy()
    expect(screen.getByText('£35.00')).toBeTruthy()
    expect(screen.getByText('Total: £130.00')).toBeTruthy()
  })

  it('offers calendar buttons for each day', () => {
    render(<Confirmation booking={booking} onNewBooking={vi.fn()} />)

    expect(screen.getAllByRole('link', { name: 'Google Calendar' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Download .ics (iPhone)' })).toHaveLength(2)
  })
})
```
The per-day UID is tested on `buildICS` in `utils.test.ts`, because the download itself needs `URL.createObjectURL`, which jsdom doesn't have.

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd web && npx vitest run src/components/Confirmation.test.tsx`
Expected: FAIL (the component still expects `bookings: Booking[]` in the old shape; `bookings.length` throws on `undefined`).

- [ ] **Step 3: Replace `web/src/components/Confirmation.tsx`**

```tsx
import { useState } from 'react'
import { Alert, Box, Button, Chip, Divider, Paper, Snackbar, Stack, Typography } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutlined'
import {
  SERVICE_COLOR,
  SERVICE_LABEL,
  downloadICS,
  fmt,
  generateGCalLink,
  generateWhatsAppLink,
  generateWhatsAppMessage,
} from '../utils.ts'
import type { Booking } from '../types'

interface ConfirmationProps {
  booking: Booking
  onNewBooking: () => void
}

export default function Confirmation({ booking, onNewBooking }: ConfirmationProps) {
  const [copied, setCopied] = useState(false)
  const msg = generateWhatsAppMessage(booking)
  const { stays } = booking
  const several = stays.length > 1

  function handleCopy() {
    navigator.clipboard.writeText(msg).then(() => setCopied(true))
  }

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 3 }}>
        <CheckCircleIcon color="success" fontSize="large" />
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Booking Confirmed!
        </Typography>
      </Stack>

      <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 1 }}>
        Summary
      </Typography>
      <Typography variant="body1" sx={{ fontWeight: 700, mb: 1 }}>
        🐕 {booking.dog.name} · 👤 {booking.client.name}
      </Typography>
      <Stack spacing={1} sx={{ mb: 3 }}>
        {stays.map((stay, i) => (
          <Stack
            key={stay.id}
            direction="row"
            sx={{
              justifyContent: 'space-between',
              alignItems: 'center',
              py: 0.75,
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              {several && (
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 20 }}>
                  {i + 1}.
                </Typography>
              )}
              <Box>
                <Typography variant="body2">
                  {fmt(stay.dropOffDate, stay.dropOffTime)}
                  {` → ${fmt(stay.pickUpDate, stay.pickUpTime)}`}
                </Typography>
              </Box>
              <Chip label={SERVICE_LABEL[stay.service]} size="small" color={SERVICE_COLOR[stay.service]} />
            </Stack>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              £{stay.price.toFixed(2)}
            </Typography>
          </Stack>
        ))}
        <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
          <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 700 }}>
            Total: £{booking.total.toFixed(2)}
          </Typography>
        </Stack>
      </Stack>

      <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 1 }}>
        WhatsApp Confirmation Message
      </Typography>
      <Paper variant="outlined" sx={{ p: 2, mb: 1.5, bgcolor: '#f0faf4', borderColor: '#a5d6b7' }}>
        <Typography
          component="pre"
          sx={{
            fontFamily: 'inherit',
            fontSize: '0.875rem',
            lineHeight: 1.75,
            whiteSpace: 'pre-wrap',
            color: '#1b5e20',
            m: 0,
          }}
        >
          {msg}
        </Typography>
      </Paper>
      <Stack direction="row" spacing={1.5} sx={{ mb: 4 }}>
        <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={handleCopy}>
          Copy
        </Button>
        <Button
          variant="contained"
          startIcon={<WhatsAppIcon />}
          component="a"
          href={generateWhatsAppLink(msg)}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ bgcolor: '#25D366', '&:hover': { bgcolor: '#1da851' } }}
        >
          Open WhatsApp
        </Button>
      </Stack>

      <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 1 }}>
        Add to Calendar
      </Typography>
      <Stack spacing={1.5} sx={{ mb: 4 }}>
        {stays.map((stay, i) => (
          <Box key={stay.id}>
            {several && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                Day {i + 1} — {fmt(stay.dropOffDate, stay.dropOffTime)}
              </Typography>
            )}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button
                variant="contained"
                startIcon={<CalendarMonthIcon />}
                component="a"
                href={generateGCalLink(booking, stay)}
                target="_blank"
                rel="noopener noreferrer"
                size="small"
                sx={{ bgcolor: '#4285F4', '&:hover': { bgcolor: '#2b6fd6' } }}
              >
                Google Calendar
              </Button>
              <Button
                variant="contained"
                startIcon={<PhoneIphoneIcon />}
                onClick={() => downloadICS(booking, stay)}
                size="small"
                sx={{ bgcolor: '#6e4fc8', '&:hover': { bgcolor: '#5a3ab0' } }}
              >
                Download .ics (iPhone)
              </Button>
            </Stack>
            {i < stays.length - 1 && <Divider sx={{ mt: 1.5 }} />}
          </Box>
        ))}
      </Stack>

      <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 1 }}>
        New Booking
      </Typography>
      <Button variant="outlined" startIcon={<AddCircleOutlineIcon />} onClick={onNewBooking}>
        New Booking
      </Button>

      <Snackbar
        open={copied}
        autoHideDuration={2500}
        onClose={() => setCopied(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" onClose={() => setCopied(false)}>
          Copied to clipboard!
        </Alert>
      </Snackbar>
    </Box>
  )
}
```

- [ ] **Step 4: Run the test**

Run: `cd web && npx vitest run src/components/Confirmation.test.tsx`
Expected: `Tests  2 passed (2)`.

---

### Task 10: History with Cancel, `App` on the API, delete `storage.ts`

**Files:** modify `web/src/components/BookingHistory.tsx`, `web/src/App.tsx`; create `web/src/components/BookingHistory.test.tsx`, `web/src/App.test.tsx`; delete `web/src/storage.ts`.

- [ ] **Step 1: Write the failing history test**

`web/src/components/BookingHistory.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BookingHistory from './BookingHistory.tsx'
import { booking, cancelledBooking } from '../test/fixtures.ts'

describe('BookingHistory', () => {
  it('shows one card per booking with its days', () => {
    render(<BookingHistory bookings={[booking, cancelledBooking]} onCancel={vi.fn()} />)

    const cards = screen.getAllByRole('article')
    expect(cards).toHaveLength(2)
    const first = within(cards[0])
    expect(first.getByText('🐕 Biscuit')).toBeTruthy()
    expect(first.getByText('👤 Sarah Lee')).toBeTruthy()
    expect(first.getByText(/Sat, 2 Nov 2030 at 9:00 AM → Mon, 4 Nov 2030 \(time TBD\)/)).toBeTruthy()
    expect(first.getByText('£95.00')).toBeTruthy()
    expect(first.getByText('£35.00')).toBeTruthy()
    expect(first.getByText('£130.00')).toBeTruthy()
  })

  it('greys out a cancelled booking, with a Cancelled chip and no Cancel button', () => {
    render(<BookingHistory bookings={[booking, cancelledBooking]} onCancel={vi.fn()} />)

    const [confirmedCard, cancelledCard] = screen.getAllByRole('article')
    expect(within(cancelledCard).getByText('Cancelled')).toBeTruthy()
    expect(within(cancelledCard).queryByRole('button', { name: 'Cancel' })).toBeNull()
    expect(getComputedStyle(cancelledCard).opacity).toBe('0.6')
    expect(within(confirmedCard).getByRole('button', { name: 'Cancel' })).toBeTruthy()
    expect(within(confirmedCard).queryByText('Cancelled')).toBeNull()
  })

  it('asks before cancelling and does nothing if declined', async () => {
    const onCancel = vi.fn()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<BookingHistory bookings={[booking]} onCancel={onCancel} />)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Cancel' }))

    expect(confirm).toHaveBeenCalledWith('Cancel this booking?')
    expect(onCancel).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Write the failing App test**

`web/src/App.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import App from './App.tsx'
import Providers from './test/Providers.tsx'
import { server } from './test/server.ts'
import { booking, cancelledBooking, clients } from './test/fixtures.ts'
import type { Booking } from './types'

function serveLists(bookings: () => Booking[]) {
  server.use(
    http.get('/api/clients', () => HttpResponse.json(clients)),
    http.get('/api/bookings', () => HttpResponse.json(bookings())),
  )
}

describe('App', () => {
  it('shows loading, then the problem title with Retry, then the form once Retry works', async () => {
    let failing = true
    server.use(
      http.get('/api/clients', () =>
        failing
          ? HttpResponse.json({ status: 500, title: 'Internal error' }, { status: 500 })
          : HttpResponse.json(clients),
      ),
      http.get('/api/bookings', () => HttpResponse.json([])),
    )
    render(<App />, { wrapper: Providers })

    expect(screen.getByRole('progressbar')).toBeTruthy()
    expect(await screen.findByText('Internal error')).toBeTruthy()

    failing = false
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('combobox', { name: 'Owner' })).toBeTruthy()
  })

  it('counts only confirmed bookings in the History tab', async () => {
    serveLists(() => [booking, cancelledBooking])
    render(<App />, { wrapper: Providers })

    expect(await screen.findByRole('tab', { name: 'History (1)' })).toBeTruthy()
  })

  it('shows the confirmation from the API response, then refreshes the lists', async () => {
    let loads = 0
    server.use(
      http.get('/api/clients', () => HttpResponse.json(clients)),
      http.get('/api/bookings', () => {
        loads += 1
        return HttpResponse.json(loads > 1 ? [booking] : [])
      }),
      http.post('/api/bookings', () => HttpResponse.json(booking, { status: 201 })),
    )
    const user = userEvent.setup()
    render(<App />, { wrapper: Providers })

    await user.type(await screen.findByRole('combobox', { name: 'Owner' }), 'sar')
    await user.click(screen.getByRole('option', { name: /Sarah Lee/ }))
    await user.type(screen.getByRole('combobox', { name: 'Dog' }), 'bis')
    await user.click(screen.getByRole('option', { name: 'Biscuit' }))
    fireEvent.change(screen.getAllByLabelText('Drop-off Date', { selector: 'input' })[0], {
      target: { value: '02/11/2030' },
    })
    fireEvent.change(screen.getAllByLabelText('Pick-up Date', { selector: 'input' })[0], {
      target: { value: '04/11/2030' },
    })
    await user.click(screen.getByRole('button', { name: 'Create Booking' }))

    expect(await screen.findByText('Booking Confirmed!')).toBeTruthy()
    expect(await screen.findByRole('tab', { name: 'History (1)' })).toBeTruthy()
  })

  it('cancels a booking after the confirm prompt, then shows it as cancelled', async () => {
    let current: Booking = booking
    const cancelledIds: number[] = []
    serveLists(() => [current])
    server.use(
      http.post('/api/bookings/:id/cancel', ({ params }) => {
        cancelledIds.push(Number(params.id))
        current = {
          ...booking,
          status: 'cancelled',
          total: 0,
          stays: booking.stays.map((stay) => ({ ...stay, status: 'cancelled' as const })),
        }
        return HttpResponse.json(current)
      }),
    )
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    render(<App />, { wrapper: Providers })

    await user.click(await screen.findByRole('tab', { name: 'History (1)' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(confirm).toHaveBeenCalledWith('Cancel this booking?')
    expect(await screen.findByText('Cancelled')).toBeTruthy()
    expect(cancelledIds).toEqual([12])
    expect(screen.getByRole('tab', { name: 'History (0)' })).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run both and confirm they fail**

Run: `cd web && npx vitest run src/components/BookingHistory.test.tsx src/App.test.tsx`
Expected: FAIL. The history test finds no `article` and no Cancel button; the App tests fail because `App` still reads `localStorage` and never calls `/api` (no progressbar, no Retry).

- [ ] **Step 4: Replace `web/src/components/BookingHistory.tsx`**

```tsx
import { Box, Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material'
import PetsIcon from '@mui/icons-material/Pets'
import dayjs from 'dayjs'
import { SERVICE_COLOR, SERVICE_LABEL, fmt } from '../utils.ts'
import type { Booking } from '../types'

interface BookingHistoryProps {
  bookings: Booking[]
  onCancel: (id: number) => void
}

export default function BookingHistory({ bookings, onCancel }: BookingHistoryProps) {
  if (!bookings.length) {
    return (
      <Box sx={{ textAlign: 'center', py: 10, color: 'text.disabled' }}>
        <PetsIcon sx={{ fontSize: 64, mb: 1 }} />
        <Typography variant="h6">No bookings yet</Typography>
        <Typography variant="body2">Create your first booking to get started.</Typography>
      </Box>
    )
  }

  return (
    <Stack spacing={2}>
      {bookings.map((b) => {
        const cancelled = b.status === 'cancelled'
        return (
          <Card
            key={b.id}
            component="article"
            aria-label={`Booking for ${b.dog.name}`}
            variant="outlined"
            sx={{
              borderLeft: '4px solid',
              borderLeftColor: cancelled ? 'text.disabled' : 'primary.main',
              opacity: cancelled ? 0.6 : 1,
            }}
          >
            <CardContent>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box sx={{ flex: 1 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      🐕 {b.dog.name}
                    </Typography>
                    {cancelled && <Chip label="Cancelled" size="small" />}
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    👤 {b.client.name}
                  </Typography>

                  <Stack spacing={0.75} sx={{ mt: 1 }}>
                    {b.stays.map((stay) => (
                      <Box key={stay.id}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                          <Chip
                            label={SERVICE_LABEL[stay.service]}
                            size="small"
                            color={SERVICE_COLOR[stay.service]}
                          />
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            £{stay.price.toFixed(2)}
                          </Typography>
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          📅 {fmt(stay.dropOffDate, stay.dropOffTime)} → {fmt(stay.pickUpDate, stay.pickUpTime)}
                        </Typography>
                        {stay.pickupDropoffFee > 0 && (
                          <Typography variant="body2" color="text.secondary">
                            🚗 Pickup &amp; drop-off service included
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Stack>

                  {b.notes && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      📝 {b.notes}
                    </Typography>
                  )}
                </Box>

                {!cancelled && (
                  <Button
                    size="small"
                    color="error"
                    onClick={() => {
                      if (window.confirm('Cancel this booking?')) onCancel(b.id)
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </Stack>

              <Stack
                direction="row"
                sx={{
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mt: 1.5,
                  pt: 1.5,
                  borderTop: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Typography variant="h6" color="primary" sx={{ fontWeight: 700 }}>
                  £{b.total.toFixed(2)}
                </Typography>
                <Typography variant="caption" color="text.disabled">
                  Booked {dayjs(b.createdAt).format('D MMM YYYY')}
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        )
      })}
    </Stack>
  )
}
```

- [ ] **Step 5: Replace `web/src/App.tsx`**

```tsx
import { useEffect, useState, type SyntheticEvent } from 'react'
import {
  Alert,
  AppBar,
  Box,
  Button,
  CircularProgress,
  Container,
  Paper,
  Tab,
  Tabs,
  Toolbar,
  Typography,
} from '@mui/material'
import PetsIcon from '@mui/icons-material/Pets'
import BookingForm from './components/BookingForm.tsx'
import Confirmation from './components/Confirmation.tsx'
import BookingHistory from './components/BookingHistory.tsx'
import { ApiError, cancelBooking, listBookings, listClients } from './api/client.ts'
import type { Booking, Client } from './types'

function problemTitle(err: unknown): string {
  return err instanceof ApiError ? err.title : 'Something went wrong'
}

export default function App() {
  const [tab, setTab] = useState(0)
  const [confirmed, setConfirmed] = useState<Booking | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let ignore = false
    Promise.all([listClients(), listBookings()]).then(
      ([loadedClients, loadedBookings]) => {
        if (ignore) return
        setClients(loadedClients)
        setBookings(loadedBookings)
        setLoaded(true)
        setError(null)
      },
      (err: unknown) => {
        if (!ignore) setError(problemTitle(err))
      },
    )
    return () => {
      ignore = true
    }
  }, [reloadKey])

  function reload() {
    setReloadKey((k) => k + 1)
  }

  function handleCreated(booking: Booking) {
    setConfirmed(booking)
    reload()
  }

  function handleNewBooking() {
    setConfirmed(null)
  }

  async function handleCancel(id: number) {
    try {
      await cancelBooking(id)
      reload()
    } catch (err) {
      setError(problemTitle(err))
    }
  }

  function handleRetry() {
    setError(null)
    reload()
  }

  const confirmedCount = bookings.filter((b) => b.status === 'confirmed').length

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <PetsIcon sx={{ mr: 1.5 }} />
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              DD PET CARE BOOKING
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>

      <Box sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
        <Container maxWidth="sm">
          <Tabs value={tab} onChange={(_: SyntheticEvent, v: number) => setTab(v)}>
            <Tab label="New Booking" />
            <Tab label={`History (${confirmedCount})`} />
          </Tabs>
        </Container>
      </Box>

      <Box sx={{ bgcolor: 'background.default', minHeight: 'calc(100vh - 112px)' }}>
        <Container maxWidth="sm" sx={{ py: 3 }}>
          {error && (
            <Alert
              severity="error"
              sx={{ mb: 2 }}
              action={
                <Button color="inherit" size="small" onClick={handleRetry}>
                  Retry
                </Button>
              }
            >
              {error}
            </Alert>
          )}

          {!loaded && !error && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress aria-label="Loading" />
            </Box>
          )}

          {loaded && tab === 0 && (
            <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
              {confirmed ? (
                <Confirmation booking={confirmed} onNewBooking={handleNewBooking} />
              ) : (
                <BookingForm clients={clients} onCreated={handleCreated} />
              )}
            </Paper>
          )}

          {loaded && tab === 1 && <BookingHistory bookings={bookings} onCancel={handleCancel} />}
        </Container>
      </Box>
    </>
  )
}
```
State is only set in the promise callbacks inside the effect, so `react-hooks/set-state-in-effect` is satisfied. One `reloadKey` drives the first load, Retry, and the refreshes after create and cancel.

- [ ] **Step 6: Delete `storage.ts`**

Run: `git rm web/src/storage.ts`
Then check nothing references it:
Run: `grep -rn "storage.ts\|getBookings\|saveBooking\|deleteBooking\|localStorage" web/src`
Expected: no output.

- [ ] **Step 7: Run every check**

Run: `cd web && npm run typecheck && npm run lint && npm run build && npm test`
Expected:
- `tsc --noEmit`: no output.
- `eslint .`: no output.
- `vite build`: `✓ built in …`.
- `vitest run`: `Test Files  8 passed (8)`, `Tests  51 passed (51)` (phone 7, client 8, utils 15, BookingForm 12, Confirmation 2, BookingHistory 3, App 4).

If lint flags `react-refresh/only-export-components` or a hooks rule, fix the code, not the rule.

- [ ] **Step 8: Quick look in the browser (no POST)**

With the API running as in Task 5 Step 1, run `cd web && npm run dev` and open the URL it prints. The form loads with the client picker and the History tab shows the dev database's bookings (or the empty state). Don't submit the form; creating and cancelling is the project owner's manual check (Task 12). Stop both processes.

- [ ] **Step 9: Propose the commit and commit after approval**

```
feat(web): switch booking form, confirmation and history to the API

The form picks or creates the client and dog, sends one booking with a
stay per day, shows API field errors on their inputs and offers to
switch client on a phone conflict. The confirmation and calendar
events come from the API's response, with one UID per stay. History
shows one card per booking and cancels instead of deleting.
storage.ts and the old Booking type are gone.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
Files: `web/src/types.ts web/src/utils.ts web/src/utils.test.ts web/src/App.tsx web/src/App.test.tsx web/src/components web/src/storage.ts`

---

### Task 11: Docs

**Files:** `web/CLAUDE.md`, `api/CLAUDE.md`, `docs/superpowers/specs/2026-10-30-booking-api-design.md`.

- [ ] **Step 1: Update `web/CLAUDE.md`**

- **Stack, "Persistence" line:** replace with: "**Data:** the `api/` backend, called through `src/api/client.ts` at relative `/api/...` URLs. In dev, Vite proxies `/api` to `http://localhost:8080`. The live Vercel site (`main`) still runs the old localStorage version until the API is hosted, so this branch isn't merged before then."
- **Stack, "Booking submission" line:** replace with: "**Booking submission:** one form submit creates one booking with one or more days (stays); client, dog, notes and rates are shared by its days."
- **Add a "Dev dependencies" bullet under Stack:** "Test and codegen tools are dev-only and pinned exactly: openapi-typescript 7.13.0, vitest 4.1.12, @testing-library/react 16.3.3, @testing-library/dom 10.4.2, @testing-library/user-event 14.6.8, jsdom 29.1.1, msw 2.15.0. They're the newest versions that run on CI's Node 20; vitest 5, jsdom 30 and msw 3 need Node 22."
- **Replace the whole "Data shape (current frontend)" section** with:
  ```
  ## API types

  - `src/api/schema.d.ts` is generated from the API's `/v3/api-docs` by `npm run gen:api` (the API must be running; restart it after changing its annotations). It's committed; never edit it by hand. ESLint ignores it.
  - `src/types.ts` gives the generated schemas short names (`Booking`, `Stay`, `Client`, `Dog`, `CreateBookingRequest`, …) and holds the form-only types (`BookingDraft`, `ClientChoice`, `DogChoice`, field-error shapes).
  - `src/api/client.ts` is the only place that calls `fetch`. A non-2xx response or a network failure throws `ApiError` (`status` 0 for network), with `fieldErrors` and `existingClient` from the problem body.
  ```
- **Add a "Tests" section:**
  ```
  ## Tests

  - `npm test` runs Vitest (jsdom). It also runs in CI. Vitest doesn't typecheck; `npm run typecheck` does.
  - Tests sit next to the code (`*.test.ts(x)`). MSW fakes the API: add handlers per test with `server.use(http.get('/api/...', ...))`. Unhandled requests fail the test.
  - Render components that use date pickers with `{ wrapper: Providers }` (`src/test/Providers.tsx`). Set a picker's date by firing `change` on its hidden input: `getAllByLabelText('Drop-off Date', { selector: 'input' })`, value in `DD/MM/YYYY` (or `DD/MM/YYYY HH:mm` with times).
  - No jest-dom: assert with `getBy*`/`queryBy*`, `toBeTruthy()`, `toBeNull()` and input `.value`.
  - Sample API data lives in `src/test/fixtures.ts`.
  ```

- [ ] **Step 2: Update `api/CLAUDE.md`**

- **Current state:** replace the first sentence with: "Endpoints (all under `/api`): `GET /api/clients`, `POST /api/bookings`, `GET /api/bookings`, `GET /api/bookings/{id}`, `POST /api/bookings/{id}/cancel` (design in `docs/superpowers/specs/2026-10-30-booking-api-design.md`, prefix in `2026-10-31-web-api-switch-design.md`; schema in `docs/superpowers/specs/2026-10-29-backend-schema-design.md` and `api/docs/schema.md`). `/actuator/health` and `/v3/api-docs` aren't prefixed." Keep the rest of the paragraph.
- **Add to "Code conventions":**
  - "The OpenAPI spec is a contract: `web/` generates its types from it. Operations declare an `operationId` and their error responses (`error/ProblemSchemas`); fixed value lists are `@Schema(allowableValues = …)` on the records. Required and nullable fields, `HH:mm` times and `minItems` are set in `OpenApiSchemaCustomizer`, because OpenAPI 3.1 output drops `@Schema(nullable = true)`. When a response or request record changes, update that customizer and `OpenApiTest`, then regenerate `web/src/api/schema.d.ts`."

- [ ] **Step 3: Update the booking API spec**

In `docs/superpowers/specs/2026-10-30-booking-api-design.md`:
- Replace the five rows of the "API contract" table with:
  ```
  | `GET` | `/api/clients` | All clients with their dogs, sorted by name (feeds a picker) |
  | `POST` | `/api/bookings` | Create a booking with its stays. `201 Created`, `Location: /api/bookings/{id}`, body is the booking |
  | `GET` | `/api/bookings` | All bookings, newest first, cancelled included |
  | `GET` | `/api/bookings/{id}` | One booking |
  | `POST` | `/api/bookings/{id}/cancel` | Set the booking and all its stays to `cancelled` (so `total` becomes 0.00); returns it. Cancelling a cancelled booking returns it unchanged |
  ```
  and add under the table: "Paths moved under `/api` in the web switch-over (`2026-10-31-web-api-switch-design.md`)."
- Change the heading `### \`GET /clients\` response` to `### \`GET /api/clients\` response`.
- In "Reads", change "`GET /bookings` and `GET /bookings/{id}`" to "`GET /api/bookings` and `GET /api/bookings/{id}`".
- In the file layout, change the `ListBookingsTest.java` comment to "GET /api/bookings and /api/bookings/{id}, total, ordering".
- In "Future to-dos", replace the "OpenAPI precision" bullet with: "**OpenAPI precision:** done in the web switch-over (springdoc annotations plus `OpenApiSchemaCustomizer`; asserted by `OpenApiTest`)."

Check: run `grep -n "/clients\|/bookings" docs/superpowers/specs/2026-10-30-booking-api-design.md`. Every endpoint path it shows starts with `/api/`; lines mentioning the `requests/bookings/` test-resource folder are fine.

- [ ] **Step 4: Propose the commit and commit after approval**

```
docs: document the /api prefix, OpenAPI conventions and web tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
Files: `web/CLAUDE.md api/CLAUDE.md docs/superpowers/specs/2026-10-30-booking-api-design.md docs/superpowers/plans/2026-10-31-web-api-switch.md`

---

### Task 12: Manual check (project owner)

Run by the project owner, in a browser, against the **dev** database. The executor stops before this task and hands over.

- [ ] **Step 1: Start everything**

1. Start Postgres.app.
2. `cd api && ./mvnw spring-boot:run`
3. In another terminal: `cd web && npm run dev`, then open the URL Vite prints (usually `http://localhost:5173`).

- [ ] **Step 2: Create a booking with a new client and dog**

Type a new owner name; the Phone field appears. Enter a UK mobile (for example `07700 900123`) and a new dog name. Fill one or two days and submit. The confirmation shows the client, dog, each day's price and the total from the server; the WhatsApp message and calendar buttons work as before.

- [ ] **Step 3: Create another booking for the same client, picking them from the list**

Click "New Booking", start typing the client's name and pick them from the suggestions (their phone shows next to the name). Pick their dog from the dog list. Submit.

- [ ] **Step 4: Check both bookings in History**

Both bookings appear, newest first, each with its days, prices and total. The tab says `History (2)` (plus any confirmed bookings already in the dev database).

- [ ] **Step 5: Cancel one**

Click Cancel on one booking and confirm the prompt. It stays listed, greyed out, with a "Cancelled" chip and no Cancel button; the tab count drops by one.

- [ ] **Step 6: Confirm the rows in DBeaver (dev database)**

In `dd_pet_care_dev`: one new `clients` row (with the phone in `+44…` form), one `dogs` row, two `bookings` rows (one `cancelled`) and their `booking_stays` rows, with the cancelled booking's stays also `cancelled`.

If anything differs, report it; don't merge `feat/web-api` to `main` (see "Ground rules").

---

## Known risks

- **springdoc output details weren't seen before writing this plan.** The approach was checked against the springdoc 3.2.0 and swagger-core 2.2.55 jars (`OpenApiCustomizer`, default OpenAPI 3.1, `Schema.types`, `Schema31Mixin` ignoring `nullable`), but the exact JSON (for example how a `$ref` property or a header schema is written) is only known once `OpenApiTest` runs. If an assertion fails on JSON shape alone, adjust the assertion; if it fails on content, fix the annotation or customizer.
- **Generated type names.** If springdoc names a nested record differently (for example a clash between two `DogResponse`-like records), only the type paths in `api/client.ts`, `types.ts` and `test/fixtures.ts` change (Task 5 Step 4).
- **An orphan `LocalTime` schema.** If swagger-core emitted `LocalTime` as a component before the customizer replaced the time properties, it stays in `components.schemas` unused. That's harmless; the generated TypeScript just has an unused type.
- **MUI X picker test helper.** `setDate` relies on MUI X v9's hidden input parsing the field's text format. A future MUI X release could change that; the helper is in one place per test file.
- **Greyed-out check in jsdom.** `getComputedStyle(card).opacity` depends on jsdom applying Emotion's injected stylesheet. It normally does; if it returns `''`, replace that one assertion with a check of the Cancelled chip and the missing button (already in the test) and tell the project owner.
- **Node versions.** CI is Node 20, which is past its end of life; local is Node 23, outside the `engines` of vitest 4 and jsdom 29 (warnings only). Moving both to Node 22/24 would allow the newer major versions; that's the project owner's call.
- **`msw/node` and `vitest/config` without `@types/node`.** Their declaration files reference Node types; `skipLibCheck: true` covers this today (the existing `vite.config.ts` imports `vite`, which does the same). If `npm run typecheck` complains about a missing `node` type definition, stop and ask: `@types/node` isn't approved.
- **API down while using `npm run dev`.** The Vite proxy answers with its own 500 instead of a network failure, so the banner shows "Internal Server Error" (status 500), not "Could not reach the server". Status 0 only happens when the website itself can't reach its server (or behind a future rewrite).
- **Duplicate clients by typing.** A typed name that matches an existing client (ignoring case and extra spaces) now shows a "use them?" warning, but it doesn't block: submitting anyway creates a second client with that name, by design (two people can share a name). Names that differ by more than case and spacing (a typo, "Sara Lee") get no warning; the suggestion list is the only help there. When several clients share the name, the button picks the first in `/api/clients` order, so the owner must pick from the list to choose a different one.
- **Live site data.** The bookings in the live site's browser storage aren't moved by this plan (spec, "Out of scope"). That migration must be designed with hosting, before `feat/web-api` is merged.
- **CI is unverified until the branch is pushed.** `web.yml` now runs `npm test`; it doesn't start the API (MSW fakes it), so it doesn't need Postgres.
