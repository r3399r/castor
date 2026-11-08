-- Seeds the seven public-interest categories and points each existing
-- guardian at the one it used to carry in its `theme` column.
--
-- The names are exactly the seven guardian.theme strings as of
-- 2026-11-08, and the codes are the matching guardian.code values, so the
-- link can be made by code without anyone typing an id. Keep both in step
-- with the Spirit categories table in AGENTS.md.
--
-- Ids are left to auto-increment: nothing should depend on a particular
-- one, the same way the guardian rows do not.
--
-- Safe to replay? The INSERT is not -- uk_code rejects a second run
-- rather than quietly changing anything, which is the intended outcome.
-- The UPDATE is idempotent on its own.
--
-- Not optional: the mysql client takes its connection charset from the
-- environment, and the one docker-entrypoint-initdb.d uses is latin1,
-- which turns every Chinese character here into three mojibake
-- characters. Nothing errors; the category names are simply wrong.
SET NAMES utf8mb4;

INSERT INTO castor.charity_category
(id, code, name, sort_order, is_active, created_at, updated_at)
VALUES
(null, 'children', '兒少、家庭與婦幼', 1, 1, now(3), NULL),
(null, 'neurodevelopment', '身心障礙與神經發展', 2, 1, now(3), NULL),
(null, 'eldercare', '高齡長照與失智照護', 3, 1, now(3), NULL),
(null, 'healing', '疾病醫療、心理與善終', 4, 1, now(3), NULL),
(null, 'rights', '人權、法治、性別與社區', 5, 1, now(3), NULL),
(null, 'wisdom', '教育翻轉、人文與藝術', 6, 1, now(3), NULL),
(null, 'forest', '生態環境與動物福利', 7, 1, now(3), NULL);

-- Joined on code, not on theme: the codes are the stable identifiers on
-- both sides, and matching on a display string would break the moment one
-- of them is reworded. A guardian whose code is not among the seven --
-- the VIP spirit, when it arrives -- is left at NULL, which is exactly
-- what "may support any category" means.
UPDATE castor.guardian g
  JOIN castor.charity_category c ON c.code = g.code
  SET g.category_id = c.id;
