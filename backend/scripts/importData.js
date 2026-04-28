const fs = require("fs");
const path = require("path");
const client = require("../clients/typesenseClient");
require("dotenv").config();

const dataPath = path.join(__dirname, "../../data/sample-departures.json");
const schemaPath = path.join(__dirname, "../../schema/departures.schema.json");
let data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));

// Transform data to ensure lowestPrice.*.discountPrice is an integer and populate currency-specific fields for sorting
data = data.map(doc => {
  if (doc.lowestPrice) {
    // First, round all discount prices in the lowestPrice object
    Object.keys(doc.lowestPrice).forEach(currency => {
      if (doc.lowestPrice[currency].discountPrice) {
        doc.lowestPrice[currency].discountPrice = Math.round(doc.lowestPrice[currency].discountPrice);
      }
    });

    // Populate currency-specific fields for sorting
    const currencyMap = {
      aud: 'aud',
      cad: 'cad',
      chf: 'chf',
      eur: 'eur',
      gbp: 'gbp',
      nzd: 'nzd',
      usd: 'usd',
      zar: 'zar'
    };

    Object.entries(currencyMap).forEach(([currency, fieldPrefix]) => {
      if (doc.lowestPrice[currency]) {
        const priceData = doc.lowestPrice[currency];
        doc[`price_${fieldPrefix}`] = priceData.price;
        if (priceData.discountPrice) {
          doc[`discount_price_${fieldPrefix}`] = Math.round(priceData.discountPrice);
        }
        doc[`on_sale_${fieldPrefix}`] = priceData.onSale ?? false;
      }
    });
  }
  return doc;
});

async function ensureCollectionExists() {
  try {
    await client.collections("travel_departures").retrieve();
  } catch (error) {
    if (error?.httpStatus !== 404) {
      throw error;
    }

    await client.collections().create(schema);
    console.log("Collection created: travel_departures");
  }
}

async function importData() {
  try {
    await ensureCollectionExists();

    const res = await client
      .collections("travel_departures")
      .documents()
      .import(data, { action: "upsert" });

    console.log("Data imported successfully:");
    console.log(res);
  } catch (error) {
    console.error("Import failed:", error.message);
    if (error.importResults) {
      error.importResults.forEach((result, idx) => {
        if (!result.success) {
          console.error(`Document ${idx} (${data[idx]?.id}):`, result.error);
        }
      });
    }
  }
}

importData();