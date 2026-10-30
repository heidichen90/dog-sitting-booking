# Database schema

Current as of `V1__initial_schema.sql`. The migrations in `src/main/resources/db/migration/` are the source of truth; update this diagram in the same change as any new migration.

Every table has `created_at`; every table except `blocked_dates` also has `updated_at`.

```mermaid
erDiagram
  clients ||--o{ dogs : owns
  clients ||--o{ bookings : "is billed for"
  dogs ||--o{ bookings : "is booked in"
  bookings ||--|{ booking_stays : contains
  clients {
    bigint id PK
    text name "not blank"
    text phone UK "E.164, optional"
  }
  dogs {
    bigint id PK
    bigint client_id FK
    text name "unique per client"
  }
  bookings {
    bigint id PK
    bigint client_id FK
    bigint dog_id FK "dog must belong to client"
    text status "confirmed or cancelled"
    text notes
    timestamptz paid_at "null = unpaid"
  }
  booking_stays {
    bigint id PK
    bigint booking_id FK
    date drop_off_date
    time drop_off_time "null = TBD"
    date pick_up_date
    time pick_up_time "null = TBD"
    numeric unit_rate "snapshot"
    numeric pickup_dropoff_fee "snapshot"
    numeric price "checked by formula"
    text status "confirmed or cancelled"
  }
  blocked_dates {
    bigint id PK
    date start_date
    date end_date
    text reason
  }
```

## What each table is for

| Table | One row means… | Used for |
|---|---|---|
| `clients` | One person you bill | Client lookup (including by phone for WhatsApp), earnings per client |
| `dogs` | One dog and its owner | Picking a dog on the booking form, history per dog |
| `bookings` | One visit for one dog, paid and confirmed once | Creating, paying, cancelling a whole visit, one confirmation |
| `booking_stays` | One date range in a booking, with the price charged | Adding or cancelling single days, totals, earnings reports |
| `blocked_dates` | A range when you're unavailable | Warning (never blocking) when a stay overlaps |

## Derived, not stored

- **Booking total:** sum of `price` over confirmed stays.
- **Service type:** `pick_up_date > drop_off_date` means Boarding, otherwise Day Care. Calculated in the API, in one place.

Rules that span several rows ("a booking has at least one stay", "cancelling the last stay cancels the booking") are enforced in the API.
