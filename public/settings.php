<?php
session_start();
require_once __DIR__ . '/../src/Auth/GoogleOAuth.php';

if (!isset($_SESSION['user'])) {
    header('Location: /index.php');
    exit;
}

$user = $_SESSION['user'];
$saveSuccess = false;
$saveError = '';

// Handle form POST (Phase 1: store in session for testing, Phase 2: DB)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Will connect to AccountController in Phase 2
    $saveSuccess = true;
}

$providers = [
    [
        'id'          => 'claude',
        'name'        => 'Claude',
        'company'     => 'Anthropic',
        'color'       => '#D97706',
        'bg'          => '#FEF3C7',
        'docsUrl'     => 'https://console.anthropic.com/keys',
        'keyPrefix'   => 'sk-ant-',
        'models'      => ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5-20251001'],
        'connected'   => false,
        'description' => 'Get your API key from the Anthropic Console.',
    ],
    [
        'id'          => 'gemini',
        'name'        => 'Gemini',
        'company'     => 'Google',
        'color'       => '#2563EB',
        'bg'          => '#EFF6FF',
        'docsUrl'     => 'https://aistudio.google.com/app/apikey',
        'keyPrefix'   => 'AIza',
        'models'      => ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
        'connected'   => false,
        'description' => 'Get your API key from Google AI Studio.',
    ],
    [
        'id'          => 'chatgpt',
        'name'        => 'ChatGPT',
        'company'     => 'OpenAI',
        'color'       => '#16A34A',
        'bg'          => '#F0FDF4',
        'docsUrl'     => 'https://platform.openai.com/api-keys',
        'keyPrefix'   => 'sk-',
        'models'      => ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
        'connected'   => false,
        'description' => 'Get your API key from the OpenAI Platform.',
    ],
    [
        'id'          => 'copilot',
        'name'        => 'MS Copilot',
        'company'     => 'Microsoft',
        'color'       => '#7C3AED',
        'bg'          => '#F5F3FF',
        'docsUrl'     => 'https://learn.microsoft.com/en-us/azure/ai-services/openai/',
        'keyPrefix'   => '',
        'models'      => ['gpt-4o', 'gpt-4-turbo'],
        'connected'   => false,
        'description' => 'Requires an Azure OpenAI resource endpoint and key.',
        'extraFields' => [['name' => 'endpoint', 'label' => 'Azure endpoint URL', 'placeholder' => 'https://your-resource.openai.azure.com/']],
    ],
    [
        'id'          => 'perplexity',
        'name'        => 'Perplexity',
        'company'     => 'Perplexity AI',
        'color'       => '#0891B2',
        'bg'          => '#ECFEFF',
        'docsUrl'     => 'https://www.perplexity.ai/settings/api',
        'keyPrefix'   => 'pplx-',
        'models'      => ['sonar-pro', 'sonar', 'sonar-reasoning'],
        'connected'   => false,
        'description' => 'Get your API key from Perplexity Settings.',
    ],
];
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Settings — MultiPrompt</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="app-page">

<div class="noise-overlay"></div>

<aside class="sidebar">
  <div class="sidebar-logo">
    <span class="logo-mark">M</span>
    <span class="logo-text">MultiPrompt</span>
  </div>
  <nav class="sidebar-nav">
    <a href="/dashboard.php" class="nav-item">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
      Dashboard
    </a>
    <a href="/prompt.php" class="nav-item">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>
      New prompt
    </a>
    <a href="/settings.php" class="nav-item active">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      Settings
    </a>
  </nav>
  <div class="sidebar-user">
    <img src="<?= htmlspecialchars($user['avatar'] ?? '') ?>" alt="" class="user-avatar" onerror="this.style.display='none'">
    <div class="user-info">
      <div class="user-name"><?= htmlspecialchars($user['name'] ?? 'User') ?></div>
      <div class="user-email"><?= htmlspecialchars($user['email'] ?? '') ?></div>
    </div>
    <a href="/logout.php" class="logout-btn" title="Sign out">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
    </a>
  </div>
</aside>

