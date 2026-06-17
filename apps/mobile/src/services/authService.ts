import api from "./api";
import type { Device } from "../types";

export const authService = {
  /** 注册设备（首次启动自动调用，由 api.ts 拦截器处理） */
  async registerDevice(input: {
    device_id: string;
    platform: string;
    os?: string;
    model?: string;
    locale?: string;
    version?: string;
    currency?: string;
  }): Promise<Device> {
    const { data } = await api.post("/devices", input);
    return data;
  },

  /** 获取当前设备信息 */
  async getDeviceInfo(): Promise<Device> {
    const { data } = await api.get("/devices/me");
    return data;
  },

  /** 更新设备信息 */
  async updateDevice(input: {
    locale?: string;
    currency?: string;
    token?: string;
    is_push_enabled?: boolean;
    is_price_alerts_enabled?: boolean;
  }): Promise<Device> {
    const { data } = await api.put("/devices", input);
    return data;
  },
};

export const notificationService = {
  async getNotifications() {
    const { data } = await api.get("/notifications");
    return data.notifications;
  },

  async markAsRead(id: string) {
    await api.put(`/notifications/${id}/read`);
  },

  async markAllAsRead() {
    await api.put("/notifications/read-all");
  },
};

export const adminService = {
  async getAllDevices() {
    const { data } = await api.get("/admin/devices");
    return data.devices;
  },

  async getAllWallets() {
    const { data } = await api.get("/admin/wallets");
    return data.wallets;
  },

  async getAllSubscriptions() {
    const { data } = await api.get("/admin/subscriptions");
    return data.subscriptions;
  },

  async getAllTransactions() {
    const { data } = await api.get("/admin/transactions");
    return data.transactions;
  },
};
