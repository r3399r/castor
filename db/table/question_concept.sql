CREATE TABLE IF NOT EXISTS castor.question_concept (
    question_id INT UNSIGNED NOT NULL,
    concept_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (question_id, concept_id),
    FOREIGN KEY (question_id) REFERENCES question(id),
    FOREIGN KEY (concept_id) REFERENCES concept(id)
);