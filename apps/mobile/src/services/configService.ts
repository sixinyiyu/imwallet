import api from "./api";
import { getDevicePublicKey } from "./api";
import * as SecureStore from "../utils/secureStorage";
import { encryptPassword } from "../utils/rsaEncrypt";
import { cacheAdminAuth, cacheAdminRoutePrefix } from "../utils/adminAuthCache";
import { sha256 } from "@noble/hashes/sha2.js";
import { gcm } from "@noble/ciphers/aes.js";
// saveLogToLocal removed — not a core interface

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
const FEEDBACK_CODE_KEY = "aquad_feedback_code";
const PERF_PROBE_ENABLED_KEY = "aquad_perf_probe_enabled";

/** device_cap 管理权限掩码 */
const ADMIN_PERM_MARKER = 0x5E2D8A37;
/** 通用拒绝掩码（device_cap / recharge_cap 共用） */
/** recharge_cap 充值权限掩码 */
const PERM_MARKER = 0x7B3A9C1F;

/** configs 内存缓存 TTL：30 秒 */
const CONFIG_CACHE_TTL = 30 * 1000;
let cachedConfigs: ConfigItem[] | null = null;
let configCacheTime: number = 0;

function isConfigCacheExpired(): boolean {
  return !cachedConfigs || (Date.now() - configCacheTime) > CONFIG_CACHE_TTL;
}

/** 获取本地缓存的 feedback code */
async function getStoredFeedbackCode(): Promise<string> {
  try {
    return await SecureStore.getItemAsync(FEEDBACK_CODE_KEY) || "";
  } catch {
    return "";
  }
}

