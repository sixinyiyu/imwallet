import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { authService } from "../services/authService";
import type { User } from "../types";

const TOKEN_KEY = "imwallet_token";
const USER_KEY = "imwallet_user";

interface AuthState {
  token: string | null;
  user: User | null;
  isLoggedIn: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loadSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  isLoggedIn: false,
  loading: true,

  login: async (username: string, password: string) => {
    const result = await authService.login(username, password);
    await AsyncStorage.setItem(TOKEN_KEY, result.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(result.user));
    set({ token: result.token, user: result.user, isLoggedIn: true });
  },

  register: async (username: string, password: string) => {
    await authService.register(username, password);
  },

  logout: async () => {
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
    set({ token: null, user: null, isLoggedIn: false });
  },

  loadSession: async () => {
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      const userStr = await AsyncStorage.getItem(USER_KEY);
      if (token && userStr) {
        const user = JSON.parse(userStr) as User;
        set({ token, user, isLoggedIn: true, loading: false });
      } else {
        set({ loading: false });
      }
    } catch {
      set({ loading: false });
    }
  },
}));