<?php
declare(strict_types=1);

namespace MultiPrompt\AI\Adapters;

use MultiPrompt\AI\AdapterInterface;
use MultiPrompt\AI\AIResponse;

class OpenAIAdapter implements AdapterInterface
{
    private string $endpoint;

    public function __construct(
        private string $apiKey,
        private string $providerName = 'chatgpt',
        string $endpoint = 'https://api.openai.com/v1/chat/completions',
    ) {
        $this->endpoint = $endpoint;
    }

    public function getName(): string { return $this->providerName; }

    public function complete(string $prompt, string $model, ?string $systemPrompt = null): AIResponse
    {
        $start    = hrtime(true);
        $messages = [];

        if ($systemPrompt) {
            $messages[] = ['role' => 'system', 'content' => $systemPrompt];
        }
        $messages[] = ['role' => 'user', 'content' => $prompt];

        $payload = [
            'model'      => $model,
            'messages'   => $messages,
            'max_tokens' => 4096,
        ];

        $ch = curl_init($this->endpoint);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $this->apiKey,
            ],
            CURLOPT_TIMEOUT => 120,
        ]);

        $body   = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err    = curl_error($ch);
        curl_close($ch);

        $latency = (int) round((hrtime(true) - $start) / 1_000_000);

        if ($err) {
            return new AIResponse($this->providerName, $model, false, error: $err, latencyMs: $latency);
        }

        $data = json_decode($body, true);

        if ($status !== 200) {
            $msg = $data['error']['message'] ?? "HTTP {$status}";
            return new AIResponse($this->providerName, $model, false, error: $msg, latencyMs: $latency);
        }

        $text             = $data['choices'][0]['message']['content'] ?? '';
        $tokensPrompt     = $data['usage']['prompt_tokens'] ?? 0;
        $tokensCompletion = $data['usage']['completion_tokens'] ?? 0;

        return new AIResponse(
            provider: $this->providerName,
            model: $model,
            ok: true,
            text: $text,
            latencyMs: $latency,
            tokensPrompt: $tokensPrompt,
            tokensCompletion: $tokensCompletion,
        );
    }
}
