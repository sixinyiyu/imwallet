import api from "./api";
import type { ServerDevice } from "../types";

export const authService = {
  /** 注册设备（首次启动自动调用，由 api.ts 拦截器处理） */
  async registerDevice(input: {
    device_id: string;
    platform: string;
  }): Promise<ServerDevice> {
    const { data } = await api.post("/devices", input);
    return data;
  },

  /** 获取当前设备信息 */
  async getDeviceInfo(): Promise<ServerDevice> {
    const { data } = await api.get("/devices/me");
    return data;
  },
};
