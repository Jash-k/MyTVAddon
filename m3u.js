import fetch from "node-fetch";

const PLAYLIST_URL =
  "https://raw.githubusercontent.com/Jash-k/MyTVStremioAddon/refs/heads/main/starshare.m3u";

// 🔒 HARD LIMIT - Updated to 180
const MAX_CHANNELS = 180;

export async function loadChannels() {
  const res = await fetch(PLAYLIST_URL, { timeout: 15000 });
  const text = await res.text();

  const lines = text.split("\n");
  const channels = [];

  let current = null;

  for (const line of lines) {
    // 1️⃣ Parse EXTINF
    if (line.startsWith("#EXTINF")) {
      const tvgNameMatch = line.match(/tvg-name="([^"]+)"/);
      const groupTitleMatch = line.match(/group-title="([^"]+)"/);

      // ❌ Skip if no tvg-name
      if (!tvgNameMatch) {
        current = null;
        continue;
      }

      const tvgName = tvgNameMatch[1].trim();
      const groupTitle = groupTitleMatch ? groupTitleMatch[1].trim() : "";

      // ✅ Allow channels that either:
      // 1. Have tvg-name starting with "TM:"
      // 2. OR belong to any "FREE LIV TV || TAMIL" group
      const isTMChannel = tvgName.startsWith("TM:");
      const isFreelivTamilGroup = groupTitle.startsWith("FREE LIV TV || TAMIL");

      if (!isTMChannel && !isFreelivTamilGroup) {
        current = null;
        continue;
      }

      // 🔹 Category logic - extract from group-title
      let category = "ENTERTAINMENT";
      
      if (groupTitle.includes("MOVIES") || /movie/i.test(tvgName)) {
        category = "MOVIES";
      } else if (groupTitle.includes("NEWS") || /news/i.test(tvgName)) {
        category = "NEWS";
      } else if (groupTitle.includes("ENTERTAINMENT")) {
        category = "ENTERTAINMENT";
      } else if (groupTitle.includes("TAMIL")) {
        category = "TAMIL";
      }

      current = {
        name: tvgName,
        category,
        group: groupTitle
      };
    }

    // 2️⃣ Parse URL
    else if (line.startsWith("http") && current) {
      channels.push({
        name: current.name,
        url: line.trim(),
        category: current.category,
        group: current.group
      });

      current = null;

      // 🔒 Stop at 180
      if (channels.length >= MAX_CHANNELS) break;
    }
  }

  return channels;
}