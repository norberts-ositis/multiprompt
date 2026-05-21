/* ═══════════════════════════════════════════
   MultiPrompt — Phase 3
   Comparison Engine + Disparity Review Loop
   ═══════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════
   COMPARISON PANEL — injected into the session page
   after all responses complete
══════════════════════════════════════════════════════ */

/**
 * Called from phase2.js once all response cards reach "complete" status.
 * Injects the "Compare Responses" bar below the grid.
 */
function injectCompareBar(sessionId, providers, main) {
  if (main.querySelector('#compare-bar')) return; // already injected

  const bar = document.createElement('div');
  bar.id = 'compare-bar';
  bar.style.cssText = 'margin-top:32px;';
  bar.innerHTML = `
    <div class="card" style="background:linear-gradient(135deg,var(--surface),var(--bg3));
         border-color:rgba(240,192,64,0.2);">
      <div class="row-between" style="flex-wrap:wrap;gap:16px;">
        <div>
          <h3 style="margin-bottom:4px;">All responses received</h3>
          <p class="text-muted text-sm">
            Analyse similarities and contradictions across all ${providers.length} AI responses.
          </p>
        </div>
        <div class="row row-8" style="flex-wrap:wrap;gap:8px;align-items:center;">
          <div class="form-group" style="margin:0;">
            <select class="form-select" id="analyzer-select" style="font-size:0.875rem;padding:8px 12px;">
              ${providers.map(id => {
                const p = AI_PROVIDERS.find(x => x.id === id);
                return `<option value="${id}">${p ? p.emoji + ' ' + p.name : id}</option>`;
              }).join('')}
            </select>
          </div>
          <span class="text-xs text-dim">will analyse</span>
          <button class="btn btn-primary" id="run-compare-btn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35M11 8v6M8 11h6"/>
            </svg>
            Compare responses
          </button>
        </div>
      </div>
    </div>
    <div id="comparison-result" style="margin-top:16px;"></div>
  `;

  // Append after the responses grid
  const grid = main.querySelector('#responses-grid');
  if (grid) grid.after(bar);
  else main.querySelector('#session-root')?.appendChild(bar);

  // Wire up
  bar.querySelector('#run-compare-btn').addEventListener('click', async () => {
    const analyzer = bar.querySelector('#analyzer-select').value;
    await runComparison(sessionId, analyzer, bar, main);
  });

  // Check if a comparison already exists for this session (from a previous visit)
  if (!sessionId.toString().startsWith('local_')) {
    API.get(`/prompts/${sessionId}/comparison`).then(res => {
      if (res.ok && res.data?.data) {
        renderComparisonResult(res.data.data, bar.querySelector('#comparison-result'), sessionId, main);
      }
    }).catch(() => {});
  }
}

/* ── Run comparison via API or simulate ── */
async function runComparison(sessionId, analyzer, bar, main) {
  const btn    = bar.querySelector('#run-compare-btn');
  const result = bar.querySelector('#comparison-result');

  btn.disabled = true;
  btn.innerHTML = `<span class="spinner" style="width:13px;height:13px;border-color:rgba(0,0,0,0.2);border-top-color:#0d0d0f"></span> Analysing…`;
  result.innerHTML = `
    <div class="card" style="padding:32px;text-align:center;">
      <div class="spinner" style="width:24px;height:24px;margin:0 auto 12px;"></div>
      <p class="text-muted text-sm">Sending all responses to ${analyzer} for analysis…</p>
    </div>`;

  // Try real API
  const res = await API.post('/comparisons', { session_id: parseInt(sessionId), analyzer });

  if (res.ok && res.data?.data) {
    const data = res.data.data;
    btn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      Re-analyse`;
    btn.disabled = false;
    renderComparisonResult(data, result, sessionId, main);
  } else {
    // Simulate comparison for UI testing
    const simData = await simulateComparison(sessionId, analyzer, main);
    btn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      Re-analyse`;
    btn.disabled = false;
    renderComparisonResult(simData, result, sessionId, main);
  }
}

