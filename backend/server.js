require("dotenv").config();

const express = require("express");
const cors = require("cors");
const client = require("./clients/typesenseClient");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// The server calls Typesense, measures its own time, and returns both the results AND the timing metadata to the frontend.
app.get("/api/search", async (req, res) => {
  const {
    q = "*",
    collection = "dev_intrepid_departure",
    per_page = 10,
    page = 1,
  } = req.query;

  const serverStart = Date.now();

  try {
    const searchParameters = {
      q,
      query_by: "name",
      per_page: parseInt(per_page),
      page: parseInt(page),
    };

    const result = await client
      .collections(collection)
      .documents()
      .search(searchParameters);

    const serverEnd = Date.now();

    res.json({
      hits: result.hits,
      found: result.found,

      timing: {
        // Time Typesense itself spent searching (internal engine time)
        typesense_search_ms: result.search_time_ms,

        // Total time the server spent (includes network to Typesense + processing)
        server_total_ms: serverEnd - serverStart,

        // Overhead = server total - typesense internal
        // This represents: server processing + network between server and Typesense
        server_overhead_ms: serverEnd - serverStart - result.search_time_ms,
      },

      mode: "SSR",
    });
  } catch (err) {
    console.error("Search error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Health check - Confirm the server is running
app.get("/health", (req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(
    `SSR search endpoint: http://localhost:${PORT}/api/search`,
  );
});
