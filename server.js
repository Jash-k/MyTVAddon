import express from "express";
import fetch from "node-fetch";
import { loadChannels } from "./m3u.js";

const app = express();
const PORT = process.env.PORT || 3000;

// ===========================
// CORS Middleware
// ===========================
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
  next();
});

// ===========================
// Helper Functions
// ===========================
function encodeId(url) {
  return Buffer.from(url)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeId(id) {
  let b64 = id.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return Buffer.from(b64, "base64").toString("utf8");
}

// ===========================
// MANIFEST
// ===========================
app.get("/manifest.json", (req, res) => {
  res.json({
    id: "org.freelivtv.tamil",
    version: "1.0.0",
    name: "FREE LIV TV",
    description: "Tamil Live TV Channels & Movies - 180+ Channels",
    logo: "https://i.ibb.co/p4knk5y/images-4.png",
    types: ["tv"],
    catalogs: [
      {
        type: "tv",
        id: "tamil",
        name: "Tamil Live TV"
      }
    ],
    resources: ["catalog", "stream"],
    idPrefixes: ["tamil:"],
    behaviorHints: {
      adult: false,
      p2p: false,
      configurable: false
    }
  });
});

// ===========================
// CATALOG
// ===========================
app.get("/catalog/:type/:id.json", async (req, res) => {
  const { type, id } = req.params;

  // Validate request
  if (type !== "tv" || id !== "tamil") {
    return res.json({ metas: [] });
  }

  try {
    const channels = await loadChannels();

    const metas = channels.map(ch => ({
      id: "tamil:" + encodeId(ch.url),
      type: "tv",
      name: ch.name,
      poster: ch.logo || "https://i.ibb.co/p4knk5y/images-4.png",
      posterShape: "square",
      background: ch.logo || "https://i.ibb.co/p4knk5y/images-4.png",
      description: `${ch.category || "Live TV"} • Tamil Channel`,
      genres: [ch.category || "Entertainment"]
    }));

    res.json({ metas });

  } catch (error) {
    console.error("❌ Catalog error:", error);
    res.json({ metas: [] });
  }
});

// ===========================
// STREAM
// ===========================
app.get("/stream/:type/:id.json", async (req, res) => {
  const { type, id } = req.params;

  // Validate request
  if (type !== "tv" || !id.startsWith("tamil:")) {
    return res.json({ streams: [] });
  }

  try {
    const streamUrl = decodeId(id.replace("tamil:", ""));
    
    // Primary stream option
    const streams = [
      {
        name: "FREE LIV TV",
        title: "▶️ Live Stream",
        url: streamUrl,
        behaviorHints: {
          notWebReady: false,
          bingeGroup: "tamil-live-tv",
          videoSize: 1920 * 1080,
          videoCodec: "h264,h265",
          audioCodec: "aac,mp3"
        }
      }
    ];

    // Try to resolve HLS variants for better quality
    if (streamUrl.includes(".m3u8")) {
      try {
        const response = await fetch(streamUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Stremio/4.0 (Samsung; Tizen)",
            "Accept": "*/*"
          },
          timeout: 5000
        });

        if (response.ok) {
          const m3u8Content = await response.text();
          
          // Check if master playlist with variants
          if (m3u8Content.includes("#EXT-X-STREAM-INF")) {
            const lines = m3u8Content.split("\n");
            
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].includes("#EXT-X-STREAM-INF") && lines[i + 1]) {
                const variantUrl = lines[i + 1].trim();
                
                // Resolve relative URLs
                const fullUrl = variantUrl.startsWith("http") 
                  ? variantUrl 
                  : new URL(variantUrl, streamUrl).href;
                
                streams.push({
                  name: "FREE LIV TV HD",
                  title: "▶️ HD Quality",
                  url: fullUrl,
                  behaviorHints: {
                    notWebReady: false,
                    bingeGroup: "tamil-live-tv"
                  }
                });
                
                break; // Just get the first variant
              }
            }
          }
        }
      } catch (e) {
        console.log("⚠️ Could not resolve stream variants:", e.message);
      }
    }

    res.json({ streams });

  } catch (error) {
    console.error("❌ Stream error:", error);
    res.json({ streams: [] });
  }
});

