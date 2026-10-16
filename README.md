# spark

Sparklines made of text, for your X bio or a post: GitHub activity, AI token usage, a coin's price, or your own numbers. Make one at **[spark.rhps.fun](https://spark.rhps.fun)**, or let this repo redraw it in your bio twice a day.

```
⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⣾⣷⡀⠀⣤⣤⡀⠀⠀⢀⣀⠀⠀⠀ 10/15 8pm
⣷⣶⣤⣀⣀⣀⣠⣶⣾⣿⣿⣿⣷⣾⣿⣿⣿⣦⣴⣿⣿⣷⣦⣀
539 contributions in 14D
github.com/gtmcknight
```

Each chart character is a braille pattern: a 2 by 4 grid of dots, so a line of text works like a tiny screen.

## Keep your bio live

1. **Fork this repo.** In your fork, open the Actions tab and turn workflows on. GitHub leaves them off in new forks.
2. **Make an X app.** In the [X Developer Console](https://console.x.com), create an app and set its user authentication to **Read and write**. Generate its API key and secret, then an access token and secret for your account.
3. **Add the four keys to your fork.** Settings → Secrets and variables → Actions → New repository secret, once for each: `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`.
4. **Edit `config.json`.** Put your GitHub handle in `github`, or a coin's ticker or address in `coin`.
5. **Run it once.** Actions → Update bio → Run workflow. After that it runs twice a day.

X bills each update to your developer account. Twice a day costs a few cents. GitHub pauses scheduled workflows in a repo with no activity for 60 days; turn it back on from the Actions tab.

## config.json

| Field | What it does |
|---|---|
| `github` | Your GitHub handle. Charts your public contribution graph. |
| `tokens` | A [tokenmaxxing](https://tokenmaxxing.sh) username. Charts your daily AI token usage. |
| `coin` | A ticker like `PEPE` or a contract address. |
| `numbers` | Your own list, like `[3, 5, 4, 8, 13]`. Only the first source that's filled in is used. |
| `range` | GitHub and tokens: `14d`, `30d`, `90d` or `1y`. Coins: `1d`, `7d`, `30d` or `90d`. Numbers ignore it. |
| `style` | `bars`, `line`, `wave`, `negative` or `blocks`. |
| `width` | Characters across, 6 to 48. Past 33, the chart wraps on phones. |
| `rows` | Lines tall, 1 to 4. Blocks are always one line. |
| `smooth` | `true` blends neighbouring days into a curve. `false` keeps every day (or price) as its own sharp bar. |
| `caption` | An extra line under the stats, in your words. Leave it empty for none. |
| `link` | Adds a line linking to the source: `github.com/you`, your tokenmaxxing page, or the coin's GeckoTerminal page. Numbers don't get one. |
| `stamp` | Adds the update time after the chart's top line, so people can see it's live. |
| `timezone` | The timezone for the stamp, like `America/New_York`. |

X bios hold 160 characters. The script prints the count and stops before posting anything longer.

## Run it on your own machine

Needs Node 20 or newer.

```sh
node bio.mjs          # prints the bio
node bio.mjs --live   # posts it; needs the four X_ keys in your environment
```

## Where the numbers come from

- **GitHub:** your public contribution graph, so it counts what GitHub counts: commits that reach a default branch, plus pull requests, issues and reviews. Private work shows only if your profile shares private contributions.
- **Tokens:** [tokenmaxxing](https://tokenmaxxing.sh)'s public API, summed across models per day.
- **Coins:** [GeckoTerminal](https://www.geckoterminal.com)'s free API, from the coin's deepest trading pool. Coin art comes from [DexScreener](https://dexscreener.com) when GeckoTerminal has none.

Your X keys never leave your repo's secrets.

## The site

| Path | What's there |
|---|---|
| `public/` | The page, one HTML file |
| `public/lib/` | The chart and the data sources, shared with `bio.mjs` |
| `worker/` | A Cloudflare Worker that serves the page and reads GitHub's graph, which browsers can't fetch from another site |

```sh
cd worker && npm install && npm run dev   # http://localhost:3510
```

## License

MIT
