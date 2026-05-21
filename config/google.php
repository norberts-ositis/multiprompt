<?php
// Copy this file to config/google.php and fill in your credentials.
// Get them from: https://console.cloud.google.com/apis/credentials
//
// Steps:
//  1. Create a project in Google Cloud Console
//  2. Enable the "Google+ API" or "Google Identity" API
//  3. Create OAuth 2.0 credentials (Web application)
//  4. Add your redirect URI: http://localhost:8080/index.php
//     (or your production domain)

define('GOOGLE_CLIENT_ID',     getenv('GOOGLE_CLIENT_ID')     ?: 'YOUR_CLIENT_ID_HERE.apps.googleusercontent.com');
define('GOOGLE_CLIENT_SECRET', getenv('GOOGLE_CLIENT_SECRET') ?: 'YOUR_CLIENT_SECRET_HERE');
define('GOOGLE_REDIRECT_URI',  getenv('GOOGLE_REDIRECT_URI')  ?: 'http://localhost:8080/index.php');
