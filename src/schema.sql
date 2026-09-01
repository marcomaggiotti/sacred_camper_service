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

-- Session storage for express-session / connect-pg-simple.
CREATE TABLE IF NOT EXISTS camper_session (
    sid    VARCHAR      NOT NULL COLLATE "default" PRIMARY KEY,
    sess   JSON         NOT NULL,
    expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS camper_session_expire_idx ON camper_session (expire);
