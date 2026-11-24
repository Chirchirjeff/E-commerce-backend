-- Public profile fields shared by the webapp, the Mall app, the seller portal
-- and the admin dashboard.
ALTER TABLE "users" ADD COLUMN "username" TEXT;
ALTER TABLE "users" ADD COLUMN "avatarUrl" TEXT;
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- Lets a verification code carry the value it authorises (the new address
-- for an email change) so the change is applied only after it is confirmed.
ALTER TABLE "auth_verification_codes" ADD COLUMN "target" TEXT;

-- Wrong-guess counter so 6-digit codes can't be brute-forced.
ALTER TABLE "auth_verification_codes" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
