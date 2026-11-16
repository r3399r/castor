-- Seeds the seven public-interest categories.
--
-- Must run before insert_guardian.sql, which reads these rows to fill
-- each egg's category_id by matching code.
--
-- The names are the seven guardian.theme strings and the codes the seven
-- guardian.code values, as of 2026-11-08; keep both in step with the
-- Spirit categories table in AGENTS.md. Ids are auto-increment and
-- nothing should depend on a particular one.
--
-- SET NAMES is not optional: docker-entrypoint-initdb.d uses a latin1
-- client, which silently turns the names into mojibake. A second run is
-- rejected by uk_code.
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
