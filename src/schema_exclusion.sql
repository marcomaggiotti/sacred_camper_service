-- Optional hardening: a database level guarantee that two reservations for the
-- same camper can never overlap. Requires the btree_gist extension, which some
-- managed Postgres plans do not allow. Applied on a best effort basis; the
-- application also serialises bookings with a row lock, so the service is
-- correct either way.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE camper_reservations
    ADD CONSTRAINT camper_reservations_no_overlap
    EXCLUDE USING gist (
        vehicle_id WITH =,
        daterange(start_date, end_date, '[]') WITH &&
    );
