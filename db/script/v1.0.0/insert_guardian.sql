-- Seeds the eight guardians for a fresh environment; without them /box
-- shows an empty store, which reads as broken rather than unseeded.
--
-- Must run after insert_charity_category.sql. Each category_id is a
-- subquery on the category's code -- never a literal id, those differ per
-- environment -- and an empty charity_category leaves them NULL without
-- erroring, which means "may support any category", i.e. seven VIP eggs.
-- GUARDIAN.md.
--
-- `code` names the species *drawn*, not the category supported. It is the
-- key webapp/lib/guardianArtwork.ts resolves to artwork, so the forest egg
-- is 'deer' and a second forest egg is 'fox', not 'forest2'. These were
-- named after the category ('children', 'forest', ...) until 2026-11-21,
-- which made an egg's code and the category slug in its own subquery look
-- interchangeable when they are two namespaces -- and `uk_code` means they
-- could never stay equal anyway, since a category's second egg needs a
-- different code while still repeating that category's slug below.
--
-- A code `spiritCatalog` has no drawn entry for falls back to the locked
-- egg silently. These mirror the live table -- confirm against
-- /admin/species rather than this file, and keep AGENTS.md's Guardian
-- categories table in step.
--
-- `cost` is a flat 10 in the live table, not a ladder. Do not "fix" it.
--
-- `requires_subscription` is the paywall, and replaced a `code = 'vip'`
-- comparison in store.ts on 2026-11-21. It is independent of
-- `category_id`: the fennec egg is both subscriber-only and unbound, but
-- either is settable without the other.
--
-- There is no `theme` column any more (dropped 2026-11-21). It held a
-- display label that merely copied the category's name, so an egg's row
-- now names a cause in exactly one place: the category_id subquery.
--
-- SET NAMES is not optional: docker-entrypoint-initdb.d uses a latin1
-- client, which silently turns 暖陽之蛋 into 12 mojibake characters.
-- A second run is rejected by uk_code.
SET NAMES utf8mb4;

INSERT INTO castor.guardian
(id, code, name, cost, category_id, requires_subscription, sort_order, is_active, created_at, updated_at)
VALUES
(null, 'cat', '暖陽之蛋', 10,
 (SELECT id FROM castor.charity_category WHERE code = 'children'), 0, 1, 1, now(3), NULL),
(null, 'otter', '星光之蛋', 10,
 (SELECT id FROM castor.charity_category WHERE code = 'neurodevelopment'), 0, 2, 1, now(3), NULL),
(null, 'dog', '長青之蛋', 10,
 (SELECT id FROM castor.charity_category WHERE code = 'eldercare'), 0, 3, 1, now(3), NULL),
(null, 'rabbit', '療癒之蛋', 10,
 (SELECT id FROM castor.charity_category WHERE code = 'healing'), 0, 4, 1, now(3), NULL),
(null, 'penguin', '共鳴之蛋', 10,
 (SELECT id FROM castor.charity_category WHERE code = 'rights'), 0, 5, 1, now(3), NULL),
(null, 'bird', '智慧之蛋', 10,
 (SELECT id FROM castor.charity_category WHERE code = 'wisdom'), 0, 6, 1, now(3), NULL),
(null, 'deer', '森林之蛋', 10,
 (SELECT id FROM castor.charity_category WHERE code = 'forest'), 0, 7, 1, now(3), NULL),
-- The VIP egg. Two independent facts, both deliberate:
--   category_id NULL -- its owner picks the category when the donation is
--   confirmed, which is why /api/donation demands categoryId from this one
--   and refuses it from the other seven;
--   requires_subscription 1 -- store.ts's redeem answers
--   SUBSCRIPTION_REQUIRED without paid access. That used to be a hardcoded
--   `code = 'vip'`, which is why this egg's code was 'vip' rather than the
--   fox it depicts.
(null, 'fennec', 'VIP 星冠之蛋', 10, NULL, 1, 99, 1, now(3), NULL);

-- Prints nothing when every egg landed where it should, and prints the
-- offending rows when one did not.
--
-- A NULL category_id on anything but the fennec egg means the subquery
-- above matched no category -- usually a mistyped category slug, or
-- insert_charity_category.sql not run first. Nothing else notices: the egg
-- appears in the store with correct artwork, and the only symptom is that
-- its owner may direct a real donation to any category. /admin/species
-- shows it too, in amber, but that is after the fact; this fires while
-- whoever ran the seed is still looking.
SELECT
  code,
  '*** category_id IS NULL -- this egg can direct a donation anywhere. Expected only for fennec. ***' AS problem
FROM castor.guardian
WHERE category_id IS NULL
  AND code <> 'fennec';
