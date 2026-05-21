-- MultiPrompt — Phase 1 Schema
-- Run: mysql -u root -p multiprompt < migrations/schema.sql

CREATE DATABASE IF NOT EXISTS multiprompt CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE multiprompt;

-- ─── Users (Google login) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  google_id   VARCHAR(64)  NOT NULL UNIQUE,
  email       VARCHAR(255) NOT NULL,
  name        VARCHAR(255) NOT NULL DEFAULT '',
  avatar_url  TEXT,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_google_id (google_id),
  INDEX idx_email     (email)
) ENGINE=InnoDB;

-- ─── AI credentials (encrypted) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_credentials (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  provider    ENUM('claude','gemini','chatgpt','copilot','perplexity') NOT NULL,
  api_key_enc TEXT         NOT NULL COMMENT 'AES-256-CBC encrypted, key from env',
  model       VARCHAR(128) NOT NULL DEFAULT '',
  extra_json  JSON                  COMMENT 'e.g. Azure endpoint for Copilot',
  enabled     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_provider (user_id, provider),
  CONSTRAINT fk_cred_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─── Prompt sessions ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prompt_sessions (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED NOT NULL,
  prompt_text   TEXT         NOT NULL,
  providers     JSON         NOT NULL COMMENT '["claude","gemini","chatgpt"]',
  compare_with  VARCHAR(32)           COMMENT 'Provider used for comparison',
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session_user (user_id),
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─── AI responses ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_responses (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id    INT UNSIGNED NOT NULL,
  provider      VARCHAR(32)  NOT NULL,
  response_text LONGTEXT,
  tokens_used   INT UNSIGNED,
  latency_ms    INT UNSIGNED,
  error         TEXT,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_response_session (session_id),
  CONSTRAINT fk_response_session FOREIGN KEY (session_id) REFERENCES prompt_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─── Comparisons ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comparisons (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id    INT UNSIGNED NOT NULL,
  analyzer      VARCHAR(32)  NOT NULL COMMENT 'Which AI ran the comparison',
  similarities  JSON,
  disparities   JSON,
  raw_analysis  LONGTEXT,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_comp_session (session_id),
  CONSTRAINT fk_comp_session FOREIGN KEY (session_id) REFERENCES prompt_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─── Disparity review requests ───────────────────────────────────
CREATE TABLE IF NOT EXISTS disparity_reviews (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  comparison_id    INT UNSIGNED NOT NULL,
  selected_points  JSON         NOT NULL,
  user_prompt      TEXT         NOT NULL,
  target_providers JSON         NOT NULL,
  responses        JSON,
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_review_comparison (comparison_id),
  CONSTRAINT fk_review_comp FOREIGN KEY (comparison_id) REFERENCES comparisons(id) ON DELETE CASCADE
) ENGINE=InnoDB;
