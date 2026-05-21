<?php
declare(strict_types=1);

namespace MultiPrompt\Api\Controllers;

use MultiPrompt\AI\Adapters\ClaudeAdapter;
use MultiPrompt\AI\Adapters\GeminiAdapter;
use MultiPrompt\AI\Adapters\OpenAIAdapter;
use MultiPrompt\Api\Controllers\AccountController;
use MultiPrompt\Database\DB;

class ComparisonController extends BaseController
{
    // POST /api/comparisons
    // Body: { session_id, analyzer }  (analyzer = 'claude'|'gemini'|'chatgpt')
    public function create(array $params): void
    {
        if (!$user = $this->requireAuth()) return;
        $body      = $this->body();
        $sessionId = (int)($body['session_id'] ?? 0);
        $analyzer  = $body['analyzer'] ?? 'claude';

        $session = DB::queryOne(
            'SELECT * FROM prompt_sessions WHERE id = ? AND user_id = ?',
            [$sessionId, $user['id']]
        );
        if (!$session) { $this->error('Session not found', 404); return; }
        if ($session['status'] !== 'completed') {
            $this->error('Session must be completed before comparing', 400); return;
        }

        // Load all successful responses
        $responses = DB::query(
            'SELECT provider, model, response_text FROM ai_responses
             WHERE session_id = ? AND status = "completed" AND response_text IS NOT NULL',
            [$sessionId]
        );

        if (count($responses) < 2) {
            $this->error('Need at least 2 successful responses to compare', 400); return;
        }

        // Build the analysis prompt
        $analysisPrompt = $this->buildAnalysisPrompt($session['prompt_text'], $responses);

        // Get the adapter for the chosen analyzer
        $adapter = $this->getAdapter($user['id'], $analyzer);
        if (!$adapter) {
            $this->error("No credentials found for analyzer: {$analyzer}", 400); return;
        }

        $cred  = DB::queryOne(
            'SELECT model FROM ai_credentials WHERE user_id = ? AND provider = ?',
            [$user['id'], $analyzer]
        );
        $model = $cred['model'] ?? 'claude-sonnet-4-20250514';

        $result = $adapter->complete($analysisPrompt, $model);

        if (!$result->ok) {
            $this->error("Analyzer failed: {$result->error}", 500); return;
        }

        // Parse the JSON from the AI response
        $parsed = $this->parseAnalysisResponse($result->text);
        if (!$parsed) {
            $this->error('Failed to parse analysis response from AI', 500); return;
        }

        // Persist
        DB::exec(
            'INSERT INTO comparisons
             (session_id, analyzer, analyzer_model, similarities, disparities, summary, confidence)
             VALUES (?,?,?,?,?,?,?)',
            [
                $sessionId,
                $analyzer,
                $result->model,
                json_encode($parsed['similarities']),
                json_encode($parsed['disparities']),
                $parsed['summary'] ?? null,
                $parsed['confidence'] ?? null,
            ]
        );
        $comparisonId = (int) DB::lastId();

        $this->ok([
            'comparison_id' => $comparisonId,
            'analyzer'      => $analyzer,
            'analyzer_model'=> $result->model,
            'similarities'  => $parsed['similarities'],
            'disparities'   => $parsed['disparities'],
            'summary'       => $parsed['summary'] ?? null,
            'confidence'    => $parsed['confidence'] ?? null,
        ]);
    }

    // GET /api/comparisons/{id}
    public function show(array $params): void
    {
        if (!$user = $this->requireAuth()) return;
        $id = (int)($params['id'] ?? 0);

        $row = DB::queryOne(
            'SELECT c.* FROM comparisons c
             JOIN prompt_sessions s ON s.id = c.session_id
             WHERE c.id = ? AND s.user_id = ?',
            [$id, $user['id']]
        );
        if (!$row) { $this->error('Comparison not found', 404); return; }

        $row['similarities'] = json_decode($row['similarities'], true);
        $row['disparities']  = json_decode($row['disparities'],  true);

        $this->ok($row);
    }

    // GET /api/sessions/{id}/comparisons  (latest comparison for a session)
    public function forSession(array $params): void
    {
        if (!$user = $this->requireAuth()) return;
        $sessionId = (int)($params['id'] ?? 0);

        $session = DB::queryOne(
            'SELECT id FROM prompt_sessions WHERE id = ? AND user_id = ?',
            [$sessionId, $user['id']]
        );
        if (!$session) { $this->error('Session not found', 404); return; }

        $row = DB::queryOne(
            'SELECT * FROM comparisons WHERE session_id = ? ORDER BY created_at DESC LIMIT 1',
            [$sessionId]
        );
        if (!$row) { $this->ok(null); return; }

        $row['similarities'] = json_decode($row['similarities'], true);
        $row['disparities']  = json_decode($row['disparities'],  true);

        $this->ok($row);
    }

