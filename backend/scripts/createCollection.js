const client = require("../clients/typesenseClient");
const fs = require('fs');
const path = require('path');

const schema = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../schema/departures.schema.json"), "utf8")
);

async function createCollection() {
  try {
    const res = await client.collections().create(schema);
    console.log('Collection created:', res.name);
  } catch (err) {
    console.log('Error:', err.message);
  }
}

createCollection();