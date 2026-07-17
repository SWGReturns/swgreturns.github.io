const net = require('net');
const fs = require('fs');
const http = require('http');
const https = require('https');
const url = require('url');

const SERVERS = {
    precu: { ip: '51.81.81.116', port: 44455, name: 'Pre-CU Main', type: 'core3' },
    nge: { url: 'http://109.228.61.26:4458/', name: 'NGE Main', type: 'json' }
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
const NGE_UPTIME_CACHE = '/var/www/html/nge-uptime.json';

function readNgeUptimeCache() {
    try {
        const raw = fs.readFileSync(NGE_UPTIME_CACHE, 'utf8');
        const cache = JSON.parse(raw);
        const updated = cache.updated_at ? Date.parse(cache.updated_at) : 0;
        if (!updated || (Date.now() - updated) > 5 * 60 * 1000) return null;
        return cache;
    } catch (e) {
        return null;
    }
}

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
                const uptimeCache = serverKey === 'nge' ? readNgeUptimeCache() : null;
                if (typeof source.players !== 'undefined' && typeof source.uptime_seconds !== 'undefined') {
                    const uptimeSeconds = uptimeCache?.game_uptime_seconds || source.uptime_seconds || 0;
                    cache[serverKey] = {
                        online: Boolean(source.online || source.server_online),
                        players: String(source.players ?? source.players_online ?? 0),
                        peak: 'N/A',
                        uptime: formatSeconds(uptimeSeconds),
                        server: config.name,
                        recentActivity: Array.isArray(source.recent_activity) ? source.recent_activity.slice(0, 10) : [],
                        topPlayers: Array.isArray(source.top_players) ? source.top_players.slice(0, 10) : [],
                        source_updated_at: source.updated_at || null,
                        source_stale: false,
                        cachedAt: Date.now()
                    };
                    cacheReady[serverKey] = true;
                    return;
                }
                if (typeof source.onlinePlayers !== 'undefined' || Array.isArray(source.recentActivity)) {
                    const sourceTime = source.updatedAt ? Date.parse(source.updatedAt) : 0;
                    const stale = !sourceTime || (Date.now() - sourceTime) > 30 * 60 * 1000;
                    const uptimeSeconds = uptimeCache?.game_uptime_seconds || source.gameUptimeSeconds || uptimeCache?.host_uptime_seconds || source.hostUptimeSeconds || 0;
                    const online = Boolean(uptimeCache || source.gameOnline || source.loginOnline);
                    const playersOnline = stale ? 0 : Number(source.onlinePlayers || 0);
                    cache[serverKey] = {
                        online,
                        players: String(playersOnline),
                        peak: 'N/A',
                        uptime: formatSeconds(uptimeSeconds),
                        server: config.name,
                        recentActivity: Array.isArray(source.recentActivity) ? source.recentActivity.slice(0, 10) : [],
                        onlineNow: Array.isArray(source.onlineNow) ? source.onlineNow.slice(0, 10) : [],
                        topPlayers: Array.isArray(source.topPlayers) ? source.topPlayers.slice(0, 10) : [],
                        source_updated_at: source.updatedAt || null,
                        source_stale: stale,
                        cachedAt: Date.now()
                    };
                    cacheReady[serverKey] = true;
                    return;
                }
                const status = source.server_status || {};
                const players = source.players || {};
                const uptime = source.uptime || {};
                const sourceTime = source.updated_at ? Date.parse(source.updated_at) : 0;
                const stale = !sourceTime || (Date.now() - sourceTime) > 30 * 60 * 1000;
                const online = Boolean(status.overall_online || status.game_online);
                const uptimeSeconds = uptimeCache?.game_uptime_seconds || uptime.game_uptime_seconds || uptimeCache?.host_uptime_seconds;
                cache[serverKey] = {
                    online: Boolean(uptimeCache || online),
                    players: stale ? '0' : String(players.online ?? 0),
                    peak: stale ? 'N/A' : String(players.online ?? 0),
                    uptime: formatSeconds(uptimeSeconds),
                    server: config.name,
                    recentActivity: Array.isArray(players.online_characters) ? players.online_characters.slice(0, 10) : [],
                    source_updated_at: source.updated_at || null,
                    source_stale: stale,
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
