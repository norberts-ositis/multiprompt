<?php
return [
    'env'          => getenv('APP_ENV') ?: 'development',
    'frontend_url' => getenv('FRONTEND_URL') ?: 'http://localhost:8080',
    'app_url'      => getenv('APP_URL') ?: 'http://localhost:8080',

    // AES-256 encryption key for API keys (32 bytes, base64-encoded)
    // Generate with: php -r "echo base64_encode(random_bytes(32));"
    'encrypt_key'  => getenv('ENCRYPT_KEY') ?: 'CHANGE_ME_generate_a_real_32_byte_key_here=',

    'google' => [
        'client_id'     => getenv('GOOGLE_CLIENT_ID')     ?: '',
        'client_secret' => getenv('GOOGLE_CLIENT_SECRET') ?: '',
        'redirect_uri'  => (getenv('APP_URL') ?: 'http://localhost:8080') . '/api/auth/google/callback',
    ],

    'db' => [
        'host'    => getenv('DB_HOST')     ?: '127.0.0.1',
        'port'    => getenv('DB_PORT')     ?: '3306',
        'name'    => getenv('DB_NAME')     ?: 'multiprompt',
        'user'    => getenv('DB_USER')     ?: 'root',
        'pass'    => getenv('DB_PASS')     ?: '',
        'charset' => 'utf8mb4',
    ],
];
