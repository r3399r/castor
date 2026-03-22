CREATE TABLE IF NOT EXISTS castor.exam_question (
    question_id INT UNSIGNED NOT NULL,
    exam_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (question_id, exam_id),
    FOREIGN KEY (question_id) REFERENCES question(id),
    FOREIGN KEY (exam_id) REFERENCES exam(id)
);