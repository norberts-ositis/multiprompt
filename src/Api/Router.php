<?php
declare(strict_types=1);

namespace MultiPrompt\Api;

class Router
{
    private array $routes = [];

    public function get(string $path, array $handler): void    { $this->add('GET',    $path, $handler); }
    public function post(string $path, array $handler): void   { $this->add('POST',   $path, $handler); }
    public function put(string $path, array $handler): void    { $this->add('PUT',    $path, $handler); }
    public function delete(string $path, array $handler): void { $this->add('DELETE', $path, $handler); }

    private function add(string $method, string $path, array $handler): void
    {
        $this->routes[] = ['method' => $method, 'path' => $path, 'handler' => $handler];
    }

    public function dispatch(string $method, string $uri): void
    {
        foreach ($this->routes as $route) {
            if ($route['method'] !== $method) continue;
            $params = $this->match($route['path'], $uri);
            if ($params !== null) {
                [$class, $action] = $route['handler'];
                (new $class())->$action($params);
                return;
            }
        }
        http_response_code(404);
        echo json_encode(['error' => 'Not found', 'path' => $uri]);
    }

    private function match(string $pattern, string $uri): ?array
    {
        $params = [];
        $regex  = preg_replace_callback('/\{(\w+)\}/', function ($m) use (&$params) {
            $params[] = $m[1];
            return '([^/]+)';
        }, $pattern);

        $regex = '#^' . $regex . '$#';
        if (!preg_match($regex, $uri, $matches)) return null;

        $result = [];
        foreach ($params as $i => $name) {
            $result[$name] = $matches[$i + 1];
        }
        return $result;
    }
}
