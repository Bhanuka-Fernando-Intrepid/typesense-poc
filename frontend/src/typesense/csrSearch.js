// CSR Search — browser calls Typesense directly
import Typesense from "typesense";

// You should already have these in your frontend .env
const client = new Typesense.Client({
  nodes: [
    {
      host: import.meta.env.VITE_TYPESENSE_HOST,
      port: import.meta.env.VITE_TYPESENSE_PORT,
      protocol: import.meta.env.VITE_TYPESENSE_PROTOCOL,
    },
  ],
  apiKey: import.meta.env.VITE_TYPESENSE_API_KEY,
  connectionTimeoutSeconds: 5,
});

export async function csrSearch({
  query = "*",
  collection = "dev_intrepid_departure",
  perPage = 10,
  page = 1,
  queryBy = "name",
}) {
  // Start browser clock BEFORE the fetch
  const browserStart = Date.now();

  const result = await client.collections(collection).documents().search({
    q: query,
    query_by: queryBy,
    per_page: perPage,
    page,
  });

  // Stop browser clock AFTER fetch completes
  const browserEnd = Date.now();

  const total_ms = browserEnd - browserStart;
  const typesense_search_ms = result.search_time_ms;

  return {
    hits: result.hits,
    found: result.found,
    timing: {
      typesense_search_ms, // Engine-internal time
      total_ms, // Full browser round-trip
      network_ms: total_ms - typesense_search_ms, // Browser to Typesense network cost
    },
    mode: "CSR",
  };
}
