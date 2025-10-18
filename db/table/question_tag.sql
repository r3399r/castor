CREATE TABLE IF NOT EXISTS caster.question_tag (
    question_id INT UNSIGNED NOT NULL,
    tag_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (question_id, tag_id),
    FOREIGN KEY (question_id) REFERENCES question(id),
    FOREIGN KEY (tag_id) REFERENCES tag(id)
);