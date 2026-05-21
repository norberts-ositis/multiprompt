-- MultiPrompt — Phase 4 (optional fix)
-- Updates existing Gemini credentials to use gemini-2.5-flash
-- which has a more generous free tier than gemini-2.0-flash
USE multiprompt;

UPDATE ai_credentials
SET model = 'gemini-2.5-flash'
WHERE provider = 'gemini' AND model IN ('gemini-2.0-flash', 'gemini-2.0-pro', 'gemini-1.5-pro', '');