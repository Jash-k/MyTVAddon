const fetch = require('node-fetch');
const config = require('./config');
const { channelCache } = require('./cache');
const { log, error, debug, cleanChannelName } = require('./utils');

async function loadChannels() {
  // Check cache first
  const cached = channelCache.get('channels');
  if (cached) {
    debug(`[M3U] Returning ${cached.length} cached channels`);
    return cached;
  }

  log('[M3U] Fetching channels from playlist...');
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.REQUEST_TIMEOUT);

    const response = await fetch(config.PLAYLIST_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; StremioAddon/2.0)',
        'Accept': '*/*'
      }
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    const lines = text.split('\n');
    const channels = [];

    let current = null;

    for (const line of lines) {
      if (line.startsWith('#EXTINF')) {
        const tvgNameMatch = line.match(/tvg-name="([^"]+)"/);
        const groupTitleMatch = line.match(/group-title="([^"]+)"/);
        const tvgLogoMatch = line.match(/tvg-logo="([^"]+)"/);
        const tvgIdMatch = line.match(/tvg-id="([^"]+)"/);

        if (!tvgNameMatch) {
          current = null;
          continue;
        }

        const tvgName = tvgNameMatch[1].trim();
        const groupTitle = groupTitleMatch ? groupTitleMatch[1].trim() : '';
        const tvgLogo = tvgLogoMatch ? tvgLogoMatch[1].trim() : '';
        const tvgId = tvgIdMatch ? tvgIdMatch[1].trim() : '';

        // Filter conditions
        const isTMChannel = tvgName.startsWith('TM:');
        const isTamilChannel = tvgName.toLowerCase().startsWith('tamil');
        const isFreelivTamilGroup = groupTitle.startsWith('FREE LIV TV || TAMIL');
        const isCricketGroup = groupTitle.includes('FREE LIV TV || CRICKET');
        const is247Channel = tvgName.startsWith('24/7:');

        if (!isTMChannel && !isTamilChannel && !isFreelivTamilGroup && !isCricketGroup && !is247Channel) {
          current = null;
          continue;
        }

        // Determine category
        let category = 'Entertainment';
        
        if (groupTitle.includes('CRICKET') || /cricket/i.test(tvgName) || tvgName.startsWith('CRIC ||')) {
          category = 'Cricket';
        } else if (groupTitle.includes('MOVIES') || /movie/i.test(tvgName)) {
          category = 'Movies';
        } else if (groupTitle.includes('NEWS') || /news/i.test(tvgName)) {
          category = 'News';
        } else if (groupTitle.includes('MUSIC') || /music/i.test(tvgName)) {
          category = 'Music';
        } else if (groupTitle.includes('KIDS') || /kids|cartoon/i.test(tvgName)) {
          category = 'Kids';
        } else if (/devotional|religious|god/i.test(tvgName)) {
          category = 'Devotional';
        }

        // Determine quality
        let quality = 'SD';
        if (/4k|⁴ᵏ|uhd/i.test(tvgName)) {
          quality = '4K';
        } else if (/fhd|ᶠᴴᴰ|1080/i.test(tvgName)) {
          quality = 'FHD';
        } else if (/hd|ᴴᴰ|720/i.test(tvgName)) {
          quality = 'HD';
        }

        current = {
          name: tvgName,
          displayName: cleanChannelName(tvgName),
          category,
          quality,
          logo: tvgLogo || null,
          tvgId: tvgId || null,
          group: groupTitle
        };

      } else if (line.startsWith('http') && current) {
        channels.push({
          ...current,
          url: line.trim()
        });

        current = null;

        if (channels.length >= config.MAX_CHANNELS) break;
      }
    }

    log(`[M3U] Loaded ${channels.length} channels`);
    
    // Log category breakdown
    const categories = {};
    channels.forEach(ch => {
      categories[ch.category] = (categories[ch.category] || 0) + 1;
    });
    debug('[M3U] Categories:', categories);

    // Cache channels
    channelCache.set('channels', channels);

    return channels;

  } catch (err) {
    error('[M3U] Failed to load channels:', err.message);
    
    // Return cached even if expired
    const staleCache = channelCache.cache.get('channels');
    if (staleCache) {
      log('[M3U] Returning stale cache due to error');
      return staleCache.value;
    }
    
    return [];
  }
}

// Get channels by category
async function getChannelsByCategory(category) {
  const channels = await loadChannels();
  
  if (!category || category === 'all') {
    return channels;
  }
  
  return channels.filter(ch => 
    ch.category.toLowerCase() === category.toLowerCase()
  );
}

// Get channel by URL
async function getChannelByUrl(url) {
  const channels = await loadChannels();
  return channels.find(ch => ch.url === url);
}

// Get unique categories
async function getCategories() {
  const channels = await loadChannels();
  const categories = new Map();
  
  channels.forEach(ch => {
    if (!categories.has(ch.category)) {
      categories.set(ch.category, 0);
    }
    categories.set(ch.category, categories.get(ch.category) + 1);
  });
  
  return Array.from(categories.entries()).map(([name, count]) => ({
    name,
    count
  }));
}

module.exports = {
  loadChannels,
  getChannelsByCategory,
  getChannelByUrl,
  getCategories
};