/* ── Simulate comparison for testing ── */
async function simulateComparison(sessionId, analyzer, main) {
  await new Promise(r => setTimeout(r, 1800 + Math.random() * 800));

  // Grab providers from the page
  const providers = [...main.querySelectorAll('.response-card[data-status="complete"]')]
    .map(c => c.dataset.provider);

  const allProviders = providers.length >= 2 ? providers : ['claude', 'gemini'];
  const [p1, p2] = allProviders;
  const p3 = allProviders[2];

  return {
    comparison_id: 'sim_' + Date.now(),
    analyzer,
    analyzer_model: 'simulated',
    summary: `The AI responses show broad agreement on the core concepts but diverge meaningfully on implementation details and recommended approaches. ${p1 ? p1.charAt(0).toUpperCase() + p1.slice(1) : 'One AI'} tends toward a more conservative stance while ${p2 ? p2.charAt(0).toUpperCase() + p2.slice(1) : 'another'} explores edge cases more deeply. This is a simulated comparison — connect API keys for real analysis.`,
    confidence: 78,
    similarities: [
      { point: 'All AIs agree on the fundamental definition and core principles', providers: allProviders },
      { point: 'Consistent recommendation to follow established best practices', providers: allProviders.slice(0,2) },
      { point: 'Agreement that context and use-case heavily influence the answer', providers: allProviders },
    ],
    disparities: [
      {
        id: 'd1', topic: 'Recommended implementation approach', severity: 'high',
        description: 'The AIs recommend meaningfully different strategies for implementation, with different trade-off analyses.',
        positions: [
          { provider: p1, stance: 'Recommends starting with the simplest possible solution and iterating, citing maintainability.' },
          { provider: p2, stance: 'Advocates for a more comprehensive upfront design to avoid costly refactoring later.' },
          ...(p3 ? [{ provider: p3, stance: 'Suggests a hybrid approach depending on team size and project timeline.' }] : []),
        ].filter(pos => pos.provider),
      },
      {
        id: 'd2', topic: 'Performance vs readability trade-off', severity: 'medium',
        description: 'Conflicting guidance on how to balance performance optimisations against code readability.',
        positions: [
          { provider: p1, stance: 'Prioritises readability first, stating premature optimisation is the root of all evil.' },
          { provider: p2, stance: 'Argues that performance considerations should be baked in from the start for production systems.' },
        ].filter(pos => pos.provider),
      },
      {
        id: 'd3', topic: 'Error handling strategy', severity: 'low',
        description: 'Minor differences in recommended error handling patterns and granularity.',
        positions: [
          { provider: p1, stance: 'Prefers explicit try/catch blocks at each layer with descriptive error messages.' },
          { provider: p2, stance: 'Recommends centralised error handling middleware for consistency.' },
        ].filter(pos => pos.provider),
      },
    ],
  };
}

