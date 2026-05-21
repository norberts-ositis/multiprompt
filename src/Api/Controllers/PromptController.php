<?php
declare(strict_types=1);

namespace MultiPrompt\Api\Controllers;

use MultiPrompt\AI\AIDispatcher;
use MultiPrompt\Database\DB;

class PromptController extends BaseController
{
    // POST /api/prompts
    // Creates a session and immediately fans out to selected providers.
    // Returns session_id + initial response rows (all pending).
    public function create(array $params): void
    {
        if (!$user = $this->requireAuth()) return;
        $body = $this->body();

        $promptText   = trim($body['prompt']       ?? '');
        $providers    = $body['providers']          ?? [];
        $systemPrompt = trim($body['system_prompt'] ?? '') ?: null;


        if (!$promptText)      { $this->error('Prompt text is required'); return; }
        if (empty($providers)) { $this->error('Select at least one AI provider'); return; }

        $validProviders = ['claude', 'gemini', 'chatgpt', 'copilot'];
        $providers = array_values(array_intersect($providers, $validProviders));
        if (empty($providers)) { $this->error('No valid providers selected'); return; }

        // Create session
        DB::exec(
            'INSERT INTO prompt_sessions (user_id, prompt_text, providers, system_prompt, status)
             VALUES (?, ?, ?, ?, "running")',
            [$user['id'], $promptText, json_encode($providers), $systemPrompt]
        );
        $sessionId = (int) DB::lastId();

        // Insert pending response rows for each provider
        foreach ($providers as $provider) {
            DB::exec(
                'INSERT INTO ai_responses (session_id, provider, model, status) VALUES (?, ?, "", "pending")',
                [$sessionId, $provider]
            );
        }

        $this->ok(['session_id' => $sessionId], 'Session created');
    }

    // GET /api/prompts/{id}/stream  — SSE endpoint
    public function stream(array $params): void
    {
        if (!$user = $this->requireAuth()) return;
        $sessionId = (int)($params['id'] ?? 0);

        $session = DB::queryOne(
            'SELECT * FROM prompt_sessions WHERE id = ? AND user_id = ?',
            [$sessionId, $user['id']]
        );
        if (!$session) { $this->error('Session not found', 404); return; }

        // SSE headers — clear everything set by index.php first
        while (ob_get_level()) ob_end_clean();
        header_remove();
        header('Content-Type: text/event-stream');
        header('Cache-Control: no-cache');
        header('Connection: keep-alive');
        header('X-Accel-Buffering: no');
        ob_implicit_flush(true);

        // Turn PHP errors into SSE error events instead of corrupting the stream
        set_error_handler(function($errno, $errstr) {
            $this->sseEvent('error', ['message' => "PHP error: {$errstr}"]);
            return true;
        });

        $providers    = json_decode($session['providers'], true);
        $promptText   = $session['prompt_text'];
        $systemPrompt = $session['system_prompt'];

        $this->sseEvent('start', ['session_id' => $sessionId, 'providers' => $providers]);

        try {
            $dispatcher = new AIDispatcher();

            $results = $dispatcher->dispatch(
                userId: $user['id'],
                providers: $providers,
                prompt: $promptText,
                systemPrompt: $systemPrompt,
            );

            foreach ($results as $provider => $response) {
                if ($response->ok) {
                    DB::exec(
                        'UPDATE ai_responses
                         SET status = "completed", response_text = ?, model = ?,
                             tokens_prompt = ?, tokens_completion = ?, latency_ms = ?,
                             completed_at = NOW()
                         WHERE session_id = ? AND provider = ?',
                        [
                            $response->text,
                            $response->model,
                            $response->tokensPrompt,
                            $response->tokensCompletion,
                            $response->latencyMs,
                            $sessionId,
                            $provider,
                        ]
                    );
                } else {
                    DB::exec(
                        'UPDATE ai_responses
                         SET status = "error", error_message = ?, latency_ms = ?, completed_at = NOW()
                         WHERE session_id = ? AND provider = ?',
                        [$response->error, $response->latencyMs, $sessionId, $provider]
                    );
                }

                $this->sseEvent('response', $response->toArray());
                if (connection_aborted()) break;
            }

            DB::exec(
                'UPDATE prompt_sessions SET status = "completed", completed_at = NOW() WHERE id = ?',
                [$sessionId]
            );

            $this->sseEvent('done', ['session_id' => $sessionId]);

        } catch (\Throwable $e) {
            // Send the actual error to the browser so we can see it
            $this->sseEvent('error', [
                'message' => $e->getMessage(),
                'file'    => basename($e->getFile()),
                'line'    => $e->getLine(),
            ]);
            DB::exec(
                'UPDATE prompt_sessions SET status = "error" WHERE id = ?',
                [$sessionId]
            );
        }

        restore_error_handler();
        echo "data: [DONE]\n\n";
        flush();
    }

