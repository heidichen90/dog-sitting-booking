CREATE TABLE clients (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       text        NOT NULL,
    phone      text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT clients_name_not_blank_check CHECK (btrim(name) <> ''),
    CONSTRAINT clients_phone_key UNIQUE (phone),
    CONSTRAINT clients_phone_e164_check CHECK (phone ~ '^\+[1-9][0-9]{7,14}$')
);

CREATE TABLE dogs (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_id  bigint      NOT NULL,
    name       text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT dogs_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients (id),
    CONSTRAINT dogs_name_not_blank_check CHECK (btrim(name) <> ''),
    CONSTRAINT dogs_id_client_id_key UNIQUE (id, client_id)
);

CREATE UNIQUE INDEX dogs_client_id_lower_name_key ON dogs (client_id, lower(btrim(name)));

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
    CONSTRAINT booking_stays_pickup_dropoff_fee_check CHECK (pickup_dropoff_fee >= 0),
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

CREATE TABLE blocked_dates (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    start_date date        NOT NULL,
    end_date   date        NOT NULL,
    reason     text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT blocked_dates_range_check CHECK (end_date >= start_date)
);
