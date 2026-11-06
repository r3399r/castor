-- Brings an existing database up to the donation feature's schema.
--
-- A fresh environment does not need this: docker-compose mounts every
-- file in db/table/ and they already contain everything the feature
-- needs. This exists for a database created before the feature, where
-- the five new CREATE TABLE IF NOT EXISTS files are safe to replay but
-- the ALTER below is not covered by any of them.
--
-- Apply in this order, from the repository root:
--
--   mysql ... < db/table/charity_organization.sql
--   mysql ... < db/table/charity_organization_guardian.sql
--   mysql ... < db/table/donation_batch.sql
--   mysql ... < db/table/donation_batch_evidence.sql
--   mysql ... < db/table/donation.sql
--   mysql ... < db/script/v1.1.0/donation.sql
--
-- The five table files are idempotent (IF NOT EXISTS) and are not
-- repeated here, so that their definitions have exactly one home.
--
-- This file is NOT idempotent: MySQL has no ADD COLUMN IF NOT EXISTS, so
-- a second run fails with "Duplicate column name". That is the intended
-- outcome -- it stops instead of changing anything.
--
-- Not optional: the mysql client takes its connection charset from the
-- environment, and the one docker-entrypoint-initdb.d uses is latin1.
SET NAMES utf8mb4;

-- The VIP rule, kept as data rather than a hard-coded check on
-- guardian.code. See db/table/guardian.sql for what the flag means. All
-- seven existing guardians keep today's behaviour at the default 0.
ALTER TABLE castor.guardian
  ADD COLUMN unrestricted_category TINYINT(1) NOT NULL DEFAULT 0 AFTER cost;
