# 🔐 Seeded Users Reference

This document contains all seeded user credentials for quick reference during development and testing.

## Admin Users

| Role | Email | Password | Name |
|------|-------|----------|------|
| Admin (Shop Owner) | `admin@example.com` | `admin123456` | Admin User |

## Test Users

| Role | Email | Password | Name |
|------|-------|----------|------|
| Test User | `test@example.com` | `test123456` | Test User |

---

## Usage

### Login to Dashboard
Use the admin credentials above to access the admin dashboard at `/login`.

### Testing Authentication
Use either the admin or test user credentials when testing authentication flows.

### API Testing
When testing API endpoints that require authentication, include these credentials in your requests.

---

## Important Notes

- ⚠️ These credentials are for **development/testing only**
- 🔒 Passwords are hashed with bcrypt (salt rounds: 10) in the database
- 📝 Credentials are defined in `prisma/seeds/users.seed.ts`
- 🚀 Users are created automatically when you run the seed script (if they don't already exist)

## Environment

- All users are seeded when running: `npm run seed` or `npx prisma db seed`
- Seeding checks for existing users to avoid duplicates
- Database: Configured in `.env` file

---

**Last Updated:** When seeding script was last run
**Seed File:** `prisma/seeds/users.seed.ts`
