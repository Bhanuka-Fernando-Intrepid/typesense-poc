const fs = require("fs");
const path = require("path");
const client = require("../clients/typesenseClient");

const schemaPath = path.join(__dirname, "../../schema/departures.schema.json");
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const collectionName = schema?.name || "travel_departures";
const outputPath = path.join(__dirname, "../../data/typesense-export.jsonl");

async function exportData() {
  try {
    const exportResult = await client
      .collections(collectionName)
      .documents()
      .export();

    fs.writeFileSync(outputPath, exportResult, "utf8");
    console.log(`Exported ${collectionName} to ${outputPath}`);
  } catch (error) {
    console.error("Export failed:", error.message || error);
    process.exit(1);
  }
}

exportData();
