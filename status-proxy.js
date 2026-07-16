const net = require('net');
const http = require('http');
const url = require('url');

const SERVERS = {
    precu: { ip: '51.81.81.116', port: 44455, name: 'Pre-CU Main', type: 'core3' },
    nge: { ip: '109.228.61.26', port: 44455, name: 'NGE Main', type: 'core3' }
};

const cache = {};
const cacheReady = {};
for (const key of Object.keys(SERVERS)) {
    cache[key] = {
        online: false, players: '--', peak: 'N/A', uptime: '',
        server: SERVERS[key].name, cachedAt: 0
    };
    cacheReady[key] = false;
}

const REFRESH_INTERVAL = 15000;

function setServerOffline(serverKey) {
    const config = SERVERS[serverKey];
    cache[serverKey] = {
        online: false,
        players: '0',
        peak: '0',
        uptime: '',
        server: config.name,
        cachedAt: Date.now()
    };
    cacheReady[serverKey] = true;
}

function fetchServerStatus(serverKey) {
    const config = SERVERS[serverKey];
    if (config.type === 'http') {
        fetchHttpStatus(serverKey);
    } else {
        fetchCore3Status(serverKey);
    }
}

function fetchHttpStatus(serverKey) {
    const config = SERVERS[serverKey];
    const conn = http.get('http://' + config.ip + ':' + config.port + '/', (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            try {
                const result = JSON.parse(data);
                result.server = config.name;
                result.cachedAt = Date.now();
                cache[serverKey] = result;
                cacheReady[serverKey] = true;
            } catch (e) {}
        });
    });
    conn.setTimeout(4000, () => {
        conn.destroy();
        setServerOffline(serverKey);
    });
    conn.on('error', () => {
        setServerOffline(serverKey);
    });
}

function fetchCore3Status(serverKey) {
    const config = SERVERS[serverKey];
    let attemptCount = 0;
    const maxAttempts = 3;

    function retryOrOffline() {
        if (attemptCount < maxAttempts) {
            setTimeout(tryConnect, 500);
        } else {
            setServerOffline(serverKey);
        }
    }

    function tryConnect() {
        if (attemptCount >= maxAttempts) {
            setServerOffline(serverKey);
            return;
        }
        attemptCount++;

        const socket = new net.Socket();
        let data = '';
        let resolved = false;

        socket.setTimeout(4000);
        socket.connect(config.port, config.ip);

        socket.on('data', (chunk) => { data += chunk.toString(); });

        socket.on('end', () => {
            if (!resolved) {
                resolved = true;
                const result = parseXMLStatus(data);
                if (result) {
                    result.server = config.name;
                    result.cachedAt = Date.now();
                    cache[serverKey] = result;
                    cacheReady[serverKey] = true;
                } else {
                    retryOrOffline();
                }
            }
        });

        socket.on('error', () => {
            if (!resolved) {
                resolved = true;
                socket.destroy();
                retryOrOffline();
            }
        });

        socket.on('timeout', () => {
            socket.destroy();
            if (!resolved) {
                resolved = true;
                retryOrOffline();
            }
        });
    }

    tryConnect();
}

function parseXMLStatus(xml) {
    if (!xml || xml.trim().length === 0) return null;
    if (!xml.includes('<zoneServer>') && !xml.includes('<connected>')) return null;

    const connectedMatch = xml.match(/<connected>(\d+)<\/connected>/i);
    if (!connectedMatch) return null;

    const result = { online: true, players: connectedMatch[1], peak: 'N/A', uptime: '' };

    const maxMatch = xml.match(/<max>(\d+)<\/max>/i);
    if (maxMatch) result.peak = maxMatch[1];

    const uptimeMatch = xml.match(/<uptime>(\d+)<\/uptime>/i);
    if (uptimeMatch) {
        const seconds = parseInt(uptimeMatch[1], 10);
        if (seconds > 0) {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const days = Math.floor(hours / 24);
            result.uptime = days > 0 ? `${days}d ${hours % 24}h` : `${hours}h ${minutes}m`;
        }
    }

    return result;
}

function refreshAll() {
    for (const key of Object.keys(SERVERS)) {
        fetchServerStatus(key);
    }
}

function handleRequest(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Max-Age', '86400');

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

    res.writeHead(200);
    res.end(JSON.stringify(cache[serverKey]));
}

const PORT = process.env.PORT || 5002;
const server = http.createServer(handleRequest);

server.listen(PORT, '0.0.0.0', () => {
    console.log(`SWG Returns Status Proxy running on port ${PORT}`);
    console.log(`Servers: ${Object.keys(SERVERS).join(', ')}`);
    refreshAll();
    setInterval(refreshAll, REFRESH_INTERVAL);
    console.log(`Background refresh every ${REFRESH_INTERVAL / 1000}s`);
});

process.on('SIGINT', () => {
    console.log('\nShutting down...');
    server.close(() => process.exit(0));
});
