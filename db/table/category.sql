CREATE TABLE IF NOT EXISTS castor.category (
    id INT UNSIGNED AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    -- Which exam family this category belongs to. The list of families is
    -- backend_new/src/lib/categoryKind.ts, served by GET /api/category/kind.
    -- The closed set is enforced there through the request schema, not here:
    -- this schema holds no ENUM anywhere, and widening one means rewriting
    -- the table.
    --
    -- Defaults to 'admission' (DEFAULT_CATEGORY_KIND) so a row inserted
    -- straight through SQL lands in the family /adaptive opens on, and a
    -- POST that omits kind agrees with the column rather than relying on it.
    kind VARCHAR(20) NOT NULL DEFAULT 'admission',
    created_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE (name)
);