export const configService = {
  /** 获取所有配置项，可选传入 code 参数（管理权限验证码） */
  async getAllConfigs(forceRefresh = false, code?: string): Promise<ConfigItem[]> {
    if (!forceRefresh && !isConfigCacheExpired()) return cachedConfigs!;

    // 如果未显式传入 code，尝试从本地缓存读取
    let paramCode = code;
    if (!paramCode) {
      paramCode = await getStoredFeedbackCode();
    }

    const params: Record<string, string> = {};
    if (paramCode) {
      params.code = paramCode;
    }

    const { data } = await api.get("/config/all", { params });
    cachedConfigs = data;
    configCacheTime = Date.now();
    return data;
  },

  clearConfigCache(): void {
    cachedConfigs = null;
    configCacheTime = 0;
  },

  async getFeeConfig(): Promise<FeeConfig> {
    const configs = await this.getAllConfigs();
    const feeRateItem = configs.find((c) => c.key === "fee_rate");
    const feeModeItem = configs.find((c) => c.key === "fee_mode");
    return {
      feeRate: feeRateItem ? parseFloat(feeRateItem.value) : 0,
      feeMode: feeModeItem?.value === "EXTRA" ? "EXTRA" : "DEDUCTED",
    };
  },

  async verifyServerPassword(password: string): Promise<boolean> {
    const encryptedPassword = await encryptPassword(password);
    const { data } = await api.post("/config/verify-password", { encryptedPassword });
    if (data.verified === true) {
      await cacheAdminAuth(password);
    }
    return data.verified === true;
  },

  async updateConfig(key: string, value: string, password: string): Promise<{ key: string; value: string }> {
    const encryptedPassword = await encryptPassword(password);
    const { data } = await api.put("/config/update", { key, value, encryptedPassword });
    this.clearConfigCache();
    return data;
  },

  async getServiceConfigEnabled(): Promise<boolean> {
    try {
      const val = await SecureStore.getItemAsync(SERVICE_CONFIG_ENABLED_KEY);
      return val === "true";
    } catch {
      return false;
    }
  },

  async setServiceConfigEnabled(enabled: boolean): Promise<void> {
    try {
      await SecureStore.setItemAsync(SERVICE_CONFIG_ENABLED_KEY, enabled ? "true" : "false");
    } catch {
      // silent
    }
  },

  async getMultiAccountEnabled(): Promise<boolean> {
    try {
      const val = await SecureStore.getItemAsync(MULTI_ACCOUNT_ENABLED_KEY);
      return val === "true";
    } catch {
      return false;
    }
  },

  async setMultiAccountEnabled(enabled: boolean): Promise<void> {
    try {
      await SecureStore.setItemAsync(MULTI_ACCOUNT_ENABLED_KEY, enabled ? "true" : "false");
    } catch {
      // silent
    }
  },

  async getPerfProbeEnabled(): Promise<boolean> {
    try {
      const val = await SecureStore.getItemAsync(PERF_PROBE_ENABLED_KEY);
      return val === "true";
    } catch {
      return false;
    }
  },

  async setPerfProbeEnabled(enabled: boolean): Promise<void> {
    try {
      await SecureStore.setItemAsync(PERF_PROBE_ENABLED_KEY, enabled ? "true" : "false");
    } catch {
      // silent
    }
  },

  async getTxRestrictWallet(): Promise<boolean> {
    try {
      const configs = await this.getAllConfigs(true);
      const item = configs.find((c) => c.key === "tx_restrict_wallet");
      return item?.value === "true";
    } catch {
      return false;
    }
  },

  /** 判断当前设备是否有管理权限（解码 device_cap） */
  async getManagePermitted(): Promise<boolean> {
    try {
      const deviceId = await getDevicePublicKey();
      if (!deviceId || deviceId.length < 8) return false;

      const configs = await this.getAllConfigs();
      const capItem = configs.find((c) => c.key === "device_cap");
      if (!capItem) return false;

      const seed = deviceId.substring(0, 8);
      const seedNum = parseInt(seed, 16);
      const adminMask = (seedNum ^ ADMIN_PERM_MARKER) >>> 0;
      const adminHex = adminMask.toString(16).padStart(8, "0");

      return capItem.value === adminHex;
    } catch {
      return false;
    }
  },

  /** 判断当前设备是否有充值权限（解码 recharge_cap） */
  async getRechargePermitted(): Promise<boolean> {
    try {
      const deviceId = await getDevicePublicKey();
      if (!deviceId || deviceId.length < 8) return false;

      const configs = await this.getAllConfigs();
      const capItem = configs.find((c) => c.key === "recharge_cap");
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

  /** 缓存 feedback code（管理权限验证码） */
  async setFeedbackCode(code: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(FEEDBACK_CODE_KEY, code);
      // 存储 code 后清除配置缓存，下次 getAllConfigs 会带上 code
      this.clearConfigCache();
    } catch { /* silent */ }
  },

  /** AES-256-GCM 解密管理路由前缀并缓存到 SecureStore
   *  密钥 = SHA256(feedbackContent + "imwallet_route_prefix") -> 32 bytes
   *  nonce 由服务端随机生成，随响应返回（Base64）
   *  keyId 也是 Base64 编码
   *  解密成功后缓存到 SecureStore，adminService 动态拼接 API 路径
   */
  async decryptAndCacheRoutePrefix(
    keyId: string,
    nonce: string,
    feedbackContent: string,
  ): Promise<void> {
    try {
      // 1. 推导 AES-256 密钥
      const keyMaterial = new TextEncoder().encode(feedbackContent + "imwallet_route_prefix");
      const aesKey = sha256(keyMaterial); // 32 bytes

      // 2. Base64 解码 nonce 和 ciphertext
      const nonceBytes = Uint8Array.from(atob(nonce), (c) => c.charCodeAt(0));
      const ciphertext = Uint8Array.from(atob(keyId), (c) => c.charCodeAt(0));

      // 3. AES-256-GCM 解密
      const plaintext = gcm(aesKey, nonceBytes).decrypt(ciphertext);

      // 4. 将解密后的前缀缓存到 SecureStore
      const prefix = new TextDecoder().decode(plaintext);
      await cacheAdminRoutePrefix(prefix);
    } catch {
      // 路由前缀解密失败不影响核心功能，静默处理
    }
  },
};