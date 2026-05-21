<?php
declare(strict_types=1);

define('ROOT', dirname(__DIR__));
define('SRC',  ROOT . '/src');

require ROOT . '/vendor/autoload.php';

$config = require ROOT . '/config/app.php';

session_set_cookie_params([
    'lifetime' => 0,
    'path'     => '/',
    'secure'   => $config['env'] === 'production',
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

// CORS for local dev
if ($config['env'] === 'development') {
    header('Access-Control-Allow-Origin: ' . ($config['frontend_url'] ?? 'http://localhost:8080'));
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
}

$uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

// Serve frontend SPA for all non-API routes
if (!str_starts_with($uri, '/api/')) {
    readfile(ROOT . '/public/index.html');
    exit;
}

// Security headers (set here so they apply regardless of Apache module availability)
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');

header('Content-Type: application/json');

$router = new \MultiPrompt\Api\Router();

$router->get('/auth/me',                   [\MultiPrompt\Api\Controllers\AuthController::class, 'me']);
$router->get('/auth/google',               [\MultiPrompt\Api\Controllers\AuthController::class, 'redirectToGoogle']);
$router->get('/auth/google/callback',      [\MultiPrompt\Api\Controllers\AuthController::class, 'handleCallback']);
$router->post('/auth/logout',              [\MultiPrompt\Api\Controllers\AuthController::class, 'logout']);

$router->get('/credentials',               [\MultiPrompt\Api\Controllers\AccountController::class, 'index']);
$router->post('/credentials/test',         [\MultiPrompt\Api\Controllers\AccountController::class, 'test']);
$router->post('/credentials',              [\MultiPrompt\Api\Controllers\AccountController::class, 'store']);
$router->put('/credentials/{provider}',    [\MultiPrompt\Api\Controllers\AccountController::class, 'update']);
$router->delete('/credentials/{provider}', [\MultiPrompt\Api\Controllers\AccountController::class, 'destroy']);

$router->get('/account',                   [\MultiPrompt\Api\Controllers\AccountController::class, 'show']);
$router->put('/account',                   [\MultiPrompt\Api\Controllers\AccountController::class, 'updateProfile']);
$router->delete('/account',                [\MultiPrompt\Api\Controllers\AccountController::class, 'deleteAccount']);

// Phase 2 — more specific paths must come BEFORE parameterised ones
$router->get('/prompts',                   [\MultiPrompt\Api\Controllers\PromptController::class, 'index']);
$router->post('/prompts',                  [\MultiPrompt\Api\Controllers\PromptController::class, 'create']);
$router->get('/prompts/{id}/stream',       [\MultiPrompt\Api\Controllers\PromptController::class, 'stream']);
$router->post('/prompts/{id}/reset',       [\MultiPrompt\Api\Controllers\PromptController::class, 'reset']);
$router->get('/prompts/{id}/comparison',   [\MultiPrompt\Api\Controllers\ComparisonController::class, 'forSession']);
$router->get('/prompts/{id}',              [\MultiPrompt\Api\Controllers\PromptController::class, 'show']);
$router->delete('/prompts/{id}',           [\MultiPrompt\Api\Controllers\PromptController::class, 'destroy']);

// Phase 3
$router->post('/comparisons',              [\MultiPrompt\Api\Controllers\ComparisonController::class, 'create']);
$router->get('/comparisons/{id}',          [\MultiPrompt\Api\Controllers\ComparisonController::class, 'show']);

$router->post('/reviews',                  [\MultiPrompt\Api\Controllers\ReviewController::class, 'create']);
$router->get('/reviews/{id}',              [\MultiPrompt\Api\Controllers\ReviewController::class, 'show']);

// Strip /api prefix and dispatch
$path = substr($uri, 4);
$router->dispatch($method, $path);