// ===========================
// STREAM PROXY (Fallback)
// ===========================
app.get("/proxy/:id", async (req, res) => {
  try {
    const streamUrl = decodeId(req.params.id);
    
    console.log("🔄 Proxying stream:", streamUrl);

    const response = await fetch(streamUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Smart-TV; Linux; Tizen 6.0) AppleWebKit/537.36",
        "Referer": "https://freelivtvstrshare.vvishwas042.workers.dev/",
        "Origin": "https://freelivtvstrshare.vvishwas042.workers.dev",
        "Accept": "*/*"
      },
      timeout: 10000
    });

    if (!response.ok) {
      throw new Error(`Stream returned ${response.status}`);
    }

    // Forward content type
    const contentType = response.headers.get("content-type");
    if (contentType) {
      res.set("Content-Type", contentType);
    }

    // Set CORS headers
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "*");

    // Pipe the stream
    response.body.pipe(res);

  } catch (error) {
    console.error("❌ Proxy error:", error.message);
    res.status(500).send("Stream not available");
  }
});

// ===========================
// TEST ENDPOINT
// ===========================
app.get("/test/:id", async (req, res) => {
  try {
    const streamUrl = decodeId(req.params.id);
    
    console.log("🧪 Testing stream:", streamUrl);

    const response = await fetch(streamUrl, {
      method: "HEAD",
      headers: {
        "User-Agent": "Stremio/4.0",
        "Accept": "*/*"
      },
      timeout: 5000
    });

    res.json({
      url: streamUrl,
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get("content-type"),
      contentLength: response.headers.get("content-length"),
      headers: Object.fromEntries(response.headers.entries())
    });

  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
});

// ===========================
// HEALTH CHECK
// ===========================
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>FREE LIV TV Addon</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 600px;
          margin: 50px auto;
          padding: 20px;
          background: #f5f5f5;
        }
        .container {
          background: white;
          padding: 30px;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #e74c3c; }
        .status { color: #27ae60; font-size: 24px; }
        a {
          display: inline-block;
          margin: 10px 0;
          padding: 10px 20px;
          background: #3498db;
          color: white;
          text-decoration: none;
          border-radius: 5px;
        }
        a:hover { background: #2980b9; }
        code {
          background: #ecf0f1;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📺 FREE LIV TV Addon</h1>
        <p class="status">✅ Status: Running</p>
        <p>Tamil Live TV Channels - 180+ Channels</p>
        
        <h3>Installation:</h3>
        <p>Copy this URL and install in Stremio:</p>
        <code>${req.protocol}://${req.get('host')}/manifest.json</code>
        
        <br><br>
        <a href="/manifest.json">📄 View Manifest</a>
        
        <h3>Supported Platforms:</h3>
        <ul>
          <li>✅ Stremio Desktop (Windows, Mac, Linux)</li>
          <li>✅ Stremio Web</li>
          <li>✅ Samsung TV (Tizen)</li>
          <li>✅ LG TV (WebOS)</li>
          <li>✅ Android TV</li>
        </ul>
        
        <h3>Features:</h3>
        <ul>
          <li>180+ Tamil TV Channels</li>
          <li>Live News & Entertainment</li>
          <li>Tamil Movies 24/7</li>
          <li>HD Quality Streams</li>
        </ul>
      </div>
    </body>
    </html>
  `);
});

// ===========================
// START SERVER
// ===========================
app.listen(PORT, () => {
  console.log("\n" + "=".repeat(50));
  console.log("📺 FREE LIV TV Stremio Addon");
  console.log("=".repeat(50));
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Local: http://localhost:${PORT}`);
  console.log(`📱 Install: http://localhost:${PORT}/manifest.json`);
  console.log("=".repeat(50) + "\n");
});

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("👋 Shutting down gracefully...");
  process.exit(0);
});