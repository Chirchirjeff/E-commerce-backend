# E-Market Backend

NestJS backend for the E-Market ecommerce platform. It provides APIs for authentication, shops, products, categories, users, orders, file uploads, and tenant-aware shop data access.

## Tech Stack

- NestJS
- TypeScript
- Prisma ORM
- PostgreSQL
- JWT authentication
- Express static file serving for uploaded media

## Features

- User registration and authentication
- Shop creation and management
- Product catalog management
- Multiple product images stored as JSON metadata
- Category management per shop
- Order resources
- Upload endpoint for product and shop media
- Tenant middleware for shop-scoped requests
- Global validation and exception handling

## Requirements

- Node.js 22 or newer
- npm
- PostgreSQL database

## Setup

Install dependencies:

```bash
npm install
```

Create a `.env` file in the backend directory:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
JWT_SECRET="replace-with-a-secure-secret"
PORT=4000
NODE_ENV=development
```

Generate the Prisma client:

```bash
npx prisma generate
```

Apply database migrations or push the schema:

```bash
npx prisma db push
```

Seed the database when needed:

```bash
npm run prisma:seed
```

If the seed script is not exposed in `package.json`, run:

```bash
npx ts-node --transpile-only prisma/seed.ts
```

## Running The App

Development:

```bash
npm run start:dev
```

Production build:

```bash
npm run build
npm run start:prod
```

By default the API listens on:

```text
http://localhost:4000
```

Uploaded files are served from:

```text
/uploads/*
```

The `public/uploads` directory is ignored by Git because it contains runtime media files.

## Useful Scripts

```bash
npm run build
npm run start
npm run start:dev
npm run start:prod
npm run lint
npm run test
npm run test:e2e
npm run test:cov
```

## API Areas

- `auth`: authentication and JWT handling
- `users`: user resources
- `shops`: seller shop resources
- `products`: product resources and image metadata
- `categories`: shop category resources
- `orders`: order resources
- `uploads`: media upload endpoint

## Project Structure

```text
backend/
  prisma/
    schema.prisma
    seed.ts
    seeds/
  public/
    uploads/
  src/
    auth/
    categories/
    orders/
    products/
    shops/
    uploads/
    users/
    app.module.ts
    main.ts
    prisma.service.ts
    tenant.middleware.ts
```

## Notes

- Keep secrets in `.env`; do not commit environment files.
- Uploaded media should stay out of Git.
- Regenerate Prisma client after schema changes.
