<?php
declare(strict_types=1);

namespace MultiPrompt\Api\Controllers;

abstract class BaseController
{
    protected function json(mixed $data, int $status = 200): void
    {
        http_response_code($status);
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    protected function ok(mixed $data = null, string $message = 'OK'): void
    {
        $this->json(['ok' => true, 'message' => $message, 'data' => $data]);
    }

    protected function error(string $message, int $status = 400): void
    {
        $this->json(['ok' => false, 'error' => $message], $status);
    }

    protected function unauthorized(): void
    {
        $this->error('Unauthorized', 401);
    }

    protected function body(): array
    {
        $raw = file_get_contents('php://input');
        return json_decode($raw ?: '{}', true) ?? [];
    }

    protected function requireAuth(): ?array
    {
        $user = $_SESSION['user'] ?? null;
        if (!$user) { $this->unauthorized(); return null; }
        return $user;
    }
}
