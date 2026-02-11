const { addonBuilder } = require('stremio-addon-sdk');
const { loadChannels } = require('./m3u');
const fetch = require('node-fetch');

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

const manifest = {
  id: "org.freelivtv.tamil",
  version: "1.1.0",
  name: "FREE LIV TV",
  description: "Tamil Live TV - Direct Stream",
  types: ["tv"],
  catalogs: [
    {
      type: "tv",
      id: "tamil-all",
      name: "All Channels"
    },
    {
      type: "tv",
      id: "tamil-cricket",
      name: "Cricket"
    },
    {
      type: "tv",
      id: "tamil-movies", 
      name: "Movies"
    },
    {
      type: "tv",
      id: "tamil-news",
      name: "News"
    }
  ],
  resources: ["catalog", "meta", "stream"],
  idPrefixes: ["tamil:"]
};

const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(async ({ type, id }) => {
  if (type !== "tv") return { metas: [] };

  try {
    const allChannels = await loadChannels();
    let channels = allChannels;

    if (id === "tamil-cricket") {
      channels = allChannels.filter(ch => ch.category === "Cricket");
    } else if (id === "tamil-movies") {
      channels = allChannels.filter(ch => ch.category === "Movies");
    } else if (id === "tamil-news") {
      channels = allChannels.filter(ch => ch.category === "News");
    }

    return {
      metas: channels.map(ch => ({
        id: "tamil:" + encodeId(ch.url),
        type: "tv",
        name: ch.name,
        posterShape: "square",
        releaseInfo: "LIVE"
      }))
    };
  } catch (error) {
    console.error('[CATALOG]', error);
    return { metas: [] };
  }
});

builder.defineMetaHandler(async ({ type, id }) => {
  if (type !== "tv" || !id.startsWith("tamil:")) return { meta: null };

  try {
    const channels = await loadChannels();
    const channel = channels.find(ch => 
      encodeId(ch.url) === id.replace("tamil:", "")
    );

    return {
      meta: {
        id: id,
        type: "tv",
        name: channel ? channel.name : "Live Channel",
        releaseInfo: "LIVE",
        videos: [{
          id: id,
          title: "Watch Live",
          released: new Date().toISOString()
        }]
      }
    };
  } catch (error) {
    return { meta: null };
  }
});

// ========================================
// THE KEY PART: Extract Real Stream URL
// ========================================
builder.defineStreamHandler(async ({ type, id }) => {
  if (type !== "tv" || !id.startsWith("tamil:")) {
    return { streams: [] };
  }

  try {
    const playlistUrl = decodeId(id.replace("tamil:", ""));
    
    console.log(`[STREAM] Fetching: ${playlistUrl}`);

    // Fetch the play.m3u8 playlist
    const response = await fetch(playlistUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36',
        'Accept': '*/*',
        'Referer': 'https://freelivtvstrshare.vvishwas042.workers.dev/'
      },
      timeout: 10000
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch playlist: ${response.status}`);
    }

    const m3u8Content = await response.text();
    console.log(`[STREAM] Playlist fetched (${m3u8Content.length} bytes)`);

    // Extract the real stream URL from the playlist
    const realStreamUrl = extractRealStreamUrl(m3u8Content, playlistUrl);

    if (!realStreamUrl) {
      console.log('[STREAM] No real URL found, using original');
      return {
        streams: [{
          url: playlistUrl,
          behaviorHints: { notWebReady: true }
        }]
      };
    }

    console.log(`[STREAM] Real URL: ${realStreamUrl}`);

    // Return the DIRECT stream URL
    return {
      streams: [{
        url: realStreamUrl,
        behaviorHints: {
          notWebReady: true
        }
      }]
    };

  } catch (error) {
    console.error('[STREAM] Error:', error.message);
    
    // Fallback to original URL if extraction fails
    const playlistUrl = decodeId(id.replace("tamil:", ""));
    return {
      streams: [{
        url: playlistUrl,
        behaviorHints: { notWebReady: true }
      }]
    };
  }
});

// ========================================
// Extract Real Stream URL from M3U8
// ========================================
function extractRealStreamUrl(m3u8Content, baseUrl) {
  try {
    const lines = m3u8Content.split('\n').map(line => line.trim());
    
    // Check if it's a master playlist (has #EXT-X-STREAM-INF)
    const isMasterPlaylist = lines.some(line => line.includes('#EXT-X-STREAM-INF'));
    
    if (isMasterPlaylist) {
      console.log('[EXTRACT] Master playlist detected, finding best variant');
      
      // Find all variants
      const variants = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('#EXT-X-STREAM-INF')) {
          // Extract bandwidth
          const bandwidthMatch = lines[i].match(/BANDWIDTH=(\d+)/);
          const bandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1]) : 0;
          
          // Next line should be the URL
          if (lines[i + 1] && !lines[i + 1].startsWith('#')) {
            variants.push({
              url: lines[i + 1],
              bandwidth: bandwidth
            });
          }
        }
      }
      
      if (variants.length === 0) {
        console.log('[EXTRACT] No variants found');
        return null;
      }
      
      // Sort by bandwidth (highest quality first)
      variants.sort((a, b) => b.bandwidth - a.bandwidth);
      
      // Select middle quality for stability on Samsung TV
      const selectedIndex = Math.floor(variants.length / 2);
      const selected = variants[selectedIndex];
      
      console.log(`[EXTRACT] Selected variant: ${selected.bandwidth} bps`);
      
      // Make absolute URL
      let variantUrl = selected.url;
      if (!variantUrl.startsWith('http')) {
        const base = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
        variantUrl = base + variantUrl;
      }
      
      return variantUrl;
      
    } else {
      // Already a media playlist, find the first segment
      console.log('[EXTRACT] Media playlist detected, finding first segment');
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Skip comments and tags
        if (line.startsWith('#') || !line) continue;
        
        // Found a segment URL
        if (line.includes('.ts') || line.includes('.m4s')) {
          console.log('[EXTRACT] Found segment URL');
          
          // Make absolute URL
          if (line.startsWith('http')) {
            return line;
          } else {
            const base = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
            return base + line;
          }
        }
      }
      
      console.log('[EXTRACT] No segments found, returning playlist URL');
      return null; // Return null to use original playlist URL
    }
    
  } catch (error) {
    console.error('[EXTRACT] Error:', error.message);
    return null;
  }
}

module.exports = builder.getInterface();