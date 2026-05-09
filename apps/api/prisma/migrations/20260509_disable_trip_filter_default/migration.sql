ALTER TABLE "user_settings"
ALTER COLUMN "minTripDistanceKm" SET DEFAULT 0;

UPDATE "user_settings"
SET "minTripDistanceKm" = 0
WHERE "minTripDistanceKm" = 0.3;
