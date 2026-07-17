const net = require('net');
const http = require('http');
const https = require('https');
const url = require('url');

const SERVERS = {
    precu: { ip: '51.81.81.116', port: 44455, name: 'Pre-CU Main', type: 'core3' },
    nge: { url: 'https://register.swgtalon.online/status.json', name: 'NGE Main', type: 'json' }
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
    if (config.type === 'json') {
        fetchJsonStatus(serverKey);
    } else if (config.type === 'http') {
        fetchHttpStatus(serverKey);
    } else {
        fetchCore3Status(serverKey);
    }
}

function fetchJsonStatus(serverKey) {
    const config = SERVERS[serverKey];
    const client = config.url.startsWith('https:') ? https : http;
    const req = client.get(config.url + '?_=' + Date.now(), (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            try {
                const source = JSON.parse(data);
                const status = source.server_status || {};
                const players = source.players || {};
                const uptime = source.uptime || {};
                const online = Boolean(status.overall_online || status.game_online);
                cache[serverKey] = {
                    online,
                    players: String(players.online ?? 0),
                    peak: String(players.online ?? 0),
                    uptime: formatSeconds(uptime.game_uptime_seconds),
                    server: config.name,
                    source_updated_at: source.updated_at || null,
                    cachedAt: Date.now()
                };
                cacheReady[serverKey] = true;
            } catch (e) {
                setServerOffline(serverKey);
            }
        });
    });
    req.setTimeout(5000, () => {
        req.destroy();
        setServerOffline(serverKey);
    });
    req.on('error', () => {
        setServerOffline(serverKey);
    });
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

function formatSeconds(seconds) {
    seconds = Number(seconds || 0);
    if (!seconds || seconds <= 0) return '';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const days = Math.floor(hours / 24);
    return days > 0 ? `${days}d ${hours % 24}h` : `${hours}h ${minutes}m`;
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
