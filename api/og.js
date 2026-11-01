// Vercel serverless: fetch a link server-side and extract OpenGraph meta —
// thumbnail (og:image) + title (account/post name). Browsers can't do this
// directly (CORS), so we proxy it like the SMM endpoint.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const bodyText = Buffer.concat(chunks).toString("utf8");
  let url = "";
  try {
    const parsed = JSON.parse(bodyText || "{}");
    url = String(parsed.url || "").trim();
  } catch {
    // fall through, url stays empty
  }
  if (!/^https:\/\//i.test(url)) {
    res.status(400).json({ error: "Valid https URL chahiye" });
    return;
  }

  try {
    const upstream = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,*/*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    const html = await upstream.text();

    const pick = (prop) => {
      const m =
        html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, "i")) ??
        html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, "i"));
      return m ? m[1] : "";
    };

    const image = pick("image");
    const title = pick("title");
    const desc = pick("description");
    if (!image && !title) {
      res.status(200).json({ ok: false, error: "Preview nahi mila (private/login-required?)" });
      return;
    }
    res.status(200).json({ ok: true, image, title, desc });
  } catch (e) {
    res.status(502).json({ error: "Preview failed: " + (e instanceof Error ? e.message : String(e)) });
  }
}
