# Development MongoDB Setup

## Quick Start

1. **Start MongoDB:**

   ```bash
   pnpm db:start
   ```

2. **Check MongoDB logs:**

   ```bash
   pnpm db:logs
   ```

3. **Stop MongoDB:**

   ```bash
   pnpm db:stop
   ```

4. **Reset MongoDB (clean slate):**
   ```bash
   pnpm db:reset
   ```

## MongoDB Configuration

- **Port:** 27018 (custom port to avoid conflicts)
- **Database:** dren_test
- **User:** dren_user
- **Password:** dren_password
- **Connection String:** `mongodb://dren_user:dren_password@localhost:27018/dren_test?authSource=dren_test`

## Database Initialization

The Dren library automatically handles:

- Collection creation
- Index creation for optimal performance
- Database connection management

**Indexes Created by Dren:**

1. **Polling Index:** `{ status: 1, priority: 1, createdAt: 1 }`
2. **Job Type Index:** `{ name: 1, status: 1 }`
3. **Scheduled Jobs Index:** `{ nextRunAt: 1 }`
4. **Stuck Jobs Index:** `{ status: 1, processedAt: 1 }`

## Environment Variables

Create a `.env` file in the test-backend directory:

```env
MONGO_URL=mongodb://dren_user:dren_password@localhost:27018/dren_test?authSource=dren_test
NODE_ENV=development
PORT=3000
```
