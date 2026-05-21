-- MultiPrompt — Phase 3 Schema
-- Run after 002_phase2.sql
-- mysql -u root -p multiprompt < migrations/003_phase3.sql

USE multiprompt;

-- ── Comparison analyses ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comparisons (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    session_id      INT UNSIGNED NOT NULL,
    analyzer        VARCHAR(32)  NOT NULL,   -- which AI did the comparison
    analyzer_model  VARCHAR(128) NOT NULL DEFAULT '',
    similarities    JSON         NOT NULL,   -- [{point, providers[]}]
    disparities     JSON         NOT NULL,   -- [{id, topic, description, positions[{provider,stance}]}]
    summary         TEXT         NULL,       -- short prose overview
    confidence      TINYINT UNSIGNED NULL,   -- 0-100
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES prompt_sessions(id) ON DELETE CASCADE,
    INDEX idx_session (session_id)
) ENGINE=InnoDB;

-- ── Disparity review follow-ups ───────────────────────────────────
CREATE TABLE IF NOT EXISTS disparity_reviews (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    comparison_id    INT UNSIGNED NOT NULL,
    selected_ids     JSON         NOT NULL,  -- disparity IDs the user chose
    user_directive   TEXT         NOT NULL,  -- the follow-up instruction
    target_providers JSON         NOT NULL,  -- providers involved in selected disparities
    responses        JSON         NULL,      -- {provider: {text, latency_ms, model}}
    status           ENUM('pending','running','completed','error') NOT NULL DEFAULT 'pending',
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at     TIMESTAMP    NULL,
    FOREIGN KEY (comparison_id) REFERENCES comparisons(id) ON DELETE CASCADE,
    INDEX idx_comparison (comparison_id)
) ENGINE=InnoDB;
