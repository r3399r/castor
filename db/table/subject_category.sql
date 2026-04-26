CREATE TABLE IF NOT EXISTS castor.subject_category (
    subject_id INT UNSIGNED NOT NULL,
    category_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (subject_id, category_id),
    FOREIGN KEY (subject_id) REFERENCES subject(id),
    FOREIGN KEY (category_id) REFERENCES category(id)
);