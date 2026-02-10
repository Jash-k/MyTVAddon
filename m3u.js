import fetch from "node-fetch";

const PLAYLIST_URL =
  "https://raw.githubusercontent.com/amit-654584/jtv/main/jtv.m3u";

export async function loadChannels() {
  const res = await fetch(PLAYLIST_URL);
  const text = await res.text();

  const lines = text.split("\n");
  const channels = [];

  let current = null;

  for (const line of lines) {
    if (line.startsWith("#EXTINF")) {
      const name = line.split(",").pop().trim();
      const logo =
        line.match(/tvg-logo="([^"]+)"/)?.[1] ||
        "https://i.ibb.co/DPd27cCK/photo-2024-12-29-23-10-30.jpg";

      let group = "TAMIL | ENTERTAINMENT";

      if (/news/i.test(name)) group = "TAMIL | NEWS";
      if (/movie/i.test(name)) group = "TAMIL | MOVIES";

      current = { name, logo, group };
    } else if (line.startsWith("http")) {
      if (current) {
        current.url = line.trim();
        channels.push(current);
        current = null;
      }
    }
  }

  return channels;
}
