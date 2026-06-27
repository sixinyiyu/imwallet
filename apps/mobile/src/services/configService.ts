import api from "./api";
import { getDevicePublicKey } from "./api";
import * as SecureStore from "../utils/secureStorage";
import { encryptPassword } from "../utils/rsaEncrypt";
import { cacheAdminAuth } from "../utils/adminAuthCache";

export interface FeeConfig {
  feeRate: number;
  feeMode: "EXTRA" | "DEDUCTED";
}

export interface ConfigItem {
  key: string;
  value: string;
}

const SERVICE_CONFIG_ENABLED_KEY = "aquad_service_config_enabled";
const MULTI_ACCOUNT_ENABLED_KEY = "aquad_multi_account_enabled";

/** XOR 掩码魔数（与服务端 config.rs 保持一致） */
const PERM_MARKER = 0x7B3A9C1F;
const DENY_MARKER = 0xD4E6F28A;

/** configs 内存缓存 TTL：30 秒 */
const CONFIG_CACHE_TTL = 30 * 1000;
let cachedConfigs: ConfigItem[] | null = null;
let configCacheTime: number = 0;

function isConfigCacheExpired(): boolean {
  return !cachedConfigs || (Date.now() - configCacheTime) > CONFIG_CACHE_TTL;
}

export const configService = {
  /**
   * 获取所有配置项（调用后端 GET /config/all）
   * 结果缓存 30 秒，同一页面生命周期内复用
   */
  async getAllConfigs(forceRefresh = false): Promise<ConfigItem[]> {
    if (!forceRefresh && !isConfigCacheExpired()) return cachedConfigs!;

    const { data } = await api.get("/config/all");
    cachedConfigs = data;
    configCacheTime = Date.now();
    return data;
  },

  /** 清除 configs 缓存（配置更新后调用） */
  clearConfigCache(): void {
    cachedConfigs = null;
    configCacheTime = 0;
  },

  /** 从 getAllConfigs 结果中解析费率配置 */
  async getFeeConfig(): Promise<FeeConfig> {
    const configs = await this.getAllConfigs();
    const feeRateItem = configs.find((c) => c.key === "fee_rate");
    const feeModeItem = configs.find((c) => c.key === "fee_mode");
    return {
      feeRate: feeRateItem ? parseFloat(feeRateItem.value) : 0,
      feeMode: feeModeItem?.value === "EXTRA" ? "EXTRA" : "DEDUCTED",
    };
  },

  /**
   * 校验服务配置密码（调用后端 /config/verify-password）
   * 密码经 RSA 公钥加密后传输，服务端私钥解密比对
   * 验证成功后自动缓存加密密码到 adminAuthCache
   */
  async verifyServerPassword(password: string): Promise<boolean> {
    const encryptedPassword = await encryptPassword(password);
    const { data } = await api.post("/config/verify-password", { encryptedPassword });
    if (data.verified === true) {
      // 验证成功 → 缓存加密密码，后续 admin 调用复用
      await cacheAdminAuth(password);
    }
    return data.verified === true;
  },

  /**
   * 通用更新字典配置（调用后端 PUT /config/update，需管理密码验证）
   * 密码经 RSA 公钥加密后传输，服务端私钥解密比对
   * 更新成功后自动清除 configs 缓存
   */
  async updateConfig(key: string, value: string, password: string): Promise<{ key: string; value: string }> {
    const encryptedPassword = await encryptPassword(password);
    const { data } = await api.put("/config/update", { key, value, encryptedPassword });
    // 配置更新后清除缓存，下次获取最新数据
    this.clearConfigCache();
    return data;
  },

  /** 读取服务配置开关状态（默认关闭） */
  async getServiceConfigEnabled(): Promise<boolean> {
    try {
      const val = await SecureStore.getItemAsync(SERVICE_CONFIG_ENABLED_KEY);
      return val === "true";
    } catch {
      return false;
    }
  },

  /** 设置服务配置开关状态 */
  async setServiceConfigEnabled(enabled: boolean): Promise<void> {
    try {
      await SecureStore.setItemAsync(SERVICE_CONFIG_ENABLED_KEY, enabled ? "true" : "false");
    } catch {
      // silent
    }
  },

  /** 读取同链多账户开关状态（默认关闭） */
  async getMultiAccountEnabled(): Promise<boolean> {
    try {
      const val = await SecureStore.getItemAsync(MULTI_ACCOUNT_ENABLED_KEY);
      return val === "true";
    } catch {
      return false;
    }
  },

  /** 设置同链多账户开关状态 */
  async setMultiAccountEnabled(enabled: boolean): Promise<void> {
    try {
      await SecureStore.setItemAsync(MULTI_ACCOUNT_ENABLED_KEY, enabled ? "true" : "false");
    } catch {
      // silent
    }
  },

  /** 读取交易限制钱包账户开关状态（从缓存获取，默认关闭） */
  async getTxRestrictWallet(): Promise<boolean> {
    try {
      const configs = await this.getAllConfigs();
      const item = configs.find((c) => c.key === "tx_restrict_wallet");
      return item?.value === "true";
    } catch {
      return false;
    }
  },

  /**
   * 判断当前设备是否有充值权限
   * 从缓存的 configs 中解码 device_cap
   */
  async getRechargePermitted(): Promise<boolean> {
    try {
      const deviceId = await getDevicePublicKey();
      if (!deviceId || deviceId.length < 8) return false;

      const configs = await this.getAllConfigs();
      const capItem = configs.find((c) => c.key === "device_cap");
      if (!capItem) return false;

      const seed = deviceId.substring(0, 8);
      const seedNum = parseInt(seed, 16);
      const permMask = (seedNum ^ PERM_MARKER) >>> 0;
      const permHex = permMask.toString(16).padStart(8, "0");

      return capItem.value === permHex;
    } catch {
      return false;
    }
  },
};
