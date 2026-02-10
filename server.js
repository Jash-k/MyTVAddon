import express from "express";
import { loadChannels } from "./m3u.js";

const app = express();
const PORT = process.env.PORT || 3000;

const ADDON_ID = "org.mytv.stremio";
const ADDON_NAME = "MyTV Stremio Addon";
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

/* ========= MANIFEST ========= */
app.get("/manifest.json", (req, res) => {
  res.json({
    id: ADDON_ID,
    version: "1.0.0",
    name: ADDON_NAME,
    description: "Tamil IPTV addon for Stremio",
    resources: ["catalog", "streams"],
    types: ["tv"],
    catalogs: [
      {
        type: "tv",
        id: "tamil",
        name: "FREE LIV TV || TAMIL"
      }
    ],
    idPrefixes: ["tamil"]
  });
});

/* ========= CATALOG ========= */
app.get("/catalog/tv/tamil.json", async (req, res) => {
  const channels = await loadChannels();

  const metas = channels.map((c, i) => ({
    id: `tamil:${i}`,
    type: "tv",
    name: c.name,
    poster: c.logo
  }));

  res.json({ metas });
});

/* ========= STREAM RESOLVER ========= */
app.get("/streams/tv/:id.json", async (req, res) => {
  const index = parseInt(req.params.id.split(":")[1], 10);
  const channels = await loadChannels();
  const channel = channels[index];

  if (!channel) return res.json({ streams: [] });

  res.json({
    streams: [
      {
        name: ADDON_NAME,
        title: channel.name,
        url: channel.url,
        behaviorHints: {
          notWebReady: true
        }
      }
    ]
  });
});

/* ========= HEALTH ========= */
app.get("/", (req, res) => {
  res.send("MyTV Stremio Addon is running");
});

app.listen(PORT, () => {
  console.log(`Addon running on port ${PORT}`);
});
