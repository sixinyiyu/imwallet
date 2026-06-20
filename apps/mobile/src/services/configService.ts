import api from "./api";
import * as SecureStore from "../utils/secureStorage";

export interface FeeConfig {
  feeRate: number;
  feeMode: "EXTRA" | "DEDUCTED";
}

let cachedConfig: FeeConfig | null = null;

const SERVICE_CONFIG_ENABLED_KEY = "aquad_service_config_enabled";

export const configService = {
  async getFeeConfig(): Promise<FeeConfig> {
    if (cachedConfig) return cachedConfig;
    const { data } = await api.get("/config/fee");
    cachedConfig = data;
    return cachedConfig!;
  },

  clearCache(): void {
    cachedConfig = null;
  },

  /**
   * 校验服务配置密码（调用后端 /config/verify-password）
   * @returns true=密码正确, throws=密码错误或网络异常
   */
  async verifyServerPassword(password: string): Promise<boolean> {
    const { data } = await api.post("/config/verify-password", { password });
    return data.verified === true;
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
};
