CREATE TABLE IF NOT EXISTS castor.point_transaction (
    id INT UNSIGNED AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    type VARCHAR(255) NOT NULL, -- EARN_REPLY, SPEND_* (open-ended, more types added later without a schema change)
    amount INT NOT NULL, -- signed: positive = earned, negative = spent
    reply_id INT UNSIGNED NULL, -- set when type = EARN_REPLY, links back to the answer that earned it
    balance_after INT UNSIGNED NOT NULL, -- snapshot of user.total_points right after this transaction
    created_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES castor.user(id),
    FOREIGN KEY (reply_id) REFERENCES castor.reply(id),
    INDEX idx_user_created_at (user_id, created_at)
);
