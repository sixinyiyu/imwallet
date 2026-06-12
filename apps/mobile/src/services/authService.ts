import api from "./api";
import { encryptPassword } from "./rsaService";
import type { User } from "../types";

export const authService = {
  async login(
    username: string,
    password: string
  ): Promise<{ token: string; user: User }> {
    const encryptedPassword = await encryptPassword(password);
    const { data } = await api.post("/auth/login", {
      username,
      password: encryptedPassword,
    });
    return data;
  },

  async register(username: string, password: string): Promise<void> {
    const encryptedPassword = await encryptPassword(password);
    await api.post("/auth/register", {
      username,
      password: encryptedPassword,
    });
  },
};

export const notificationService = {
  async getNotifications(page: number = 1, limit: number = 20) {
    const { data } = await api.get("/notifications", { params: { page, limit } });
    return data;
  },

  async getUnreadCount() {
    const { data } = await api.get("/notifications/unread-count");
    return data;
  },

  async markAsRead(id: string) {
    const { data } = await api.put(`/notifications/${id}/read`);
    return data;
  },

  async markAllAsRead() {
    const { data } = await api.put("/notifications/read-all");
    return data;
  },
};

export const adminService = {
  async getAllUsers() {
    const { data } = await api.get("/admin/users");
    return data;
  },

  async getPendingUsers() {
    const { data } = await api.get("/admin/users/pending");
    return data;
  },

  async activateUser(userId: string) {
    const { data } = await api.put(`/admin/users/${userId}/activate`);
    return data;
  },

  async rejectUser(userId: string) {
    const { data } = await api.put(`/admin/users/${userId}/reject`);
    return data;
  },

  async deactivateUser(userId: string) {
    const { data } = await api.put(`/admin/users/${userId}/deactivate`);
    return data;
  },

  async softDeleteUser(userId: string) {
    const { data } = await api.delete(`/admin/users/${userId}`);
    return data;
  },
};