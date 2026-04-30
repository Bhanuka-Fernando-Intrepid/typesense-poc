# Setup Guide

## Prerequisites
- Node.js (v16+)
- Typesense Cloud account or local Docker setup

## Installation
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   cd backend && npm install
   cd ../frontend && npm install
   ```

## Typesense Setup
- For local development: Use `docker-compose up -d` to start Typesense and dashboard
- For production: Use Typesense Cloud

## Environment Variables
Create `.env` files in backend and frontend directories:

### Backend (.env)
```
TYPESENSE_HOST=your-typesense-host
TYPESENSE_PORT=443
TYPESENSE_PROTOCOL=https
TYPESENSE_API_KEY=your-api-key
```

### Frontend (.env)
```
VITE_TYPESENSE_HOST=your-typesense-host
VITE_TYPESENSE_PORT=443
VITE_TYPESENSE_PROTOCOL=https
VITE_TYPESENSE_API_KEY=your-api-key
VITE_TYPESENSE_COLLECTION=dev_intrepid_departure
VITE_ASSET_BASE_URL=https://www.intrepidtravel.com
```

## Data Import
1. Create collection: `npm run create:collection`
2. Import data: `npm run import:data`
3. (Optional) Import products: `npm run import:products`

## Running the App
- Backend: `cd backend && npm run dev`
- Frontend: `cd frontend && npm run dev`

## Testing
- Run search tests: `npm run test:search`