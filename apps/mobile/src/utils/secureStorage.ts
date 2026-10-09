/**
 * Platform-safe secure storage wrapper with full encryption compatibility.
 *
 * - Native (iOS/Android): uses expo-secure-store
 * - Web: falls back to localStorage (not truly secure, but functional for dev)
 *
 * Compatibility: expo-secure-store v56 changed the KeyStore alias format (added
 * keystoreUnauthenticated/keystoreAuthenticated suffix). When v56 tries to
 * decrypt old-format data and the legacy KeyStore alias is missing (e.g. after
 * app reinstall), it catches BadPaddingException and **deletes the SharedPreferences
 * entry, returning null** — the data is permanently lost.
 *
 * This wrapper prevents that data loss by reading via SecureStoreLegacyModule
 * on Android. The legacy module now supports BOTH old (v55) and new (v56) KeyStore
 * aliases, and checks BOTH old-format and new-format SharedPreferences keys.
 * It NEVER deletes data on failure. If the legacy read succeeds, we write the
 * value back via expo-secure-store's setItemAsync (new format), completing
 * the migration. Only if the legacy module returns null (data truly doesn't exist
 * or all KeyStore aliases are unavailable) do we fall through to expo-secure-store.
 *
 * This approach ensures that as long as ANY KeyStore alias exists that can decrypt
 * the data, the data will be recovered — regardless of which encryption format was used.
 */

import { Platform, NativeModules } from "react-native";

let SecureStore: typeof import("expo-secure-store") | null = null;

if (Platform.OS !== "web") {
  SecureStore = require("expo-secure-store");
}

/** Native module for reading expo-secure-store encrypted data (both v55 and v56 formats) */
const SecureStoreLegacy = NativeModules.SecureStoreLegacy;

/**
 * Set of keys that have already been migrated to new format in this session.
 * Once a key has been successfully read via the legacy module and written back
 * in new format, subsequent reads can safely go through expo-secure-store directly
 * (since the data is now in new format and won't be deleted).
 *
 * IMPORTANT: Unlike the previous implementation, we do NOT mark a key as "checked"
 * just because we tried the legacy module. We only mark it as "migrated" when the
 * legacy module successfully returned a value AND we wrote it back in new format.
 * This ensures that if the legacy module failed on the first attempt (e.g. native
 * module not yet ready), we will retry on subsequent calls.
 */
const migratedKeys = new Set<string>();

/**
 * Read a value from SecureStore, with automatic encryption compatibility on Android.
 *
 * On Android, we ALWAYS try the legacy module first. The legacy module supports
 * both old (v55) and new (v56) KeyStore aliases, and checks both old-format and
 * new-format SharedPreferences keys. It NEVER deletes data on failure.
 *
 * If the legacy module succeeds, we write the value back in new format via
 * expo-secure-store's setItemAsync (which also removes the old-format key),
 * and mark the key as migrated. Subsequent reads for this key can safely go
 * through expo-secure-store directly.
 *
 * If the legacy module returns null (data truly doesn't exist, or all KeyStore
 * aliases are unavailable), we fall through to expo-secure-store's getItemAsync.
 * At this point, either the data doesn't exist (safe), or the data exists but
 * cannot be decrypted by any KeyStore alias (expo-secure-store will delete it,
 * which is the correct behavior — the data is unrecoverable).
 *
 * This ordering is critical: calling expo-secure-store's getItemAsync first
 * would cause it to delete old-format data on decryption failure, making the
 * data permanently unrecoverable even if the legacy KeyStore alias becomes
 * available later.
 */
export async function getItemAsync(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return localStorage.getItem(key);
  }

  // On Android, try legacy module first (unless already migrated to new format)
  if (Platform.OS === "android" && SecureStoreLegacy && !migratedKeys.has(key)) {
    const legacyValue = await SecureStoreLegacy.readLegacyValue(key);
    if (legacyValue !== null) {
      // Legacy decryption succeeded — write back in new format
      // This also removes the old-format SharedPreferences key (v56's setItemImpl does this)
      try {
        await SecureStore!.setItemAsync(key, legacyValue);
        // Mark as migrated — subsequent reads can safely go through expo-secure-store
        migratedKeys.add(key);
      } catch {
        // Write-back failed, but we still have the value from legacy read
        // The old-format data remains in SharedPreferences; next session will retry
        // Do NOT mark as migrated — we'll try again on the next read
      }
      return legacyValue;
    }
    // Legacy module returned null — data doesn't exist or all KeyStore aliases unavailable
    // Fall through to expo-secure-store
  }

  // Normal expo-secure-store read (new-format data, or no data at all)
  // Safe because: if data was in old format, the legacy module already handled it
  // (either successfully migrated, or confirmed that no KeyStore alias can decrypt it)
  return SecureStore!.getItemAsync(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.setItem(key, value);
    return;
  }
  // Mark as migrated since setItemAsync writes in new format
  migratedKeys.add(key);
  return SecureStore!.setItemAsync(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.removeItem(key);
    return;
  }
  // Remove from migrated set so a re-created key can be checked for legacy data
  migratedKeys.delete(key);
  return SecureStore!.deleteItemAsync(key);
}

/**
 * Force a legacy read for a specific key, bypassing the normal getItemAsync flow.
 * Useful for debugging or when you know the key exists in legacy format.
 * Returns null if the legacy module is unavailable or decryption fails.
 */
export async function readLegacyValueAsync(key: string): Promise<string | null> {
  if (Platform.OS !== "android" || !SecureStoreLegacy) {
    return null;
  }
  return SecureStoreLegacy.readLegacyValue(key);
}

/**
 * Run a one-time bulk migration for all known SecureStore keys.
 * This is intended to be called early in the app lifecycle (e.g., before loadLocalState).
 * It reads each key via getItemAsync (which handles migration transparently),
 * ensuring all legacy data is migrated before the app's normal flow begins.
 *
 * Returns the number of keys that had a value (either from legacy migration or normal read).
 */
export async function migrateAllKnownKeys(): Promise<number> {
  if (Platform.OS !== "android" || !SecureStoreLegacy) {
    return 0;
  }

  // All known SecureStore keys used by the app.
  // Dynamic keys (aquad_mnemonic_<walletId>, aquad_backed_up_<walletId>)
  // are handled automatically by getItemAsync when first accessed.
  const knownStaticKeys = [
    "imwallet_device_public_key",
    "imwallet_device_priv_jwk",
    "imwallet_device_registered",
    "aquad_mnemonic",              // legacy single-wallet mnemonic key
    "imwallet_fiat_currency",
    "aquad_service_config_enabled",
    "aquad_multi_account_enabled",
    "aquad_perf_probe_enabled",
    "aquad_feedback_code",
    "aquad_pending_crash_logs",
    "aquad_log_upload_enabled",
    "aquad_admin_route_prefix",
  ];

  let migratedCount = 0;

  for (const key of knownStaticKeys) {
    if (migratedKeys.has(key)) continue;

    // getItemAsync will try legacy read first, then normal read
    const value = await getItemAsync(key);

    if (value !== null) {
      migratedCount++;
    }
  }

  return migratedCount;
}
