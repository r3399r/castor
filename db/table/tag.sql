CREATE TABLE IF NOT EXISTS castor.tag (
    id INT UNSIGNED AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    subject_id INT UNSIGNED NOT NULL,
    created_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    UNIQUE (name, subject_id),
    FOREIGN KEY (subject_id) REFERENCES subject(id),
    INDEX (subject_id)
);