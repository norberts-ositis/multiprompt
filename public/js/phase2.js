/* ═══════════════════════════════════════════
   MultiPrompt — Phase 2 Pages
   Prompt Builder + Session Results
   ═══════════════════════════════════════════ */

/* ══════════════════════════════
   PAGE: PROMPT BUILDER
══════════════════════════════ */
Router.register('prompt', (params = {}) => {
  const app  = document.getElementById('app');
  const creds = Credentials.all;
  const connectedProviders = AI_PROVIDERS.filter(p => (creds[p.id] || {}).status === 'connected');

  app.innerHTML = '';
  app.appendChild(buildNav('prompt'));

  const main = document.createElement('main');
  main.className = 'page-content';

  main.innerHTML = `
    <div class="container-sm section-sm">
      <div style="margin-bottom:28px;">
        <h2 style="margin-bottom:4px;">New Prompt</h2>
        <p class="text-muted text-sm">Write once — send to every AI simultaneously.</p>
      </div>

      ${connectedProviders.length === 0 ? `
        <div class="alert alert-info" style="margin-bottom:24px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          <span>No AIs connected yet. <button class="btn btn-ghost btn-sm" style="padding:2px 8px;margin-left:4px;" onclick="Router.navigate('settings')">Configure keys →</button></span>
        </div>
      ` : ''}

      <div class="card stack stack-20" style="gap:20px;">
        <!-- Provider selector -->
        <div class="form-group">
          <label class="form-label">Send to</label>
          <div class="row row-8" style="flex-wrap:wrap;gap:8px;" id="provider-selector">
            ${AI_PROVIDERS.map(p => {
              const connected = (creds[p.id] || {}).status === 'connected';
              return `
              <button class="provider-toggle ${connected ? 'active' : 'disabled'}"
                data-provider="${p.id}"
                ${!connected ? 'title="Not connected — configure in Settings"' : ''}>
                <span style="font-size:1rem">${p.emoji}</span>
                <span>${p.name}</span>
                ${!connected ? `<span class="provider-toggle-lock">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                </span>` : ''}
              </button>`;
            }).join('')}
          </div>
          <span class="form-hint" id="provider-hint">
            ${connectedProviders.length > 0
              ? `${connectedProviders.length} AI${connectedProviders.length > 1 ? 's' : ''} available`
              : 'Connect AIs in Settings to enable them'}
          </span>
        </div>

        <!-- System prompt (collapsible) -->
        <div class="form-group">
          <div class="row-between" style="margin-bottom:6px;">
            <label class="form-label" style="margin:0">System prompt</label>
            <button class="btn btn-ghost btn-sm" id="toggle-system" style="padding:2px 8px;font-size:0.8rem;">
              <span id="toggle-system-label">+ Add</span>
            </button>
          </div>
          <div id="system-prompt-wrap" class="hidden">
            <textarea class="form-textarea" id="system-prompt" rows="3"
              placeholder="Optional context or persona for all AIs (e.g. 'You are a senior software engineer…')"
              style="resize:vertical;min-height:72px;"></textarea>
          </div>
        </div>

        <!-- Main prompt -->
        <div class="form-group">
          <label class="form-label">Prompt</label>
          <textarea class="form-textarea" id="prompt-text" rows="6"
            placeholder="Ask anything… e.g. 'What are the main differences between REST and GraphQL APIs?'"
            style="resize:vertical;min-height:140px;font-size:0.9375rem;line-height:1.6;"></textarea>
          <div class="row-between" style="margin-top:6px;">
            <span class="form-hint" id="char-count">0 characters</span>
            <span class="form-hint">Ctrl+Enter to send</span>
          </div>
        </div>

        <!-- Submit -->
        <div class="row-between" style="flex-wrap:wrap;gap:12px;">
          <div class="row row-8" id="selected-summary" style="flex-wrap:wrap;gap:6px;"></div>
          <button class="btn btn-primary" id="send-btn" disabled>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/></svg>
            <span id="send-label">Send prompt</span>
          </button>
        </div>
      </div>

      <!-- Recent prompts as quick re-use -->
      <div id="recent-prompts-section" style="margin-top:32px;"></div>
    </div>
  `;

  // Inline styles for provider toggles
  const style = document.createElement('style');
  style.textContent = `
    .provider-toggle {
      display: inline-flex; align-items: center; gap: 7px;
      padding: 8px 14px; border-radius: 8px; cursor: pointer;
      font-family: var(--font-body); font-size: 0.875rem;
      border: 1px solid var(--border); background: var(--surface);
      color: var(--text2); transition: all 0.15s; position: relative;
    }
    .provider-toggle.active {
      border-color: var(--border2); color: var(--text);
    }
    .provider-toggle.active.selected {
      background: var(--gold-dim); border-color: var(--gold);
      color: var(--text);
    }
    .provider-toggle.disabled {
      opacity: 0.4; cursor: not-allowed;
    }
    .provider-toggle-lock { opacity: 0.6; display: flex; }
    .prompt-char-warn { color: var(--red); }
  `;
  document.head.appendChild(style);

  app.appendChild(main);

  // ── State ──
  const selected = new Set(connectedProviders.map(p => p.id));
  const promptEl  = main.querySelector('#prompt-text');
  const sendBtn   = main.querySelector('#send-btn');
  const hintEl    = main.querySelector('#provider-hint');
  const summaryEl = main.querySelector('#selected-summary');
  const charEl    = main.querySelector('#char-count');

  function updateUI() {
    const hasPrompt = promptEl.value.trim().length > 0;
    const hasProvider = selected.size > 0;
    sendBtn.disabled = !hasPrompt || !hasProvider || connectedProviders.length === 0;

    // Provider hint
    hintEl.textContent = selected.size === 0
      ? 'Select at least one AI'
      : `Sending to ${selected.size} AI${selected.size > 1 ? 's' : ''}`;

    // Selected summary badges
    summaryEl.innerHTML = [...selected].map(id => {
      const p = AI_PROVIDERS.find(x => x.id === id);
      return p ? `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:100px;background:var(--surface2);font-size:0.75rem;border:1px solid var(--border2);">${p.emoji} ${p.name}</span>` : '';
    }).join('');

    // Char count
    const len = promptEl.value.length;
    charEl.textContent = len.toLocaleString() + ' characters';
    charEl.className = len > 8000 ? 'form-hint prompt-char-warn' : 'form-hint';
  }

  // Provider toggle clicks
  main.querySelectorAll('.provider-toggle').forEach(btn => {
    if (btn.classList.contains('disabled')) return;
    btn.addEventListener('click', () => {
      const id = btn.dataset.provider;
      if (selected.has(id)) {
        if (selected.size === 1) return; // keep at least one
        selected.delete(id);
        btn.classList.remove('selected');
      } else {
        selected.add(id);
        btn.classList.add('selected');
      }
      updateUI();
    });
    // Mark initially selected
    if (selected.has(btn.dataset.provider)) btn.classList.add('selected');
  });

  promptEl.addEventListener('input', updateUI);

  // System prompt toggle
  main.querySelector('#toggle-system').addEventListener('click', () => {
    const wrap  = main.querySelector('#system-prompt-wrap');
    const label = main.querySelector('#toggle-system-label');
    const shown = wrap.classList.toggle('hidden');
    label.textContent = shown ? '+ Add' : '− Remove';
    if (!shown) main.querySelector('#system-prompt').focus();
  });

  // Ctrl+Enter to send
  promptEl.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !sendBtn.disabled) {
      sendBtn.click();
    }
  });

  // Send
  sendBtn.addEventListener('click', async () => {
    const promptText   = promptEl.value.trim();
    const systemPrompt = main.querySelector('#system-prompt').value.trim();
    const providers    = [...selected];

    if (!promptText || providers.length === 0) return;

    sendBtn.disabled = true;
    sendBtn.innerHTML = `<span class="spinner" style="width:14px;height:14px;border-color:rgba(0,0,0,0.2);border-top-color:#0d0d0f"></span><span>Sending…</span>`;

    const res = await API.post('/prompts', {
      prompt:        promptText,
      providers,
      system_prompt: systemPrompt || undefined,
    });

    if (res.ok && res.data?.data?.session_id) {
      const sid = res.data.data.session_id;
      Sessions.add({
        id: sid, prompt_text: promptText,
        providers, created_at: new Date().toISOString(), status: 'running',
      });
      Router.navigate('session', { id: sid });
    } else {
      // Show the actual error rather than silently simulating
      const errMsg = res.data?.error || res.data?.message || `HTTP ${res.status}`;
      Toast.error(`Failed to create session: ${errMsg}`, 6000);
      sendBtn.disabled = false;
      sendBtn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/></svg>
        Send prompt`;
    }
  });

  // Recent prompts for quick re-use
  const recent = Sessions.getAll().slice(0, 3);
  if (recent.length > 0) {
    const section = main.querySelector('#recent-prompts-section');
    section.innerHTML = `
      <h4 style="margin-bottom:12px;">Recent prompts</h4>
      <div class="stack stack-8">
        ${recent.map(s => `
          <div class="card card-sm row-between recent-reuse" style="cursor:pointer;gap:12px;" data-text="${escHtml(s.prompt_text || '')}">
            <div style="flex:1;min-width:0">
              <p class="text-sm" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(s.prompt_text || '')}</p>
              <p class="text-xs text-dim">${(s.providers||[]).join(', ')} · ${formatDate(s.created_at)}</p>
            </div>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;color:var(--text3)" title="Reuse"><path d="M3 12a9 9 0 109-9 9 9 0 00-9 9zM12 8v4l3 3"/></svg>
          </div>
        `).join('')}
      </div>
    `;
    section.querySelectorAll('.recent-reuse').forEach(el => {
      el.addEventListener('click', () => {
        promptEl.value = el.dataset.text;
        promptEl.focus();
        updateUI();
      });
    });
  }

  updateUI();
});

/* ══════════════════════════════
   PAGE: SESSION RESULTS
══════════════════════════════ */
Router.register('session', (params = {}) => {
  const app       = document.getElementById('app');
  const sessionId = String(params.id);              // coerce — may arrive as number from session list
  const simulate  = params.simulate || sessionId.startsWith('local_');

  app.innerHTML = '';
  app.appendChild(buildNav(''));

  const main = document.createElement('main');
  main.className = 'page-content';
  main.innerHTML = `<div class="container section-sm" id="session-root">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:28px;flex-wrap:wrap;">
      <button class="btn btn-ghost btn-sm" id="back-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        Back
      </button>
      <div style="flex:1">
        <div id="session-header-title" class="skeleton" style="height:24px;width:60%;border-radius:6px;"></div>
      </div>
    </div>
    <div id="session-prompt-box"></div>
    <div id="responses-grid" style="margin-top:24px;"></div>
  </div>`;

  app.appendChild(main);
  main.querySelector('#back-btn').addEventListener('click', () => history.back());

  // Inline styles for response cards
  const style = document.createElement('style');
  style.textContent = `
    .response-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius-lg); overflow: hidden;
      transition: border-color 0.2s;
    }
    .response-card.complete { border-top: 2px solid var(--provider-accent, var(--gold)); }
    .response-card.error    { border-top: 2px solid var(--red); }
    .response-card-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 18px; border-bottom: 1px solid var(--border);
      background: var(--bg2);
    }
    .response-body {
      padding: 18px; font-size: 0.9375rem; line-height: 1.75;
      color: var(--text); min-height: 80px;
      white-space: pre-wrap; word-break: break-word;
    }
    .response-body.streaming::after {
      content: '▍'; animation: blink 0.8s step-end infinite;
      color: var(--gold);
    }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
    .response-footer {
      display: flex; align-items: center; gap: 16px; padding: 10px 18px;
      border-top: 1px solid var(--border); background: var(--bg3);
      font-size: 0.8125rem; color: var(--text3);
    }
    .response-footer span { display: flex; align-items: center; gap: 5px; }
    .md-rendered h1,.md-rendered h2,.md-rendered h3 { font-family: var(--font-display); margin: 1em 0 0.4em; }
    .md-rendered h1 { font-size:1.3rem } .md-rendered h2 { font-size:1.15rem } .md-rendered h3 { font-size:1rem }
    .md-rendered p { margin: 0.6em 0; }
    .md-rendered ul,.md-rendered ol { padding-left: 1.4em; margin: 0.6em 0; }
    .md-rendered li { margin: 0.3em 0; }
    .md-rendered code { font-family: var(--font-mono); font-size:0.85em; background:var(--bg3); padding:1px 5px; border-radius:4px; }
    .md-rendered pre { background: var(--bg3); border:1px solid var(--border); border-radius:8px; padding:14px; overflow-x:auto; margin:0.8em 0; }
    .md-rendered pre code { background:none; padding:0; }
    .md-rendered blockquote { border-left:3px solid var(--border2); margin:0.6em 0; padding:4px 14px; color:var(--text2); }
    .md-rendered table { border-collapse:collapse; width:100%; margin:0.8em 0; font-size:0.875rem; }
    .md-rendered th,.md-rendered td { border:1px solid var(--border); padding:7px 12px; text-align:left; }
    .md-rendered th { background:var(--bg3); font-weight:500; }
    .md-rendered strong { font-weight:600; color:var(--text); }
    .md-rendered a { color:var(--gold); }
    .copy-btn { background:none;border:none;cursor:pointer;color:var(--text3);padding:4px;border-radius:4px;transition:color 0.15s; }
    .copy-btn:hover { color:var(--text); }
    #responses-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 440px), 1fr));
      gap: 16px;
    }
  `;
  document.head.appendChild(style);

  if (simulate) {
    runSimulatedSession(sessionId, main);
  } else {
    runLiveSession(sessionId, main);
  }
});

/* ── Live session: fetch from API then SSE stream ── */
async function runLiveSession(sessionId, main) {
  const existing = await API.get(`/prompts/${sessionId}`);
  let session, responses;

  if (existing.ok && existing.data?.data?.session) {
    session   = existing.data.data.session;
    responses = existing.data.data.responses;
    renderSessionHeader(session, main);
    renderResponseCards(session.providers, responses, main);
  } else {
    // API error or non-JSON response (e.g. PHP parse error)
    const errDetail = existing.data?.error || existing.data?.message || `HTTP ${existing.status}`;
    console.error('[MultiPrompt] Failed to load session:', errDetail, existing);
    const local = Sessions.get(sessionId);
    if (!local) {
      Toast.error(`Could not load session: ${errDetail}`, 6000);
      Router.navigate('dashboard');
      return;
    }
    session = local;
    renderSessionHeader(session, main);
    renderResponseCards(session.providers, [], main);
  }

  const hasResults = (responses || []).some(r =>
    r.status === 'completed' || r.status === 'error'
  );

  if (session.status === 'completed' && hasResults) {
    updateCardContents(responses, main);
    return;
  }

  if (session.status === 'completed' && !hasResults) {
    await API.post(`/prompts/${sessionId}/reset`).catch(() => {});
  }

  openSSEStream(sessionId, session.providers, main);
}

/* ── SSE stream handler ── */
function openSSEStream(sessionId, providers, main) {
  const evtSource = new EventSource(`/api/prompts/${sessionId}/stream`);

  evtSource.addEventListener('response', e => {
    const data = JSON.parse(e.data);
    updateSingleCard(data, main);
  });

  evtSource.addEventListener('error', e => {
    // Two kinds of error: SSE connection error (e.data undefined) or PHP error event
    if (e.data) {
      try {
        const err = JSON.parse(e.data);
        console.error('[MultiPrompt] Stream PHP error:', err);
        Toast.error(`Server error: ${err.message || 'Unknown error'} (${err.file}:${err.line})`, 8000);
      } catch {}
    } else {
      console.error('[MultiPrompt] SSE connection error');
    }
    evtSource.close();
    main.querySelectorAll('.response-card[data-status="pending"], .response-card[data-status="streaming"]').forEach(card => {
      card.dataset.status = 'error';
      card.classList.add('error');
      const body = card.querySelector('.response-body');
      if (body) {
        body.classList.remove('streaming');
        body.innerHTML = `<span style="color:var(--red)">Server error — check the browser console for details.</span>`;
      }
    });
  });

  evtSource.addEventListener('done', () => {
    evtSource.close();
    API.get(`/prompts/${sessionId}`).then(res => {
      if (res.ok) Sessions.add(res.data.data.session);
    }).catch(() => {});
  });
}

/* ── Simulated session (no backend) ── */
async function runSimulatedSession(sessionId, main) {
  const local = Sessions.get(sessionId);
  if (!local) { Toast.error('Session not found'); Router.navigate('dashboard'); return; }

  renderSessionHeader(local, main);
  renderResponseCards(local.providers, [], main);

  const creds = Credentials.all;

  // Simulate responses one at a time with fake delays
  const delays = { claude: 1400, gemini: 1100, chatgpt: 1700, copilot: 2000 };
  const samples = {
    claude:  `Here's a thorough analysis of your question.\n\n**Key points:**\n\n1. This is a simulated Claude response — connect your API key in Settings to get real answers.\n2. Claude tends to be precise and well-structured in its responses.\n3. It would provide citations and nuanced perspectives on complex topics.\n\n*This response was generated locally for UI testing.*`,
    gemini:  `Thanks for your question! Here's what I can tell you:\n\n- This is a simulated Gemini response\n- In production, Gemini would provide a comprehensive answer here\n- It often includes helpful context and examples\n\n**Note:** Add your Gemini API key in Settings to enable real responses.`,
    chatgpt: `I'll address your question directly.\n\nThis is a simulated ChatGPT response for UI testing purposes. The real GPT-4o would provide a detailed, well-reasoned answer here.\n\n\`\`\`\n// Example code block\nconst answer = await openai.chat.completions.create({...});\n\`\`\`\n\nConfigure your OpenAI API key in Settings to get live responses.`,
    copilot: `This is a simulated MS Copilot response.\n\nIn production, Copilot would leverage Microsoft's infrastructure to answer your question with relevant context.\n\n> Sign in with your Microsoft account in Settings to enable real Copilot responses.`,
  };

  for (const provider of local.providers) {
    const delay = delays[provider] || 1500;
    // Show typing indicator
    const card = main.querySelector(`[data-provider="${provider}"]`);
    if (card) {
      card.dataset.status = 'streaming';
      const body = card.querySelector('.response-body');
      if (body) body.classList.add('streaming');
    }

    await new Promise(r => setTimeout(r, delay + Math.random() * 600));

    const text    = samples[provider] || 'Simulated response for this provider.';
    const latency = delay + Math.floor(Math.random() * 500);

    updateSingleCard({
      provider, ok: true, text, model: (creds[provider]?.model || 'simulated'),
      latency_ms: latency, tokens_prompt: 42, tokens_completion: Math.floor(text.length / 4),
    }, main);
  }
}

