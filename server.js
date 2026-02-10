import express from "express";
import { loadChannels } from "./m3u.js";

const app = express();
const PORT = process.env.PORT || 3000;

const ADDON_ID = "org.mytv.stremio";
const ADDON_NAME = "MyTV Stremio Addon";
const ADDON_VERSION = "1.0.0";

/* ================= MANIFEST ================= */
app.get("/manifest.json", (req, res) => {
  res.json({
    id: ADDON_ID,
    version: ADDON_VERSION,
    name: ADDON_NAME,
    description: "Production-ready IPTV addon for Stremio",
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

/* ================= CATALOG ================= */
app.get("/catalog/tv/tamil.json", async (req, res) => {
  try {
    const channels = await loadChannels();

    const metas = channels.map((c) => ({
      id: "tamil:" + Buffer.from(c.url).toString("base64"),
      type: "tv",
      name: c.name,
      poster: c.logo
    }));

    res.json({ metas });
  } catch {
    res.json({ metas: [] });
  }
});

/* ================= STREAMS ================= */
app.get("/streams/tv/:id.json", (req, res) => {
  try {
    const encoded = req.params.id.replace("tamil:", "");
    const streamUrl = Buffer.from(encoded, "base64").toString("utf8");

    if (!streamUrl.startsWith("http")) {
      return res.json({ streams: [] });
    }

    res.json({
      streams: [
        {
          name: ADDON_NAME,
          title: "Live",
          url: streamUrl,
          behaviorHints: {
            notWebReady: true,
            bingeGroup: "live"
          }
        }
      ]
    });
  } catch {
    res.json({ streams: [] });
  }
});

/* ================= HEALTH ================= */
app.get("/", (req, res) => {
  res.send("MyTVStremioAddon is running");
});

app.listen(PORT, () => {
  console.log(`MyTVStremioAddon running on port ${PORT}`);
});
