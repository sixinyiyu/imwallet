import { create } from "zustand";
import * as SecureStore from "../utils/secureStorage";
import { getDevicePublicKey, isDeviceRegistered, clearDeviceKeys } from "../services/api";

const DEVICE_READY_KEY = "imwallet_device_ready";

interface AuthState {
  /** 设备是否已就绪（密钥对已生成 + 设备已注册） */
  isReady: boolean;
  /** 设备公钥 hex（64字符） */
  deviceId: string | null;
  loading: boolean;
  /** 初始化设备认证（App启动时调用） */
  initDevice: () => Promise<void>;
  /** 登出：清除设备密钥 */
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  isReady: false,
  deviceId: null,
  loading: true,

  initDevice: async () => {
    try {
      const publicKey = await getDevicePublicKey();
      const registered = await isDeviceRegistered();

      if (publicKey && registered) {
        set({ isReady: true, deviceId: publicKey, loading: false });
      } else if (publicKey) {
        // 有密钥但未注册，api.ts 拦截器会自动注册
        set({ isReady: true, deviceId: publicKey, loading: false });
      } else {
        // 无密钥，api.ts 拦截器会在首次请求时自动生成
        // 触发一次请求来初始化
        set({ isReady: false, deviceId: null, loading: false });
      }
    } catch {
      set({ isReady: false, deviceId: null, loading: false });
    }
  },

  logout: async () => {
    await clearDeviceKeys();
    await SecureStore.deleteItemAsync(DEVICE_READY_KEY);
    set({ isReady: false, deviceId: null });
  },
}));
