<?php
session_start();
require_once __DIR__ . '/../src/Auth/GoogleOAuth.php';

if (!isset($_SESSION['user'])) {
    header('Location: /index.php');
    exit;
}

$user = $_SESSION['user'];

// Load credentials status from DB (stubbed for Phase 1 frontend)
$providers = [
    ['id' => 'claude',      'name' => 'Claude',     'color' => '#D97706', 'connected' => false],
    ['id' => 'gemini',      'name' => 'Gemini',      'color' => '#2563EB', 'connected' => false],
    ['id' => 'chatgpt',     'name' => 'ChatGPT',     'color' => '#16A34A', 'connected' => false],
    ['id' => 'copilot',     'name' => 'MS Copilot',  'color' => '#7C3AED', 'connected' => false],
    ['id' => 'perplexity',  'name' => 'Perplexity',  'color' => '#0891B2', 'connected' => false],
];

$connectedCount = count(array_filter($providers, fn($p) => $p['connected']));
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Dashboard — MultiPrompt</title>
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
    <a href="/dashboard.php" class="nav-item active">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
      Dashboard
    </a>
    <a href="/prompt.php" class="nav-item">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>
      New prompt
    </a>
    <a href="/settings.php" class="nav-item <?= $connectedCount === 0 ? 'nav-item--alert' : '' ?>">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      Settings
      <?php if ($connectedCount === 0): ?>
      <span class="nav-badge">!</span>
      <?php endif; ?>
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
      <h1 class="page-title">Good <?= date('H') < 12 ? 'morning' : (date('H') < 18 ? 'afternoon' : 'evening') ?>, <?= htmlspecialchars(explode(' ', $user['name'] ?? 'there')[0]) ?>.</h1>
      <p class="page-subtitle">Ready to ask all your AIs?</p>
    </div>
    <a href="/prompt.php" class="btn-primary">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
      New prompt
    </a>
  </div>

  <?php if ($connectedCount === 0): ?>
  <div class="setup-banner">
    <div class="setup-banner-icon">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    </div>
    <div>
      <strong>Connect your AI accounts to get started.</strong>
      <p>Add at least one API key in Settings to start sending prompts.</p>
    </div>
    <a href="/settings.php" class="btn-banner">Go to Settings →</a>
  </div>
  <?php endif; ?>

  <div class="stats-row">
    <div class="stat-card">
      <div class="stat-value">0</div>
      <div class="stat-label">Prompts sent</div>
    </div>
    <div class="stat-card">
      <div class="stat-value"><?= $connectedCount ?>/5</div>
      <div class="stat-label">AIs connected</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">0</div>
      <div class="stat-label">Comparisons run</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">0</div>
      <div class="stat-label">Disparities reviewed</div>
    </div>
  </div>

  <div class="section-title">Your AI connections</div>
  <div class="provider-grid">
    <?php foreach ($providers as $p): ?>
    <div class="provider-card <?= $p['connected'] ? 'provider-card--connected' : '' ?>">
      <div class="provider-dot" style="background: <?= $p['color'] ?>"></div>
      <div class="provider-name"><?= $p['name'] ?></div>
      <div class="provider-status">
        <?php if ($p['connected']): ?>
          <span class="status-badge status-badge--ok">Connected</span>
        <?php else: ?>
          <span class="status-badge status-badge--empty">Not connected</span>
        <?php endif; ?>
      </div>
      <a href="/settings.php#<?= $p['id'] ?>" class="provider-action">
        <?= $p['connected'] ? 'Manage' : 'Connect' ?> →
      </a>
    </div>
    <?php endforeach; ?>
  </div>

  <div class="section-title" style="margin-top: 2.5rem;">Recent sessions
    <span class="section-empty">— none yet</span>
  </div>
  <div class="empty-sessions">
    <div class="empty-icon">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    </div>
    <p>Your prompt sessions will appear here.</p>
    <a href="/prompt.php" class="btn-secondary">Start your first prompt</a>
  </div>
</main>

<script src="/assets/js/app.js"></script>
</body>
</html>
