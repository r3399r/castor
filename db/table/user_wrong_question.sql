CREATE TABLE IF NOT EXISTS castor.user_wrong_question (
    id INT UNSIGNED AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    question_id INT UNSIGNED NOT NULL,
    parent_id INT UNSIGNED NULL,
    subject_id INT UNSIGNED NOT NULL,
    score DOUBLE NOT NULL DEFAULT 0,
    -- What the user actually filled in on the attempt `score` and
    -- `last_wrong_at` describe, so the 錯題本 card can print it beside the
    -- answer key. Of the same grain as those two: one snapshot of the most
    -- recent sub-full-mark attempt, overwritten by the next one.
    --
    -- Deliberately NOT recovered by joining `reply` at read time: the
    -- latest reply to a question is not necessarily the latest *wrong*
    -- one, so a later correct attempt would print an answer that
    -- contradicts the score on the same card.
    --
    -- NULL, not NOT NULL DEFAULT '': rows written before this column
    -- existed have no value, and an empty string cannot be told apart from
    -- a question submitted blank. reply.replied_answer is nullable for the
    -- same reason.
    replied_answer VARCHAR(255) NULL,
    wrong_count INT UNSIGNED NOT NULL DEFAULT 1,
    last_wrong_at DATETIME(3) NOT NULL,
    note TEXT NULL,
    created_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES user(id),
    FOREIGN KEY (question_id) REFERENCES question(id),
    FOREIGN KEY (parent_id) REFERENCES question(id),
    FOREIGN KEY (subject_id) REFERENCES subject(id),
    UNIQUE KEY unique_user_question (user_id, question_id),
    INDEX idx_user_subject (user_id, subject_id)
);