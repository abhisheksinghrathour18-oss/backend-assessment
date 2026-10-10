# Order Ingestion Service — Backend Assessment

A production-ready order ingestion service built with **Express**, **TypeScript**, **PostgreSQL Sharding**, and **Google Cloud Storage (GCS)** archival.

---

## Architecture Overview

- **Horizontal Sharding**: Customer orders are partitioned across two independent PostgreSQL database shards (`shard1` and `shard2`) using deterministic hashing (SHA-256) on `customer_id`.
- **Bounded-Memory Streaming Ingestion**: CSV uploads are processed via Node.js streams and asynchronous iteration (`csv-parse`), maintaining bounded in-memory buffers per shard (`BATCH_SIZE`) to support massive datasets without heap spikes.
- **Transactional Batch Ingestion**: Records are inserted into target shards within transactions in configurable batches using `ON CONFLICT (order_id) DO NOTHING` for idempotent uploads.
- **Fault-Tolerant Validation**: Row-level validation errors are collected and reported with line numbers without crashing the entire batch, supporting graceful partial ingestion.
- **Audit Archival**: Uploaded files can optionally be archived directly to Google Cloud Storage (GCS) when configured.

---

## Prerequisites

- **Node.js**: v20+ (tested on Node v24)
- **Docker & Docker Compose**: For running the PostgreSQL shards

---

## Environment Configuration

Create a `.env` file based on `.env.example`:

```env
NODE_ENV=development
PORT=3010

PG_SHARD_1_DB_URL=postgresql://app:password@localhost:5437/shard1
PG_SHARD_2_DB_URL=postgresql://app:password@localhost:5438/shard2

UPLOAD_MAX_BYTES=10485760
BATCH_SIZE=500

# Optional: Google Cloud Storage bucket for audit archival
GCS_BUCKET_NAME=
```

---

## Getting Started

### 1. Start Database Shards
Start the two PostgreSQL shard containers:

```bash
docker compose up -d
```

Verify containers are running and healthy:
```bash
docker ps
```

### 2. Run Database Migrations
Migrations run against both shards:
```bash
docker exec -i order-shard1 psql -U app -d shard1 < migrations/001_create_orders.sql
docker exec -i order-shard2 psql -U app -d shard2 < migrations/001_create_orders.sql
```

### 3. Install Dependencies & Build
```bash
npm install
npm run build
```

### 4. Run Development Server
```bash
npm run dev
```

The server starts at `http://localhost:3010`.
- **Swagger Documentation**: `http://localhost:3010/api-docs`
- **Health Check**: `http://localhost:3010/health`

---

## API Endpoints

### 1. Health Check
`GET /health`
- **Response**:
  ```json
  {
    "status": "ok",
    "service": "backend-assessment"
  }
  ```

### 2. Upload Orders CSV
`POST /api/v1/orders/upload`
- **Content-Type**: `multipart/form-data`
- **Field**: `file` (CSV file up to configured `UPLOAD_MAX_BYTES`)
- **CSV Headers**: `order_id,customer_id,order_date,order_amount,status` (also supports misspelled `order_amout`)
- **Response**:
  ```json
  {
    "success": true,
    "message": "CSV processing completed",
    "data": {
      "totalRowsProcessed": 2,
      "validRows": 2,
      "insertedRows": 2,
      "duplicateRows": 0,
      "invalidRows": 0,
      "failedBatches": 0,
      "failedRows": 0,
      "errors": [],
      "shardDistribution": {
        "1": { "inserted": 2, "duplicates": 0 },
        "2": { "inserted": 0, "duplicates": 0 }
      }
    }
  }
  ```

### 3. Get Orders by Customer
`GET /api/v1/orders/customer/:customerId?limit=50&offset=0`
- Deterministically routes to the customer's database shard.
- **Response**:
  ```json
  {
    "success": true,
    "shardId": 1,
    "count": 2,
    "data": [ ... ]
  }
  ```

### 4. Get Order by ID
`GET /api/v1/orders/:orderId`
- Queries shards to retrieve order details by UUID.
- **Response**:
  ```json
  {
    "success": true,
    "shardId": 1,
    "data": { ... }
  }
  ```

---

## Testing

Run the full Vitest test suite:
```bash
npm test
```

### Test Coverage Highlights:
- **Unit Tests**:
  - `shard-router.test.ts`: Deterministic hashing and distribution
  - `orders.validator.test.ts`: Zod schema validation, data type coercion, edge cases
  - `orders.parser.test.ts`: Column normalization, header handling, streaming parsing
  - `storage.service.test.ts`: GCS graceful fallback
- **Integration Tests**:
  - `orders.api.test.ts`: Full end-to-end API upload, sharded storage, duplicate rejection, and order queries
- **Performance & Benchmark**:
  - `streaming-load.test.ts`: 10,000-row streaming benchmark verifying sub-second throughput and bounded heap memory delta (<16MB).

