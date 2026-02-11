const fetch = require('node-fetch');
const config = require('./config');
const { log, error, debug } = require('./utils');

let keepAliveInterval = null;
let pingCount = 0;
let lastPingTime = null;
let pingErrors = 0;

async function ping(url) {
  try {
    const start = Date.now();
    const response = await fetch(url, {
      method: 'GET',
      timeout: 10000,
      headers: {
        'User-Agent': 'KeepAlive/1.0'
      }
    });
    
    const latency = Date.now() - start;
    pingCount++;
    lastPingTime = new Date().toISOString();
    pingErrors = 0;

    debug(`[KEEPALIVE] Ping #${pingCount} - ${latency}ms - Status: ${response.status}`);
    
    return { success: true, latency, status: response.status };
  } catch (err) {
    pingErrors++;
    error(`[KEEPALIVE] Ping failed (${pingErrors}): ${err.message}`);
    return { success: false, error: err.message };
  }
}

function start(baseUrl) {
  if (!config.KEEP_ALIVE_ENABLED) {
    log('[KEEPALIVE] Disabled by config');
    return;
  }

  const url = config.KEEP_ALIVE_URL || `${baseUrl}/health`;
  
  if (!url || url.includes('localhost')) {
    log('[KEEPALIVE] Skipped (localhost or no URL)');
    return;
  }

  log(`[KEEPALIVE] Starting with URL: ${url}`);
  log(`[KEEPALIVE] Interval: ${config.KEEP_ALIVE_INTERVAL / 1000}s`);

  // Initial ping after 30 seconds
  setTimeout(() => ping(url), 30000);

  // Regular pings
  keepAliveInterval = setInterval(() => ping(url), config.KEEP_ALIVE_INTERVAL);
}

function stop() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    log('[KEEPALIVE] Stopped');
  }
}

function getStats() {
  return {
    enabled: config.KEEP_ALIVE_ENABLED,
    running: keepAliveInterval !== null,
    pingCount,
    lastPingTime,
    pingErrors,
    interval: config.KEEP_ALIVE_INTERVAL
  };
}

module.exports = {
  start,
  stop,
  ping,
  getStats
};