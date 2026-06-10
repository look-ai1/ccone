ALTER TABLE "StoreApplication" ADD COLUMN IF NOT EXISTS "applicantName" TEXT;
ALTER TABLE "StoreApplication" ADD COLUMN IF NOT EXISTS "reason" TEXT;

CREATE TABLE IF NOT EXISTS "SystemConfig" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SystemConfig_key_key" ON "SystemConfig"("key");