/* ── Render the full comparison result ── */
function renderComparisonResult(data, container, sessionId, main) {
  const severityColors = { high: 'var(--red)', medium: 'var(--gold)', low: 'var(--text3)' };
  const severityBg     = { high: 'rgba(224,80,80,0.08)', medium: 'rgba(240,192,64,0.08)', low: 'var(--surface2)' };
  const severityBorder = { high: 'rgba(224,80,80,0.2)',  medium: 'rgba(240,192,64,0.2)',  low: 'var(--border)' };

  container.innerHTML = `
    <!-- Comparison header -->
    <div class="row-between" style="margin-bottom:16px;flex-wrap:wrap;gap:8px;">
      <div class="row row-8">
        <h3 style="margin:0;">Comparison Analysis</h3>
        ${data.confidence != null ? `
        <div style="display:flex;align-items:center;gap:6px;padding:3px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:100px;">
          <span style="font-size:0.75rem;color:var(--text3)">Confidence</span>
          <span style="font-size:0.8125rem;font-weight:600;color:${data.confidence >= 70 ? 'var(--green)' : data.confidence >= 40 ? 'var(--gold)' : 'var(--red)'}">
            ${data.confidence}%
          </span>
        </div>` : ''}
      </div>
      <div class="row row-8">
        <span class="text-xs text-dim">Analysed by</span>
        <span class="badge badge-gray">
          ${(AI_PROVIDERS.find(p => p.id === data.analyzer)?.emoji || '◈')} ${data.analyzer || 'AI'}
        </span>
      </div>
    </div>

    <!-- Summary -->
    ${data.summary ? `
    <div class="card" style="background:var(--bg2);margin-bottom:20px;padding:16px 20px;">
      <p class="text-sm" style="line-height:1.7;color:var(--text2);">${escHtml(data.summary)}</p>
    </div>` : ''}

    <!-- Two-column: similarities + disparities -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;" id="comparison-cols">

      <!-- Similarities -->
      <div>
        <div class="row row-8" style="margin-bottom:12px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <h4 style="color:var(--green);margin:0;">Similarities <span style="font-weight:400;opacity:0.7">(${(data.similarities||[]).length})</span></h4>
        </div>
        <div class="stack stack-8">
          ${(data.similarities || []).length === 0
            ? `<p class="text-sm text-dim" style="font-style:italic;">No clear similarities identified.</p>`
            : (data.similarities || []).map(s => `
            <div style="padding:12px 14px;background:rgba(80,200,120,0.06);border:1px solid rgba(80,200,120,0.15);border-radius:8px;">
              <p class="text-sm" style="margin-bottom:6px;line-height:1.5;">${escHtml(s.point)}</p>
              <div class="row row-8" style="flex-wrap:wrap;gap:4px;">
                ${(s.providers||[]).map(id => {
                  const p = AI_PROVIDERS.find(x => x.id === id);
                  return `<span style="font-size:0.7rem;padding:2px 7px;background:rgba(80,200,120,0.1);border:1px solid rgba(80,200,120,0.2);border-radius:100px;color:var(--green);">${p ? p.emoji + ' ' + p.name : id}</span>`;
                }).join('')}
              </div>
            </div>`).join('')}
        </div>
      </div>

      <!-- Disparities -->
      <div>
        <div class="row row-8" style="margin-bottom:12px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <h4 style="color:var(--gold);margin:0;">Disparities <span style="font-weight:400;opacity:0.7">(${(data.disparities||[]).length})</span></h4>
        </div>
        <div class="stack stack-8" id="disparity-list">
          ${(data.disparities || []).length === 0
            ? `<p class="text-sm text-dim" style="font-style:italic;">No significant disparities found — the AIs are largely aligned.</p>`
            : (data.disparities || []).map(d => `
            <div class="disparity-item" data-disparity-id="${d.id}"
              style="padding:12px 14px;background:${severityBg[d.severity]||'var(--surface2)'};
                     border:1px solid ${severityBorder[d.severity]||'var(--border)'};
                     border-radius:8px;cursor:pointer;transition:all 0.15s;user-select:none;">
              <div class="row-between" style="margin-bottom:6px;gap:8px;">
                <div class="row row-8">
                  <input type="checkbox" class="disparity-check" data-id="${d.id}"
                    style="width:14px;height:14px;accent-color:var(--gold);flex-shrink:0;">
                  <span class="text-sm fw-600">${escHtml(d.topic)}</span>
                </div>
                <span style="font-size:0.7rem;padding:2px 8px;border-radius:100px;
                  color:${severityColors[d.severity]||'var(--text3)'};
                  background:${severityBg[d.severity]||'var(--surface2)'};
                  border:1px solid ${severityBorder[d.severity]||'var(--border)'};
                  white-space:nowrap;flex-shrink:0;">
                  ${d.severity}
                </span>
              </div>
              <p class="text-xs text-dim" style="margin-bottom:8px;line-height:1.5;">${escHtml(d.description)}</p>
              <div class="stack stack-4">
                ${(d.positions||[]).map(pos => {
                  const p = AI_PROVIDERS.find(x => x.id === pos.provider);
                  return `
                  <div class="row row-8" style="gap:6px;align-items:flex-start;">
                    <span style="font-size:0.75rem;padding:1px 7px;border-radius:100px;
                      background:var(--surface2);border:1px solid var(--border);
                      white-space:nowrap;flex-shrink:0;margin-top:1px;">
                      ${p ? p.emoji + ' ' + p.name : pos.provider}
                    </span>
                    <span class="text-xs text-dim" style="line-height:1.5;">${escHtml(pos.stance)}</span>
                  </div>`;
                }).join('')}
              </div>
            </div>`).join('')}
        </div>
      </div>
    </div>

    <!-- Review CTA (shown when disparities exist) -->
    ${(data.disparities||[]).length > 0 ? `
    <div id="review-cta" style="margin-top:8px;">
      <div class="card" style="border-color:rgba(240,192,64,0.2);background:var(--bg3);">
        <div class="row-between" style="flex-wrap:wrap;gap:12px;">
          <div>
            <h3 style="margin-bottom:4px;">Send disparities for review</h3>
            <p class="text-muted text-sm" id="selection-hint">
              Select disparities above, then write a directive to send them back to the conflicting AIs.
            </p>
          </div>
          <button class="btn btn-secondary" id="open-review-btn" disabled>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
            Review <span id="selection-count" style="display:none;background:var(--gold);color:#0d0d0f;border-radius:100px;padding:0 6px;font-size:0.75rem;font-weight:700;margin-left:2px;">0</span>
          </button>
        </div>
      </div>
    </div>
    <div id="review-panel" style="margin-top:16px;"></div>` : ''}
  `;

  // ── Wire disparity checkboxes ──
  const selectedDisparities = new Set();

  function updateSelectionUI() {
    const count    = selectedDisparities.size;
    const hint     = container.querySelector('#selection-hint');
    const btn      = container.querySelector('#open-review-btn');
    const countEl  = container.querySelector('#selection-count');
    if (!btn) return;

    btn.disabled = count === 0;
    if (countEl) {
      countEl.textContent = count;
      countEl.style.display = count > 0 ? 'inline' : 'none';
    }
    if (hint) {
      hint.textContent = count === 0
        ? 'Select disparities above, then write a directive to send them back to the conflicting AIs.'
        : `${count} disparity${count > 1 ? 'ies' : 'y'} selected — write your review directive below.`;
    }

    // Show/hide review panel
    const panel = container.querySelector('#review-panel');
    if (panel) {
      if (count > 0 && !panel.querySelector('#review-form')) {
        renderReviewForm(panel, data, selectedDisparities, sessionId, main);
      } else if (count === 0) {
        panel.innerHTML = '';
      }
    }
  }

  container.querySelectorAll('.disparity-item').forEach(item => {
    const checkbox = item.querySelector('.disparity-check');
    const id = item.dataset.disparityId;

    item.addEventListener('click', e => {
      if (e.target === checkbox) return; // handled by checkbox change
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event('change'));
    });

    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedDisparities.add(id);
        item.style.outline = '2px solid var(--gold)';
        item.style.outlineOffset = '-2px';
      } else {
        selectedDisparities.delete(id);
        item.style.outline = '';
      }
      updateSelectionUI();
    });
  });

  container.querySelector('#open-review-btn')?.addEventListener('click', () => {
    const panel = container.querySelector('#review-panel');
    if (panel) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  // Responsive: stack columns on narrow screens
  const cols = container.querySelector('#comparison-cols');
  if (cols && window.innerWidth < 680) {
    cols.style.gridTemplateColumns = '1fr';
  }
}

/* ── Render the review form ── */
function renderReviewForm(panel, comparisonData, selectedDisparities, sessionId, main) {
  // Collect providers involved in selected disparities
  const involvedProviders = new Set();
  (comparisonData.disparities || []).forEach(d => {
    if (selectedDisparities.has(d.id)) {
      (d.positions || []).forEach(pos => involvedProviders.add(pos.provider));
    }
  });

  panel.innerHTML = `
    <div id="review-form" class="card" style="border-color:rgba(240,192,64,0.25);">
      <h3 style="margin-bottom:4px;">Review directive</h3>
      <p class="text-muted text-sm" style="margin-bottom:16px;">
        Your message will be sent to
        ${[...involvedProviders].map(id => {
          const p = AI_PROVIDERS.find(x => x.id === id);
          return p ? `<strong>${p.emoji} ${p.name}</strong>` : id;
        }).join(', ')}
        along with the original prompt and selected disparities.
      </p>

      <div class="form-group" style="margin-bottom:16px;">
        <label class="form-label">Your directive</label>
        <textarea class="form-textarea" id="review-directive" rows="4"
          placeholder="e.g. 'Explain why you recommend this approach over the others. Are you aware your answer differs from other AIs on this point? Reconsider if needed.'"
          style="resize:vertical;min-height:100px;"></textarea>
        <span class="form-hint">Ctrl+Enter to send</span>
      </div>

      <div class="row-between" style="flex-wrap:wrap;gap:12px;">
        <div class="row row-8" style="flex-wrap:wrap;gap:6px;">
          ${[...involvedProviders].map(id => {
            const p = AI_PROVIDERS.find(x => x.id === id);
            return p ? `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:100px;background:var(--surface2);border:1px solid var(--border2);font-size:0.75rem;">${p.emoji} ${p.name}</span>` : '';
          }).join('')}
        </div>
        <button class="btn btn-primary" id="send-review-btn" disabled>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/></svg>
          Send for review
        </button>
      </div>

      <div id="review-results" style="margin-top:16px;"></div>
    </div>
  `;

  const directiveEl = panel.querySelector('#review-directive');
  const sendBtn     = panel.querySelector('#send-review-btn');

  directiveEl.addEventListener('input', () => {
    sendBtn.disabled = !directiveEl.value.trim();
  });

  directiveEl.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !sendBtn.disabled) {
      sendBtn.click();
    }
  });

  sendBtn.addEventListener('click', async () => {
    const directive = directiveEl.value.trim();
    if (!directive) return;

    sendBtn.disabled = true;
    sendBtn.innerHTML = `<span class="spinner" style="width:13px;height:13px;border-color:rgba(0,0,0,0.2);border-top-color:#0d0d0f"></span> Sending…`;

    await sendReview(
      comparisonData,
      [...selectedDisparities],
      [...involvedProviders],
      directive,
      panel.querySelector('#review-results'),
      main,
    );

    sendBtn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      Sent — send another`;
    sendBtn.disabled = false;
  });
}

