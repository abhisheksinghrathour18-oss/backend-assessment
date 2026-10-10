# Order Ingestion Service — Backend Assessment

A production-ready, distributed order ingestion service built with **Node.js 22**, **TypeScript**, **Express**, **PostgreSQL Horizontal Sharding**, **CSV & XLSX Streaming Ingestion**, **BullMQ Background Workers & Redis**, and a **Pluggable Storage Provider** (Local Stub Storage + Google Cloud Storage ready).

---

## Architecture Overview

```
                      +-----------------------------+
                      |       Client / HTTP         |
                      +--------------+--------------+
                                     |
         +---------------------------+---------------------------+
         |                                                       |
         v (Synchronous Pipeline)                                v (Asynchronous Pipeline)
 POST /upload-orders                                     POST /upload-orders/async
 POST /api/v1/orders/upload                              POST /api/v1/orders/upload/async
         |                                                       |
         v                                                       v
+-----------------------------+                         +-----------------------------+
|      Upload Middleware      |                         |      Upload Middleware      |
|   (Multer: CSV & XLSX)      |                         |   (Multer: CSV & XLSX)      |
+--------------+--------------+                         +--------------+--------------+
               |                                                       |
               v                                                       v
+-----------------------------+                         +-----------------------------+
|       Storage Service       |                         |       Storage Service       |
|  (Store Original Archive)   |                         |  (Store Original Archive)   |
+--------------+--------------+                         +--------------+--------------+
       /               \                                       /               \
      v                 v                                     v                 v
+-------------------+ +-------------------+             +-------------------+ +-------------------+
| StubStorageProvider| | GcsStorageProvider|             | StubStorageProvider| | GcsStorageProvider|
| (Local: ./storage)| |(Google Cloud Store|             | (Local: ./storage)| |(Google Cloud Store|
+-------------------+ +-------------------+             +-------------------+ +-------------------+
               |                                                       |
               v                                                       v (Enqueue Job)
+-----------------------------+                         +-----------------------------+
|   Streaming Row Iterator    |                         |     BullMQ Ingestion Queue  |
| (csv-parse / ExcelJS stream)|                         |      (Redis: port 6380)     |
+--------------+--------------+                         +--------------+--------------+
               |                                                       |
               |                                                       v (Worker Consumer)
               |                                        +-----------------------------+
               |                                        |  Background Queue Worker    |
               |                                        |    (npm run worker / in-proc)|
               |                                        +--------------+--------------+
               |                                                       |
               +-----------------------+-------------------------------+
                                       |
                                       v
                        +-----------------------------+
                        |     Order Schema Validator  |
                        | (Zod: coercion & sanitize)  |
                        +--------------+--------------+
                                       |
                                       v
                        +-----------------------------+
                        |     Shard Router (SHA-256)  |
                        |   getShardId(customer_id)   |
                        +--------------+--------------+
                               /               \
                              v                 v
                   +-------------------+   +-------------------+
                   |  PostgreSQL Shard1|   |  PostgreSQL Shard2|
                   | (order-shard1:5437|   | (order-shard2:5438|
                   |  ON CONFLICT safe |   |  ON CONFLICT safe |
                   |  + withRetry jitter)  |  + withRetry jitter)
                   +-------------------+   +-------------------+
```

### Core System Capabilities
- **Dual Format Streaming (CSV & Excel `.xlsx`)**: Ingests CSV and Excel `.xlsx` files using streaming iterators (`csv-parse` and `ExcelJS.stream.xlsx.WorkbookReader`), maintaining strictly bounded memory usage under high load (tested with 10,000-row files with <10MB heap delta).
- **Horizontal Sharding**: Customer orders are partitioned across two independent PostgreSQL database shards (`shard1` and `shard2`) using deterministic hashing (SHA-256) on `customer_id`.
- **Pluggable Storage Provider**:
  - `StubStorageProvider` (Default): Stores files safely in local directory (`./storage`) with collision-safe naming and path traversal protection. Works completely offline.
  - `GcsStorageProvider`: Implemented for Google Cloud Storage using Application Default Credentials (ADC). *(Marked implemented but not verified due to GCP account verification status).*
