const client = require("../clients/typesenseClient");

async function runMultiSearchTests() {
  try {
    console.log("\n=== Multi Search Test (Federated Search) ===");

    const start = Date.now();
    const response = await client.multiSearch.perform({
      searches: [
        {
          collection: "dev_intrepid_departure",
          q: "bolivia",
          query_by: "name,primaryCountry,locations",
        },
        {
          collection: "test_intrepid_departure",
          q: "18 to 35s",
          query_by: "themes",
        },
        {
          collection: "dev_intrepid_departure",
          q: "north india",
          query_by: "name",
        },
      ],
    });
    const end = Date.now();
    const totalTime = end - start;

    console.log("\n--- Query 1: 'bolivia' (dev collection) ---");
    console.log("Total Found:", response.results[0].found);
    const p1 = response.results[0].search_time_ms;
    console.log("Search Time:", p1, "ms");

    console.log("\n--- Query 2: 'beach' (test collection) ---");
    console.log("Total Found:", response.results[1].found);
    const p2 = response.results[1].search_time_ms;
    console.log("Search Time:", p2, "ms");

    console.log("\n--- Query 3: 'north india' (dev collection) ---");
    console.log("Total Found:", response.results[2].found);
    const p3 = response.results[2].search_time_ms;
    console.log("Search Time:", p3, "ms");

    console.log("\nTotal Multi-Search Time (End-to-End):", totalTime, "ms");
    
    const backendTime = p1+p2+p3;
    const overhead = totalTime - backendTime;
    console.log("Total Backend Processing Time (Inside Typesense Engine Only):", backendTime, "ms");
    console.log("Network Time:", overhead, "ms");
  } catch (err) {
    console.error("Multi Search error:", err);
  }
}

runMultiSearchTests();
