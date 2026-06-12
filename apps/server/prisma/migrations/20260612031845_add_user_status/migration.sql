-- CreateEnum
CREATE TYPE "WalletSource" AS ENUM ('IMPORT', 'CREATE');

-- CreateEnum
CREATE TYPE "TxStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" VARCHAR(32) NOT NULL,
    "password_hash" VARCHAR(60) NOT NULL,
    "device_info" TEXT NOT NULL DEFAULT '',
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "alias" VARCHAR(64) NOT NULL,
    "address" VARCHAR(42) NOT NULL,
    "balance" DECIMAL(30,8) NOT NULL DEFAULT 0,
    "source" "WalletSource" NOT NULL DEFAULT 'CREATE',
    "memo" VARCHAR(256) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_wallets" (
    "id" TEXT NOT NULL,
    "user_id" VARCHAR(36) NOT NULL,
    "wallet_id" VARCHAR(36) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiat_currencies" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(8) NOT NULL,
    "name" VARCHAR(32) NOT NULL,
    "symbol" VARCHAR(4) NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "decimals" INTEGER NOT NULL DEFAULT 2,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiat_currencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "tx_hash" VARCHAR(66) NOT NULL,
    "from_wallet_id" VARCHAR(36) NOT NULL,
    "to_wallet_id" VARCHAR(36) NOT NULL,
    "amount" DECIMAL(30,8) NOT NULL,
    "fee" DECIMAL(30,8) NOT NULL DEFAULT 0,
    "status" "TxStatus" NOT NULL DEFAULT 'PENDING',
    "memo" VARCHAR(256) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "user_id" VARCHAR(36) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "address" VARCHAR(42) NOT NULL,
    "memo" VARCHAR(256) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_address_key" ON "wallets"("address");

-- CreateIndex
CREATE UNIQUE INDEX "user_wallets_user_id_wallet_id_key" ON "user_wallets"("user_id", "wallet_id");

-- CreateIndex
CREATE UNIQUE INDEX "fiat_currencies_code_key" ON "fiat_currencies"("code");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_tx_hash_key" ON "transactions"("tx_hash");

-- AddForeignKey
ALTER TABLE "user_wallets" ADD CONSTRAINT "user_wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_wallets" ADD CONSTRAINT "user_wallets_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_from_wallet_id_fkey" FOREIGN KEY ("from_wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_wallet_id_fkey" FOREIGN KEY ("to_wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
