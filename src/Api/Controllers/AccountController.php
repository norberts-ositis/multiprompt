<?php
declare(strict_types=1);

namespace MultiPrompt\Api\Controllers;

use MultiPrompt\Database\DB;

class AccountController extends BaseController
{
    private const PROVIDERS = ['claude', 'gemini', 'chatgpt', 'copilot'];

    // GET /api/account
    public function show(array $params): void
    {
        if (!$user = $this->requireAuth()) return;
        $row = DB::queryOne('SELECT id, email, name, avatar_url, created_at FROM users WHERE id = ?', [$user['id']]);
        $this->ok($row);
    }

    // PUT /api/account
    public function updateProfile(array $params): void
    {
        if (!$user = $this->requireAuth()) return;
        $body = $this->body();
        $name = trim($body['name'] ?? '');
        if (!$name) { $this->error('Name is required'); return; }

        DB::exec('UPDATE users SET name = ? WHERE id = ?', [$name, $user['id']]);
        $_SESSION['user']['name'] = $name;
        $this->ok(['name' => $name], 'Profile updated');
    }

    // DELETE /api/account
    public function deleteAccount(array $params): void
    {
        if (!$user = $this->requireAuth()) return;
        DB::exec('UPDATE users SET deleted_at = NOW() WHERE id = ?', [$user['id']]);
        DB::exec('DELETE FROM user_sessions WHERE user_id = ?', [$user['id']]);
        $_SESSION = [];
        session_destroy();
        $this->ok(null, 'Account deleted');
    }

    // GET /api/credentials
    public function index(array $params): void
    {
        if (!$user = $this->requireAuth()) return;
        $rows = DB::query(
            'SELECT provider, model, enabled, last_verified, last_error FROM ai_credentials WHERE user_id = ?',
            [$user['id']]
        );
        $result = [];
        foreach ($rows as $row) {
            $result[$row['provider']] = [
                'model'         => $row['model'],
                'enabled'       => (bool)$row['enabled'],
                'status'        => $row['last_verified'] ? 'connected' : 'saved_unverified',
                'last_verified' => $row['last_verified'],
                'last_error'    => $row['last_error'],
            ];
        }
        $this->ok($result);
    }

