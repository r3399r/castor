-- Single-row table: platform-wide median (p50) of reply.duration_ms, the
-- anchor question/subject-level time weighting compares against (see
-- backend_new/src/routes/reply.ts). No natural entity to attach this to,
-- so it's its own table -- always exactly one row, upserted nightly by
-- questionStat.ts.
CREATE TABLE IF NOT EXISTS castor.duration_global_stat (
    id INT UNSIGNED AUTO_INCREMENT,
    median_ms INT UNSIGNED NOT NULL,
    updated_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id)
);
