CREATE TABLE IF NOT EXISTS castor.subject (
    id INT UNSIGNED AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    category_id INT UNSIGNED NOT NULL,
    created_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    UNIQUE (name, category_id),
    FOREIGN KEY (category_id) REFERENCES castor.category(id)
);