    // POST /api/credentials
    public function store(array $params): void
    {
        if (!$user = $this->requireAuth()) return;
        $body     = $this->body();
        $provider = $body['provider'] ?? '';
        $key      = trim($body['key'] ?? '');
        $model    = trim($body['model'] ?? '');

        if (!in_array($provider, self::PROVIDERS, true)) { $this->error('Invalid provider'); return; }
        if (!$key)   { $this->error('API key required'); return; }
        if (!$model) { $this->error('Model required'); return; }

        $meta = null; // reserved for future provider-specific metadata

        [$enc, $iv] = $this->encryptKey($key);

        DB::exec(
            'INSERT INTO ai_credentials (user_id, provider, api_key_enc, api_key_iv, model, meta)
             VALUES (?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE api_key_enc = VALUES(api_key_enc), api_key_iv = VALUES(api_key_iv),
                                     model = VALUES(model), meta = VALUES(meta),
                                     last_verified = NULL, last_error = NULL, updated_at = NOW()',
            [$user['id'], $provider, $enc, $iv, $model, $meta]
        );

        $this->ok(['provider' => $provider, 'status' => 'saved_unverified'], 'Credentials saved');
    }

    // PUT /api/credentials/{provider}
    public function update(array $params): void
    {
        if (!$user = $this->requireAuth()) return;
        $provider = $params['provider'] ?? '';
        if (!in_array($provider, self::PROVIDERS, true)) { $this->error('Invalid provider'); return; }

        $body  = $this->body();
        $model = trim($body['model'] ?? '');

        $fields = ['updated_at = NOW()'];
        $values = [];

        if (!empty($body['key'])) {
            [$enc, $iv] = $this->encryptKey($body['key']);
            $fields[] = 'api_key_enc = ?'; $values[] = $enc;
            $fields[] = 'api_key_iv = ?';  $values[] = $iv;
            $fields[] = 'last_verified = NULL';
        }
        if ($model) {
            $fields[] = 'model = ?'; $values[] = $model;
        }
        if (isset($body['enabled'])) {
            $fields[] = 'enabled = ?'; $values[] = (int)$body['enabled'];
        }

        $values[] = $user['id'];
        $values[] = $provider;

        DB::exec(
            'UPDATE ai_credentials SET ' . implode(', ', $fields) . ' WHERE user_id = ? AND provider = ?',
            $values
        );

        $this->ok(['provider' => $provider], 'Updated');
    }

    // DELETE /api/credentials/{provider}
    public function destroy(array $params): void
    {
        if (!$user = $this->requireAuth()) return;
        $provider = $params['provider'] ?? '';
        if (!in_array($provider, self::PROVIDERS, true)) { $this->error('Invalid provider'); return; }

        DB::exec('DELETE FROM ai_credentials WHERE user_id = ? AND provider = ?', [$user['id'], $provider]);
        $this->ok(null, "{$provider} credentials removed");
    }

    // POST /api/credentials/test
    public function test(array $params): void
    {
        if (!$user = $this->requireAuth()) return;
        $body     = $this->body();
        $provider = $body['provider'] ?? '';
        $key      = trim($body['key'] ?? '');

        if (!in_array($provider, self::PROVIDERS, true)) { $this->error('Invalid provider'); return; }

        // If no key supplied, use the stored encrypted key from DB
        if (!$key) {
            $stored = DB::queryOne(
                'SELECT api_key_enc, api_key_iv FROM ai_credentials WHERE user_id = ? AND provider = ?',
                [$user['id'], $provider]
            );
            if (!$stored) { $this->error('No key saved for this provider — please enter your API key first'); return; }
            $key = self::decryptKey($stored['api_key_enc'], $stored['api_key_iv']);
            if (!$key) { $this->error('Failed to decrypt stored key — please re-enter it'); return; }
        }

        $result = $this->pingProvider($provider, $key);

        if ($result['ok']) {
            // Save key and mark as verified in one step
            [$enc, $iv] = $this->encryptKey($key);
            $model = trim($body['model'] ?? 'default');
            DB::exec(
                'INSERT INTO ai_credentials (user_id, provider, api_key_enc, api_key_iv, model, last_verified)
                 VALUES (?,?,?,?,?,NOW())
                 ON DUPLICATE KEY UPDATE api_key_enc = VALUES(api_key_enc), api_key_iv = VALUES(api_key_iv),
                                         model = COALESCE(NULLIF(VALUES(model),"default"), model),
                                         last_verified = NOW(), last_error = NULL, updated_at = NOW()',
                [$user['id'], $provider, $enc, $iv, $model]
            );
        } else {
            DB::exec(
                'UPDATE ai_credentials SET last_error = ? WHERE user_id = ? AND provider = ?',
                [$result['message'], $user['id'], $provider]
            );
        }

        $this->json(['ok' => $result['ok'], 'message' => $result['message']]);
    }

    // ── Helpers ──────────────────────────────────────────────────

    private function pingProvider(string $provider, string $key): array
    {
        $endpoints = [
            'claude'  => [
                'url'     => 'https://api.anthropic.com/v1/models',
                'headers' => ["x-api-key: {$key}", 'anthropic-version: 2023-06-01'],
            ],
            'chatgpt' => [
                'url'     => 'https://api.openai.com/v1/models',
                'headers' => ["Authorization: Bearer {$key}"],
            ],
            'gemini'  => [
                'url'     => 'https://generativelanguage.googleapis.com/v1beta/models?key=' . $key,
                'headers' => [],
            ],
            'copilot' => [
                'url'     => 'https://models.inference.ai.azure.com/models',
                'headers' => ["Authorization: Bearer {$key}"],
            ],
        ];

        if (!isset($endpoints[$provider])) {
            return ['ok' => false, 'message' => "Unknown provider: {$provider}"];
        }

        $ep   = $endpoints[$provider];
        $ch   = curl_init($ep['url']);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => $ep['headers'],
            CURLOPT_TIMEOUT        => 10,
        ]);
        $body   = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err    = curl_error($ch);
        curl_close($ch);

        if ($err)            return ['ok' => false, 'message' => "Connection error: {$err}"];
        if ($status === 200) return ['ok' => true,  'message' => 'Connection successful'];

        // Try to extract a clean error message from JSON response
        $json = json_decode((string)$body, true);
        $apiMsg = $json['error']['message'] ?? $json['error']['status'] ?? null;
        if ($apiMsg) {
            return ['ok' => false, 'message' => "HTTP {$status}: {$apiMsg}"];
        }

        if ($status === 400) return ['ok' => false, 'message' => 'HTTP 400: API key invalid or Generative Language API not enabled in your Google Cloud project'];
        if ($status === 401) return ['ok' => false, 'message' => 'HTTP 401: Invalid API key'];
        if ($status === 403) return ['ok' => false, 'message' => 'HTTP 403: Access denied — check API key permissions'];

        $snippet = substr(strip_tags((string)$body), 0, 150);
        return ['ok' => false, 'message' => "HTTP {$status}: {$snippet}"];
    }

    private function encryptKey(string $key): array
    {
        $config    = require ROOT . '/config/app.php';
        $masterKey = base64_decode($config['encrypt_key']);
        $iv        = random_bytes(12);
        $encrypted = openssl_encrypt($key, 'aes-256-gcm', $masterKey, OPENSSL_RAW_DATA, $iv, $tag);
        return [base64_encode($encrypted . $tag), base64_encode($iv)];
    }

    public static function decryptKey(string $encWithTag, string $ivB64): string
    {
        $config    = require ROOT . '/config/app.php';
        $masterKey = base64_decode($config['encrypt_key']);
        $iv        = base64_decode($ivB64);
        $raw       = base64_decode($encWithTag);
        $tag       = substr($raw, -16);
        $enc       = substr($raw, 0, -16);
        return (string) openssl_decrypt($enc, 'aes-256-gcm', $masterKey, OPENSSL_RAW_DATA, $iv, $tag);
    }
}