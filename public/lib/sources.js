// line in bio: where the numbers come from. Shared by the site, its Worker, and bio.mjs.
//
// github() reads GitHub's public contribution graph. Browsers can't fetch it from another site,
// so the site calls it through the Worker; bio.mjs calls it directly.
// coin() asks GeckoTerminal (and DexScreener for missing art) straight from wherever it runs,
// so every visitor uses their own free allowance of about 30 calls a minute.

const fail = (status, message) => Object.assign(new Error(message), { status });

export async function github(user) {
  const handle = String(user).trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9-]{1,39}$/.test(handle)) throw fail(400, "That isn't a GitHub handle.");
  const r = await fetch(`https://github.com/users/${handle}/contributions`, {
    headers: { "user-agent": "line-in-bio" },
    cf: { cacheTtl: 3600, cacheEverything: true },
  }).catch(() => null);
  if (r?.status === 404) throw fail(404, `No GitHub user named ${handle}.`);
  if (!r?.ok) throw fail(502, "GitHub didn't answer. Try again in a minute.");
  const html = await r.text();

  // Each day is a cell with an id and a date; its count lives in a tooltip that points at that id.
  const dates = {};
  for (const [cell] of html.matchAll(/<td\b[^>]*\bdata-date="[^"]+"[^>]*>/g)) {
    const date = cell.match(/data-date="(\d{4}-\d{2}-\d{2})"/)?.[1], id = cell.match(/\bid="([^"]+)"/)?.[1];
    if (date && id) dates[id] = date;
  }
  const days = [];
  for (const [, id, text] of html.matchAll(/<tool-tip\b[^>]*\bfor="([^"]+)"[^>]*>([^<]*)</g)) {
    if (!dates[id]) continue;
    const n = text.trim().match(/^([\d,]+) contribution/);
    days.push([dates[id], n ? +n[1].replace(/,/g, "") : 0]);
  }
  if (!days.length) throw fail(502, "GitHub's graph came back empty. Try again later.");
  days.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return { src: "github", user: handle, avatar: `https://github.com/${handle}.png?size=96`, days };
}

const GT = "https://api.geckoterminal.com/api/v2";
// range: [timeframe, aggregate, candles, days shown]. 7D and 30D share one hourly fetch.
const HISTORY = { "1d": ["minute", 15, 96, 1], "7d": ["hour", 1, 720, 7], "30d": ["hour", 1, 720, 30], "90d": ["day", 1, 90, 90] };
const coins = new Map(); // each coin is found once; each history is fetched once and every range reuses it

// The site points this at its Worker, which can still answer from Cloudflare's cache when GeckoTerminal says slow down
let PROXY = null;
export function useProxy(base) { PROXY = base; }

// Answers are kept in the browser for a while, so reloads and range changes don't spend lookups
const store = (() => { try { return globalThis.localStorage ?? null; } catch { return null; } })();
const keepFor = (path) => (path.startsWith("/search") ? 86400 : path.includes("/ohlcv/minute") ? 120 : path.includes("/ohlcv/hour") ? 600 : 3600); // seconds

async function gt(path) {
  const key = `gt:${path}`, now = Date.now() / 1000;
  try { const hit = JSON.parse(store?.getItem(key) || "null"); if (hit && now - hit.t < keepFor(path)) return hit.v; } catch {}
  let r = await fetch(GT + path, { headers: { accept: "application/json" } }).catch(() => null);
  // GeckoTerminal's rate-limit answer has no CORS header, so a browser sees it as a failed fetch. Ask the Worker instead.
  if ((!r || r.status === 429) && PROXY) r = await fetch(PROXY + path).catch(() => null);
  if (!r || r.status === 429) throw fail(429, "Too many coin lookups for a minute. Try again shortly.");
  if (!r.ok) throw fail(502, "The price feed didn't answer. Try again in a minute.");
  const v = await r.json();
  try { store?.setItem(key, JSON.stringify({ t: now, v })); }
  catch { try { for (const k of Object.keys(store)) if (k.startsWith("gt:")) store.removeItem(k); } catch {} } // full: start over
  return v;
}

// GeckoTerminal's names and art lag behind (IMD still shows there as "Vibe Coins"); DexScreener's are current
async function dexToken(address) {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
    const pair = ((await r.json()).pairs || [])
      .filter((p) => p.baseToken?.address?.toLowerCase() === address.toLowerCase())
      .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
    if (!pair) return null;
    return { name: pair.baseToken.name, symbol: pair.baseToken.symbol, image: pair.info?.imageUrl?.replace(/width=\d+&height=\d+/, "width=128&height=128") || null };
  } catch { return null; }
}

// Ether trades as WETH, and its deepest pools are on Ethereum, not wherever an "ETH" ticker ranks first
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const ALIASES = { eth: WETH };

async function findCoin(want) {
  const isAddress = /^0x[0-9a-fA-F]{40}$/.test(want) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(want);
  const found = await gt(`/search/pools?query=${encodeURIComponent(want)}&include=base_token`);
  const tokens = Object.fromEntries((found.included || []).map((t) => [t.id, t.attributes]));
  const pool = (found.data || [])
    .map((p) => ({ network: p.id.slice(0, p.id.indexOf("_")), address: p.attributes.address, liquidity: +p.attributes.reserve_in_usd || 0, token: tokens[p.relationships?.base_token?.data?.id] }))
    .filter((p) => p.token && (isAddress ? p.token.address.toLowerCase() === want.toLowerCase() : p.token.symbol.toLowerCase() === want.toLowerCase()))
    .sort((a, b) => b.liquidity - a.liquidity)[0];
  if (!pool) throw fail(404, isAddress ? "No trading pool for that address." : `No coin with the ticker ${want.toUpperCase()}.`);
  const dex = await dexToken(pool.token.address);
  const art = pool.token.image_url && !/missing/.test(pool.token.image_url) ? pool.token.image_url : dex?.image ?? null;
  const [name, symbol] = pool.token.address.toLowerCase() === WETH ? ["Ether", "ETH"] : [dex?.name || pool.token.name, dex?.symbol || pool.token.symbol];
  return { name, symbol, image: art, network: pool.network, pool: pool.address, candles: {} };
}

export async function coin(q, range) {
  const typed = String(q).trim().replace(/^\$/, "");
  const want = ALIASES[typed.toLowerCase()] || typed;
  if (!want) throw fail(400, "Paste a coin address or a ticker.");
  if (!HISTORY[range]) throw fail(400, "Unknown range.");
  const key = want.toLowerCase();
  if (!coins.has(key)) coins.set(key, findCoin(want).catch((e) => { coins.delete(key); throw e; }));
  const c = await coins.get(key);
  const [timeframe, aggregate, limit, days] = HISTORY[range], k = timeframe + aggregate;
  if (!c.candles[k]) c.candles[k] = gt(`/networks/${c.network}/pools/${c.pool}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=${limit}&currency=usd&token=base`)
    .then((h) => (h.data?.attributes?.ohlcv_list || []).slice().reverse()) // oldest first
    .catch((e) => { delete c.candles[k]; throw e; });
  const since = Date.now() / 1000 - days * 86400;
  const candles = (await c.candles[k]).filter(([t]) => t >= since);
  if (candles.length < 2) throw fail(404, "Not enough trading history yet.");
  return {
    src: "coin", name: c.name, symbol: c.symbol, image: c.image, network: c.network,
    points: candles.map(([t, , , , close]) => [t, close]),
    change: candles.at(-1)[4] / candles[0][1] - 1,
  };
}
