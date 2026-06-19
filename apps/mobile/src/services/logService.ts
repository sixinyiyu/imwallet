import { Platform } from "react-native";
import Constants from "expo-constants";
import axios from "axios";
import * as SecureStore from "../utils/secureStorage";

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiBaseUrl ||
  "https://imwallet.dpdns.org/api/v1";

const DEVICE_PUBLIC_KEY = "imwallet_device_public_key";

/**
 * Upload a log entry to the server.
 * Used for crash reports and critical business failures.
 * Fire-and-forget — never throws, never blocks UI.
 *
 * @param logType  "crash" for app crashes, "business" for key operation failures
 * @param content  Error message + stack trace or business context
 */
export async function uploadLog(logType: "crash" | "business", content: string): Promise<void> {
  try {
    const deviceId = await SecureStore.getItemAsync(DEVICE_PUBLIC_KEY);
    const version = Constants.expoConfig?.version || "unknown";

    await axios.post(
      `${BASE_URL}/logs`,
      {
        device_id: deviceId || undefined,
        platform: Platform.OS,
        version,
        log_type: logType,
        content,
      },
      { timeout: 5000 }
    );
  } catch {
    // Silently ignore — logging must never crash the app
  }
}