- **Asynchronous Background Processing (Bonus A)**: BullMQ + Redis job queue for high-volume uploads (`POST /upload-orders/async` -> HTTP 202 Accepted) with real-time job status polling (`GET /upload-orders/jobs/:jobId`).
- **Database Retry & Transient Failure Policy (Bonus B)**: Bounded exponential backoff with full jitter in `src/infrastructure/database/retry.ts`. Classifies transient SQLSTATE codes (`40001` serialization failure, `40P01` deadlock, `57P01` shutdown, `ECONNRESET`) and retries up to 3 times with rollback safety, while immediately failing non-transient errors.
- **Idempotent Ingestion**: Batches are committed within PostgreSQL transactions using `ON CONFLICT (order_id) DO NOTHING`. Repeat uploads are identified as duplicates without failing.
- **Graceful Error Reporting**: Row-level validation errors are tracked with exact row numbers and failure reasons without aborting valid rows in the file.

---

## Video Demo Script

For a step-by-step walkthrough suitable for recording a technical demo, see:  
📘 [docs/VIDEO_DEMO_SCRIPT.md](docs/VIDEO_DEMO_SCRIPT.md) (Covers Scenes 1–10, timings, speaker script, and curl commands).

---

## Prerequisites

- **Node.js**: v20+ (tested on Node v22)
- **Docker & Docker Compose**: For running the two PostgreSQL shards and Redis

---

## Environment Configuration

Copy `.env.example` to `.env`:

```env
NODE_ENV=development
PORT=3010

PG_SHARD_1_DB_URL=postgresql://app:password@localhost:5437/shard1
PG_SHARD_2_DB_URL=postgresql://app:password@localhost:5438/shard2

UPLOAD_MAX_BYTES=10485760
BATCH_SIZE=500

# Storage Provider: "stub" (default for offline dev) or "gcs"
STORAGE_PROVIDER=stub
STORAGE_STUB_DIR=./storage

# Google Cloud Storage (required only when STORAGE_PROVIDER=gcs)
GCS_BUCKET_NAME=
GCP_PROJECT_ID=

# Background Processing & BullMQ Queue (Redis)
REDIS_HOST=localhost
REDIS_PORT=6380
REDIS_PASSWORD=
QUEUE_NAME=orders-ingestion

# Database Transient Failure Retry Policy
DB_MAX_RETRIES=3
DB_RETRY_BASE_MS=100
DB_RETRY_MAX_MS=2000
```

---

## Quick Start

### 1. Start Database Shards & Redis
Start the two PostgreSQL shard containers and Redis container:

```bash
docker compose up -d
```

Verify all containers are healthy:
```bash
docker compose ps
```

Expected containers:
- `order-shard1` on host port `5437`
- `order-shard2` on host port `5438`
- `order-redis` on host port `6380`

### 2. Apply Database Schema
Apply migrations to both shards:
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

The server runs at `http://localhost:3010`:
- **Health Check**: `http://localhost:3010/health`
- **Swagger Documentation**: `http://localhost:3010/api-docs`

*(Optional)* Run a dedicated worker process in a separate terminal:
```bash
npm run worker
```

---

## API Specifications

### 1. Synchronous Upload (CSV or XLSX)
- **Endpoints**:
  - `POST /upload-orders` (Assessment specification)
  - `POST /api/v1/orders/upload` (Versioned alias)
- **Content-Type**: `multipart/form-data`
- **Field**: `file` (CSV or `.xlsx` up to 10MB)
- **Headers expected**: `order_id,customer_id,order_date,order_amount,status` (also supports misspelled `order_amout`)

#### Sample Response (200 OK):
```json
{
  "success": true,
  "message": "File processing completed",
  "data": {
    "storage": {
      "provider": "stub",
      "objectKey": "1791616408807-d44ee7c6-c094-4017-a4c5-061a72b65a7a-orders.csv",
      "location": "/path/to/project/storage/1791616408807-d44ee7c6-c094-4017-a4c5-061a72b65a7a-orders.csv",
      "sizeBytes": 198
    },
    "totalRowsProcessed": 2,
    "validRows": 2,
    "insertedRows": 2,
    "duplicateRows": 0,
    "invalidRows": 0,
    "failedBatches": 0,
    "shardDistribution": {
      "1": { "inserted": 1, "duplicates": 0 },
      "2": { "inserted": 1, "duplicates": 0 }
    }
  }
}
```

