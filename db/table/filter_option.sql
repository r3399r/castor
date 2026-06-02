CREATE TABLE IF NOT EXISTS castor.filter_option (
    id INT UNSIGNED AUTO_INCREMENT,
    dimension_id INT UNSIGNED NOT NULL,
    parent_id INT UNSIGNED NULL,      -- 指向上層 dimension 的 option
    name VARCHAR(255) NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (dimension_id) REFERENCES filter_dimension(id),
    FOREIGN KEY (parent_id)   REFERENCES filter_option(id)
);