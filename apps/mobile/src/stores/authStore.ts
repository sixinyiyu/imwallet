import { create } from "zustand";
import { getDevicePublicKey } from "../services/api";
import { saveLogToLocal } from "../services/logService";

interface AuthState {
  /** 设备是否已就绪（密钥对已生成 + 设备已注册） */
  isReady: boolean;
  /** 设备公钥 hex（64字符），即 device_id */
  deviceId: string | null;
  /** 初始化设备认证（从 walletStore.loadLocalState 调用，设备已在启动时初始化） */
  initDevice: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  isReady: false,
  deviceId: null,

  /** 初始化设备认证 — 设备密钥和注册已在 walletStore.loadLocalState 中完成 */
  initDevice: async () => {
    try {
      const publicKey = await getDevicePublicKey();
      // ── 诊断日志：记录 initDevice 最终读到的 deviceId ──
      saveLogToLocal("info", `[initDevice] deviceId=${publicKey ? publicKey.substring(0, 8) + "..." : "null"}`);
      if (publicKey) {
        set({ isReady: true, deviceId: publicKey });
      } else {
        set({ isReady: false, deviceId: null });
      }
    } catch {
      set({ isReady: false, deviceId: null });
    }
  },
}));