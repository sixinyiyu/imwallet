import { create } from "zustand";
import * as SecureStore from "../utils/secureStorage";
import { getDevicePublicKey, clearDeviceKeys } from "../services/api";

const DEVICE_READY_KEY = "imwallet_device_ready";

interface AuthState {
  /** 设备是否已就绪（密钥对已生成 + 设备已注册） */
  isReady: boolean;
  /** 设备公钥 hex（64字符） */
  deviceId: string | null;
  /** 初始化设备认证（从 walletStore.loadLocalState 调用，设备已在启动时初始化） */
  initDevice: () => Promise<void>;
  /** 登出：清除设备密钥 */
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  isReady: false,
  deviceId: null,

  /** 初始化设备认证 — 设备密钥和注册已在 walletStore.loadLocalState 中完成 */
  initDevice: async () => {
    try {
      const publicKey = await getDevicePublicKey();
      if (publicKey) {
        set({ isReady: true, deviceId: publicKey });
      } else {
        set({ isReady: false, deviceId: null });
      }
    } catch {
      set({ isReady: false, deviceId: null });
    }
  },

  logout: async () => {
    await clearDeviceKeys();
    await SecureStore.deleteItemAsync(DEVICE_READY_KEY);
    set({ isReady: false, deviceId: null });
  },
}));
