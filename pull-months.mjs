import { mkdirSync, writeFileSync } from "node:fs";

const raw = process.env.EXPA_URL;
if (!raw) {
  console.error("Set EXPA_URL first (the full analyze.json URL copied from the Network tab).");
  process.exit(1);
}
const year = Number(process.argv[2] || new Date().getFullYear());
const today = new Date();
const pad = (n) => String(n).padStart(2, "0");

mkdirSync("fixtures", { recursive: true });

let firstStart = null;
let lastEnd = null;

async function pull(start, end) {
  const url = new URL(raw);
  url.searchParams.set("start_date", start);
  url.searchParams.set("end_date", end);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`${start}..${end}: HTTP ${res.status}. Token expired? Stopping.`);
    process.exit(1);
  }
  const json = await res.json();
  const body = json.response ?? json;
  if (!body || typeof body !== "object" || !Object.keys(body).length) {
    console.error(`${start}..${end}: empty or unexpected response. Stopping.`);
    process.exit(1);
  }
  return body;
}

for (let i = 0; i < 12; i++) {
  const first = new Date(Date.UTC(year, 1 + i, 1));
  if (first > today) break;
  let last = new Date(Date.UTC(year, 2 + i, 0));
  if (last > today) last = today;
  const ym = `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}`;
  const start = `${ym}-01`;
  const end = `${last.getUTCFullYear()}-${pad(last.getUTCMonth() + 1)}-${pad(last.getUTCDate())}`;

  const body = await pull(start, end);
  const file = `fixtures/${ym}.json`;
  writeFileSync(file, JSON.stringify({ start_date: start, end_date: end, response: body }, null, 2));
  console.log(`saved ${file} (${start}..${end}, applied_total=${body.applied_total?.doc_count ?? "?"})`);
  if (!firstStart) firstStart = start;
  lastEnd = end;
}

if (firstStart) {
  const body = await pull(firstStart, lastEnd);
  writeFileSync("fixtures/term.json", JSON.stringify({ start_date: firstStart, end_date: lastEnd, response: body }, null, 2));
  console.log(`saved fixtures/term.json (${firstStart}..${lastEnd}, whole period in one query)`);
}
