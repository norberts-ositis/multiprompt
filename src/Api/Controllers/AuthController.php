<?php
declare(strict_types=1);

namespace MultiPrompt\Api\Controllers;

use MultiPrompt\Auth\GoogleOAuth;
use MultiPrompt\Database\DB;

class AuthController extends BaseController
{
    // GET /api/auth/me
    public function me(array $params): void
    {
        $user = $_SESSION['user'] ?? null;
        if (!$user) { $this->json(['ok' => false, 'user' => null], 401); return; }
        $this->ok($user);
    }

    // GET /api/auth/google  — start OAuth flow
    public function redirectToGoogle(array $params): void
    {
        $config = require ROOT . '/config/app.php';
        $oauth  = new GoogleOAuth($config['google']);

        $state = bin2hex(random_bytes(16));
        $_SESSION['oauth_state'] = $state;

        // Also persist in DB for multi-server setups
        try {
            DB::exec(
                'INSERT INTO oauth_states (state) VALUES (?)',
                [$state]
            );
        } catch (\Throwable) {}

        header('Location: ' . $oauth->getAuthUrl($state));
        exit;
    }

    // GET /api/auth/google/callback
    public function handleCallback(array $params): void
    {
        $config = require ROOT . '/config/app.php';
        $oauth  = new GoogleOAuth($config['google']);

        $code          = $_GET['code']  ?? '';
        $returnedState = $_GET['state'] ?? '';
        $sessionState  = $_SESSION['oauth_state'] ?? '';

        // Validate CSRF state
        if (!$returnedState || $returnedState !== $sessionState) {
            $this->error('Invalid OAuth state — possible CSRF attack', 400);
            return;
        }
        unset($_SESSION['oauth_state']);

        if (!$code) {
            $this->error('OAuth code missing', 400);
            return;
        }

        try {
            $tokenData = $oauth->exchangeCode($code);
            $profile   = $oauth->getProfile($tokenData['access_token']);

            // Upsert user
            $user = DB::queryOne(
                'SELECT * FROM users WHERE google_id = ?',
                [$profile['id']]
            );

            if ($user) {
                DB::exec(
                    'UPDATE users SET name = ?, avatar_url = ?, updated_at = NOW() WHERE google_id = ?',
                    [$profile['name'], $profile['picture'] ?? null, $profile['id']]
                );
            } else {
                DB::exec(
                    'INSERT INTO users (google_id, email, name, avatar_url) VALUES (?,?,?,?)',
                    [$profile['id'], $profile['email'], $profile['name'], $profile['picture'] ?? null]
                );
                $user = DB::queryOne('SELECT * FROM users WHERE google_id = ?', [$profile['id']]);
            }

            // Store in session
            $_SESSION['user'] = [
                'id'     => $user['id'],
                'name'   => $user['name'],
                'email'  => $user['email'],
                'avatar' => $user['avatar_url'],
            ];

            // Record session
            DB::exec(
                'INSERT INTO user_sessions (id, user_id, ip_address, user_agent) VALUES (?,?,?,?)
                 ON DUPLICATE KEY UPDATE last_active = NOW()',
                [session_id(), $user['id'], $_SERVER['REMOTE_ADDR'] ?? '', $_SERVER['HTTP_USER_AGENT'] ?? '']
            );

            // Redirect to frontend dashboard
            $frontendUrl = $config['frontend_url'];
            header("Location: {$frontendUrl}/#dashboard");
            exit;

        } catch (\Throwable $e) {
            // In dev, show the error
            $this->error('OAuth callback failed: ' . $e->getMessage(), 500);
        }
    }

    // POST /api/auth/logout
    public function logout(array $params): void
    {
        $sessionId = session_id();
        try {
            DB::exec('DELETE FROM user_sessions WHERE id = ?', [$sessionId]);
        } catch (\Throwable) {}

        $_SESSION = [];
        session_destroy();

        $this->ok(null, 'Logged out');
    }
}
