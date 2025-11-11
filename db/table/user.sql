CREATE TABLE IF NOT EXISTS caster.user (
    id INT UNSIGNED AUTO_INCREMENT,
    firebase_uid VARCHAR(128) NOT NULL,
    email VARCHAR(255) NULL,
    name VARCHAR(255) NULL,
    avatar TEXT NULL,
    last_login_at DATETIME(3) NULL,
    created_at DATETIME(3) NULL,
    updated_at DATETIME(3) NULL,
    PRIMARY KEY (id),
    UNIQUE (email),
    UNIQUE (firebase_uid)
);