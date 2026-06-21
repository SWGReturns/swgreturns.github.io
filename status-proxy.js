// status-proxy.js - SWG Returns Server Status Proxy (XML parser)
const net = require('net');
const http = require('http');
const url = require('url');

// Server configurations
const SERVERS = {
    precu: { ip: '51.81.81.116', port: 44455, name: 'Pre-CU Main' },
    tc: { ip: '51.81.81.116', port: 44455, name: 'Test Center' },
    nge: { ip: 'login.swgtalon.online', port: 44455, name: 'NGE Main' },
    'nge-tc': { ip: 'login.swgtalon.online', port: 44455, name: 'NGE TC' }
};

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    const parsedUrl = url.parse(req.url, true);
    const serverKey = parsedUrl.query.server || 'precu';
    const config = SERVERS[serverKey];
    
    if (!config) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid server key' }));
        return;
    }
    
    console.log(`[${new Date().toISOString()}] Fetching status for ${serverKey}`);
    
    const result = { 
        online: false, 
        players: '0', 
        peak: 'N/A', 
        uptime: '',
        server: config.name
    };
    
    const socket = new net.Socket();
    let data = '';
    let resolved = false;
    
    socket.setTimeout(5000);
    
    socket.connect(config.port, config.ip, () => {
        socket.write('\n');
    });
    
    socket.on('data', (chunk) => {
        data += chunk.toString();
    });
    
    socket.on('end', () => {
        if (!resolved) {
            resolved = true;
            if (data.trim().length > 0) {
                // Parse the XML response
                parseXMLStatus(data, result);
            }
            res.writeHead(200);
            res.end(JSON.stringify(result));
        }
    });
    
    socket.on('error', (err) => {
        console.error(`Socket error for ${serverKey}:`, err.message);
        if (!resolved) {
            resolved = true;
            res.writeHead(200);
            res.end(JSON.stringify(result));
        }
    });
    
    socket.on('timeout', () => {
        socket.destroy();
        if (!resolved) {
            resolved = true;
            res.writeHead(200);
            res.end(JSON.stringify(result));
        }
    });
});

function parseXMLStatus(xml, result) {
    if (!xml || xml.trim().length === 0) {
        result.online = false;
        return;
    }
    
    // Check if it's XML (contains <zoneServer> or similar)
    if (xml.includes('<zoneServer>') || xml.includes('<connected>')) {
        result.online = true;
        
        // Extract connected players
        const connectedMatch = xml.match(/<connected>(\d+)<\/connected>/i);
        if (connectedMatch) {
            result.players = connectedMatch[1];
        }
        
        // Extract max (peak)
        const maxMatch = xml.match(/<max>(\d+)<\/max>/i);
        if (maxMatch) {
            result.peak = maxMatch[1];
        }
        
        // Extract uptime (in seconds, convert to readable format)
        const uptimeMatch = xml.match(/<uptime>(\d+)<\/uptime>/i);
        if (uptimeMatch) {
            const seconds = parseInt(uptimeMatch[1], 10);
            if (seconds > 0) {
                const hours = Math.floor(seconds / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                const days = Math.floor(hours / 24);
                if (days > 0) {
                    result.uptime = `${days}d ${hours % 24}h`;
                } else {
                    result.uptime = `${hours}h ${minutes}m`;
                }
            }
        }
        
        // If we got any data, mark as online
        result.online = true;
        return;
    }
    
    // Fallback: try plain text parsing (old format)
    const lines = xml.split('\n');
    let foundData = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.includes('Players Online:')) {
            const match = trimmed.match(/Players Online:\s*(\d+)/i);
            if (match) {
                result.players = match[1];
                foundData = true;
            }
        }
        if (trimmed.includes('Peak Today:')) {
            const match = trimmed.match(/Peak Today:\s*(\d+)/i);
            if (match) {
                result.peak = match[1];
                foundData = true;
            }
        }
        if (trimmed.includes('Uptime:')) {
            const match = trimmed.match(/Uptime:\s*([\dhm:]+)/i);
            if (match) {
                result.uptime = match[1];
                foundData = true;
            }
        }
    }
    if (foundData) {
        result.online = true;
    }
}

const PORT = process.env.PORT || 5002;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ SWG Returns Status Proxy running on port ${PORT}`);
    console.log(`   Servers: ${Object.keys(SERVERS).join(', ')}`);
    console.log(`   Example: http://localhost:${PORT}/?server=precu`);
});

process.on('SIGINT', () => {
    console.log('\nShutting down...');
    server.close(() => process.exit(0));
});
