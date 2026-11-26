const fs = require("fs");
const path = require("path");

const PRODUCT_CODES = [1, 2, 5, 7, 8, 9];
const ENTITY_PREFIX = { ogx: "o", icx: "i" };
const PRODUCT_GROUPS = { all: PRODUCT_CODES, gv: [7], gta: [8] };
const PRODUCT_LABELS = { all: "all products", gv: "GV", gta: "GTa" };
const STAGES = [
  { key: "open", label: "Open" },
  { key: "applied", label: "Applied" },
  { key: "an_accepted", label: "Accepted" },
  { key: "approved", label: "Approved" },
  { key: "realized", label: "Realized" },
  { key: "finished", label: "Finished" },
  { key: "completed", label: "Completed" },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function unwrap(json) {
  return json && json.response && typeof json.response === "object" ? json.response : json;
}

function num(x) {
  return typeof x === "number" && isFinite(x) ? x : 0;
}

function buildStages(body, entity, codes = PRODUCT_CODES, headlineOpen = false) {
  const p = ENTITY_PREFIX[entity];
  return STAGES.map((stage) => {
    if (stage.key === "open") {
      let opportunities = 0;
      let openings = 0;
      for (const code of codes) {
        const node = body[`open_${p}_programme_${code}`];
        opportunities += num(node && node.doc_count);
        const t = node && node.total_openings;
        openings += typeof t === "number" ? num(t) : num(t && t.value);
      }
      if (entity === "icx") {
        return { key: "open", label: stage.label, value: openings, unit: "openings", opportunities };
      }
      const value = headlineOpen ? num(body.open_ogx && body.open_ogx.doc_count) : opportunities;
      return { key: "open", label: stage.label, value, unit: "sign-ups" };
    }
    let value = 0;
    let applications = 0;
    for (const code of codes) {
      const node = body[`${p}_${stage.key}_${code}`];
      value += num(node && node.applicants && node.applicants.value);
      applications += num(node && node.doc_count);
    }
    return { key: stage.key, label: stage.label, value, applications };
  });
}

function addStages(a, b) {
  if (!a) return b.map((s) => ({ ...s }));
  return a.map((s, i) => {
    const o = { ...s, value: s.value + b[i].value };
    if ("applications" in s) o.applications = s.applications + b[i].applications;
    if ("opportunities" in s) o.opportunities = s.opportunities + b[i].opportunities;
    return o;
  });
}

function conversion(stages) {
  const applied = stages.find((s) => s.key === "applied").value;
  const realized = stages.find((s) => s.key === "realized").value;
  return {
    from: "applied",
    to: "realized",
    basis: "unique people (applicants.value)",
    rate: applied > 0 ? realized / applied : null,
  };
}

function withStepRates(stages, entity) {
  return stages.map((s, i) => {
    if (i === 0) return s;
    const prev = stages[i - 1];
    const comparable = !(s.key === "applied" && entity === "icx");
    return { ...s, stepRate: comparable && prev.value > 0 ? s.value / prev.value : null, stepFrom: prev.label };
  });
}

function validateRange(start, end) {
  if (!DATE_RE.test(start || "") || !DATE_RE.test(end || "")) {
    throw httpError(400, "start and end must be YYYY-MM-DD");
  }
  if (start > end) throw httpError(400, "start must not be after end");
}

function monthBounds(ym) {
  const [y, m] = ym.split("-").map(Number);
  const first = `${ym}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { first, last: `${ym}-${String(lastDay).padStart(2, "0")}` };
}

function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function fromDays(entity, codes, headline, start, end, fixturesDir) {
  let days;
  try {
    days = JSON.parse(fs.readFileSync(path.join(fixturesDir, "days.json"), "utf8"));
  } catch (_) {
    return null;
  }
  const keys = Object.keys(days).sort();
  if (!keys.length) return null;
  const effStart = start > keys[0] ? start : keys[0];
  const effEnd = end < keys[keys.length - 1] ? end : keys[keys.length - 1];
  if (effStart > effEnd) return null;
  let total = null;
  for (let d = effStart; d <= effEnd; d = addDays(d, 1)) {
    if (!days[d]) return null;
    total = addStages(total, buildStages(days[d], entity, codes, headline));
  }
  let exact = effStart === effEnd;
  const candidates = ["term.json", `${effStart.slice(0, 7)}.json`];
  for (const name of candidates) {
    try {
      const json = JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
      if (json.start_date === effStart && json.end_date === effEnd) {
        total = buildStages(unwrap(json), entity, codes, headline);
        exact = true;
        break;
      }
    } catch (_) {
    }
  }
  return { stages: total, months: [], effective: { start: effStart, end: effEnd }, exact, granularity: "day" };
}

function fromFixtures(entity, codes, headline, start, end, dir) {
  const fixturesDir = dir || path.join(process.cwd(), "fixtures");
  const byDay = fromDays(entity, codes, headline, start, end, fixturesDir);
  if (byDay) return byDay;
  let files = [];
  try {
    files = fs.readdirSync(fixturesDir).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort();
  } catch (e) {
    throw httpError(500, "fixtures folder not found");
  }
  let total = null;
  const months = [];
  let effStart = null;
  let effEnd = null;
  for (const f of files) {
    const ym = f.slice(0, 7);
    const { first, last } = monthBounds(ym);
    if (first > end || last < start) continue;
    const json = JSON.parse(fs.readFileSync(path.join(fixturesDir, f), "utf8"));
    const body = unwrap(json);
    total = addStages(total, buildStages(body, entity, codes, headline));
    months.push(ym);
    const s = json.start_date || first;
    const e = json.end_date || last;
    if (!effStart || s < effStart) effStart = s;
    if (!effEnd || e > effEnd) effEnd = e;
  }
  if (!total) {
    throw httpError(404, "No snapshot data for this range. Available months: " + files.map((x) => x.slice(0, 7)).join(", "));
  }

  let exact = false;
  if (months.length === files.length) {
    try {
      const term = JSON.parse(fs.readFileSync(path.join(fixturesDir, "term.json"), "utf8"));
      if (term.start_date === effStart && term.end_date === effEnd) {
        total = buildStages(unwrap(term), entity, codes, headline);
        exact = true;
      }
    } catch (_) {
    }
  }
  return { stages: total, months, effective: { start: effStart, end: effEnd }, exact };
}

async function fromAnalytics(entity, codes, headline, start, end) {
  const token = process.env.EXPA_TOKEN;
  const office = process.env.OFFICE_ID || "2871";
  if (!token) throw httpError(500, "EXPA_TOKEN is not set (live mode)");
  const url = new URL("https://analytics.api.aiesec.org/v2/applications/analyze.json");
  url.searchParams.set("access_token", token);
  url.searchParams.set("start_date", start);
  url.searchParams.set("end_date", end);
  url.searchParams.set("performance_v3[office_id]", office);
  const res = await fetch(url);
  if (!res.ok) {
    throw httpError(res.status === 401 || res.status === 403 ? 401 : 502, `Analytics API returned HTTP ${res.status}`);
  }
  const body = unwrap(await res.json());
  if (!body || typeof body !== "object" || !Object.keys(body).length) {
    throw httpError(502, "Analytics API returned an empty response");
  }
  return { stages: buildStages(body, entity, codes, headline), months: [], effective: { start, end }, exact: true };
}

async function getStats(entity, start, end, opts = {}) {
  if (!ENTITY_PREFIX[entity]) throw httpError(400, "entity must be ogx or icx");
  validateRange(start, end);
  const product = String(opts.product || "all").toLowerCase();
  if (!PRODUCT_GROUPS[product]) throw httpError(400, "product must be all, gv or gta");
  const codes = entity === "icx" ? [7] : PRODUCT_GROUPS[product];
  const headline = entity === "ogx" && product === "all";
  const productLabel = entity === "icx" ? "GV" : PRODUCT_LABELS[product];
  const mode = (opts.mode || process.env.DATA_MODE || "mock").toLowerCase() === "live" ? "live" : "mock";
  const r = mode === "live"
    ? await fromAnalytics(entity, codes, headline, start, end)
    : fromFixtures(entity, codes, headline, start, end, opts.fixturesDir);
  return {
    mode,
    entity,
    product: entity === "icx" ? "gv" : product,
    productLabel,
    requested: { start, end },
    effective: r.effective,
    months: r.months,
    granularity: r.granularity || (mode === "live" ? "live" : "month"),
    exact: r.exact,
    stages: withStepRates(r.stages, entity),
    conversion: conversion(r.stages),
  };
}

module.exports = { getStats, PRODUCT_GROUPS, buildStages, addStages, conversion, unwrap, STAGES, PRODUCT_CODES };
