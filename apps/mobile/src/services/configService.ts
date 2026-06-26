import api from "./api";
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

export const configService = {
  /**
   * 获取所有配置项（调用后端 GET /config/all）
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
};