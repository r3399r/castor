CREATE TABLE IF NOT EXISTS caster.user (
    id INT UNSIGNED AUTO_INCREMENT,
    device_id VARCHAR(255) NOT NULL,
    email VARCHAR(255) NULL,
    created_at DATETIME(3) NULL,
    updated_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    UNIQUE (email),
    UNIQUE (device_id)
);