const fs = require("fs");
const path = require("path");
const client = require("../clients/typesenseClient");
require("dotenv").config();

const currencies = ["aud", "cad", "chf", "eur", "gbp", "nzd", "usd", "zar"];

const dataPath = path.join(__dirname, "../../data/sample-departures.json");
const schemaPath = path.join(__dirname, "../../schema/products.schema.json");
let departures = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));

function normalizePriceData(priceData) {
  if (!priceData) {
    return null;
  }

  const discountPrice = Number.isFinite(Number(priceData.discountPrice))
    ? Math.round(Number(priceData.discountPrice))
    : null;

  return {
    ...priceData,
    price: Number(priceData.price),
    discountPrice: discountPrice ?? Number(priceData.price),
  };
}

function effectivePrice(priceData) {
  if (!priceData) {
    return Number.POSITIVE_INFINITY;
  }

  return Number(priceData.onSale && priceData.discountPrice ? priceData.discountPrice : priceData.price);
}

function buildCurrencyAggregate(groupDepartures, currency) {
  let winner = null;

  groupDepartures.forEach((departure) => {
    const priceData = departure.lowestPrice?.[currency];
    if (!priceData) {
      return;
    }

    const normalized = normalizePriceData(priceData);
    const price = effectivePrice(normalized);

    if (!winner || price < winner.price) {
      winner = {
        price,
        normalized,
      };
    }
  });

  if (!winner) {
    return null;
  }

  const normalized = winner.normalized;

  return {
    price: normalized.price,
    discountPrice: winner.price,
    currencyCode: normalized.currencyCode || currency.toUpperCase(),
    depositAmount: normalized.depositAmount,
    onSale: Boolean(normalized.onSale),
    isHighlightedDeal: Boolean(normalized.isHighlightedDeal),
    isHighlightedPrice: Boolean(normalized.isHighlightedPrice),
  };
}

function groupDeparturesByProduct(items) {
  const groups = new Map();

  items.forEach((item) => {
    const productId = Number(item.productId ?? item.id);
    const group = groups.get(productId);
    const normalizedDeparture = {
      id: item.id,
      departureId: item.departureId,
      objectID: item.objectID,
      startDate: item.startDate,
      endDate: item.endDate,
      placesLeft: item.placesLeft,
      hasPlacesLeft: item.hasPlacesLeft,
      closedForBooking: item.closedForBooking,
      lowestPrice: item.lowestPrice,
    };

    if (!group) {
      groups.set(productId, {
        productId: Number(productId),
        productCode: item.productCode,
        name: item.name,
        primaryCountry: item.primaryCountry,
        destinations: item.destinations,
        marketingRegions: item.marketingRegions,
        themes: item.themes,
        styles: item.styles,
        locations: item.locations,
        startCity: item.startCity,
        endCity: item.endCity,
        regions: item.regions,
        subdivisions: item.subdivisions,
        subdivisionCountries: item.subdivisionCountries,
        activities: item.activities,
        excludedSaleRegions: item.excludedSaleRegions,
        tags: item.tags,
        promotions: item.promotions,
        productUrl: item.productUrl,
        heroImageUrl: item.heroImageUrl || item.productImageUrls?.[0],
        heroImageAlt: item.heroImageAlt || item.productImageAlts?.[0] || item.name,
        mapUrl: item.mapUrl || item.map?.url,
        mapAlt: item.mapAlt || item.map?.alt,
        mapTitle: item.mapTitle || item.map?.title,
        reviewCount: item.reviewCount,
        reviewRating: item.reviewRating,
        marketingRating: item.marketingRating,
        physicalRating: item.physicalRating,
        duration: item.duration,
        hasPlacesLeft: item.hasPlacesLeft,
        placesLeft: item.placesLeft,
        closedForBooking: item.closedForBooking,
        departuresCount: 1,
        startDate: item.startDate,
        endDate: item.endDate,
        departures: [normalizedDeparture],
      });
      return;
    }

    group.departures.push(normalizedDeparture);
    group.departuresCount += 1;
    group.startDate = Math.min(Number(group.startDate || Number.POSITIVE_INFINITY), Number(item.startDate || Number.POSITIVE_INFINITY));
    group.endDate = Math.max(Number(group.endDate || 0), Number(item.endDate || 0));

    if (Number.isFinite(Number(item.placesLeft))) {
      group.placesLeft = Number(group.placesLeft || 0) + Number(item.placesLeft || 0);
    }
  });

  return Array.from(groups.values()).map((group) => {
    const sortedDepartures = group.departures.sort((left, right) => Number(left.startDate || 0) - Number(right.startDate || 0));
    const lowestPrice = {};

    currencies.forEach((currency) => {
      const aggregate = buildCurrencyAggregate(sortedDepartures, currency);

      if (!aggregate) {
        return;
      }

      lowestPrice[currency] = aggregate;
      group[`price_${currency}`] = aggregate.price;
      group[`discount_price_${currency}`] = aggregate.discountPrice;
      group[`deposit_amount_${currency}`] = aggregate.depositAmount;
      group[`on_sale_${currency}`] = aggregate.onSale;
      group[`highlighted_deal_${currency}`] = aggregate.isHighlightedDeal;
      group[`highlighted_price_${currency}`] = aggregate.isHighlightedPrice;
    });

    return {
      ...group,
      id: String(group.productId),
      productId: Number(group.productId),
      startDate: Number(group.startDate),
      endDate: Number(group.endDate),
      departuresCount: Number(group.departuresCount),
      lowestPrice,
      departures: sortedDepartures,
    };
  });
}

departures = departures.map((departure) => ({
  ...departure,
  lowestPrice: Object.fromEntries(
    Object.entries(departure.lowestPrice || {}).map(([currency, priceData]) => [currency, normalizePriceData(priceData)]),
  ),
}));

const products = groupDeparturesByProduct(departures);

async function ensureCollectionExists() {
  try {
    await client.collections("travel_products").retrieve();
  } catch (error) {
    if (error?.httpStatus !== 404) {
      throw error;
    }

    await client.collections().create(schema);
    console.log("Collection created: travel_products");
  }
}

async function importProducts() {
  try {
    await ensureCollectionExists();

    const res = await client
      .collections("travel_products")
      .documents()
      .import(products, { action: "upsert" });

    console.log("Products imported successfully:");
    console.log(res);
  } catch (error) {
    console.error("Product import failed:", error.message);

    if (error.importResults) {
      error.importResults.forEach((result, idx) => {
        if (!result.success) {
          console.error(`Product ${idx} (${products[idx]?.id}):`, result.error);
        }
      });
    }
  }
}

importProducts();