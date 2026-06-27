import api from "./api";
import { getDevicePublicKey } from "./api";
import * as SecureStore from "../utils/secureStorage";

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

export const configService = {
  /**
   * 获取所有配置项（调用后端 GET /config/all）
   * 注意：服务端已过滤掉 server_pwd / recharge_allowed_devices 等敏感项，
   * 并注入 device_cap（XOR 掩码编码的充值权限标识）
   */
  async getAllConfigs(): Promise<ConfigItem[]> {
    const { data } = await api.get("/config/all");
    return data;
  },

  /**
   * 获取费率配置（每次从服务端实时获取，不缓存，因为费率可动态修改）
   */
  async getFeeConfig(): Promise<FeeConfig> {
    const { data } = await api.get("/config/fee");
    return data;
  },

  /**
   * 校验服务配置密码（调用后端 /config/verify-password）
   * @returns true=密码正确, throws=密码错误或网络异常
   */
  async verifyServerPassword(password: string): Promise<boolean> {
    const { data } = await api.post("/config/verify-password", { password });
    return data.verified === true;
  },

  /**
   * 通用更新字典配置（调用后端 PUT /config/update，需管理密码验证）
   * @param key 配置键名，如 fee_rate
   * @param value 配置值
   * @param password 管理密码
   */
  async updateConfig(key: string, value: string, password: string): Promise<{ key: string; value: string }> {
    const { data } = await api.put("/config/update", { key, value, password });
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

  /** 读取交易限制钱包账户开关状态（从服务端实时获取，默认关闭） */
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
   * 从 /config/all 返回的 device_cap 字段中解码：
   * 取设备 ID 前 8 位 hex 作为 seed，与 device_cap XOR 反算，
   * 若结果匹配 PERM_MARKER 则有权限，否则无权限。
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
      // >>> 0 确保 JS XOR 结果转为无符号 32 位整数
      const permMask = (seedNum ^ PERM_MARKER) >>> 0;
      const permHex = permMask.toString(16).padStart(8, "0");

      return capItem.value === permHex;
    } catch {
      return false;
    }
  },
};
