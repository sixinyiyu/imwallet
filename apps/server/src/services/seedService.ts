import prisma from "../config/prisma";
import { config } from "../config";
import { logger } from "../utils/logger";
import { ChainType, TokenType } from "../config/chains";

/**
 * Seed service — runs on every app startup.
 * Ensures system-level config entries exist in app_configs table.
 *
 * NOTE: 本期不考虑数据迁移。schema 变更通过 init.sql 实现，不通过运行时迁移。
 * seedService 仅负责种子数据的幂等初始化。
 */
export async function runSeed(): Promise<void> {
  try {
    // ─── Chains 种子数据 ───
    const chainsData = [
      { name: ChainType.Tron, displayName: "Tron (TRX)", accountEnable: true, derivationPath: "m/44'/195'/0'/0" },
      { name: ChainType.Ethereum, displayName: "Ethereum (ETH)", accountEnable: true, derivationPath: "m/44'/60'/0'/0" },
      { name: ChainType.Bitcoin, displayName: "Bitcoin (BTC)", accountEnable: true, derivationPath: "m/44'/0'/0'/0" },
    ];
    for (const chain of chainsData) {
      const existing = await prisma.chain.findUnique({ where: { name: chain.name } });
      if (!existing) {
        await prisma.chain.create({ data: chain });
        logger.info("SEED", `已创建 chain: ${chain.name}`);
      }
    }

    // ─── Assets 种子数据 ───
    // 每条链的原生币 + USDT代币（Bitcoin不支持token）
    const assetsData = [
      { id: "asset-trx-tron",      symbol: "TRX",  name: "Tron",       decimals: 6,  chain: ChainType.Tron,     type: TokenType.NATIVE,     tokenId: "",                                              isDefault: true, isActive: true, isTradable: true },
      { id: "asset-usdt-tron",     symbol: "USDT", name: "Tether USD", decimals: 6,  chain: ChainType.Tron,     type: TokenType.TOKEN,      tokenId: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",              isDefault: true, isActive: true, isTradable: true },
      { id: "asset-eth-ethereum",  symbol: "ETH",  name: "Ethereum",   decimals: 18, chain: ChainType.Ethereum, type: TokenType.NATIVE,     tokenId: "",                                              isDefault: true, isActive: true, isTradable: true },
      { id: "asset-usdt-ethereum", symbol: "USDT", name: "Tether USD", decimals: 6,  chain: ChainType.Ethereum, type: TokenType.TOKEN,      tokenId: "0xdAC17F958D2ee523a2206206994597C13D831ec7",      isDefault: true, isActive: true, isTradable: true },
      { id: "asset-btc-bitcoin",   symbol: "BTC",  name: "Bitcoin",    decimals: 8,  chain: ChainType.Bitcoin,  type: TokenType.NATIVE,     tokenId: "",                                              isDefault: true, isActive: true, isTradable: true },
    ];
    for (const asset of assetsData) {
      const existing = await prisma.asset.findFirst({ where: { symbol: asset.symbol, chain: asset.chain } });
      if (!existing) {
        await prisma.asset.create({ data: asset });
        logger.info("SEED", `已创建 asset: ${asset.symbol} (${asset.chain}, ${asset.type})`);
      } else {
        await prisma.asset.update({
          where: { id: existing.id },
          data: {
            type: asset.type,
            tokenId: asset.tokenId,
            isDefault: asset.isDefault,
            isTradable: asset.isTradable,
          },
        });
      }
    }

    // ─── AppConfig 种子数据 ─── (for service config password verification)
    const existingPwd = await prisma.appConfig.findUnique({
      where: { key: "server_pwd" },
    });
    if (!existingPwd) {
      await prisma.appConfig.create({
        data: { key: "server_pwd", value: "aquad2024" },
      });
      logger.info("SEED", "已创建 server_pwd 配置项");
    }

    // Ensure fee_rate exists (loaded from config file on first init)
    // Once the record exists, database value takes precedence over config file
    const existingFeeRate = await prisma.appConfig.findUnique({
      where: { key: "fee_rate" },
    });
    if (!existingFeeRate) {
      await prisma.appConfig.create({
        data: { key: "fee_rate", value: config.fee.rate.toString() },
      });
      logger.info("SEED", `已创建 fee_rate 配置项: ${config.fee.rate}`);
    }

    // Ensure fee_mode exists
    const existingFeeMode = await prisma.appConfig.findUnique({
      where: { key: "fee_mode" },
    });
    if (!existingFeeMode) {
      await prisma.appConfig.create({
        data: { key: "fee_mode", value: config.fee.mode },
      });
      logger.info("SEED", `已创建 fee_mode 配置项: ${config.fee.mode}`);
    }

    // Ensure tx_restrict_wallet exists (default: false)
    // 开启后仅支持系统内账户地址进行转账，不支持外部链上地址
    const existingTxRestrict = await prisma.appConfig.findUnique({
      where: { key: "tx_restrict_wallet" },
    });
    if (!existingTxRestrict) {
      await prisma.appConfig.create({
        data: { key: "tx_restrict_wallet", value: "false" },
      });
      logger.info("SEED", "已创建 tx_restrict_wallet 配置项: false");
    }

    // Ensure recharge_allowed_devices exists (default: empty array)
    // 充值允许设备列表，值为 JSON 数组字符串，如 ["device_id_1", "device_id_2"]
    const existingRechargeDevices = await prisma.appConfig.findUnique({
      where: { key: "recharge_allowed_devices" },
    });
    if (!existingRechargeDevices) {
      await prisma.appConfig.create({
        data: { key: "recharge_allowed_devices", value: "[]" },
      });
      logger.info("SEED", "已创建 recharge_allowed_devices 配置项: []");
    }
  } catch (err: any) {
    logger.warn("SEED", `种子数据初始化失败: ${err.message}`);
  }
}
