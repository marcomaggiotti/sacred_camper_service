-- Schema for the Sacred Camper reservation service.
-- All objects are prefixed with "camper_" because the database is shared
-- with other applications.

CREATE TABLE IF NOT EXISTS camper_users (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(64) NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    full_name     VARCHAR(128),
    is_admin      BOOLEAN     NOT NULL DEFAULT FALSE,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS camper_vehicles (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(128) NOT NULL UNIQUE,
    plate       VARCHAR(32),
    seats       INTEGER      NOT NULL DEFAULT 4,
    description TEXT,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS camper_reservations (
    id         SERIAL PRIMARY KEY,
    vehicle_id INTEGER NOT NULL REFERENCES camper_vehicles(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES camper_users(id)    ON DELETE CASCADE,
    start_date DATE    NOT NULL,
    end_date   DATE    NOT NULL,
    note       TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT camper_reservations_dates_ok CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS camper_reservations_vehicle_dates_idx
    ON camper_reservations (vehicle_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS camper_reservations_user_idx
    ON camper_reservations (user_id);

CREATE TABLE IF NOT EXISTS camper_tasks (
    id           SERIAL PRIMARY KEY,
    title        VARCHAR(160) NOT NULL,
    description  TEXT,
    status       VARCHAR(16)  NOT NULL DEFAULT 'todo',
    due_date     DATE,
    created_by   INTEGER      NOT NULL REFERENCES camper_users(id) ON DELETE CASCADE,
    assignee_id  INTEGER      REFERENCES camper_users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT camper_tasks_status_ok CHECK (status IN ('todo', 'doing', 'done'))
);

CREATE INDEX IF NOT EXISTS camper_tasks_status_idx   ON camper_tasks (status);
CREATE INDEX IF NOT EXISTS camper_tasks_assignee_idx ON camper_tasks (assignee_id);

CREATE TABLE IF NOT EXISTS camper_destinations (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(128) NOT NULL,
    country      VARCHAR(64),
    description  TEXT,
    travel_from  DATE,
    travel_to    DATE,
    created_by   INTEGER      NOT NULL REFERENCES camper_users(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT camper_destinations_dates_ok
        CHECK (travel_to IS NULL OR travel_from IS NULL OR travel_to >= travel_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS camper_destinations_name_idx
    ON camper_destinations (lower(name), COALESCE(lower(country), ''));

-- What each traveller would like brought back from a given destination.
CREATE TABLE IF NOT EXISTS camper_wishlist_items (
    id             SERIAL PRIMARY KEY,
    destination_id INTEGER      NOT NULL REFERENCES camper_destinations(id) ON DELETE CASCADE,
    user_id        INTEGER      NOT NULL REFERENCES camper_users(id) ON DELETE CASCADE,
    product        VARCHAR(160) NOT NULL,
    quantity       INTEGER      NOT NULL DEFAULT 1,
    note           TEXT,
    is_fulfilled   BOOLEAN      NOT NULL DEFAULT FALSE,
    fulfilled_by   INTEGER      REFERENCES camper_users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT camper_wishlist_quantity_ok CHECK (quantity BETWEEN 1 AND 999)
);

CREATE INDEX IF NOT EXISTS camper_wishlist_destination_idx
    ON camper_wishlist_items (destination_id);
CREATE INDEX IF NOT EXISTS camper_wishlist_user_idx
    ON camper_wishlist_items (user_id);

-- Session storage for express-session / connect-pg-simple.
CREATE TABLE IF NOT EXISTS camper_session (
    sid    VARCHAR      NOT NULL COLLATE "default" PRIMARY KEY,
    sess   JSON         NOT NULL,
    expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS camper_session_expire_idx ON camper_session (expire);
