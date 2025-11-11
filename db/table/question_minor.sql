CREATE TABLE IF NOT EXISTS caster.question_minor (
    id INT UNSIGNED AUTO_INCREMENT,
    question_id INT UNSIGNED NOT NULL,
    type VARCHAR(255) NOT NULL,
    order_index INT NOT NULL,
    content TEXT NULL,
    options VARCHAR(255) NULL,
    answer VARCHAR(255) NULL,
    created_at DATETIME(3) NULL,
    updated_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (question_id) REFERENCES question(id)
);