CREATE TABLE IF NOT EXISTS castor.filter_dimension (
    id INT UNSIGNED AUTO_INCREMENT,
    category_id INT UNSIGNED NOT NULL,
    name VARCHAR(255) NOT NULL,   -- '類科分組', '類科選擇'
    sort_order TINYINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    FOREIGN KEY (category_id) REFERENCES category(id)
);