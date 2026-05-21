<?php
declare(strict_types=1);

namespace MultiPrompt\AI;

class AIResponse
{
    public function __construct(
        public readonly string  $provider,
        public readonly string  $model,
        public readonly bool    $ok,
        public readonly string  $text         = '',
        public readonly ?string $error        = null,
        public readonly int     $latencyMs    = 0,
        public readonly int     $tokensPrompt = 0,
        public readonly int     $tokensCompletion = 0,
    ) {}

    public function toArray(): array
    {
        return [
            'provider'          => $this->provider,
            'model'             => $this->model,
            'ok'                => $this->ok,
            'text'              => $this->text,
            'error'             => $this->error,
            'latency_ms'        => $this->latencyMs,
            'tokens_prompt'     => $this->tokensPrompt,
            'tokens_completion' => $this->tokensCompletion,
        ];
    }
}
