<?php
// status.php - SWG Returns Player Count (using PDO)
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$db_host = 'localhost';
$db_user = 'swgemu';
$db_pass = 'fsUwFWt4zYxIPDLcAFgodRNz4GbD';
$db_name = 'swgemu';

$result = [
    'online' => true,
    'players' => '0',
    'peak' => '0',
    'uptime' => 'N/A',
    'server' => 'Pre-CU Main'
];

try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8", $db_user, $db_pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    $stmt = $pdo->query("SELECT COUNT(DISTINCT account_id) as count FROM account_log WHERE timestamp > DATE_SUB(NOW(), INTERVAL 15 MINUTE)");
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($row && $row['count'] > 0) {
        $result['players'] = (string)$row['count'];
        $result['peak'] = (string)$row['count'];
    }
    
} catch (PDOException $e) {
    $result['online'] = false;
    error_log('status.php error: ' . $e->getMessage());
}

echo json_encode($result);
?>
