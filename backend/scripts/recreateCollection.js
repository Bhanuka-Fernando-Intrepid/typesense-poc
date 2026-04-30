const fs = require("fs");
const path = require("path");
const client = require("../clients/typesenseClient");
require("dotenv").config();

const schemaPath = path.join(__dirname, "../../schema/departures.schema.json");
const dataPath = path.join(__dirname, "../../data/sample-departures.json");

const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const collectionName = schema?.name || "travel_departures";
const rawData = fs.readFileSync(dataPath, "utf8");

function parseData(input) {
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (error) {
    return input
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
}

async function recreateCollection() {
  try {
    try {
      await client.collections(collectionName).delete();
      console.log(`Collection deleted: ${collectionName}`);
    } catch (error) {
      if (error?.httpStatus !== 404) {
        throw error;
      }
      console.log(`Collection not found, creating: ${collectionName}`);
    }

    await client.collections().create(schema);
    console.log(`Collection created: ${collectionName}`);

    const data = parseData(rawData);
    const result = await client
      .collections(collectionName)
      .documents()
      .import(data, { action: "upsert" });

    console.log("Data imported successfully.");
    console.log(result);
  } catch (error) {
    console.error("Recreate failed:", error.message || error);
    if (error.importResults) {
      error.importResults.forEach((result, idx) => {
        if (!result.success) {
          console.error(`Document ${idx} (${result?.document?.id || "unknown"}):`, result.error);
        }
      });
    }
    process.exit(1);
  }
}

recreateCollection();
