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
    const id = req.params.id;

    // ❌ Must start with tamil:
    if (!id.startsWith("tamil:")) {
      return res.json({ streams: [] });
    }

    // ✅ Decode base64 URL
    const base64 = id.replace("tamil:", "");
    const streamUrl = Buffer.from(base64, "base64").toString("utf8");

    // ❌ Safety check
    if (!streamUrl.startsWith("http")) {
      return res.json({ streams: [] });
    }

    // ✅ Return stream
    res.json({
      streams: [
        {
          name: "FREE LIV TV",
          title: "Live",
          url: streamUrl,
          behaviorHints: {
            notWebReady: true,
            bingeGroup: "live"
          }
        }
      ]
    });
  } catch (err) {
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
