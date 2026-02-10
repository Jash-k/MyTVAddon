import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   CONFIG
========================= */

const M3U_URL =
  "https://raw.githubusercontent.com/Jash-k/m3u/refs/heads/main/starshare.m3u";

const ADDON_ID = "org.freelivtv.tamil";
const ADDON_NAME = "FREE LIV TV (Tamil)";

/* =========================
   GROUP FILTER
========================= */

const ALLOWED_GROUPS = {
  "FREE LIV TV || TAMIL | NEWS": "tamil_news",
  "FREE LIV TV || TAMIL | ENTERTAINMENT": "tamil_entertainment",
  "FREE LIV TV || TAMIL | MOVIES": "tamil_movies"
};

/* =========================
   M3U PARSER
========================= */

async function parseM3U() {
  const res = await fetch(M3U_URL, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });

  const text = await res.text();
  const lines = text.split("\n");

  const data = {
    tamil_news: [],
    tamil_entertainment: [],
    tamil_movies: []
  };

  let current = null;

  for (const line of lines) {
    const l = line.trim();

    if (l.startsWith("#EXTINF")) {
      const name = l.split(",").pop()?.trim() || "Channel";
      const logo = l.match(/tvg-logo="([^"]+)"/)?.[1];
      const group = l.match(/group-title="([^"]+)"/)?.[1];

      if (ALLOWED_GROUPS[group]) {
        current = {
          name,
          logo,
          group: ALLOWED_GROUPS[group]
        };
      } else {
        current = null;
      }

    } else if (l.startsWith("http") && current) {
      current.url = l;
      data[current.group].push(current);
      current = null;
    }
  }

  return data;
}

/* =========================
   STREAM RESOLVER
========================= */

async function resolveStream(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "*/*"
    }
  });

  const text = await res.text();

  // HLS wrapper
  if (text.includes("#EXTM3U")) {
    for (const line of text.split("\n")) {
      const l = line.trim();
      if (l.startsWith("http")) {
        return l;
      }
    }
  }

  // DASH fallback
  if (text.includes("<MPD")) {
    const match = text.match(/https?:\/\/[^"'<>]+\.mpd[^"'<>]*/);
    if (match) return match[0];
  }

  // Direct stream fallback
  if (url.endsWith(".m3u8") || url.endsWith(".mpd")) {
    return url;
  }

  return null;
}

/* =========================
   MANIFEST
========================= */

app.get("/manifest.json", (req, res) => {
  res.json({
    id: ADDON_ID,
    version: "1.0.0",
    name: ADDON_NAME,
    description: "Tamil Live TV – News, Entertainment & Movies",
    resources: ["catalog", "streams"],
    types: ["tv"],
    catalogs: [
      { type: "tv", id: "tamil_news", name: "Tamil | News" },
      { type: "tv", id: "tamil_entertainment", name: "Tamil | Entertainment" },
      { type: "tv", id: "tamil_movies", name: "Tamil | Movies" }
    ],
    idPrefixes: ["tamil"]
  });
});

/* =========================
   CATALOG
========================= */

app.get("/catalog/tv/:group.json", async (req, res) => {
  const data = await parseM3U();
  const channels = data[req.params.group] || [];

  const metas = channels.map((c, i) => ({
    id: `tamil:${req.params.group}:${i}`,
    type: "tv",
    name: c.name,
    poster: c.logo
      ? `${c.logo}?v=${Date.now()}` // logo refresh
      : undefined
  }));

  res.json({ metas });
});

/* =========================
   STREAMS
========================= */

app.get("/streams/tv/:id.json", async (req, res) => {
  const [, group, index] = req.params.id.split(":");
  const data = await parseM3U();

  const channel = data[group]?.[Number(index)];
  if (!channel) return res.json({ streams: [] });

  const finalUrl = await resolveStream(channel.url);
  if (!finalUrl) return res.json({ streams: [] });

  res.json({
    streams: [
      {
        title: channel.name,
        url: finalUrl
      }
    ]
  });
});

/* =========================
   HEALTH
========================= */

app.get("/", (req, res) => {
  res.send("FREE LIV TV Stremio addon running");
});

app.listen(PORT, () => {
  console.log(`Addon running on port ${PORT}`);
});
