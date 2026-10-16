#!/usr/bin/env node
// Puts a line in bio chart in your X bio. `node bio.mjs` prints it; `node bio.mjs --live` posts it.
// Settings live in config.json. X keys come from the environment (your fork's Actions secrets).

import crypto from "node:crypto";
import fs from "node:fs";
import { RANGES, STYLES, WIDTH, render } from "./public/lib/chart.js";
import { coin, github, numbers, tokens } from "./public/lib/sources.js";

const config = JSON.parse(fs.readFileSync(new URL("./config.json", import.meta.url), "utf8"));
const live = process.argv.includes("--live");
const stop = (message) => { console.error(message); process.exit(1); };

const src = config.github ? "github" : config.tokens ? "tokens" : config.coin ? "coin" : config.numbers?.length ? "numbers"
  : stop('Put a GitHub handle in "github", a tokenmaxxing username in "tokens", or a coin in "coin" in config.json.');
const range = config.range || { github: "14d", tokens: "14d", coin: "7d", numbers: "all" }[src];
if (!RANGES[src].some(([k]) => k === range)) stop(`"range" can be ${RANGES[src].map(([k]) => k).join(", ")}.`);
const style = config.style || "bars";
if (!STYLES.includes(style)) stop(`"style" can be ${STYLES.join(", ")}.`);
const width = Math.min(WIDTH.max, Math.max(WIDTH.min, Math.round(config.width || WIDTH.start)));
const rows = Math.min(4, Math.max(1, Math.round(config.rows || 2)));

const data = src === "github" ? await github(config.github)
  : src === "tokens" ? await tokens(config.tokens)
  : src === "coin" ? await coin(config.coin, range)
  : numbers(config.numbers.join(" "));
const { chart, stat } = render(data, { range, style, width, rows, smooth: config.smooth !== false });

// Optional: when it last updated, after the chart's top line ("10/15 11am"), so people can see it's live
const lines = chart.split("\n");
if (config.stamp) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: config.timezone || "UTC", month: "numeric", day: "numeric", hour: "numeric", hourCycle: "h23" })
    .formatToParts(new Date()).filter((x) => x.type !== "literal").map((x) => [x.type, +x.value]));
  lines[0] += ` ${p.month}/${p.day} ${p.hour % 12 || 12}${p.hour < 12 ? "am" : "pm"}`;
}

const bio = [...lines, stat, config.caption].filter(Boolean).join("\n");
const length = [...bio].length;
console.log(`${bio}\n\n${length} of 160 characters`);
if (length > 160) stop("Too long for an X bio. Lower width or rows in config.json.");
if (!live) process.exit(0);

const keys = ["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_SECRET"].map((k) => process.env[k]);
if (keys.some((k) => !k)) {
  console.log("No X keys yet, so nothing was posted. Add the four keys as Actions secrets (see the README).");
  process.exit(0);
}

// OAuth 1.0a signed POST to account/update_profile, the endpoint that edits a bio
const [consumerKey, consumerSecret, token, tokenSecret] = keys;
const url = "https://api.x.com/1.1/account/update_profile.json";
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
const oauth = {
  oauth_consumer_key: consumerKey,
  oauth_nonce: crypto.randomBytes(16).toString("hex"),
  oauth_signature_method: "HMAC-SHA1",
  oauth_timestamp: String(Math.floor(Date.now() / 1000)),
  oauth_token: token,
  oauth_version: "1.0",
};
const params = { ...oauth, description: bio };
const base = ["POST", enc(url), enc(Object.keys(params).sort().map((k) => `${enc(k)}=${enc(params[k])}`).join("&"))].join("&");
oauth.oauth_signature = crypto.createHmac("sha1", `${enc(consumerSecret)}&${enc(tokenSecret)}`).update(base).digest("base64");

const res = await fetch(url, {
  method: "POST",
  headers: {
    authorization: "OAuth " + Object.keys(oauth).sort().map((k) => `${enc(k)}="${enc(oauth[k])}"`).join(", "),
    "content-type": "application/x-www-form-urlencoded",
  },
  body: `description=${enc(bio)}`,
});
const out = await res.text();
if (!res.ok) stop(`X said no (${res.status}): ${out.slice(0, 300)}`);
console.log(JSON.parse(out).description === bio ? "Posted. Your bio matches." : "Posted, but X changed the text. Check your profile.");
