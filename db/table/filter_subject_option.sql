CREATE TABLE IF NOT EXISTS castor.filter_subject_option (
    subject_id INT UNSIGNED NOT NULL,
    option_id  INT UNSIGNED NOT NULL,
    PRIMARY KEY (subject_id, option_id),
    FOREIGN KEY (subject_id) REFERENCES subject(id),
    FOREIGN KEY (option_id)  REFERENCES filter_option(id)
);