<?php
declare(strict_types=1);

namespace MultiPrompt\AI\Adapters;

use MultiPrompt\AI\AdapterInterface;
use MultiPrompt\AI\AIResponse;

class ClaudeAdapter implements AdapterInterface
{
    public function __construct(private string $apiKey) {}

    public function getName(): string { return 'claude'; }

    public function complete(string $prompt, string $model, ?string $systemPrompt = null): AIResponse
    {
        $start   = hrtime(true);
        $payload = [
            'model'      => $model,
            'max_tokens' => 4096,
            'messages'   => [['role' => 'user', 'content' => $prompt]],
        ];
        if ($systemPrompt) {
            $payload['system'] = $systemPrompt;
        }

        $ch = curl_init('https://api.anthropic.com/v1/messages');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'x-api-key: ' . $this->apiKey,
                'anthropic-version: 2023-06-01',
            ],
            CURLOPT_TIMEOUT => 120,
        ]);

        $body   = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err    = curl_error($ch);
        curl_close($ch);

        $latency = (int) round((hrtime(true) - $start) / 1_000_000);

        if ($err) {
            return new AIResponse('claude', $model, false, error: $err, latencyMs: $latency);
        }

        $data = json_decode($body, true);

        if ($status !== 200) {
            $msg = $data['error']['message'] ?? "HTTP {$status}";
            return new AIResponse('claude', $model, false, error: $msg, latencyMs: $latency);
        }

        $text             = $data['content'][0]['text'] ?? '';
        $tokensPrompt     = $data['usage']['input_tokens'] ?? 0;
        $tokensCompletion = $data['usage']['output_tokens'] ?? 0;

        return new AIResponse(
            provider: 'claude',
            model: $model,
            ok: true,
            text: $text,
            latencyMs: $latency,
            tokensPrompt: $tokensPrompt,
            tokensCompletion: $tokensCompletion,
        );
    }
}
