const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "../../data/sample-departures.json");
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

const data = parseData(rawData);
const productIds = new Set();
const productCodes = new Set();

data.forEach((doc) => {
  if (doc?.productId !== undefined && doc?.productId !== null) {
    productIds.add(doc.productId);
  }
  if (doc?.productCode) {
    productCodes.add(doc.productCode);
  }
});

const sampleIds = Array.from(productIds).slice(0, 5).join(", ");
const sampleCodes = Array.from(productCodes).slice(0, 5).join(", ");

console.log(`Total records: ${data.length}`);
console.log(`Unique productId: ${productIds.size}`);
console.log(`Unique productCode: ${productCodes.size}`);
console.log(`Sample productIds: ${sampleIds}`);
console.log(`Sample productCodes: ${sampleCodes}`);
