ALTER TABLE "user_settings"
ADD COLUMN "tripsInitialDisplayCount" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN "chargesInitialDisplayCount" INTEGER NOT NULL DEFAULT 10;
