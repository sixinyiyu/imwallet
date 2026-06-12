-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('NORMAL', 'ADMIN');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TRANSFER_IN', 'TRANSFER_OUT', 'ACCOUNT_ACTIVATED', 'ACCOUNT_REJECTED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'NORMAL';

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" VARCHAR(36) NOT NULL,
    "title" VARCHAR(128) NOT NULL,
    "content" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
