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

    console.log("\n--- Query 2: 'beach' (test collection) ---");
    console.log("Total Found:", response.results[1].found);

    console.log("\n--- Query 3: 'north india' (dev collection) ---");
    console.log("Total Found:", response.results[2].found);

    console.log("\nTotal Multi-Search Time:", totalTime, "ms");
  } catch (err) {
    console.error("Multi Search error:", err);
  }
}

runMultiSearchTests();