    // GET /api/prompts  — list recent sessions
    public function index(array $params): void
    {
        if (!$user = $this->requireAuth()) return;

        $sessions = DB::query(
            'SELECT id, prompt_text, providers, status, created_at, completed_at
             FROM prompt_sessions
             WHERE user_id = ? AND status != "pending"
             ORDER BY created_at DESC LIMIT 20',
            [$user['id']]
        );

        foreach ($sessions as &$s) {
            $s['providers'] = json_decode($s['providers'], true);
        }

        $this->ok($sessions);
    }

    // GET /api/prompts/{id}  — get session + all responses
    public function show(array $params): void
    {
        if (!$user = $this->requireAuth()) return;
        $sessionId = (int)($params['id'] ?? 0);

        $session = DB::queryOne(
            'SELECT * FROM prompt_sessions WHERE id = ? AND user_id = ?',
            [$sessionId, $user['id']]
        );
        if (!$session) { $this->error('Session not found', 404); return; }

        $session['providers'] = json_decode($session['providers'], true);

        $responses = DB::query(
            'SELECT provider, model, response_text, tokens_prompt, tokens_completion,
                    latency_ms, status, error_message, completed_at
             FROM ai_responses WHERE session_id = ? ORDER BY provider',
            [$sessionId]
        );

        $this->ok([
            'session'   => $session,
            'responses' => $responses,
        ]);
    }

    // POST /api/prompts/{id}/reset — reset a stuck/failed session for retry
    public function reset(array $params): void
    {
        if (!$user = $this->requireAuth()) return;
        $sessionId = (int)($params['id'] ?? 0);

        $affected = DB::exec(
            'UPDATE prompt_sessions SET status = "running", completed_at = NULL
             WHERE id = ? AND user_id = ?',
            [$sessionId, $user['id']]
        );
        if (!$affected) { $this->error('Session not found', 404); return; }

        // Reset all pending/empty responses too
        DB::exec(
            'UPDATE ai_responses SET status = "pending", response_text = NULL,
             error_message = NULL, completed_at = NULL
             WHERE session_id = ? AND (status = "pending" OR response_text IS NULL)',
            [$sessionId]
        );

        $this->ok(['session_id' => $sessionId], 'Session reset');
    }

    // DELETE /api/prompts/{id}
    public function destroy(array $params): void
    {
        if (!$user = $this->requireAuth()) return;
        $sessionId = (int)($params['id'] ?? 0);

        $affected = DB::exec(
            'DELETE FROM prompt_sessions WHERE id = ? AND user_id = ?',
            [$sessionId, $user['id']]
        );
        if (!$affected) { $this->error('Session not found', 404); return; }

        $this->ok(null, 'Session deleted');
    }

    // ── SSE helper ────────────────────────────────────────────────

    private function sseEvent(string $event, mixed $data): void
    {
        echo "event: {$event}\n";
        echo 'data: ' . json_encode($data) . "\n\n";
        if (function_exists('fastcgi_finish_request')) {
            // Can't use in SSE — just flush
        }
        flush();
    }
}