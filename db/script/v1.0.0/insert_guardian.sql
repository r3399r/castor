-- Seeds the seven guardians for a fresh environment (the local docker DB
-- starts empty, and /box shows an empty store without these rows).
--
-- `code` is the important column: webapp/lib/guardianArtwork.ts maps it to
-- the drawn spirit, and a code that matches nothing there falls back to the
-- locked egg with no error anywhere. These rows mirror the real table as of
-- 2026-10-26 -- an earlier version of this file was left behind by a
-- renaming and seeded three codes that no longer exist, which is how
-- artwork ends up wired to a code nobody owns. Keep them in step with the
-- Spirit categories table in AGENTS.md.
--
-- `cost` is a flat 10 across all seven in the live table, not a ladder;
-- that is deliberate, so do not "fix" it into ascending prices. Ids are
-- left to auto-increment: production happens to hold 7-13 because these
-- replaced an earlier set, and nothing should depend on a particular id.
--
-- Do not run this against an environment that already has guardians -- the
-- unique key on `code` will reject it rather than quietly change anything.
-- Not optional: the mysql client picks its connection charset from the
-- environment, and the one docker-entrypoint-initdb.d runs this with uses
-- latin1, which turns every Chinese character here into three mojibake
-- characters (暖陽之蛋 arrives as 12 characters, 29 bytes). Nothing errors;
-- the egg names are simply wrong from then on.
SET NAMES utf8mb4;

INSERT INTO castor.guardian
(id, code, name, theme, cost, sort_order, is_active, created_at, updated_at)
VALUES
(null, 'children', '暖陽之蛋', '兒少、家庭與婦幼', 10, 1, 1, now(3), NULL),
(null, 'neurodevelopment', '星光之蛋', '身心障礙與神經發展', 10, 2, 1, now(3), NULL),
(null, 'eldercare', '長青之蛋', '高齡長照與失智照護', 10, 3, 1, now(3), NULL),
(null, 'healing', '療癒之蛋', '疾病醫療、心理與善終', 10, 4, 1, now(3), NULL),
(null, 'rights', '共鳴之蛋', '人權、法治、性別與社區', 10, 5, 1, now(3), NULL),
(null, 'wisdom', '智慧之蛋', '教育翻轉、人文與藝術', 10, 6, 1, now(3), NULL),
(null, 'forest', '森林之蛋', '生態環境與動物福利', 10, 7, 1, now(3), NULL);
