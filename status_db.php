<?php
// status_db.php - SWG Returns Player Count (from Database)
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// ─── DATABASE CONNECTION SETTINGS ───
$db_host = 'localhost';
$db_name = 'swgemu';
$db_user = 'swgemu';
$db_pass = 'fsUwFWt4zYxIPDLcAFgodRNz4GbD';

$result = [
    'online' => false,
    'players' => '0',
    'peak' => '0',
    'uptime' => '',
    'server' => 'Pre-CU Main'
];

try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8", $db_user, $db_pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    $playerCount = 0;
    $found = false;
    
    // ─── METHOD 1: galaxy_access table (most likely the online tracker) ───
    // Check for active sessions where expires is in the future
    try {
        $stmt = $pdo->query("SELECT COUNT(DISTINCT account_id) as count FROM galaxy_access WHERE expires > NOW()");
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row !== false && $row['count'] > 0) {
            $playerCount = (int)$row['count'];
            $found = true;
        }
    } catch (PDOException $e) {
        // Query failed
    }
    
    // ─── METHOD 2: sessions table ───
    // Check for active sessions where expires is in the future
    if (!$found) {
        try {
            $stmt = $pdo->query("SELECT COUNT(DISTINCT account_id) as count FROM sessions WHERE expires > NOW()");
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row !== false && $row['count'] > 0) {
                $playerCount = (int)$row['count'];
                $found = true;
            }
        } catch (PDOException $e) {
            // Query failed
        }
    }
    
    // ─── METHOD 3: account_log table (recent activity in last 5 minutes) ───
    if (!$found) {
        try {
            $stmt = $pdo->query("SELECT COUNT(DISTINCT account_id) as count FROM account_log WHERE timestamp > DATE_SUB(NOW(), INTERVAL 5 MINUTE)");
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row !== false && $row['count'] > 0) {
                $playerCount = (int)$row['count'];
                $found = true;
            }
        } catch (PDOException $e) {
            // Query failed
        }
    }
    
    // ─── If we found players, build the result ───
    if ($found) {
        $result['online'] = true;
        $result['players'] = (string)$playerCount;
        
        // Get peak from server_status
        try {
            $stmt = $pdo->query("SELECT peak FROM server_status ORDER BY id DESC LIMIT 1");
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row && $row['peak'] !== null && $row['peak'] > 0) {
                $result['peak'] = (string)$row['peak'];
            } else {
                $result['peak'] = (string)$playerCount;
            }
        } catch (PDOException $e) {
            $result['peak'] = (string)$playerCount;
        }
        
        // Get uptime from server_status
        try {
            $stmt = $pdo->query("SELECT uptime FROM server_status ORDER BY id DESC LIMIT 1");
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row && $row['uptime'] !== null && $row['uptime'] > 0) {
                $seconds = (int)$row['uptime'];
                $hours = floor($seconds / 3600);
                $minutes = floor(($seconds % 3600) / 60);
                $result['uptime'] = $hours . 'h ' . $minutes . 'm';
            } else {
                $result['uptime'] = 'N/A';
            }
        } catch (PDOException $e) {
            $result['uptime'] = 'N/A';
        }
        
    } else {
        // ─── No active sessions found ───
        $result['online'] = true;
        $result['players'] = '0';
        
        // Still try to get peak and uptime from server_status
        try {
            $stmt = $pdo->query("SELECT peak, uptime FROM server_status ORDER BY id DESC LIMIT 1");
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row) {
                if ($row['peak'] !== null && $row['peak'] > 0) {
                    $result['peak'] = (string)$row['peak'];
                } else {
                    $result['peak'] = '0';
                }
                if ($row['uptime'] !== null && $row['uptime'] > 0) {
                    $seconds = (int)$row['uptime'];
                    $hours = floor($seconds / 3600);
                    $minutes = floor(($seconds % 3600) / 60);
                    $result['uptime'] = $hours . 'h ' . $minutes . 'm';
                } else {
                    $result['uptime'] = 'N/A';
                }
            }
        } catch (PDOException $e) {
            $result['peak'] = '0';
            $result['uptime'] = 'N/A';
        }
    }
    
} catch (PDOException $e) {
    // Database connection failed - return offline
    $result['online'] = false;
    $result['players'] = '0';
    $result['peak'] = '0';
    $result['uptime'] = '';
    error_log('status_db.php error: ' . $e->getMessage());
}

echo json_encode($result);
?>
