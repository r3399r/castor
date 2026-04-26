CREATE TABLE IF NOT EXISTS castor.exam_subject (
    exam_id INT UNSIGNED NOT NULL,
    subject_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (exam_id, subject_id),
    FOREIGN KEY (exam_id) REFERENCES exam(id),
    FOREIGN KEY (subject_id) REFERENCES subject(id)
);