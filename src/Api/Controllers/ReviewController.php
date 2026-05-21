<?php
declare(strict_types=1);

namespace MultiPrompt\Api\Controllers;

use MultiPrompt\AI\AIDispatcher;
use MultiPrompt\Database\DB;

class ReviewController extends BaseController
{
    // POST /api/reviews
    // Body: { comparison_id, selected_ids[], user_directive, target_providers[] }
    public function create(array $params): void
    {
        if (!$user = $this->requireAuth()) return;
        $body = $this->body();

        $comparisonId    = (int)($body['comparison_id']    ?? 0);
        $selectedIds     = (array)($body['selected_ids']   ?? []);
        $userDirective   = trim($body['user_directive']    ?? '');
        $targetProviders = (array)($body['target_providers'] ?? []);

        if (!$comparisonId)      { $this->error('comparison_id required');  return; }
        if (empty($selectedIds)) { $this->error('Select at least one disparity'); return; }
        if (!$userDirective)     { $this->error('Directive prompt required'); return; }
        if (empty($targetProviders)) { $this->error('No target providers specified'); return; }

        // Verify comparison belongs to this user
        $comparison = DB::queryOne(
            'SELECT c.*, s.user_id FROM comparisons c
             JOIN prompt_sessions s ON s.id = c.session_id
             WHERE c.id = ? AND s.user_id = ?',
            [$comparisonId, $user['id']]
        );
        if (!$comparison) { $this->error('Comparison not found', 404); return; }

        // Extract the selected disparity objects
        $allDisparities = json_decode($comparison['disparities'], true) ?? [];
        $selected = array_values(array_filter($allDisparities, fn($d) => in_array($d['id'], $selectedIds)));
        if (empty($selected)) { $this->error('No matching disparities found'); return; }

        // Build the review prompt
        $session = DB::queryOne(
            'SELECT prompt_text FROM prompt_sessions WHERE id = ?',
            [$comparison['session_id']]
        );
        $reviewPrompt = $this->buildReviewPrompt(
            $session['prompt_text'] ?? '',
            $selected,
            $userDirective
        );

        // Create review record
        DB::exec(
            'INSERT INTO disparity_reviews
             (comparison_id, selected_ids, user_directive, target_providers, status)
             VALUES (?,?,?,?,"running")',
            [
                $comparisonId,
                json_encode($selectedIds),
                $userDirective,
                json_encode($targetProviders),
            ]
        );
        $reviewId = (int) DB::lastId();

        // Dispatch to target providers
        $dispatcher = new AIDispatcher();
        $results = $dispatcher->dispatch(
            userId: $user['id'],
            providers: $targetProviders,
            prompt: $reviewPrompt,
        );

        // Collect responses
        $responseMap = [];
        foreach ($results as $provider => $response) {
            $responseMap[$provider] = [
                'ok'         => $response->ok,
                'text'       => $response->text,
                'error'      => $response->error,
                'model'      => $response->model,
                'latency_ms' => $response->latencyMs,
                'tokens'     => $response->tokensPrompt + $response->tokensCompletion,
            ];
        }

        // Persist results
        DB::exec(
            'UPDATE disparity_reviews
             SET responses = ?, status = "completed", completed_at = NOW()
             WHERE id = ?',
            [json_encode($responseMap), $reviewId]
        );

        $this->ok([
            'review_id'  => $reviewId,
            'responses'  => $responseMap,
            'prompt_used'=> $reviewPrompt,
        ]);
    }

    // GET /api/reviews/{id}
    public function show(array $params): void
    {
        if (!$user = $this->requireAuth()) return;
        $id = (int)($params['id'] ?? 0);

        $row = DB::queryOne(
            'SELECT r.* FROM disparity_reviews r
             JOIN comparisons c ON c.id = r.comparison_id
             JOIN prompt_sessions s ON s.id = c.session_id
             WHERE r.id = ? AND s.user_id = ?',
            [$id, $user['id']]
        );
        if (!$row) { $this->error('Review not found', 404); return; }

        $row['selected_ids']     = json_decode($row['selected_ids'], true);
        $row['target_providers'] = json_decode($row['target_providers'], true);
        $row['responses']        = json_decode($row['responses'], true);

        $this->ok($row);
    }

    // ── Build the review prompt ───────────────────────────────────

    private function buildReviewPrompt(string $originalPrompt, array $disparities, string $directive): string
    {
        $disparityBlock = '';
        foreach ($disparities as $i => $d) {
            $disparityBlock .= "\n\n**Disparity " . ($i + 1) . ": {$d['topic']}**\n";
            $disparityBlock .= "{$d['description']}\n";
            foreach ($d['positions'] as $pos) {
                $disparityBlock .= "\n- **{$pos['provider']}**: {$pos['stance']}";
            }
        }

        return <<<PROMPT
The following is a follow-up analysis request regarding a previous AI conversation.

## Original question asked to all AIs
{$originalPrompt}

## Identified disparities between AI responses
{$disparityBlock}

## User's directive for this review
{$directive}

Please respond to the user's directive above, specifically addressing the disparities identified. Be direct and concrete — explain your position clearly, acknowledge where other AI systems may have valid points, and clarify your reasoning where there are contradictions.
PROMPT;
    }
}
