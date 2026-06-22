<?php
// Simple status page - just shows the player count
$json = file_get_contents('/var/www/html/player_count.json');
$data = json_decode($json, true);
$players = isset($data['players']) ? $data['players'] : '0';
?>
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>SWG Returns</title>
    <style>
        body {
            background: #0a0c12;
            color: #fff;
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
        }
        .card {
            background: #1a1c2a;
            border: 2px solid #3b82f6;
            border-radius: 16px;
            padding: 40px 60px;
            text-align: center;
            min-width: 300px;
        }
        .title {
            font-size: 28px;
            color: #60a5fa;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .status {
            font-size: 20px;
            margin-bottom: 15px;
            color: #4caf50;
        }
        .number {
            font-size: 80px;
            font-weight: bold;
            color: #93c5fd;
            margin: 10px 0;
        }
        .label {
            font-size: 18px;
            color: #888;
        }
        .detail {
            font-size: 14px;
            color: #666;
            margin-top: 10px;
        }
        .updated {
            font-size: 12px;
            color: #444;
            margin-top: 15px;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="title">🚀 SWG Returns</div>
        <div class="status">● ONLINE</div>
        <div class="number"><?php echo $players; ?></div>
        <div class="label">players online</div>
        <div class="detail">Peak: <?php echo isset($data['peak']) ? $data['peak'] : 'N/A'; ?> · Uptime: N/A</div>
        <div class="updated">Updated: <?php echo date('H:i:s'); ?></div>
    </div>
</body>
</html>
