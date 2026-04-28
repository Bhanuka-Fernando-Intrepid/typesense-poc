const client = require("../clients/typesenseClient");

async function runSearchTests() {
  try {
    console.log("\n--- Test 1: Simple keyword search ---");
    let res = await client.collections("departures")
      .documents()
      .search({
        q: "morocco",
        query_by: "name,primaryCountry,locations"
      });
    console.log("Results:", res.hits.length);

    console.log("\n--- Test 2: Multi-keyword search ---");
    res = await client.collections("departures")
      .documents()
      .search({
        q: "premium japan",
        query_by: "name"
      });
    console.log("Results:", res.hits.length);

    console.log("\n--- Test 3: Partial match ---");
    res = await client.collections("departures")
      .documents()
      .search({
        q: "bal",
        query_by: "name"
      });
    console.log("Results:", res.hits.length);

    console.log("\n--- Test 4: No match case ---");
    res = await client.collections("departures")
      .documents()
      .search({
        q: "xyz123",
        query_by: "name"
      });
    console.log("Results:", res.hits.length);

  } catch (err) {
    console.error("Search error:", err);
  }
}

runSearchTests();