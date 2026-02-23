CREATE TABLE IF NOT EXISTS castor.concept (
    id INT UNSIGNED AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    concept_group_id INT UNSIGNED NOT NULL,
    created_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    UNIQUE (name, concept_group_id),
    FOREIGN KEY (concept_group_id) REFERENCES concept_group(id)
);