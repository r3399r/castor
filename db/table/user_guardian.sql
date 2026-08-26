CREATE TABLE IF NOT EXISTS castor.user_guardian (
    id INT UNSIGNED AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    guardian_id INT UNSIGNED NOT NULL,
    level INT UNSIGNED NOT NULL DEFAULT 1,
    xp INT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES castor.user(id),
    FOREIGN KEY (guardian_id) REFERENCES castor.guardian(id),
    UNIQUE KEY uk_user_guardian (user_id, guardian_id) -- one instance per guardian per user
);
