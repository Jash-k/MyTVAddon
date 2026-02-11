const { getRouter } = require('stremio-addon-sdk');
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const addonInterface = require('./addon');
const keepalive = require('./keepalive');
const { channelCache, streamCache, metaCache } = require('./cache');
const { loadChannels, getCategories } = require('./m3u');
const { log, error, formatBytes } = require('./utils');

const app = express();

// ==========================================
// MIDDLEWARE
// ==========================================

// Security headers (disabled for Stremio compatibility)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false
}));

// CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['*']
}));

// Compression
if (config.ENABLE_COMPRESSION) {
  app.use(compression());
}

// Rate limiting
const limiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW,
  max: config.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
app.use(limiter);

// JSON parsing
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const symbol = status < 400 ? '✓' : '✗';
    
    if (config.DEBUG || status >= 400) {
      log(`${symbol} ${req.method} ${req.path} - ${status} (${duration}ms)`);
    }
  });
  
  next();
});

// ==========================================
// ROUTES
// ==========================================

// Home page
app.get('/', async (req, res) => {
  const baseUrl = config.BASE_URL || `${req.protocol}://${req.get('host')}`;
  const installUrl = `${baseUrl}/manifest.json`;
  
  let channelCount = 0;
  let categories = [];
  
  try {
    const channels = await loadChannels();
    channelCount = channels.length;
    categories = await getCategories();
  } catch (e) {
    // Ignore
  }
  
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${config.APP_NAME} - Stremio Addon</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
          min-height: 100vh;
          color: white;
          padding: 20px;
        }
        .container {
          max-width: 800px;
          margin: 0 auto;
        }
        .card {
          background: rgba(255,255,255,0.05);
          backdrop-filter: blur(10px);
          border-radius: 20px;
          padding: 40px;
          margin-bottom: 20px;
          border: 1px solid rgba(255,255,255,0.1);
        }
        h1 {
          font-size: 2.5rem;
          margin-bottom: 10px;
          display: flex;
          align-items: center;
          gap: 15px;
        }
        .status {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(74, 222, 128, 0.2);
          color: #4ade80;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 0.9rem;
          margin-bottom: 20px;
        }
        .status-dot {
          width: 10px;
          height: 10px;
          background: #4ade80;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .install-box {
          background: rgba(0,0,0,0.3);
          padding: 20px;
          border-radius: 12px;
          margin: 20px 0;
          font-family: monospace;
          font-size: 0.9rem;
          word-break: break-all;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .btn {
          display: inline-block;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 14px 28px;
          border-radius: 10px;
          text-decoration: none;
          font-weight: 600;
          margin: 5px;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
        }
        .categories {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin: 20px 0;
        }
        .category {
          background: rgba(255,255,255,0.1);
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 0.85rem;
        }
        .stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 15px;
          margin-top: 20px;
        }
        .stat {
          background: rgba(255,255,255,0.05);
          padding: 20px;
          border-radius: 12px;
          text-align: center;
        }
        .stat-value {
          font-size: 2rem;
          font-weight: bold;
          color: #667eea;
        }
        .stat-label {
          font-size: 0.85rem;
          opacity: 0.7;
          margin-top: 5px;
        }
        .footer {
          text-align: center;
          opacity: 0.5;
          font-size: 0.85rem;
          margin-top: 30px;
        }
        .features {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
          margin-top: 20px;
        }
        .feature {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 15px;
          background: rgba(255,255,255,0.05);
          border-radius: 10px;
        }
        .feature-icon {
          font-size: 1.5rem;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <h1>📺 ${config.APP_NAME}</h1>
          <div class="status">
            <span class="status-dot"></span>
            Server Running • v${config.APP_VERSION}
          </div>
          
          <p style="opacity: 0.8; margin-bottom: 20px; font-size: 1.1rem;">
            Tamil Live TV • Cricket • Movies • News<br>
            Optimized for Samsung TV & all devices
          </p>

          <h3 style="margin-bottom: 10px;">📲 Installation URL:</h3>
          <div class="install-box">${installUrl}</div>
          
          <a href="${installUrl}" class="btn">📄 View Manifest</a>
          <a href="stremio://${req.get('host')}/manifest.json" class="btn">📲 Install in Stremio</a>
        </div>

        <div class="card">
          <h3 style="margin-bottom: 15px;">📊 Statistics</h3>
          <div class="stats">
            <div class="stat">
              <div class="stat-value">${channelCount}</div>
              <div class="stat-label">Total Channels</div>
            </div>
            <div class="stat">
              <div class="stat-value">${categories.length}</div>
              <div class="stat-label">Categories</div>
            </div>
            <div class="stat">
              <div class="stat-value">${streamCache.size()}</div>
              <div class="stat-label">Cached Streams</div>
            </div>
            <div class="stat">
              <div class="stat-value">${Math.floor(process.uptime() / 60)}m</div>
              <div class="stat-label">Uptime</div>
            </div>
          </div>
          
          <h4 style="margin: 20px 0 10px;">Categories:</h4>
          <div class="categories">
            ${categories.map(c => `<span class="category">${c.name} (${c.count})</span>`).join('')}
          </div>
        </div>

        <div class="card">
          <h3 style="margin-bottom: 15px;">✨ Features</h3>
          <div class="features">
            <div class="feature">
              <span class="feature-icon">🚀</span>
              <div>Direct Stream Extraction</div>
            </div>
            <div class="feature">
              <span class="feature-icon">💾</span>
              <div>Smart Caching</div>
            </div>
            <div class="feature">
              <span class="feature-icon">📺</span>
              <div>Samsung TV Optimized</div>
            </div>
            <div class="feature">
              <span class="feature-icon">🏏</span>
              <div>Live Cricket Streams</div>
            </div>
            <div class="feature">
              <span class="feature-icon">🎬</span>
              <div>24/7 Movie Channels</div>
            </div>
            <div class="feature">
              <span class="feature-icon">⚡</span>
              <div>Zero Buffering</div>
            </div>
          </div>
        </div>

        <div class="card">
          <h3 style="margin-bottom: 15px;">📱 Supported Platforms</h3>
          <p style="opacity: 0.8;">
            ✅ Samsung TV (Tizen) • ✅ LG TV (WebOS) • ✅ Android TV<br>
            ✅ Windows • ✅ macOS • ✅ Linux • ✅ Android • ✅ iOS
          </p>
        </div>

        <div class="footer">
          ${config.APP_NAME} v${config.APP_VERSION} • Stremio Addon
        </div>
      </div>
    </body>
    </html>
  `);
});

// Health check
app.get('/health', (req, res) => {
  const keepaliveStats = keepalive.getStats();
  
  res.json({
    status: 'OK',
    version: config.APP_VERSION,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    cache: {
      channels: channelCache.getStats(),
      streams: streamCache.getStats(),
      meta: metaCache.getStats()
    },
    keepalive: keepaliveStats,
    memory: {
      used: formatBytes(process.memoryUsage().heapUsed),
      total: formatBytes(process.memoryUsage().heapTotal)
    }
  });
});

// Stats endpoint
app.get('/stats', async (req, res) => {
  try {
    const channels = await loadChannels();
    const categories = await getCategories();
    
    res.json({
      channels: channels.length,
      categories,
      cache: {
        channels: channelCache.getStats(),
        streams: streamCache.getStats(),
        meta: metaCache.getStats()
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear cache endpoint
app.post('/clear-cache', (req, res) => {
  channelCache.clear();
  streamCache.clear();
  metaCache.clear();
  
  log('[CACHE] All caches cleared');
  res.json({ success: true, message: 'All caches cleared' });
});

// Stremio addon router
app.use('/', getRouter(addonInterface));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ==========================================
// START SERVER
// ==========================================
const server = app.listen(config.PORT, () => {
  console.log('\n' + '═'.repeat(60));
  console.log(`  📺 ${config.APP_NAME} v${config.APP_VERSION}`);
  console.log('═'.repeat(60));
  console.log(`  ✅ Server: http://localhost:${config.PORT}`);
  console.log(`  📱 Install: http://localhost:${config.PORT}/manifest.json`);
  console.log(`  🔧 Health:  http://localhost:${config.PORT}/health`);
  console.log('═'.repeat(60));
  console.log(`  Mode: ${config.NODE_ENV}`);
  console.log(`  Debug: ${config.DEBUG}`);
  console.log(`  Keep-Alive: ${config.KEEP_ALIVE_ENABLED}`);
  console.log('═'.repeat(60) + '\n');

  // Start keep-alive pings
  const baseUrl = config.BASE_URL || `http://localhost:${config.PORT}`;
  keepalive.start(baseUrl);

  // Pre-warm cache
  loadChannels().then(channels => {
    log(`[STARTUP] Pre-loaded ${channels.length} channels`);
  }).catch(err => {
    error('[STARTUP] Failed to pre-load channels:', err.message);
  });
});

// Optimize for streaming
server.timeout = 0;
server.keepAliveTimeout = 120000;
server.headersTimeout = 120000;

// Graceful shutdown
process.on('SIGTERM', () => {
  log('Received SIGTERM, shutting down...');
  keepalive.stop();
  server.close(() => {
    log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  log('Received SIGINT, shutting down...');
  keepalive.stop();
  server.close(() => {
    log('Server closed');
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => {
  error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  error('Unhandled Rejection:', err);
});