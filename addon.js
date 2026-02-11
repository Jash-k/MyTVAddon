const { addonBuilder } = require('stremio-addon-sdk');
const { loadChannels } = require('./m3u');

// Helper functions
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

// Manifest
const manifest = {
  id: "org.freelivtv.tamil",
  version: "1.0.0",
  name: "FREE LIV TV",
  description: "Tamil Live TV - 200+ Channels",
  types: ["tv", "channel"],  // Added "channel" type
  catalogs: [
    {
      type: "tv",
      id: "tamil-all",
      name: "All Channels",
      extra: [{ name: "genre" }]
    },
    {
      type: "tv",
      id: "tamil-cricket",
      name: "Cricket",
      extra: [{ name: "genre" }]
    },
    {
      type: "tv",
      id: "tamil-movies", 
      name: "Movies",
      extra: [{ name: "genre" }]
    },
    {
      type: "tv",
      id: "tamil-news",
      name: "News",
      extra: [{ name: "genre" }]
    }
  ],
  resources: ["catalog", "meta", "stream"],  // Added "meta" resource
  idPrefixes: ["tamil:"],
  behaviorHints: {
    adult: false,
    p2p: false
  }
};

const builder = new addonBuilder(manifest);

// Catalog Handler
builder.defineCatalogHandler(async ({ type, id, extra }) => {
  console.log(`[CATALOG] Request: type=${type}, id=${id}`);
  
  if (type !== "tv") {
    return { metas: [] };
  }

  try {
    const allChannels = await loadChannels();
    let channels = allChannels;

    // Filter by catalog
    if (id === "tamil-cricket") {
      channels = allChannels.filter(ch => ch.category === "Cricket");
    } else if (id === "tamil-movies") {
      channels = allChannels.filter(ch => ch.category === "Movies");
    } else if (id === "tamil-news") {
      channels = allChannels.filter(ch => ch.category === "News");
    }

    const metas = channels.map(ch => ({
      id: "tamil:" + encodeId(ch.url),
      type: "tv",
      name: ch.name,
      
      // IMPORTANT: These fields make the dialog appear
      poster: ch.logo || undefined,
      posterShape: "square",
      background: ch.logo || undefined,
      description: `${ch.category || "Live TV"} • ${ch.group || "Tamil Channel"}`,
      
      // This tells Stremio it's a live channel
      genres: [ch.category || "Entertainment"],
      releaseInfo: "LIVE",  // Important for live channels
      
      // Additional metadata
      links: [],
      trailers: [],
      runtime: "LIVE",
      
      // Behavior hints for TV
      behaviorHints: {
        defaultVideoId: "tamil:" + encodeId(ch.url),  // Important!
        hasScheduledVideos: false
      }
    }));

    console.log(`[CATALOG] Returning ${metas.length} items for ${id}`);
    
    return { metas };

  } catch (error) {
    console.error('[CATALOG] Error:', error);
    return { metas: [] };
  }
});

// Meta Handler (IMPORTANT - This creates the dialog!)
builder.defineMetaHandler(async ({ type, id }) => {
  console.log(`[META] Request: type=${type}, id=${id}`);
  
  if (type !== "tv" || !id.startsWith("tamil:")) {
    return { meta: null };
  }

  try {
    const channels = await loadChannels();
    const streamUrl = decodeId(id.replace("tamil:", ""));
    
    // Find the channel
    const channel = channels.find(ch => 
      encodeId(ch.url) === id.replace("tamil:", "")
    );

    if (!channel) {
      // Create basic meta if channel not found
      return {
        meta: {
          id: id,
          type: "tv",
          name: "Live Channel",
          releaseInfo: "LIVE",
          description: "Live TV Channel",
          videos: [
            {
              id: id,
              title: "Watch Live",
              released: new Date().toISOString(),
              streams: [{ url: streamUrl }]
            }
          ]
        }
      };
    }

    // Return full metadata
    return {
      meta: {
        id: id,
        type: "tv",
        name: channel.name,
        poster: channel.logo || undefined,
        posterShape: "square",
        background: channel.logo || undefined,
        description: `${channel.category} • ${channel.group}\n\nLive TV Channel`,
        releaseInfo: "LIVE",
        runtime: "LIVE",
        genres: [channel.category || "Entertainment"],
        
        // IMPORTANT: videos array creates the "Play Now" button
        videos: [
          {
            id: id,
            title: "🔴 Watch Live",
            released: new Date().toISOString(),
            overview: "Click to watch live stream",
            thumbnail: channel.logo || undefined,
            streams: [{ url: streamUrl }],
            available: true
          }
        ],
        
        // Behavior hints
        behaviorHints: {
          defaultVideoId: id,
          hasScheduledVideos: false,
          isLive: true
        }
      }
    };

  } catch (error) {
    console.error('[META] Error:', error);
    return { meta: null };
  }
});

// Stream Handler
builder.defineStreamHandler(async ({ type, id }) => {
  console.log(`[STREAM] Request: type=${type}, id=${id}`);
  
  if (type !== "tv" || !id.startsWith("tamil:")) {
    return { streams: [] };
  }

  try {
    const streamUrl = decodeId(id.replace("tamil:", ""));
    
    console.log(`[STREAM] URL: ${streamUrl}`);

    // Return streams
    return {
      streams: [
        {
          url: streamUrl,
          title: "Live Stream",
          name: "FREE LIV TV",
          behaviorHints: {
            notWebReady: true,
            isLive: true,
            bingeGroup: "tamil-live"
          }
        }
      ]
    };

  } catch (error) {
    console.error('[STREAM] Error:', error);
    return { streams: [] };
  }
});

module.exports = builder.getInterface();