module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const mode = (process.env.DATA_MODE || "mock").toLowerCase();
  const fallback = { lc_name: process.env.LC_NAME || "AIESEC in BINUS", lc_id: Number(process.env.OFFICE_ID || 2871), source: "configured" };
  if (mode !== "live") return res.status(200).json(fallback);
  try {
    const token = process.env.EXPA_TOKEN;
    if (!token) throw new Error("EXPA_TOKEN is not set");
    const r = await fetch("https://gis-api.aiesec.org/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: token },
      body: JSON.stringify({ query: "{ currentPerson { home_lc { id full_name } } }" }),
    });
    if (!r.ok) throw new Error(`GraphQL returned HTTP ${r.status}`);
    const json = await r.json();
    const lc = json && json.data && json.data.currentPerson && json.data.currentPerson.home_lc;
    if (!lc) throw new Error("GraphQL returned no home_lc");
    res.status(200).json({ lc_name: lc.full_name, lc_id: Number(lc.id), source: "graphql" });
  } catch (e) {
    res.status(200).json({ ...fallback, source: "configured", warning: e.message });
  }
};
