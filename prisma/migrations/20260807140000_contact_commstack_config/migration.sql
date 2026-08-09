-- Per-community CommStack credentials on Notify contacts
ALTER TABLE "Contact" ADD COLUMN "commStackAppId" TEXT;
ALTER TABLE "Contact" ADD COLUMN "commStackAppName" TEXT;
ALTER TABLE "Contact" ADD COLUMN "commStackBaseUrl" TEXT;
ALTER TABLE "Contact" ADD COLUMN "commStackPortalUserId" TEXT;

CREATE INDEX "Contact_commStackAppId_idx" ON "Contact"("commStackAppId");

-- SMS contacts: CommStack fields must be null.
-- Notify contacts: either legacy (all CommStack null) or complete
-- (name + all four CommStack fields). App validation requires complete
-- config for create/update/send.
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_notify_commstack_config_check" CHECK (
  (
    "phone" IS NOT NULL
    AND "notifyClientId" IS NULL
    AND "commStackAppId" IS NULL
    AND "commStackAppName" IS NULL
    AND "commStackBaseUrl" IS NULL
    AND "commStackPortalUserId" IS NULL
  )
  OR (
    "phone" IS NULL
    AND "notifyClientId" IS NOT NULL
    AND (
      (
        "commStackAppId" IS NULL
        AND "commStackAppName" IS NULL
        AND "commStackBaseUrl" IS NULL
        AND "commStackPortalUserId" IS NULL
      )
      OR (
        "name" IS NOT NULL
        AND "commStackAppId" IS NOT NULL
        AND "commStackAppName" IS NOT NULL
        AND "commStackBaseUrl" IS NOT NULL
        AND "commStackPortalUserId" IS NOT NULL
      )
    )
  )
);
