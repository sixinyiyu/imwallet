-- RefactorNotificationToWallet: Change notifications from device-linked to wallet-linked
-- Notifications now follow the wallet, not the device.
-- Each device has independent read status via notification_reads junction table.

-- 1. Create new notifications table (wallet-linked)
CREATE TABLE IF NOT EXISTS "notifications_new" (
    "id"         TEXT        NOT NULL,
    "wallet_id"  VARCHAR(36) NOT NULL,
    "title"      VARCHAR(128) NOT NULL,
    "content"    TEXT        NOT NULL,
    "type"       "NotificationType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_new_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "notifications_wallet_id_idx" ON "notifications_new"("wallet_id");

-- 2. Create notification_reads junction table (per-device read status)
CREATE TABLE IF NOT EXISTS "notification_reads" (
    "id"              SERIAL      NOT NULL,
    "notification_id" TEXT        NOT NULL,
    "device_id"       INT         NOT NULL,
    "is_read"         BOOLEAN     NOT NULL DEFAULT false,
    "read_at"         TIMESTAMP(3),
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "notification_reads_notification_id_device_id_idx" ON "notification_reads"("notification_id", "device_id");

-- 3. Migrate existing notifications: convert device-linked to wallet-linked
--    For each old notification, find the wallet via wallet_subscriptions
--    and create a new wallet-linked notification.
--    Then create notification_reads entries to preserve read status.
INSERT INTO "notifications_new" ("id", "wallet_id", "title", "content", "type", "created_at")
SELECT
    n.id,
    COALESCE(ws.wallet_id, ''),
    n.title,
    n.content,
    n.type,
    n.created_at
FROM "notifications" n
LEFT JOIN "wallet_subscriptions" ws ON ws.device_id = n.device_id
WHERE ws.wallet_id IS NOT NULL;

-- 4. Migrate read status: for each old notification that was read,
--    create a notification_reads entry preserving the read state.
INSERT INTO "notification_reads" ("notification_id", "device_id", "is_read", "created_at")
SELECT n.id, n.device_id, n.is_read, n.created_at
FROM "notifications" n
WHERE n.is_read = true
AND EXISTS (SELECT 1 FROM "notifications_new" nn WHERE nn.id = n.id);

-- 5. Drop old notifications table and rename new one
DROP TABLE IF EXISTS "notifications";
ALTER TABLE "notifications_new" RENAME TO "notifications";

-- 6. Remove unused NotificationType enum values
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
CREATE TYPE "NotificationType" AS ENUM ('TRANSFER_IN', 'TRANSFER_OUT');
ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "NotificationType" USING "type"::text::"NotificationType";
DROP TYPE "NotificationType_old";
