// line in bio: charts made of text, for a bio or a post.
//
// GET /api/github/<user>   a year of daily contributions from GitHub's public graph
// GET /api/gt/<path>       GeckoTerminal's data (via CoinGecko with the CG_PRO_KEY secret), cached at the edge:
//                          the fallback when a visitor's own lookups are rate-limited
// GET /api/example         @taylor_'s live bio, the example under the tool (from fxtwitter, cached for half an hour)
//
// Browsers can't read GitHub's graph from another site, so it comes through here, cached at the edge for an hour.
// Coins go straight from the page to GeckoTerminal; this Worker only steps in when that's refused.

import { github } from "../../public/lib/sources.js";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const gh = url.pathname.match(/^\/api\/github\/([^/]+)$/);
    if (gh) {
      try {
        return json(await github(decodeURIComponent(gh[1])), 3600);
      } catch (e) {
        return json({ error: e.status ? e.message : "Something broke. Try again." }, 0, e.status || 500);
      }
    }
    if (url.pathname.startsWith("/api/gt/")) return geckoTerminal(url, env);
    if (url.pathname === "/api/example") return example();
    if (url.pathname.startsWith("/api/")) return json({ error: "Not found." }, 0, 404);
    return env.ASSETS.fetch(req);
  },
};

// Only the two reads the page makes, so this can't be used as an open proxy
const GT_PATH = /^\/(search\/pools|networks\/[a-z0-9_-]+\/pools\/0x[0-9a-fA-F]{40,64}\/ohlcv\/(minute|hour|day))$/;
async function geckoTerminal(url, env) {
  const path = url.pathname.slice("/api/gt".length);
  if (!GT_PATH.test(path)) return json({ error: "Not found." }, 0, 404);
  const ttl = path.startsWith("/search") ? 3600 : path.endsWith("/minute") ? 60 : path.endsWith("/hour") ? 300 : 1800;
  // GeckoTerminal turns away Cloudflare's shared addresses, so with a key the Worker asks CoinGecko's copy of the same data.
  // The key rides in a header, never the URL, so it stays out of cache keys and logs.
  const [base, headers] = env.CG_PRO_KEY
    ? ["https://pro-api.coingecko.com/api/v3/onchain", { accept: "application/json", "x-cg-pro-api-key": env.CG_PRO_KEY }]
    : ["https://api.geckoterminal.com/api/v2", { accept: "application/json" }];
  const r = await fetch(`${base}${path}${url.search}`, { headers, cf: { cacheTtl: ttl, cacheEverything: true } });
  return new Response(r.body, { status: r.status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": r.ok ? `public, max-age=${ttl}` : "no-store" } });
}

// The proof under the tool: a real bio this repo keeps updated
async function example() {
  const r = await fetch("https://api.fxtwitter.com/taylor_", { headers: { "user-agent": "line-in-bio" }, cf: { cacheTtl: 1800, cacheEverything: true } }).catch(() => null);
  const u = r?.ok ? (await r.json().catch(() => ({}))).user : null;
  if (!u?.description) return json({ error: "Couldn't read the example.", upstream: r?.status ?? "no answer" }, 0, 502);
  return json({ name: u.name, handle: u.screen_name, avatar: u.avatar_url?.replace("_normal", "_200x200"), bio: u.description, url: `https://x.com/${u.screen_name}` }, 1800);
}

const json = (body, maxAge, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store" },
  });
