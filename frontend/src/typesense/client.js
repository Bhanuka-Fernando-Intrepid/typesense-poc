import Typesense from 'typesense'

const TYPESENSE_HOST = import.meta.env.VITE_TYPESENSE_HOST || "";
const TYPESENSE_PORT = Number(import.meta.env.VITE_TYPESENSE_PORT) || 443;
const TYPESENSE_PROTOCOL = import.meta.env.VITE_TYPESENSE_PROTOCOL || "https";
const TYPESENSE_API_KEY = import.meta.env.VITE_TYPESENSE_SEARCH_API_KEY || import.meta.env.VITE_TYPESENSE_API_KEY || "";
const TYPESENSE_COLLECTION = import.meta.env.VITE_TYPESENSE_COLLECTION || "dev_intrepid_departure";
const TYPESENSE_READY = Boolean(TYPESENSE_HOST && TYPESENSE_API_KEY && TYPESENSE_COLLECTION);

const client = new Typesense.Client({
  nodes: [
    {
      host: TYPESENSE_HOST,
      port: TYPESENSE_PORT,
      protocol: TYPESENSE_PROTOCOL,
    },
  ],
  apiKey: TYPESENSE_API_KEY,
  connectionTimeoutSeconds: 10,
});

export { client, TYPESENSE_COLLECTION, TYPESENSE_READY }
