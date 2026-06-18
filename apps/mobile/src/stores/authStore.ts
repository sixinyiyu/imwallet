import { create } from "zustand";
import * as SecureStore from "../utils/secureStorage";
import { getDevicePublicKey, isDeviceRegistered, clearDeviceKeys, verifyAndReRegisterDevice } from "../services/api";

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
      if (!publicKey) {
        // 无密钥，api.ts 拦截器会在首次请求时自动生成
        set({ isReady: false, deviceId: null, loading: false });
        return;
      }

      // 主动向服务端验证设备是否真的已注册（而非仅信任本地标记）
      // 解决场景：老app残留 DEVICE_REGISTERED="true" 但服务端数据库是新的
      const verified = await verifyAndReRegisterDevice();
      if (verified) {
        set({ isReady: true, deviceId: publicKey, loading: false });
      } else {
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