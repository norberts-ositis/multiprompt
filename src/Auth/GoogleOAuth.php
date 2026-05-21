<?php
declare(strict_types=1);

namespace MultiPrompt\Auth;

class GoogleOAuth
{
    private const AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
    private const TOKEN_URL = 'https://oauth2.googleapis.com/token';
    private const INFO_URL  = 'https://www.googleapis.com/oauth2/v3/userinfo';

    public function __construct(private array $config) {}

    public function getAuthUrl(string $state): string
    {
        return self::AUTH_URL . '?' . http_build_query([
            'client_id'     => $this->config['client_id'],
            'redirect_uri'  => $this->config['redirect_uri'],
            'response_type' => 'code',
            'scope'         => 'openid email profile',
            'state'         => $state,
            'access_type'   => 'offline',
            'prompt'        => 'select_account',
        ]);
    }

    public function exchangeCode(string $code): array
    {
        return $this->post(self::TOKEN_URL, [
            'code'          => $code,
            'client_id'     => $this->config['client_id'],
            'client_secret' => $this->config['client_secret'],
            'redirect_uri'  => $this->config['redirect_uri'],
            'grant_type'    => 'authorization_code',
        ]);
    }

    public function getProfile(string $accessToken): array
    {
        $ch = curl_init(self::INFO_URL);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => ["Authorization: Bearer {$accessToken}"],
            CURLOPT_TIMEOUT        => 8,
        ]);
        $body = curl_exec($ch);
        $err  = curl_error($ch);
        curl_close($ch);

        if ($err) throw new \RuntimeException("Google profile fetch failed: {$err}");
        $data = json_decode($body, true);
        if (empty($data['sub'])) throw new \RuntimeException('Invalid profile response from Google');

        return [
            'id'      => $data['sub'],
            'email'   => $data['email'],
            'name'    => $data['name'],
            'picture' => $data['picture'] ?? null,
        ];
    }

    private function post(string $url, array $fields): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => http_build_query($fields),
            CURLOPT_TIMEOUT        => 10,
        ]);
        $body = curl_exec($ch);
        $err  = curl_error($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($err) throw new \RuntimeException("HTTP request failed: {$err}");
        $data = json_decode($body, true);
        if ($code !== 200 || !is_array($data)) {
            throw new \RuntimeException("Bad response ({$code}): {$body}");
        }
        return $data;
    }
}
