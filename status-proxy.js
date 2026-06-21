// status-proxy.js - SWG Returns Server Status Proxy (Node.js)
const net = require('net');
const http = require('http');
const url = require('url');

// Server configurations (same as launcher)
const SERVERS = {
    precu: { ip: '51.81.81.116', port: 44455, name: 'Pre-CU Main' },
    tc: { ip: '51.81.81.116', port: 44455, name: 'Test Center' },
    nge: { ip: 'login.swgtalon.online', port: 44455, name: 'NGE Main' },
    'nge-tc': { ip: 'login.swgtalon.online', port: 44455, name: 'NGE TC' }
};

const server = http.createServer((req, res) => {
    // Enable CORS for all requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');
    
    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // Parse query parameters
    const parsedUrl = url.parse(req.url, true);
    const serverKey = parsedUrl.query.server || 'precu';
    const config = SERVERS[serverKey];
    
    if (!config) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid server key' }));
        return;
    }
    
    console.log(`[${new Date().toISOString()}] Fetching status for ${serverKey} (${config.ip}:${config.port})`);
    
    const result = { 
        online: false, 
        players: '0', 
        peak: 'N/A', 
        uptime: '',
        server: config.name
    };
    
    // Connect to the game server's status port
    const socket = new net.Socket();
    let data = '';
    let resolved = false;
    
    socket.setTimeout(5000); // 5 second timeout
    
    socket.connect(config.port, config.ip, () => {
        console.log(`Connected to ${config.ip}:${config.port}`);
        socket.write('\n'); // Send newline to trigger status response
    });
    
    socket.on('data', (chunk) => {
        data += chunk.toString();
    });
    
    socket.on('end', () => {
        if (!resolved) {
            resolved = true;
            parseStatusResponse(data, result);
            console.log(`Status for ${serverKey}: online=${result.online}, players=${result.players}`);
            res.writeHead(200);
            res.end(JSON.stringify(result));
        }
    });
    
    socket.on('error', (err) => {
        console.error(`Socket error for ${serverKey}:`, err.message);
        if (!resolved) {
            resolved = true;
            res.writeHead(200); // Still return 200 with offline status
            res.end(JSON.stringify(result));
        }
    });
    
    socket.on('timeout', () => {
        console.error(`Timeout for ${serverKey}`);
        socket.destroy();
        if (!resolved) {
            resolved = true;
            res.writeHead(200);
            res.end(JSON.stringify(result));
        }
    });
});

function parseStatusResponse(data, result) {
    if (!data || data.trim().length === 0) {
        result.online = false;
        return;
    }
    
    result.online = true;
    const lines = data.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.includes('Players Online:')) {
            const match = trimmed.match(/Players Online:\s*(\d+)/i);
            if (match) result.players = match[1];
        }
        if (trimmed.includes('Peak Today:')) {
            const match = trimmed.match(/Peak Today:\s*(\d+)/i);
            if (match) result.peak = match[1];
        }
        if (trimmed.includes('Uptime:')) {
            const match = trimmed.match(/Uptime:\s*([\dhm:]+)/i);
            if (match) result.uptime = match[1];
        }
    }
}

const PORT = process.env.PORT || 5002;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ SWG Returns Status Proxy running on port ${PORT}`);
    console.log(`   Servers: ${Object.keys(SERVERS).join(', ')}`);
    console.log(`   Example: http://localhost:${PORT}/?server=precu`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down...');
    server.close(() => process.exit(0));
});
