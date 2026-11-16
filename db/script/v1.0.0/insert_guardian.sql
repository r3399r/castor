-- Seeds the eight guardians for a fresh environment; without them /box
-- shows an empty store, which reads as broken rather than unseeded.
--
-- Must run after insert_charity_category.sql. Each category_id is a
-- subquery on the category's code -- never a literal id, those differ per
-- environment -- and an empty charity_category leaves them NULL without
-- erroring, which means "may support any category", i.e. seven VIP eggs.
-- Adding an egg: match the *category's* code, not the egg's. The VIP egg
-- is the exception and writes NULL -- see its own note below. GUARDIAN.md.
--
-- `code` drives the artwork (webapp/lib/guardianArtwork.ts); one it does
-- not know falls back to the locked egg silently. These mirror the live
-- table as of 2026-10-26 -- confirm against /admin/species rather than
-- this file, and keep AGENTS.md's Spirit categories table in step.
--
-- `cost` is a flat 10 in the live table, not a ladder. Do not "fix" it.
--
-- SET NAMES is not optional: docker-entrypoint-initdb.d uses a latin1
-- client, which silently turns 暖陽之蛋 into 12 mojibake characters.
-- A second run is rejected by uk_code.
SET NAMES utf8mb4;

INSERT INTO castor.guardian
(id, code, name, theme, cost, category_id, sort_order, is_active, created_at, updated_at)
VALUES
(null, 'children', '暖陽之蛋', '兒少、家庭與婦幼', 10,
 (SELECT id FROM castor.charity_category WHERE code = 'children'), 1, 1, now(3), NULL),
(null, 'neurodevelopment', '星光之蛋', '身心障礙與神經發展', 10,
 (SELECT id FROM castor.charity_category WHERE code = 'neurodevelopment'), 2, 1, now(3), NULL),
(null, 'eldercare', '長青之蛋', '高齡長照與失智照護', 10,
 (SELECT id FROM castor.charity_category WHERE code = 'eldercare'), 3, 1, now(3), NULL),
(null, 'healing', '療癒之蛋', '疾病醫療、心理與善終', 10,
 (SELECT id FROM castor.charity_category WHERE code = 'healing'), 4, 1, now(3), NULL),
(null, 'rights', '共鳴之蛋', '人權、法治、性別與社區', 10,
 (SELECT id FROM castor.charity_category WHERE code = 'rights'), 5, 1, now(3), NULL),
(null, 'wisdom', '智慧之蛋', '教育翻轉、人文與藝術', 10,
 (SELECT id FROM castor.charity_category WHERE code = 'wisdom'), 6, 1, now(3), NULL),
(null, 'forest', '森林之蛋', '生態環境與動物福利', 10,
 (SELECT id FROM castor.charity_category WHERE code = 'forest'), 7, 1, now(3), NULL),
-- The VIP egg. category_id is NULL on purpose and is the whole definition
-- of it: its owner picks the category when the donation is confirmed,
-- which is why /api/donation demands categoryId from this one and refuses
-- it from the other seven. Subscriber-only, enforced by store.ts's redeem
-- on this `code`; there is no column for it.
(null, 'vip', 'VIP 星冠之蛋', '可任選公益類別', 10, NULL, 99, 1, now(3), NULL);
