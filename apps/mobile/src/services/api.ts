import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "imwallet_token";

// Base URL — point to your server
// For Android emulator: 10.0.2.2, for iOS simulator: localhost
const BASE_URL = "http://localhost:3000/api/v1";

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