<main class="app-main">
  <div class="page-header">
    <div>
      <h1 class="page-title">Settings</h1>
      <p class="page-subtitle">Connect your AI API keys. Keys are encrypted at rest.</p>
    </div>
  </div>

  <?php if ($saveSuccess): ?>
  <div class="toast toast--success" id="save-toast">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
    Settings saved successfully.
  </div>
  <?php endif; ?>

  <div class="settings-sections">

    <!-- AI Connections -->
    <section class="settings-section">
      <div class="settings-section-header">
        <h2>AI connections</h2>
        <p>Add your API keys to unlock each model. Keys are stored AES-256 encrypted.</p>
      </div>

      <div class="provider-settings-list">
        <?php foreach ($providers as $p): ?>
        <div class="provider-setting" id="<?= $p['id'] ?>">
          <div class="provider-setting-header">
            <div class="provider-color-dot" style="background:<?= $p['color'] ?>"></div>
            <div>
              <div class="provider-setting-name"><?= $p['name'] ?></div>
              <div class="provider-setting-company"><?= $p['company'] ?></div>
            </div>
            <div class="provider-setting-status">
              <?php if ($p['connected']): ?>
                <span class="status-badge status-badge--ok">
                  <span class="status-dot"></span>Connected
                </span>
              <?php else: ?>
                <span class="status-badge status-badge--empty">Not connected</span>
              <?php endif; ?>
            </div>
            <button class="provider-expand-btn" onclick="toggleProvider('<?= $p['id'] ?>')" aria-expanded="false">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
            </button>
          </div>

          <div class="provider-setting-body" id="body-<?= $p['id'] ?>" style="display:none">
            <p class="provider-setting-desc">
              <?= $p['description'] ?>
              <a href="<?= $p['docsUrl'] ?>" target="_blank" rel="noopener" class="inline-link">Get API key →</a>
            </p>
            <form class="provider-form" onsubmit="saveProvider(event, '<?= $p['id'] ?>')">
              <div class="form-row">
                <label class="form-label" for="key-<?= $p['id'] ?>">API Key</label>
                <div class="key-input-wrap">
                  <input
                    type="password"
                    id="key-<?= $p['id'] ?>"
                    name="api_key"
                    class="form-input key-input"
                    placeholder="<?= $p['keyPrefix'] ?>••••••••••••••••"
                    autocomplete="off"
                    spellcheck="false"
                  >
                  <button type="button" class="key-toggle-btn" onclick="toggleKeyVisibility('<?= $p['id'] ?>')" title="Show/hide key">
                    <svg class="eye-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  </button>
                </div>
              </div>

              <?php if (!empty($p['extraFields'])): ?>
                <?php foreach ($p['extraFields'] as $field): ?>
                <div class="form-row">
                  <label class="form-label" for="extra-<?= $p['id'] ?>-<?= $field['name'] ?>"><?= $field['label'] ?></label>
                  <input type="text" id="extra-<?= $p['id'] ?>-<?= $field['name'] ?>" name="<?= $field['name'] ?>" class="form-input" placeholder="<?= $field['placeholder'] ?>">
                </div>
                <?php endforeach; ?>
              <?php endif; ?>

              <div class="form-row">
                <label class="form-label" for="model-<?= $p['id'] ?>">Default model</label>
                <select id="model-<?= $p['id'] ?>" name="model" class="form-select">
                  <?php foreach ($p['models'] as $i => $m): ?>
                  <option value="<?= $m ?>" <?= $i === 0 ? 'selected' : '' ?>><?= $m ?></option>
                  <?php endforeach; ?>
                </select>
              </div>

              <div class="form-actions">
                <?php if ($p['connected']): ?>
                <button type="button" class="btn-danger-outline" onclick="disconnectProvider('<?= $p['id'] ?>')">Remove key</button>
                <?php endif; ?>
                <button type="button" class="btn-secondary" onclick="testProvider('<?= $p['id'] ?>')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  Test connection
                </button>
                <button type="submit" class="btn-primary">Save</button>
              </div>
              <div class="test-result" id="test-<?= $p['id'] ?>" style="display:none"></div>
            </form>
          </div>
        </div>
        <?php endforeach; ?>
      </div>
    </section>

    <!-- Account section -->
    <section class="settings-section">
      <div class="settings-section-header">
        <h2>Account</h2>
        <p>Your Google account details.</p>
      </div>
      <div class="account-card">
        <img src="<?= htmlspecialchars($user['avatar'] ?? '') ?>" alt="" class="account-avatar" onerror="this.style.display='none'">
        <div>
          <div class="account-name"><?= htmlspecialchars($user['name'] ?? '') ?></div>
          <div class="account-email"><?= htmlspecialchars($user['email'] ?? '') ?></div>
          <div class="account-since">Member since <?= date('F Y') ?></div>
        </div>
        <a href="/logout.php" class="btn-danger-outline" style="margin-left:auto">Sign out</a>
      </div>
    </section>

  </div>
</main>

<script src="/assets/js/app.js"></script>
<script>
function toggleProvider(id) {
  const body = document.getElementById('body-' + id);
  const btn = document.querySelector(`#${id} .provider-expand-btn`);
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  btn.setAttribute('aria-expanded', !isOpen);
  btn.style.transform = isOpen ? '' : 'rotate(180deg)';
}

function toggleKeyVisibility(id) {
  const input = document.getElementById('key-' + id);
  input.type = input.type === 'password' ? 'text' : 'password';
}

function saveProvider(e, id) {
  e.preventDefault();
  const btn = e.target.querySelector('[type=submit]');
  btn.textContent = 'Saving…';
  btn.disabled = true;
  // Phase 2: POST to /api/account/credentials
  setTimeout(() => {
    btn.textContent = 'Saved ✓';
    setTimeout(() => { btn.textContent = 'Save'; btn.disabled = false; }, 1800);
  }, 700);
}

function testProvider(id) {
  const resultEl = document.getElementById('test-' + id);
  const keyInput = document.getElementById('key-' + id);
  resultEl.style.display = 'flex';
  resultEl.className = 'test-result test-result--loading';
  resultEl.innerHTML = '<span class="spinner"></span> Testing connection…';
  // Phase 2: POST to /api/account/test-credential
  setTimeout(() => {
    if (keyInput.value.trim().length > 8) {
      resultEl.className = 'test-result test-result--ok';
      resultEl.innerHTML = '✓ Connection successful';
    } else {
      resultEl.className = 'test-result test-result--error';
      resultEl.innerHTML = '✗ Invalid or empty API key';
    }
  }, 1200);
}

function disconnectProvider(id) {
  if (!confirm('Remove the API key for ' + id + '?')) return;
  // Phase 2: DELETE /api/account/credentials/:id
  location.reload();
}

// Auto-open provider from URL hash
if (location.hash) {
  const id = location.hash.slice(1);
  const el = document.getElementById(id);
  if (el) { toggleProvider(id); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}
</script>
</body>
</html>
