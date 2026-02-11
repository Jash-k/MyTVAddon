const { addonBuilder } = require('stremio-addon-sdk');
const fetch = require('node-fetch');
const config = require('./config');
const { loadChannels, getChannelByUrl } = require('./m3u');
const { streamCache, metaCache } = require('./cache');
const { encodeId, decodeId, log, error, debug, getCategoryIcon } = require('./utils');

// Manifest
const manifest = {
  id: config.APP_ID,
  version: config.APP_VERSION,
  name: config.APP_NAME,
  description: 'Tamil Live TV - 200+ Channels | Cricket | Movies | News | Optimized for Samsung TV',
  logo: 'https://i.ibb.co/p4knk5y/images-4.png',
  types: ['tv'],
  catalogs: [
    {
      type: 'tv',
      id: 'tamil-all',
      name: '📺 All Channels',
      extra: [{ name: 'genre' }, { name: 'search' }, { name: 'skip' }]
    },
    {
      type: 'tv',
      id: 'tamil-cricket',
      name: '🏏 Cricket'
    },
    {
      type: 'tv',
      id: 'tamil-movies',
      name: '🎬 Movies'
    },
    {
      type: 'tv',
      id: 'tamil-news',
      name: '📰 News'
    },
    {
      type: 'tv',
      id: 'tamil-entertainment',
      name: '📺 Entertainment'
    },
    {
      type: 'tv',
      id: 'tamil-music',
      name: '🎵 Music'
    }
  ],
  resources: ['catalog', 'meta', 'stream'],
  idPrefixes: ['tamil:'],
  behaviorHints: {
    adult: false,
    p2p: false
  }
};

const builder = new addonBuilder(manifest);

// ==========================================
// CATALOG HANDLER
// ==========================================
builder.defineCatalogHandler(async ({ type, id, extra }) => {
  debug(`[CATALOG] type=${type}, id=${id}, extra=`, extra);
  
  if (type !== 'tv') {
    return { metas: [] };
  }

  try {
    const allChannels = await loadChannels();
    let channels = allChannels;

    // Filter by catalog ID
    const categoryMap = {
      'tamil-cricket': 'Cricket',
      'tamil-movies': 'Movies',
      'tamil-news': 'News',
      'tamil-entertainment': 'Entertainment',
      'tamil-music': 'Music'
    };

    if (categoryMap[id]) {
      channels = allChannels.filter(ch => ch.category === categoryMap[id]);
    }

    // Handle search
    if (extra && extra.search) {
      const searchTerm = extra.search.toLowerCase();
      channels = channels.filter(ch =>
        ch.name.toLowerCase().includes(searchTerm) ||
        ch.displayName.toLowerCase().includes(searchTerm) ||
        ch.category.toLowerCase().includes(searchTerm)
      );
    }

    // Handle genre filter
    if (extra && extra.genre) {
      channels = channels.filter(ch => ch.category === extra.genre);
    }

    // Handle pagination
    const skip = extra && extra.skip ? parseInt(extra.skip) : 0;
    const limit = 100;
    channels = channels.slice(skip, skip + limit);

    // Build metas
    const metas = channels.map(ch => {
      const channelId = 'tamil:' + encodeId(ch.url);
      
      return {
        id: channelId,
        type: 'tv',
        name: ch.displayName || ch.name,
        poster: config.ENABLE_LOGOS && ch.logo ? ch.logo : undefined,
        posterShape: 'square',
        background: config.ENABLE_LOGOS && ch.logo ? ch.logo : undefined,
        description: `${getCategoryIcon(ch.category)} ${ch.category} • ${ch.quality}`,
        genres: [ch.category],
        releaseInfo: 'LIVE',
        runtime: 'LIVE',
        behaviorHints: {
          defaultVideoId: channelId,
          hasScheduledVideos: false
        }
      };
    });

    log(`[CATALOG] Returning ${metas.length} channels for ${id}`);
    
    return { metas };

  } catch (err) {
    error('[CATALOG] Error:', err.message);
    return { metas: [] };
  }
});

// ==========================================
// META HANDLER
// ==========================================
builder.defineMetaHandler(async ({ type, id }) => {
  debug(`[META] type=${type}, id=${id}`);
  
  if (type !== 'tv' || !id.startsWith('tamil:')) {
    return { meta: null };
  }

  // Check cache
  const cached = metaCache.get(id);
  if (cached) {
    debug('[META] Cache hit');
    return { meta: cached };
  }

  try {
    const streamUrl = decodeId(id.replace('tamil:', ''));
    const channel = await getChannelByUrl(streamUrl);

    const meta = {
      id: id,
      type: 'tv',
      name: channel ? (channel.displayName || channel.name) : 'Live Channel',
      poster: config.ENABLE_LOGOS && channel?.logo ? channel.logo : undefined,
      posterShape: 'square',
      background: config.ENABLE_LOGOS && channel?.logo ? channel.logo : undefined,
      description: channel 
        ? `${getCategoryIcon(channel.category)} ${channel.category} • ${channel.quality}\n\n${channel.group || 'Tamil Live TV'}`
        : 'Live TV Channel',
      releaseInfo: 'LIVE',
      runtime: 'LIVE',
      genres: channel ? [channel.category] : ['Entertainment'],
      videos: [{
        id: id,
        title: '🔴 Watch Live',
        released: new Date().toISOString(),
        available: true
      }],
      behaviorHints: {
        defaultVideoId: id,
        hasScheduledVideos: false
      }
    };

    // Cache meta
    metaCache.set(id, meta);

    return { meta };

  } catch (err) {
    error('[META] Error:', err.message);
    return { meta: null };
  }
});

