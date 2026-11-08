-- Brings an existing database up to the donation feature's schema.
--
-- A fresh environment does not need this: docker-compose mounts every
-- file in db/table/ and they already contain everything the feature
-- needs. This exists for a database created before the feature, where the
-- six new CREATE TABLE IF NOT EXISTS files are safe to replay but the
-- ALTER below is not covered by any of them.
--
-- Apply in this order, from the repository root:
--
--   mysql ... < db/table/charity_category.sql
--   mysql ... < db/table/charity_organization.sql
--   mysql ... < db/table/charity_organization_category.sql
--   mysql ... < db/table/donation_batch.sql
--   mysql ... < db/table/donation_batch_evidence.sql
--   mysql ... < db/script/v1.1.0/donation.sql           <-- this file
--   mysql ... < db/script/v1.1.0/insert_charity_category.sql
--   mysql ... < db/table/donation.sql
--
-- charity_category goes first because guardian's new foreign key points
-- at it, and donation.sql goes last because its foreign key points at
-- charity_category too. The seed runs before donation.sql only for
-- tidiness -- it has no ordering requirement of its own beyond needing
-- the guardian column this file adds.
--
-- The table files are idempotent (IF NOT EXISTS) and are not repeated
-- here, so that their definitions have exactly one home.
--
-- This file is NOT idempotent: MySQL has no ADD COLUMN IF NOT EXISTS, so
-- a second run fails with "Duplicate column name". That is the intended
-- outcome -- it stops instead of changing anything.
--
-- An earlier version of this file added an `unrestricted_category`
-- TINYINT to guardian instead. Production never ran it. If some
-- environment did, drop that column first:
--
--   ALTER TABLE castor.guardian DROP COLUMN unrestricted_category;
--
-- Not optional: the mysql client takes its connection charset from the
-- environment, and the one docker-entrypoint-initdb.d uses is latin1.
SET NAMES utf8mb4;

-- Which public-interest category each egg supports. NULL means "not tied
-- to one", which is how the planned VIP spirit says its owner may choose
-- any category -- a statement the old unrestricted_category flag made
-- without the database being able to enforce it.
--
-- Added nullable with no default on purpose: every existing guardian
-- starts unlinked, and insert_charity_category.sql fills them in by
-- matching code. Running this without that script leaves the seven eggs
-- with no category, which /box would show as nothing to support.
ALTER TABLE castor.guardian
  ADD COLUMN category_id INT UNSIGNED NULL AFTER cost,
  ADD CONSTRAINT fk_guardian_category
    FOREIGN KEY (category_id) REFERENCES castor.charity_category(id);
