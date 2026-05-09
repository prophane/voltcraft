ALTER TABLE "UserSettings"
  DROP COLUMN IF EXISTS "showDiagAppHealth",
  DROP COLUMN IF EXISTS "showDiagVehicleHealth",
  DROP COLUMN IF EXISTS "showDiagAnalytics",
  DROP COLUMN IF EXISTS "showDiagAnomalies",
  DROP COLUMN IF EXISTS "showDiagBatteryHealth",
  DROP COLUMN IF EXISTS "showDiagThermal",
  DROP COLUMN IF EXISTS "showDiagActivity",
  DROP COLUMN IF EXISTS "showDiagComparison";
