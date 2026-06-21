<?php
// status.php - SWG Returns Server Status Proxy
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Server configurations (same as launcher)
$servers = [
    'precu' => [
        'ip' => '51.81.81.116',
        'port' => 44455
    ],
    'tc' => [
        'ip' => '51.81.81.116',
        'port' => 44455
    ],
    'nge' => [
        'ip' => 'login.swgtalon.online',
        'port' => 44455
    ],
    'nge-tc' => [
        'ip' => 'login.swgtalon.online',
        'port' => 44455
    ]
];

$requested = isset($_GET['server']) ? $_GET['server'] : 'precu';
$server = isset($servers[$requested]) ? $servers[$requested] : $servers['precu'];

$result = [
    'online' => false,
    'players' => '0',
    'peak' => 'N/A',
    'uptime' => ''
];

// Connect to the status port
$socket = @fsockopen($server['ip'], $server['port'], $errno, $errstr, 2);
if ($socket) {
    // Send a newline to trigger the status response
    fwrite($socket, "\n");
    $response = '';
    while (!feof($socket)) {
        $response .= fgets($socket, 1024);
    }
    fclose($socket);
    
    // Parse the response
    $lines = explode("\n", $response);
    foreach ($lines as $line) {
        $trimmed = trim($line);
        if (stripos($trimmed, 'Players Online:') !== false) {
            preg_match('/Players Online:\s*(\d+)/i', $trimmed, $matches);
            if (isset($matches[1])) $result['players'] = $matches[1];
        }
        if (stripos($trimmed, 'Peak Today:') !== false) {
            preg_match('/Peak Today:\s*(\d+)/i', $trimmed, $matches);
            if (isset($matches[1])) $result['peak'] = $matches[1];
        }
        if (stripos($trimmed, 'Uptime:') !== false) {
            preg_match('/Uptime:\s*([\dhm:]+)/i', $trimmed, $matches);
            if (isset($matches[1])) $result['uptime'] = $matches[1];
        }
    }
    
    // If we got any data, mark as online
    if (strlen(trim($response)) > 0) {
        $result['online'] = true;
    }
}

// Return as JSON
echo json_encode($result);
?>