/* ── Render session header ── */
function renderSessionHeader(session, main) {
  // Tag the root so phase3 can read the session ID
  const root = main.querySelector('#session-root');
  if (root && session.id) root.dataset.sessionId = session.id;
  const titleEl = main.querySelector('#session-header-title');
  if (titleEl) {
    titleEl.classList.remove('skeleton');
    titleEl.style.cssText = '';
    titleEl.innerHTML = `
      <p class="text-xs text-dim" style="margin-bottom:2px;">${formatDate(session.created_at)}</p>
    `;
  }
  const promptBox = main.querySelector('#session-prompt-box');
  if (promptBox) {
    promptBox.innerHTML = `
      <div class="card" style="background:var(--bg2);border-color:var(--border2);">
        <div class="row-between" style="margin-bottom:8px;">
          <span class="text-xs text-dim" style="letter-spacing:0.08em;text-transform:uppercase;">Prompt</span>
          ${session.system_prompt ? `<span class="badge badge-gray" style="font-size:0.7rem">System prompt set</span>` : ''}
        </div>
        <p style="font-size:0.9375rem;line-height:1.65;white-space:pre-wrap;">${escHtml(session.prompt_text || session.prompt || '')}</p>
        <div class="row row-8" style="margin-top:12px;flex-wrap:wrap;gap:6px;">
          ${(session.providers||[]).map(id => {
            const p = AI_PROVIDERS.find(x => x.id === id);
            return p ? `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:100px;background:var(--surface2);font-size:0.75rem;border:1px solid var(--border2);">${p.emoji} ${p.name}</span>` : '';
          }).join('')}
          <button class="btn btn-ghost btn-sm" style="margin-left:auto;padding:3px 10px;font-size:0.8rem;" id="reuse-prompt-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 109-9 9 9 0 00-9 9zM12 8v4l3 3"/></svg>
            Reuse prompt
          </button>
        </div>
      </div>
    `;
    promptBox.querySelector('#reuse-prompt-btn')?.addEventListener('click', () => {
      Router.navigate('prompt');
      // Pre-fill handled by recent prompts in prompt page
    });
  }
}

/* ── Render empty response card grid ── */
function renderResponseCards(providers, existingResponses, main) {
  const grid = main.querySelector('#responses-grid');
  if (!grid) return;

  const responseMap = {};
  (existingResponses || []).forEach(r => { responseMap[r.provider] = r; });

  grid.innerHTML = providers.map(id => {
    const p    = AI_PROVIDERS.find(x => x.id === id);
    const resp = responseMap[id];
    const done = resp && resp.status === 'completed';
    const err  = resp && resp.status === 'error';
    return buildResponseCardHTML(p || { id, name: id, emoji: '◈', color: '#888' }, resp, done, err);
  }).join('');

  // Wire copy buttons
  grid.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.closest('.response-card')?.querySelector('.response-body')?.textContent || '';
      navigator.clipboard.writeText(text).then(() => Toast.success('Copied to clipboard'));
    });
  });
}

/* ── Build a single response card HTML ── */
function buildResponseCardHTML(p, resp, done, err) {
  const accentColor = p.color || 'var(--gold)';
  const status  = done ? 'complete' : err ? 'error' : 'pending';
  const model   = resp?.model || '';
  const latency = resp?.latency_ms;
  const tokens  = resp ? (resp.tokens_prompt + resp.tokens_completion) : 0;

  let bodyContent = '';
  if (done && resp.response_text) {
    bodyContent = renderMarkdown(resp.response_text);
  } else if (err) {
    bodyContent = `<span style="color:var(--red)">⚠ ${escHtml(resp.error_message || 'Error')}</span>`;
  } else {
    bodyContent = `<span style="color:var(--text3);font-style:italic;">Waiting for response…</span>`;
  }

  return `
  <div class="response-card ${status}" data-provider="${p.id}" data-status="${status}"
       style="--provider-accent:${accentColor}">
    <div class="response-card-header">
      <div class="row row-8">
        <span style="font-size:1.1rem">${p.emoji}</span>
        <span style="font-weight:600;font-size:0.9375rem;">${p.name}</span>
        ${model ? `<span class="mono text-xs text-dim">${model}</span>` : ''}
      </div>
      <div class="row row-8">
        ${done ? `<span class="badge badge-green" style="font-size:0.7rem"><span class="dot-pulse"></span> Done</span>` :
          err  ? `<span class="badge badge-red" style="font-size:0.7rem">Error</span>` :
                 `<span class="badge badge-gray" style="font-size:0.7rem"><span class="spinner" style="width:8px;height:8px;border-width:1.5px"></span> Waiting</span>`}
        <button class="copy-btn" title="Copy response" ${!done ? 'disabled style="opacity:0.3"' : ''}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        </button>
      </div>
    </div>
    <div class="response-body md-rendered ${!done && !err ? 'streaming' : ''}">${bodyContent}</div>
    <div class="response-footer">
      ${latency ? `<span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>${formatMs(latency)}</span>` : ''}
      ${tokens  ? `<span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>${tokens.toLocaleString()} tokens</span>` : ''}
    </div>
  </div>`;
}

/* ── Update all cards from a responses array ── */
function updateCardContents(responses, main) {
  (responses || []).forEach(r => updateSingleCard({
    provider: r.provider, ok: r.status === 'completed',
    text: r.response_text, error: r.error_message,
    model: r.model, latency_ms: r.latency_ms,
    tokens_prompt: r.tokens_prompt, tokens_completion: r.tokens_completion,
  }, main));
}

/* ── Update a single card with new data ── */
function updateSingleCard(data, main) {
  const card = main.querySelector(`[data-provider="${data.provider}"]`);
  if (!card) return;

  const p    = AI_PROVIDERS.find(x => x.id === data.provider) || { color: '#888', emoji: '◈', name: data.provider };
  const body = card.querySelector('.response-body');
  const footer = card.querySelector('.response-footer');
  const badge  = card.querySelector('.badge');

  body.classList.remove('streaming');
  card.dataset.status = data.ok ? 'complete' : 'error';

  if (data.ok) {
    card.classList.add('complete');
    card.classList.remove('error');
    body.innerHTML = renderMarkdown(data.text || '');

    if (badge) {
      badge.className = 'badge badge-green';
      badge.style.fontSize = '0.7rem';
      badge.innerHTML = '<span class="dot-pulse"></span> Done';
    }

    // Enable copy button
    const copyBtn = card.querySelector('.copy-btn');
    if (copyBtn) {
      copyBtn.disabled = false;
      copyBtn.style.opacity = '';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(data.text || '').then(() => Toast.success('Copied'));
      });
    }
  } else {
    card.classList.add('error');
    card.classList.remove('complete');
    body.innerHTML = `<span style="color:var(--red)">⚠ ${escHtml(data.error || 'Request failed')}</span>`;
    if (badge) { badge.className = 'badge badge-red'; badge.style.fontSize='0.7rem'; badge.textContent = 'Error'; }
  }

  // Update footer stats
  if (footer) {
    const latency = data.latency_ms;
    const tokens  = (data.tokens_prompt || 0) + (data.tokens_completion || 0);
    const modelStr = data.model || '';
    footer.innerHTML = `
      ${modelStr ? `<span class="mono" style="color:var(--text3);font-size:0.78rem;">${modelStr}</span>` : ''}
      ${latency ? `<span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>${formatMs(latency)}</span>` : ''}
      ${tokens  ? `<span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>${tokens.toLocaleString()} tokens</span>` : ''}
    `;
  }

  // Update model in header
  if (data.model) {
    const modelEl = card.querySelector('.response-card-header .mono');
    if (modelEl) modelEl.textContent = data.model;
  }
}

/* ── Minimal Markdown renderer ── */
function renderMarkdown(text) {
  if (!text) return '';
  let html = escHtml(text);

  // Code blocks (must come before inline code)
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
    `<pre><code${lang ? ` class="language-${lang}"` : ''}>${code.trim()}</code></pre>`);

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm,   '<h1>$1</h1>');

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Unordered lists
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Horizontal rule
  html = html.replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:1em 0">');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Tables (basic)
  html = html.replace(/\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)+)/g, (_, header, rows) => {
    const th = header.split('|').filter(Boolean).map(c => `<th>${c.trim()}</th>`).join('');
    const tr = rows.trim().split('\n').map(row => {
      const tds = row.split('|').filter(Boolean).map(c => `<td>${c.trim()}</td>`).join('');
      return `<tr>${tds}</tr>`;
    }).join('');
    return `<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
  });

  // Paragraphs — wrap lines not already wrapped in block elements
  const blockTags = /^<(h[1-6]|ul|ol|li|pre|blockquote|table|hr|thead|tbody|tr|th|td)/;
  html = html.split('\n').map(line => {
    if (!line.trim()) return '';
    if (blockTags.test(line)) return line;
    return `<p>${line}</p>`;
  }).join('\n');

  // Clean up empty paragraphs
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>(<(?:h[1-6]|ul|pre|blockquote|table|hr)[^>]*>)/g, '$1');

  return html;
}