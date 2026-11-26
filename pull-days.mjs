import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const raw = process.env.EXPA_URL;
if (!raw) {
  console.error("Set EXPA_URL first (the full analyze.json URL copied from the Network tab).");
  process.exit(1);
}
const year = Number(process.argv[2] || new Date().getFullYear());
const delayMs = Number(process.env.DELAY_MS || 1500);
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const KEEP = /^(open_ogx|open_[oi]_programme_\d+|[oi]_(applied|an_accepted|approved|realized|finished|completed)_\d+)$/;

mkdirSync("fixtures", { recursive: true });
const file = "fixtures/days.json";
const days = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};

const now = new Date();
const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
const yesterday = iso(new Date(todayUtc.getTime() - 86400000));
const today = iso(todayUtc);

function compact(body) {
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    if (!KEEP.test(k) || !v || typeof v !== "object") continue;
    const node = { doc_count: v.doc_count ?? 0 };
    if (v.applicants) node.applicants = { value: v.applicants.value ?? 0 };
    if (v.total_openings !== undefined) node.total_openings = v.total_openings;
    out[k] = node;
  }
  return out;
}

async function pull(day) {
  const url = new URL(raw);
  url.searchParams.set("start_date", day);
  url.searchParams.set("end_date", day);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`${day}: HTTP ${res.status}. Token expired? Progress is saved, run the same command again with a new URL.`);
    save();
    process.exit(1);
  }
  const json = await res.json();
  const body = json.response ?? json;
  if (!body || typeof body !== "object" || !Object.keys(body).length) {
    console.error(`${day}: empty or unexpected response. Progress is saved.`);
    save();
    process.exit(1);
  }
  return compact(body);
}

function save() {
  const sorted = Object.fromEntries(Object.entries(days).sort(([a], [b]) => (a < b ? -1 : 1)));
  writeFileSync(file, JSON.stringify(sorted));
}

const start = new Date(Date.UTC(year, 1, 1));
let pulled = 0;
for (let d = start; d <= todayUtc; d = new Date(d.getTime() + 86400000)) {
  const day = iso(d);
  if (days[day] && day !== today && day !== yesterday) continue;
  days[day] = await pull(day);
  pulled++;
  if (pulled % 20 === 0) {
    save();
    console.log(`${day} saved (${Object.keys(days).length} days so far)`);
  }
  await new Promise((r) => setTimeout(r, delayMs));
}
save();
console.log(`Done: ${Object.keys(days).length} days in ${file} (${pulled} pulled this run).`);
