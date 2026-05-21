# MultiPrompt — Phase 1

Send one prompt to every AI simultaneously. Compare, contrast, resolve.

## Phase 1 covers
- Google OAuth 2.0 login
- User account management  
- AI API key storage (AES-256-GCM encrypted)
- Per-provider connection testing (real API ping)
- Dashboard with AI status overview

---

## Quick start (frontend only — no backend needed)

```bash
cd multiprompt/public
python3 -m http.server 8080
# or: npx serve .
```

Open http://localhost:8080 — use **"Try demo mode"** or the sign-in modal to test the full UI without PHP.

---

## Full stack setup

### 1. PHP + MySQL

Requirements: PHP 8.1+, MySQL 8+, Composer

```bash
composer install
mysql -u root -p -e "CREATE DATABASE multiprompt"
mysql -u root -p multiprompt < migrations/001_phase1.sql
cp .env.example .env
# Edit .env — fill in ENCRYPT_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, DB_*
# Generate encryption key:
php -r "echo base64_encode(random_bytes(32));"
```

### 2. Google OAuth setup

1. Go to https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Add authorized redirect URI: `http://localhost:8080/api/auth/google/callback`
4. Copy Client ID + Secret into `.env`

### 3. Web server

**PHP built-in (dev)**:
```bash
php -S localhost:8080 -t public public/index.php
```

**Apache**: point DocumentRoot to `public/` — `.htaccess` handles routing.

**Nginx**:
```nginx
server {
    listen 8080;
    root /path/to/multiprompt/public;
    location / { try_files $uri $uri/ /index.php$is_args$args; }
    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }
}
```

---

## API endpoints (Phase 1)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/auth/me | Current user (session check) |
| GET | /api/auth/google | Redirect to Google OAuth |
| GET | /api/auth/google/callback | OAuth callback handler |
| POST | /api/auth/logout | End session |
| GET | /api/account | User profile |
| PUT | /api/account | Update display name |
| DELETE | /api/account | Delete account |
| GET | /api/credentials | List connected providers |
| POST | /api/credentials | Save API key (encrypted) |
| PUT | /api/credentials/{provider} | Update key/model |
| DELETE | /api/credentials/{provider} | Remove credentials |
| POST | /api/credentials/test | Live API ping test |

---

## Phase 2 next

- Prompt builder UI + `PromptController`
- Fan-out to selected AIs with `curl_multi_exec`
- Side-by-side response display with SSE streaming
- `prompt_sessions` and `ai_responses` tables
