-- A 題組 links concepts twice over: the parent row carries the union of
-- its own concepts and every child's, and each child carries the subset
-- it actually tests. The parent's is the one every filter reads -- the
-- admin list, GET /question/count and the adaptive candidate pools all
-- require `parent_id IS NULL`, so a concept that lived only on a child
-- would make the whole group unservable.
--
-- The children's rows decide two things: which concept chips a
-- sub-question shows, and which concepts answering it credits in
-- user_concept_stat. An answer credits the sub-question's own concepts
-- plus the group-level ones -- the parent's set minus everything any
-- child claims -- so a 題組 whose sub-questions test different things no
-- longer records the same score against all of them. See
-- src/lib/questionConcept.ts (and its webapp twin, which splits the chips
-- the same way).
--
-- concept.number_of_questions counts only the parent's set, since it
-- weights adaptive selection and a 題組 is one servable question.
CREATE TABLE IF NOT EXISTS castor.question_concept (
    question_id INT UNSIGNED NOT NULL,
    concept_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (question_id, concept_id),
    FOREIGN KEY (question_id) REFERENCES question(id),
    FOREIGN KEY (concept_id) REFERENCES concept(id)
);