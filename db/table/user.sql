CREATE TABLE IF NOT EXISTS castor.user (
    id INT UNSIGNED AUTO_INCREMENT,
    firebase_uid VARCHAR(128) NOT NULL,
    email VARCHAR(255) NULL,
    name VARCHAR(255) NULL,
    avatar TEXT NULL,
    total_points INT UNSIGNED NOT NULL DEFAULT 0, -- spendable balance; decreases when spent
    lifetime_points INT UNSIGNED NOT NULL DEFAULT 0, -- only ever increases; leaderboard ranks on this
    last_login_at DATETIME(3) NULL,
    created_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE (email),
    UNIQUE (firebase_uid)
);