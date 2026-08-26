CREATE TABLE IF NOT EXISTS castor.guardian (
    id INT UNSIGNED AUTO_INCREMENT,
    code VARCHAR(50) NOT NULL, -- stable slug (e.g. 'forest'), not shown to users
    name VARCHAR(100) NOT NULL,
    theme VARCHAR(100) NOT NULL,
    cost INT UNSIGNED NOT NULL, -- points required to redeem one of this guardian in the store
    sort_order TINYINT UNSIGNED NOT NULL DEFAULT 0,
    is_active TINYINT NOT NULL DEFAULT 1, -- inactive guardians stay in the catalog (existing owners keep theirs) but drop out of the store listing
    created_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_code (code)
);
