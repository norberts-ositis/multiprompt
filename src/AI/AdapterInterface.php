<?php
declare(strict_types=1);

namespace MultiPrompt\AI;

interface AdapterInterface
{
    /**
     * Send a prompt and return the full response (non-streaming).
     */
    public function complete(string $prompt, string $model, ?string $systemPrompt = null): AIResponse;

    public function getName(): string;
}
