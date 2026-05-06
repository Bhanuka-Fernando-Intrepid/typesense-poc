// SSR Search — browser calls your Express backend, which calls Typesense
const SSR_BASE_URL =
  import.meta.env.VITE_SSR_API_URL || "http://localhost:4000";

export async function ssrSearch({
  query = "*",
  collection = "dev_intrepid_departure",
  perPage = 10,
  page = 1,
}) {
  // Browser clock starts before calling the server
  const browserStart = Date.now();

  const params = new URLSearchParams({
    q: query,
    collection,
    per_page: perPage,
    page,
  });

  const response = await fetch(`${SSR_BASE_URL}/api/search?${params}`);

  if (!response.ok) {
    throw new Error(`SSR search failed: ${response.statusText}`);
  }

  const data = await response.json();

  const browserEnd = Date.now();
  const browser_total_ms = browserEnd - browserStart;

  return {
    hits: data.hits,
    found: data.found,
    timing: {
      // From Typesense (reported by server)
      typesense_search_ms: data.timing.typesense_search_ms,

      // From server perspective
      server_total_ms: data.timing.server_total_ms,
      server_overhead_ms: data.timing.server_overhead_ms,

      // From browser perspective
      browser_total_ms,

      // Browser→Server network = browser total - server total
      browser_to_server_ms: browser_total_ms - data.timing.server_total_ms,
    },
    mode: "SSR",
  };
}
