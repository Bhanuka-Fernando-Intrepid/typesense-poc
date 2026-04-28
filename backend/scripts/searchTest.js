const client = require("../clients/typesenseClient");

// async function runSearchTests() {
//   try {
//     console.log("\n--- Test 1: Simple keyword search ---");
//     let res = await client.collections("departures")
//       .documents()
//       .search({
//         q: "morocco",
//         query_by: "name,primaryCountry,locations"
//       });
//     console.log("Results:", res.hits.length);

//     console.log("\n--- Test 2: Multi-keyword search ---");
//     res = await client.collections("departures")
//       .documents()
//       .search({
//         q: "premium japan",
//         query_by: "name"
//       });
//     console.log("Results:", res.hits.length);

//     console.log("\n--- Test 3: Partial match ---");
//     res = await client.collections("departures")
//       .documents()
//       .search({
//         q: "bal",
//         query_by: "name"
//       });
//     console.log("Results:", res.hits.length);

//     console.log("\n--- Test 4: No match case ---");
//     res = await client.collections("departures")
//       .documents()
//       .search({
//         q: "xyz123",
//         query_by: "name"
//       });
//     console.log("Results:", res.hits.length);

//   } catch (err) {
//     console.error("Search error:", err);
//   }
// }

// runSearchTests();


async function runFilterSortTests() {
  try {
    console.log("\n--- Test 1: Filter by marketing region = Africa ---");
    let res = await client.collections("departures").documents().search({
      q: "*",
      query_by: "name",
      filter_by: "marketingRegions:=Africa",
      sort_by: "marketingRating:desc",
    });

    console.log("Results:", res.hits.length);
    res.hits.forEach((hit) => {
      console.log(hit.document.name, "-", hit.document.marketingRating);
    });

    console.log("\n--- Test 2: Filter by style = Premium ---");
    res = await client.collections("departures").documents().search({
      q: "*",
      query_by: "name",
      filter_by: "styles:=Premium",
      sort_by: "reviewRating:desc",
    });

    console.log("Results:", res.hits.length);
    res.hits.forEach((hit) => {
      console.log(hit.document.name, "-", hit.document.reviewRating);
    });

    console.log("\n--- Test 3: Filter available departures only ---");
    res = await client.collections("departures").documents().search({
      q: "*",
      query_by: "name",
      filter_by: "hasPlacesLeft:=true && closedForBooking:=false",
      sort_by: "marketingRating:desc",
    });

    console.log("Results:", res.hits.length);
    res.hits.forEach((hit) => {
      console.log(hit.document.name, "-", hit.document.placesLeft, "places left");
    });

    console.log("\n--- Test 4: Sort by shortest duration ---");
    res = await client.collections("departures").documents().search({
      q: "*",
      query_by: "name",
      sort_by: "duration:asc",
    });

    console.log("Results:", res.hits.length);
    res.hits.forEach((hit) => {
      console.log(hit.document.name, "-", hit.document.duration, "days");
    });

    console.log("\n--- Test 5: Search Morocco + sort by marketingRating ---");
    res = await client.collections("departures").documents().search({
      q: "morocco",
      query_by: "name,primaryCountry,locations",
      sort_by: "marketingRating:desc",
    });

    console.log("Results:", res.hits.length);
    res.hits.forEach((hit) => {
      console.log(hit.document.name, "-", hit.document.marketingRating);
    });
  } catch (error) {
    console.error("Filtering/sorting test failed:", error.message);
  }
}

runFilterSortTests();