const { getRouter } = require('stremio-addon-sdk');
const express = require('express');
const addonInterface = require('./addon');

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.get('/', (req, res) => {
  const installUrl = `${req.protocol}://${req.get('host')}/manifest.json`;
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>FREE LIV TV</title>
      <style>
        body { font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px; background: #1a1a2e; color: white; }
        .status { color: #4ade80; font-size: 20px; }
        code { background: rgba(255,255,255,0.1); padding: 15px; display: block; margin: 15px 0; border-radius: 8px; word-break: break-all; }
      </style>
    </head>
    <body>
      <h1>📺 FREE LIV TV</h1>
      <p class="status">✅ Direct Stream Mode</p>
      <h3>Install URL:</h3>
      <code>${installUrl}</code>
      <p>🚀 Optimized: Extracts real stream URL for direct playback</p>
    </body>
    </html>
  `);
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', mode: 'direct-stream' });
});

app.use('/', getRouter(addonInterface));

const server = app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log(`  📺 FREE LIV TV - Direct Stream Mode`);
  console.log(`  📱 http://localhost:${PORT}/manifest.json`);
  console.log('='.repeat(60) + '\n');
});

server.timeout = 0;
server.keepAliveTimeout = 120000;

process.on('SIGTERM', () => server.close(() => process.exit(0)));