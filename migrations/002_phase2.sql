-- MultiPrompt — Phase 2 Schema
-- Run after 001_phase1.sql
-- mysql -u root -p multiprompt < migrations/002_phase2.sql

USE multiprompt;

-- ── Prompt sessions ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prompt_sessions (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id      INT UNSIGNED NOT NULL,
    prompt_text  TEXT         NOT NULL,
    providers    JSON         NOT NULL,   -- ["claude","gemini","chatgpt"]
    system_prompt TEXT        NULL,       -- optional system/context prompt
    status       ENUM('pending','running','completed','error') NOT NULL DEFAULT 'pending',
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP    NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_created (user_id, created_at DESC)
) ENGINE=InnoDB;

-- ── Individual AI responses ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_responses (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    session_id   INT UNSIGNED NOT NULL,
    provider     VARCHAR(32)  NOT NULL,
    model        VARCHAR(128) NOT NULL DEFAULT '',
    response_text LONGTEXT    NULL,
    tokens_prompt INT UNSIGNED NULL,
    tokens_completion INT UNSIGNED NULL,
    latency_ms   INT UNSIGNED NULL,
    status       ENUM('pending','streaming','completed','error') NOT NULL DEFAULT 'pending',
    error_message TEXT        NULL,
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP    NULL,
    FOREIGN KEY (session_id) REFERENCES prompt_sessions(id) ON DELETE CASCADE,
    INDEX idx_session (session_id),
    INDEX idx_session_provider (session_id, provider)
) ENGINE=InnoDB;