    // ── Analysis prompt builder ───────────────────────────────────

    private function buildAnalysisPrompt(string $userPrompt, array $responses): string
    {
        $responseBlock = '';
        foreach ($responses as $r) {
            $responseBlock .= "\n\n### {$r['provider']} ({$r['model']})\n{$r['response_text']}";
        }

        return <<<PROMPT
You are an expert analyst comparing responses from multiple AI systems to the same prompt.

## Original user prompt
{$userPrompt}

## AI Responses
{$responseBlock}

## Your task
Analyse all responses above and return a JSON object (and ONLY JSON — no markdown, no preamble, no explanation outside the JSON) with exactly this structure:

{
  "summary": "2-3 sentence prose overview of how the responses relate to each other",
  "confidence": 85,
  "similarities": [
    {
      "point": "Concise description of a shared claim or approach",
      "providers": ["claude", "gemini"]
    }
  ],
  "disparities": [
    {
      "id": "d1",
      "topic": "Short topic label (4-6 words)",
      "description": "What do the AIs disagree or differ about?",
      "severity": "high|medium|low",
      "positions": [
        { "provider": "claude",  "stance": "What Claude specifically says about this" },
        { "provider": "gemini",  "stance": "What Gemini specifically says about this" }
      ]
    }
  ]
}

Rules:
- confidence is 0-100 integer reflecting how confident you are in your analysis
- List up to 6 similarities and up to 6 disparities; focus on the most significant ones
- severity "high" = factual contradiction, "medium" = different emphasis/approach, "low" = minor wording/style difference
- Only include providers that actually differ on a disparity in that disparity's positions array
- Stances must be concrete quotes or close paraphrases, not just "agrees" or "disagrees"
- Output valid JSON only — no trailing commas, no comments
PROMPT;
    }

    // ── Parse AI JSON response ────────────────────────────────────

    private function parseAnalysisResponse(string $text): ?array
    {
        // Strip any accidental markdown fences
        $text = preg_replace('/^```(?:json)?\s*/m', '', $text);
        $text = preg_replace('/```\s*$/m', '', $text);
        $text = trim($text);

        // Extract first {...} block
        if (preg_match('/\{[\s\S]+\}/s', $text, $m)) {
            $text = $m[0];
        }

        $data = json_decode($text, true);
        if (!is_array($data)) return null;
        if (!isset($data['similarities'], $data['disparities'])) return null;

        // Sanitise and normalise
        $similarities = [];
        foreach ((array)($data['similarities'] ?? []) as $s) {
            if (!empty($s['point'])) {
                $similarities[] = [
                    'point'     => (string)$s['point'],
                    'providers' => array_values((array)($s['providers'] ?? [])),
                ];
            }
        }

        $disparities = [];
        foreach ((array)($data['disparities'] ?? []) as $i => $d) {
            if (!empty($d['topic'])) {
                $disparities[] = [
                    'id'          => $d['id'] ?? ('d' . ($i + 1)),
                    'topic'       => (string)$d['topic'],
                    'description' => (string)($d['description'] ?? ''),
                    'severity'    => in_array($d['severity'] ?? '', ['high','medium','low']) ? $d['severity'] : 'medium',
                    'positions'   => array_values((array)($d['positions'] ?? [])),
                ];
            }
        }

        return [
            'summary'      => isset($data['summary'])    ? (string)$data['summary']           : null,
            'confidence'   => isset($data['confidence']) ? min(100, max(0, (int)$data['confidence'])) : null,
            'similarities' => $similarities,
            'disparities'  => $disparities,
        ];
    }

    // ── Get AI adapter from user credentials ─────────────────────

    private function getAdapter(int $userId, string $provider): ?object
    {
        $cred = DB::queryOne(
            'SELECT api_key_enc, api_key_iv, model FROM ai_credentials
             WHERE user_id = ? AND provider = ? AND enabled = 1',
            [$userId, $provider]
        );
        if (!$cred) return null;

        $key = AccountController::decryptKey($cred['api_key_enc'], $cred['api_key_iv']);

        return match ($provider) {
            'claude'  => new ClaudeAdapter($key),
            'gemini'  => new GeminiAdapter($key),
            'chatgpt' => new OpenAIAdapter($key, 'chatgpt'),
            default   => null,
        };
    }
}