/* ── Send review and render results ── */
async function sendReview(comparisonData, selectedIds, targetProviders, directive, resultsEl, main) {
  resultsEl.innerHTML = `
    <div style="padding:24px;text-align:center;">
      <div class="spinner" style="width:22px;height:22px;margin:0 auto 10px;"></div>
      <p class="text-muted text-sm">Sending to ${targetProviders.join(', ')}…</p>
    </div>`;

  let responses = {};

  if (!String(comparisonData.comparison_id).startsWith('sim_')) {
    // Real API call
    const res = await API.post('/reviews', {
      comparison_id: comparisonData.comparison_id,
      selected_ids: selectedIds,
      user_directive: directive,
      target_providers: targetProviders,
    });

    if (res.ok && res.data?.data?.responses) {
      responses = res.data.data.responses;
    } else {
      responses = await simulateReviewResponses(targetProviders, directive);
    }
  } else {
    responses = await simulateReviewResponses(targetProviders, directive);
  }

  renderReviewResults(responses, directive, resultsEl);
}

/* ── Simulate review responses ── */
async function simulateReviewResponses(providers, directive) {
  await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));

  const responses = {};
  const stances = [
    `Thank you for highlighting this discrepancy. Having re-examined the original question and the other AI's position, I maintain my recommendation for the following reasons: the approach I suggested better handles edge cases and scales more predictably. That said, the alternative approach mentioned by the other AI is valid in constrained resource environments. My final stance: use my recommended approach for production, consider the alternative for rapid prototyping. This is a simulated review response — connect your API key for real analysis.`,
    `I appreciate the opportunity to reconsider. After reviewing the noted disparity, I acknowledge the other AI raised valid points I had underweighted. My revised position is: both approaches have merit, but the context you described in the original prompt leans toward the strategy I initially outlined. The key differentiator is long-term maintainability versus short-term development speed. Simulated response — configure your API key for real answers.`,
    `This is a fair challenge. Looking at this from another angle, I can see why our responses diverged. My position centres on the principle that correctness should not be sacrificed for brevity, while the contrasting view prioritises pragmatic delivery. For your specific use case, I would refine my original answer: start with my suggested foundation but incorporate the modular approach the other AI described for the extensibility layer. Simulated response.`,
  ];

  providers.forEach((id, i) => {
    responses[id] = {
      ok: true,
      text: stances[i % stances.length],
      model: 'simulated',
      latency_ms: 900 + Math.floor(Math.random() * 600),
      tokens: 180 + Math.floor(Math.random() * 60),
    };
  });

  return responses;
}

