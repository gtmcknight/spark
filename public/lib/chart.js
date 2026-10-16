// line in bio: the chart. Pure functions, shared by the site and by bio.mjs, so both draw the same thing.

export const STYLES = ["bars", "line", "wave", "negative", "blocks"];
export const WIDTH = { min: 6, max: 48, start: 24 }; // 48 is the widest that fits a desktop bio or post without wrapping
export const RANGES = {
  github: [["14d", "14D", 14], ["30d", "30D", 30], ["90d", "90D", 90], ["1y", "1Y", 365]],
  coin: [["1d", "1D", 1], ["7d", "7D", 7], ["30d", "30D", 30], ["90d", "90D", 90]],
};
export const BLOCKS = "▁▂▃▄▅▆▇█";
const BIT = [[0x01, 0x02, 0x04, 0x40], [0x08, 0x10, 0x20, 0x80]]; // braille dots: [column][row from top]

const norm = (v) => { const lo = Math.min(...v), hi = Math.max(...v); return v.map((x) => (hi > lo ? (x - lo) / (hi - lo) : 0.5)); };
const blur = (v, s) => v.map((_, i) => { let a = 0, w = 0; v.forEach((x, j) => { const k = Math.exp(-((i - j) ** 2) / (2 * s * s)); a += x * k; w += k; }); return a / w; });

// One value per column, plus the total the stat line reports. smooth blends neighbours; sharp keeps every day or price as is.
function series(data, range, cols, smooth = true) {
  if (data.src === "github") {
    const n = RANGES.github.find(([k]) => k === range)[2];
    const days = data.days.slice(0, -1).slice(-n).map((d) => d[1]); // today is still filling up, so it's left out
    const total = days.reduce((a, b) => a + b, 0);
    if (!smooth) return { values: Array.from({ length: cols }, (_, x) => days[Math.min(days.length - 1, Math.floor(((x + 0.5) / cols) * days.length))]), total };
    const bw = Math.max(0.6, (days.length / cols) * 1.2); // in days
    const values = Array.from({ length: cols }, (_, x) => {
      const c = ((x + 0.5) / cols) * days.length;
      let a = 0, w = 0;
      days.forEach((y, i) => { const k = Math.exp(-((i + 0.5 - c) ** 2) / (2 * bw * bw)); a += y * k; w += k; });
      return a / w;
    });
    return { values, total };
  }
  const pts = data.points, t0 = pts[0][0], t1 = pts.at(-1)[0];
  const values = Array.from({ length: cols }, (_, x) => {
    const t = t0 + ((x + 0.5) / cols) * (t1 - t0);
    const i = pts.findIndex((p) => p[0] >= t);
    if (i <= 0) return pts[Math.max(i, 0)][1];
    const [ta, va] = pts[i - 1], [tb, vb] = pts[i];
    return va + ((vb - va) * (t - ta)) / (tb - ta);
  });
  return { values: smooth ? blur(values, 0.6) : values };
}

function statLine(data, range, total) {
  const label = RANGES[data.src].find(([k]) => k === range)[1];
  if (data.src === "github") return `${total.toLocaleString("en-US")} contributions in ${label}`;
  const pct = data.change * 100;
  return `$${data.symbol.toUpperCase()} ${pct >= 0 ? "+" : "-"}${Math.abs(pct).toFixed(1)}% in ${label}`;
}

/**
 * Values as text: one value per dot column (two per character), or one per character for blocks.
 * width is in characters; rows of braille (blocks are always one row); progress (0 to 1) reveals it left to right.
 */
export function draw(values, { style = "bars", width = 24, rows = 2, progress = 1 }) {
  const n = norm(values);
  if (style === "blocks") return n.slice(0, Math.ceil(progress * width)).map((v) => BLOCKS[Math.round(v * 7)]).join("");
  const W = width * 2, H = rows * 4, T = n.map((v) => Math.round(v * (H - 1)));
  const on = {
    bars: (x, y) => y <= T[x],
    wave: (x, y) => Math.abs(y - (H - 1) / 2) <= 0.51 + n[x] * (H / 2 - 0.5),
    line: (x, y) => { const a = T[x], b = x ? T[x - 1] : a; return y >= Math.min(a, b) && y <= Math.max(a, b); },
    negative: (x, y) => y >= T[x], // everything above the line is dots; the chart is the carved-out space
  }[style];
  const shown = progress * W, lines = [];
  for (let r = rows - 1; r >= 0; r--) {
    let line = "";
    for (let c = 0; c < width; c++) {
      let b = 0;
      for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 4; dy++) if (c * 2 + dx < shown && on(c * 2 + dx, r * 4 + 3 - dy)) b |= BIT[dx][dy];
      line += String.fromCodePoint(0x2800 + b);
    }
    lines.push(line);
  }
  return lines.join("\n");
}

// A source's chart and its stat line
export function render(data, { range, style = "bars", width = 24, rows = 2, smooth = true, progress = 1 }) {
  const s = series(data, range, style === "blocks" ? width : width * 2, smooth);
  return { chart: draw(s.values, { style, width, rows, progress }), stat: statLine(data, range, s.total) };
}

// X bios allow 160 characters; posts allow 280, counting a chart character as 2
export function measure(text) {
  const chars = [...text];
  const weighted = chars.reduce((a, c) => { const p = c.codePointAt(0); return a + (p <= 0x10ff || (p >= 0x2000 && p <= 0x200d) || (p >= 0x2010 && p <= 0x201f) || (p >= 0x2032 && p <= 0x2037) ? 1 : 2); }, 0);
  return { chars: chars.length, weighted };
}
