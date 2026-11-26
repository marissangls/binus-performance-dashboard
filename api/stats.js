const { getStats } = require("../lib/stats");

module.exports = async (req, res) => {
  try {
    const q = req.query || Object.fromEntries(new URL(req.url, "http://localhost").searchParams);
    const data = await getStats(String(q.entity || "ogx").toLowerCase(), String(q.start || ""), String(q.end || ""), { product: String(q.product || "all") });
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "Unexpected error" });
  }
};
