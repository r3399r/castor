CREATE TABLE IF NOT EXISTS castor.exam (
    id INT UNSIGNED AUTO_INCREMENT,
    subject_id INT UNSIGNED NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (subject_id) REFERENCES castor.subject(id),
    UNIQUE (name, subject_id)
);