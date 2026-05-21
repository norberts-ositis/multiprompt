<?php
declare(strict_types=1);

namespace MultiPrompt\AI\Adapters;

use MultiPrompt\AI\AdapterInterface;
use MultiPrompt\AI\AIResponse;

class GeminiAdapter implements AdapterInterface
{
    public function __construct(private string $apiKey) {}

    public function getName(): string { return 'gemini'; }

    public function complete(string $prompt, string $model, ?string $systemPrompt = null): AIResponse
    {
        $start   = hrtime(true);
        $url     = "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$this->apiKey}";

        $payload = [
            'contents' => [
                ['role' => 'user', 'parts' => [['text' => $prompt]]],
            ],
            'generationConfig' => ['maxOutputTokens' => 4096],
        ];
        if ($systemPrompt) {
            $payload['systemInstruction'] = ['parts' => [['text' => $systemPrompt]]];
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_TIMEOUT        => 120,
        ]);

        $body   = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err    = curl_error($ch);
        curl_close($ch);

        $latency = (int) round((hrtime(true) - $start) / 1_000_000);

        if ($err) {
            return new AIResponse('gemini', $model, false, error: $err, latencyMs: $latency);
        }

        $data = json_decode($body, true);

        if ($status !== 200) {
            $msg = $data['error']['message'] ?? "HTTP {$status}";
            return new AIResponse('gemini', $model, false, error: $msg, latencyMs: $latency);
        }

        $text             = $data['candidates'][0]['content']['parts'][0]['text'] ?? '';
        $tokensPrompt     = $data['usageMetadata']['promptTokenCount'] ?? 0;
        $tokensCompletion = $data['usageMetadata']['candidatesTokenCount'] ?? 0;

        return new AIResponse(
            provider: 'gemini',
            model: $model,
            ok: true,
            text: $text,
            latencyMs: $latency,
            tokensPrompt: $tokensPrompt,
            tokensCompletion: $tokensCompletion,
        );
    }
}