/* ── Render review results ── */
function renderReviewResults(responses, directive, container) {
  container.innerHTML = `
    <div style="border-top:1px solid var(--border);padding-top:16px;margin-top:4px;">
      <div class="row row-8" style="margin-bottom:14px;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        <h4 style="margin:0;color:var(--green);">Review responses received</h4>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:12px;">
        ${Object.entries(responses).map(([provider, resp]) => {
          const p = AI_PROVIDERS.find(x => x.id === provider);
          return `
          <div class="response-card ${resp.ok ? 'complete' : 'error'}"
               style="--provider-accent:${p?.color || 'var(--gold)'}">
            <div class="response-card-header">
              <div class="row row-8">
                <span style="font-size:1.1rem">${p?.emoji || '◈'}</span>
                <span style="font-weight:600;font-size:0.9375rem;">${p?.name || provider}</span>
                ${resp.model && resp.model !== 'simulated'
                  ? `<span class="mono text-xs text-dim">${resp.model}</span>` : ''}
              </div>
              <div class="row row-8">
                ${resp.ok
                  ? `<span class="badge badge-green" style="font-size:0.7rem"><span class="dot-pulse"></span> Responded</span>`
                  : `<span class="badge badge-red" style="font-size:0.7rem">Error</span>`}
                <button class="copy-btn review-copy" title="Copy"
                  data-text="${escHtml(resp.text || '')}">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                </button>
              </div>
            </div>
            <div class="response-body md-rendered">
              ${resp.ok
                ? renderMarkdown(resp.text || '')
                : `<span style="color:var(--red)">⚠ ${escHtml(resp.error || 'Request failed')}</span>`}
            </div>
            <div class="response-footer">
              ${resp.model && resp.model !== 'simulated' ? `<span class="mono" style="font-size:0.78rem">${resp.model}</span>` : ''}
              ${resp.latency_ms ? `<span>${formatMs(resp.latency_ms)}</span>` : ''}
              ${resp.tokens ? `<span>${resp.tokens.toLocaleString()} tokens</span>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;

  // Wire copy buttons
  container.querySelectorAll('.review-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.text || '').then(() => Toast.success('Copied'));
    });
  });
}

/* ══════════════════════════════════════════════════════
   HOOK INTO PHASE 2 — watch for all cards completing
   and auto-inject the compare bar
══════════════════════════════════════════════════════ */

/**
 * Called by phase2.js's updateSingleCard — we watch for all cards
 * reaching complete/error state and trigger the compare bar.
 * We monkey-patch updateSingleCard to add this hook.
 */
(function patchPhase2() {
  const _orig = window.updateSingleCard || null;

  // We override with a wrapper once the DOM is ready
  // The actual override is done via the global after phase2.js loads
  window._phase3_checkAllComplete = function(main) {
    const all    = main.querySelectorAll('.response-card');
    const done   = main.querySelectorAll('.response-card[data-status="complete"], .response-card[data-status="error"]');
    const success = main.querySelectorAll('.response-card[data-status="complete"]');
    if (all.length === 0) return;
    if (done.length < all.length) return;           // not all finished yet
    if (success.length < 2) return;                 // need at least 2 successes

    // Extract session ID and providers from the page
    const sessionRoot = main.querySelector('#session-root');
    const sessionId   = sessionRoot?.dataset.sessionId || _extractSessionId();
    const providers   = [...success].map(c => c.dataset.provider);

    injectCompareBar(sessionId, providers, main);
  };

  function _extractSessionId() {
    const hash = window.location.hash;
    const match = hash.match(/#session.*?id=([^&]+)/);
    return match ? match[1] : null;
  }
})();

// Store session ID on the root element when the session page renders
// We patch the renderSessionHeader function to attach the ID
const _origRenderSessionHeader = window.renderSessionHeader;
if (typeof renderSessionHeader === 'function') {
  const __origRSH = renderSessionHeader;
  window.renderSessionHeader = function(session, main) {
    __origRSH(session, main);
    const root = main.querySelector('#session-root');
    if (root && session.id) root.dataset.sessionId = session.id;
  };
}

// Patch updateSingleCard to trigger phase 3 check after each update
if (typeof updateSingleCard === 'function') {
  const _origUSC = updateSingleCard;
  window.updateSingleCard = function(data, main) {
    _origUSC(data, main);
    if (window._phase3_checkAllComplete) {
      window._phase3_checkAllComplete(main);
    }
  };
}

// Also patch runSimulatedSession to tag the session root and check at end
if (typeof runSimulatedSession === 'function') {
  const _origRSS = runSimulatedSession;
  window.runSimulatedSession = async function(sessionId, main) {
    await _origRSS(sessionId, main);
    // Tag root with session ID for compare bar
    const root = main.querySelector('#session-root');
    if (root) root.dataset.sessionId = sessionId;
    if (window._phase3_checkAllComplete) {
      window._phase3_checkAllComplete(main);
    }
  };
}
