-- MultiPrompt — Phase 1 Schema
-- Run: mysql -u root -p multiprompt < migrations/001_phase1.sql

CREATE DATABASE IF NOT EXISTS multiprompt CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE multiprompt;

-- ── Users (Google OAuth) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    google_id   VARCHAR(64)  NOT NULL UNIQUE,
    email       VARCHAR(255) NOT NULL,
    name        VARCHAR(255),
    avatar_url  TEXT,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at  TIMESTAMP    NULL DEFAULT NULL,
    INDEX idx_email (email),
    INDEX idx_google_id (google_id)
) ENGINE=InnoDB;

-- ── Auth sessions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_sessions (
    id         VARCHAR(128)     NOT NULL PRIMARY KEY,  -- PHP session ID
    user_id    INT UNSIGNED     NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    last_active TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB;

-- ── OAuth state tokens (CSRF protection) ──────────────────────────
CREATE TABLE IF NOT EXISTS oauth_states (
    state      VARCHAR(128) NOT NULL PRIMARY KEY,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_created (created_at)
) ENGINE=InnoDB;

-- ── AI credentials (encrypted) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_credentials (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id       INT UNSIGNED NOT NULL,
    provider      ENUM('claude','gemini','chatgpt','copilot') NOT NULL,
    api_key_enc   TEXT         NOT NULL,     -- AES-256-GCM encrypted, base64
    api_key_iv    VARCHAR(64)  NOT NULL,     -- IV for decryption, base64
    model         VARCHAR(128) NOT NULL DEFAULT '',
    meta          JSON         NULL,         -- extra fields e.g. tenant_id/client_id for Copilot
    enabled       TINYINT(1)   NOT NULL DEFAULT 1,
    last_verified TIMESTAMP    NULL DEFAULT NULL,
    last_error    TEXT         NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_user_provider (user_id, provider),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── Cleanup event: purge expired OAuth states ─────────────────────
CREATE EVENT IF NOT EXISTS purge_oauth_states
    ON SCHEDULE EVERY 1 HOUR
    DO DELETE FROM oauth_states WHERE created_at < NOW() - INTERVAL 10 MINUTE;
