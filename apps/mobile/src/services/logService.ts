import { Platform } from "react-native";
import Constants from "expo-constants";
import axios from "axios";
import * as SecureStore from "../utils/secureStorage";

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiBaseUrl ||
  "https://imwallet.dpdns.org/api/v1";

const DEVICE_PUBLIC_KEY = "imwallet_device_public_key";

// ─── AsyncStorage keys ───
const CRASH_LOGS_KEY = "aquad_pending_crash_logs";

/**
 * Upload a log entry to the server.
 * Only used for crash reports and mnemonic generation failures.
 * Fire-and-forget — never throws, never blocks UI.
 *
 * @param logType  "crash" for app crashes, "mnemonic" for mnemonic generation failures
 * @param content  Error message + stack trace or mnemonic context
 */
export async function uploadLog(logType: "crash" | "mnemonic", content: string): Promise<void> {
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

// ─── Crash log: save to local, upload on next startup ───

interface PendingLog {
  logType: "crash" | "mnemonic";
  content: string;
  timestamp: string;
}

/**
 * Save a crash/mnemonic log to AsyncStorage (for upload on next app startup).
 * Used when the app is crashing or in an unstable state — never sends network request.
 */
export async function saveLogToLocal(logType: "crash" | "mnemonic", content: string): Promise<void> {
  try {
    const existing = await SecureStore.getItemAsync(CRASH_LOGS_KEY);
    const logs: PendingLog[] = existing ? JSON.parse(existing) : [];
    logs.push({
      logType,
      content,
      timestamp: new Date().toISOString(),
    });
    // Keep max 10 pending logs to avoid storage overflow
    if (logs.length > 10) {
      logs.splice(0, logs.length - 10);
    }
    await SecureStore.setItemAsync(CRASH_LOGS_KEY, JSON.stringify(logs));
  } catch {
    // Even saving to local must never crash the app
  }
}

/**
 * On app startup: check AsyncStorage for pending crash logs and upload them.
 * After successful upload, clear the local storage.
 * Called once in App.tsx on mount.
 */
export async function flushPendingLogs(): Promise<void> {
  try {
    const existing = await SecureStore.getItemAsync(CRASH_LOGS_KEY);
    if (!existing) return;

    const logs: PendingLog[] = JSON.parse(existing);
    if (logs.length === 0) {
      await SecureStore.deleteItemAsync(CRASH_LOGS_KEY);
      return;
    }

    // Upload each log one by one
    const failedIndices: number[] = [];
    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      try {
        await uploadLog(log.logType, log.content);
      } catch {
        failedIndices.push(i);
      }
    }

    // If all succeeded, clear local storage
    if (failedIndices.length === 0) {
      await SecureStore.deleteItemAsync(CRASH_LOGS_KEY);
    } else {
      // Keep only the failed ones for retry on next startup
      const remaining = logs.filter((_, i) => failedIndices.includes(i));
      await SecureStore.setItemAsync(CRASH_LOGS_KEY, JSON.stringify(remaining));
    }
  } catch {
    // Never crash the app during log flush
  }
}