// ==========================================
// STREAM HANDLER - DIRECT EXTRACTION
// ==========================================
builder.defineStreamHandler(async ({ type, id }) => {
  debug(`[STREAM] type=${type}, id=${id}`);
  
  if (type !== 'tv' || !id.startsWith('tamil:')) {
    return { streams: [] };
  }

  try {
    const playlistUrl = decodeId(id.replace('tamil:', ''));
    
    // Check cache
    const cached = streamCache.get(playlistUrl);
    if (cached) {
      log(`[STREAM] ⚡ Cache hit: ${cached.substring(0, 50)}...`);
      return {
        streams: [{
          url: cached,
          title: '🔴 Live Stream',
          name: config.APP_NAME,
          behaviorHints: {
            notWebReady: true
          }
        }]
      };
    }

    log(`[STREAM] Fetching: ${playlistUrl}`);

    // Fetch the play.m3u8 playlist
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.REQUEST_TIMEOUT);

    const response = await fetch(playlistUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36',
        'Accept': '*/*',
        'Referer': 'https://freelivtvstrshare.vvishwas042.workers.dev/'
      }
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Playlist fetch failed: ${response.status}`);
    }

    const m3u8Content = await response.text();
    log(`[STREAM] Playlist fetched (${m3u8Content.length} bytes)`);

    // Extract the real stream URL
    const realStreamUrl = extractRealStreamUrl(m3u8Content, playlistUrl);

    if (!realStreamUrl) {
      log('[STREAM] No real URL found, using original');
      return {
        streams: [{
          url: playlistUrl,
          title: '🔴 Live Stream',
          name: config.APP_NAME,
          behaviorHints: { notWebReady: true }
        }]
      };
    }

    log(`[STREAM] ✅ Real URL: ${realStreamUrl.substring(0, 60)}...`);

    // Cache the extracted URL
    streamCache.set(playlistUrl, realStreamUrl);

    return {
      streams: [{
        url: realStreamUrl,
        title: '🔴 Live Stream',
        name: config.APP_NAME,
        behaviorHints: {
          notWebReady: true
        }
      }]
    };

  } catch (err) {
    error('[STREAM] Error:', err.message);
    
    // Fallback to original URL
    const playlistUrl = decodeId(id.replace('tamil:', ''));
    return {
      streams: [{
        url: playlistUrl,
        title: '🔴 Live Stream (Fallback)',
        name: config.APP_NAME,
        behaviorHints: { notWebReady: true }
      }]
    };
  }
});

// ==========================================
// EXTRACT REAL STREAM URL
// ==========================================
function extractRealStreamUrl(m3u8Content, baseUrl) {
  try {
    const lines = m3u8Content.split('\n').map(line => line.trim()).filter(Boolean);
    
    // Check if it's a master playlist (has #EXT-X-STREAM-INF)
    const isMasterPlaylist = lines.some(line => line.includes('#EXT-X-STREAM-INF'));
    
    if (isMasterPlaylist) {
      debug('[EXTRACT] Master playlist detected');
      
      // Find all variants
      const variants = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('#EXT-X-STREAM-INF')) {
          const bandwidthMatch = lines[i].match(/BANDWIDTH=(\d+)/);
          const resolutionMatch = lines[i].match(/RESOLUTION=(\d+x\d+)/);
          const bandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1]) : 0;
          const resolution = resolutionMatch ? resolutionMatch[1] : 'unknown';
          
          // Next non-comment line should be the URL
          for (let j = i + 1; j < lines.length; j++) {
            if (!lines[j].startsWith('#')) {
              variants.push({
                url: lines[j],
                bandwidth,
                resolution
              });
              break;
            }
          }
        }
      }
      
      if (variants.length === 0) {
        debug('[EXTRACT] No variants found');
        return null;
      }
      
      // Sort by bandwidth (highest first for quality)
      variants.sort((a, b) => b.bandwidth - a.bandwidth);
      
      // Select middle quality for Samsung TV stability
      const selectedIndex = Math.floor(variants.length / 2);
      const selected = variants[selectedIndex];
      
      debug(`[EXTRACT] Selected: ${selected.resolution} (${selected.bandwidth} bps)`);
      
      // Make absolute URL
      let variantUrl = selected.url;
      if (!variantUrl.startsWith('http')) {
        const base = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
        variantUrl = base + variantUrl;
      }
      
      return variantUrl;
      
    } else {
      // Media playlist - find stream URL
      debug('[EXTRACT] Media playlist detected');
      
      for (const line of lines) {
        // Skip comments
        if (line.startsWith('#')) continue;
        
        // Found a URL
        if (line.includes('.ts') || line.includes('.m4s') || line.includes('.m3u8')) {
          let url = line;
          
          if (!url.startsWith('http')) {
            const base = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
            url = base + line;
          }
          
          debug(`[EXTRACT] Found URL: ${url.substring(0, 50)}...`);
          return url;
        }
      }
      
      // No segment found, return null to use original
      debug('[EXTRACT] No segments found');
      return null;
    }
    
  } catch (err) {
    error('[EXTRACT] Error:', err.message);
    return null;
  }
}

module.exports = builder.getInterface();