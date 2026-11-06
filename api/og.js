// Vercel serverless: fetch a link server-side and extract OpenGraph meta —
// thumbnail (og:image) + title (account/post name). Browsers can't do this
// directly (CORS), so we proxy it like the SMM endpoint.

import { forwardFetch } from "../guard.mjs";

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
    // allowlist:false → OG preview may fetch arbitrary https URLs, but still gets
    // DNS/private-IP, redirect-revalidation, timeout and size-cap protection.
    const upstream = await forwardFetch(url, {
      method: "GET",
      allowlist: false,
      allowTruncate: true,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,*/*",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const html = upstream.body.toString("utf8");

    const unescape = (s) => {
      try {
        return s
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">");
      } catch {
        return s;
      }
    };

    const pick = (prop) => {
      const pats = [
        new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, "i"),
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, "i"),
      ];
      for (const p of pats) {
        const m = html.match(p);
        if (m && m[1]) return unescape(m[1]);
      }
      return "";
    };

    let image = pick("image");

    // Twitter / alternate image tags fallback
    if (!image) {
      const tw =
        html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ??
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
      image = tw ? unescape(tw[1]) : "";
    }
    if (!image) {
      const ls = html.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i);
      image = ls ? unescape(ls[1]) : "";
    }
    if (!image) {
      const ls2 = html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']image_src["']/i);
      image = ls2 ? unescape(ls2[1]) : "";
    }

    let title = pick("title");
    if (!title) {
      const twt = html.match(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i);
      title = twt ? unescape(twt[1]) : "";
    }
    if (!title) {
      const t = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      title = t ? unescape(t[1]).trim() : "";
    }

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
