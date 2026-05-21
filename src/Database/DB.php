<?php
declare(strict_types=1);

namespace MultiPrompt\Database;

use PDO;
use PDOException;

class DB
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo) return self::$pdo;

        $config = require ROOT . '/config/app.php';
        $db     = $config['db'];
        $dsn    = "mysql:host={$db['host']};port={$db['port']};dbname={$db['name']};charset={$db['charset']}";

        self::$pdo = new PDO($dsn, $db['user'], $db['pass'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);

        return self::$pdo;
    }

    /** Execute a statement; return affected rows */
    public static function exec(string $sql, array $params = []): int
    {
        $stmt = self::pdo()->prepare($sql);
        $stmt->execute($params);
        return $stmt->rowCount();
    }

    /** Fetch multiple rows */
    public static function query(string $sql, array $params = []): array
    {
        $stmt = self::pdo()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    /** Fetch a single row (or null) */
    public static function queryOne(string $sql, array $params = []): ?array
    {
        $stmt = self::pdo()->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /** Fetch a single scalar value */
    public static function scalar(string $sql, array $params = []): mixed
    {
        $stmt = self::pdo()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchColumn();
    }

    /** Last inserted ID */
    public static function lastId(): string
    {
        return self::pdo()->lastInsertId();
    }

    /** Transaction wrapper */
    public static function transaction(callable $fn): mixed
    {
        self::pdo()->beginTransaction();
        try {
            $result = $fn(self::pdo());
            self::pdo()->commit();
            return $result;
        } catch (\Throwable $e) {
            self::pdo()->rollBack();
            throw $e;
        }
    }
}
