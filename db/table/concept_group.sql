CREATE TABLE IF NOT EXISTS castor.concept_group (
    id INT UNSIGNED AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    subject_id INT UNSIGNED NOT NULL,
    created_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE (name, subject_id),
    FOREIGN KEY (subject_id) REFERENCES subject(id)
);