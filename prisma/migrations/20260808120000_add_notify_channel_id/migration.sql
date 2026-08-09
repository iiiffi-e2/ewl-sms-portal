-- Notify channel identity (group-like messaging) alongside individual notifyClientId
ALTER TABLE "Contact" ADD COLUMN "notifyChannelId" TEXT;

CREATE UNIQUE INDEX "Contact_notifyChannelId_key" ON "Contact"("notifyChannelId");

CREATE INDEX "Contact_notifyChannelId_idx" ON "Contact"("notifyChannelId");

-- Replace phone XOR notifyClientId with exactly one of phone / client / channel.
ALTER TABLE "Contact" DROP CONSTRAINT IF EXISTS "Contact_phone_xor_notifyClientId_check";
ALTER TABLE "Contact" DROP CONSTRAINT IF EXISTS "Contact_notify_commstack_config_check";

ALTER TABLE "Contact" ADD CONSTRAINT "Contact_identity_xor_check" CHECK (
  (
    ("phone" IS NOT NULL)::int
    + ("notifyClientId" IS NOT NULL)::int
    + ("notifyChannelId" IS NOT NULL)::int
  ) = 1
);

-- SMS: CommStack fields null.
-- Notify individual or channel: either legacy (all CommStack null) or complete config.
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_notify_commstack_config_check" CHECK (
  (
    "phone" IS NOT NULL
    AND "commStackAppId" IS NULL
    AND "commStackAppName" IS NULL
    AND "commStackBaseUrl" IS NULL
    AND "commStackPortalUserId" IS NULL
  )
  OR (
    "phone" IS NULL
    AND (
      "notifyClientId" IS NOT NULL
      OR "notifyChannelId" IS NOT NULL
    )
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
