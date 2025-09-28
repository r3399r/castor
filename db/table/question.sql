CREATE TABLE IF NOT EXISTS caster.question (
    id INT UNSIGNED AUTO_INCREMENT,
    content TEXT NOT NULL,
    is_free_response BOOLEAN NOT NULL DEFAULT FALSE,
    discussion_url VARCHAR(255) NOT NULL,
    created_at DATETIME(3) NULL,
    updated_at DATETIME(3) NULL,
    PRIMARY KEY (id)
);