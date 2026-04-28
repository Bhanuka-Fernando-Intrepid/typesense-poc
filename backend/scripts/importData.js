const fs = require("fs");
const path = require("path");
const client = require("../clients/typesenseClient");
require("dotenv").config();

const dataPath = path.join(__dirname, "../../data/sample-departures.json");
const schemaPath = path.join(__dirname, "../../schema/departures.schema.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));

async function ensureCollectionExists() {
  try {
    await client.collections("departures").retrieve();
  } catch (error) {
    if (error?.httpStatus !== 404) {
      throw error;
    }

    await client.collections().create(schema);
    console.log("Collection created: departures");
  }
}

async function importData() {
  try {
    await ensureCollectionExists();

    const res = await client
      .collections("departures")
      .documents()
      .import(data, { action: "upsert" });

    console.log("Data imported successfully:");
    console.log(res);
  } catch (error) {
    console.error("Import failed:", error.message);
  }
}

importData();