<?php
declare(strict_types=1);

namespace MultiPrompt\AI;

use MultiPrompt\AI\Adapters\ClaudeAdapter;
use MultiPrompt\AI\Adapters\GeminiAdapter;
use MultiPrompt\AI\Adapters\OpenAIAdapter;
use MultiPrompt\Api\Controllers\AccountController;
use MultiPrompt\Database\DB;

class AIDispatcher
{
    /**
     * Dispatch a prompt to multiple providers in parallel using curl_multi.
     * Returns an array of AIResponse keyed by provider name.
     *
     * @param  int      $userId
     * @param  string[] $providers   e.g. ['claude', 'gemini', 'chatgpt']
     * @param  string   $prompt
     * @param  string|null $systemPrompt
     * @return AIResponse[]
     */
    public function dispatch(
        int $userId,
        array $providers,
        string $prompt,
        ?string $systemPrompt = null,
    ): array {
        $credentials = $this->loadCredentials($userId, $providers);
        $adapters    = $this->buildAdapters($credentials);

        // Build curl handles for parallel execution
        $multi   = curl_multi_init();
        $handles = [];

        // We can't use curl_multi with our OO adapters directly,
        // so we dispatch each adapter in a separate fiber/process.
        // For PHP < 8.1 compatibility we use a simpler approach:
        // fire all requests with curl_multi by duplicating the request logic inline.

        $results = [];
        $curlMap = []; // curlHandle => ['provider', 'model', 'start']

        foreach ($adapters as $providerName => $adapter) {
            $cred  = $credentials[$providerName];
            $model = $cred['model'];

            $ch = $this->buildCurlHandle($providerName, $cred, $prompt, $model, $systemPrompt);
            if ($ch === null) {
                $results[$providerName] = new AIResponse(
                    $providerName, $model, false,
                    error: 'Could not build request for this provider'
                );
                continue;
            }

            curl_multi_add_handle($multi, $ch);
            $curlMap[(int)$ch] = ['provider' => $providerName, 'model' => $model, 'start' => hrtime(true), 'ch' => $ch];
        }

        // Execute all handles in parallel
        $running = null;
        do {
            $status = curl_multi_exec($multi, $running);
            if ($running) curl_multi_select($multi, 1.0);
        } while ($running > 0 && $status === CURLM_OK);

        // Collect results
        foreach ($curlMap as $info) {
            $ch       = $info['ch'];
            $provider = $info['provider'];
            $model    = $info['model'];
            $latency  = (int) round((hrtime(true) - $info['start']) / 1_000_000);

            $body     = curl_multi_getcontent($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $err      = curl_error($ch);

            curl_multi_remove_handle($multi, $ch);
            curl_close($ch);

            $results[$provider] = $this->parseResponse($provider, $model, $body, $httpCode, $err, $latency);
        }

        curl_multi_close($multi);

        return $results;
    }

    // ── Build a raw curl handle per provider ─────────────────────────

    private function buildCurlHandle(
        string $provider,
        array $cred,
        string $prompt,
        string $model,
        ?string $systemPrompt,
    ): ?\CurlHandle {
        $key = $cred['key'] ?? '';

        return match ($provider) {
            'claude'  => $this->handleClaude($key, $prompt, $model, $systemPrompt),
            'gemini'  => $this->handleGemini($key, $prompt, $model, $systemPrompt),
            'chatgpt' => $this->handleOpenAI($key, $prompt, $model, $systemPrompt, 'https://api.openai.com/v1/chat/completions'),
            'copilot' => $this->handleCopilot($cred, $prompt, $model, $systemPrompt),
            default   => null,
        };
    }

    private function handleClaude(string $key, string $prompt, string $model, ?string $sys): \CurlHandle
    {
        $payload = [
            'model'      => $model,
            'max_tokens' => 4096,
            'messages'   => [['role' => 'user', 'content' => $prompt]],
        ];
        if ($sys) $payload['system'] = $sys;

        $ch = curl_init('https://api.anthropic.com/v1/messages');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                "x-api-key: {$key}",
                'anthropic-version: 2023-06-01',
            ],
            CURLOPT_TIMEOUT => 120,
        ]);
        return $ch;
    }

    private function handleGemini(string $key, string $prompt, string $model, ?string $sys): \CurlHandle
    {
        $url     = "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$key}";
        $payload = [
            'contents'         => [['role' => 'user', 'parts' => [['text' => $prompt]]]],
            'generationConfig' => ['maxOutputTokens' => 4096],
        ];
        if ($sys) $payload['systemInstruction'] = ['parts' => [['text' => $sys]]];

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_TIMEOUT        => 120,
        ]);
        return $ch;
    }

    private function handleOpenAI(string $key, string $prompt, string $model, ?string $sys, string $url): \CurlHandle
    {
        $messages = [];
        if ($sys) $messages[] = ['role' => 'system', 'content' => $sys];
        $messages[] = ['role' => 'user', 'content' => $prompt];

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode(['model' => $model, 'messages' => $messages, 'max_tokens' => 4096]),
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json', "Authorization: Bearer {$key}"],
            CURLOPT_TIMEOUT        => 120,
        ]);
        return $ch;
    }

    private function handleCopilot(array $cred, string $prompt, string $model, ?string $sys): ?\CurlHandle
    {
        // MS Copilot Chat API is not publicly available.
        // We use GitHub Models instead — same GPT-4o model, free tier, OpenAI-compatible.
        // Get a free token at: https://github.com/settings/tokens (no scopes needed)
        $token = $cred['key'] ?? '';
        if (!$token) return null;

        $url      = 'https://models.inference.ai.azure.com/chat/completions';
        $messages = [];
        if ($sys) $messages[] = ['role' => 'system', 'content' => $sys];
        $messages[] = ['role' => 'user', 'content' => $prompt];

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode([
                'model'      => $model ?: 'gpt-4o',
                'messages'   => $messages,
                'max_tokens' => 4096,
            ]),
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                "Authorization: Bearer {$token}",
            ],
            CURLOPT_TIMEOUT => 120,
        ]);
        return $ch;
    }

    // ── Parse raw curl response per provider ─────────────────────────

    private function parseResponse(
        string $provider,
        string $model,
        string|false $body,
        int $httpCode,
        string $curlError,
        int $latency,
    ): AIResponse {
        if ($curlError) {
            return new AIResponse($provider, $model, false, error: $curlError, latencyMs: $latency);
        }

        $data = json_decode((string)$body, true) ?? [];

        if ($httpCode !== 200) {
            $msg = match ($provider) {
                'claude'  => $data['error']['message'] ?? "HTTP {$httpCode}",
                'gemini'  => $data['error']['message'] ?? "HTTP {$httpCode}",
                default   => $data['error']['message'] ?? "HTTP {$httpCode}",
            };
            return new AIResponse($provider, $model, false, error: $msg, latencyMs: $latency);
        }

        [$text, $tokensIn, $tokensOut] = match ($provider) {
            'claude' => [
                $data['content'][0]['text'] ?? '',
                $data['usage']['input_tokens'] ?? 0,
                $data['usage']['output_tokens'] ?? 0,
            ],
            'gemini' => [
                $data['candidates'][0]['content']['parts'][0]['text'] ?? '',
                $data['usageMetadata']['promptTokenCount'] ?? 0,
                $data['usageMetadata']['candidatesTokenCount'] ?? 0,
            ],
            default => [
                $data['choices'][0]['message']['content'] ?? '',
                $data['usage']['prompt_tokens'] ?? 0,
                $data['usage']['completion_tokens'] ?? 0,
            ],
        };

        return new AIResponse(
            provider: $provider,
            model: $model,
            ok: true,
            text: $text,
            latencyMs: $latency,
            tokensPrompt: $tokensIn,
            tokensCompletion: $tokensOut,
        );
    }

    // ── Load & decrypt credentials from DB ───────────────────────────

    private function loadCredentials(int $userId, array $providers): array
    {
        $placeholders = implode(',', array_fill(0, count($providers), '?'));
        $rows = DB::query(
            "SELECT provider, api_key_enc, api_key_iv, model, meta
             FROM ai_credentials
             WHERE user_id = ? AND provider IN ({$placeholders}) AND enabled = 1",
            array_merge([$userId], $providers)
        );

        $credentials = [];
        foreach ($rows as $row) {
            $key = AccountController::decryptKey($row['api_key_enc'], $row['api_key_iv']);
            $credentials[$row['provider']] = [
                'key'   => $key,
                'model' => $row['model'],
                'meta'  => json_decode($row['meta'] ?? '{}', true),
            ];
        }
        return $credentials;
    }

    private function buildAdapters(array $credentials): array
    {
        $adapters = [];
        foreach ($credentials as $provider => $cred) {
            $adapters[$provider] = match ($provider) {
                'claude'  => new ClaudeAdapter($cred['key']),
                'gemini'  => new GeminiAdapter($cred['key']),
                'chatgpt' => new OpenAIAdapter($cred['key'], 'chatgpt'),
                'copilot' => new OpenAIAdapter(
                    $cred['key'] ?? '',
                    'copilot',
                    'https://models.inference.ai.azure.com/chat/completions'
                ),
                default   => null,
            };
        }
        return array_filter($adapters);
    }
}