### 2. Asynchronous Upload (Background Queue)
- **Endpoints**:
  - `POST /upload-orders/async`
  - `POST /api/v1/orders/upload/async`

#### Sample Response (202 Accepted):
```json
{
  "success": true,
  "message": "Order file accepted for background processing",
  "data": {
    "jobId": "job-1791618018787-etd8fdo",
    "status": "queued",
    "originalFilename": "orders.csv",
    "objectKey": "1791618018786-d44ee7c6-orders.csv",
    "storageProvider": "stub",
    "pollUrl": "/api/v1/orders/jobs/job-1791618018787-etd8fdo"
  }
}
```

### 3. Background Job Status Polling
- **Endpoints**:
  - `GET /upload-orders/jobs/:jobId`
  - `GET /api/v1/orders/jobs/:jobId`

#### Sample Response (200 OK):
```json
{
  "success": true,
  "data": {
    "jobId": "job-1791618018787-etd8fdo",
    "status": "completed",
    "progress": 0,
    "result": {
      "totalRowsProcessed": 2,
      "validRows": 2,
      "insertedRows": 2,
      "duplicateRows": 0,
      "invalidRows": 0,
      "shardDistribution": {
        "1": { "inserted": 1, "duplicates": 0 },
        "2": { "inserted": 1, "duplicates": 0 }
      }
    },
    "createdAt": 1791618018787,
    "processedOn": 1791618018800,
    "finishedOn": 1791618018950
  }
}
```

### 4. Query Orders by Customer
`GET /api/v1/orders/customer/:customerId?limit=50&offset=0`
- Deterministically queries the target customer's database shard.

### 5. Query Order by ID
`GET /api/v1/orders/:orderId`
- Queries both shards concurrently and returns the record and matching shard ID.

### 6. Health Check
`GET /health`
- Returns service status: `{"status": "ok", "service": "backend-assessment"}`.

---

## Storage Provider Guide: Transitioning to GCP Storage

Currently, the service runs with `STORAGE_PROVIDER=stub` to operate without GCP dependencies.

### Transition Steps for Real Google Cloud Storage:
1. Authenticate with Google Cloud Application Default Credentials (ADC):
   ```bash
   gcloud auth application-default login
   ```
2. Configure project ID and ensure a bucket exists:
   ```bash
   gcloud config set project YOUR_PROJECT_ID
   gsutil mb -p YOUR_PROJECT_ID -l US gs://YOUR_BUCKET_NAME/
   ```
3. Update `.env`:
   ```env
   STORAGE_PROVIDER=gcs
   GCS_BUCKET_NAME=YOUR_BUCKET_NAME
   GCP_PROJECT_ID=YOUR_PROJECT_ID
   ```
4. Restart the server:
   ```bash
   npm run dev
   ```
The `StorageService` will switch automatically to `GcsStorageProvider`. No application logic changes required.

---

## Automated Test Suite

Run all tests via Vitest:
```bash
npm test
```

### Test Coverage Breakdown:
- **Unit Tests**:
  - `database.retry.test.ts`: PostgreSQL transient code classification (`40001`, `40P01`, `57P01`), network error detection, immediate non-transient rejection, and jitter calculation.
  - `orders.validator.test.ts`: Zod schema validations, numeric/date coercion, and boundary conditions.
  - `orders.parser.test.ts`: CSV and Excel `.xlsx` streaming parsing, `order_amout` typo mapping, and line error tracking.
  - `storage.service.test.ts`: Stub provider storage, content integrity, path traversal prevention, and GCS actionable configuration error handling.
  - `shard-router.test.ts`: Deterministic hashing and customer distribution.
- **Integration Tests**:
  - `orders.async-queue.test.ts`: BullMQ background job queueing, worker execution, job polling, 202 Accepted status, and error states.
  - `orders.api.test.ts`: Synchronous endpoints `/upload-orders`, `/api/v1/orders/upload`, CSV/XLSX handling, duplicate idempotency, and sharded queries.
- **Streaming Load Benchmarks**:
  - `streaming-load.test.ts`: 10,000-row CSV benchmark (~750 ms) and 10,000-row XLSX benchmark (~880 ms), validating bounded memory delta (<20MB).

**Total Result**: 53 passed across 8 test suites.
