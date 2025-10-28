# Dren

A database-agnostic job queue library for TypeScript with MongoDB support.

## Project Structure

```
dren/
├── packages/
│   └── dren/              # Core library
│       └── src/
│           ├── types.ts   # Type definitions
│           └── index.ts   # Main exports
├── apps/
│   └── test-backend/      # Test application
└── pnpm-workspace.yaml    # Workspace config
```

## Development

```bash
# Install dependencies
pnpm install

# Build the library
pnpm build

# Run in watch mode
pnpm dev

# Run test backend
pnpm test-backend
```

## Features (Planned)

- Priority-based job processing
- Configurable retry logic with exponential backoff
- Horizontal scaling with job type filtering
- Full error tracking and history
- Graceful shutdown
