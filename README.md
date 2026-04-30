# typesense-poc

POC to evaluate Typesense as an alternative to Algolia for indexing, search, filtering, and sorting.

## Features
- Full-text search with faceting
- Multi-currency pricing and filtering
- Product aggregation from departure data
- React frontend with real-time search
- Docker and Cloud support

## Quick Start
1. Follow the [setup guide](docs/setup.md)
2. Start the frontend: `cd frontend && npm run dev`
3. Open http://localhost:5174

## Docker (Local)
```bash
docker-compose up -d
```

## Scripts
- `npm run create:collection` - Create Typesense collection
- `npm run import:data` - Import sample departure data
- `npm run import:products` - Aggregate and import product data
- `npm run test:search` - Run search tests