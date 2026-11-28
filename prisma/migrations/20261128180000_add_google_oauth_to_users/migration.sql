-- Make password optional so Google-only accounts can be created
ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL;

-- Google OAuth subject ID; unique so one Google account can't link to two users
ALTER TABLE "users" ADD COLUMN "googleId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "users_googleId_key" ON "users"("googleId");
