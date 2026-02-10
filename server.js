import express from "express";
import fetch from "node-fetch";
import { loadChannels } from "./m3u.js";

const app = express();
const PORT = process.env.PORT || 3000;

function encodeId(url) {
  return Buffer.from(url)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/* MANIFEST */
app.get("/manifest.json", (req, res) => {
  res.json({
    id: "org.mytv.stremio",
    version: "1.0.0",
    name: "FREE LIV TV",
    description: "Tamil Live TV",
    types: ["tv"],
    catalogs: [{
      type: "tv",
      id: "tamil",
      name: "Tamil Live TV"
    }],
    resources: ["catalog", "streams"]
  });
});

/* CATALOG */
app.get("/catalog/:type/:id.json", async (req, res) => {
  const channels = await loadChannels();

  res.json({
    metas: channels.map(ch => ({
      id: "tamil:" + encodeId(ch.url),
      type: "tv",
      name: ch.name,
      poster: "https://i.ibb.co/p4knk5y/images-4.png"
    }))
  });
});

/* STREAMS */
app.get("/streams/:type/:id.json", (req, res) => {
  try {
    const { id } = req.params;

    if (!id.startsWith("tamil:")) {
      return res.json({ streams: [] });
    }

    const base64url = id.replace("tamil:", "");

    let b64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";

    const streamUrl = Buffer.from(b64, "base64").toString("utf8");

    res.json({
      streams: [{
        name: "FREE LIV TV",
        title: "Live",
        url: streamUrl,
        behaviorHints: {
          notWebReady: true,
          isLive: true,
          hls: streamUrl.includes(".m3u8")
        }
      }]
    });
  } catch {
    res.json({ streams: [] });
  }
});

app.listen(PORT, () =>
  console.log("Addon running on port", PORT)
);
