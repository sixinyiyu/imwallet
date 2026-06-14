import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

const TOKEN_KEY = "imwallet_token";

// Read API base URL from expo extra config (injected via EAS env at build time)
// Fallback to production server for development
const BASE_URL =
  Constants.expoConfig?.extra?.apiBaseUrl ||
  "https://imwallet.dpdns.org/api/v1";

// Debug: log the actual API base URL to verify injection
console.log("🔗 API_BASE_URL from extra:", Constants.expoConfig?.extra?.apiBaseUrl);
console.log("🔗 Actual BASE_URL used:", BASE_URL);

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

// Attach auth token to every request
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired — store will handle logout
      AsyncStorage.removeItem(TOKEN_KEY);
    }
    return Promise.reject(error);
  }
);

export default api;